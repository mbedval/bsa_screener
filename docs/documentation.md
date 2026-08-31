# BSA System & Analytical Architecture Documentation

This document explains the mathematical theories, scoring mechanics, and data flow pipelines governing the consolidated **Bindsol Stock Analysis (BSA) Screener** application.

---

## 1. Scoring & Recommendation Engine

The core strategy engine is based on a hybrid valuation framework combining traditional technical indicators with news sentiment profiles and volume footprints.

### A. Technical Score Calculations
Technical analysis extracts momentum and trend markers from daily candles (`indicators_daily` and `ohlcv_daily`):
* **Relative Strength (RSI-14)**: Identifies oversold (< 30) or overbought (> 70) regimes.
* **Moving Averages (SMA-20 & SMA-50)**: Evaluates trend crossovers (Golden Crossover vs Death Crossover).
* **MACD Crossovers**: Registers bullish/bearish line momentum indicators.
* **Bollinger Bands**: Captures volatility expansions and proximity to band bounds.
* **Ichimoku Cloud Breakouts**: Evaluates position relative to the Senkou Span boundaries.

Technical score ($S_{tech}$) is aggregated between $-1.0$ (extremely bearish) and $+1.0$ (extremely bullish).

### B. Behavioral Sentiment Index
Analyzes qualitative metrics to extract market sentiment:
* **News Headline Parser**: Fetches live headlines from Yahoo Finance and screens title tokens against positive and negative behavioral keyword databases.
* **Smart Money Volume Index**: Measures daily volumes against the 20-day average. A ratio $>1.5\times$ on positive price movements identifies **Accumulation** (Smart Money entry); on negative movements it indicates **Distribution** (Smart Money liquidation).

Behavioral score ($S_{behavioral}$) scales between $-1.0$ and $+1.0$.

### C. Hybrid Aggregate Score
The final trade setups are determined by the Hybrid Score:
$$S_{hybrid} = (0.50 \times S_{tech}) + (0.50 \times S_{behavioral})$$

* **BUY Recommendation**: $S_{hybrid} \ge +0.25$
* **SELL Recommendation**: $S_{hybrid} \le -0.25$
* **HOLD Recommendation**: $-0.25 < S_{hybrid} < +0.25$

---

## 2. Option Chain Derivative Engine

For tickers flagged as F&O enabled (`is_fno = true`), the options chain analyzer evaluates positions from `raw_fno_derivatives`:
* **Put-Call Ratio (PCR)**: Evaluated as:
  $$PCR = \frac{\sum \text{Volume of PE strikes}}{\sum \text{Volume of CE strikes}}$$
  * $PCR > 1.25$ indicates bullish Put Writing (institutional support).
  * $PCR < 0.80$ indicates bearish Call Writing (overhead resistance).
* **ATM Strike (At-The-Money)**: Pinpoints the active option strike closest to the current market price.
* **Support / Resistance**: Identified by strikes containing the maximum Put Volume (Support) and Call Volume (Resistance).

---

## 3. 22-Day Price Projection Model

To forecast short-term swing trajectories, the system runs a stochastic price simulation model:
1. Calculates drift direction from the $S_{tech}$ indicator score.
2. Extracts daily volatility boundaries using the Average True Range (ATR-14).
3. Evaluates a drift-volatility random walk over 22 trading sessions:
   $$\text{Price}_{t} = \text{Price}_{t-1} + \text{Drift}_{daily} + \text{Vol}_{noise}$$
4. Outputs the projected price trajectory into the database as a JSON array.

---

## 4. Database Rules

* **Deduplication Business Rule**: Before writing scoring metrics or option changes, the orchestrator queries the latest entry in `analysis_summaries`. If the close price, overall recommendation, and hybrid score are identical, the database update is bypassed to save disk resources and keep logs clean.
