# BSA Screener - Mandatory Rules for Data Management & Data Analysis

To maintain strict data integrity, zero contamination, and explicit control flow, the application follows mandatory rules for **Data Management** and **Data Analysis**. No calculations, indicators, technical scanner reports, or fundamental analysis outputs are generated prematurely.

---

## 1. Data Management Rules (Phase 0 & Phase 1)

### Rule 1.1: Phase 0 - Golden Master Setup Baseline
- **Goal**: Initialize clean database structure & master setup metadata only.
- **Master Tables Allowed**: `ticker_master`, `fno_stock_master`, `fno_index_master`, `sectors`, `ticker_sector`, `watchlist`, `watchlist_items`, `users`, `alternative_names`, `excluded_tickers`, `system_config`, `ticker_mappings`, `opportunities_risk`, `derivative_history`.
- **Database Dump Contract**: `dump_database.py` MUST ONLY dump records from the above master setup tables.
- **Strict Prohibition**:
  - **NO MARKET PRICE DATA** (0 rows in `ohlcv_daily`).
  - **NO FUNDAMENTAL DOWNLOADS** (0 rows in `fundamentals`, `raw_fundamentals`).
  - **NO OPTION CHAINS** (0 rows in `raw_fno_derivatives`).
  - **NO SCANNERS OR ANALYSIS** (0 rows in `quicktrade`, `screener`, `operatorfootprint`, `delivery_spikes`, `breakout`, `trend_trading`, `reversal_trading`, `support_resistance`, `fno_active`, `analysis_summaries`, `intraday_call`, `historical_calls`, `broker_recommendations`).
  - All scanner & report UI views MUST remain blank with a helpful pending notice.

### Rule 1.2: Phase 1 - Raw Data Ingestion Only (No Calculation & No Analysis)
- **Goal**: Fetch raw market data from external sources and store strictly in raw/master database tables.
- **Sub-Phase 1.1a (`python3 -m engine.cli --mode download-technicals`)**:
  - Downloads raw daily price history (open, high, low, close, volume) into `ohlcv_daily`.
  - Downloads daily raw delivery metrics into `delivery_history`.
- **Sub-Phase 1.1b (`python3 -m engine.cli --mode download-fundamental`)**:
  - Downloads raw quarterly fundamental metrics (PAT, cash flow, PE ratio, Debt/Equity) into `fundamentals` mapped to `ticker_master`.
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

---

## 3. UI Navigation Rules

### Rule 3.1: Ticker Click Navigation
- **Rule**: Clicking on any ticker symbol in list/report/monitor pages (e.g., Watchlist Monitor, Sectorwise Followers, Retracement Pattern, Sector-wise Board) MUST navigate to the **Lookup Ticker Master Data** page (`research:search_detail`), NOT a separate or alternative ticker profile page.
- **Implementation**: Use `handleLookupTickerSelect(ticker)` in `main.jsx`, which sets `selectedProfileTicker`, increments `searchCounter`, and sets `active = 'research:search_detail'`.
- **Prohibition**: Do NOT route ticker clicks from report/monitor pages to `research:ticker_profile` or any other page unless explicitly requested by the user.

### Rule 3.2: Master Data Table CSV Upload & Download Requirement
- **Rule**: Whenever any master data table page (e.g., Ticker Master, Sectors, Indices Master) includes a feature/button to upload CSV files, it MUST also provide a corresponding **Download CSV** feature and button on the page.
- **Behavior**: Clicking **Download CSV** generates and downloads a `.csv` file containing the table's records formatted with standard column headers for easy data export and backups.

---

## 4. Blank Page / React Crash Debugging Protocol

### Rule 4.1: MANDATORY First-Pass Checklist for Any Blank Page or React Error #130
When ANY page in this app renders a blank/white screen or the browser console shows:
- `Minified React error #130` ("Objects are not valid as a React child")
- `Uncaught Error: Objects are not valid as a React child`
- Any React crash that blanks the whole page on navigation

**IMMEDIATELY apply this checklist in order — do NOT guess or make ad-hoc fixes:**

#### Step 1 — Check `useToast` / `ToastContainer` usage (Most Common Root Cause)
- `useToast()` in `frontend/src/master/ui.jsx` returns `ToastContainer` as a **pre-rendered JSX element object** (NOT a React component function).
- **WRONG** (causes React Error #130): `<ToastContainer />`  ← React tries to call the object as a function
- **CORRECT**: `{ToastContainer}`  ← renders the pre-existing element directly
- **Fix**: In the broken page component, find `<ToastContainer />` and replace with `{ToastContainer}`.
- **Verify pattern**: All working pages (SectorsPage, TickersPage, WatchlistsPage, etc.) use `{ToastContainer}`. Any new or recently added page that deviates is the likely culprit.

#### Step 2 — Check Component vs. Value Confusion
- Look for any hook that returns a **JSX element or plain object** (not a function) that is then used as a JSX tag (`<SomeName />`).
- Pattern: `const { X } = useSomeHook()` where `X` is already a rendered element → must be used as `{X}`, not `<X />`.

#### Step 3 — Check Imports
- Ensure the page file is properly exported from `frontend/src/master/index.jsx`.
- Ensure the page is imported correctly in `frontend/src/main.jsx`.
- Ensure `MASTER_PAGES` array in `main.jsx` includes the new page's active key (e.g. `'master:reference_pages'`).
- Ensure the sidebar nav button `setActive(...)` and `MasterSubmodule` `switch/case` in `index.jsx` both match.

#### Step 4 — Check Backend API
- Run: `python3 -c "import urllib.request; print(urllib.request.urlopen('http://127.0.0.1:8000/api/master/<route>').read())"` to confirm the API endpoint exists and returns valid JSON.
- If endpoint is missing, add the route to `backend/app/master.py` and ensure the DB table exists.

### Rule 4.2: Root Cause Documentation
After fixing a blank page bug, always state **which step** in the checklist caught the issue so the pattern can be refined further over time.
