# PolyEdge — Prediction Market Alpha Platform

> Quantitative edge for Polymarket traders. 8 strategy scanners, walk-forward backtesting, domain-specific ML models, and an AI-powered intel verification layer — all in one dashboard.

---

## What it does

PolyEdge is a full-stack trading intelligence platform built on top of [Polymarket](https://polymarket.com). It scans live prediction markets, identifies mispriced opportunities using quantitative models, and helps you size and manage bets with institutional-grade risk metrics.

### 8 Strategy Scanners
| Scanner | Edge Source |
|---|---|
| **Arbitrage** | YES + NO prices < $0.99 → near risk-free profit |
| **Spread** | Wide bid-ask spreads → market-making edge |
| **Momentum** | Price velocity > 5% → trend continuation |
| **Divergence** | Multi-outcome markets that don't sum to 1.0 |
| **Social** | News/Reddit sentiment gap vs market price |
| **Cross-Domain** | Stock/crypto moves not priced into linked markets (discovered via Vector Search) |
| **Sports** | FinBERT sentiment + player injury modeling + recent form → win probability mispricing |
| **March Madness** | 40yr seed win rates + KenPom efficiency + pace-of-play + injury impact |

### Backtesting Engine
- **Walk-forward validation** — 70% in-sample / 30% out-of-sample split, no look-ahead bias
- **Prediction-market-native metrics** (no T-bill benchmarks):
  - **Profit Factor** — total dollars won / total dollars lost
  - **Calmar Ratio** — total return / max drawdown
  - **Brier Score + Calibration Curve** — does 70% confidence = 70% win rate?
  - **Sortino Ratio** — penalizes downside volatility only
  - **Edge per Dollar** — expected return per dollar risked
  - **Monte Carlo Bootstrap** — reshuffle 10,000 trade orderings to prove profitability isn't luck
- **Sharpe Ratio** computed on OOS daily returns (also reported for comparison)
- **Alpha vs S&P 500** (Jensen's Alpha), Beta, Information Ratio, Treynor Ratio
- **Live demo mode** — animated trade-by-trade equity curve playback
- **Confidence interval slider** (80/90/95/99%) on every signal card

### Intel Sidebar
- Paste any URL, news tip, or claim → system fact-checks it
- **Multi-source verification pipeline:**
  1. Google News RSS cross-referencing (do major outlets corroborate?)
  2. Finnhub stock market validation (are related stocks moving in expected direction?)
  3. MongoDB Vector Search to find matching Polymarket contracts
  4. Claude for complex reasoning and impact assessment
- Classifies direction: **CONFIRMS** or **CONTRADICTS** the related market
- Risk delta scaled by reliability: `±round((reliability/100) × 20)`
- **Auto-adjusts `riskScore`** on matching open positions in the portfolio

### Portfolio Manager
- Simulated $10,000 starting capital
- Kelly criterion / Half-Kelly bet sizing
- Open positions, P&L tracking, trade history
- **Monte Carlo portfolio simulation** — 10,000 possible futures showing P&L distribution
- Equity curve with edge score
- Persisted to MongoDB Atlas

---

## MongoDB Atlas — Core Infrastructure (not just storage)

MongoDB Atlas is the backbone of PolyEdge, powering four critical systems beyond basic data storage:

### 1. Vector Search — Semantic Market Matching
Every Polymarket contract (10,000+) is embedded using OpenAI `text-embedding-3-small` and indexed in MongoDB Atlas with a vector search index. This powers:

- **Intel → Contract matching:** User pastes "Iran missile strikes reported" → vector search returns the 5 most semantically relevant Polymarket contracts in <100ms. No keyword matching needed.
- **Cross-Domain discovery:** Stock descriptions and Polymarket contracts live in the same vector space. "Lockheed Martin defense contractor quarterly earnings" lands near "Will the US declare war on Iran?" — enabling our Cross-Domain scanner to dynamically discover stock-market linkages without hardcoded mappings.
- **Similar signal retrieval:** When the alpha engine generates a signal, vector search finds the most similar historical signals from the trade log. "This signal resembles 47 past signals with a 68% win rate" gives per-signal confidence based on historical similarity.

```javascript
// MongoDB Atlas Vector Search Index
{
  "fields": [{
    "type": "vector",
    "path": "embedding",
    "numDimensions": 1536,
    "similarity": "cosine"
  }]
}

// Semantic search for matching contracts
const results = await db.collection("markets").aggregate([
  {
    $vectorSearch: {
      index: "market_embeddings",
      path: "embedding",
      queryVector: claimEmbedding,
      numCandidates: 100,
      limit: 5
    }
  },
  {
    $project: {
      question: 1,
      conditionId: 1,
      currentPrice: 1,
      score: { $meta: "vectorSearchScore" }
    }
  }
]).toArray();
```

### 2. Vector Search — News Deduplication
Scraped articles from Google News, Reddit, and Finnhub often cover the same story. Each article is embedded and checked against existing articles — similarity > 0.9 flags a duplicate. This prevents the reliability score from double-counting the same news as multiple corroborating sources.

### 3. Real-Time Market Cache
Live Polymarket data (prices, volumes, order book snapshots) is cached in MongoDB with TTL indexes. Scanners read from cache instead of hitting the Polymarket API on every tick, reducing latency and avoiding rate limits.

### 4. Portfolio + Trade Log Persistence
All simulated positions, trade history, P&L snapshots, and Intel entries are stored in MongoDB collections. The walk-forward backtester writes results to MongoDB for the frontend to query and visualize.

### 5. Aggregation Pipeline — Category Analytics Engine
A multi-stage aggregation pipeline runs entirely server-side in MongoDB — zero data pulled to Node.js until the final result. Demonstrates advanced MongoDB features:

```javascript
// GET /api/analytics?days=7
db.collection('signals').aggregate([
  { $match: { timestamp: { $gte: cutoff } } },
  { $facet: {
      byCategory: [
        { $group: { _id: '$category', signalCount: { $sum: 1 }, avgConfidence: { $avg: '$confidence' } } },
        { $lookup: { from: 'trades', let: { cat: '$_id' },
            pipeline: [
              { $match: { $expr: { $eq: ['$category', '$$cat'] } } },
              { $group: { _id: null, totalPnl: { $sum: '$pnl' }, wins: { $sum: { $cond: ... } } } }
            ], as: 'tradeStats' } },
        { $sort: { signalCount: -1 } }
      ],
      overall: [ { $group: { _id: null, totalSignals: { $sum: 1 }, ... } },
                  { $lookup: { from: 'trades', ... } } ],
      topSignals: [ { $sort: { confidence: -1 } }, { $limit: 5 } ]
  }}
]);
```

Pipeline stages used: `$match`, `$group`, `$lookup` (cross-collection JOIN), `$facet` (parallel sub-pipelines), `$sort`, `$project`, `$cond`, `$expr`, `$arrayElemAt`, `$addToSet`, `$unwind`.

### 6. Correlations — Precomputed Category Correlation Matrix
The `correlations` collection stores Pearson correlation coefficients between category edge scores (e.g. Sports vs Crypto signal correlation = -0.12). Used by the optimizer to diversify bets across uncorrelated categories. Recomputed via `POST /api/analytics`.

### Collection Schema
```
polyedge (database)
├── markets          — 10,000+ enriched Polymarket contracts + embeddings
├── signals          — ranked scanner outputs with confidence scores
├── trades           — backtest + simulated trade log
├── portfolio        — open positions, cash balance, equity snapshots
├── intel            — user-submitted claims + reliability scores
├── articles         — scraped news articles + embeddings (for dedup)
└── correlations     — precomputed price correlation matrices
```

---

## ML Architecture — Domain-Specific Models + LLM Reasoning

PolyEdge uses a tiered ML architecture: fast specialized models for high-frequency classification, and LLMs for complex reasoning.

### Tier 1: Domain-Specific Transformers (fast, local, specialized)

| Model | Domain | Purpose |
|---|---|---|
| **FinBERT** (`ProsusAI/finbert`) | Financial news | Sentiment classification (positive/negative/neutral) for financial articles. Fed into Social and Cross-Domain scanners. |
| **Sports injury/form models** | Sports betting | Historical seed data (40yr March Madness), KenPom efficiency ratings, player injury impact modeling. Outputs win probability adjustments. |
| **OpenAI embeddings** | All domains | `text-embedding-3-small` for vectorizing contracts and articles into MongoDB. Powers semantic search across the entire platform. |

These models run on every scraped article and every scanner tick. They're fast (<50ms) and free after initial setup.

### Tier 2: LLM Reasoning (slower, powerful, on-demand)

| Model | Purpose |
|---|---|
| **Claude claude-sonnet-4** | Intel sidebar: complex claim analysis, multi-source synthesis, impact reasoning, reliability scoring. Called on user interaction, not on every tick. |
| **Gemini** | Backup/alternative for signal explanations and scenario analysis. |

### Why Two Tiers?
Calling Claude for every scraped article across 8 scanners would be slow and expensive. FinBERT classifies 100 articles/second locally. Claude handles the 2-3 complex analyses per minute when a user submits intel or requests an explanation.

### Fine-Tuning Architecture (production roadmap)
```
Raw data (Polymarket outcomes + news at time of resolution)
                    ↓
         Label: did the market move as predicted?
                    ↓
         Fine-tune BERT/DistilBERT per domain:
           - Political news → political market accuracy
           - Financial news → crypto/commodity market accuracy  
           - Sports news → sports market accuracy
                    ↓
         Domain-specific confidence scores replace generic sentiment
                    ↓
         Per-scanner accuracy improves from ~55% → target 65%+
```

For the hackathon we use pre-trained FinBERT. In production, we'd fine-tune on Polymarket-specific outcome data: "given this article at time T, did the linked contract move in the predicted direction within 24 hours?" This creates a model that doesn't just classify sentiment — it predicts prediction market movements.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 14 App Router, TypeScript, Recharts |
| AI — Reasoning | Anthropic Claude `claude-sonnet-4` (intel analysis, complex reasoning) |
| AI — Sentiment | FinBERT `ProsusAI/finbert` (financial news classification) |
| Embeddings | OpenAI `text-embedding-3-small` + MongoDB Atlas Vector Search |
| Database | MongoDB Atlas M0 (markets, portfolio, vectors, correlations) |
| Vector Search | MongoDB Atlas Vector Search (contract matching, news dedup, signal similarity) |
| Market Data | Polymarket Gamma API + CLOB API (no auth required) |
| Finance Data | Finnhub API — REST for historical, WebSocket for real-time stock monitoring |
| Scrapers | Google News RSS + Reddit JSON (no keys required) |

---

## Architecture

```
                           ┌──────────────────────┐
                           │   MongoDB Atlas       │
                           │                       │
                           │ ┌─ markets + vectors ─┤
Polymarket Gamma API ─────►│ │  (Vector Search)    │
                           │ ├─ correlations       │
Finnhub REST + WebSocket ─►│ ├─ articles + vectors │
                           │ ├─ signals            │
Google News / Reddit ─────►│ ├─ trades             │
                           │ └─ portfolio          │
                           └───────────┬───────────┘
                                       │
                    ┌──────────────────┼──────────────────┐
                    ▼                  ▼                  ▼
            FinBERT Sentiment    8 Scanner Functions   Vector Search
            (fast, local)        (parallel)            (semantic matching)
                    │                  │                  │
                    └──────────────────┼──────────────────┘
                                       ▼
                              RankedSignal[] + Confidence
                                       │
                          ┌────────────┼────────────┐
                          ▼            ▼            ▼
                    Signal Cards   Backtest Tab  Portfolio Tab
                    + Kelly Size   + Monte Carlo  + Risk Metrics
                          │
                          ▼
                    Intel Sidebar ──► Claude ──► riskDelta ──► Portfolio
```

---

## Key Metrics Explained

### Prediction-Market-Native Metrics
- **Profit Factor** — total $ won / total $ lost. Above 1.0 = profitable. Above 2.0 = excellent.
- **Calmar Ratio** — total return / max drawdown. Higher = better risk-adjusted returns. No benchmark needed.
- **Brier Score** — measures calibration: does 70% confidence = 70% win rate? Lower = more accurate.
- **Sortino Ratio** — like Sharpe but only penalizes losses, not upside volatility.
- **Edge per Dollar** — expected return per dollar risked. Casinos run on $0.02-0.05. We target $0.03+.
- **Monte Carlo p-value** — probability strategy is profitable across 10,000 reshuffled trade orderings.

### Traditional Metrics (also reported)
- **Sharpe Ratio** — annualized risk-adjusted return vs Treasury rate. Computed on OOS daily returns.
- **Alpha** — Jensen's Alpha vs S&P 500.
- **Beta** — sensitivity to S&P 500 moves.
- **Information Ratio** — consistency of outperformance vs benchmark.
- **Treynor Ratio** — excess return per unit of market risk.

### Risk Metrics
- **Risk Delta** — intel direction × reliability score. Negative = confirms position. Positive = contradicts.
- **Portfolio Monte Carlo** — 10,000 simulated futures showing P&L distribution and tail risk.
- **Max Drawdown + Recovery** — worst losing streak and how many trades to recover.

---

## Sponsor Track Eligibility

| Track | How PolyEdge Qualifies |
|---|---|
| **Polymarket** ($2,000) | Core product. Uses Gamma API, CLOB API, WebSocket. All 8 scanners analyze Polymarket data. |
| **MongoDB Atlas** (MLH) | Vector Search is core infrastructure: contract matching, cross-domain discovery, news dedup, signal similarity. 7 collections. |
| **ElevenLabs** (MLH) | Voice briefing: spoken alpha signals and portfolio summaries. |
| **Gemini** (MLH) | Signal explanations and scenario analysis. |
| **GoDaddy** (MLH) | Project domain registered. |
| **Best UI/UX** (YHack) | Gamified dashboard with animations, real-time updates, Monte Carlo visualizations. |

---

Built for YHack 2026.
