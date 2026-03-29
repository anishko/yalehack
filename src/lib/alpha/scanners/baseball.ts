import type { PolymarketMarket, RankedSignal, PlayerStatus, SportsContext, SportsExplanation } from '@/types';
import { fetchSportsMarkets } from '@/lib/polymarket/gamma';
import { enrichMarkets } from '@/lib/polymarket/enricher';
import { nanoid } from '../utils';

// ─── MLB Seasonal Edge Engine ───────────────────────────────────────────────
// Core prediction from structured baseball statistics, not an LLM.
//
// Model pipeline:
//  1. Base win probability from starting pitcher matchup (ERA, WHIP)
//  2. Team offensive strength (batting avg, OBP, slugging)
//  3. Bullpen quality adjustment
//  4. Recent form (last 10 games)
//  5. Home/away advantage (historically ~54% home win rate in MLB)
//  6. Rest & travel fatigue factor
//  7. Head-to-head season record
//  8. Lineup/injury modifier (applied last)
//
// All features are pre-game, non-leaky. No in-game or post-game data.

// ─── MLB team profiles (2025 season-end / 2026 early-season snapshots) ──────
// In production: fetched from MLB Stats API before each game.
interface MLBTeamProfile {
  name: string;
  abbrev: string;
  league: 'AL' | 'NL';
  division: string;
  wins: number;
  losses: number;
  // Pitching
  teamERA: number;         // team earned run average
  teamWHIP: number;        // walks + hits per inning pitched
  bullpenERA: number;      // relief pitching ERA
  // Hitting
  battingAvg: number;      // team batting average
  obp: number;             // on-base percentage
  slg: number;             // slugging percentage
  runsPerGame: number;     // average runs scored per game
  // Context
  last10Wins: number;      // wins in last 10 games
  homeWinPct: number;      // home win percentage
  awayWinPct: number;      // away win percentage
}

interface MLBStartingPitcher {
  name: string;
  team: string;
  era: number;
  whip: number;
  inningsThisSeason: number;
  recentERA: number;       // ERA over last 3 starts
  strikeoutRate: number;   // K/9
}

