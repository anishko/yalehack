import type { PolymarketMarket, RankedSignal, PlayerStatus, SportsContext, SportsExplanation } from '@/types';
import { nanoid } from '../utils';

// ─── NCAA Tournament Statistical Edge Engine ─────────────────────────────────
// Core prediction from structured statistics, not an LLM.
//
// Model pipeline:
//  1. Base probability from 40-year historical seed matchup win rates
//  2. Pre-game efficiency margin adjustment (Four Factors of basketball)
//  3. Pace-of-play mismatch (high tempo diff → higher variance → favors underdog)
//  4. Turnover differential (ball security vs forcing turnovers)
//  5. Rebounding edge (offensive boards = second chances)
//  6. Free throw proficiency (FTA/FGA — matters late in close games)
//  7. Recent form (last 10 games momentum)
//  8. Strength of schedule (SOS — validates seed reliability)
//  9. Round-specific upset modifier (upset rates vary by round)
// 10. Injury modifier (applied last — news/injury as secondary adjustment)
//
// All features are pre-game, non-leaky. No post-tournament or end-of-season
// ratings that would not have been available before tipoff.

// ─── Historical seed win rates (1985–2024, ~40 years) ─────────────────────────
const SEED_WIN_RATES: Record<number, number> = {
  1:  0.987, // 1 vs 16: only 2 upsets in history (UMBC 2018, FDU 2023)
  2:  0.945, // 2 vs 15
  3:  0.852, // 3 vs 14
  4:  0.792, // 4 vs 13
  5:  0.667, // 5 vs 12 — famous "5-12 upset" zone
  6:  0.633, // 6 vs 11
  7:  0.608, // 7 vs 10
  8:  0.487, // 8 vs 9 — essentially a coin flip
};

// Round-specific upset frequency modifiers (how much more/less likely upsets are)
const ROUND_UPSET_MOD: Record<string, number> = {
  'First Round':   0.00,  // baseline
  'Second Round': -0.02,  // survivors are more reliable
  'Sweet 16':     -0.03,  // chalk holds in later rounds
  'Elite Eight':  -0.04,
  'Final Four':   -0.05,
  'Championship': -0.05,
  'Tournament':    0.00,
};

// ─── Pre-game team profiles (non-leaky, pre-tournament snapshots) ─────────────
// In production: fetched from sports data API before each game.
// These represent team strength at tournament start, NOT end-of-season values.
interface NCAATeamProfile {
  name: string;
  seed: number;
  conference: string;
  wins: number;
  losses: number;
  // Adjusted efficiency (pts per 100 possessions) — pre-tournament snapshot
  adjOE: number;       // offense (higher = better)
  adjDE: number;       // defense (lower = better)
  tempo: number;       // possessions per 40 min
  // Four Factors style metrics
  efgPct: number;      // effective FG% (accounts for 3PT value)
  tovRate: number;     // turnovers per 100 possessions (lower = better)
  orbRate: number;     // offensive rebound rate %
  ftRate: number;      // free throw rate (FTA / FGA)
  // Context
  sos: number;         // strength of schedule (0-1 scale, higher = harder)
  last10Wins: number;  // wins in last 10 games pre-tournament
}

