// ─── FinBERT Sentiment via Hugging Face Inference API ─────────────────────────
// Calls ProsusAI/finbert on the free HF Inference API (no API key needed).
// Falls back to neutral (score 0.5) if the API is unavailable.

const HF_API_URL = 'https://api-inference.huggingface.co/models/ProsusAI/finbert';

export type SentimentLabel = 'positive' | 'negative' | 'neutral';

export interface SentimentResult {
  label: SentimentLabel;
  score: number;
}

// Raw HF response shape: [[{label, score}, ...]]
type HFSentimentResponse = Array<Array<{ label: string; score: number }>>;

const NEUTRAL_FALLBACK: SentimentResult = { label: 'neutral', score: 0.5 };

/**
 * Classify sentiment of a single text using FinBERT via Hugging Face.
 * Gracefully returns neutral with score 0.5 if the API is unreachable.
 */
export async function classifySentiment(text: string): Promise<SentimentResult> {
  try {
    const response = await fetch(HF_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ inputs: text }),
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      console.warn(`[FinBERT] API returned ${response.status}, falling back to neutral`);
      return NEUTRAL_FALLBACK;
    }

    const data: HFSentimentResponse = await response.json();

    // HF returns [[{label, score}, ...]] — outer array per input, inner sorted by score desc
    if (!Array.isArray(data) || !Array.isArray(data[0]) || data[0].length === 0) {
      return NEUTRAL_FALLBACK;
    }

    const top = data[0].reduce((best, cur) => (cur.score > best.score ? cur : best), data[0][0]);

    return {
      label: top.label.toLowerCase() as SentimentLabel,
      score: Math.round(top.score * 10000) / 10000,
    };
  } catch (err) {
    console.warn('[FinBERT] API call failed, falling back to neutral:', (err as Error).message);
    return NEUTRAL_FALLBACK;
  }
}

/**
 * Classify sentiment for multiple texts in a single API call.
 * HF Inference API accepts an array of inputs and returns one result set per input.
 * Falls back to per-item neutral if the batch call fails.
 */
export async function classifyBatch(texts: string[]): Promise<SentimentResult[]> {
  if (texts.length === 0) return [];

  try {
    const response = await fetch(HF_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ inputs: texts }),
      signal: AbortSignal.timeout(15_000),
    });

    if (!response.ok) {
      console.warn(`[FinBERT] Batch API returned ${response.status}, falling back to neutral`);
      return texts.map(() => NEUTRAL_FALLBACK);
    }

    const data: HFSentimentResponse = await response.json();

    // When sending N inputs, HF returns N arrays of label/score objects
    if (!Array.isArray(data) || data.length !== texts.length) {
      // Mismatch — fall back
      return texts.map(() => NEUTRAL_FALLBACK);
    }

    return data.map((results) => {
      if (!Array.isArray(results) || results.length === 0) return NEUTRAL_FALLBACK;
      const top = results.reduce((best, cur) => (cur.score > best.score ? cur : best), results[0]);
      return {
        label: top.label.toLowerCase() as SentimentLabel,
        score: Math.round(top.score * 10000) / 10000,
      };
    });
  } catch (err) {
    console.warn('[FinBERT] Batch call failed, falling back to neutral:', (err as Error).message);
    return texts.map(() => NEUTRAL_FALLBACK);
  }
}

/**
 * Map FinBERT labels to the aggregator's bullish/bearish/neutral vocabulary.
 */
export function toMarketSentiment(result: SentimentResult): 'bullish' | 'bearish' | 'neutral' {
  if (result.label === 'positive') return 'bullish';
  if (result.label === 'negative') return 'bearish';
  return 'neutral';
}