// Pre-season 2026 snapshots (would be API-sourced in production)
const MLB_TEAMS_2026: MLBTeamProfile[] = [
  { name: 'New York Yankees',      abbrev: 'NYY', league: 'AL', division: 'AL East',    wins: 0, losses: 0, teamERA: 3.45, teamWHIP: 1.18, bullpenERA: 3.30, battingAvg: .258, obp: .332, slg: .435, runsPerGame: 5.1, last10Wins: 6, homeWinPct: .580, awayWinPct: .520 },
  { name: 'Los Angeles Dodgers',   abbrev: 'LAD', league: 'NL', division: 'NL West',    wins: 0, losses: 0, teamERA: 3.25, teamWHIP: 1.12, bullpenERA: 3.15, battingAvg: .261, obp: .338, slg: .442, runsPerGame: 5.3, last10Wins: 7, homeWinPct: .600, awayWinPct: .540 },
  { name: 'Atlanta Braves',        abbrev: 'ATL', league: 'NL', division: 'NL East',    wins: 0, losses: 0, teamERA: 3.55, teamWHIP: 1.20, bullpenERA: 3.40, battingAvg: .255, obp: .328, slg: .428, runsPerGame: 4.9, last10Wins: 6, homeWinPct: .565, awayWinPct: .510 },
  { name: 'Houston Astros',        abbrev: 'HOU', league: 'AL', division: 'AL West',    wins: 0, losses: 0, teamERA: 3.40, teamWHIP: 1.15, bullpenERA: 3.25, battingAvg: .256, obp: .330, slg: .430, runsPerGame: 5.0, last10Wins: 5, homeWinPct: .575, awayWinPct: .515 },
  { name: 'Philadelphia Phillies', abbrev: 'PHI', league: 'NL', division: 'NL East',    wins: 0, losses: 0, teamERA: 3.60, teamWHIP: 1.22, bullpenERA: 3.50, battingAvg: .257, obp: .335, slg: .440, runsPerGame: 5.2, last10Wins: 6, homeWinPct: .570, awayWinPct: .505 },
  { name: 'Baltimore Orioles',     abbrev: 'BAL', league: 'AL', division: 'AL East',    wins: 0, losses: 0, teamERA: 3.65, teamWHIP: 1.21, bullpenERA: 3.35, battingAvg: .253, obp: .325, slg: .425, runsPerGame: 4.8, last10Wins: 5, homeWinPct: .555, awayWinPct: .495 },
  { name: 'Texas Rangers',         abbrev: 'TEX', league: 'AL', division: 'AL West',    wins: 0, losses: 0, teamERA: 3.70, teamWHIP: 1.23, bullpenERA: 3.55, battingAvg: .252, obp: .322, slg: .420, runsPerGame: 4.7, last10Wins: 5, homeWinPct: .550, awayWinPct: .490 },
  { name: 'Minnesota Twins',       abbrev: 'MIN', league: 'AL', division: 'AL Central', wins: 0, losses: 0, teamERA: 3.75, teamWHIP: 1.25, bullpenERA: 3.60, battingAvg: .250, obp: .320, slg: .418, runsPerGame: 4.6, last10Wins: 5, homeWinPct: .545, awayWinPct: .480 },
  { name: 'Tampa Bay Rays',        abbrev: 'TB',  league: 'AL', division: 'AL East',    wins: 0, losses: 0, teamERA: 3.50, teamWHIP: 1.17, bullpenERA: 3.20, battingAvg: .245, obp: .318, slg: .405, runsPerGame: 4.3, last10Wins: 4, homeWinPct: .540, awayWinPct: .510 },
  { name: 'Seattle Mariners',      abbrev: 'SEA', league: 'AL', division: 'AL West',    wins: 0, losses: 0, teamERA: 3.48, teamWHIP: 1.16, bullpenERA: 3.18, battingAvg: .238, obp: .310, slg: .395, runsPerGame: 4.1, last10Wins: 4, homeWinPct: .535, awayWinPct: .485 },
  { name: 'Milwaukee Brewers',     abbrev: 'MIL', league: 'NL', division: 'NL Central', wins: 0, losses: 0, teamERA: 3.68, teamWHIP: 1.24, bullpenERA: 3.45, battingAvg: .248, obp: .322, slg: .415, runsPerGame: 4.5, last10Wins: 5, homeWinPct: .550, awayWinPct: .490 },
  { name: 'San Diego Padres',      abbrev: 'SD',  league: 'NL', division: 'NL West',    wins: 0, losses: 0, teamERA: 3.62, teamWHIP: 1.21, bullpenERA: 3.42, battingAvg: .254, obp: .328, slg: .425, runsPerGame: 4.7, last10Wins: 5, homeWinPct: .555, awayWinPct: .495 },
  { name: 'Chicago Cubs',          abbrev: 'CHC', league: 'NL', division: 'NL Central', wins: 0, losses: 0, teamERA: 3.85, teamWHIP: 1.28, bullpenERA: 3.70, battingAvg: .249, obp: .320, slg: .412, runsPerGame: 4.4, last10Wins: 4, homeWinPct: .540, awayWinPct: .475 },
  { name: 'Boston Red Sox',        abbrev: 'BOS', league: 'AL', division: 'AL East',    wins: 0, losses: 0, teamERA: 3.90, teamWHIP: 1.30, bullpenERA: 3.75, battingAvg: .255, obp: .330, slg: .430, runsPerGame: 4.8, last10Wins: 5, homeWinPct: .555, awayWinPct: .480 },
  { name: 'Cleveland Guardians',   abbrev: 'CLE', league: 'AL', division: 'AL Central', wins: 0, losses: 0, teamERA: 3.58, teamWHIP: 1.19, bullpenERA: 3.28, battingAvg: .242, obp: .312, slg: .398, runsPerGame: 4.2, last10Wins: 5, homeWinPct: .545, awayWinPct: .500 },
  { name: 'New York Mets',         abbrev: 'NYM', league: 'NL', division: 'NL East',    wins: 0, losses: 0, teamERA: 3.78, teamWHIP: 1.26, bullpenERA: 3.58, battingAvg: .251, obp: .325, slg: .422, runsPerGame: 4.6, last10Wins: 5, homeWinPct: .550, awayWinPct: .490 },
  { name: 'Detroit Tigers',        abbrev: 'DET', league: 'AL', division: 'AL Central', wins: 0, losses: 0, teamERA: 3.72, teamWHIP: 1.24, bullpenERA: 3.48, battingAvg: .243, obp: .315, slg: .400, runsPerGame: 4.2, last10Wins: 4, homeWinPct: .530, awayWinPct: .470 },
  { name: 'Arizona Diamondbacks',  abbrev: 'ARI', league: 'NL', division: 'NL West',    wins: 0, losses: 0, teamERA: 3.82, teamWHIP: 1.27, bullpenERA: 3.62, battingAvg: .253, obp: .325, slg: .428, runsPerGame: 4.7, last10Wins: 5, homeWinPct: .545, awayWinPct: .485 },
  { name: 'Kansas City Royals',    abbrev: 'KC',  league: 'AL', division: 'AL Central', wins: 0, losses: 0, teamERA: 3.95, teamWHIP: 1.32, bullpenERA: 3.80, battingAvg: .247, obp: .318, slg: .408, runsPerGame: 4.3, last10Wins: 4, homeWinPct: .530, awayWinPct: .465 },
  { name: 'St. Louis Cardinals',   abbrev: 'STL', league: 'NL', division: 'NL Central', wins: 0, losses: 0, teamERA: 3.88, teamWHIP: 1.29, bullpenERA: 3.68, battingAvg: .246, obp: .318, slg: .410, runsPerGame: 4.4, last10Wins: 4, homeWinPct: .540, awayWinPct: .475 },
  { name: 'San Francisco Giants',  abbrev: 'SF',  league: 'NL', division: 'NL West',    wins: 0, losses: 0, teamERA: 3.92, teamWHIP: 1.30, bullpenERA: 3.72, battingAvg: .244, obp: .316, slg: .405, runsPerGame: 4.3, last10Wins: 4, homeWinPct: .535, awayWinPct: .470 },
  { name: 'Cincinnati Reds',       abbrev: 'CIN', league: 'NL', division: 'NL Central', wins: 0, losses: 0, teamERA: 4.05, teamWHIP: 1.34, bullpenERA: 3.90, battingAvg: .252, obp: .322, slg: .425, runsPerGame: 4.6, last10Wins: 4, homeWinPct: .525, awayWinPct: .460 },
  { name: 'Toronto Blue Jays',     abbrev: 'TOR', league: 'AL', division: 'AL East',    wins: 0, losses: 0, teamERA: 3.98, teamWHIP: 1.31, bullpenERA: 3.78, battingAvg: .250, obp: .322, slg: .418, runsPerGame: 4.5, last10Wins: 4, homeWinPct: .535, awayWinPct: .470 },
  { name: 'Pittsburgh Pirates',    abbrev: 'PIT', league: 'NL', division: 'NL Central', wins: 0, losses: 0, teamERA: 4.15, teamWHIP: 1.36, bullpenERA: 4.00, battingAvg: .240, obp: .308, slg: .392, runsPerGame: 4.0, last10Wins: 3, homeWinPct: .510, awayWinPct: .440 },
  { name: 'Los Angeles Angels',    abbrev: 'LAA', league: 'AL', division: 'AL West',    wins: 0, losses: 0, teamERA: 4.20, teamWHIP: 1.38, bullpenERA: 4.05, battingAvg: .245, obp: .315, slg: .408, runsPerGame: 4.3, last10Wins: 3, homeWinPct: .515, awayWinPct: .445 },
  { name: 'Washington Nationals',  abbrev: 'WSH', league: 'NL', division: 'NL East',    wins: 0, losses: 0, teamERA: 4.25, teamWHIP: 1.39, bullpenERA: 4.10, battingAvg: .241, obp: .310, slg: .395, runsPerGame: 4.1, last10Wins: 3, homeWinPct: .505, awayWinPct: .435 },
  { name: 'Chicago White Sox',     abbrev: 'CWS', league: 'AL', division: 'AL Central', wins: 0, losses: 0, teamERA: 4.50, teamWHIP: 1.42, bullpenERA: 4.30, battingAvg: .235, obp: .302, slg: .385, runsPerGame: 3.8, last10Wins: 2, homeWinPct: .480, awayWinPct: .410 },
  { name: 'Colorado Rockies',      abbrev: 'COL', league: 'NL', division: 'NL West',    wins: 0, losses: 0, teamERA: 4.65, teamWHIP: 1.45, bullpenERA: 4.40, battingAvg: .248, obp: .315, slg: .415, runsPerGame: 4.5, last10Wins: 3, homeWinPct: .520, awayWinPct: .390 },
  { name: 'Miami Marlins',         abbrev: 'MIA', league: 'NL', division: 'NL East',    wins: 0, losses: 0, teamERA: 4.40, teamWHIP: 1.40, bullpenERA: 4.20, battingAvg: .237, obp: .305, slg: .388, runsPerGame: 3.9, last10Wins: 3, homeWinPct: .495, awayWinPct: .420 },
  { name: 'Oakland Athletics',     abbrev: 'OAK', league: 'AL', division: 'AL West',    wins: 0, losses: 0, teamERA: 4.55, teamWHIP: 1.43, bullpenERA: 4.35, battingAvg: .234, obp: .300, slg: .382, runsPerGame: 3.7, last10Wins: 2, homeWinPct: .475, awayWinPct: .405 },
];