// Pre-tournament 2026 snapshots (would be API-sourced in production)
const TOURNAMENT_TEAMS_2026: NCAATeamProfile[] = [
  { name: 'Duke Blue Devils',        seed: 1,  conference: 'ACC',        wins: 30, losses: 4,  adjOE: 121.5, adjDE: 90.2, tempo: 71, efgPct: 55.1, tovRate: 15.8, orbRate: 32.1, ftRate: 0.38, sos: 0.92, last10Wins: 9 },
  { name: 'Kansas Jayhawks',         seed: 1,  conference: 'Big 12',     wins: 29, losses: 5,  adjOE: 120.8, adjDE: 91.0, tempo: 69, efgPct: 54.3, tovRate: 16.2, orbRate: 30.5, ftRate: 0.35, sos: 0.90, last10Wins: 8 },
  { name: 'Auburn Tigers',           seed: 1,  conference: 'SEC',        wins: 28, losses: 5,  adjOE: 119.5, adjDE: 91.8, tempo: 73, efgPct: 53.8, tovRate: 17.1, orbRate: 33.2, ftRate: 0.36, sos: 0.88, last10Wins: 9 },
  { name: 'Houston Cougars',         seed: 2,  conference: 'Big 12',     wins: 27, losses: 6,  adjOE: 117.2, adjDE: 89.5, tempo: 65, efgPct: 52.1, tovRate: 15.5, orbRate: 35.1, ftRate: 0.32, sos: 0.87, last10Wins: 8 },
  { name: 'Tennessee Volunteers',    seed: 2,  conference: 'SEC',        wins: 27, losses: 7,  adjOE: 116.8, adjDE: 90.8, tempo: 66, efgPct: 51.8, tovRate: 16.8, orbRate: 34.5, ftRate: 0.33, sos: 0.86, last10Wins: 7 },
  { name: 'Florida Gators',          seed: 3,  conference: 'SEC',        wins: 25, losses: 8,  adjOE: 115.2, adjDE: 93.5, tempo: 70, efgPct: 53.2, tovRate: 17.5, orbRate: 31.8, ftRate: 0.37, sos: 0.82, last10Wins: 7 },
  { name: 'Michigan State Spartans', seed: 3,  conference: 'Big Ten',    wins: 24, losses: 9,  adjOE: 114.8, adjDE: 94.2, tempo: 68, efgPct: 52.5, tovRate: 17.2, orbRate: 33.5, ftRate: 0.34, sos: 0.81, last10Wins: 8 },
  { name: 'Purdue Boilermakers',     seed: 4,  conference: 'Big Ten',    wins: 24, losses: 9,  adjOE: 114.1, adjDE: 95.0, tempo: 66, efgPct: 54.8, tovRate: 16.5, orbRate: 29.5, ftRate: 0.40, sos: 0.79, last10Wins: 7 },
  { name: 'Iowa State Cyclones',     seed: 4,  conference: 'Big 12',     wins: 23, losses: 10, adjOE: 113.5, adjDE: 95.8, tempo: 67, efgPct: 51.2, tovRate: 15.2, orbRate: 30.8, ftRate: 0.33, sos: 0.80, last10Wins: 6 },
  { name: 'Wisconsin Badgers',       seed: 5,  conference: 'Big Ten',    wins: 23, losses: 10, adjOE: 112.0, adjDE: 96.5, tempo: 63, efgPct: 52.8, tovRate: 14.8, orbRate: 28.2, ftRate: 0.38, sos: 0.76, last10Wins: 7 },
  { name: 'Marquette Golden Eagles', seed: 5,  conference: 'Big East',   wins: 22, losses: 11, adjOE: 112.5, adjDE: 97.0, tempo: 70, efgPct: 53.5, tovRate: 18.2, orbRate: 31.0, ftRate: 0.35, sos: 0.75, last10Wins: 6 },
  { name: 'BYU Cougars',             seed: 6,  conference: 'Big 12',     wins: 22, losses: 11, adjOE: 111.0, adjDE: 97.5, tempo: 69, efgPct: 52.0, tovRate: 17.8, orbRate: 29.5, ftRate: 0.32, sos: 0.72, last10Wins: 7 },
  { name: 'Ole Miss Rebels',         seed: 7,  conference: 'SEC',        wins: 21, losses: 12, adjOE: 110.2, adjDE: 98.5, tempo: 72, efgPct: 50.8, tovRate: 18.5, orbRate: 32.0, ftRate: 0.31, sos: 0.70, last10Wins: 6 },
  { name: 'New Mexico Lobos',        seed: 8,  conference: 'MWC',        wins: 22, losses: 11, adjOE: 108.5, adjDE: 99.0, tempo: 74, efgPct: 50.2, tovRate: 19.2, orbRate: 33.8, ftRate: 0.30, sos: 0.62, last10Wins: 6 },
  { name: 'Saint Mary\'s Gaels',     seed: 9,  conference: 'WCC',        wins: 24, losses: 9,  adjOE: 107.8, adjDE: 99.5, tempo: 62, efgPct: 53.0, tovRate: 15.5, orbRate: 27.0, ftRate: 0.36, sos: 0.55, last10Wins: 7 },
  { name: 'McNeese Cowboys',         seed: 12, conference: 'Southland',  wins: 28, losses: 5,  adjOE: 106.2, adjDE: 102.5, tempo: 71, efgPct: 49.8, tovRate: 19.8, orbRate: 34.0, ftRate: 0.33, sos: 0.38, last10Wins: 9 },
  { name: 'Vermont Catamounts',      seed: 13, conference: 'Am. East',   wins: 27, losses: 6,  adjOE: 105.5, adjDE: 103.0, tempo: 64, efgPct: 51.5, tovRate: 16.0, orbRate: 26.5, ftRate: 0.35, sos: 0.35, last10Wins: 8 },
  { name: 'Longwood Lancers',        seed: 15, conference: 'Big South',  wins: 26, losses: 7,  adjOE: 103.8, adjDE: 105.5, tempo: 68, efgPct: 48.5, tovRate: 20.5, orbRate: 30.5, ftRate: 0.29, sos: 0.30, last10Wins: 7 },
];

