# Bindsol Stock Analysis (BSA) Screener

Consolidated framework and web dashboard for institutional-quality NSE stock screening, technical/fundamental analysis, options chain evaluation, and 22-day price forecasting.

---

## 1. Directory Structure

```
bsa_screener/
├── .env                     # Global database DSN configuration
├── seeding.sql              # Database setup and seeds (system configs, mappings)
├── requirements.txt         # Consolidated Python dependencies
├── engine/                  # Core trading logic and analytical framework
│   ├── cli.py               # Main CLI executor
│   ├── database/            # Database pool manager (connection.py)
│   ├── downloaders/         # Data pullers (market_data.py, derivatives.py)
│   ├── analysis/            # Score indicators, PCR, volume footprints, projections
│   ├── reports/             # HTML & PDF document generators
│   └── utils/               # Loggers and database-driven formatting helpers
├── backend/                 # FastAPI server (database connector & route handlers)
│   ├── run.sh               # Backend startup script
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
Ensure PostgreSQL is running, then run `seeding.sql` to initialize all master tables, market data tables, options chains, system configuration settings, and mapping translations:

```bash
PGPASSWORD=jmbxdbpassword psql -h 192.168.1.18 -U jmbxdbuser -d bsa_db -f seeding.sql
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
* **Download historical data & fundamentals for all master tickers**:
  ```bash
  .venv/bin/python3 -m engine.cli --mode download-all
  ```
* **Download F&O derivatives option chains for F&O tickers and indices**:
  ```bash
  .venv/bin/python3 -m engine.cli --mode download-fno
  ```
* **Execute analysis & scoring for all master tickers**:
  ```bash
  .venv/bin/python3 -m engine.cli --mode analyze-all
  ```

### Single Ticker On-Demand Operation (NSE Market)
* **Download and analyze a single stock (e.g. INFY) with HTML report**:
  ```bash
  .venv/bin/python3 -m engine.cli --ticker INFY
  ```
* **Add `--pdf` to explicitly opt-in to PDF report generation**:
  ```bash
  .venv/bin/python3 -m engine.cli --ticker INFY --pdf
  ```

### Generate Report On-Demand
* **Compile reports for a ticker that has already been analyzed**:
  ```bash
  .venv/bin/python3 -m engine.cli --report INFY --pdf
  ```
  Generated reports will be saved at:
  - HTML: `output/htmls/INFY_report.html`
  - PDF: `output/pdf/INFY_report.pdf`

---

## 4. Web Application Setup

The web application consists of a FastAPI backend (which also serves the static compiled frontend files) and a React frontend.

### A. Compile Frontend Production Assets
Compile the React frontend so it can be served statically by the backend:

```bash
npm --prefix frontend install
npm --prefix frontend run build
```
This generates the static distribution folder inside `frontend/dist`.

### B. Start the Web App Backend Connector
Execute the startup script to launch the FastAPI server:

```bash
./backend/run.sh
```

The application is now running. Open your browser and navigate to:
* **Web UI Dashboard**: [http://127.0.0.1:8000](http://127.0.0.1:8000)
* **API Interactive Docs**: [http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs)

### C. Active Route Endpoints
- `/api/analysis/trigger?ticker=INFY` (`POST`): Triggers real-time live downloading and scoring for the stock.
- `/api/reports/pdf/{ticker}` (`GET`): Downloads the generated PDF report.
- `/api/master/` (`GET`/`POST`/`PUT`/`DELETE`): Full CRUD capabilities on sectors, watchlist mappings, and master ticker registry.