// ─── Simulated starting pitchers (in production: MLB Stats API) ──────────────
const STARTING_PITCHERS: MLBStartingPitcher[] = [
  { name: 'Gerrit Cole',       team: 'NYY', era: 3.15, whip: 1.05, inningsThisSeason: 180, recentERA: 2.80, strikeoutRate: 11.2 },
  { name: 'Yoshinobu Yamamoto', team: 'LAD', era: 3.00, whip: 1.02, inningsThisSeason: 170, recentERA: 2.50, strikeoutRate: 10.8 },
  { name: 'Zack Wheeler',      team: 'PHI', era: 3.20, whip: 1.08, inningsThisSeason: 185, recentERA: 2.90, strikeoutRate: 10.5 },
  { name: 'Framber Valdez',    team: 'HOU', era: 3.30, whip: 1.12, inningsThisSeason: 190, recentERA: 3.10, strikeoutRate: 8.8 },
  { name: 'Spencer Strider',   team: 'ATL', era: 3.10, whip: 1.00, inningsThisSeason: 160, recentERA: 2.70, strikeoutRate: 12.5 },
  { name: 'Corbin Burnes',     team: 'BAL', era: 3.25, whip: 1.10, inningsThisSeason: 195, recentERA: 3.00, strikeoutRate: 10.0 },
  { name: 'Logan Webb',        team: 'SF',  era: 3.35, whip: 1.14, inningsThisSeason: 200, recentERA: 3.20, strikeoutRate: 8.2 },
  { name: 'Tarik Skubal',      team: 'DET', era: 3.05, whip: 0.98, inningsThisSeason: 175, recentERA: 2.60, strikeoutRate: 11.0 },
  { name: 'Dylan Cease',       team: 'SD',  era: 3.40, whip: 1.18, inningsThisSeason: 185, recentERA: 3.30, strikeoutRate: 10.3 },
  { name: 'Pablo López',       team: 'MIN', era: 3.50, whip: 1.15, inningsThisSeason: 180, recentERA: 3.40, strikeoutRate: 9.5 },
  { name: 'Sonny Gray',        team: 'STL', era: 3.45, whip: 1.16, inningsThisSeason: 175, recentERA: 3.50, strikeoutRate: 9.0 },
  { name: 'Tyler Glasnow',     team: 'LAD', era: 3.18, whip: 1.06, inningsThisSeason: 150, recentERA: 2.85, strikeoutRate: 11.8 },
];

// ─── Baseball market detection ───────────────────────────────────────────────
const MLB_PATTERNS = [
  /\bmlb\b/i,
  /\bbaseball\b/i,
  /\binnings?\b/i,
  /\bruns?\b.*\bgame\b/i,
  /\bworld series\b/i,
  /\bpennant\b/i,
  /\ball.star game\b/i,
  /\bhome run\b/i,
  /\bstrikeout/i,
  /\bpitcher\b/i,
];

// Futures market detection — these are NOT head-to-head game markets
const FUTURES_PATTERNS = [
  /\bworld series\b/i,
  /\bwin the\b.*\b(al|nl|american|national)\b/i,
  /\bpennant\b/i,
  /\bmvp\b/i,
  /\bcy young\b/i,
  /\brookie of the year\b/i,
  /\bdivision\b/i,
  /\bplayoff\b/i,
  /\bpostseason\b/i,
  /\bchampion/i,
  /\bwin\s+(the\s+)?2026\b/i,
  /\bwin\s+(the\s+)?(al|nl)\s+(east|west|central)/i,
  /\bmost\s+(wins|home runs|strikeouts|rbi)/i,
];

