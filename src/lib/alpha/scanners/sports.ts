import type { PolymarketMarket, RankedSignal, PlayerStatus, SportsContext } from '@/types';
import { nanoid } from '../utils';

// ─── Sports Fine-Tuning Scanner ───────────────────────────────────────────────
// Niche edge: general sports markets (NBA, NFL, Soccer, MLB).
// Uses player injury modeling + recent-form momentum to find mispriced markets.
// In production: hook into ESPN API / Rotowire injury feed for live data.

// ─── Sport detection ──────────────────────────────────────────────────────────
const SPORT_PATTERNS: Array<{ pattern: RegExp; sport: string }> = [
  { pattern: /\bnba\b|lakers|celtics|warriors|bucks|76ers|nets|heat|nuggets|suns|clippers/i, sport: 'NBA' },
  { pattern: /\bnfl\b|super bowl|chiefs|eagles|cowboys|patriots|49ers|ravens|bills|rams/i,   sport: 'NFL' },
  { pattern: /\bmlb\b|world series|yankees|dodgers|red sox|cubs|mets|astros|braves/i,         sport: 'MLB' },
  { pattern: /\bnhl\b|stanley cup|bruins|penguins|avalanche|rangers|oilers|lightning/i,      sport: 'NHL' },
  { pattern: /\bsoccer\b|premier league|champions league|la liga|bundesliga|mls|fifa/i,      sport: 'Soccer' },
  { pattern: /\bufc\b|\bmma\b|fight|knockout|championship bout/i,                            sport: 'UFC/MMA' },
  { pattern: /\btennis\b|wimbledon|us open|french open|australian open|atp|wta/i,            sport: 'Tennis' },
];

function detectSport(question: string): string | null {
  for (const { pattern, sport } of SPORT_PATTERNS) {
    if (pattern.test(question)) return sport;
  }
  return null;
}

// ─── Team extraction ──────────────────────────────────────────────────────────
function extractTeams(question: string): string[] {
  // Simple heuristic: look for "Team A vs Team B" or "Team A to beat Team B"
  const vsMatch = question.match(/([A-Z][a-z]+(?:\s[A-Z][a-z]+)*)\s+(?:vs\.?|versus|beat|defeat|over)\s+([A-Z][a-z]+(?:\s[A-Z][a-z]+)*)/);
  if (vsMatch) return [vsMatch[1], vsMatch[2]];

  // Fallback: extract capitalized multi-word phrases
  const caps = question.match(/[A-Z][a-z]+(?:\s[A-Z][a-z]+)+/g) ?? [];
  return caps.slice(0, 2);
}

// ─── Simulated injury database ─────────────────────────────────────────────────
// In production this is replaced by a live Rotowire / ESPN injury API call.
// The seeded simulation ensures deterministic results per market ID.
function seededRng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return (s >>> 0) / 0xffffffff;
  };
}

const INJURY_TYPES = ['Ankle sprain', 'Hamstring strain', 'Knee soreness', 'Back tightness', 'Concussion protocol', 'Shoulder inflammation'];
const STATUS_OPTIONS: PlayerStatus['status'][] = ['HEALTHY', 'HEALTHY', 'HEALTHY', 'DAY_TO_DAY', 'QUESTIONABLE', 'OUT'];

function simulateKeyPlayers(marketId: string, teams: string[], sport: string): PlayerStatus[] {
  const rng = seededRng(marketId.split('').reduce((a, c) => a + c.charCodeAt(0), 0));
  const playerCount = sport === 'NBA' ? 4 : sport === 'NFL' ? 3 : 2;
  const players: PlayerStatus[] = [];

  for (let i = 0; i < playerCount; i++) {
    const team = teams[i % teams.length] ?? 'Unknown';
    const statusIdx = Math.floor(rng() * STATUS_OPTIONS.length);
    const status = STATUS_OPTIONS[statusIdx];
    const impactScore = Math.round(55 + rng() * 45); // 55-100

    players.push({
      name: `Star Player ${i + 1}`,  // replaced by real names in production
      team,
      status,
      impactScore,
      injuryType: status !== 'HEALTHY' ? INJURY_TYPES[Math.floor(rng() * INJURY_TYPES.length)] : undefined,
      minutesReduction: status === 'OUT' ? 100 : status === 'QUESTIONABLE' ? Math.round(30 + rng() * 40) : 0,
    });
  }
  return players;
}

