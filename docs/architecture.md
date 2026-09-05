# BSA Screener System Architecture & 3-Phase Design Contract

## Executive Overview
The BSA Screener is designed around an explicit **3-Phase Architecture**. Data ingestion, master configuration, and calculation/analysis engines are strictly decoupled. No technical indicator calculation, scanner report generation, or fundamental analysis scoring is performed until Phase 2 (`--mode analyze-all`) is explicitly executed.

---

## 3-Phase Architecture Specification

```
┌─────────────────────────────────────────────────────────────┐
│ PHASE 0: Master Baseline Setup (Golden Setup Metadata)      │
│  - Load ticker_master, fno_stock_master, fno_index_master   │
│  - Load sectors, ticker_sector, watchlist, users            │
│  - NO Market Data (0 rows) & NO Analysis Reports (0 rows)   │
└──────────────────────────────┬──────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│ PHASE 1: Raw Data Ingestion Only (No Indicator / No Scans)  │
│  - Phase 1.1: Spot Data Download (--mode download-spot)     │
│      Stores raw OHLCV prices, fundamentals, delivery history│
│  - Phase 1.2: F&O Option Chain Download (--mode download-fno)│
│      Stores raw option chain strikes & prices               │
│  - Scanner Reports & Analysis Summaries remain BLANK        │
└──────────────────────────────┬──────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│ PHASE 2: Engine Calculation & Analysis (--mode analyze-all) │
│  - Compute technical indicators (RSI, SMA, MACD, BB, ATR)   │
│  - Evaluate Technical Scanners (quicktrade, operator, etc.) │
│  - Evaluate Fundamental Analysis (cash flow, delivery spikes│
│  - Populate analysis_summaries & activate Web Portal UI     │
└─────────────────────────────────────────────────────────────┘
```

---

## Technical Enforcement Rules for Agents & Developers

1. **Phase 0 Integrity**:
   `dump_database.py` must ONLY dump master setup metadata tables (`ticker_master`, `fno_stock_master`, `fno_index_master`, `sectors`, `ticker_sector`, `watchlist`, `users`, `alternative_names`, `excluded_tickers`, `system_config`, `ticker_mappings`). All price history, fundamentals, derivatives, scanners, and analysis report tables must be excluded.

2. **Phase 1 Ingestion Integrity**:
   `download-spot` and `download-fno` MUST NOT trigger indicator calculations, scanner signal generation, or scoring summaries. All scanner endpoints in `backend/app/main.py` return 0 rows when `analysis_summaries` is unpopulated.

3. **Phase 2 Analysis Execution**:
   All technical scanners (`quicktrade`, `screener`, `operatorfootprint`, `swinger`, `monthly_swinger`, `breakout`, `trend_trading`, `reversal_trading`, `support_resistance`), fundamental analysis reports (`cash_flow_summary`, `delivery_spikes`), and derivative summaries (`fno_active`, `intraday_call`, `historical_calls`) are populated only when `python3 -m engine.cli --mode analyze-all` runs.
