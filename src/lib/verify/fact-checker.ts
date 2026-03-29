import Anthropic from '@anthropic-ai/sdk';
import { searchGoogleNews } from '@/lib/scraper/google-news';
import type { IntelEntry, ReliabilityTier } from '@/types';
import { nanoid } from '@/lib/alpha/utils';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

function detectType(raw: string): IntelEntry['type'] {
  if (raw.startsWith('http')) return 'url';
  if (raw.includes('reddit.com') || raw.includes('twitter.com') || raw.includes('x.com')) return 'social';
  if (raw.includes('my friend') || raw.includes('i heard') || raw.includes('someone told')) return 'tip';
  return 'freeform';
}

function computeReliability(sourceCount: number, type: IntelEntry['type']): { reliability: number; tier: ReliabilityTier } {
  let base = 20 + sourceCount * 15;
  if (type === 'freeform' || type === 'tip') base -= 20;
  if (type === 'social') base -= 10;
  const reliability = Math.max(5, Math.min(95, base));

  let tier: ReliabilityTier;
  if (reliability >= 80)      tier = 'VERIFIED';
  else if (reliability >= 60) tier = 'LIKELY';
  else if (reliability >= 40) tier = 'UNCERTAIN';
  else                         tier = 'UNVERIFIED';

  return { reliability, tier };
}

// ─── Risk delta calculation ───────────────────────────────────────────────────
// direction: 'CONFIRMS' = intel supports YES outcome (lowers risk for YES holders)
//            'CONTRADICTS' = intel undermines YES outcome (raises risk for YES holders)
//            'NEUTRAL' = no directional read
//
// Formula: riskDelta = directionSign × round((reliability / 100) × 20)
//   CONFIRMS    → negative delta (lowers risk), scaled by reliability
//   CONTRADICTS → positive delta (raises risk), scaled by reliability
//   NEUTRAL     → 0
//
// Examples:
//   95% reliable, CONFIRMS     → -19
//   80% reliable, CONFIRMS     → -16
//   80% reliable, CONTRADICTS  → +16
//   40% uncertain, CONFIRMS    →  -8
//   10% unverified, anything   →  ±2 (barely moves needle)
export function computeRiskDelta(reliability: number, direction: 'CONFIRMS' | 'CONTRADICTS' | 'NEUTRAL'): number {
  if (direction === 'NEUTRAL') return 0;
  const magnitude = Math.round((reliability / 100) * 20);
  return direction === 'CONFIRMS' ? -magnitude : magnitude;
}

export async function factCheck(raw: string, relatedMarketQuestion?: string): Promise<IntelEntry> {
  const type = detectType(raw);

  let claimText = raw;
  if (type === 'url') claimText = `Content from URL: ${raw}`;

  const keywords = claimText.slice(0, 100);
  const articles = await searchGoogleNews(keywords).catch(() => []);
  const sourceCount = Math.min(10, articles.length);

  const { reliability, tier } = computeReliability(sourceCount, type);

  // ── Claude analysis — now also classifies market direction ────────────────
  let aiAnalysis = '';
  let direction: 'CONFIRMS' | 'CONTRADICTS' | 'NEUTRAL' = 'NEUTRAL';

  try {
    const context = articles.slice(0, 3).map(a => `- ${a.title}`).join('\n');
    const msg = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 300,
      messages: [{
        role: 'user',
        content: `You are a prediction market analyst. Analyze this claim for reliability and market impact.

Claim: "${claimText}"
${relatedMarketQuestion ? `Related market: "${relatedMarketQuestion}"` : ''}
${context ? `Corroborating news:\n${context}` : 'No corroborating news found.'}

Respond in this exact format (2 lines):
DIRECTION: CONFIRMS or CONTRADICTS or NEUTRAL  (does this intel support the YES outcome of the related market, contradict it, or is it neutral/unrelated?)
ANALYSIS: <1-2 sentence analysis of reliability and market impact>`,
      }],
    });

    const text = (msg.content[0] as { text: string }).text.trim();
    const dirLine = text.match(/^DIRECTION:\s*(CONFIRMS|CONTRADICTS|NEUTRAL)/im);
    const analysisLine = text.match(/^ANALYSIS:\s*(.+)/im);

    if (dirLine) direction = dirLine[1] as typeof direction;
    aiAnalysis = analysisLine ? analysisLine[1].trim() : text;
  } catch {
    aiAnalysis = `${sourceCount} news sources found. ${tier === 'VERIFIED' ? 'Well corroborated.' : tier === 'UNVERIFIED' ? 'Treat with caution.' : 'Partially corroborated.'}`;
    direction = 'NEUTRAL';
  }

  const riskDelta = computeRiskDelta(reliability, direction);

  return {
    id: nanoid(),
    raw,
    type,
    claim: claimText.slice(0, 500),
    reliability,
    tier,
    sources: sourceCount,
    riskDelta,
    relatedMarkets: [],
    timestamp: Date.now(),
    aiAnalysis,
  };
}
