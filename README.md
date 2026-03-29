# Lineup

> Real-time alpha for prediction markets.

## Demo

[![Lineup Demo](https://img.youtube.com/vi/l2AGKneifeQ/maxresdefault.jpg)](https://youtu.be/l2AGKneifeQ)

**[Watch the demo on YouTube](https://youtu.be/l2AGKneifeQ)**

---

## What is Lineup?

Lineup is a prediction market alpha detection platform built on Polymarket. It scans live contracts using 8 strategy scanners in parallel, generates ranked trading signals with edge scores and Kelly sizing, runs Monte Carlo bootstrapped backtests on real resolved contracts, verifies external intel through AI, and manages a simulated paper trading portfolio with live P&L tracking.

---

## 8 Strategy Scanners

| Scanner | What it finds |
|---|---|
| **Arbitrage** | Contracts where YES + NO prices don't sum to 1 |
| **Spread** | Wide bid-ask gaps for contrarian entries near 50/50 markets |
| **Momentum** | Rapid price movements (>5pp) signaling information flow |
| **Divergence** | Oscillating markets with contradictory price signals |
| **Social Sentiment** | Reddit and Google News sentiment shifts not yet priced in |
| **Cross-Domain** | Stock/crypto/geopolitical moves that should affect prediction markets but haven't |
| **Sports** | Injury-adjusted win probability model for NBA, NFL, NHL, Soccer |
| **MLB Baseball** | Structured statistical model: Pythagorean expectation, Log5 matchups, pitcher ERA/WHIP, team OPS, bullpen quality, home/away splits, injury-adjusted lineups |

Each scanner returns ranked signals with confidence scores, expected edge, risk ratings, and transparent probability breakdowns.

---

## Signal Cards

Every signal card includes:

- **Edge score** with color coding (Exceptional / Great / Solid / Weak / Negative)
- **Confidence interval** with adjustable slider (80-99%) using continuous inverse-normal z-score
- **Kelly criterion bet sizing** computed from model probability and payout odds
- **Risk score** (0-100) combining time-to-expiry, liquidity, price extremity, spread width, volatility
- **Transparent probability breakdown** for sports and baseball signals showing each model component
- **One-click bet placement** into the paper trading portfolio

---

## Backtesting (Track Record)

The backtest runs on real resolved Polymarket contracts. No simulated trades, no fake markets. Every trade is traceable to a real contract.

- Fetches resolved markets from Polymarket Gamma API
- Replays scanner entry logic on historical CLOB price data
- Walk-forward approach: past data only at each evaluation point, no look-ahead
- 70/30 time-based split (in-sample / out-of-sample)
- Monte Carlo bootstrap resamples OOS trades with replacement each run
- 30-day and 90-day lookback windows
- Equity curve plotted against S&P 500 benchmark

**Displayed metrics:** Sharpe (OOS), Sharpe (IS), Win Rate, ROI, Max Drawdown, Profit Factor, Profit/Vol, Sortino Ratio, Total Trades

**PnL model for binary contracts:**
- Win: `size * (1 - entry_price)`
- Loss: `-size * entry_price`

---

## Intel Sidebar

Paste a URL, tip, rumor, or freeform text. The system:

1. Detects input type (news URL, social link, tip, freeform)
2. Scrapes Google News for corroborating or contradicting articles
3. Generates an embedding and vector-searches stored markets for relevant contracts
4. Sends everything to Claude to analyze the claim and assess reliability
5. Returns a tier: **VERIFIED**, **LIKELY**, **UNCERTAIN**, or **UNVERIFIED**
6. Auto-adjusts risk scores on matching open portfolio positions

---

## Paper Trading Portfolio

- $10K simulated bankroll
- Place bets directly from signal cards
- Live P&L tracking against real Polymarket CLOB midpoint prices
- Position-level risk scoring
- Equity curve and Sharpe ratio gauge
- Full trade history
- Deposit more funds or reset balance to $10K

---

## MLB Baseball Engine

The baseball scanner is a structured statistical model, not an LLM guess.

**Model pipeline:**
1. Base win probability from Pythagorean expectation (runs scored vs allowed)
2. Head-to-head matchup via Log5 formula
3. Starting pitcher adjustment (ERA, WHIP, recent form, K/9)
4. Team offensive strength (batting avg, OBP, slugging, runs per game)
5. Bullpen quality adjustment
6. Recent form (last 10 games)
7. Home/away advantage (~54% historical home win rate in MLB)
8. Injury-adjusted lineup modifier

All features are pre-game only. No post-game stats, no future data, no leakage. Team profiles for all 30 MLB teams with full statistical snapshots.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16, React 19, TypeScript |
| Styling | Tailwind CSS 4, Framer Motion |
| Data Viz | Recharts |
| Database | MongoDB Atlas |
| AI (Reasoning) | Anthropic Claude API |
| AI (Embeddings) | OpenAI Embeddings API |
| Market Data | Polymarket Gamma API, Polymarket CLOB API |
| Finance Data | Finnhub API |
| Scrapers | Google News RSS, Reddit JSON, RSS Parser |
| Deployment | Vercel |

---

## Environment Variables

```
MONGODB_URI=         # MongoDB Atlas connection string
ANTHROPIC_API_KEY=   # Anthropic Claude API key
OPENAI_API_KEY=      # OpenAI API key (embeddings)
FINNHUB_API_KEY=     # Finnhub API key (stock/crypto quotes)
```

---

## Getting Started

```bash
git clone https://github.com/anishko/yalehack.git
cd yalehack
npm install
cp .env.example .env.local  # add your API keys
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## Project Structure

```
src/
  app/                    # Next.js pages and API routes
    api/
      alpha/              # scan, backtest, stream endpoints
      portfolio/          # positions, trades, deposit, reset
      markets/            # market lookup, search, clean
      finance/            # Finnhub quotes, news
      verify/             # Intel verification pipeline
      analytics/          # Category analytics
      categories/         # Category listing
      strategy/           # Optimizer, performance
    portfolio/            # Portfolio page
    market/[id]/          # Individual market page
  components/
    alpha/                # SignalCard, BacktestPanel
    layout/               # Header, IntelSidebar, SignalTicker
    market/               # MarketCard, PriceChart, BetPanel
    portfolio/            # EquityCurve, PositionRow
    strategy/             # StrategyDashboard, StrategyCard, EdgeScoreGauge
    intel/                # IntelInput, IntelEntry
    shared/               # Tooltip, RiskBadge, Skeleton, SearchBar, CategoryFilter
    ui/                   # LoadingOverlay, LoadingWrapper
  lib/
    alpha/                # Engine, scanners (8), backtest, optimizer, sharpe, sizing
    polymarket/           # Gamma API, CLOB API, enricher
    mongodb/              # Client, markets, signals, analytics, articles, intel
    portfolio/            # Manager, Monte Carlo simulation
    risk/                 # Risk scorer
    verify/               # Fact checker (Claude + news)
    finnhub/              # Stock/crypto client
    scraper/              # Google News, Reddit, aggregator
    ml/                   # FinBERT sentiment
  hooks/                  # useCountUp, useMagneticCard
  types/                  # All TypeScript interfaces
```

---

Built for YHack 2026.
