import type { PolymarketMarket, RankedSignal, PlayerStatus, SportsContext, SportsExplanation } from '@/types';
import { nanoid } from '../utils';

// ─── General Sports Statistical Edge Engine ──────────────────────────────────
// Structured model for NBA, NFL, MLB, NHL, Soccer, UFC/MMA, Tennis.
//
// Model pipeline:
//  1. Base probability from market-implied price (market is the prior)
//  2. Injury impact model (player availability × impact score)
//  3. Recent form momentum (last 5 games win rate differential)
//  4. Sport-specific star dependency factor (NBA > NFL > others)
//  5. Market inefficiency signal (extreme prices tend to revert)
//
// Injury/news data is simulated in hackathon build; in production,
// this plugs into ESPN API / Rotowire / injury feeds for live data.
// Every signal returns a transparent SportsExplanation breakdown.

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

// How much a single star player impacts outcomes (higher = more star-dependent)
const STAR_DEPENDENCY: Record<string, number> = {
  'NBA': 1.3,       // single player can shift outcomes 10-15%
  'NFL': 1.0,       // QB matters a lot, but 53-man roster dilutes
  'MLB': 0.7,       // pitcher matters, but lineup depth matters more
  'NHL': 0.8,       // goalie is key but team sport
  'Soccer': 0.9,    // star strikers matter but 11-man squad
  'UFC/MMA': 1.5,   // individual sport — injury is everything
  'Tennis': 1.5,    // individual sport
};

function detectSport(question: string): string | null {
  for (const { pattern, sport } of SPORT_PATTERNS) {
    if (pattern.test(question)) return sport;
  }
  return null;
}

// ─── Team extraction ──────────────────────────────────────────────────────────
function extractTeams(question: string): string[] {
  const vsMatch = question.match(/([A-Z][a-z]+(?:\s[A-Z][a-z]+)*)\s+(?:vs\.?|versus|beat|defeat|over)\s+([A-Z][a-z]+(?:\s[A-Z][a-z]+)*)/);
  if (vsMatch) return [vsMatch[1], vsMatch[2]];
  const caps = question.match(/[A-Z][a-z]+(?:\s[A-Z][a-z]+)+/g) ?? [];
  return caps.slice(0, 2);
}

// ─── Simulated data layer ────────────────────────────────────────────────────
// In production: replaced by live ESPN / Rotowire API calls.
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
      name: `Star Player ${i + 1}`,
      team,
      status,
      impactScore,
      injuryType: status !== 'HEALTHY' ? INJURY_TYPES[Math.floor(rng() * INJURY_TYPES.length)] : undefined,
      minutesReduction: status === 'OUT' ? 100 : status === 'QUESTIONABLE' ? Math.round(30 + rng() * 40) : 0,
    });
  }
  return players;
}

function simulateRecentForm(marketId: string, teamSeed: number): number {
  const rng = seededRng(marketId.split('').reduce((a, c) => a + c.charCodeAt(0), teamSeed));
  return Math.floor(rng() * 6) / 5; // 0.0–1.0 (wins in last 5)
}

// ─── Core structured model ──────────────────────────────────────────────────
// Builds probability from structured features. Returns transparent breakdown.