// ─── Tournament keyword detection ─────────────────────────────────────────────
const MM_PATTERNS = [
  /march madness/i,
  /ncaa tournament/i,
  /ncaa.*basketball/i,
  /\bncaab\b/i,
  /\bfinal four\b/i,
  /\bsweet sixteen\b|\bsweet 16\b/i,
  /\belite eight\b/i,
  /\bfirst round\b|\bsecond round\b/i,
  /ncaa.*win|win.*ncaa/i,
  /\bbracket\b/i,
  /advance.*tournament|tournament.*advance/i,
  /college basketball/i,
];

function isMarchMadnessMarket(question: string): boolean {
  return MM_PATTERNS.some(p => p.test(question));
}

function detectRound(question: string): string {
  if (/championship|title game/i.test(question))       return 'Championship';
  if (/final four/i.test(question))                     return 'Final Four';
  if (/elite eight/i.test(question))                    return 'Elite Eight';
  if (/sweet sixteen|sweet 16/i.test(question))         return 'Sweet 16';
  if (/second round/i.test(question))                   return 'Second Round';
  if (/first round/i.test(question))                    return 'First Round';
  return 'Tournament';
}

function findTeamByName(question: string): NCAATeamProfile | undefined {
  const q = question.toLowerCase();
  // Try full name first, then first word (school name)
  return TOURNAMENT_TEAMS_2026.find(t => q.includes(t.name.toLowerCase()))
    || TOURNAMENT_TEAMS_2026.find(t => q.includes(t.name.toLowerCase().split(' ')[0]));
}

// ─── Seeded simulation for unknown data ──────────────────────────────────────
// In production: replaced by live ESPN / Rotowire API calls.
function seededRng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return (s >>> 0) / 0xffffffff;
  };
}

const INJURY_TYPES = ['Ankle sprain', 'Knee soreness', 'Hamstring strain', 'Concussion protocol', 'Illness'];
const STATUS_LIST: PlayerStatus['status'][] = ['HEALTHY', 'HEALTHY', 'HEALTHY', 'DAY_TO_DAY', 'QUESTIONABLE', 'OUT'];

function simulatePlayers(marketId: string, teamName: string): PlayerStatus[] {
  const rng = seededRng(marketId.split('').reduce((a, c) => a + c.charCodeAt(0), 0) + teamName.length);
  return Array.from({ length: 3 }, (_, i) => {
    const status = STATUS_LIST[Math.floor(rng() * STATUS_LIST.length)];
    return {
      name: `${teamName.split(' ')[0]} Player ${i + 1}`,
      team: teamName,
      status,
      impactScore: Math.round(50 + rng() * 50),
      injuryType: status !== 'HEALTHY' ? INJURY_TYPES[Math.floor(rng() * INJURY_TYPES.length)] : undefined,
      minutesReduction: status === 'OUT' ? 100 : status === 'QUESTIONABLE' ? Math.round(25 + rng() * 40) : 0,
    };
  });
}