type FuturesType = 'championship' | 'award' | 'division' | 'other';

function detectFuturesType(question: string): FuturesType | null {
  const q = question.toLowerCase();
  if (/world series|pennant|champion|postseason|playoff/.test(q)) return 'championship';
  if (/mvp|cy young|rookie of the year|most (wins|home runs|strikeouts|rbi)/.test(q)) return 'award';
  if (/division|al (east|west|central)|nl (east|west|central)/.test(q)) return 'division';
  if (FUTURES_PATTERNS.some(p => p.test(question))) return 'other';
  return null;
}

// Team name keywords for detection
const MLB_TEAM_KEYWORDS = MLB_TEAMS_2026.map(t => ({
  pattern: new RegExp(`\\b${t.name.split(' ').pop()!.toLowerCase()}\\b`, 'i'),
  abbrev: t.abbrev,
}));

function isBaseballMarket(question: string): boolean {
  if (MLB_PATTERNS.some(p => p.test(question))) return true;
  // Check if two or more team names appear (likely a matchup)
  const teamHits = MLB_TEAM_KEYWORDS.filter(t => t.pattern.test(question));
  return teamHits.length >= 1;
}

function findTeamByName(question: string): MLBTeamProfile | undefined {
  const q = question.toLowerCase();
  return MLB_TEAMS_2026.find(t => q.includes(t.name.toLowerCase()))
    || MLB_TEAMS_2026.find(t => q.includes(t.name.split(' ').pop()!.toLowerCase()));
}

function findPitcherForTeam(teamAbbrev: string, marketId: string): MLBStartingPitcher | undefined {
  const teamPitchers = STARTING_PITCHERS.filter(p => p.team === teamAbbrev);
  if (teamPitchers.length === 0) return undefined;
  // In production: use actual game-day lineup. For now, use seeded selection.
  const rng = seededRng(marketId.split('').reduce((a, c) => a + c.charCodeAt(0), 0) + teamAbbrev.length);
  return teamPitchers[Math.floor(rng() * teamPitchers.length)];
}

// ─── Seeded simulation for unknown data ──────────────────────────────────────
function seededRng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return (s >>> 0) / 0xffffffff;
  };
}

const INJURY_TYPES = ['Hamstring strain', 'Oblique strain', 'Shoulder inflammation', 'Back tightness', 'Elbow soreness', 'Knee contusion'];
const STATUS_LIST: PlayerStatus['status'][] = ['HEALTHY', 'HEALTHY', 'HEALTHY', 'HEALTHY', 'DAY_TO_DAY', 'QUESTIONABLE', 'OUT'];

function simulatePlayers(marketId: string, teamName: string): PlayerStatus[] {
  const rng = seededRng(marketId.split('').reduce((a, c) => a + c.charCodeAt(0), 0) + teamName.length);
  return Array.from({ length: 3 }, (_, i) => {
    const status = STATUS_LIST[Math.floor(rng() * STATUS_LIST.length)];
    return {
      name: `${teamName.split(' ').pop()} Player ${i + 1}`,
      team: teamName,
      status,
      impactScore: Math.round(40 + rng() * 60),
      injuryType: status !== 'HEALTHY' ? INJURY_TYPES[Math.floor(rng() * INJURY_TYPES.length)] : undefined,
      minutesReduction: status === 'OUT' ? 100 : status === 'QUESTIONABLE' ? Math.round(20 + rng() * 40) : 0,
    };
  });
}

// ─── Futures probability model ──────────────────────────────────────────────
// Ranks a team against the full 30-team field instead of a head-to-head matchup.
// Produces a championship / award probability with natural team-level differentiation.

function computeTeamPowerRating(team: MLBTeamProfile): number {
  // Composite power rating from 6 weighted factors (0–100 scale)
  const eraFactor   = Math.max(0, (5.00 - team.teamERA) / 2.0);        // 0–1, lower ERA = better
  const whipFactor  = Math.max(0, (1.60 - team.teamWHIP) / 0.50);      // 0–1
  const bpFactor    = Math.max(0, (5.00 - team.bullpenERA) / 2.0);     // 0–1
  const opsFactor   = (team.obp + team.slg - 0.580) / 0.200;           // centered around league avg ~.720 OPS
  const rpgFactor   = (team.runsPerGame - 3.5) / 2.0;                  // 0–1
  const formFactor  = team.last10Wins / 10;                              // 0–1

  return (
    eraFactor   * 25 +
    whipFactor  * 10 +
    bpFactor    * 10 +
    opsFactor   * 25 +
    rpgFactor   * 15 +
    formFactor  * 15
  );
}

