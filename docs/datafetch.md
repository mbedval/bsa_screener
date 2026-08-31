# BSA Market Screener — Data Fetch Reference

This document describes the **data download durations, intervals, and purposes** for every data category in the BSA Market Intelligence platform.

---

## 1. Historical Price & Technical Data

| Property | Value |
|---|---|
| **Tables** | `ohlcv_daily`, `indicators_daily` |
| **Source** | Yahoo Finance (`yfinance`) |
| **Duration / Horizon** | **2 Years** (`period="2y"`) |
| **Interval / Granularity** | **Daily (1d)** |
| **Approximate Bars** | ~499 trading days |

### Indicators Computed Over This Window

| Indicator | Lookback Period |
|---|---|
| SMA (Simple Moving Average) | 20-day, 50-day |
| EMA (Exponential Moving Average) | 12-day (fast), 26-day (slow) |
| RSI (Relative Strength Index) | 14-day |
| MACD (Signal / Histogram) | 12, 26, 9 |
| Bollinger Bands (Upper / Mid / Lower) | 20-day, 2σ |
| ATR (Average True Range) | 14-day |
| VWAP (Volume Weighted Avg Price) | Rolling daily |
| Ichimoku Cloud | Tenkan 9 / Kijun 26 / Span 52 |

**Purpose:** Powers the interactive TradingView candlestick charts, SMA/BB overlays, RSI & MACD oscillator panels, the 22-day Monte Carlo forward projection, and all screener technical signals.

---

## 2. Fundamental Financials & Performance Data

| Property | Value |
|---|---|
| **Table** | `fundamental_analysis` |
| **Source** | Yahoo Finance (`tk.quarterly_financials`, `tk.info`) |
| **Duration / Horizon** | **Last 8 Quarters** (2 full years of quarterly results) |
| **Interval / Granularity** | **Quarterly** |

### Metrics Evaluated

| Metric | Description |
|---|---|
| PAT (Profit After Tax) | Latest quarter vs. 8-quarter average; YoY growth flag |
| Other / Non-Operating Income | Ratio check: must be ≤ 5% of average PAT |
| Trailing P/E | From `trailingPE` in `tk.info` |
| Forward P/E | From `forwardPE` in `tk.info` (fallback when trailing is unavailable) |
| Debt-to-Equity | From `tk.info` balance sheet fields |

**Purpose:** Evaluates fundamental quality of each stock — profitability consistency, earnings purity (core vs. other income), and valuation relative to a 20× P/E benchmark.

---

## 3. Derivatives & F&O Option Chains

| Property | Value |
|---|---|
| **Tables** | `raw_fno_derivatives`, option analytics views |
| **Source** | NSE Option Chain API / `yfinance` options |
| **Duration / Horizon** | **Current Active Monthly Expiry Cycle** |
| **Interval / Granularity** | **Per-strike price snapshot (CE & PE)** |

### Live Spot Price Fetch

| Property | Value |
|---|---|
| **Period used** | `period="5d"` → `Close.iloc[-1]` |
| **Purpose** | Determines ATM (At-The-Money) strike and strike intervals |

### Strike Calculation

| Symbol Category | Strike Interval |
|---|---|
| NIFTY | ₹50 |
| BANKNIFTY | ₹100 |
| FINNIFTY | ₹50 |
| MIDCPNIFTY | ₹25 |
| Stock > ₹2,500 | ₹100 |
| Stock ₹1,000–₹2,500 | ₹20 |
| Stock ₹500–₹1,000 | ₹10 |
| Stock ₹100–₹500 | ₹5 |
| Stock < ₹100 | ₹1 |

**Purpose:** Detects Call/Put OI buildup, volume concentration, Put-Call Ratio (PCR), ATM pinning, put support & call resistance levels, and computes Option Greeks (Delta, Gamma, Theta decay ₹/day, Vega, IV).

---

## 4. Institutional Smart Money & Delivery Scanners

| Property | Value |
|---|---|
| **Scanners** | Operator Footprint, Delivery Spikes |
| **Duration / Horizon** | **30–90 day rolling window** |
| **Interval / Granularity** | **Daily delivery volume vs. 20-day & 50-day moving average** |

**Purpose:** Detects unusual delivery volume surges that indicate institutional accumulation or distribution phases. Signals are cross-referenced with OI data to confirm smart money entry/exit.

---

## Summary Table

| Data Category | Source | Duration | Interval |
|---|---|---|---|
| Price / OHLCV | Yahoo Finance | **2 Years** | Daily |
| Technical Indicators | Computed from OHLCV | **2 Years** | Daily |
| Quarterly Fundamentals | Yahoo Finance | **8 Quarters (2 Yrs)** | Quarterly |
| Live Spot Price (F&O) | Yahoo Finance | **5 Days** (latest close) | Intraday/Daily |
| Option Chain Snapshot | NSE API | **Current Expiry Cycle** | Per strike |
| Delivery / Smart Money | NSE / Yahoo Finance | **30–90 Days** | Daily |

---

## Code References

| File | Key Function | Default Period |
|---|---|---|
| `engine/downloaders/market_data.py` | `download_ticker_data()` | `period="2y"`, `interval="1d"` |
| `engine/downloaders/market_data.py` | `download_fundamental_data()` | Last 8 quarters via `tk.quarterly_financials` |
| `engine/downloaders/derivatives.py` | `fetch_live_spot_price()` | `period="5d"` |
| `engine/downloaders/derivatives.py` | `get_current_monthly_expiry()` | Last Thursday of current month |

---

*Last updated: 2026-08-31*