function computeSportsProbability(
  sport: string,
  teams: string[],
  keyPlayers: PlayerStatus[],
  form1: number,
  form2: number,
  marketPrice: number,
): SportsExplanation {
  const adjustments: SportsExplanation['adjustments'] = [];

  // Step 1: Base probability from market price (market is our prior)
  // For multi-outcome markets (e.g., "who wins the championship"), the market
  // price can be 3-5%, and using 50% would be absurd. Market is the best prior.
  let prob = marketPrice;
  const baseProbability = marketPrice;

  // Step 2: Injury impact model
  // Split players by team to compute net injury advantage
  const starDep = STAR_DEPENDENCY[sport] ?? 1.0;
  let injDelta = 0;
  for (const p of keyPlayers) {
    // Players on team1 (even indices) hurt YES, team2 (odd) help YES
    const isTeam1 = teams.length >= 2
      ? p.team === teams[0]
      : true;
    const sign = isTeam1 ? -1 : 1;

    if (p.status === 'OUT')          injDelta += sign * (p.impactScore / 100) * 0.12 * starDep;
    else if (p.status === 'QUESTIONABLE') injDelta += sign * (p.impactScore / 100) * 0.06 * starDep;
    else if (p.status === 'DAY_TO_DAY')   injDelta += sign * (p.impactScore / 100) * 0.03 * starDep;
  }

  if (Math.abs(injDelta) > 0.005) {
    prob += injDelta;
    const injured = keyPlayers.filter(p => p.status !== 'HEALTHY');
    adjustments.push({
      label: 'Injury impact',
      delta: injDelta,
      reason: injured.length
        ? injured.map(p => `${p.name} (${p.team}) ${p.status}${p.injuryType ? ` — ${p.injuryType}` : ''}`).join('; ')
        : 'All key players healthy',
    });
  }

  // Step 3: Recent form momentum
  // Last-5-game differential → max ±10pp adjustment
  const formDelta = (form1 - form2) * 0.10;
  if (Math.abs(formDelta) > 0.005) {
    prob += formDelta;
    adjustments.push({
      label: 'Recent form',
      delta: formDelta,
      reason: `Last 5 games: ${teams[0] || 'Team 1'} ${Math.round(form1 * 5)}-${5 - Math.round(form1 * 5)}, ${teams[1] || 'Team 2'} ${Math.round(form2 * 5)}-${5 - Math.round(form2 * 5)}`,
    });
  }

  // Step 4: Star dependency factor
  // In sports where a single star matters more, a healthy star roster
  // is a stronger signal than in deep-roster sports
  const healthyStars1 = keyPlayers.filter(p => p.team === (teams[0] || '') && p.status === 'HEALTHY').length;
  const totalStars1 = keyPlayers.filter(p => p.team === (teams[0] || '')).length;
  if (totalStars1 > 0 && starDep >= 1.2) {
    const healthRatio = healthyStars1 / totalStars1;
    const depAdj = (healthRatio - 0.5) * 0.04 * starDep;
    if (Math.abs(depAdj) > 0.005) {
      prob += depAdj;
      adjustments.push({
        label: `${sport} star factor`,
        delta: depAdj,
        reason: `${healthyStars1}/${totalStars1} stars healthy — ${sport} is highly star-dependent`,
      });
    }
  }

  // Step 5: Market extreme reversion signal
  // Very high (>85%) or very low (<15%) market prices tend to be slightly overconfident
  if (marketPrice > 0.85) {
    const revertAdj = -(marketPrice - 0.85) * 0.15;
    prob += revertAdj;
    adjustments.push({
      label: 'Overconfidence check',
      delta: revertAdj,
      reason: `Market at ${(marketPrice * 100).toFixed(0)}% — extreme favorites slightly overpriced historically`,
    });
  } else if (marketPrice < 0.15 && marketPrice > 0.03) {
    const revertAdj = (0.15 - marketPrice) * 0.15;
    prob += revertAdj;
    adjustments.push({
      label: 'Longshot value',
      delta: revertAdj,
      reason: `Market at ${(marketPrice * 100).toFixed(0)}% — extreme underdogs slightly underpriced historically`,
    });
  }

  // Clamp
  prob = Math.max(0.02, Math.min(0.95, prob));
  const edge = prob - marketPrice;
  const absEdge = Math.abs(edge);
  const relativeEdge = absEdge / Math.max(0.05, marketPrice);

  // Confidence rationale
  const confidenceParts: string[] = [];
  if (absEdge > 0.05) confidenceParts.push(`${(absEdge * 100).toFixed(1)}pp model edge`);
  if (keyPlayers.some(p => p.status !== 'HEALTHY')) confidenceParts.push('injury data available');
  if (Math.abs(formDelta) > 0.03) confidenceParts.push('clear form differential');
  if (adjustments.length >= 3) confidenceParts.push(`${adjustments.length} independent factors`);

  // Risk rationale
  const riskParts: string[] = [];
  if (Math.abs(injDelta) > 0.05) riskParts.push('significant injury uncertainty');
  if (marketPrice < 0.15 || marketPrice > 0.85) riskParts.push('extreme market price — high variance');
  if (relativeEdge > 0.5) riskParts.push('large edge may reflect missing information');
  if (sport === 'UFC/MMA' || sport === 'Tennis') riskParts.push('individual sport — single event risk');

  return {
    baseProbability: baseProbability,
    marketImpliedProbability: marketPrice,
    adjustments,
    finalProbability: prob,
    edgePoints: Math.round(edge * 1000) / 10,
    confidenceReason: confidenceParts.join('; ') || 'standard model output',
    riskReason: riskParts.join('; ') || 'no elevated risk factors',
  };
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

    // Simulate pre-game data (in production: live API calls)
    const keyPlayers = simulateKeyPlayers(market.conditionId, teams, sport);
    const form1      = simulateRecentForm(market.conditionId, 1);
    const form2      = simulateRecentForm(market.conditionId, 2);

    // Run the structured statistical model
    const explanation = computeSportsProbability(sport, teams, keyPlayers, form1, form2, mid);
    const edge = explanation.finalProbability - mid;

    if (Math.abs(edge) < 0.02) continue; // need at least 2pp edge

    const direction    = edge > 0 ? 'YES' : 'NO';
    const absEdge      = Math.abs(edge);
    const relativeEdge = absEdge / Math.max(0.05, mid);
    const confidence   = Math.round(Math.min(92, 42 + relativeEdge * 12 + Math.min(15, absEdge * 60)));
    const expectedEdge = absEdge * 0.85;
    const riskScore    = Math.max(15, Math.round(65 - relativeEdge * 8 - (Math.abs(explanation.adjustments.reduce((s, a) => s + a.delta, 0)) > 0.03 ? 5 : 0)));

    const sportsContext: SportsContext = {
      sport,
      competition: 'Regular Season',
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
      summary: `${sport} model: ${(explanation.finalProbability * 100).toFixed(1)}% vs market ${(mid * 100).toFixed(1)}% — ${(absEdge * 100).toFixed(1)}pp edge`,
      details: `${explanation.adjustments.length} factors analyzed. ${explanation.confidenceReason}`,
      timestamp: Date.now(),
      marketPrice: mid,
      category: 'Sports',
      sportsContext,
      sportsExplanation: explanation,
    });
  }

  return signals.sort((a, b) => b.expectedEdge - a.expectedEdge).slice(0, 10);
}