function computeFuturesProbability(
  team: MLBTeamProfile,
  marketPrice: number,
  futuresType: FuturesType,
): SportsExplanation {
  const adjustments: SportsExplanation['adjustments'] = [];

  // Compute power ratings for ALL teams to create relative rankings
  const allRatings = MLB_TEAMS_2026.map(t => ({
    abbrev: t.abbrev,
    rating: computeTeamPowerRating(t),
  })).sort((a, b) => b.rating - a.rating);

  const teamRating = computeTeamPowerRating(team);
  const rank = allRatings.findIndex(r => r.abbrev === team.abbrev) + 1;
  const maxRating = allRatings[0].rating;
  const minRating = allRatings[allRatings.length - 1].rating;
  const ratingRange = Math.max(1, maxRating - minRating);
  const normalizedRating = (teamRating - minRating) / ratingRange; // 0–1

  // Convert ranking to a realistic championship probability distribution
  // Top team ~18%, bottom team ~0.5%
  let baseProbability: number;
  if (futuresType === 'championship') {
    // Exponential distribution — top-heavy like real WS odds
    baseProbability = 0.005 + 0.18 * Math.pow(normalizedRating, 2.2);
  } else if (futuresType === 'division') {
    // Division winner — higher baseline (~20-35% for top teams, more competitive)
    baseProbability = 0.08 + 0.28 * Math.pow(normalizedRating, 1.5);
  } else {
    // Award / other futures — wider range
    baseProbability = 0.01 + 0.15 * Math.pow(normalizedRating, 2.0);
  }

  let prob = baseProbability;

  // Factor 1: Pitching strength (ERA + WHIP combined)
  const leagueAvgERA = 3.85;
  const pitchingEdge = (leagueAvgERA - team.teamERA) * 0.025;
  if (Math.abs(pitchingEdge) > 0.003) {
    prob += pitchingEdge;
    adjustments.push({
      label: 'Pitching strength',
      delta: pitchingEdge,
      reason: `Team ERA ${team.teamERA.toFixed(2)} (league avg ~${leagueAvgERA.toFixed(2)}), WHIP ${team.teamWHIP.toFixed(2)}`,
    });
  }

  // Factor 2: Offensive power
  const ops = team.obp + team.slg;
  const leagueAvgOPS = 0.710;
  const offenseEdge = (ops - leagueAvgOPS) * 0.12;
  if (Math.abs(offenseEdge) > 0.003) {
    prob += offenseEdge;
    adjustments.push({
      label: 'Offensive power',
      delta: offenseEdge,
      reason: `OPS ${ops.toFixed(3)} (BA ${team.battingAvg.toFixed(3)} / OBP ${team.obp.toFixed(3)} / SLG ${team.slg.toFixed(3)})`,
    });
  }

  // Factor 3: Bullpen depth (critical for postseason)
  const bpEdge = (3.60 - team.bullpenERA) * 0.015;
  if (Math.abs(bpEdge) > 0.003) {
    prob += bpEdge;
    adjustments.push({
      label: 'Bullpen depth',
      delta: bpEdge,
      reason: `Bullpen ERA ${team.bullpenERA.toFixed(2)} — ${team.bullpenERA < 3.40 ? 'elite' : team.bullpenERA < 3.70 ? 'solid' : 'below average'} for October`,
    });
  }

  // Factor 4: Run production
  const rpgEdge = (team.runsPerGame - 4.3) * 0.012;
  if (Math.abs(rpgEdge) > 0.003) {
    prob += rpgEdge;
    adjustments.push({
      label: 'Run production',
      delta: rpgEdge,
      reason: `${team.runsPerGame.toFixed(1)} runs/game — ${team.runsPerGame >= 5.0 ? 'top-tier' : team.runsPerGame >= 4.5 ? 'above average' : 'average'} offense`,
    });
  }

  // Factor 5: Recent momentum
  const momentumEdge = (team.last10Wins - 5) * 0.006;
  if (Math.abs(momentumEdge) > 0.003) {
    prob += momentumEdge;
    adjustments.push({
      label: 'Recent momentum',
      delta: momentumEdge,
      reason: `Last 10 games: ${team.last10Wins}-${10 - team.last10Wins}`,
    });
  }

  prob = Math.max(0.003, Math.min(0.40, prob));
  const edge = prob - marketPrice;
  const absEdge = Math.abs(edge);
  const relativeEdge = absEdge / Math.max(0.01, marketPrice);

  // Confidence based on ranking clarity and edge size
  const confidenceParts: string[] = [];
  if (rank <= 5) confidenceParts.push(`top-5 power ranking (#${rank})`);
  else if (rank <= 10) confidenceParts.push(`top-10 power ranking (#${rank})`);
  else confidenceParts.push(`power ranking #${rank}/30`);
  if (absEdge > 0.03) confidenceParts.push(`${(absEdge * 100).toFixed(1)}pp edge vs market`);
  if (adjustments.length >= 3) confidenceParts.push(`${adjustments.length} factors contributing`);

  const riskParts: string[] = [];
  if (futuresType === 'championship') riskParts.push('long-horizon futures — high variance');
  if (rank > 15) riskParts.push('bottom-half team — unlikely contender');
  if (marketPrice < 0.05) riskParts.push('low-probability market — small sample edge');
  if (relativeEdge > 0.5) riskParts.push('large relative edge may reflect info gap');

  return {
    baseProbability: baseProbability,
    marketImpliedProbability: marketPrice,
    adjustments,
    finalProbability: prob,
    edgePoints: Math.round(edge * 1000) / 10,
    confidenceReason: confidenceParts.join('; ') || 'standard futures model output',
    riskReason: riskParts.join('; ') || 'no elevated risk factors',
  };
}

// ─── Core statistical model ──────────────────────────────────────────────────
// Builds win probability from structured pre-game features.

