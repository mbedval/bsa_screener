# BSA Screener - Mandatory Rules for Data Management & Data Analysis

To maintain strict data integrity, zero contamination, and explicit control flow, the application follows mandatory rules for **Data Management** and **Data Analysis**. No calculations, indicators, technical scanner reports, or fundamental analysis outputs are generated prematurely.

---

## 1. Data Management Rules (Phase 0 & Phase 1)

### Rule 1.1: Phase 0 - Golden Master Setup Baseline
- **Goal**: Initialize clean database structure & master setup metadata only.
- **Master Tables Allowed**: `ticker_master`, `fno_stock_master`, `fno_index_master`, `sectors`, `ticker_sector`, `watchlist`, `watchlist_items`, `users`, `alternative_names`, `excluded_tickers`, `system_config`, `ticker_mappings`.
- **Database Dump Contract**: `dump_database.py` MUST ONLY dump records from the above master setup tables.
- **Strict Prohibition**:
  - **NO MARKET PRICE DATA** (0 rows in `ohlcv_daily`).
  - **NO FUNDAMENTAL DOWNLOADS** (0 rows in `fundamentals`, `raw_fundamentals`).
  - **NO OPTION CHAINS** (0 rows in `raw_fno_derivatives`).
  - **NO SCANNERS OR ANALYSIS** (0 rows in `quicktrade`, `screener`, `operatorfootprint`, `delivery_spikes`, `breakout`, `trend_trading`, `reversal_trading`, `support_resistance`, `fno_active`, `analysis_summaries`, `intraday_call`, `historical_calls`, `broker_recommendations`).
  - All scanner & report UI views MUST remain blank with a helpful pending notice.

### Rule 1.2: Phase 1 - Raw Data Ingestion Only (No Calculation & No Analysis)
- **Goal**: Fetch raw market data from external sources and store strictly in raw/master database tables.
- **Sub-Phase 1.1 (`python3 -m engine.cli --mode download-spot`)**:
  - Downloads raw daily price history (open, high, low, close, volume) into `ohlcv_daily`.
  - Downloads raw quarterly fundamental metrics (PAT, cash flow, PE ratio, Debt/Equity) into `fundamentals` mapped to `ticker_master`.
  - Downloads daily raw delivery metrics into `delivery_history`.
- **Sub-Phase 1.2 (`python3 -m engine.cli --mode download-fno`)**:
  - Downloads raw F&O option chain strike rates, LTPs, IVs, and volumes into `raw_fno_derivatives`.
- **Strict Ingestion Constraints**:
  - **NO technical indicator calculations** (RSI, SMA, MACD, Bollinger Bands, ATR, Ichimoku).
  - **NO scanner report generation** (`quicktrade`, `operatorfootprint`, `delivery_spikes`, etc. MUST remain 0 rows).
  - **NO strategy evaluation or scoring**.

---

## 2. Data Analysis Rules (Phase 2)

### Rule 2.1: Phase 2 - Engine Analysis & Report Generation (`--mode analyze-all`)
- **Goal**: Execute the core calculation & multi-factor scoring engine. Reads raw data from database and populates all analysis & scanner reports.
- **Command**: `python3 -m engine.cli --mode analyze-all`
- **Execution Pipeline**:
  1. Computes technical indicators across `ohlcv_daily` and populates `indicators_daily`.
  2. Generates **Technical Scanners**: `quicktrade`, `screener`, `operatorfootprint`, `swinger`, `monthly_swinger`, `breakout`, `trend_trading`, `reversal_trading`, `support_resistance`.
  3. Generates **Fundamental & Delivery Analysis**: Cash flow status, PAT trend evaluation, daily delivery analysis, and `delivery_spikes`.
  4. Generates **Derivative & Hybrid Summaries**: `fno_active`, `intraday_call`, `historical_calls`, `call_efficiency`, and `analysis_summaries`.
  5. Once `analysis_summaries` is populated, the backend activates all scanner UI views and interactive research report generation.

### Rule 2.2: Historical Calls Data Retaining & Backup
- **Command**: `python3 -m engine.cli --mode backup`
- **Rule**: Backs up generated historical calls from `historical_calls` table into `historical_call_bkp` table and exports to `data/historical_call_bkp.csv` to ensure historical calls are preserved independently without polluting fresh golden baseline setups.