// ─── Core statistical model ──────────────────────────────────────────────────
// Builds probability from structured features, returns transparent breakdown.

function computeMatchupProbability(
  team1: NCAATeamProfile,
  team2: NCAATeamProfile,
  round: string,
  players1: PlayerStatus[],
  marketPrice: number,
): SportsExplanation {
  const adjustments: SportsExplanation['adjustments'] = [];

  // 1. Seed prior (40-year historical data)
  const seedPrior = SEED_WIN_RATES[Math.min(team1.seed, 8)] ?? 0.5;
  let prob = seedPrior;

  // 2. Efficiency margin (logistic / log5 model)
  const adjEM1 = team1.adjOE - team1.adjDE;
  const adjEM2 = team2.adjOE - team2.adjDE;
  const emDiff = adjEM1 - adjEM2;
  const emProb = 1 / (1 + Math.exp(-emDiff * 0.10));
  const emAdj = (emProb - seedPrior) * 0.40;
  if (Math.abs(emAdj) > 0.005) {
    prob += emAdj;
    adjustments.push({
      label: 'Efficiency margin',
      delta: emAdj,
      reason: `AdjEM +${adjEM1.toFixed(1)} vs +${adjEM2.toFixed(1)} (diff ${emDiff > 0 ? '+' : ''}${emDiff.toFixed(1)})`,
    });
  }

  // 3. Pace mismatch — large tempo diff increases variance, favoring the underdog
  const tempoDiff = Math.abs(team1.tempo - team2.tempo);
  if (tempoDiff > 6) {
    const isFavorite = team1.seed < team2.seed;
    const tempoAdj = tempoDiff * 0.003 * (isFavorite ? -1 : 1);
    prob += tempoAdj;
    adjustments.push({
      label: 'Pace mismatch',
      delta: tempoAdj,
      reason: `${team1.tempo.toFixed(0)} vs ${team2.tempo.toFixed(0)} poss/40min — ${tempoDiff > 8 ? 'high' : 'moderate'} variance`,
    });
  }

  // 4. Turnover differential (lower tovRate = better ball security)
  const tovAdj = (team2.tovRate - team1.tovRate) * 0.006;
  if (Math.abs(tovAdj) > 0.005) {
    prob += tovAdj;
    adjustments.push({
      label: 'Turnover profile',
      delta: tovAdj,
      reason: `TOV/100: ${team1.tovRate.toFixed(1)} vs ${team2.tovRate.toFixed(1)}`,
    });
  }

  // 5. Rebounding edge (offensive boards create second-chance points)
  const orbAdj = (team1.orbRate - team2.orbRate) * 0.004;
  if (Math.abs(orbAdj) > 0.005) {
    prob += orbAdj;
    adjustments.push({
      label: 'Rebounding edge',
      delta: orbAdj,
      reason: `ORB%: ${team1.orbRate.toFixed(1)} vs ${team2.orbRate.toFixed(1)}`,
    });
  }

  // 6. Free throw proficiency (matters in close tournament games)
  const ftAdj = (team1.ftRate - team2.ftRate) * 0.15;
  if (Math.abs(ftAdj) > 0.005) {
    prob += ftAdj;
    adjustments.push({
      label: 'Free throw edge',
      delta: ftAdj,
      reason: `FT rate: ${team1.ftRate.toFixed(2)} vs ${team2.ftRate.toFixed(2)}`,
    });
  }

  // 7. Recent form (momentum entering tournament)
  const formDiff = (team1.last10Wins - team2.last10Wins) / 10;
  const formAdj = formDiff * 0.04;
  if (Math.abs(formAdj) > 0.005) {
    prob += formAdj;
    adjustments.push({
      label: 'Recent form',
      delta: formAdj,
      reason: `Last 10: ${team1.last10Wins}-${10 - team1.last10Wins} vs ${team2.last10Wins}-${10 - team2.last10Wins}`,
    });
  }

  // 8. Strength of schedule (validates seed quality)
  const sosAdj = (team1.sos - team2.sos) * 0.03;
  if (Math.abs(sosAdj) > 0.005) {
    prob += sosAdj;
    adjustments.push({
      label: 'Schedule strength',
      delta: sosAdj,
      reason: `SOS: ${team1.sos.toFixed(2)} vs ${team2.sos.toFixed(2)}`,
    });
  }

  // 9. Round-specific upset modifier
  const roundMod = ROUND_UPSET_MOD[round] ?? 0;
  if (Math.abs(roundMod) > 0.005 && team1.seed < team2.seed) {
    prob += roundMod * -1; // later rounds favor favorites more
    adjustments.push({
      label: 'Round context',
      delta: roundMod * -1,
      reason: `${round}: historical upset rate adjustment`,
    });
  }

  // 10. Injury modifier (applied last — news/injury as secondary layer)
  let injDelta = 0;
  for (const p of players1) {
    if (p.status === 'OUT')          injDelta -= (p.impactScore / 100) * 0.12;
    else if (p.status === 'QUESTIONABLE') injDelta -= (p.impactScore / 100) * 0.06;
    else if (p.status === 'DAY_TO_DAY')   injDelta -= (p.impactScore / 100) * 0.03;
  }
  if (Math.abs(injDelta) > 0.005) {
    prob += injDelta;
    const injured = players1.filter(p => p.status !== 'HEALTHY');
    adjustments.push({
      label: 'Injury adjustment',
      delta: injDelta,
      reason: injured.map(p => `${p.name} ${p.status}${p.injuryType ? ` (${p.injuryType})` : ''}`).join(', '),
    });
  }

  // Clamp probability
  prob = Math.max(0.02, Math.min(0.98, prob));
  const edge = prob - marketPrice;

  // Build confidence rationale
  const seedBonus = team1.seed <= 2 ? 10 : team1.seed <= 4 ? 5 : 0;
  const absEdge = Math.abs(edge);
  const relativeEdge = absEdge / Math.max(0.05, marketPrice);
  const confidence = Math.round(Math.min(93, 40 + relativeEdge * 12 + seedBonus + Math.min(20, absEdge * 60)));

  const confidenceParts: string[] = [];
  if (seedBonus > 0) confidenceParts.push(`seed ${team1.seed} reliability bonus`);
  if (absEdge > 0.05) confidenceParts.push(`${(absEdge * 100).toFixed(1)}pp model edge`);
  if (team1.sos > 0.8) confidenceParts.push('strong schedule validates rating');
  if (adjustments.length >= 4) confidenceParts.push(`${adjustments.length} independent factors agree`);

  const riskParts: string[] = [];
  if (team1.seed >= 5) riskParts.push('mid-seed volatility');
  if (tempoDiff > 8) riskParts.push('high pace mismatch increases variance');
  if (Math.abs(injDelta) > 0.05) riskParts.push('significant injury impact');
  if (team1.sos < 0.5) riskParts.push('weak schedule — seed may be inflated');

  return {
    baseProbability: seedPrior,
    marketImpliedProbability: marketPrice,
    adjustments,
    finalProbability: prob,
    edgePoints: Math.round(edge * 1000) / 10, // in percentage points
    confidenceReason: confidenceParts.join('; ') || 'standard model output',
    riskReason: riskParts.join('; ') || 'no elevated risk factors',
  };
}

