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
  .venv/bin/python3 -m engine.cli --report INFY --pdf
  ```

---

## 4. Web Application Setup

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