# BSA Screener - Architecture & Workflow Guide

## Core 3-Phase Design Architecture

To ensure clean separation of data ingestion, baseline setup, and analysis computation, the system enforces a strict 3-Phase Design Contract:

---

### Phase 0: Master Setup Baseline (Golden Metadata)
- **Purpose**: Initialize database schema and load clean master metadata without downloading market data or running analysis.
- **Commands**:
  - `python3 initialmasterseeding.py -y` (Initial Sample Setup - max 5 tickers)
  - `python3 fulldump.py -y` (Full Production Setup - 2,500+ master tickers, F&O masters)
  - `python3 dump_database.py` (Dumps ONLY master setup metadata into `bsa_db_backup.sql`)
- **Guaranteed State**:
  - Master metadata tables populated (`ticker_master`, `fno_stock_master`, `fno_index_master`, `sectors`, `watchlist`, `users`, `alternative_names`, `excluded_tickers`, `system_config`, `ticker_mappings`).
  - All price history, fundamentals, derivatives, scanners, and analysis report tables remain **0 rows**.

---

### Phase 1: Raw Data Download Only (No Calculation & No Analysis)
- **Purpose**: Download raw market data from external APIs into PostgreSQL tables without performing technical indicator calculations, scanner evaluation, or score generation.

#### Phase 1.1: Download Spot Price & Fundamentals
```bash
python3 -m engine.cli --mode download-spot
```
- Downloads daily OHLCV price history (open, high, low, close, volume) into `ohlcv_daily`.
- Downloads raw fundamental metrics (PAT, cash flow, PE, Debt/Equity) into `fundamentals`.
- **Note**: Technical scanners and fundamental analysis reports remain **0 rows** during this step.

#### Phase 1.2: Download F&O Option Chain Data
```bash
python3 -m engine.cli --mode download-fno
```
- Downloads raw option chain strike prices, LTPs, IVs, and volumes into `raw_fno_derivatives`.
- **Note**: Option strategy analysis and `fno_active` summaries remain **0 rows** during this step.

---

### Phase 2: Engine Analysis & Report Generation
- **Purpose**: Execute the multi-factor scoring engine, technical indicator calculations, technical scanner evaluations, fundamental cash flow/delivery analysis, and report generation.
```bash
python3 -m engine.cli --mode analyze-all
```
- **Actions**:
  1. Computes technical indicators (RSI, SMA, MACD, Bollinger Bands, ATR, Ichimoku) into `indicators_daily`.
  2. Generates **Technical Scanners**: `quicktrade`, `screener`, `operatorfootprint`, `swinger`, `monthly_swinger`, `breakout`, `trend_trading`, `reversal_trading`, `support_resistance`.
  3. Generates **Fundamental & Delivery Analysis**: Cash flow status, PAT trend evaluation, daily delivery analysis, and `delivery_spikes`.
  4. Generates **Derivative & Hybrid Summaries**: `fno_active`, `intraday_call`, `historical_calls`, `call_efficiency`, and `analysis_summaries`.

---

## Utility Commands

### Back Up Historical Calls Data
```bash
python3 -m engine.cli --mode backup
```
- Synchronizes `historical_calls` table into `historical_call_bkp` table and exports to `data/historical_call_bkp.csv`.

### Launch Portal Web Server (Automatic Frontend Build)
```bash
bash run.sh
```
- Automatically builds the frontend production bundle (`frontend/dist/`) and starts the FastAPI server on port 8000.