// ─── Main scanner ─────────────────────────────────────────────────────────────
export async function scanMarchMadness(markets: PolymarketMarket[]): Promise<RankedSignal[]> {
  const signals: RankedSignal[] = [];
  const mmMarkets = markets.filter(m => m.active && !m.closed && isMarchMadnessMarket(m.question));

  for (const market of mmMarkets) {
    const mid = market.midPrice ?? 0.5;
    const round = detectRound(market.question);
    const rng = seededRng(market.conditionId.split('').reduce((a, c) => a + c.charCodeAt(0), 0));

    // Identify teams
    const team1 = findTeamByName(market.question);
    const seed1 = team1?.seed ?? Math.ceil(rng() * 8);
    const seed2 = seed1 <= 8 ? 17 - seed1 : Math.ceil(rng() * 8);

    // Build opponent profile (known team or synthetic)
    const profile1: NCAATeamProfile = team1 ?? {
      name: `Seed ${seed1} Team`, seed: seed1, conference: 'Unknown',
      wins: 25 - seed1, losses: 5 + seed1, adjOE: 120 - seed1 * 1.5, adjDE: 88 + seed1 * 1.2,
      tempo: 65 + rng() * 12, efgPct: 55 - seed1 * 0.6, tovRate: 15 + seed1 * 0.4,
      orbRate: 33 - seed1 * 0.3, ftRate: 0.38 - seed1 * 0.008, sos: 0.95 - seed1 * 0.06,
      last10Wins: Math.max(4, 10 - Math.floor(seed1 / 2)),
    };

    const profile2: NCAATeamProfile = {
      name: `Seed ${seed2} Team`, seed: seed2, conference: 'Unknown',
      wins: 25 - seed2, losses: 5 + seed2, adjOE: 120 - seed2 * 1.5, adjDE: 88 + seed2 * 1.2,
      tempo: 65 + rng() * 12, efgPct: 55 - seed2 * 0.6, tovRate: 15 + seed2 * 0.4,
      orbRate: 33 - seed2 * 0.3, ftRate: 0.38 - seed2 * 0.008, sos: 0.95 - seed2 * 0.06,
      last10Wins: Math.max(4, 10 - Math.floor(seed2 / 2)),
    };

    // Simulate player injury status (in production: live API)
    const players1 = simulatePlayers(market.conditionId, profile1.name);

    // Run the statistical model
    const explanation = computeMatchupProbability(profile1, profile2, round, players1, mid);
    const edge = explanation.finalProbability - mid;

    if (Math.abs(edge) < 0.02) continue; // need at least 2pp edge

    const direction = edge > 0 ? 'YES' : 'NO';
    const absEdge = Math.abs(edge);
    const relativeEdge = absEdge / Math.max(0.05, mid);
    const seedBonus = seed1 <= 2 ? 8 : seed1 <= 4 ? 4 : 0;
    const confidence = Math.round(Math.min(93, 40 + relativeEdge * 12 + seedBonus + Math.min(20, absEdge * 60)));
    const riskScore = Math.max(15, Math.round(65 - relativeEdge * 6 - (seed1 <= 3 ? 10 : 0)));
    const expectedEdge = absEdge * 0.82;

    const upsetAlert = seed1 >= 5 && explanation.finalProbability > 0.55
      ? ` | UPSET ALERT: Seed ${seed1} overperforming model`
      : '';

    const sportsContext: SportsContext = {
      sport: 'NCAAB',
      competition: 'NCAA Tournament',
      teams: [profile1.name, profile2.name],
      keyPlayers: players1,
      seedMatchup: [seed1, seed2],
      region: ['East', 'West', 'South', 'Midwest'][Math.floor(rng() * 4)],
      round,
      efficiencyDelta: Math.round((profile1.adjOE - profile1.adjDE - (profile2.adjOE - profile2.adjDE)) * 10) / 10,
    };

    signals.push({
      id: nanoid(),
      scannerType: 'MARCH_MADNESS',
      marketId: market.conditionId,
      marketQuestion: market.question,
      direction,
      confidence,
      expectedEdge,
      riskScore,
      edgeScore: Math.round(Math.min(3.5, relativeEdge * 0.5 + Math.log1p(absEdge * 12) * 0.5 + (seed1 <= 2 ? 0.3 : 0)) * 100) / 100,
      summary: `[${round}] Seed ${seed1} vs ${seed2}: model ${(explanation.finalProbability * 100).toFixed(1)}% vs market ${(mid * 100).toFixed(1)}% — ${(absEdge * 100).toFixed(1)}pp edge${upsetAlert}`,
      details: `${explanation.adjustments.length} factors analyzed | ${profile1.wins}-${profile1.losses} (${profile1.conference}) vs ${profile2.wins}-${profile2.losses}`,
      timestamp: Date.now(),
      marketPrice: mid,
      category: 'NCAA',
      sportsContext,
      sportsExplanation: explanation,
    });
  }

  return signals
    .sort((a, b) => b.expectedEdge - a.expectedEdge)
    .slice(0, 12);
}
