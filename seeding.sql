-- Clean Master Seeding Script for PostgreSQL database (bsa_db)

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

CREATE TABLE IF NOT EXISTS fno_master (
    id SERIAL PRIMARY KEY,
    symbol TEXT UNIQUE NOT NULL,
    underlying_name TEXT NOT NULL,
    instrument_type TEXT NOT NULL,
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

-- 6. Historical Calls, Call Efficiency, and Intraday Calls Tables
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

-- Seed Initial System Configuration
INSERT INTO system_config (key, value) VALUES
('telegram_bot_token', ''),
('telegram_chat_id', ''),
('gmail_user', ''),
('gmail_app_password', '')
ON CONFLICT (key) DO NOTHING;

-- Seed Ticker History Mappings
INSERT INTO ticker_mappings (old_ticker, new_ticker) VALUES
('BATA', 'BATAINDIA'),
('BERGERPAINTS', 'BERGEPAINT'),
('BLUESTARLT', 'BLUESTARCO'),
('DATAPATNS', 'DATAPATTNS'),
('LTIM', 'LTM'),
('NALCO', 'NATIONALUM'),
('NATCOPHARMA', 'NATCOPHARM'),
('PVR', 'PVRINOX'),
('TATAMOTORS', 'TMCV'),
('TIPS', 'TIPSMUSIC'),
('TV18BRDCST', 'NETWORK18'),
('ZOMATO', 'ETERNAL')
ON CONFLICT (old_ticker) DO NOTHING;

-- Seed Alternative Names
INSERT INTO alternative_names (id, data_ticker, current_ticker, company_name, notes, last_updated) VALUES
(1, 'ZOMATO', 'ETERNAL', 'Eternal Ltd (formerly Zomato Ltd)', 'Company rebranded to Eternal Ltd; raw download ticker is ZOMATO', CURRENT_TIMESTAMP::text),
(2, 'MOTHERSUMI', 'MOTHERSON', 'Samvardhana Motherson International Ltd', 'Name updated post-demerger restructuring', CURRENT_TIMESTAMP::text),
(3, 'CADILAHC', 'ZYDUSLIFE', 'Zydus Lifesciences Ltd', 'Rebranded from Cadila Healthcare Ltd', CURRENT_TIMESTAMP::text),
(4, 'LTI', 'LTIM', 'LTIMindtree Ltd', 'Merged entity of LTI and Mindtree Ltd', CURRENT_TIMESTAMP::text)
ON CONFLICT (id) DO NOTHING;

-- Seed Excluded Tickers
INSERT INTO excluded_tickers (id, ticker, reason, added_by, status, last_error, created_at) VALUES
(1, 'ABAN', 'Download error: Stock suspended / delisted from exchange', 'SYSTEM_AUTO', 'EXCLUDED', 'yfinance download error 404: No data found for ABAN.NS', CURRENT_TIMESTAMP::text),
(2, 'DEWAN', 'Delisted stock insolvency proceedings', 'SYSTEM_AUTO', 'EXCLUDED', 'yfinance download error 404: Symbol not found', CURRENT_TIMESTAMP::text),
(3, 'SREINFRA', 'Trading halted / insolvency status', 'MANUAL', 'EXCLUDED', 'Manual exclusion: insolvency resolution', CURRENT_TIMESTAMP::text)
ON CONFLICT (id) DO NOTHING;

-- Seed Master Sectors
INSERT INTO sectors (id, name, description) VALUES
(1, 'Information Technology', 'IT Services, Software Development and Digital Solutions'),
(2, 'Banking & Financials', 'Public/Private Sector Banks, NBFCs and Asset Management'),
(3, 'Automobiles', 'Passenger Vehicles, Commercial Vehicles and Auto Components'),
(4, 'Energy', 'Oil & Gas Exploration, Refining, Power Generation and Utilities'),
(5, 'Healthcare', 'Pharmaceuticals, Biotechnology and Hospital Chains'),
(6, 'FMCG', 'Fast Moving Consumer Goods and Retail Products'),
(7, 'Metal & Mining', 'Ferrous, Non-Ferrous Metals and Mining Operations'),
(8, 'Real Estate', 'Commercial and Residential Property Developers'),
(9, 'Telecommunications', 'Telecom Operators and Communication Infrastructure'),
(10, 'Capital Goods', 'Heavy Electrical, Engineering and Industrial Equipment'),
(11, 'Media & Entertainment', 'Broadcasting, Digital Media and Entertainment Services'),
(12, 'Consumer Durables', 'Home Appliances, Electronics and Lifestyle Products'),
(13, 'Chemical', 'Specialty Chemicals, Agrochemicals and Petrochemicals'),
(14, 'Defense', 'Defense Equipment Manufacturing and Aerospace Electronics'),
(15, 'Shipping & Logistics', 'Port Operators, Logistics and Supply Chain Services'),
(16, 'Infrastructure', 'Construction, Highways and Infrastructure Development'),
(17, 'Services', 'Commercial Services, E-Commerce and Hospitality'),
(18, 'Miscellaneous', 'Diversified Conglomerates and Other Sectors')
ON CONFLICT (id) DO NOTHING;

-- Seed Sample Master Tickers (clean baseline)
INSERT INTO ticker_master (ticker, company_name, is_fno, sector, index_memberships, exchange) VALUES
('RELIANCE', 'Reliance Industries Limited', true, 'Energy', ARRAY['NIFTY', 'NIFTY50'], 'NSE'),
('TCS', 'Tata Consultancy Services Limited', true, 'Information Technology', ARRAY['NIFTY', 'NIFTY50'], 'NSE'),
('WIPRO', 'Wipro Limited', true, 'Information Technology', ARRAY['NIFTY', 'NIFTY50'], 'NSE')
ON CONFLICT (ticker) DO NOTHING;

-- Map Sample Tickers to Sectors
INSERT INTO ticker_sector (ticker, sector_id) VALUES
('RELIANCE', 4),
('TCS', 1),
('WIPRO', 1)
ON CONFLICT (ticker, sector_id) DO NOTHING;

-- Seed Baseline FNO Master Entries (Key Indices & Sample Tickers)
INSERT INTO fno_master (id, symbol, underlying_name, instrument_type, serial_number, is_active, entry_date, created_at) VALUES
(1, 'NIFTY', 'Nifty 50', 'INDEX', 1, true, CURRENT_DATE::text, NOW()::text),
(2, 'BANKNIFTY', 'Nifty BANK', 'INDEX', 2, true, CURRENT_DATE::text, NOW()::text),
(3, 'FINNIFTY', 'Nifty FINANCIAL SERVICES', 'INDEX', 3, true, CURRENT_DATE::text, NOW()::text),
(4, 'RELIANCE', 'Reliance Industries Limited', 'STOCK', 4, true, CURRENT_DATE::text, NOW()::text),
(5, 'TCS', 'Tata Consultancy Services Limited', 'STOCK', 5, true, CURRENT_DATE::text, NOW()::text),
(6, 'WIPRO', 'Wipro Limited', 'STOCK', 6, true, CURRENT_DATE::text, NOW()::text)
ON CONFLICT (id) DO NOTHING;

-- Seed Sample Watchlist
INSERT INTO watchlist (id, name, description) VALUES
(1, 'Default Watchlist', 'Primary sample watchlist for active screening')
ON CONFLICT (id) DO NOTHING;

INSERT INTO watchlist_items (watchlist_id, ticker) VALUES
(1, 'RELIANCE'),
(1, 'TCS'),
(1, 'WIPRO')
ON CONFLICT (watchlist_id, ticker) DO NOTHING;

-- Seed Sample User
INSERT INTO users (email, first_name, last_name, watchlist_id, is_subscribed) VALUES
('admin@example.com', 'Admin', 'User', 1, true)
ON CONFLICT (email) DO NOTHING;

-- Reset Sequences for Clean Incrementing
SELECT pg_catalog.setval('sectors_id_seq', (SELECT MAX(id) FROM sectors), true);
SELECT pg_catalog.setval('watchlist_id_seq', (SELECT MAX(id) FROM watchlist), true);
SELECT pg_catalog.setval('fno_master_id_seq', (SELECT MAX(id) FROM fno_master), true);
SELECT pg_catalog.setval('alternative_names_id_seq', (SELECT MAX(id) FROM alternative_names), true);
SELECT pg_catalog.setval('excluded_tickers_id_seq', (SELECT MAX(id) FROM excluded_tickers), true);
