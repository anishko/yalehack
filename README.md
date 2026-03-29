# PolyEdge — Prediction Market Alpha Platform

> Quantitative edge for Polymarket traders. 8 strategy scanners, walk-forward backtesting, niche sports fine-tuning, and an AI-powered intel verification layer — all in one dashboard.

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
| **Cross-Domain** | Stock/crypto moves not priced into linked markets |
| **Sports** | Player injury modeling + recent form → win probability mispricing |
| **March Madness** | 40yr seed win rates + KenPom efficiency + pace-of-play + injury impact |

### Backtesting Engine
- **Walk-forward validation** — 70% in-sample / 30% out-of-sample split, no look-ahead bias
- **Sharpe Ratio** computed on OOS daily returns with 10-yr US Treasury (4.4%) as risk-free rate
- **Alpha vs S&P 500** (Jensen's Alpha), Beta, Information Ratio, Treynor Ratio
- **Live demo mode** — animated trade-by-trade equity curve playback
- **S&P 500 benchmark overlay** on equity curve chart
- **Confidence interval slider** (80/90/95/99%) on every signal card

### Intel Sidebar
- Paste any URL, news tip, or claim → Claude fact-checks it against Google News
- Classifies direction: **CONFIRMS** or **CONTRADICTS** the related market
- Risk delta scaled by reliability: `±round((reliability/100) × 20)` — not a hardcoded value
- **Auto-adjusts `riskScore`** on matching open positions in the portfolio

### Portfolio Manager
- Simulated $10,000 starting capital
- Kelly criterion / Half-Kelly bet sizing
- Open positions, P&L tracking, trade history
- Equity curve with edge score (Sharpe)
- Persisted to MongoDB Atlas

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 14 App Router, TypeScript, Recharts |
| AI | Anthropic Claude `claude-sonnet-4` (intel analysis) |
| Embeddings | OpenAI `text-embedding-3-small` + MongoDB Atlas Vector Search |
| Database | MongoDB Atlas M0 (markets + portfolio) |
| Market Data | Polymarket Gamma API + CLOB API (no auth) |
| Finance Data | Finnhub API (stocks, crypto, news) |
| Scrapers | Google News RSS + Reddit JSON (no keys required) |

---

## Setup

### 1. Install dependencies
```bash
npm install
```

### 2. Environment variables
Create a `.env.local` file:
```env
MONGODB_URI=mongodb+srv://...
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...
FINNHUB_API_KEY=...
```

### 3. Run
```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

---

## Architecture

```
Polymarket Gamma API ──► enrichMarket() ──► MongoDB markets collection
                              │
                              ▼
                    8 Scanner Functions (parallel)
                              │
                              ▼
                    RankedSignal[] ──► UI (SignalCard, SportsTab)
                              │
                              ▼
                    Kelly Sizing ──► Portfolio (MongoDB)
                              │
                              ▼
                    Intel Sidebar ──► Claude ──► riskDelta ──► Portfolio
```

---

## Key Metrics Explained

- **Sharpe Ratio** — annualized risk-adjusted return vs Treasury rate. Computed on OOS daily returns only.
- **Alpha** — Jensen's Alpha vs S&P 500. Positive = strategy outperforms after adjusting for market exposure.
- **Beta** — sensitivity to S&P 500 moves. <1 = lower market correlation.
- **Information Ratio** — consistency of outperformance vs benchmark.
- **Treynor Ratio** — excess return per unit of market risk (beta).
- **Risk Delta** — intel direction × reliability score. Negative = confirms position (lowers risk). Positive = contradicts (raises risk).

---

Built for Yale Hackathon 2025.