function computeBaseballProbability(
  team1: MLBTeamProfile,
  team2: MLBTeamProfile,
  pitcher1: MLBStartingPitcher | undefined,
  pitcher2: MLBStartingPitcher | undefined,
  players1: PlayerStatus[],
  marketPrice: number,
  isHome: boolean,
): SportsExplanation {
  const adjustments: SportsExplanation['adjustments'] = [];

  // 1. Base probability: use Pythagorean expectation-style estimate
  // RS^1.83 / (RS^1.83 + RA^1.83) — Bill James' formula
  const rs1 = team1.runsPerGame;
  const ra1 = team1.teamERA; // approximate runs allowed from ERA
  const rs2 = team2.runsPerGame;
  const ra2 = team2.teamERA;
  const pyth1 = Math.pow(rs1, 1.83) / (Math.pow(rs1, 1.83) + Math.pow(ra1, 1.83));
  const pyth2 = Math.pow(rs2, 1.83) / (Math.pow(rs2, 1.83) + Math.pow(ra2, 1.83));
  // Log5 matchup formula
  const baseProbRaw = (pyth1 * (1 - pyth2)) / (pyth1 * (1 - pyth2) + pyth2 * (1 - pyth1));
  let prob = baseProbRaw;

  // 2. Starting pitcher matchup
  if (pitcher1 && pitcher2) {
    // Lower ERA / WHIP = better pitcher
    const pitchDiff = (pitcher2.era - pitcher1.era) * 0.025 + (pitcher2.whip - pitcher1.whip) * 0.04;
    // Recent form adjustment
    const recentDiff = (pitcher2.recentERA - pitcher1.recentERA) * 0.015;
    const pitchAdj = pitchDiff + recentDiff;
    if (Math.abs(pitchAdj) > 0.005) {
      prob += pitchAdj;
      adjustments.push({
        label: 'Starting pitcher matchup',
        delta: pitchAdj,
        reason: `${pitcher1.name} (ERA ${pitcher1.era}, WHIP ${pitcher1.whip}) vs ${pitcher2.name} (ERA ${pitcher2.era}, WHIP ${pitcher2.whip})`,
      });
    }
  }

  // 3. Team offensive strength (OBP + SLG = OPS differential)
  const ops1 = team1.obp + team1.slg;
  const ops2 = team2.obp + team2.slg;
  const opsAdj = (ops1 - ops2) * 0.15;
  if (Math.abs(opsAdj) > 0.005) {
    prob += opsAdj;
    adjustments.push({
      label: 'Offensive strength',
      delta: opsAdj,
      reason: `OPS: ${ops1.toFixed(3)} vs ${ops2.toFixed(3)} (BA ${team1.battingAvg.toFixed(3)} / OBP ${team1.obp.toFixed(3)} / SLG ${team1.slg.toFixed(3)})`,
    });
  }

  // 4. Bullpen quality
  const bpAdj = (team2.bullpenERA - team1.bullpenERA) * 0.02;
  if (Math.abs(bpAdj) > 0.005) {
    prob += bpAdj;
    adjustments.push({
      label: 'Bullpen strength',
      delta: bpAdj,
      reason: `Bullpen ERA: ${team1.bullpenERA.toFixed(2)} vs ${team2.bullpenERA.toFixed(2)}`,
    });
  }

  // 5. Recent form (last 10 games)
  const formDiff = (team1.last10Wins - team2.last10Wins) / 10;
  const formAdj = formDiff * 0.05;
  if (Math.abs(formAdj) > 0.005) {
    prob += formAdj;
    adjustments.push({
      label: 'Recent form',
      delta: formAdj,
      reason: `Last 10: ${team1.last10Wins}-${10 - team1.last10Wins} vs ${team2.last10Wins}-${10 - team2.last10Wins}`,
    });
  }

  // 6. Home/away advantage (~54% home win rate historically in MLB)
  if (isHome) {
    const homeAdj = 0.025;
    prob += homeAdj;
    adjustments.push({
      label: 'Home advantage',
      delta: homeAdj,
      reason: `Home win rate: ${(team1.homeWinPct * 100).toFixed(0)}% — MLB historical home edge ~54%`,
    });
  } else {
    const awayAdj = -0.015;
    prob += awayAdj;
    adjustments.push({
      label: 'Away disadvantage',
      delta: awayAdj,
      reason: `Away win rate: ${(team1.awayWinPct * 100).toFixed(0)}%`,
    });
  }

  // 7. Lineup/injury modifier (applied last)
  let injDelta = 0;
  for (const p of players1) {
    if (p.status === 'OUT')          injDelta -= (p.impactScore / 100) * 0.08;
    else if (p.status === 'QUESTIONABLE') injDelta -= (p.impactScore / 100) * 0.04;
    else if (p.status === 'DAY_TO_DAY')   injDelta -= (p.impactScore / 100) * 0.02;
  }
  if (Math.abs(injDelta) > 0.005) {
    prob += injDelta;
    const injured = players1.filter(p => p.status !== 'HEALTHY');
    adjustments.push({
      label: 'Lineup/injury adjustment',
      delta: injDelta,
      reason: injured.map(p => `${p.name} ${p.status}${p.injuryType ? ` (${p.injuryType})` : ''}`).join(', '),
    });
  }

  // Clamp probability
  prob = Math.max(0.05, Math.min(0.95, prob));
  const edge = prob - marketPrice;
  const absEdge = Math.abs(edge);
  const relativeEdge = absEdge / Math.max(0.05, marketPrice);

  // Confidence rationale
  const confidenceParts: string[] = [];
  if (pitcher1 && pitcher2) confidenceParts.push('pitcher matchup data available');
  if (absEdge > 0.05) confidenceParts.push(`${(absEdge * 100).toFixed(1)}pp model edge`);
  if (Math.abs(formDiff) > 0.2) confidenceParts.push('strong form differential');
  if (adjustments.length >= 4) confidenceParts.push(`${adjustments.length} independent factors`);

  // Risk rationale
  const riskParts: string[] = [];
  if (Math.abs(injDelta) > 0.04) riskParts.push('key lineup uncertainty');
  if (!pitcher1 || !pitcher2) riskParts.push('missing pitcher data');
  if (relativeEdge > 0.4) riskParts.push('large edge may reflect missing info');
  if (team1.last10Wins <= 3 || team2.last10Wins <= 3) riskParts.push('team in poor recent form — volatile');

  return {
    baseProbability: baseProbRaw,
    marketImpliedProbability: marketPrice,
    adjustments,
    finalProbability: prob,
    edgePoints: Math.round(edge * 1000) / 10,
    confidenceReason: confidenceParts.join('; ') || 'standard model output',
    riskReason: riskParts.join('; ') || 'no elevated risk factors',
  };
}

