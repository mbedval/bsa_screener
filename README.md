# Bindsol Stock Analysis (BSA) Screener

Consolidated framework and web dashboard for institutional-quality NSE stock screening, technical/fundamental analysis, options chain evaluation, and 22-day price forecasting.

---

## 1. Directory Structure

```
bsa_screener/
├── .env                     # Global database DSN configuration
├── seeding.sql              # Database setup and seeds (system configs, mappings)
├── requirements.txt         # Consolidated Python dependencies
├── run.sh                   # Linux/macOS startup script (binds to 0.0.0.0 for network access)
├── run.bat                  # Windows Batch startup script
├── run.cmd                  # Windows CMD startup script
├── engine/                  # Core trading logic and analytical framework
│   ├── cli.py               # Main CLI executor
│   ├── database/            # Database pool manager (connection.py)
│   ├── downloaders/         # Data pullers (market_data.py, derivatives.py)
│   ├── analysis/            # Score indicators, PCR, volume footprints, projections
│   ├── reports/             # HTML & PDF document generators
│   └── utils/               # Loggers and database-driven formatting helpers
├── backend/                 # FastAPI server (database connector & route handlers)
│   └── app/
│       ├── main.py          # FastAPI application server
│       ├── master.py        # Master lists CRUD (tickers, sectors, watchlists)
│       └── database.py      # FastAPI connection factory
└── frontend/                # Vite + React Dashboard UI
    ├── src/                 # React source code (main dashboard, CRUD lists)
    ├── package.json
    └── vite.config.js
```

---

## 2. Setup & Installation

### A. Database Initialization
Ensure PostgreSQL is running, then run `bsa_db_backup.sql` (the Golden Master Baseline) to initialize all master metadata tables (including `derivative_history`), system configuration settings, and mapping translations:

```bash
PGPASSWORD=jmbxdbpassword psql -h 192.168.1.18 -U jmbxdbuser -d bsa_db -f bsa_db_backup.sql
```

### B. Python Virtual Environment Setup
Initialize the unified Python virtual environment and install the required modules:

```bash
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
```

---

## 3. Command Line Interface (CLI) Usage

The engine CLI runs all background pipeline jobs and supports batch downloading, analysis, on-demand reviews, and report compiles.

### Batch Operations (Indian NSE Market — `bsa_db`)

The engine provides various execution modes covering different phases of downloading and analyzing market data. You can run them using the `--mode` flag:

**Full Pipeline Execution**
* `full-pipeline`: Runs the complete daily process sequentially (Download All -> Analyze All -> Backup).
* `spot-pipeline`: Runs strictly the spot market pipeline (downloads & analysis).
* `mf-pipeline`: Runs strictly the Mutual Fund and FII pipeline (downloads & analysis).

**Phase 1: Raw Data Ingestion**
* `download-all`: Triggers the full raw data ingestion pipeline (Spot + MF + F&O).
* `download-technicals`: Downloads historical price data and technical indicators.
* `download-fundamental`: Downloads fundamental financial data (PAT, PE, etc).
* `download-fno`: Downloads F&O derivatives option chains for F&O tickers and indices.
* `download-mf` (or `mutualfund`): Downloads Mutual Fund & FII institutional holdings.

**Phase 2: Data Analysis & Scoring**
* `analyze-all`: Execute all analysis, scoring, and multi-factor synthesis.
* `analyze-technical`: Run technical analysis and scanners (HHHL, Cup & Handle, Retracements).
* `analyze-fundamental`: Run fundamental analysis (PAT Growth, PE, Debt/Equity).
* `analyze-fo`: Run F&O Derivative Options Analysis (PCR, Max Pain, Active Buildup).
* `analyze-patterns`: Scan candlestick chart patterns & respecting patterns analysis.
* `analyze-mf`: Run Mutual Fund & FII Institutional Behavior Analysis.
* `analyze-elliot`: Run Elliot Wave W3/W5 Momentum Analysis.
* `analyze-sector`: Run Sectorwise Lead-Follow Relationship Groups Analysis.
* `analyze-summaries`: Run Multi-Factor Hybrid Synthesis, Historical Calls & Efficiency Tracking.

**Maintenance & Utility Modes**
* `backup`: Backups generated historical calls from `historical_calls` table into `historical_call_bkp`.
* `news-analyze`: Runs news sentiment analysis for a selected ticker (requires `--ticker`).

Example usage:
```bash
.venv/bin/python3 -m engine.cli --mode full-pipeline
```

### Single Ticker On-Demand Operation (NSE Market)
* **Download and analyze a single stock (e.g. INFY) with HTML report**:
  ```bash
  .venv/bin/python3 -m engine.cli --ticker INFY
  ```
* **Add `--pdf` to explicitly opt-in to PDF report generation**:
  ```bash
  .venv/bin/python3 -m engine.cli --report INFY --pdf
  ```

---

## 4. Automation & Background Data Sync

To keep the market data, technical indicators, and F&O option chains updated throughout the active trading session, the application provides an automated cronjob configuration script. 

### Configuring the Cronjobs
To install or update the automated background tasks, simply run the provided bash script:
```bash
./configure_cronjob.sh
```

### Default Automation Schedule (Monday to Friday)
Once configured, the following processes run automatically in the background during market hours:
1. **Spot Market & Technical Data (`download-technicals`)**: Synchronizes end-of-day data, intraday bars, and calculates foundational metrics every 15 minutes between `09:15` and `15:00`.
2. **Derivatives & Option Chains (`download-fno`)**: Downloads live options chain, strike prices, implied volatility (IV), and open interest (OI) for all F&O stocks and indices **every 2 minutes** between `09:16` and `15:30`.

The logs for these automated tasks are safely stored in the `logs/` directory for monitoring (`logs/cron_nse.log` and `logs/cron_fno.log`).

---

## 5. Web Application Setup

The web application consists of a FastAPI backend (which serves the compiled React UI statically) and APIs accessible across your local network.

### A. Compile Frontend Production Assets
Compile the React frontend so it can be served statically by the backend:

```bash
npm --prefix frontend install
npm --prefix frontend run build
```
This generates the static distribution folder inside `frontend/dist`.

### B. Start the Web App Portal
Execute the startup script from the project root folder:

* **On Linux / macOS**:
  ```bash
  ./run.sh
  ```
* **On Windows (Command Prompt / PowerShell)**:
  ```cmd
  run.bat
  ```
  or
  ```cmd
  run.cmd
  ```

The server binds to `0.0.0.0:8000`, allowing access from local or remote machines on the network. Open your browser and navigate to:
* **Local Machine**: [http://127.0.0.1:8000](http://127.0.0.1:8000) or [http://localhost:8000](http://localhost:8000)
* **Remote Machine in Network**: `http://<HOST_IP_ADDRESS>:8000` (e.g., `http://192.168.1.18:8000`)
* **API Interactive Docs**: `http://<HOST_IP_ADDRESS>:8000/docs`

### C. Active Route Endpoints
- `/api/analysis/trigger?ticker=INFY` (`POST`): Triggers real-time live downloading and scoring for the stock.
- `/api/reports/pdf/{ticker}` (`GET`): Downloads the generated PDF report.
- `/api/master/` (`GET`/`POST`/`PUT`/`DELETE`): Full CRUD capabilities on sectors, watchlist mappings, and master ticker registry.