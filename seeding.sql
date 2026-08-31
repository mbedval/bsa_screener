-- Seeding script for PostgreSQL database (bsa_db)

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
    created_at   TIMESTAMP DEFAULT now()
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

CREATE TABLE IF NOT EXISTS stock_meta (
    ticker          TEXT PRIMARY KEY,
    company_name    TEXT,
    sector          TEXT,
    exchange        TEXT,
    updated_at      TEXT
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
    projection_22d     TEXT, -- JSON string of 22 projected daily close prices
    option_insights    TEXT, -- JSON string with ATM, Active call, Active put, PCR, buildup
    news_footprint     TEXT, -- Sentiment, operator footprint insights
    updated_at         TIMESTAMP DEFAULT now()
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
('telegram_bot_token', '8055414904:AAH_KS-Z3_s57sZQCdB49ZNHpO4hEk5BA1M'),
('telegram_chat_id', '8408808999'),
('gmail_user', 'jind9189@gmail.com'),
('gmail_app_password', 'ykoz xvdt jftf vwsa')
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
