-- Seeding script for US Market PostgreSQL database (bsa_db_us)

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
    exchange           TEXT DEFAULT 'NASDAQ',
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

-- 4. Options Chain Tables
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

-- 5. Analysis Summaries
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

-- Indexes
CREATE INDEX IF NOT EXISTS idx_us_ticker_sector_sector_id ON ticker_sector(sector_id);
CREATE INDEX IF NOT EXISTS idx_us_ohlcv_ticker_date ON ohlcv_daily(ticker, trade_date DESC);
CREATE INDEX IF NOT EXISTS idx_us_indicators_ticker_date ON indicators_daily(ticker, trade_date DESC);

-- Seed US Sectors
INSERT INTO sectors (id, name, description) VALUES
(1, 'US Technology', 'Top US tech mega-caps, semiconductors, and cloud giants'),
(2, 'US Financials', 'Major US banks, payment networks, and investment firms'),
(3, 'US Healthcare', 'Pharma, biotech, and healthcare insurance leaders'),
(4, 'US Energy', 'Oil & gas majors and renewable energy producers'),
(5, 'US Consumer & Retail', 'Retail, e-commerce, and automotive leaders'),
(6, 'US Market Indices', 'Primary US market benchmark ETFs (SPY, QQQ, DIA, IWM)')
ON CONFLICT (name) DO NOTHING;

-- Seed US Tickers
INSERT INTO ticker_master (ticker, company_name, is_fno, sector, index_memberships, exchange) VALUES
('AAPL', 'Apple Inc.', TRUE, 'Technology', '{"S&P 500", "Nasdaq 100"}', 'NASDAQ'),
('MSFT', 'Microsoft Corporation', TRUE, 'Technology', '{"S&P 500", "Nasdaq 100"}', 'NASDAQ'),
('NVDA', 'NVIDIA Corporation', TRUE, 'Technology', '{"S&P 500", "Nasdaq 100"}', 'NASDAQ'),
('GOOGL', 'Alphabet Inc.', TRUE, 'Technology', '{"S&P 500", "Nasdaq 100"}', 'NASDAQ'),
('AMZN', 'Amazon.com Inc.', TRUE, 'Consumer', '{"S&P 500", "Nasdaq 100"}', 'NASDAQ'),
('META', 'Meta Platforms Inc.', TRUE, 'Technology', '{"S&P 500", "Nasdaq 100"}', 'NASDAQ'),
('TSLA', 'Tesla Inc.', TRUE, 'Automotive', '{"S&P 500", "Nasdaq 100"}', 'NASDAQ'),
('AMD', 'Advanced Micro Devices Inc.', TRUE, 'Semiconductors', '{"S&P 500", "Nasdaq 100"}', 'NASDAQ'),
('INTC', 'Intel Corporation', TRUE, 'Semiconductors', '{"S&P 500", "Nasdaq 100"}', 'NASDAQ'),
('JPM', 'JPMorgan Chase & Co.', TRUE, 'Financials', '{"S&P 500", "Dow Jones"}', 'NYSE'),
('BAC', 'Bank of America Corp.', TRUE, 'Financials', '{"S&P 500"}', 'NYSE'),
('GS', 'The Goldman Sachs Group Inc.', TRUE, 'Financials', '{"S&P 500", "Dow Jones"}', 'NYSE'),
('V', 'Visa Inc.', TRUE, 'Financials', '{"S&P 500", "Dow Jones"}', 'NYSE'),
('MA', 'Mastercard Incorporated', TRUE, 'Financials', '{"S&P 500"}', 'NYSE'),
('JNJ', 'Johnson & Johnson', TRUE, 'Healthcare', '{"S&P 500", "Dow Jones"}', 'NYSE'),
('PFE', 'Pfizer Inc.', TRUE, 'Healthcare', '{"S&P 500"}', 'NYSE'),
('UNH', 'UnitedHealth Group Inc.', TRUE, 'Healthcare', '{"S&P 500", "Dow Jones"}', 'NYSE'),
('XOM', 'Exxon Mobil Corporation', TRUE, 'Energy', '{"S&P 500"}', 'NYSE'),
('CVX', 'Chevron Corporation', TRUE, 'Energy', '{"S&P 500", "Dow Jones"}', 'NYSE'),
('SPY', 'SPDR S&P 500 ETF Trust', TRUE, 'Indices', '{"S&P 500"}', 'NYSE'),
('QQQ', 'Invesco QQQ Trust', TRUE, 'Indices', '{"Nasdaq 100"}', 'NASDAQ'),
('DIA', 'SPDR Dow Jones Industrial Average ETF', TRUE, 'Indices', '{"Dow Jones"}', 'NYSE')
ON CONFLICT (ticker) DO NOTHING;

-- Seed Ticker Sector Mappings
INSERT INTO ticker_sector (ticker, sector_id) VALUES
('AAPL', 1), ('MSFT', 1), ('NVDA', 1), ('GOOGL', 1), ('META', 1), ('AMD', 1), ('INTC', 1),
('JPM', 2), ('BAC', 2), ('GS', 2), ('V', 2), ('MA', 2),
('JNJ', 3), ('PFE', 3), ('UNH', 3),
('XOM', 4), ('CVX', 4),
('AMZN', 5), ('TSLA', 5),
('SPY', 6), ('QQQ', 6), ('DIA', 6)
ON CONFLICT (ticker, sector_id) DO NOTHING;

-- Set Sequence values
SELECT pg_catalog.setval('public.sectors_id_seq', (SELECT MAX(id) FROM public.sectors), true);
