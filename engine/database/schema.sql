-- Clean Master DDL Schema for PostgreSQL database (bsa_db)

-- 1. Configuration Tables
CREATE TABLE IF NOT EXISTS system_config (
    key         TEXT PRIMARY KEY,
    value       TEXT NOT NULL,
    updated_at  TIMESTAMP DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ticker_mappings (
    old_ticker  TEXT PRIMARY KEY,
    new_ticker  TEXT NOT NULL
);

-- 2. Core Master Tables
CREATE TABLE IF NOT EXISTS sectors (
    id          SERIAL PRIMARY KEY,
    name        TEXT NOT NULL UNIQUE,
    description TEXT,
    created_at  TIMESTAMP DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ticker_master (
    ticker             TEXT PRIMARY KEY,
    company_name       TEXT NOT NULL,
    is_fno             BOOLEAN DEFAULT FALSE,
    sector             TEXT,
    index_memberships  TEXT[] DEFAULT '{}',
    exchange           TEXT DEFAULT 'NSE',
    updated_at         TIMESTAMP DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ticker_sector (
    ticker    TEXT    NOT NULL REFERENCES ticker_master(ticker) ON DELETE CASCADE,
    sector_id INTEGER NOT NULL REFERENCES sectors(id) ON DELETE CASCADE,
    PRIMARY KEY (ticker, sector_id)
);

CREATE TABLE IF NOT EXISTS watchlist (
    id          SERIAL PRIMARY KEY,
    name        TEXT NOT NULL UNIQUE,
    description TEXT,
    created_at  TIMESTAMP DEFAULT now()
);

CREATE TABLE IF NOT EXISTS watchlist_items (
    watchlist_id INTEGER NOT NULL REFERENCES watchlist(id) ON DELETE CASCADE,
    ticker       TEXT    NOT NULL REFERENCES ticker_master(ticker) ON DELETE CASCADE,
    PRIMARY KEY (watchlist_id, ticker)
);

CREATE TABLE IF NOT EXISTS users (
    email        TEXT PRIMARY KEY,
    first_name   TEXT NOT NULL,
    last_name    TEXT NOT NULL,
    watchlist_id INTEGER REFERENCES watchlist(id) ON DELETE SET NULL,
    is_subscribed BOOLEAN DEFAULT FALSE,
    created_at   TIMESTAMP DEFAULT now()
);

CREATE TABLE IF NOT EXISTS alternative_names (
    id SERIAL PRIMARY KEY,
    data_ticker TEXT UNIQUE NOT NULL,
    current_ticker TEXT NOT NULL,
    company_name TEXT,
    notes TEXT,
    last_updated TEXT
);

CREATE TABLE IF NOT EXISTS excluded_tickers (
    id SERIAL PRIMARY KEY,
    ticker TEXT UNIQUE NOT NULL,
    reason TEXT,
    added_by TEXT DEFAULT 'MANUAL',
    status TEXT DEFAULT 'EXCLUDED',
    last_error TEXT,
    created_at TEXT
);

CREATE TABLE IF NOT EXISTS fno_stock_master (
    id SERIAL PRIMARY KEY,
    symbol TEXT UNIQUE NOT NULL,
    underlying_name TEXT NOT NULL,
    instrument_type TEXT DEFAULT 'STOCK',
    serial_number INTEGER,
    is_active BOOLEAN DEFAULT TRUE,
    entry_date TEXT DEFAULT CURRENT_DATE::text,
    exit_date TEXT,
    created_at TEXT DEFAULT NOW()::text
);

CREATE TABLE IF NOT EXISTS fno_index_master (
    id SERIAL PRIMARY KEY,
    symbol TEXT UNIQUE NOT NULL,
    underlying_name TEXT NOT NULL,
    instrument_type TEXT DEFAULT 'INDEX',
    serial_number INTEGER,
    is_active BOOLEAN DEFAULT TRUE,
    entry_date TEXT DEFAULT CURRENT_DATE::text,
    exit_date TEXT,
    created_at TEXT DEFAULT NOW()::text
);

-- 3. Market Data Tables
CREATE TABLE IF NOT EXISTS ohlcv_daily (
    ticker          TEXT NOT NULL,
    trade_date      TEXT NOT NULL,
    open            DOUBLE PRECISION,
    high            DOUBLE PRECISION,
    low             DOUBLE PRECISION,
    close           DOUBLE PRECISION,
    volume          BIGINT,
    vwap            DOUBLE PRECISION,
    downloaded_at   TEXT,
    PRIMARY KEY (ticker, trade_date)
);

CREATE TABLE IF NOT EXISTS indicators_daily (
    ticker          TEXT NOT NULL,
    trade_date      TEXT NOT NULL,
    rsi14           DOUBLE PRECISION,
    sma20           DOUBLE PRECISION,
    sma50           DOUBLE PRECISION,
    ema12           DOUBLE PRECISION,
    ema26           DOUBLE PRECISION,
    macd_line       DOUBLE PRECISION,
    macd_signal     DOUBLE PRECISION,
    macd_hist       DOUBLE PRECISION,
    bb_upper        DOUBLE PRECISION,
    bb_mid          DOUBLE PRECISION,
    bb_lower        DOUBLE PRECISION,
    atr14           DOUBLE PRECISION,
    tenkan_sen      DOUBLE PRECISION,
    kijun_sen       DOUBLE PRECISION,
    span_a          DOUBLE PRECISION,
    span_b          DOUBLE PRECISION,
    computed_at     TEXT,
    PRIMARY KEY (ticker, trade_date)
);

CREATE TABLE IF NOT EXISTS fundamentals (
    ticker              TEXT NOT NULL,
    fetched_date        TEXT NOT NULL,
    current_pe          DOUBLE PRECISION,
    avg_pe              DOUBLE PRECISION,
    last_pat            DOUBLE PRECISION,
    avg_pat             DOUBLE PRECISION,
    last_other_income   DOUBLE PRECISION,
    avg_other_income    DOUBLE PRECISION,
    debt_to_equity      DOUBLE PRECISION,
    is_pat_growing      INTEGER DEFAULT 0,
    is_other_income_ok  INTEGER DEFAULT 0,
    is_pe_ok            INTEGER DEFAULT 0,
    is_debt_equity_ok   INTEGER DEFAULT 0,
    fundamental_score   INTEGER DEFAULT 0,
    passed              INTEGER DEFAULT 0,
    details             TEXT,
    PRIMARY KEY (ticker, fetched_date)
);

-- 4. F&O Derivative Chain Tables
CREATE TABLE IF NOT EXISTS raw_fno_derivatives (
    ticker            TEXT NOT NULL,
    strike_price      DOUBLE PRECISION NOT NULL,
    option_type       TEXT NOT NULL,
    expiry_date       TEXT NOT NULL,
    volume            BIGINT,
    ltp               DOUBLE PRECISION,
    underlying_price  DOUBLE PRECISION,
    last_updated      TEXT NOT NULL,
    PRIMARY KEY (ticker, strike_price, option_type, expiry_date)
);

-- 5. Analysis and Projections Summary Table
CREATE TABLE IF NOT EXISTS analysis_summaries (
    ticker             TEXT PRIMARY KEY REFERENCES ticker_master(ticker) ON DELETE CASCADE,
    close              DOUBLE PRECISION,
    technical_score    DOUBLE PRECISION,
    fundamental_score  DOUBLE PRECISION,
    behavioral_score   DOUBLE PRECISION,
    hybrid_score       DOUBLE PRECISION,
    overall_signal     TEXT,
    confidence         DOUBLE PRECISION,
    reasons            TEXT,
    projection_22d     TEXT,
    option_insights    TEXT,
    news_footprint     TEXT,
    updated_at         TIMESTAMP DEFAULT now()
);

CREATE TABLE IF NOT EXISTS broker_recommendations (
    id SERIAL PRIMARY KEY,
    ticker TEXT NOT NULL,
    rec_date TEXT DEFAULT CURRENT_DATE::text,
    recommender TEXT NOT NULL,
    cmp DOUBLE PRECISION,
    stop_loss DOUBLE PRECISION,
    target DOUBLE PRECISION,
    time_period TEXT,
    description TEXT,
    created_at TIMESTAMP DEFAULT now()
);

CREATE TABLE IF NOT EXISTS historical_calls (
    id SERIAL PRIMARY KEY,
    uniqueid TEXT,
    ticker TEXT NOT NULL,
    recommended_call TEXT,
    confidence DOUBLE PRECISION,
    cmp DOUBLE PRECISION,
    entry_price DOUBLE PRECISION,
    stop_loss DOUBLE PRECISION,
    target_price DOUBLE PRECISION,
    rr_ratio TEXT DEFAULT '1:2.00',
    status TEXT DEFAULT 'OPEN',
    timestamp TEXT,
    created_at TIMESTAMP DEFAULT now(),
    review_date DATE DEFAULT CURRENT_DATE,
    closed_at TIMESTAMP,
    final_cmp DOUBLE PRECISION,
    latest_cmp DOUBLE PRECISION,
    call_status TEXT DEFAULT 'OPEN',
    outcome TEXT DEFAULT 'OPEN',
    min_cmp DOUBLE PRECISION,
    max_cmp DOUBLE PRECISION,
    closest TEXT,
    closest_info TEXT
);

CREATE TABLE IF NOT EXISTS historical_call_bkp (
    id SERIAL PRIMARY KEY,
    uniqueid TEXT,
    ticker TEXT NOT NULL,
    recommended_call TEXT,
    confidence DOUBLE PRECISION,
    cmp DOUBLE PRECISION,
    entry_price DOUBLE PRECISION,
    stop_loss DOUBLE PRECISION,
    target_price DOUBLE PRECISION,
    rr_ratio TEXT DEFAULT '1:2.00',
    status TEXT DEFAULT 'OPEN',
    timestamp TEXT,
    created_at TIMESTAMP DEFAULT now(),
    review_date DATE DEFAULT CURRENT_DATE,
    closed_at TIMESTAMP,
    final_cmp DOUBLE PRECISION,
    latest_cmp DOUBLE PRECISION,
    call_status TEXT DEFAULT 'OPEN',
    outcome TEXT DEFAULT 'OPEN',
    min_cmp DOUBLE PRECISION,
    max_cmp DOUBLE PRECISION,
    closest TEXT,
    closest_info TEXT,
    backed_up_at TIMESTAMP DEFAULT now()
);


CREATE TABLE IF NOT EXISTS call_efficiency (
    ticker TEXT PRIMARY KEY REFERENCES ticker_master(ticker) ON DELETE CASCADE,
    total_calls INT DEFAULT 0,
    passed INT DEFAULT 0,
    failed INT DEFAULT 0,
    partial_success INT DEFAULT 0,
    partial_fail INT DEFAULT 0,
    success_rate_pct DOUBLE PRECISION DEFAULT 0.0,
    last_updated TIMESTAMP DEFAULT now()
);

CREATE TABLE IF NOT EXISTS intraday_call (
    id SERIAL PRIMARY KEY,
    uniqueid TEXT,
    ticker TEXT NOT NULL,
    signal TEXT,
    bet TEXT,
    confidence DOUBLE PRECISION,
    entry_price DOUBLE PRECISION,
    stop_loss DOUBLE PRECISION,
    target_price DOUBLE PRECISION,
    cmp DOUBLE PRECISION,
    actionable_insight TEXT,
    fo_buildup TEXT,
    tech_reason TEXT,
    analysed_at TIMESTAMP DEFAULT now(),
    pcr TEXT,
    support DOUBLE PRECISION,
    resistance DOUBLE PRECISION
);

CREATE TABLE IF NOT EXISTS fno_active (
    rank INTEGER PRIMARY KEY,
    ticker TEXT NOT NULL,
    stock_name TEXT,
    most_active_strike DOUBLE PRECISION,
    option_type TEXT,
    expiry_date TEXT,
    volume BIGINT,
    open_interest BIGINT,
    change_in_oi BIGINT,
    ltp DOUBLE PRECISION,
    pchange DOUBLE PRECISION,
    active_score DOUBLE PRECISION,
    buildup_signal TEXT,
    last_updated TEXT
);

-- Indexes for Optimization
CREATE INDEX IF NOT EXISTS idx_ticker_sector_sector_id ON ticker_sector(sector_id);
CREATE INDEX IF NOT EXISTS idx_watchlist_items_watchlist_id ON watchlist_items(watchlist_id);
CREATE INDEX IF NOT EXISTS idx_users_watchlist_id ON users(watchlist_id);
CREATE INDEX IF NOT EXISTS idx_ohlcv_ticker_date ON ohlcv_daily(ticker, trade_date DESC);
CREATE INDEX IF NOT EXISTS idx_indicators_ticker_date ON indicators_daily(ticker, trade_date DESC);
CREATE INDEX IF NOT EXISTS idx_fno_ticker ON raw_fno_derivatives(ticker);