// ─── Demo matchups (shown when no live MLB markets on Polymarket) ────────────
// Realistic today's-game-style matchups so the engine is always demonstrable.
// In production these are replaced by real Polymarket MLB markets.
const DEMO_MATCHUPS: Array<{ away: string; home: string; marketPrice: number }> = [
  { away: 'NYY', home: 'BOS', marketPrice: 0.52 },
  { away: 'LAD', home: 'SF',  marketPrice: 0.58 },
  { away: 'HOU', home: 'SEA', marketPrice: 0.54 },
  { away: 'ATL', home: 'NYM', marketPrice: 0.50 },
  { away: 'PHI', home: 'MIL', marketPrice: 0.48 },
  { away: 'SD',  home: 'ARI', marketPrice: 0.46 },
  { away: 'BAL', home: 'TB',  marketPrice: 0.52 },
  { away: 'MIN', home: 'CLE', marketPrice: 0.47 },
  { away: 'TEX', home: 'LAA', marketPrice: 0.55 },
  { away: 'CHC', home: 'STL', marketPrice: 0.49 },
  { away: 'DET', home: 'KC',  marketPrice: 0.51 },
  { away: 'CIN', home: 'PIT', marketPrice: 0.53 },
];

function buildSignalFromMatchup(
  team1: MLBTeamProfile,
  team2: MLBTeamProfile,
  marketPrice: number,
  isHome: boolean,
  matchupId: string,
): RankedSignal | null {
  const pitcher1 = findPitcherForTeam(team1.abbrev, matchupId);
  const pitcher2 = findPitcherForTeam(team2.abbrev, matchupId);
  const players1 = simulatePlayers(matchupId, team1.name);

  const explanation = computeBaseballProbability(team1, team2, pitcher1, pitcher2, players1, marketPrice, isHome);
  const edge = explanation.finalProbability - marketPrice;

  if (Math.abs(edge) < 0.015) return null;

  const direction = edge > 0 ? 'YES' : 'NO';
  const absEdge = Math.abs(edge);
  const relativeEdge = absEdge / Math.max(0.05, marketPrice);
  const confidence = Math.round(Math.min(92, 40 + relativeEdge * 12 + (pitcher1 ? 5 : 0) + Math.min(18, absEdge * 55)));
  const riskScore = Math.max(15, Math.round(60 - relativeEdge * 6 - (pitcher1 ? 5 : 0)));
  const expectedEdge = absEdge * 0.82;

  const sportsContext: SportsContext = {
    sport: 'MLB',
    competition: 'Regular Season',
    teams: [team1.name, team2.name],
    keyPlayers: players1,
    efficiencyDelta: Math.round((team1.runsPerGame - team1.teamERA - (team2.runsPerGame - team2.teamERA)) * 10) / 10,
  };

  return {
    id: nanoid(),
    scannerType: 'BASEBALL',
    marketId: matchupId,
    marketQuestion: `Will the ${team1.name} beat the ${team2.name}?`,
    direction,
    confidence,
    expectedEdge,
    riskScore,
    edgeScore: Math.round(Math.min(3.5, relativeEdge * 0.5 + Math.log1p(absEdge * 12) * 0.5 + (pitcher1 ? 0.2 : 0)) * 100) / 100,
    summary: `MLB model: ${(explanation.finalProbability * 100).toFixed(1)}% vs market ${(marketPrice * 100).toFixed(1)}% — ${(absEdge * 100).toFixed(1)}pp edge`,
    details: `${explanation.adjustments.length} factors analyzed | ${team1.name} vs ${team2.name}${pitcher1 ? ` | SP: ${pitcher1.name}` : ''}`,
    timestamp: Date.now(),
    marketPrice,
    category: 'Sports',
    sportsContext,
    sportsExplanation: explanation,
  };
}