// ─── Injury impact on win probability ─────────────────────────────────────────
// Returns the probability adjustment for team 1 given injury status of key players.
// Star player out → team 1 win prob drops 5–15pp depending on impact score.
function injuryAdjustment(players: PlayerStatus[]): number {
  let delta = 0;
  for (const player of players) {
    if (player.status === 'OUT')          delta -= (player.impactScore / 100) * 0.12;
    else if (player.status === 'QUESTIONABLE') delta -= (player.impactScore / 100) * 0.06;
    else if (player.status === 'DAY_TO_DAY')   delta -= (player.impactScore / 100) * 0.03;
  }
  return delta;
}

// ─── Recent form simulation ────────────────────────────────────────────────────
// Simulates last-5-game win rate for a team based on market ID hash.
function recentFormScore(marketId: string, teamSeed: number): number {
  const rng = seededRng(marketId.split('').reduce((a, c) => a + c.charCodeAt(0), teamSeed));
  const winsInLast5 = Math.floor(rng() * 6); // 0-5
  return winsInLast5 / 5; // 0.0 – 1.0
}

// ─── Main scanner ─────────────────────────────────────────────────────────────
export async function scanSports(markets: PolymarketMarket[]): Promise<RankedSignal[]> {
  const signals: RankedSignal[] = [];

  const sportsMarkets = markets.filter(m => {
    if (!m.active || m.closed) return false;
    return detectSport(m.question) !== null;
  }).slice(0, 25);

  for (const market of sportsMarkets) {
    const sport = detectSport(market.question)!;
    const teams = extractTeams(market.question);
    const mid   = market.midPrice ?? 0.5;

    const keyPlayers    = simulateKeyPlayers(market.conditionId, teams, sport);
    const injDelta      = injuryAdjustment(keyPlayers);
    const form1         = recentFormScore(market.conditionId, 1);
    const form2         = recentFormScore(market.conditionId, 2);
    const formDelta     = (form1 - form2) * 0.10; // max ±10pp from form

    // Model probability for team 1 (YES)
    // Use market price as prior (not 50%) — multi-outcome markets like "who wins
    // the Stanley Cup" have 30+ teams at ~3% each, 50% baseline would be absurd.
    // Adjust the market prior by injury/form factors.
    const modelProb = Math.max(0.02, Math.min(0.95, mid + injDelta + formDelta));
    const marketProb = mid;
    const edge       = modelProb - marketProb; // positive = YES is undervalued

    if (Math.abs(edge) < 0.02) continue; // need at least 2pp edge

    const direction    = edge > 0 ? 'YES' : 'NO';
    const absEdge      = Math.abs(edge);
    // Scale confidence by relative edge (edge/marketProb) for multi-outcome markets
    // where raw absEdge can be huge but doesn't mean high confidence
    const relativeEdge = absEdge / Math.max(0.05, marketProb);
    const confidence   = Math.round(Math.min(92, 42 + relativeEdge * 12 + Math.min(15, absEdge * 60)));
    const expectedEdge = absEdge * 0.85; // conservative (take 85% of theoretical edge)
    const riskScore    = Math.max(15, Math.round(65 - relativeEdge * 8 - (injDelta !== 0 ? 5 : 0)));

    const injuredStars = keyPlayers.filter(p => p.status !== 'HEALTHY');
    const injuryNote   = injuredStars.length
      ? `Key player impact: ${injuredStars.map(p => `${p.name} (${p.status})`).join(', ')}`
      : 'All key players healthy';

    const sportsContext: SportsContext = {
      sport,
      teams,
      keyPlayers,
    };

    signals.push({
      id: nanoid(),
      scannerType: 'SPORTS',
      marketId: market.conditionId,
      marketQuestion: market.question,
      direction,
      confidence,
      expectedEdge,
      riskScore,
      edgeScore: Math.round(Math.min(3.5, relativeEdge * 0.6 + Math.log1p(absEdge * 10) * 0.4) * 100) / 100,
      summary: `${sport} model: ${(modelProb * 100).toFixed(1)}% vs market ${(marketProb * 100).toFixed(1)}% — ${Math.abs(edge * 100).toFixed(1)}pp edge`,
      details: `${injuryNote}. Recent form: ${(form1 * 100).toFixed(0)}% vs ${(form2 * 100).toFixed(0)}% (last 5 games). Hook live Rotowire data for real injury status.`,
      timestamp: Date.now(),
      marketPrice: mid,
      category: 'Sports',
      sportsContext,
    });
  }

  return signals.sort((a, b) => b.expectedEdge - a.expectedEdge).slice(0, 10);
}