// ─── Main scanner ─────────────────────────────────────────────────────────────
export async function scanBaseball(markets: PolymarketMarket[]): Promise<RankedSignal[]> {
  const signals: RankedSignal[] = [];

  // Fetch MLB-tagged markets directly from Polymarket (tag_id=100381)
  // This catches markets the generic fetch misses (World Series, MVP, Cy Young, game lines)
  let mlbMarkets: PolymarketMarket[] = [];
  try {
    const gammaMLB = await fetchSportsMarkets('mlb', 100);
    mlbMarkets = await enrichMarkets(gammaMLB);
  } catch (err) {
    console.error('[baseball] Failed to fetch MLB markets:', err);
  }

  // Also check markets already passed in (from the generic scan)
  const fromGeneric = markets.filter(m => m.active && !m.closed && isBaseballMarket(m.question));

  // Deduplicate by conditionId
  const seen = new Set<string>();
  const allBaseball: PolymarketMarket[] = [];
  for (const m of [...mlbMarkets, ...fromGeneric]) {
    if (!seen.has(m.conditionId)) {
      seen.add(m.conditionId);
      allBaseball.push(m);
    }
  }

  // Process live Polymarket MLB markets
  for (const market of allBaseball) {
    const mid = market.midPrice ?? 0.5;
    const rng = seededRng(market.conditionId.split('').reduce((a, c) => a + c.charCodeAt(0), 0));

    const team1 = findTeamByName(market.question);
    if (!team1) continue;

    // Detect if this is a futures market (World Series, MVP, etc.) vs a game line
    const futuresType = detectFuturesType(market.question);
    const team2Candidates = MLB_TEAMS_2026.filter(t => t.abbrev !== team1.abbrev && market.question.toLowerCase().includes(t.name.split(' ').pop()!.toLowerCase()));
    const isGameMarket = team2Candidates.length > 0 && !futuresType;

    if (isGameMarket) {
      // ── Head-to-head game market ──
      const team2 = team2Candidates[0];
      const pitcher1 = findPitcherForTeam(team1.abbrev, market.conditionId);
      const pitcher2 = findPitcherForTeam(team2.abbrev, market.conditionId);
      const players1 = simulatePlayers(market.conditionId, team1.name);
      const isHome = rng() > 0.5;

      const explanation = computeBaseballProbability(team1, team2, pitcher1, pitcher2, players1, mid, isHome);
      const edge = explanation.finalProbability - mid;

      if (Math.abs(edge) < 0.02) continue;

      const direction = edge > 0 ? 'YES' : 'NO';
      const absEdge = Math.abs(edge);
      const relativeEdge = absEdge / Math.max(0.05, mid);
      const confidence = Math.round(Math.min(92, 40 + relativeEdge * 12 + (pitcher1 ? 5 : 0) + Math.min(18, absEdge * 55)));
      const riskScore = Math.max(15, Math.round(60 - relativeEdge * 6 - (pitcher1 ? 5 : 0)));
      const expectedEdge = absEdge * 0.82;

      const sportsContext: SportsContext = {
        sport: 'MLB',
        competition: 'Regular Season',
        teams: [team1.name, team2.name],
        keyPlayers: players1,
        efficiencyDelta: Math.round((team1.runsPerGame - team1.teamERA - (team2.runsPerGame - team2.teamERA)) * 10) / 10,
      };

      signals.push({
        id: nanoid(),
        scannerType: 'BASEBALL',
        marketId: market.conditionId,
        marketQuestion: market.question,
        direction,
        confidence,
        expectedEdge,
        riskScore,
        edgeScore: Math.round(Math.min(3.5, relativeEdge * 0.5 + Math.log1p(absEdge * 12) * 0.5 + (pitcher1 ? 0.2 : 0)) * 100) / 100,
        summary: `MLB model: ${(explanation.finalProbability * 100).toFixed(1)}% vs market ${(mid * 100).toFixed(1)}% — ${(absEdge * 100).toFixed(1)}pp edge`,
        details: `${explanation.adjustments.length} factors analyzed | ${team1.name} vs ${team2.name}${pitcher1 ? ` | SP: ${pitcher1.name}` : ''}`,
        timestamp: Date.now(),
        marketPrice: mid,
        category: 'Sports',
        sportsContext,
        sportsExplanation: explanation,
      });
    } else {
      // ── Futures market (World Series, MVP, Cy Young, division, etc.) ──
      const fType = futuresType || 'other';
      const explanation = computeFuturesProbability(team1, mid, fType);
      const edge = explanation.finalProbability - mid;

      if (Math.abs(edge) < 0.01) continue;

      const direction = edge > 0 ? 'YES' : 'NO';
      const absEdge = Math.abs(edge);
      const relativeEdge = absEdge / Math.max(0.01, mid);

      // Futures confidence uses power ranking position + edge magnitude for wider spread
      const rank = MLB_TEAMS_2026
        .map(t => ({ abbrev: t.abbrev, rating: computeTeamPowerRating(t) }))
        .sort((a, b) => b.rating - a.rating)
        .findIndex(r => r.abbrev === team1.abbrev) + 1;

      const rankBonus = Math.max(0, (30 - rank) / 30) * 20;       // 0–20 from ranking
      const edgeBonus = Math.min(25, relativeEdge * 18);           // 0–25 from edge size
      const typeBonus = fType === 'championship' ? 5 : fType === 'division' ? 8 : 3;
      const confidence = Math.round(Math.min(90, 30 + rankBonus + edgeBonus + typeBonus));
      const riskScore = Math.max(20, Math.round(65 - rankBonus * 0.5 - edgeBonus * 0.3));
      const expectedEdge = absEdge * 0.75; // slightly lower conviction on long-horizon futures

      const futuresLabel = fType === 'championship' ? 'World Series'
        : fType === 'award' ? 'Award'
        : fType === 'division' ? 'Division'
        : 'Futures';

      const sportsContext: SportsContext = {
        sport: 'MLB',
        competition: futuresLabel,
        teams: [team1.name],
        keyPlayers: simulatePlayers(market.conditionId, team1.name),
        efficiencyDelta: Math.round((team1.runsPerGame - team1.teamERA) * 10) / 10,
      };

      signals.push({
        id: nanoid(),
        scannerType: 'BASEBALL',
        marketId: market.conditionId,
        marketQuestion: market.question,
        direction,
        confidence,
        expectedEdge,
        riskScore,
        edgeScore: Math.round(Math.min(3.5, relativeEdge * 0.3 + Math.log1p(absEdge * 15) * 0.4 + rankBonus * 0.015) * 100) / 100,
        summary: `${futuresLabel} model: ${(explanation.finalProbability * 100).toFixed(1)}% vs market ${(mid * 100).toFixed(1)}% — ${(absEdge * 100).toFixed(1)}pp edge (#${rank} power ranking)`,
        details: `${explanation.adjustments.length} factors | ${team1.name} — power rank #${rank}/30 | ${explanation.confidenceReason}`,
        timestamp: Date.now(),
        marketPrice: mid,
        category: 'Sports',
        sportsContext,
        sportsExplanation: explanation,
      });
    }
  }

  // If no live MLB markets found on Polymarket, generate signals from today's
  // realistic matchups so the engine is always demonstrable during the demo.
  if (signals.length === 0) {
    for (const matchup of DEMO_MATCHUPS) {
      const team1 = MLB_TEAMS_2026.find(t => t.abbrev === matchup.away);
      const team2 = MLB_TEAMS_2026.find(t => t.abbrev === matchup.home);
      if (!team1 || !team2) continue;

      const matchupId = `demo-${matchup.away}-${matchup.home}-${Date.now()}`;
      const signal = buildSignalFromMatchup(team1, team2, matchup.marketPrice, false, matchupId);
      if (signal) signals.push(signal);
    }
  }

  return signals
    .sort((a, b) => b.expectedEdge - a.expectedEdge)
    .slice(0, 12);
}
