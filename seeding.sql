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
    entry_date TEXT,
    exit_date TEXT,
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
--
-- PostgreSQL database dump
--

\restrict vWiPcON1dCJo7gvzD3HuAx5f3MR7YecJQsnNjpVDcta52ufrsWZaesIgib40drS

-- Dumped from database version 16.15 (Ubuntu 16.15-0ubuntu0.24.04.1)
-- Dumped by pg_dump version 16.15 (Ubuntu 16.15-0ubuntu0.24.04.1)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Data for Name: alternative_names; Type: TABLE DATA; Schema: public; Owner: jmbxdbuser
--

INSERT INTO public.alternative_names VALUES (1, 'ZOMATO', 'ETERNAL', 'Eternal Ltd (formerly Zomato Ltd)', 'Company rebranded to Eternal Ltd; raw download ticker is ZOMATO', '2026-08-30 22:12:55');
INSERT INTO public.alternative_names VALUES (2, 'MOTHERSUMI', 'MOTHERSON', 'Samvardhana Motherson International Ltd', 'Name updated post-demerger restructuring', '2026-08-30 22:12:55');
INSERT INTO public.alternative_names VALUES (3, 'CADILAHC', 'ZYDUSLIFE', 'Zydus Lifesciences Ltd', 'Rebranded from Cadila Healthcare Ltd', '2026-08-30 22:12:55');
INSERT INTO public.alternative_names VALUES (4, 'LTI', 'LTIM', 'LTIMindtree Ltd', 'Merged entity of LTI and Mindtree Ltd', '2026-08-30 22:12:55');


--
-- Data for Name: excluded_tickers; Type: TABLE DATA; Schema: public; Owner: jmbxdbuser
--

INSERT INTO public.excluded_tickers VALUES (1, 'ABAN', 'Download error: Stock suspended / delisted from exchange', 'SYSTEM_AUTO', 'EXCLUDED', 'yfinance download error 404: No data found for ABAN.NS', '2026-08-30 22:12:55');
INSERT INTO public.excluded_tickers VALUES (2, 'DEWAN', 'Delisted stock insolvency proceedings', 'SYSTEM_AUTO', 'EXCLUDED', 'yfinance download error 404: Symbol not found', '2026-08-30 22:12:55');
INSERT INTO public.excluded_tickers VALUES (3, 'SREINFRA', 'Trading halted / insolvency status', 'MANUAL', 'EXCLUDED', 'Manual exclusion: insolvency resolution', '2026-08-30 22:12:55');


--
-- Data for Name: fno_master; Type: TABLE DATA; Schema: public; Owner: jmbxdbuser
--

INSERT INTO public.fno_master VALUES (1, 'NIFTY', 'Nifty 50', 'INDEX', 1, true, '2026-08-31', NULL, '2026-08-31T08:16:56.364844');
INSERT INTO public.fno_master VALUES (2, 'BANKNIFTY', 'Nifty BANK', 'INDEX', 2, true, '2026-08-31', NULL, '2026-08-31T08:16:56.364844');
INSERT INTO public.fno_master VALUES (3, 'FINNIFTY', 'Nifty FINANCIAL SERVICES', 'INDEX', 3, true, '2026-08-31', NULL, '2026-08-31T08:16:56.364844');
INSERT INTO public.fno_master VALUES (4, 'NIFTYFPI', 'Nifty FPI 150', 'INDEX', 4, true, '2026-08-31', NULL, '2026-08-31T08:16:56.364844');
INSERT INTO public.fno_master VALUES (5, 'MIDCPNIFTY', 'Nifty MIDCAP SELECT', 'INDEX', 5, true, '2026-08-31', NULL, '2026-08-31T08:16:56.364844');
INSERT INTO public.fno_master VALUES (6, 'NIFTYNXT50', 'Nifty NEXT 50', 'INDEX', 6, true, '2026-08-31', NULL, '2026-08-31T08:16:56.364844');
INSERT INTO public.fno_master VALUES (7, '360ONE', '360 ONE WAM LIMITED', 'STOCK', 1, true, '2026-08-31', NULL, '2026-08-31T08:16:56.364844');
INSERT INTO public.fno_master VALUES (8, 'ABB', 'ABB India Limited', 'STOCK', 2, true, '2026-08-31', NULL, '2026-08-31T08:16:56.364844');
INSERT INTO public.fno_master VALUES (9, 'APLAPOLLO', 'APL Apollo Tubes Limited', 'STOCK', 3, true, '2026-08-31', NULL, '2026-08-31T08:16:56.364844');
INSERT INTO public.fno_master VALUES (10, 'AUBANK', 'AU Small Finance Bank Limited', 'STOCK', 4, true, '2026-08-31', NULL, '2026-08-31T08:16:56.364844');
INSERT INTO public.fno_master VALUES (11, 'ADANIENSOL', 'Adani Energy Solutions Limited', 'STOCK', 5, true, '2026-08-31', NULL, '2026-08-31T08:16:56.364844');
INSERT INTO public.fno_master VALUES (12, 'ADANIENT', 'Adani Enterprises Limited', 'STOCK', 6, true, '2026-08-31', NULL, '2026-08-31T08:16:56.364844');
INSERT INTO public.fno_master VALUES (13, 'ADANIGREEN', 'Adani Green Energy Limited', 'STOCK', 7, true, '2026-08-31', NULL, '2026-08-31T08:16:56.364844');
INSERT INTO public.fno_master VALUES (14, 'ADANIPORTS', 'Adani Ports and Special Economic Zone Limited', 'STOCK', 8, true, '2026-08-31', NULL, '2026-08-31T08:16:56.364844');
INSERT INTO public.fno_master VALUES (15, 'ADANIPOWER', 'Adani Power Limited', 'STOCK', 9, true, '2026-08-31', NULL, '2026-08-31T08:16:56.364844');
INSERT INTO public.fno_master VALUES (16, 'ABCAPITAL', 'Aditya Birla Capital Limited', 'STOCK', 10, true, '2026-08-31', NULL, '2026-08-31T08:16:56.364844');
INSERT INTO public.fno_master VALUES (17, 'ALKEM', 'Alkem Laboratories Limited', 'STOCK', 11, true, '2026-08-31', NULL, '2026-08-31T08:16:56.364844');
INSERT INTO public.fno_master VALUES (18, 'AMBER', 'Amber Enterprises India Limited', 'STOCK', 12, true, '2026-08-31', NULL, '2026-08-31T08:16:56.364844');
INSERT INTO public.fno_master VALUES (19, 'AMBUJACEM', 'Ambuja Cements Limited', 'STOCK', 13, true, '2026-08-31', NULL, '2026-08-31T08:16:56.364844');
INSERT INTO public.fno_master VALUES (20, 'ANGELONE', 'Angel One Limited', 'STOCK', 14, true, '2026-08-31', NULL, '2026-08-31T08:16:56.364844');
INSERT INTO public.fno_master VALUES (21, 'APOLLOHOSP', 'Apollo Hospitals Enterprise Limited', 'STOCK', 15, true, '2026-08-31', NULL, '2026-08-31T08:16:56.364844');
INSERT INTO public.fno_master VALUES (22, 'ASHOKLEY', 'Ashok Leyland Limited', 'STOCK', 16, true, '2026-08-31', NULL, '2026-08-31T08:16:56.364844');
INSERT INTO public.fno_master VALUES (23, 'ASIANPAINT', 'Asian Paints Limited', 'STOCK', 17, true, '2026-08-31', NULL, '2026-08-31T08:16:56.364844');
INSERT INTO public.fno_master VALUES (24, 'ASTRAL', 'Astral Limited', 'STOCK', 18, true, '2026-08-31', NULL, '2026-08-31T08:16:56.364844');
INSERT INTO public.fno_master VALUES (25, 'ATHERENERG', 'Ather Energy Limited', 'STOCK', 19, true, '2026-08-31', NULL, '2026-08-31T08:16:56.364844');
INSERT INTO public.fno_master VALUES (26, 'AUROPHARMA', 'Aurobindo Pharma Limited', 'STOCK', 20, true, '2026-08-31', NULL, '2026-08-31T08:16:56.364844');
INSERT INTO public.fno_master VALUES (27, 'DMART', 'Avenue Supermarts Limited', 'STOCK', 21, true, '2026-08-31', NULL, '2026-08-31T08:16:56.364844');
INSERT INTO public.fno_master VALUES (28, 'AXISBANK', 'Axis Bank Limited', 'STOCK', 22, true, '2026-08-31', NULL, '2026-08-31T08:16:56.364844');
INSERT INTO public.fno_master VALUES (29, 'BSE', 'BSE Limited', 'STOCK', 23, true, '2026-08-31', NULL, '2026-08-31T08:16:56.364844');
INSERT INTO public.fno_master VALUES (30, 'BAJAJ-AUTO', 'Bajaj Auto Limited', 'STOCK', 24, true, '2026-08-31', NULL, '2026-08-31T08:16:56.364844');
INSERT INTO public.fno_master VALUES (31, 'BAJFINANCE', 'Bajaj Finance Limited', 'STOCK', 25, true, '2026-08-31', NULL, '2026-08-31T08:16:56.364844');
INSERT INTO public.fno_master VALUES (32, 'BAJAJFINSV', 'Bajaj Finserv Limited', 'STOCK', 26, true, '2026-08-31', NULL, '2026-08-31T08:16:56.364844');
INSERT INTO public.fno_master VALUES (33, 'BAJAJHLDNG', 'Bajaj Holdings & Investment Limited', 'STOCK', 27, true, '2026-08-31', NULL, '2026-08-31T08:16:56.364844');
INSERT INTO public.fno_master VALUES (34, 'BANDHANBNK', 'Bandhan Bank Limited', 'STOCK', 28, true, '2026-08-31', NULL, '2026-08-31T08:16:56.364844');
INSERT INTO public.fno_master VALUES (35, 'BANKBARODA', 'Bank of Baroda', 'STOCK', 29, true, '2026-08-31', NULL, '2026-08-31T08:16:56.364844');
INSERT INTO public.fno_master VALUES (36, 'BANKINDIA', 'Bank of India', 'STOCK', 30, true, '2026-08-31', NULL, '2026-08-31T08:16:56.364844');
INSERT INTO public.fno_master VALUES (37, 'MAHABANK', 'Bank of Maharashtra', 'STOCK', 31, true, '2026-08-31', NULL, '2026-08-31T08:16:56.364844');
INSERT INTO public.fno_master VALUES (38, 'BDL', 'Bharat Dynamics Limited', 'STOCK', 32, true, '2026-08-31', NULL, '2026-08-31T08:16:56.364844');
INSERT INTO public.fno_master VALUES (39, 'BEL', 'Bharat Electronics Limited', 'STOCK', 33, true, '2026-08-31', NULL, '2026-08-31T08:16:56.364844');
INSERT INTO public.fno_master VALUES (40, 'BHARATFORG', 'Bharat Forge Limited', 'STOCK', 34, true, '2026-08-31', NULL, '2026-08-31T08:16:56.364844');
INSERT INTO public.fno_master VALUES (41, 'BHEL', 'Bharat Heavy Electricals Limited', 'STOCK', 35, true, '2026-08-31', NULL, '2026-08-31T08:16:56.364844');
INSERT INTO public.fno_master VALUES (42, 'BPCL', 'Bharat Petroleum Corporation Limited', 'STOCK', 36, true, '2026-08-31', NULL, '2026-08-31T08:16:56.364844');
INSERT INTO public.fno_master VALUES (43, 'BHARTIARTL', 'Bharti Airtel Limited', 'STOCK', 37, true, '2026-08-31', NULL, '2026-08-31T08:16:56.364844');
INSERT INTO public.fno_master VALUES (44, 'BIOCON', 'Biocon Limited', 'STOCK', 38, true, '2026-08-31', NULL, '2026-08-31T08:16:56.364844');
INSERT INTO public.fno_master VALUES (45, 'BLUESTARCO', 'Blue Star Limited', 'STOCK', 39, true, '2026-08-31', NULL, '2026-08-31T08:16:56.364844');
INSERT INTO public.fno_master VALUES (46, 'BOSCHLTD', 'Bosch Limited', 'STOCK', 40, true, '2026-08-31', NULL, '2026-08-31T08:16:56.364844');
INSERT INTO public.fno_master VALUES (47, 'BRITANNIA', 'Britannia Industries Limited', 'STOCK', 41, true, '2026-08-31', NULL, '2026-08-31T08:16:56.364844');
INSERT INTO public.fno_master VALUES (48, 'CGPOWER', 'CG Power and Industrial Solutions Limited', 'STOCK', 42, true, '2026-08-31', NULL, '2026-08-31T08:16:56.364844');
INSERT INTO public.fno_master VALUES (49, 'CANBK', 'Canara Bank', 'STOCK', 43, true, '2026-08-31', NULL, '2026-08-31T08:16:56.364844');
INSERT INTO public.fno_master VALUES (50, 'CDSL', 'Central Depository Services (India) Limited', 'STOCK', 44, true, '2026-08-31', NULL, '2026-08-31T08:16:56.364844');
INSERT INTO public.fno_master VALUES (51, 'CHOLAFIN', 'Cholamandalam Investment and Finance Company Limited', 'STOCK', 45, true, '2026-08-31', NULL, '2026-08-31T08:16:56.364844');
INSERT INTO public.fno_master VALUES (52, 'CIPLA', 'Cipla Limited', 'STOCK', 46, true, '2026-08-31', NULL, '2026-08-31T08:16:56.364844');
INSERT INTO public.fno_master VALUES (53, 'COALINDIA', 'Coal India Limited', 'STOCK', 47, true, '2026-08-31', NULL, '2026-08-31T08:16:56.364844');
INSERT INTO public.fno_master VALUES (54, 'COCHINSHIP', 'Cochin Shipyard Limited', 'STOCK', 48, true, '2026-08-31', NULL, '2026-08-31T08:16:56.364844');
INSERT INTO public.fno_master VALUES (55, 'COFORGE', 'Coforge Limited', 'STOCK', 49, true, '2026-08-31', NULL, '2026-08-31T08:16:56.364844');
INSERT INTO public.fno_master VALUES (56, 'COLPAL', 'Colgate Palmolive (India) Limited', 'STOCK', 50, true, '2026-08-31', NULL, '2026-08-31T08:16:56.364844');
INSERT INTO public.fno_master VALUES (57, 'CAMS', 'Computer Age Management Services Limited', 'STOCK', 51, true, '2026-08-31', NULL, '2026-08-31T08:16:56.364844');
INSERT INTO public.fno_master VALUES (58, 'CONCOR', 'Container Corporation of India Limited', 'STOCK', 52, true, '2026-08-31', NULL, '2026-08-31T08:16:56.364844');
INSERT INTO public.fno_master VALUES (59, 'CROMPTON', 'Crompton Greaves Consumer Electricals Limited', 'STOCK', 53, true, '2026-08-31', NULL, '2026-08-31T08:16:56.364844');
INSERT INTO public.fno_master VALUES (60, 'CUMMINSIND', 'Cummins India Limited', 'STOCK', 54, true, '2026-08-31', NULL, '2026-08-31T08:16:56.364844');
INSERT INTO public.fno_master VALUES (61, 'DLF', 'DLF Limited', 'STOCK', 55, true, '2026-08-31', NULL, '2026-08-31T08:16:56.364844');
INSERT INTO public.fno_master VALUES (62, 'DABUR', 'Dabur India Limited', 'STOCK', 56, true, '2026-08-31', NULL, '2026-08-31T08:16:56.364844');
INSERT INTO public.fno_master VALUES (63, 'DELHIVERY', 'Delhivery Limited', 'STOCK', 57, true, '2026-08-31', NULL, '2026-08-31T08:16:56.364844');
INSERT INTO public.fno_master VALUES (64, 'DIVISLAB', 'Divi''s Laboratories Limited', 'STOCK', 58, true, '2026-08-31', NULL, '2026-08-31T08:16:56.364844');
INSERT INTO public.fno_master VALUES (65, 'DIXON', 'Dixon Technologies (India) Limited', 'STOCK', 59, true, '2026-08-31', NULL, '2026-08-31T08:16:56.364844');
INSERT INTO public.fno_master VALUES (66, 'DRREDDY', 'Dr. Reddy''s Laboratories Limited', 'STOCK', 60, true, '2026-08-31', NULL, '2026-08-31T08:16:56.364844');
INSERT INTO public.fno_master VALUES (67, 'ETERNAL', 'ETERNAL LIMITED', 'STOCK', 61, true, '2026-08-31', NULL, '2026-08-31T08:16:56.364844');
INSERT INTO public.fno_master VALUES (68, 'EICHERMOT', 'Eicher Motors Limited', 'STOCK', 62, true, '2026-08-31', NULL, '2026-08-31T08:16:56.364844');
INSERT INTO public.fno_master VALUES (69, 'FORCEMOT', 'FORCE MOTORS LTD', 'STOCK', 63, true, '2026-08-31', NULL, '2026-08-31T08:16:56.364844');
INSERT INTO public.fno_master VALUES (70, 'NYKAA', 'FSN E-Commerce Ventures Limited', 'STOCK', 64, true, '2026-08-31', NULL, '2026-08-31T08:16:56.364844');
INSERT INTO public.fno_master VALUES (71, 'FORTIS', 'Fortis Healthcare Limited', 'STOCK', 65, true, '2026-08-31', NULL, '2026-08-31T08:16:56.364844');
INSERT INTO public.fno_master VALUES (72, 'GAIL', 'GAIL (India) Limited', 'STOCK', 66, true, '2026-08-31', NULL, '2026-08-31T08:16:56.364844');
INSERT INTO public.fno_master VALUES (73, 'GVT&D', 'GE Vernova T&D India Limited', 'STOCK', 67, true, '2026-08-31', NULL, '2026-08-31T08:16:56.364844');
INSERT INTO public.fno_master VALUES (74, 'GMRAIRPORT', 'GMR AIRPORTS LIMITED', 'STOCK', 68, true, '2026-08-31', NULL, '2026-08-31T08:16:56.364844');
INSERT INTO public.fno_master VALUES (75, 'GLENMARK', 'Glenmark Pharmaceuticals Limited', 'STOCK', 69, true, '2026-08-31', NULL, '2026-08-31T08:16:56.364844');
INSERT INTO public.fno_master VALUES (76, 'GODFRYPHLP', 'Godfrey Phillips India Limited', 'STOCK', 70, true, '2026-08-31', NULL, '2026-08-31T08:16:56.364844');
INSERT INTO public.fno_master VALUES (77, 'GODREJCP', 'Godrej Consumer Products Limited', 'STOCK', 71, true, '2026-08-31', NULL, '2026-08-31T08:16:56.364844');
INSERT INTO public.fno_master VALUES (78, 'GODREJPROP', 'Godrej Properties Limited', 'STOCK', 72, true, '2026-08-31', NULL, '2026-08-31T08:16:56.364844');
INSERT INTO public.fno_master VALUES (79, 'GRASIM', 'Grasim Industries Limited', 'STOCK', 73, true, '2026-08-31', NULL, '2026-08-31T08:16:56.364844');
INSERT INTO public.fno_master VALUES (80, 'HCLTECH', 'HCL Technologies Limited', 'STOCK', 74, true, '2026-08-31', NULL, '2026-08-31T08:16:56.364844');
INSERT INTO public.fno_master VALUES (81, 'HDFCAMC', 'HDFC Asset Management Company Limited', 'STOCK', 75, true, '2026-08-31', NULL, '2026-08-31T08:16:56.364844');
INSERT INTO public.fno_master VALUES (82, 'HDFCBANK', 'HDFC Bank Limited', 'STOCK', 76, true, '2026-08-31', NULL, '2026-08-31T08:16:56.364844');
INSERT INTO public.fno_master VALUES (83, 'HDFCLIFE', 'HDFC Life Insurance Company Limited', 'STOCK', 77, true, '2026-08-31', NULL, '2026-08-31T08:16:56.364844');
INSERT INTO public.fno_master VALUES (84, 'HAVELLS', 'Havells India Limited', 'STOCK', 78, true, '2026-08-31', NULL, '2026-08-31T08:16:56.364844');
INSERT INTO public.fno_master VALUES (85, 'HEROMOTOCO', 'Hero MotoCorp Limited', 'STOCK', 79, true, '2026-08-31', NULL, '2026-08-31T08:16:56.364844');
INSERT INTO public.fno_master VALUES (86, 'HINDALCO', 'Hindalco Industries Limited', 'STOCK', 80, true, '2026-08-31', NULL, '2026-08-31T08:16:56.364844');
INSERT INTO public.fno_master VALUES (87, 'HAL', 'Hindustan Aeronautics Limited', 'STOCK', 81, true, '2026-08-31', NULL, '2026-08-31T08:16:56.364844');
INSERT INTO public.fno_master VALUES (88, 'HINDPETRO', 'Hindustan Petroleum Corporation Limited', 'STOCK', 82, true, '2026-08-31', NULL, '2026-08-31T08:16:56.364844');
INSERT INTO public.fno_master VALUES (89, 'HINDUNILVR', 'Hindustan Unilever Limited', 'STOCK', 83, true, '2026-08-31', NULL, '2026-08-31T08:16:56.364844');
INSERT INTO public.fno_master VALUES (90, 'HINDZINC', 'Hindustan Zinc Limited', 'STOCK', 84, true, '2026-08-31', NULL, '2026-08-31T08:16:56.364844');
INSERT INTO public.fno_master VALUES (91, 'POWERINDIA', 'Hitachi Energy India Limited', 'STOCK', 85, true, '2026-08-31', NULL, '2026-08-31T08:16:56.364844');
INSERT INTO public.fno_master VALUES (92, 'HYUNDAI', 'Hyundai Motor India Limited', 'STOCK', 86, true, '2026-08-31', NULL, '2026-08-31T08:16:56.364844');
INSERT INTO public.fno_master VALUES (93, 'ICICIBANK', 'ICICI Bank Limited', 'STOCK', 87, true, '2026-08-31', NULL, '2026-08-31T08:16:56.364844');
INSERT INTO public.fno_master VALUES (94, 'ICICIGI', 'ICICI Lombard General Insurance Company Limited', 'STOCK', 88, true, '2026-08-31', NULL, '2026-08-31T08:16:56.364844');
INSERT INTO public.fno_master VALUES (95, 'ICICIPRULI', 'ICICI Prudential Life Insurance Company Limited', 'STOCK', 89, true, '2026-08-31', NULL, '2026-08-31T08:16:56.364844');
INSERT INTO public.fno_master VALUES (96, 'IDFCFIRSTB', 'IDFC First Bank Limited', 'STOCK', 90, true, '2026-08-31', NULL, '2026-08-31T08:16:56.364844');
INSERT INTO public.fno_master VALUES (97, 'ITC', 'ITC Limited', 'STOCK', 91, true, '2026-08-31', NULL, '2026-08-31T08:16:56.364844');
INSERT INTO public.fno_master VALUES (98, 'INDIANB', 'Indian Bank', 'STOCK', 92, true, '2026-08-31', NULL, '2026-08-31T08:16:56.364844');
INSERT INTO public.fno_master VALUES (99, 'IEX', 'Indian Energy Exchange Limited', 'STOCK', 93, true, '2026-08-31', NULL, '2026-08-31T08:16:56.364844');
INSERT INTO public.fno_master VALUES (100, 'IOC', 'Indian Oil Corporation Limited', 'STOCK', 94, true, '2026-08-31', NULL, '2026-08-31T08:16:56.364844');
INSERT INTO public.fno_master VALUES (101, 'IRFC', 'Indian Railway Finance Corporation Limited', 'STOCK', 95, true, '2026-08-31', NULL, '2026-08-31T08:16:56.364844');
INSERT INTO public.fno_master VALUES (102, 'IREDA', 'Indian Renewable Energy Development Agency Limited', 'STOCK', 96, true, '2026-08-31', NULL, '2026-08-31T08:16:56.364844');
INSERT INTO public.fno_master VALUES (103, 'INDUSTOWER', 'Indus Towers Limited', 'STOCK', 97, true, '2026-08-31', NULL, '2026-08-31T08:16:56.364844');
INSERT INTO public.fno_master VALUES (104, 'INDUSINDBK', 'IndusInd Bank Limited', 'STOCK', 98, true, '2026-08-31', NULL, '2026-08-31T08:16:56.364844');
INSERT INTO public.fno_master VALUES (105, 'NAUKRI', 'Info Edge (India) Limited', 'STOCK', 99, true, '2026-08-31', NULL, '2026-08-31T08:16:56.364844');
INSERT INTO public.fno_master VALUES (106, 'INFY', 'Infosys Limited', 'STOCK', 100, true, '2026-08-31', NULL, '2026-08-31T08:16:56.364844');
INSERT INTO public.fno_master VALUES (107, 'INOXWIND', 'Inox Wind Limited', 'STOCK', 101, true, '2026-08-31', NULL, '2026-08-31T08:16:56.364844');
INSERT INTO public.fno_master VALUES (108, 'INDIGO', 'InterGlobe Aviation Limited', 'STOCK', 102, true, '2026-08-31', NULL, '2026-08-31T08:16:56.364844');
INSERT INTO public.fno_master VALUES (109, 'JINDALSTEL', 'JINDAL STEEL LIMITED', 'STOCK', 103, true, '2026-08-31', NULL, '2026-08-31T08:16:56.364844');
INSERT INTO public.fno_master VALUES (110, 'JSWENERGY', 'JSW Energy Limited', 'STOCK', 104, true, '2026-08-31', NULL, '2026-08-31T08:16:56.364844');
INSERT INTO public.fno_master VALUES (111, 'JSWSTEEL', 'JSW Steel Limited', 'STOCK', 105, true, '2026-08-31', NULL, '2026-08-31T08:16:56.364844');
INSERT INTO public.fno_master VALUES (112, 'JIOFIN', 'Jio Financial Services Limited', 'STOCK', 106, true, '2026-08-31', NULL, '2026-08-31T08:16:56.364844');
INSERT INTO public.fno_master VALUES (113, 'JUBLFOOD', 'Jubilant Foodworks Limited', 'STOCK', 107, true, '2026-08-31', NULL, '2026-08-31T08:16:56.364844');
INSERT INTO public.fno_master VALUES (114, 'KEI', 'KEI Industries Limited', 'STOCK', 108, true, '2026-08-31', NULL, '2026-08-31T08:16:56.364844');
INSERT INTO public.fno_master VALUES (115, 'KPITTECH', 'KPIT Technologies Limited', 'STOCK', 109, true, '2026-08-31', NULL, '2026-08-31T08:16:56.364844');
INSERT INTO public.fno_master VALUES (116, 'KALYANKJIL', 'Kalyan Jewellers India Limited', 'STOCK', 110, true, '2026-08-31', NULL, '2026-08-31T08:16:56.364844');
INSERT INTO public.fno_master VALUES (117, 'KAYNES', 'Kaynes Technology India Limited', 'STOCK', 111, true, '2026-08-31', NULL, '2026-08-31T08:16:56.364844');
INSERT INTO public.fno_master VALUES (118, 'KFINTECH', 'Kfin Technologies Limited', 'STOCK', 112, true, '2026-08-31', NULL, '2026-08-31T08:16:56.364844');
INSERT INTO public.fno_master VALUES (119, 'KOTAKBANK', 'Kotak Mahindra Bank Limited', 'STOCK', 113, true, '2026-08-31', NULL, '2026-08-31T08:16:56.364844');
INSERT INTO public.fno_master VALUES (120, 'LTF', 'L&T Finance Limited', 'STOCK', 114, true, '2026-08-31', NULL, '2026-08-31T08:16:56.364844');
INSERT INTO public.fno_master VALUES (121, 'LICHSGFIN', 'LIC Housing Finance Limited', 'STOCK', 115, true, '2026-08-31', NULL, '2026-08-31T08:16:56.364844');
INSERT INTO public.fno_master VALUES (122, 'LTM', 'LTM Limited', 'STOCK', 116, true, '2026-08-31', NULL, '2026-08-31T08:16:56.364844');
INSERT INTO public.fno_master VALUES (123, 'LT', 'Larsen & Toubro Limited', 'STOCK', 117, true, '2026-08-31', NULL, '2026-08-31T08:16:56.364844');
INSERT INTO public.fno_master VALUES (124, 'LAURUSLABS', 'Laurus Labs Limited', 'STOCK', 118, true, '2026-08-31', NULL, '2026-08-31T08:16:56.364844');
INSERT INTO public.fno_master VALUES (125, 'LICI', 'Life Insurance Corporation Of India', 'STOCK', 119, true, '2026-08-31', NULL, '2026-08-31T08:16:56.364844');
INSERT INTO public.fno_master VALUES (126, 'LODHA', 'Lodha Developers Limited', 'STOCK', 120, true, '2026-08-31', NULL, '2026-08-31T08:16:56.364844');
INSERT INTO public.fno_master VALUES (127, 'LUPIN', 'Lupin Limited', 'STOCK', 121, true, '2026-08-31', NULL, '2026-08-31T08:16:56.364844');
INSERT INTO public.fno_master VALUES (128, 'M&M', 'Mahindra & Mahindra Limited', 'STOCK', 122, true, '2026-08-31', NULL, '2026-08-31T08:16:56.364844');
INSERT INTO public.fno_master VALUES (129, 'MANAPPURAM', 'Manappuram Finance Limited', 'STOCK', 123, true, '2026-08-31', NULL, '2026-08-31T08:16:56.364844');
INSERT INTO public.fno_master VALUES (130, 'MANKIND', 'Mankind Pharma Limited', 'STOCK', 124, true, '2026-08-31', NULL, '2026-08-31T08:16:56.364844');
INSERT INTO public.fno_master VALUES (131, 'MARICO', 'Marico Limited', 'STOCK', 125, true, '2026-08-31', NULL, '2026-08-31T08:16:56.364844');
INSERT INTO public.fno_master VALUES (132, 'MARUTI', 'Maruti Suzuki India Limited', 'STOCK', 126, true, '2026-08-31', NULL, '2026-08-31T08:16:56.364844');
INSERT INTO public.fno_master VALUES (133, 'MFSL', 'Max Financial Services Limited', 'STOCK', 127, true, '2026-08-31', NULL, '2026-08-31T08:16:56.364844');
INSERT INTO public.fno_master VALUES (134, 'MAXHEALTH', 'Max Healthcare Institute Limited', 'STOCK', 128, true, '2026-08-31', NULL, '2026-08-31T08:16:56.364844');
INSERT INTO public.fno_master VALUES (135, 'MAZDOCK', 'Mazagon Dock Shipbuilders Limited', 'STOCK', 129, true, '2026-08-31', NULL, '2026-08-31T08:16:56.364844');
INSERT INTO public.fno_master VALUES (136, 'MOTILALOFS', 'Motilal Oswal Financial Services Limited', 'STOCK', 130, true, '2026-08-31', NULL, '2026-08-31T08:16:56.364844');
INSERT INTO public.fno_master VALUES (137, 'MPHASIS', 'MphasiS Limited', 'STOCK', 131, true, '2026-08-31', NULL, '2026-08-31T08:16:56.364844');
INSERT INTO public.fno_master VALUES (138, 'MCX', 'Multi Commodity Exchange of India Limited', 'STOCK', 132, true, '2026-08-31', NULL, '2026-08-31T08:16:56.364844');
INSERT INTO public.fno_master VALUES (139, 'MUTHOOTFIN', 'Muthoot Finance Limited', 'STOCK', 133, true, '2026-08-31', NULL, '2026-08-31T08:16:56.364844');
INSERT INTO public.fno_master VALUES (140, 'NBCC', 'NBCC (India) Limited', 'STOCK', 134, true, '2026-08-31', NULL, '2026-08-31T08:16:56.364844');
INSERT INTO public.fno_master VALUES (141, 'NHPC', 'NHPC Limited', 'STOCK', 135, true, '2026-08-31', NULL, '2026-08-31T08:16:56.364844');
INSERT INTO public.fno_master VALUES (142, 'NMDC', 'NMDC Limited', 'STOCK', 136, true, '2026-08-31', NULL, '2026-08-31T08:16:56.364844');
INSERT INTO public.fno_master VALUES (143, 'NTPC', 'NTPC Limited', 'STOCK', 137, true, '2026-08-31', NULL, '2026-08-31T08:16:56.364844');
INSERT INTO public.fno_master VALUES (144, 'NATIONALUM', 'National Aluminium Company Limited', 'STOCK', 138, true, '2026-08-31', NULL, '2026-08-31T08:16:56.364844');
INSERT INTO public.fno_master VALUES (145, 'NESTLEIND', 'Nestle India Limited', 'STOCK', 139, true, '2026-08-31', NULL, '2026-08-31T08:16:56.364844');
INSERT INTO public.fno_master VALUES (146, 'NAM-INDIA', 'Nippon Life India Asset Management Limited', 'STOCK', 140, true, '2026-08-31', NULL, '2026-08-31T08:16:56.364844');
INSERT INTO public.fno_master VALUES (147, 'OBEROIRLTY', 'Oberoi Realty Limited', 'STOCK', 141, true, '2026-08-31', NULL, '2026-08-31T08:16:56.364844');
INSERT INTO public.fno_master VALUES (148, 'ONGC', 'Oil & Natural Gas Corporation Limited', 'STOCK', 142, true, '2026-08-31', NULL, '2026-08-31T08:16:56.364844');
INSERT INTO public.fno_master VALUES (149, 'OIL', 'Oil India Limited', 'STOCK', 143, true, '2026-08-31', NULL, '2026-08-31T08:16:56.364844');
INSERT INTO public.fno_master VALUES (150, 'PAYTM', 'One 97 Communications Limited', 'STOCK', 144, true, '2026-08-31', NULL, '2026-08-31T08:16:56.364844');
INSERT INTO public.fno_master VALUES (151, 'OFSS', 'Oracle Financial Services Software Limited', 'STOCK', 145, true, '2026-08-31', NULL, '2026-08-31T08:16:56.364844');
INSERT INTO public.fno_master VALUES (152, 'POLICYBZR', 'PB Fintech Limited', 'STOCK', 146, true, '2026-08-31', NULL, '2026-08-31T08:16:56.364844');
INSERT INTO public.fno_master VALUES (153, 'PGEL', 'PG Electroplast Limited', 'STOCK', 147, true, '2026-08-31', NULL, '2026-08-31T08:16:56.364844');
INSERT INTO public.fno_master VALUES (154, 'PIIND', 'PI Industries Limited', 'STOCK', 148, true, '2026-08-31', NULL, '2026-08-31T08:16:56.364844');
INSERT INTO public.fno_master VALUES (155, 'PNBHOUSING', 'PNB Housing Finance Limited', 'STOCK', 149, true, '2026-08-31', NULL, '2026-08-31T08:16:56.364844');
INSERT INTO public.fno_master VALUES (156, 'PAGEIND', 'Page Industries Limited', 'STOCK', 150, true, '2026-08-31', NULL, '2026-08-31T08:16:56.364844');
INSERT INTO public.fno_master VALUES (157, 'PATANJALI', 'Patanjali Foods Limited', 'STOCK', 151, true, '2026-08-31', NULL, '2026-08-31T08:16:56.364844');
INSERT INTO public.fno_master VALUES (158, 'PERSISTENT', 'Persistent Systems Limited', 'STOCK', 152, true, '2026-08-31', NULL, '2026-08-31T08:16:56.364844');
INSERT INTO public.fno_master VALUES (159, 'PETRONET', 'Petronet LNG Limited', 'STOCK', 153, true, '2026-08-31', NULL, '2026-08-31T08:16:56.364844');
INSERT INTO public.fno_master VALUES (160, 'PIDILITIND', 'Pidilite Industries Limited', 'STOCK', 154, true, '2026-08-31', NULL, '2026-08-31T08:16:56.364844');
INSERT INTO public.fno_master VALUES (161, 'POLYCAB', 'Polycab India Limited', 'STOCK', 155, true, '2026-08-31', NULL, '2026-08-31T08:16:56.364844');
INSERT INTO public.fno_master VALUES (162, 'PFC', 'Power Finance Corporation Limited', 'STOCK', 156, true, '2026-08-31', NULL, '2026-08-31T08:16:56.364844');
INSERT INTO public.fno_master VALUES (163, 'POWERGRID', 'Power Grid Corporation of India Limited', 'STOCK', 157, true, '2026-08-31', NULL, '2026-08-31T08:16:56.364844');
INSERT INTO public.fno_master VALUES (164, 'PREMIERENE', 'Premier Energies Limited', 'STOCK', 158, true, '2026-08-31', NULL, '2026-08-31T08:16:56.364844');
INSERT INTO public.fno_master VALUES (165, 'PRESTIGE', 'Prestige Estates Projects Limited', 'STOCK', 159, true, '2026-08-31', NULL, '2026-08-31T08:16:56.364844');
INSERT INTO public.fno_master VALUES (166, 'PNB', 'Punjab National Bank', 'STOCK', 160, true, '2026-08-31', NULL, '2026-08-31T08:16:56.364844');
INSERT INTO public.fno_master VALUES (167, 'RBLBANK', 'RBL Bank Limited', 'STOCK', 161, true, '2026-08-31', NULL, '2026-08-31T08:16:56.364844');
INSERT INTO public.fno_master VALUES (168, 'RECLTD', 'REC Limited', 'STOCK', 162, true, '2026-08-31', NULL, '2026-08-31T08:16:56.364844');
INSERT INTO public.fno_master VALUES (169, 'RADICO', 'Radico Khaitan Limited', 'STOCK', 163, true, '2026-08-31', NULL, '2026-08-31T08:16:56.364844');
INSERT INTO public.fno_master VALUES (170, 'RVNL', 'Rail Vikas Nigam Limited', 'STOCK', 164, true, '2026-08-31', NULL, '2026-08-31T08:16:56.364844');
INSERT INTO public.fno_master VALUES (171, 'RELIANCE', 'Reliance Industries Limited', 'STOCK', 165, true, '2026-08-31', NULL, '2026-08-31T08:16:56.364844');
INSERT INTO public.fno_master VALUES (172, 'SAGILITY', 'SAGILITY LIMITED', 'STOCK', 166, true, '2026-08-31', NULL, '2026-08-31T08:16:56.364844');
INSERT INTO public.fno_master VALUES (173, 'SBICARD', 'SBI Cards and Payment Services Limited', 'STOCK', 167, true, '2026-08-31', NULL, '2026-08-31T08:16:56.364844');
INSERT INTO public.fno_master VALUES (174, 'SBILIFE', 'SBI Life Insurance Company Limited', 'STOCK', 168, true, '2026-08-31', NULL, '2026-08-31T08:16:56.364844');
INSERT INTO public.fno_master VALUES (175, 'SHREECEM', 'SHREE CEMENT LIMITED', 'STOCK', 169, true, '2026-08-31', NULL, '2026-08-31T08:16:56.364844');
INSERT INTO public.fno_master VALUES (176, 'SRF', 'SRF Limited', 'STOCK', 170, true, '2026-08-31', NULL, '2026-08-31T08:16:56.364844');
INSERT INTO public.fno_master VALUES (177, 'MOTHERSON', 'Samvardhana Motherson International Limited', 'STOCK', 171, true, '2026-08-31', NULL, '2026-08-31T08:16:56.364844');
INSERT INTO public.fno_master VALUES (178, 'SHRIRAMFIN', 'Shriram Finance Limited', 'STOCK', 172, true, '2026-08-31', NULL, '2026-08-31T08:16:56.364844');
INSERT INTO public.fno_master VALUES (179, 'SIEMENS', 'Siemens Limited', 'STOCK', 173, true, '2026-08-31', NULL, '2026-08-31T08:16:56.364844');
INSERT INTO public.fno_master VALUES (180, 'SOLARINDS', 'Solar Industries India Limited', 'STOCK', 174, true, '2026-08-31', NULL, '2026-08-31T08:16:56.364844');
INSERT INTO public.fno_master VALUES (181, 'SONACOMS', 'Sona BLW Precision Forgings Limited', 'STOCK', 175, true, '2026-08-31', NULL, '2026-08-31T08:16:56.364844');
INSERT INTO public.fno_master VALUES (182, 'SBIN', 'State Bank of India', 'STOCK', 176, true, '2026-08-31', NULL, '2026-08-31T08:16:56.364844');
INSERT INTO public.fno_master VALUES (183, 'SAIL', 'Steel Authority of India Limited', 'STOCK', 177, true, '2026-08-31', NULL, '2026-08-31T08:16:56.364844');
INSERT INTO public.fno_master VALUES (184, 'SUNPHARMA', 'Sun Pharmaceutical Industries Limited', 'STOCK', 178, true, '2026-08-31', NULL, '2026-08-31T08:16:56.364844');
INSERT INTO public.fno_master VALUES (185, 'SUPREMEIND', 'Supreme Industries Limited', 'STOCK', 179, true, '2026-08-31', NULL, '2026-08-31T08:16:56.364844');
INSERT INTO public.fno_master VALUES (186, 'SUZLON', 'Suzlon Energy Limited', 'STOCK', 180, true, '2026-08-31', NULL, '2026-08-31T08:16:56.364844');
INSERT INTO public.fno_master VALUES (187, 'SWIGGY', 'Swiggy Limited', 'STOCK', 181, true, '2026-08-31', NULL, '2026-08-31T08:16:56.364844');
INSERT INTO public.fno_master VALUES (188, 'TATACONSUM', 'TATA CONSUMER PRODUCTS LIMITED', 'STOCK', 182, true, '2026-08-31', NULL, '2026-08-31T08:16:56.364844');
INSERT INTO public.fno_master VALUES (189, 'TVSMOTOR', 'TVS Motor Company Limited', 'STOCK', 183, true, '2026-08-31', NULL, '2026-08-31T08:16:56.364844');
INSERT INTO public.fno_master VALUES (190, 'TCS', 'Tata Consultancy Services Limited', 'STOCK', 184, true, '2026-08-31', NULL, '2026-08-31T08:16:56.364844');
INSERT INTO public.fno_master VALUES (191, 'TATAELXSI', 'Tata Elxsi Limited', 'STOCK', 185, true, '2026-08-31', NULL, '2026-08-31T08:16:56.364844');
INSERT INTO public.fno_master VALUES (192, 'TMPV', 'Tata Motors Passenger Vehicles Limited', 'STOCK', 186, true, '2026-08-31', NULL, '2026-08-31T08:16:56.364844');
INSERT INTO public.fno_master VALUES (193, 'TATAPOWER', 'Tata Power Company Limited', 'STOCK', 187, true, '2026-08-31', NULL, '2026-08-31T08:16:56.364844');
INSERT INTO public.fno_master VALUES (194, 'TATASTEEL', 'Tata Steel Limited', 'STOCK', 188, true, '2026-08-31', NULL, '2026-08-31T08:16:56.364844');
INSERT INTO public.fno_master VALUES (195, 'TECHM', 'Tech Mahindra Limited', 'STOCK', 189, true, '2026-08-31', NULL, '2026-08-31T08:16:56.364844');
INSERT INTO public.fno_master VALUES (196, 'FEDERALBNK', 'The Federal Bank  Limited', 'STOCK', 190, true, '2026-08-31', NULL, '2026-08-31T08:16:56.364844');
INSERT INTO public.fno_master VALUES (197, 'INDHOTEL', 'The Indian Hotels Company Limited', 'STOCK', 191, true, '2026-08-31', NULL, '2026-08-31T08:16:56.364844');
INSERT INTO public.fno_master VALUES (198, 'PHOENIXLTD', 'The Phoenix Mills Limited', 'STOCK', 192, true, '2026-08-31', NULL, '2026-08-31T08:16:56.364844');
INSERT INTO public.fno_master VALUES (199, 'TITAN', 'Titan Company Limited', 'STOCK', 193, true, '2026-08-31', NULL, '2026-08-31T08:16:56.364844');
INSERT INTO public.fno_master VALUES (200, 'TORNTPHARM', 'Torrent Pharmaceuticals Limited', 'STOCK', 194, true, '2026-08-31', NULL, '2026-08-31T08:16:56.364844');
INSERT INTO public.fno_master VALUES (201, 'TRENT', 'Trent Limited', 'STOCK', 195, true, '2026-08-31', NULL, '2026-08-31T08:16:56.364844');
INSERT INTO public.fno_master VALUES (202, 'TIINDIA', 'Tube Investments of India Limited', 'STOCK', 196, true, '2026-08-31', NULL, '2026-08-31T08:16:56.364844');
INSERT INTO public.fno_master VALUES (203, 'UNOMINDA', 'UNO Minda Limited', 'STOCK', 197, true, '2026-08-31', NULL, '2026-08-31T08:16:56.364844');
INSERT INTO public.fno_master VALUES (204, 'UPL', 'UPL Limited', 'STOCK', 198, true, '2026-08-31', NULL, '2026-08-31T08:16:56.364844');
INSERT INTO public.fno_master VALUES (205, 'ULTRACEMCO', 'UltraTech Cement Limited', 'STOCK', 199, true, '2026-08-31', NULL, '2026-08-31T08:16:56.364844');
INSERT INTO public.fno_master VALUES (206, 'UNIONBANK', 'Union Bank of India', 'STOCK', 200, true, '2026-08-31', NULL, '2026-08-31T08:16:56.364844');
INSERT INTO public.fno_master VALUES (207, 'UNITDSPR', 'United Spirits Limited', 'STOCK', 201, true, '2026-08-31', NULL, '2026-08-31T08:16:56.364844');
INSERT INTO public.fno_master VALUES (208, 'VBL', 'Varun Beverages Limited', 'STOCK', 202, true, '2026-08-31', NULL, '2026-08-31T08:16:56.364844');
INSERT INTO public.fno_master VALUES (209, 'VEDL', 'Vedanta Limited', 'STOCK', 203, true, '2026-08-31', NULL, '2026-08-31T08:16:56.364844');
INSERT INTO public.fno_master VALUES (210, 'VMM', 'Vishal Mega Mart Limited', 'STOCK', 204, true, '2026-08-31', NULL, '2026-08-31T08:16:56.364844');
INSERT INTO public.fno_master VALUES (211, 'IDEA', 'Vodafone Idea Limited', 'STOCK', 205, true, '2026-08-31', NULL, '2026-08-31T08:16:56.364844');
INSERT INTO public.fno_master VALUES (212, 'VOLTAS', 'Voltas Limited', 'STOCK', 206, true, '2026-08-31', NULL, '2026-08-31T08:16:56.364844');
INSERT INTO public.fno_master VALUES (213, 'WAAREEENER', 'Waaree Energies Limited', 'STOCK', 207, true, '2026-08-31', NULL, '2026-08-31T08:16:56.364844');
INSERT INTO public.fno_master VALUES (214, 'WIPRO', 'Wipro Limited', 'STOCK', 208, true, '2026-08-31', NULL, '2026-08-31T08:16:56.364844');
INSERT INTO public.fno_master VALUES (215, 'YESBANK', 'Yes Bank Limited', 'STOCK', 209, true, '2026-08-31', NULL, '2026-08-31T08:16:56.364844');
INSERT INTO public.fno_master VALUES (216, 'ZYDUSLIFE', 'Zydus Lifesciences Limited', 'STOCK', 210, true, '2026-08-31', NULL, '2026-08-31T08:16:56.364844');


--
-- Data for Name: sectors; Type: TABLE DATA; Schema: public; Owner: jmbxdbuser
--

INSERT INTO public.sectors VALUES (1, 'Technology', 'IT & Software', '2026-08-30 16:22:30.254256');
INSERT INTO public.sectors VALUES (2, 'NBFC', 'Auto-seeded from nbfc watchlist', '2026-08-30 16:25:53.814876');
INSERT INTO public.sectors VALUES (3, 'Nifty 50', 'Auto-seeded from nifty_50 watchlist', '2026-08-30 16:25:53.814876');
INSERT INTO public.sectors VALUES (4, 'Nifty Auto', 'Auto-seeded from nifty_auto watchlist', '2026-08-30 16:25:53.814876');
INSERT INTO public.sectors VALUES (5, 'Nifty Bank', 'Auto-seeded from nifty_bank watchlist', '2026-08-30 16:25:53.814876');
INSERT INTO public.sectors VALUES (6, 'Nifty Energy', 'Auto-seeded from nifty_energy watchlist', '2026-08-30 16:25:53.814876');
INSERT INTO public.sectors VALUES (7, 'Nifty Financial Services', 'Auto-seeded from nifty_financial_services watchlist', '2026-08-30 16:25:53.814876');
INSERT INTO public.sectors VALUES (8, 'Nifty FMCG', 'Auto-seeded from nifty_fmcg watchlist', '2026-08-30 16:25:53.814876');
INSERT INTO public.sectors VALUES (9, 'Nifty Healthcare', 'Auto-seeded from nifty_healthcare watchlist', '2026-08-30 16:25:53.814876');
INSERT INTO public.sectors VALUES (10, 'Nifty Infra', 'Auto-seeded from nifty_infra watchlist', '2026-08-30 16:25:53.814876');
INSERT INTO public.sectors VALUES (11, 'Nifty IT', 'Auto-seeded from nifty_it watchlist', '2026-08-30 16:25:53.814876');
INSERT INTO public.sectors VALUES (12, 'Nifty Media', 'Auto-seeded from nifty_media watchlist', '2026-08-30 16:25:53.814876');
INSERT INTO public.sectors VALUES (13, 'Nifty Metal', 'Auto-seeded from nifty_metal watchlist', '2026-08-30 16:25:53.814876');
INSERT INTO public.sectors VALUES (14, 'Nifty Midcap 50', 'Auto-seeded from nifty_midcap_50 watchlist', '2026-08-30 16:25:53.814876');
INSERT INTO public.sectors VALUES (15, 'Nifty Next 50', 'Auto-seeded from nifty_next_50 watchlist', '2026-08-30 16:25:53.814876');
INSERT INTO public.sectors VALUES (16, 'Nifty Pharma', 'Auto-seeded from nifty_pharma watchlist', '2026-08-30 16:25:53.814876');
INSERT INTO public.sectors VALUES (17, 'Nifty Private Bank', 'Auto-seeded from nifty_private_bank watchlist', '2026-08-30 16:25:53.814876');
INSERT INTO public.sectors VALUES (18, 'Nifty PSE', 'Auto-seeded from nifty_pse watchlist', '2026-08-30 16:25:53.814876');
INSERT INTO public.sectors VALUES (19, 'Nifty PSU Bank', 'Auto-seeded from nifty_psu_bank watchlist', '2026-08-30 16:25:53.814876');
INSERT INTO public.sectors VALUES (20, 'Nifty Realty', 'Auto-seeded from nifty_realty watchlist', '2026-08-30 16:25:53.814876');
INSERT INTO public.sectors VALUES (21, 'Power & Engineering', 'Auto-seeded from power_engg watchlist', '2026-08-30 16:25:53.814876');


--
-- Data for Name: ticker_master; Type: TABLE DATA; Schema: public; Owner: jmbxdbuser
--

INSERT INTO public.ticker_master VALUES ('IDEAFORGE', 'IDEAFORGE', false, '{}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('JSWINFRA', 'JSWINFRA', false, '{}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('LENSKART', 'LENSKART', false, '{}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('MCX', 'MCX', false, '{}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('PARAS', 'PARAS', false, '{}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('PINELABS', 'PINELABS', false, '{}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('KEI', 'KEI', false, '{}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('COFORGE', 'COFORGE', true, '{"Nifty IT","Nifty Midcap 50"}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('PAYTM', 'PAYTM', false, '{"Nifty Midcap 50","Nifty Next 50"}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('AMBUJACEM', 'AMBUJACEM', false, '{"Nifty Next 50"}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('APTUS', 'APTUS', false, '{}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('EIEL', 'EIEL', false, '{}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('GANDHAR', 'GANDHAR', false, '{}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('HCLTECH', 'HCLTECH', true, '{"Nifty 50","Nifty IT"}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('HDFCBANK', 'HDFCBANK', true, '{"Nifty 50","Nifty Bank","Nifty Financial Services","Nifty Private Bank"}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('IXIGO', 'IXIGO', false, '{}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('JIOFIN', 'JIOFIN', true, '{NBFC,"Nifty Financial Services","Nifty Next 50"}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('NSDL', 'NSDL', false, '{}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('NYKAA', 'NYKAA', false, '{}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('OLAELEC', 'OLAELEC', false, '{}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('POONAWALLA', 'POONAWALLA', true, '{"Nifty Financial Services","Nifty Next 50"}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('WAAREEENER', 'WAAREEENER', false, '{}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('ACC', 'ACC', false, '{}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('ADANIGREEN', 'ADANIGREEN', true, '{"Nifty Energy","Nifty Next 50"}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('ATUL', 'ATUL', false, '{"Nifty Midcap 50"}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('GODREJPROP', 'GODREJPROP', true, '{"Nifty Midcap 50","Nifty Realty"}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('HDFCLIFE', 'HDFCLIFE', true, '{"Nifty 50","Nifty Financial Services"}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('HINDCOPPER', 'HINDCOPPER', true, '{"Nifty Metal"}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('HINDUNILVR', 'HINDUNILVR', true, '{"Nifty 50","Nifty FMCG"}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('MGL', 'MGL', false, '{}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('NETWEB', 'NETWEB', false, '{}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('ROUTEMOBILE', 'ROUTEMOBILE', false, '{}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('SONACOMS', 'SONACOMS', false, '{}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('SYNGENE', 'SYNGENE', false, '{}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('KPITTECH', 'KPITTECH', false, '{}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('RAMCOSYS', 'RAMCOSYS', false, '{}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('SONATSOFTW', 'SONATSOFTW', false, '{}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('SURYODAY', 'SURYODAY', false, '{}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('ARIS', 'ARIS', false, '{}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('AWHCL', 'AWHCL', false, '{}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('CARTRADE', 'CARTRADE', false, '{}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('DCXINDIA', 'DCXINDIA', false, '{}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('INSECTICID', 'INSECTICID', false, '{}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('PATANJALI', 'PATANJALI', false, '{}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('PRIVISCL', 'PRIVISCL', false, '{}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('UNIMECH', 'UNIMECH', false, '{}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('WELCORP', 'WELCORP', true, '{"Nifty Metal"}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('AEQUS', 'AEQUS', false, '{}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('BBOX', 'BBOX', false, '{}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('DOLPHIN', 'DOLPHIN', false, '{}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('DYNAMATECH', 'DYNAMATECH', false, '{}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('EMBDL', 'EMBDL', false, '{}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('GVT&D', 'GVT&D', false, '{}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('ICEMAKE', 'ICEMAKE', false, '{}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('JAINREC', 'JAINREC', false, '{}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('JLHL', 'JLHL', false, '{}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('KSB', 'KSB', false, '{}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('MTARTECH', 'MTARTECH', false, '{}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('PARADEEP', 'PARADEEP', false, '{}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('POWERMECH', 'POWERMECH', false, '{}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('ROSSTECH', 'ROSSTECH', false, '{}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('ROTO', 'ROTO', false, '{}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('RPOWER', 'RPOWER', false, '{}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('SHARDACROP', 'SHARDACROP', false, '{}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('SMTEL', 'SMTEL', false, '{}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('SOLARA', 'SOLARA', false, '{}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('SOLARIUM', 'SOLARIUM', false, '{}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('SUNFLAG', 'SUNFLAG', false, '{}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('SANSERA', 'SANSERA', false, '{}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('TEJASNET', 'TEJASNET', false, '{}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('WPIL', 'WPIL', false, '{}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('AADHARHFC', 'AADHARHFC', false, '{}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('AARTIIND', 'AARTIIND', false, '{}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('AAVAS', 'AAVAS', false, '{}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('ACCELYA', 'ACCELYA', false, '{}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('ACMESOLAR', 'ACMESOLAR', false, '{}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('ADANIPORTS', 'ADANIPORTS', true, '{"Nifty 50","Nifty Infra"}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('AEROFLEX', 'AEROFLEX', false, '{}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('AFCONS', 'AFCONS', false, '{}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('AJANTPHARM', 'AJANTPHARM', false, '{}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('AMBER', 'AMBER', false, '{}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('APARINDS', 'APARINDS', false, '{}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('APOLLO', 'APOLLO', false, '{}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('ASTERDM', 'ASTERDM', false, '{}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('ASTRAMICRO', 'ASTRAMICRO', false, '{}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('ATGL', 'ATGL', false, '{"Nifty Next 50"}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('AUBANK', 'AUBANK', true, '{"Nifty Bank","Nifty Private Bank"}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('AVALON', 'AVALON', false, '{}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('AVANTEL', 'AVANTEL', false, '{}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('AXISBANK', 'AXISBANK', true, '{"Nifty 50","Nifty Bank","Nifty Financial Services","Nifty Private Bank"}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('AXISCADES', 'AXISCADES', false, '{}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('BAJFINANCE', 'BAJFINANCE', true, '{"Nifty 50","Nifty Financial Services"}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('BANKBARODA', 'BANKBARODA', true, '{"Nifty Bank","Nifty Next 50","Nifty PSU Bank"}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('BASILIC-SM', 'BASILIC-SM', false, '{}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('BDL', 'BDL', false, '{}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('BEL', 'BEL', false, '{"Nifty Infra","Nifty Next 50","Nifty PSE","Power & Engineering"}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('BELRISE', 'BELRISE', false, '{}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('BERGEPAINT', 'BERGEPAINT', false, '{"Nifty Midcap 50"}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('BHARATFORG', 'BHARATFORG', true, '{"Nifty Auto"}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('BHEL', 'BHEL', false, '{}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('BIOCON', 'BIOCON', true, '{"Nifty Pharma"}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('BLUEDART', 'BLUEDART', false, '{}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('BLUESTARCO', 'BLUESTARCO', false, '{"Nifty Midcap 50"}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('BORORENEW', 'BORORENEW', false, '{}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('BOSCHLTD', 'BOSCHLTD', true, '{"Nifty Auto","Nifty Next 50"}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('BSE', 'BSE', false, '{NBFC}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('CAMS', 'CAMS', false, '{}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('CANBK', 'CANBK', false, '{"Nifty Next 50","Nifty PSU Bank"}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('CENTUM', 'CENTUM', false, '{}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('CESC', 'CESC', false, '{}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('CEWATER', 'CEWATER', false, '{}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('CGPOWER', 'CGPOWER', false, '{}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('CHAMBLFERT', 'CHAMBLFERT', false, '{}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('COALINDIA', 'COALINDIA', true, '{"Nifty 50","Nifty Energy","Nifty Metal","Nifty PSE"}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('COCHINSHIP', 'COCHINSHIP', false, '{}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('CONCOR', 'CONCOR', false, '{"Nifty Infra","Nifty Next 50","Nifty PSE"}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('CSBBANK', 'CSBBANK', false, '{}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('CUMMINSIND', 'CUMMINSIND', false, '{"Nifty Midcap 50","Power & Engineering"}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('DATAMATICS', 'DATAMATICS', false, '{}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('DATAPATTNS', 'DATAPATTNS', false, '{}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('DCBBANK', 'DCBBANK', false, '{}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('DEEPAKNTR', 'DEEPAKNTR', false, '{"Nifty Midcap 50"}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('DELHIVERY', 'DELHIVERY', false, '{"Nifty Midcap 50","Nifty Next 50"}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('DIACABS', 'DIACABS', false, '{}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('DIXON', 'DIXON', false, '{}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('DLF', 'DLF', true, '{"Nifty Infra","Nifty Next 50","Nifty Realty"}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('DLINKINDIA', 'DLINKINDIA', false, '{}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('DSSL', 'DSSL', false, '{}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('ECLERX', 'ECLERX', false, '{}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('EDELWEISS', 'EDELWEISS', false, '{}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('ELECON', 'ELECON', false, '{}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('EMMVEE', 'EMMVEE', false, '{}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('ENDURANCE', 'ENDURANCE', false, '{}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('EPACK', 'EPACK', false, '{}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('EQUITASBNK', 'EQUITASBNK', false, '{}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('ETERNAL', 'ETERNAL', true, '{"Nifty 50","Nifty Midcap 50","Nifty Next 50"}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('EXIDEIND', 'EXIDEIND', true, '{"Nifty Auto"}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('FEDERALBNK', 'FEDERALBNK', true, '{"Nifty Bank","Nifty Private Bank"}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('FIEMIND', 'FIEMIND', false, '{}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('FLUOROCHEM', 'FLUOROCHEM', false, '{}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('FORTIS', 'FORTIS', false, '{"Nifty Healthcare"}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('GESHIP', 'GESHIP', false, '{}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('GPPL', 'GPPL', false, '{}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('GRANULES', 'GRANULES', true, '{"Nifty Pharma"}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('GRASIM', 'GRASIM', true, '{"Nifty 50","Nifty Infra"}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('GROWW', 'GROWW', false, '{}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('HAL', 'HAL', false, '{"Nifty Infra","Nifty Next 50","Nifty PSE"}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('HAVELLS', 'HAVELLS', false, '{"Nifty Midcap 50","Nifty Next 50","Power & Engineering"}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('HBLENGINE', 'HBLENGINE', false, '{}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('HEROMOTOCO', 'HEROMOTOCO', true, '{"Nifty 50","Nifty Auto"}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('ICICIBANK', 'ICICIBANK', true, '{"Nifty 50","Nifty Bank","Nifty Financial Services","Nifty Private Bank"}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('ICIL', 'ICIL', false, '{}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('IDBI', 'IDBI', false, '{}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('IDEA', 'IDEA', false, '{"Nifty Next 50"}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('IIFLCAPS', 'IIFLCAPS', false, '{}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('INA', 'INA', false, '{}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('INDIANB', 'INDIANB', false, '{"Nifty PSU Bank"}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('INDUSINDBK', 'INDUSINDBK', true, '{"Nifty 50","Nifty Bank","Nifty Private Bank"}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('INFY', 'INFY', true, '{"Nifty 50","Nifty IT"}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('INOXGREEN', 'INOXGREEN', false, '{}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('INTELLECT', 'INTELLECT', false, '{}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('INTERARCH', 'INTERARCH', false, '{}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('IOLCP', 'IOLCP', false, '{}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('JKCEMENT', 'JKCEMENT', false, '{}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('JKLAKSHMI', 'JKLAKSHMI', false, '{}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('JSFB', 'JSFB', false, '{}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('JSWENERGY', 'JSWENERGY', false, '{"Power & Engineering"}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('KAYNES', 'KAYNES', false, '{}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('KEC', 'KEC', false, '{}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('KFINTECH', 'KFINTECH', false, '{NBFC}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('KIMS', 'KIMS', false, '{"Nifty Healthcare"}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('KOTAKBANK', 'KOTAKBANK', true, '{"Nifty 50","Nifty Bank","Nifty Financial Services","Nifty Private Bank"}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('KPIL', 'KPIL', false, '{}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('LAURUSLABS', 'LAURUSLABS', true, '{"Nifty Pharma"}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('LGBBROSLTD', 'LGBBROSLTD', false, '{}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('LGEINDIA', 'LGEINDIA', false, '{}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('LODHA', 'LODHA', true, '{"Nifty Infra","Nifty Next 50","Nifty Realty"}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('LOTUSDEV', 'LOTUSDEV', false, '{}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('LT', 'LT', true, '{"Nifty 50","Nifty Infra"}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('LTF', 'LTF', false, '{}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('LTM', 'LTM', true, '{"Nifty 50","Nifty IT"}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('MAHABANK', 'MAHABANK', false, '{"Nifty PSU Bank"}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('MAXHEALTH', 'MAXHEALTH', false, '{"Nifty Healthcare","Nifty Next 50"}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('MAZDOCK', 'MAZDOCK', false, '{"Power & Engineering"}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('MBEL', 'MBEL', false, '{}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('MEDANTA', 'MEDANTA', false, '{"Nifty Healthcare"}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('MIDHANI', 'MIDHANI', false, '{}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('MINDACORP', 'MINDACORP', false, '{}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('MOTHERSON', 'MOTHERSON', true, '{"Nifty Auto"}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('MPHASIS', 'MPHASIS', true, '{"Nifty IT","Nifty Midcap 50"}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('NATIONALUM', 'NATIONALUM', true, '{"Nifty Metal","Nifty PSE"}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('NAUKRI', 'NAUKRI', false, '{"Nifty Midcap 50"}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('NAVINFLUOR', 'NAVINFLUOR', false, '{}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('NBCC', 'NBCC', false, '{}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('NESCO', 'NESCO', false, '{}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('NEWGEN', 'NEWGEN', false, '{}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('NH', 'NH', false, '{}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('NUVAMA', 'NUVAMA', false, '{}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('NUVOCO', 'NUVOCO', false, '{}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('OBEROIRLTY', 'OBEROIRLTY', true, '{"Nifty Next 50","Nifty Realty"}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('OLECTRA', 'OLECTRA', false, '{}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('PERSISTENT', 'PERSISTENT', true, '{"Nifty IT","Nifty Midcap 50"}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('PFC', 'PFC', true, '{"Nifty Financial Services","Nifty PSE"}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('PGEL', 'PGEL', false, '{}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('PHANTOMFX-SM', 'PHANTOMFX-SM', false, '{}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('PNBHOUSING', 'PNBHOUSING', false, '{}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('POLICYBZR', 'POLICYBZR', false, '{}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('POLYCAB', 'POLYCAB', false, '{"Nifty Midcap 50","Nifty Next 50"}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('POWERGRID', 'POWERGRID', true, '{"Nifty 50","Nifty Energy","Nifty Infra","Nifty PSE"}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('PRAJIND', 'PRAJIND', false, '{"Power & Engineering"}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('PREMIERENE', 'PREMIERENE', false, '{}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('PRESTIGE', 'PRESTIGE', true, '{"Nifty Midcap 50","Nifty Realty"}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('PRICOLLTD', 'PRICOLLTD', false, '{}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('PTC', 'PTC', false, '{}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('RADIANTCMS', 'RADIANTCMS', false, '{}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('RAINBOW', 'RAINBOW', false, '{"Nifty Healthcare"}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('RAMCOCEM', 'RAMCOCEM', false, '{}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('RBLBANK', 'RBLBANK', false, '{"Nifty Private Bank"}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('RECLTD', 'RECLTD', true, '{"Nifty Financial Services","Nifty Next 50","Nifty PSE"}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('ROUTE', 'ROUTE', false, '{}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('RSYSTEMS', 'RSYSTEMS', false, '{}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('RUBICON', 'RUBICON', false, '{}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('SAIL', 'SAIL', true, '{"Nifty Metal","Nifty PSE"}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('SAMMAANCAP', 'SAMMAANCAP', false, '{}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('SASKEN', 'SASKEN', false, '{}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('SBICARD', 'SBICARD', true, '{NBFC,"Nifty Financial Services","Nifty Next 50"}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('SBIN', 'SBIN', true, '{"Nifty 50","Nifty Bank","Nifty Financial Services","Nifty PSE","Nifty PSU Bank"}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('SCHNEIDER', 'SCHNEIDER', false, '{}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('SCI', 'SCI', false, '{}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('SHAILY', 'SHAILY', false, '{}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('SHAREINDIA', 'SHAREINDIA', false, '{}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('SHOPERSTOP', 'SHOPERSTOP', false, '{"Nifty Midcap 50"}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('SHREECEM', 'SHREECEM', false, '{}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('SHRIPISTON', 'SHRIPISTON', false, '{}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('SIEMENS', 'SIEMENS', false, '{"Nifty Infra","Nifty Next 50","Power & Engineering"}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('SILVERCASE', 'SILVERCASE', false, '{}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('SOLARINDS', 'SOLARINDS', false, '{"Nifty Next 50"}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('SOUTHBANK', 'SOUTHBANK', false, '{}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('SRF', 'SRF', false, '{"Nifty Next 50"}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('STARCEMENT', 'STARCEMENT', false, '{}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('SUNDARMFIN', 'SUNDARMFIN', false, '{}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('SUNPHARMA', 'SUNPHARMA', true, '{"Nifty 50","Nifty Pharma"}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('SWIGGY', 'SWIGGY', false, '{}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('SYRMA', 'SYRMA', false, '{}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('TARIL', 'TARIL', false, '{}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('TATACHEM', 'TATACHEM', false, '{}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('TATAPOWER', 'TATAPOWER', true, '{"Nifty Energy","Nifty Next 50"}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('TBOTEK', 'TBOTEK', false, '{}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('TCS', 'TCS', true, '{"Nifty 50","Nifty IT"}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('TDPOWERSYS', 'TDPOWERSYS', false, '{}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('TECHNOE', 'TECHNOE', false, '{}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('TORNTPHARM', 'TORNTPHARM', true, '{"Nifty Midcap 50","Nifty Next 50","Nifty Pharma"}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('TORNTPOWER', 'TORNTPOWER', false, '{}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('TVSMOTOR', 'TVSMOTOR', true, '{"Nifty Auto"}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('UJJIVANSFB', 'UJJIVANSFB', false, '{}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('ULTRACEMCO', 'ULTRACEMCO', true, '{"Nifty 50","Nifty Infra"}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('UNIECOM', 'UNIECOM', false, '{}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('UNIONBANK', 'UNIONBANK', false, '{"Nifty Next 50","Nifty PSU Bank"}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('UNOMINDA', 'UNOMINDA', false, '{}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('UTKARSHBNK', 'UTKARSHBNK', false, '{}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('VARROC', 'VARROC', false, '{}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('VIKRAN', 'VIKRAN', false, '{}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('VINATIORGA', 'VINATIORGA', false, '{}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('WALCHANNAG', 'WALCHANNAG', false, '{}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('WEBELSOLAR', 'WEBELSOLAR', false, '{}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('WELSPUNLIV', 'WELSPUNLIV', false, '{}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('WIPRO', 'WIPRO', true, '{"Nifty 50","Nifty IT"}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('YATHARTH', 'YATHARTH', false, '{"Nifty Healthcare"}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('YESBANK', 'YESBANK', false, '{}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('ZAGGLE', 'ZAGGLE', false, '{}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('ZENTEC', 'ZENTEC', false, '{}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('ZYDUSLIFE', 'ZYDUSLIFE', true, '{"Nifty Next 50","Nifty Pharma"}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('FEDFINA', 'FEDFINA', false, '{NBFC}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('INDIASHLTR', 'INDIASHLTR', false, '{NBFC}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('IREDA', 'IREDA', false, '{NBFC}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('JMFINANCIL', 'JMFINANCIL', false, '{NBFC}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('MASFIN', 'MASFIN', false, '{NBFC}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('SBFC', 'SBFC', false, '{NBFC}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('ADANIENT', 'ADANIENT', true, '{"Nifty 50"}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('APOLLOHOSP', 'APOLLOHOSP', true, '{"Nifty 50","Nifty Healthcare"}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('BAJAJ-AUTO', 'BAJAJ-AUTO', true, '{"Nifty 50","Nifty Auto"}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('BAJAJFINSV', 'BAJAJFINSV', true, '{"Nifty 50","Nifty Financial Services"}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('BHARTIARTL', 'BHARTIARTL', true, '{"Nifty 50"}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('BPCL', 'BPCL', true, '{"Nifty 50","Nifty Energy","Nifty PSE"}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('BRITANNIA', 'BRITANNIA', true, '{"Nifty 50","Nifty FMCG"}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('CIPLA', 'CIPLA', true, '{"Nifty 50","Nifty Pharma"}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('DIVISLAB', 'DIVISLAB', true, '{"Nifty 50","Nifty Pharma"}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('DRREDDY', 'DRREDDY', true, '{"Nifty 50","Nifty Pharma"}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('EICHERMOT', 'EICHERMOT', true, '{"Nifty 50","Nifty Auto"}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('HINDALCO', 'HINDALCO', true, '{"Nifty 50","Nifty Metal"}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('ITC', 'ITC', true, '{"Nifty 50","Nifty FMCG"}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('JSWSTEEL', 'JSWSTEEL', true, '{"Nifty 50","Nifty Metal"}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('M&M', 'M&M', true, '{"Nifty 50","Nifty Auto"}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('MARUTI', 'MARUTI', true, '{"Nifty 50","Nifty Auto"}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('NESTLEIND', 'NESTLEIND', true, '{"Nifty 50","Nifty FMCG"}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('NTPC', 'NTPC', true, '{"Nifty 50","Nifty Energy","Nifty Infra","Nifty PSE"}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('ONGC', 'ONGC', true, '{"Nifty 50","Nifty Energy","Nifty PSE"}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('RELIANCE', 'RELIANCE', true, '{"Nifty 50","Nifty Energy"}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('SBILIFE', 'SBILIFE', true, '{"Nifty 50","Nifty Financial Services"}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('SHRIRAMFIN', 'SHRIRAMFIN', true, '{"Nifty 50","Nifty Financial Services"}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('TATACONSUM', 'TATACONSUM', true, '{"Nifty 50","Nifty FMCG"}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('TATASTEEL', 'TATASTEEL', true, '{"Nifty 50","Nifty Metal"}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('TECHM', 'TECHM', true, '{"Nifty 50","Nifty IT"}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('TITAN', 'TITAN', true, '{"Nifty 50"}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('TMCV', 'TMCV', true, '{"Nifty 50","Nifty Auto"}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('ASHOKLEY', 'ASHOKLEY', true, '{"Nifty Auto"}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('BALKRISIND', 'BALKRISIND', true, '{"Nifty Auto"}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('MRF', 'MRF', true, '{"Nifty Auto"}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('TIINDIA', 'TIINDIA', true, '{"Nifty Auto"}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('BANDHANBNK', 'BANDHANBNK', true, '{"Nifty Bank","Nifty Private Bank"}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('IDFCFIRSTB', 'IDFCFIRSTB', true, '{"Nifty Bank","Nifty Private Bank"}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('PNB', 'PNB', true, '{"Nifty Bank","Nifty Next 50","Nifty PSU Bank"}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('GAIL', 'GAIL', true, '{"Nifty Energy","Nifty Next 50","Nifty PSE"}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('IOC', 'IOC', true, '{"Nifty Energy","Nifty Next 50","Nifty PSE"}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('CHOLAFIN', 'CHOLAFIN', true, '{"Nifty Financial Services","Nifty Next 50"}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('ICICIPRULI', 'ICICIPRULI', true, '{"Nifty Financial Services","Nifty Next 50"}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('LICI', 'LICI', true, '{"Nifty Financial Services","Nifty Next 50"}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('M&MFIN', 'M&MFIN', true, '{"Nifty Financial Services","Nifty Next 50"}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('MUTHOOTFIN', 'MUTHOOTFIN', true, '{"Nifty Financial Services","Nifty Next 50"}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('COLPAL', 'COLPAL', true, '{"Nifty FMCG","Nifty Next 50"}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('DABUR', 'DABUR', true, '{"Nifty FMCG"}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('EMAMILTD', 'EMAMILTD', true, '{"Nifty FMCG"}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('GODREJCP', 'GODREJCP', true, '{"Nifty FMCG","Nifty Next 50"}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('MARICO', 'MARICO', true, '{"Nifty FMCG","Nifty Next 50"}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('PGHH', 'PGHH', true, '{"Nifty FMCG"}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('RADICO', 'RADICO', true, '{"Nifty FMCG"}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('UBL', 'UBL', true, '{"Nifty FMCG"}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('UNITDSPR', 'UNITDSPR', true, '{"Nifty FMCG","Nifty Next 50"}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('VBL', 'VBL', true, '{"Nifty FMCG","Nifty Next 50"}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('LALPATHLAB', 'LALPATHLAB', false, '{"Nifty Healthcare"}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('METROPOLIS', 'METROPOLIS', false, '{"Nifty Healthcare"}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('STARHEALTH', 'STARHEALTH', false, '{"Nifty Healthcare"}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('ABB', 'ABB', false, '{"Nifty Infra","Nifty Next 50","Power & Engineering"}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('IRCTC', 'IRCTC', false, '{"Nifty Infra","Nifty Midcap 50","Nifty Next 50","Nifty PSE"}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('IRFC', 'IRFC', false, '{"Nifty Infra","Nifty Next 50","Nifty PSE"}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('TATAELXSI', 'TATAELXSI', true, '{"Nifty IT","Nifty Next 50"}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('HATHWAY', 'HATHWAY', false, '{"Nifty Media"}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('NAZARA', 'NAZARA', false, '{"Nifty Media"}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('NETWORK18', 'NETWORK18', false, '{"Nifty Media"}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('PVRINOX', 'PVRINOX', false, '{"Nifty Media"}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('SAREGAMA', 'SAREGAMA', false, '{"Nifty Media"}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('SUNTV', 'SUNTV', false, '{"Nifty Media"}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('TIPSMUSIC', 'TIPSMUSIC', false, '{"Nifty Media"}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('TVTODAY', 'TVTODAY', false, '{"Nifty Media"}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('ZEEL', 'ZEEL', false, '{"Nifty Media"}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('APLAPOLLO', 'APLAPOLLO', true, '{"Nifty Metal"}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('JINDALSTEL', 'JINDALSTEL', true, '{"Nifty Metal","Nifty Next 50"}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('MOIL', 'MOIL', true, '{"Nifty Metal"}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('NMDC', 'NMDC', true, '{"Nifty Metal","Nifty PSE"}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('RATNAMANI', 'RATNAMANI', true, '{"Nifty Metal"}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('VEDL', 'VEDL', true, '{"Nifty Metal","Nifty Next 50"}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('ABFRL', 'ABFRL', false, '{"Nifty Midcap 50"}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('ALKEM', 'ALKEM', true, '{"Nifty Midcap 50","Nifty Pharma"}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('ASIANPAINT', 'ASIANPAINT', false, '{"Nifty Midcap 50"}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('ASTRAL', 'ASTRAL', false, '{"Nifty Midcap 50"}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('AUROPHARMA', 'AUROPHARMA', true, '{"Nifty Midcap 50","Nifty Next 50","Nifty Pharma"}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('BATAINDIA', 'BATAINDIA', false, '{"Nifty Midcap 50"}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('BRIGADE', 'BRIGADE', true, '{"Nifty Midcap 50","Nifty Realty"}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('CAMPUS', 'CAMPUS', false, '{"Nifty Midcap 50"}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('CARBORUNIV', 'CARBORUNIV', false, '{"Nifty Midcap 50"}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('CENTURYPLY', 'CENTURYPLY', false, '{"Nifty Midcap 50"}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('CROMPTON', 'CROMPTON', false, '{"Nifty Midcap 50"}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('DMART', 'DMART', false, '{"Nifty Midcap 50"}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('GRINDWELL', 'GRINDWELL', false, '{"Nifty Midcap 50"}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('INDHOTEL', 'INDHOTEL', false, '{"Nifty Midcap 50","Nifty Next 50"}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('IPCALAB', 'IPCALAB', true, '{"Nifty Midcap 50","Nifty Pharma"}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('KANSAINER', 'KANSAINER', false, '{"Nifty Midcap 50"}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('LUPIN', 'LUPIN', true, '{"Nifty Midcap 50","Nifty Next 50","Nifty Pharma"}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('MANYAVAR', 'MANYAVAR', false, '{"Nifty Midcap 50"}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('PAGEIND', 'PAGEIND', false, '{"Nifty Midcap 50"}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('PHOENIXLTD', 'PHOENIXLTD', true, '{"Nifty Midcap 50","Nifty Realty"}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('PIIND', 'PIIND', false, '{"Nifty Midcap 50"}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('RAYMOND', 'RAYMOND', false, '{"Nifty Midcap 50"}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('RELAXO', 'RELAXO', false, '{"Nifty Midcap 50"}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('SCHAEFFLER', 'SCHAEFFLER', false, '{"Nifty Midcap 50"}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('SKFINDIA', 'SKFINDIA', false, '{"Nifty Midcap 50"}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('SUNTECK', 'SUNTECK', true, '{"Nifty Midcap 50","Nifty Realty"}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('SUPREMEIND', 'SUPREMEIND', false, '{"Nifty Midcap 50"}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('TIMKEN', 'TIMKEN', false, '{"Nifty Midcap 50"}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('TRENT', 'TRENT', false, '{"Nifty Midcap 50","Nifty Next 50"}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('VOLTAS', 'VOLTAS', false, '{"Nifty Midcap 50"}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('WHIRLPOOL', 'WHIRLPOOL', false, '{"Nifty Midcap 50"}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('IIFL', 'IIFL', false, '{"Nifty Next 50"}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('INDUSTOWER', 'INDUSTOWER', false, '{"Nifty Next 50"}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('NHPC', 'NHPC', false, '{"Nifty Next 50","Nifty PSE"}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('OFSS', 'OFSS', false, '{"Nifty Next 50"}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('PIDILITIND', 'PIDILITIND', false, '{"Nifty Next 50"}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('SJVN', 'SJVN', false, '{"Nifty Next 50","Nifty PSE","Power & Engineering"}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('GLENMARK', 'GLENMARK', true, '{"Nifty Pharma"}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('NATCOPHARM', 'NATCOPHARM', true, '{"Nifty Pharma"}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('BANKINDIA', 'BANKINDIA', false, '{"Nifty PSU Bank"}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('CENTRALBK', 'CENTRALBK', false, '{"Nifty PSU Bank"}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('IOB', 'IOB', false, '{"Nifty PSU Bank"}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('PSB', 'PSB', false, '{"Nifty PSU Bank"}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('UCOBANK', 'UCOBANK', false, '{"Nifty PSU Bank"}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('MAHLIFE', 'MAHLIFE', true, '{"Nifty Realty"}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('SOBHA', 'SOBHA', true, '{"Nifty Realty"}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('AWL', 'AWL', false, '{}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('BAJAJHFL', 'BAJAJHFL', false, '{}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('POWERINDIA', 'POWERINDIA', false, '{"Power & Engineering"}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('CDSL', 'CDSL', false, '{}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('EASEMYTRIP', 'EASEMYTRIP', false, '{}', 'NSE', '2026-08-30 16:25:53.814876');
INSERT INTO public.ticker_master VALUES ('TVSSCS', 'TVSSCS', false, '{}', 'NSE', '2026-08-30 16:25:53.814876');


--
-- Data for Name: ticker_sector; Type: TABLE DATA; Schema: public; Owner: jmbxdbuser
--

INSERT INTO public.ticker_sector VALUES ('BSE', 2);
INSERT INTO public.ticker_sector VALUES ('FEDFINA', 2);
INSERT INTO public.ticker_sector VALUES ('INDIASHLTR', 2);
INSERT INTO public.ticker_sector VALUES ('IREDA', 2);
INSERT INTO public.ticker_sector VALUES ('JIOFIN', 2);
INSERT INTO public.ticker_sector VALUES ('JMFINANCIL', 2);
INSERT INTO public.ticker_sector VALUES ('KFINTECH', 2);
INSERT INTO public.ticker_sector VALUES ('MASFIN', 2);
INSERT INTO public.ticker_sector VALUES ('SBFC', 2);
INSERT INTO public.ticker_sector VALUES ('SBICARD', 2);
INSERT INTO public.ticker_sector VALUES ('ADANIENT', 3);
INSERT INTO public.ticker_sector VALUES ('ADANIPORTS', 3);
INSERT INTO public.ticker_sector VALUES ('APOLLOHOSP', 3);
INSERT INTO public.ticker_sector VALUES ('AXISBANK', 3);
INSERT INTO public.ticker_sector VALUES ('BAJAJ-AUTO', 3);
INSERT INTO public.ticker_sector VALUES ('BAJAJFINSV', 3);
INSERT INTO public.ticker_sector VALUES ('BAJFINANCE', 3);
INSERT INTO public.ticker_sector VALUES ('BHARTIARTL', 3);
INSERT INTO public.ticker_sector VALUES ('BPCL', 3);
INSERT INTO public.ticker_sector VALUES ('BRITANNIA', 3);
INSERT INTO public.ticker_sector VALUES ('CIPLA', 3);
INSERT INTO public.ticker_sector VALUES ('COALINDIA', 3);
INSERT INTO public.ticker_sector VALUES ('DIVISLAB', 3);
INSERT INTO public.ticker_sector VALUES ('DRREDDY', 3);
INSERT INTO public.ticker_sector VALUES ('EICHERMOT', 3);
INSERT INTO public.ticker_sector VALUES ('ETERNAL', 3);
INSERT INTO public.ticker_sector VALUES ('GRASIM', 3);
INSERT INTO public.ticker_sector VALUES ('HCLTECH', 3);
INSERT INTO public.ticker_sector VALUES ('HDFCBANK', 3);
INSERT INTO public.ticker_sector VALUES ('HDFCLIFE', 3);
INSERT INTO public.ticker_sector VALUES ('HEROMOTOCO', 3);
INSERT INTO public.ticker_sector VALUES ('HINDALCO', 3);
INSERT INTO public.ticker_sector VALUES ('HINDUNILVR', 3);
INSERT INTO public.ticker_sector VALUES ('ICICIBANK', 3);
INSERT INTO public.ticker_sector VALUES ('INDUSINDBK', 3);
INSERT INTO public.ticker_sector VALUES ('INFY', 3);
INSERT INTO public.ticker_sector VALUES ('ITC', 3);
INSERT INTO public.ticker_sector VALUES ('JSWSTEEL', 3);
INSERT INTO public.ticker_sector VALUES ('KOTAKBANK', 3);
INSERT INTO public.ticker_sector VALUES ('LT', 3);
INSERT INTO public.ticker_sector VALUES ('LTM', 3);
INSERT INTO public.ticker_sector VALUES ('M&M', 3);
INSERT INTO public.ticker_sector VALUES ('MARUTI', 3);
INSERT INTO public.ticker_sector VALUES ('NESTLEIND', 3);
INSERT INTO public.ticker_sector VALUES ('NTPC', 3);
INSERT INTO public.ticker_sector VALUES ('ONGC', 3);
INSERT INTO public.ticker_sector VALUES ('POWERGRID', 3);
INSERT INTO public.ticker_sector VALUES ('RELIANCE', 3);
INSERT INTO public.ticker_sector VALUES ('SBILIFE', 3);
INSERT INTO public.ticker_sector VALUES ('SBIN', 3);
INSERT INTO public.ticker_sector VALUES ('SHRIRAMFIN', 3);
INSERT INTO public.ticker_sector VALUES ('SUNPHARMA', 3);
INSERT INTO public.ticker_sector VALUES ('TATACONSUM', 3);
INSERT INTO public.ticker_sector VALUES ('TATASTEEL', 3);
INSERT INTO public.ticker_sector VALUES ('TCS', 3);
INSERT INTO public.ticker_sector VALUES ('TECHM', 3);
INSERT INTO public.ticker_sector VALUES ('TITAN', 3);
INSERT INTO public.ticker_sector VALUES ('TMCV', 3);
INSERT INTO public.ticker_sector VALUES ('ULTRACEMCO', 3);
INSERT INTO public.ticker_sector VALUES ('WIPRO', 3);
INSERT INTO public.ticker_sector VALUES ('ASHOKLEY', 4);
INSERT INTO public.ticker_sector VALUES ('BAJAJ-AUTO', 4);
INSERT INTO public.ticker_sector VALUES ('BALKRISIND', 4);
INSERT INTO public.ticker_sector VALUES ('BHARATFORG', 4);
INSERT INTO public.ticker_sector VALUES ('BOSCHLTD', 4);
INSERT INTO public.ticker_sector VALUES ('EICHERMOT', 4);
INSERT INTO public.ticker_sector VALUES ('EXIDEIND', 4);
INSERT INTO public.ticker_sector VALUES ('HEROMOTOCO', 4);
INSERT INTO public.ticker_sector VALUES ('M&M', 4);
INSERT INTO public.ticker_sector VALUES ('MARUTI', 4);
INSERT INTO public.ticker_sector VALUES ('MOTHERSON', 4);
INSERT INTO public.ticker_sector VALUES ('MRF', 4);
INSERT INTO public.ticker_sector VALUES ('TIINDIA', 4);
INSERT INTO public.ticker_sector VALUES ('TMCV', 4);
INSERT INTO public.ticker_sector VALUES ('TVSMOTOR', 4);
INSERT INTO public.ticker_sector VALUES ('AUBANK', 5);
INSERT INTO public.ticker_sector VALUES ('AXISBANK', 5);
INSERT INTO public.ticker_sector VALUES ('BANDHANBNK', 5);
INSERT INTO public.ticker_sector VALUES ('BANKBARODA', 5);
INSERT INTO public.ticker_sector VALUES ('FEDERALBNK', 5);
INSERT INTO public.ticker_sector VALUES ('HDFCBANK', 5);
INSERT INTO public.ticker_sector VALUES ('ICICIBANK', 5);
INSERT INTO public.ticker_sector VALUES ('IDFCFIRSTB', 5);
INSERT INTO public.ticker_sector VALUES ('INDUSINDBK', 5);
INSERT INTO public.ticker_sector VALUES ('KOTAKBANK', 5);
INSERT INTO public.ticker_sector VALUES ('PNB', 5);
INSERT INTO public.ticker_sector VALUES ('SBIN', 5);
INSERT INTO public.ticker_sector VALUES ('ADANIGREEN', 6);
INSERT INTO public.ticker_sector VALUES ('BPCL', 6);
INSERT INTO public.ticker_sector VALUES ('COALINDIA', 6);
INSERT INTO public.ticker_sector VALUES ('GAIL', 6);
INSERT INTO public.ticker_sector VALUES ('IOC', 6);
INSERT INTO public.ticker_sector VALUES ('NTPC', 6);
INSERT INTO public.ticker_sector VALUES ('ONGC', 6);
INSERT INTO public.ticker_sector VALUES ('POWERGRID', 6);
INSERT INTO public.ticker_sector VALUES ('RELIANCE', 6);
INSERT INTO public.ticker_sector VALUES ('TATAPOWER', 6);
INSERT INTO public.ticker_sector VALUES ('AXISBANK', 7);
INSERT INTO public.ticker_sector VALUES ('BAJAJFINSV', 7);
INSERT INTO public.ticker_sector VALUES ('BAJFINANCE', 7);
INSERT INTO public.ticker_sector VALUES ('CHOLAFIN', 7);
INSERT INTO public.ticker_sector VALUES ('HDFCBANK', 7);
INSERT INTO public.ticker_sector VALUES ('HDFCLIFE', 7);
INSERT INTO public.ticker_sector VALUES ('ICICIBANK', 7);
INSERT INTO public.ticker_sector VALUES ('ICICIPRULI', 7);
INSERT INTO public.ticker_sector VALUES ('JIOFIN', 7);
INSERT INTO public.ticker_sector VALUES ('KOTAKBANK', 7);
INSERT INTO public.ticker_sector VALUES ('LICI', 7);
INSERT INTO public.ticker_sector VALUES ('M&MFIN', 7);
INSERT INTO public.ticker_sector VALUES ('MUTHOOTFIN', 7);
INSERT INTO public.ticker_sector VALUES ('PFC', 7);
INSERT INTO public.ticker_sector VALUES ('POONAWALLA', 7);
INSERT INTO public.ticker_sector VALUES ('RECLTD', 7);
INSERT INTO public.ticker_sector VALUES ('SBICARD', 7);
INSERT INTO public.ticker_sector VALUES ('SBILIFE', 7);
INSERT INTO public.ticker_sector VALUES ('SBIN', 7);
INSERT INTO public.ticker_sector VALUES ('SHRIRAMFIN', 7);
INSERT INTO public.ticker_sector VALUES ('BRITANNIA', 8);
INSERT INTO public.ticker_sector VALUES ('COLPAL', 8);
INSERT INTO public.ticker_sector VALUES ('DABUR', 8);
INSERT INTO public.ticker_sector VALUES ('EMAMILTD', 8);
INSERT INTO public.ticker_sector VALUES ('GODREJCP', 8);
INSERT INTO public.ticker_sector VALUES ('HINDUNILVR', 8);
INSERT INTO public.ticker_sector VALUES ('ITC', 8);
INSERT INTO public.ticker_sector VALUES ('MARICO', 8);
INSERT INTO public.ticker_sector VALUES ('NESTLEIND', 8);
INSERT INTO public.ticker_sector VALUES ('PGHH', 8);
INSERT INTO public.ticker_sector VALUES ('RADICO', 8);
INSERT INTO public.ticker_sector VALUES ('TATACONSUM', 8);
INSERT INTO public.ticker_sector VALUES ('UBL', 8);
INSERT INTO public.ticker_sector VALUES ('UNITDSPR', 8);
INSERT INTO public.ticker_sector VALUES ('VBL', 8);
INSERT INTO public.ticker_sector VALUES ('APOLLOHOSP', 9);
INSERT INTO public.ticker_sector VALUES ('FORTIS', 9);
INSERT INTO public.ticker_sector VALUES ('KIMS', 9);
INSERT INTO public.ticker_sector VALUES ('LALPATHLAB', 9);
INSERT INTO public.ticker_sector VALUES ('MAXHEALTH', 9);
INSERT INTO public.ticker_sector VALUES ('MEDANTA', 9);
INSERT INTO public.ticker_sector VALUES ('METROPOLIS', 9);
INSERT INTO public.ticker_sector VALUES ('RAINBOW', 9);
INSERT INTO public.ticker_sector VALUES ('STARHEALTH', 9);
INSERT INTO public.ticker_sector VALUES ('YATHARTH', 9);
INSERT INTO public.ticker_sector VALUES ('ABB', 10);
INSERT INTO public.ticker_sector VALUES ('ADANIPORTS', 10);
INSERT INTO public.ticker_sector VALUES ('BEL', 10);
INSERT INTO public.ticker_sector VALUES ('CONCOR', 10);
INSERT INTO public.ticker_sector VALUES ('DLF', 10);
INSERT INTO public.ticker_sector VALUES ('GRASIM', 10);
INSERT INTO public.ticker_sector VALUES ('HAL', 10);
INSERT INTO public.ticker_sector VALUES ('IRCTC', 10);
INSERT INTO public.ticker_sector VALUES ('IRFC', 10);
INSERT INTO public.ticker_sector VALUES ('LODHA', 10);
INSERT INTO public.ticker_sector VALUES ('LT', 10);
INSERT INTO public.ticker_sector VALUES ('NTPC', 10);
INSERT INTO public.ticker_sector VALUES ('POWERGRID', 10);
INSERT INTO public.ticker_sector VALUES ('SIEMENS', 10);
INSERT INTO public.ticker_sector VALUES ('ULTRACEMCO', 10);
INSERT INTO public.ticker_sector VALUES ('COFORGE', 11);
INSERT INTO public.ticker_sector VALUES ('HCLTECH', 11);
INSERT INTO public.ticker_sector VALUES ('INFY', 11);
INSERT INTO public.ticker_sector VALUES ('LTM', 11);
INSERT INTO public.ticker_sector VALUES ('MPHASIS', 11);
INSERT INTO public.ticker_sector VALUES ('PERSISTENT', 11);
INSERT INTO public.ticker_sector VALUES ('TATAELXSI', 11);
INSERT INTO public.ticker_sector VALUES ('TCS', 11);
INSERT INTO public.ticker_sector VALUES ('TECHM', 11);
INSERT INTO public.ticker_sector VALUES ('WIPRO', 11);
INSERT INTO public.ticker_sector VALUES ('HATHWAY', 12);
INSERT INTO public.ticker_sector VALUES ('NAZARA', 12);
INSERT INTO public.ticker_sector VALUES ('NETWORK18', 12);
INSERT INTO public.ticker_sector VALUES ('PVRINOX', 12);
INSERT INTO public.ticker_sector VALUES ('SAREGAMA', 12);
INSERT INTO public.ticker_sector VALUES ('SUNTV', 12);
INSERT INTO public.ticker_sector VALUES ('TIPSMUSIC', 12);
INSERT INTO public.ticker_sector VALUES ('TVTODAY', 12);
INSERT INTO public.ticker_sector VALUES ('ZEEL', 12);
INSERT INTO public.ticker_sector VALUES ('APLAPOLLO', 13);
INSERT INTO public.ticker_sector VALUES ('COALINDIA', 13);
INSERT INTO public.ticker_sector VALUES ('HINDALCO', 13);
INSERT INTO public.ticker_sector VALUES ('HINDCOPPER', 13);
INSERT INTO public.ticker_sector VALUES ('JINDALSTEL', 13);
INSERT INTO public.ticker_sector VALUES ('JSWSTEEL', 13);
INSERT INTO public.ticker_sector VALUES ('MOIL', 13);
INSERT INTO public.ticker_sector VALUES ('NATIONALUM', 13);
INSERT INTO public.ticker_sector VALUES ('NMDC', 13);
INSERT INTO public.ticker_sector VALUES ('RATNAMANI', 13);
INSERT INTO public.ticker_sector VALUES ('SAIL', 13);
INSERT INTO public.ticker_sector VALUES ('TATASTEEL', 13);
INSERT INTO public.ticker_sector VALUES ('VEDL', 13);
INSERT INTO public.ticker_sector VALUES ('WELCORP', 13);
INSERT INTO public.ticker_sector VALUES ('ABFRL', 14);
INSERT INTO public.ticker_sector VALUES ('ALKEM', 14);
INSERT INTO public.ticker_sector VALUES ('ASIANPAINT', 14);
INSERT INTO public.ticker_sector VALUES ('ASTRAL', 14);
INSERT INTO public.ticker_sector VALUES ('ATUL', 14);
INSERT INTO public.ticker_sector VALUES ('AUROPHARMA', 14);
INSERT INTO public.ticker_sector VALUES ('BATAINDIA', 14);
INSERT INTO public.ticker_sector VALUES ('BERGEPAINT', 14);
INSERT INTO public.ticker_sector VALUES ('BLUESTARCO', 14);
INSERT INTO public.ticker_sector VALUES ('BRIGADE', 14);
INSERT INTO public.ticker_sector VALUES ('CAMPUS', 14);
INSERT INTO public.ticker_sector VALUES ('CARBORUNIV', 14);
INSERT INTO public.ticker_sector VALUES ('CENTURYPLY', 14);
INSERT INTO public.ticker_sector VALUES ('COFORGE', 14);
INSERT INTO public.ticker_sector VALUES ('CROMPTON', 14);
INSERT INTO public.ticker_sector VALUES ('CUMMINSIND', 14);
INSERT INTO public.ticker_sector VALUES ('DEEPAKNTR', 14);
INSERT INTO public.ticker_sector VALUES ('DELHIVERY', 14);
INSERT INTO public.ticker_sector VALUES ('DMART', 14);
INSERT INTO public.ticker_sector VALUES ('ETERNAL', 14);
INSERT INTO public.ticker_sector VALUES ('GODREJPROP', 14);
INSERT INTO public.ticker_sector VALUES ('GRINDWELL', 14);
INSERT INTO public.ticker_sector VALUES ('HAVELLS', 14);
INSERT INTO public.ticker_sector VALUES ('INDHOTEL', 14);
INSERT INTO public.ticker_sector VALUES ('IPCALAB', 14);
INSERT INTO public.ticker_sector VALUES ('IRCTC', 14);
INSERT INTO public.ticker_sector VALUES ('KANSAINER', 14);
INSERT INTO public.ticker_sector VALUES ('LUPIN', 14);
INSERT INTO public.ticker_sector VALUES ('MANYAVAR', 14);
INSERT INTO public.ticker_sector VALUES ('MPHASIS', 14);
INSERT INTO public.ticker_sector VALUES ('NAUKRI', 14);
INSERT INTO public.ticker_sector VALUES ('PAGEIND', 14);
INSERT INTO public.ticker_sector VALUES ('PAYTM', 14);
INSERT INTO public.ticker_sector VALUES ('PERSISTENT', 14);
INSERT INTO public.ticker_sector VALUES ('PHOENIXLTD', 14);
INSERT INTO public.ticker_sector VALUES ('PIIND', 14);
INSERT INTO public.ticker_sector VALUES ('POLYCAB', 14);
INSERT INTO public.ticker_sector VALUES ('PRESTIGE', 14);
INSERT INTO public.ticker_sector VALUES ('RAYMOND', 14);
INSERT INTO public.ticker_sector VALUES ('RELAXO', 14);
INSERT INTO public.ticker_sector VALUES ('SCHAEFFLER', 14);
INSERT INTO public.ticker_sector VALUES ('SHOPERSTOP', 14);
INSERT INTO public.ticker_sector VALUES ('SKFINDIA', 14);
INSERT INTO public.ticker_sector VALUES ('SUNTECK', 14);
INSERT INTO public.ticker_sector VALUES ('SUPREMEIND', 14);
INSERT INTO public.ticker_sector VALUES ('TIMKEN', 14);
INSERT INTO public.ticker_sector VALUES ('TORNTPHARM', 14);
INSERT INTO public.ticker_sector VALUES ('TRENT', 14);
INSERT INTO public.ticker_sector VALUES ('VOLTAS', 14);
INSERT INTO public.ticker_sector VALUES ('WHIRLPOOL', 14);
INSERT INTO public.ticker_sector VALUES ('ABB', 15);
INSERT INTO public.ticker_sector VALUES ('ADANIGREEN', 15);
INSERT INTO public.ticker_sector VALUES ('AMBUJACEM', 15);
INSERT INTO public.ticker_sector VALUES ('ATGL', 15);
INSERT INTO public.ticker_sector VALUES ('AUROPHARMA', 15);
INSERT INTO public.ticker_sector VALUES ('BANKBARODA', 15);
INSERT INTO public.ticker_sector VALUES ('BEL', 15);
INSERT INTO public.ticker_sector VALUES ('BOSCHLTD', 15);
INSERT INTO public.ticker_sector VALUES ('CANBK', 15);
INSERT INTO public.ticker_sector VALUES ('CHOLAFIN', 15);
INSERT INTO public.ticker_sector VALUES ('COLPAL', 15);
INSERT INTO public.ticker_sector VALUES ('CONCOR', 15);
INSERT INTO public.ticker_sector VALUES ('DELHIVERY', 15);
INSERT INTO public.ticker_sector VALUES ('DLF', 15);
INSERT INTO public.ticker_sector VALUES ('ETERNAL', 15);
INSERT INTO public.ticker_sector VALUES ('GAIL', 15);
INSERT INTO public.ticker_sector VALUES ('GODREJCP', 15);
INSERT INTO public.ticker_sector VALUES ('HAL', 15);
INSERT INTO public.ticker_sector VALUES ('HAVELLS', 15);
INSERT INTO public.ticker_sector VALUES ('ICICIPRULI', 15);
INSERT INTO public.ticker_sector VALUES ('IDEA', 15);
INSERT INTO public.ticker_sector VALUES ('IIFL', 15);
INSERT INTO public.ticker_sector VALUES ('INDHOTEL', 15);
INSERT INTO public.ticker_sector VALUES ('INDUSTOWER', 15);
INSERT INTO public.ticker_sector VALUES ('IOC', 15);
INSERT INTO public.ticker_sector VALUES ('IRCTC', 15);
INSERT INTO public.ticker_sector VALUES ('IRFC', 15);
INSERT INTO public.ticker_sector VALUES ('JINDALSTEL', 15);
INSERT INTO public.ticker_sector VALUES ('JIOFIN', 15);
INSERT INTO public.ticker_sector VALUES ('LICI', 15);
INSERT INTO public.ticker_sector VALUES ('LODHA', 15);
INSERT INTO public.ticker_sector VALUES ('LUPIN', 15);
INSERT INTO public.ticker_sector VALUES ('M&MFIN', 15);
INSERT INTO public.ticker_sector VALUES ('MARICO', 15);
INSERT INTO public.ticker_sector VALUES ('MAXHEALTH', 15);
INSERT INTO public.ticker_sector VALUES ('MUTHOOTFIN', 15);
INSERT INTO public.ticker_sector VALUES ('NHPC', 15);
INSERT INTO public.ticker_sector VALUES ('OBEROIRLTY', 15);
INSERT INTO public.ticker_sector VALUES ('OFSS', 15);
INSERT INTO public.ticker_sector VALUES ('PAYTM', 15);
INSERT INTO public.ticker_sector VALUES ('PIDILITIND', 15);
INSERT INTO public.ticker_sector VALUES ('PNB', 15);
INSERT INTO public.ticker_sector VALUES ('POLYCAB', 15);
INSERT INTO public.ticker_sector VALUES ('POONAWALLA', 15);
INSERT INTO public.ticker_sector VALUES ('RECLTD', 15);
INSERT INTO public.ticker_sector VALUES ('SBICARD', 15);
INSERT INTO public.ticker_sector VALUES ('SIEMENS', 15);
INSERT INTO public.ticker_sector VALUES ('SJVN', 15);
INSERT INTO public.ticker_sector VALUES ('SOLARINDS', 15);
INSERT INTO public.ticker_sector VALUES ('SRF', 15);
INSERT INTO public.ticker_sector VALUES ('TATAELXSI', 15);
INSERT INTO public.ticker_sector VALUES ('TATAPOWER', 15);
INSERT INTO public.ticker_sector VALUES ('TORNTPHARM', 15);
INSERT INTO public.ticker_sector VALUES ('TRENT', 15);
INSERT INTO public.ticker_sector VALUES ('UNIONBANK', 15);
INSERT INTO public.ticker_sector VALUES ('UNITDSPR', 15);
INSERT INTO public.ticker_sector VALUES ('VBL', 15);
INSERT INTO public.ticker_sector VALUES ('VEDL', 15);
INSERT INTO public.ticker_sector VALUES ('ZYDUSLIFE', 15);
INSERT INTO public.ticker_sector VALUES ('ALKEM', 16);
INSERT INTO public.ticker_sector VALUES ('AUROPHARMA', 16);
INSERT INTO public.ticker_sector VALUES ('BIOCON', 16);
INSERT INTO public.ticker_sector VALUES ('CIPLA', 16);
INSERT INTO public.ticker_sector VALUES ('DIVISLAB', 16);
INSERT INTO public.ticker_sector VALUES ('DRREDDY', 16);
INSERT INTO public.ticker_sector VALUES ('GLENMARK', 16);
INSERT INTO public.ticker_sector VALUES ('GRANULES', 16);
INSERT INTO public.ticker_sector VALUES ('IPCALAB', 16);
INSERT INTO public.ticker_sector VALUES ('LAURUSLABS', 16);
INSERT INTO public.ticker_sector VALUES ('LUPIN', 16);
INSERT INTO public.ticker_sector VALUES ('NATCOPHARM', 16);
INSERT INTO public.ticker_sector VALUES ('SUNPHARMA', 16);
INSERT INTO public.ticker_sector VALUES ('TORNTPHARM', 16);
INSERT INTO public.ticker_sector VALUES ('ZYDUSLIFE', 16);
INSERT INTO public.ticker_sector VALUES ('AUBANK', 17);
INSERT INTO public.ticker_sector VALUES ('AXISBANK', 17);
INSERT INTO public.ticker_sector VALUES ('BANDHANBNK', 17);
INSERT INTO public.ticker_sector VALUES ('FEDERALBNK', 17);
INSERT INTO public.ticker_sector VALUES ('HDFCBANK', 17);
INSERT INTO public.ticker_sector VALUES ('ICICIBANK', 17);
INSERT INTO public.ticker_sector VALUES ('IDFCFIRSTB', 17);
INSERT INTO public.ticker_sector VALUES ('INDUSINDBK', 17);
INSERT INTO public.ticker_sector VALUES ('KOTAKBANK', 17);
INSERT INTO public.ticker_sector VALUES ('RBLBANK', 17);
INSERT INTO public.ticker_sector VALUES ('BEL', 18);
INSERT INTO public.ticker_sector VALUES ('BPCL', 18);
INSERT INTO public.ticker_sector VALUES ('COALINDIA', 18);
INSERT INTO public.ticker_sector VALUES ('CONCOR', 18);
INSERT INTO public.ticker_sector VALUES ('GAIL', 18);
INSERT INTO public.ticker_sector VALUES ('HAL', 18);
INSERT INTO public.ticker_sector VALUES ('IOC', 18);
INSERT INTO public.ticker_sector VALUES ('IRCTC', 18);
INSERT INTO public.ticker_sector VALUES ('IRFC', 18);
INSERT INTO public.ticker_sector VALUES ('NATIONALUM', 18);
INSERT INTO public.ticker_sector VALUES ('NHPC', 18);
INSERT INTO public.ticker_sector VALUES ('NMDC', 18);
INSERT INTO public.ticker_sector VALUES ('NTPC', 18);
INSERT INTO public.ticker_sector VALUES ('ONGC', 18);
INSERT INTO public.ticker_sector VALUES ('PFC', 18);
INSERT INTO public.ticker_sector VALUES ('POWERGRID', 18);
INSERT INTO public.ticker_sector VALUES ('RECLTD', 18);
INSERT INTO public.ticker_sector VALUES ('SAIL', 18);
INSERT INTO public.ticker_sector VALUES ('SBIN', 18);
INSERT INTO public.ticker_sector VALUES ('SJVN', 18);
INSERT INTO public.ticker_sector VALUES ('BANKBARODA', 19);
INSERT INTO public.ticker_sector VALUES ('BANKINDIA', 19);
INSERT INTO public.ticker_sector VALUES ('CANBK', 19);
INSERT INTO public.ticker_sector VALUES ('CENTRALBK', 19);
INSERT INTO public.ticker_sector VALUES ('INDIANB', 19);
INSERT INTO public.ticker_sector VALUES ('IOB', 19);
INSERT INTO public.ticker_sector VALUES ('MAHABANK', 19);
INSERT INTO public.ticker_sector VALUES ('PNB', 19);
INSERT INTO public.ticker_sector VALUES ('PSB', 19);
INSERT INTO public.ticker_sector VALUES ('SBIN', 19);
INSERT INTO public.ticker_sector VALUES ('UCOBANK', 19);
INSERT INTO public.ticker_sector VALUES ('UNIONBANK', 19);
INSERT INTO public.ticker_sector VALUES ('BRIGADE', 20);
INSERT INTO public.ticker_sector VALUES ('DLF', 20);
INSERT INTO public.ticker_sector VALUES ('GODREJPROP', 20);
INSERT INTO public.ticker_sector VALUES ('LODHA', 20);
INSERT INTO public.ticker_sector VALUES ('MAHLIFE', 20);
INSERT INTO public.ticker_sector VALUES ('OBEROIRLTY', 20);
INSERT INTO public.ticker_sector VALUES ('PHOENIXLTD', 20);
INSERT INTO public.ticker_sector VALUES ('PRESTIGE', 20);
INSERT INTO public.ticker_sector VALUES ('SOBHA', 20);
INSERT INTO public.ticker_sector VALUES ('SUNTECK', 20);
INSERT INTO public.ticker_sector VALUES ('ABB', 21);
INSERT INTO public.ticker_sector VALUES ('BEL', 21);
INSERT INTO public.ticker_sector VALUES ('CUMMINSIND', 21);
INSERT INTO public.ticker_sector VALUES ('HAVELLS', 21);
INSERT INTO public.ticker_sector VALUES ('JSWENERGY', 21);
INSERT INTO public.ticker_sector VALUES ('MAZDOCK', 21);
INSERT INTO public.ticker_sector VALUES ('POWERINDIA', 21);
INSERT INTO public.ticker_sector VALUES ('PRAJIND', 21);
INSERT INTO public.ticker_sector VALUES ('SIEMENS', 21);
INSERT INTO public.ticker_sector VALUES ('SJVN', 21);


--
-- Data for Name: users; Type: TABLE DATA; Schema: public; Owner: jmbxdbuser
--

INSERT INTO public.users VALUES ('mbedval@gmail.com', 'mukesh', 'Bedval', 9, '2026-08-30 17:12:18.271754');
INSERT INTO public.users VALUES ('jind9189@gmail.com', 'Manish', 'Bedval', 7, '2026-08-30 17:16:54.683');


--
-- Data for Name: watchlist; Type: TABLE DATA; Schema: public; Owner: jmbxdbuser
--

INSERT INTO public.watchlist VALUES (1, 'Fii', 'Auto-seeded from watchlist file', '2026-08-30 16:25:53.814876');
INSERT INTO public.watchlist VALUES (4, 'Fundamental', 'Auto-seeded from watchlist file', '2026-08-30 16:25:53.814876');
INSERT INTO public.watchlist VALUES (5, 'Highvolatile', 'Auto-seeded from watchlist file', '2026-08-30 16:25:53.814876');
INSERT INTO public.watchlist VALUES (9, 'Mukeshbedval', 'Auto-seeded from watchlist file', '2026-08-30 16:25:53.814876');
INSERT INTO public.watchlist VALUES (10, 'Nbfc', 'Auto-seeded from watchlist file', '2026-08-30 16:25:53.814876');
INSERT INTO public.watchlist VALUES (11, 'Nifty 50', 'Auto-seeded from watchlist file', '2026-08-30 16:25:53.814876');
INSERT INTO public.watchlist VALUES (12, 'Nifty Auto', 'Auto-seeded from watchlist file', '2026-08-30 16:25:53.814876');
INSERT INTO public.watchlist VALUES (13, 'Nifty Bank', 'Auto-seeded from watchlist file', '2026-08-30 16:25:53.814876');
INSERT INTO public.watchlist VALUES (14, 'Nifty Energy', 'Auto-seeded from watchlist file', '2026-08-30 16:25:53.814876');
INSERT INTO public.watchlist VALUES (15, 'Nifty Financial Services', 'Auto-seeded from watchlist file', '2026-08-30 16:25:53.814876');
INSERT INTO public.watchlist VALUES (16, 'Nifty Fmcg', 'Auto-seeded from watchlist file', '2026-08-30 16:25:53.814876');
INSERT INTO public.watchlist VALUES (17, 'Nifty Healthcare', 'Auto-seeded from watchlist file', '2026-08-30 16:25:53.814876');
INSERT INTO public.watchlist VALUES (18, 'Nifty Infra', 'Auto-seeded from watchlist file', '2026-08-30 16:25:53.814876');
INSERT INTO public.watchlist VALUES (19, 'Nifty It', 'Auto-seeded from watchlist file', '2026-08-30 16:25:53.814876');
INSERT INTO public.watchlist VALUES (20, 'Nifty Media', 'Auto-seeded from watchlist file', '2026-08-30 16:25:53.814876');
INSERT INTO public.watchlist VALUES (21, 'Nifty Metal', 'Auto-seeded from watchlist file', '2026-08-30 16:25:53.814876');
INSERT INTO public.watchlist VALUES (22, 'Nifty Midcap 50', 'Auto-seeded from watchlist file', '2026-08-30 16:25:53.814876');
INSERT INTO public.watchlist VALUES (23, 'Nifty Next 50', 'Auto-seeded from watchlist file', '2026-08-30 16:25:53.814876');
INSERT INTO public.watchlist VALUES (24, 'Nifty Pharma', 'Auto-seeded from watchlist file', '2026-08-30 16:25:53.814876');
INSERT INTO public.watchlist VALUES (25, 'Nifty Private Bank', 'Auto-seeded from watchlist file', '2026-08-30 16:25:53.814876');
INSERT INTO public.watchlist VALUES (26, 'Nifty Pse', 'Auto-seeded from watchlist file', '2026-08-30 16:25:53.814876');
INSERT INTO public.watchlist VALUES (27, 'Nifty Psu Bank', 'Auto-seeded from watchlist file', '2026-08-30 16:25:53.814876');
INSERT INTO public.watchlist VALUES (28, 'Nifty Realty', 'Auto-seeded from watchlist file', '2026-08-30 16:25:53.814876');
INSERT INTO public.watchlist VALUES (29, 'Nisharg', 'Auto-seeded from watchlist file', '2026-08-30 16:25:53.814876');
INSERT INTO public.watchlist VALUES (30, 'Power Engg', 'Auto-seeded from watchlist file', '2026-08-30 16:25:53.814876');
INSERT INTO public.watchlist VALUES (7, 'Manish', 'Auto-seeded from watchlist file', '2026-08-30 16:25:53.814876');


--
-- Data for Name: watchlist_items; Type: TABLE DATA; Schema: public; Owner: jmbxdbuser
--

INSERT INTO public.watchlist_items VALUES (1, 'IDEAFORGE');
INSERT INTO public.watchlist_items VALUES (1, 'JSWINFRA');
INSERT INTO public.watchlist_items VALUES (1, 'LENSKART');
INSERT INTO public.watchlist_items VALUES (1, 'MCX');
INSERT INTO public.watchlist_items VALUES (1, 'PARAS');
INSERT INTO public.watchlist_items VALUES (1, 'PINELABS');
INSERT INTO public.watchlist_items VALUES (4, 'ACC');
INSERT INTO public.watchlist_items VALUES (4, 'ADANIGREEN');
INSERT INTO public.watchlist_items VALUES (4, 'ATUL');
INSERT INTO public.watchlist_items VALUES (4, 'COFORGE');
INSERT INTO public.watchlist_items VALUES (4, 'GODREJPROP');
INSERT INTO public.watchlist_items VALUES (4, 'HDFCLIFE');
INSERT INTO public.watchlist_items VALUES (4, 'HINDCOPPER');
INSERT INTO public.watchlist_items VALUES (4, 'HINDUNILVR');
INSERT INTO public.watchlist_items VALUES (4, 'MGL');
INSERT INTO public.watchlist_items VALUES (4, 'NETWEB');
INSERT INTO public.watchlist_items VALUES (4, 'PAYTM');
INSERT INTO public.watchlist_items VALUES (4, 'ROUTEMOBILE');
INSERT INTO public.watchlist_items VALUES (4, 'SONACOMS');
INSERT INTO public.watchlist_items VALUES (4, 'SYNGENE');
INSERT INTO public.watchlist_items VALUES (5, 'KPITTECH');
INSERT INTO public.watchlist_items VALUES (5, 'RAMCOSYS');
INSERT INTO public.watchlist_items VALUES (5, 'SONATSOFTW');
INSERT INTO public.watchlist_items VALUES (5, 'SURYODAY');
INSERT INTO public.watchlist_items VALUES (9, 'AADHARHFC');
INSERT INTO public.watchlist_items VALUES (9, 'AARTIIND');
INSERT INTO public.watchlist_items VALUES (9, 'AAVAS');
INSERT INTO public.watchlist_items VALUES (9, 'ACC');
INSERT INTO public.watchlist_items VALUES (9, 'ACCELYA');
INSERT INTO public.watchlist_items VALUES (9, 'ACMESOLAR');
INSERT INTO public.watchlist_items VALUES (9, 'ADANIGREEN');
INSERT INTO public.watchlist_items VALUES (9, 'ADANIPORTS');
INSERT INTO public.watchlist_items VALUES (9, 'AEROFLEX');
INSERT INTO public.watchlist_items VALUES (9, 'AFCONS');
INSERT INTO public.watchlist_items VALUES (9, 'AJANTPHARM');
INSERT INTO public.watchlist_items VALUES (9, 'AMBER');
INSERT INTO public.watchlist_items VALUES (9, 'AMBUJACEM');
INSERT INTO public.watchlist_items VALUES (9, 'APARINDS');
INSERT INTO public.watchlist_items VALUES (9, 'APOLLO');
INSERT INTO public.watchlist_items VALUES (9, 'APTUS');
INSERT INTO public.watchlist_items VALUES (9, 'ASTERDM');
INSERT INTO public.watchlist_items VALUES (9, 'ASTRAMICRO');
INSERT INTO public.watchlist_items VALUES (9, 'ATGL');
INSERT INTO public.watchlist_items VALUES (9, 'AUBANK');
INSERT INTO public.watchlist_items VALUES (9, 'AVALON');
INSERT INTO public.watchlist_items VALUES (9, 'AVANTEL');
INSERT INTO public.watchlist_items VALUES (9, 'AXISBANK');
INSERT INTO public.watchlist_items VALUES (9, 'AXISCADES');
INSERT INTO public.watchlist_items VALUES (9, 'BAJFINANCE');
INSERT INTO public.watchlist_items VALUES (9, 'BANKBARODA');
INSERT INTO public.watchlist_items VALUES (9, 'BASILIC-SM');
INSERT INTO public.watchlist_items VALUES (9, 'BBOX');
INSERT INTO public.watchlist_items VALUES (9, 'BDL');
INSERT INTO public.watchlist_items VALUES (9, 'BEL');
INSERT INTO public.watchlist_items VALUES (9, 'BELRISE');
INSERT INTO public.watchlist_items VALUES (9, 'BERGEPAINT');
INSERT INTO public.watchlist_items VALUES (9, 'BHARATFORG');
INSERT INTO public.watchlist_items VALUES (9, 'BHEL');
INSERT INTO public.watchlist_items VALUES (9, 'BIOCON');
INSERT INTO public.watchlist_items VALUES (9, 'BLUEDART');
INSERT INTO public.watchlist_items VALUES (9, 'BLUESTARCO');
INSERT INTO public.watchlist_items VALUES (9, 'BORORENEW');
INSERT INTO public.watchlist_items VALUES (9, 'BOSCHLTD');
INSERT INTO public.watchlist_items VALUES (9, 'BSE');
INSERT INTO public.watchlist_items VALUES (9, 'CAMS');
INSERT INTO public.watchlist_items VALUES (9, 'CANBK');
INSERT INTO public.watchlist_items VALUES (9, 'CENTUM');
INSERT INTO public.watchlist_items VALUES (9, 'CESC');
INSERT INTO public.watchlist_items VALUES (9, 'CEWATER');
INSERT INTO public.watchlist_items VALUES (9, 'CGPOWER');
INSERT INTO public.watchlist_items VALUES (9, 'CHAMBLFERT');
INSERT INTO public.watchlist_items VALUES (9, 'COALINDIA');
INSERT INTO public.watchlist_items VALUES (9, 'COCHINSHIP');
INSERT INTO public.watchlist_items VALUES (9, 'COFORGE');
INSERT INTO public.watchlist_items VALUES (9, 'CONCOR');
INSERT INTO public.watchlist_items VALUES (9, 'CSBBANK');
INSERT INTO public.watchlist_items VALUES (9, 'CUMMINSIND');
INSERT INTO public.watchlist_items VALUES (9, 'DATAMATICS');
INSERT INTO public.watchlist_items VALUES (9, 'DATAPATTNS');
INSERT INTO public.watchlist_items VALUES (9, 'DCBBANK');
INSERT INTO public.watchlist_items VALUES (9, 'DCXINDIA');
INSERT INTO public.watchlist_items VALUES (9, 'DEEPAKNTR');
INSERT INTO public.watchlist_items VALUES (9, 'DELHIVERY');
INSERT INTO public.watchlist_items VALUES (9, 'DIACABS');
INSERT INTO public.watchlist_items VALUES (9, 'DIXON');
INSERT INTO public.watchlist_items VALUES (9, 'DLF');
INSERT INTO public.watchlist_items VALUES (9, 'DLINKINDIA');
INSERT INTO public.watchlist_items VALUES (9, 'DSSL');
INSERT INTO public.watchlist_items VALUES (9, 'ECLERX');
INSERT INTO public.watchlist_items VALUES (9, 'EDELWEISS');
INSERT INTO public.watchlist_items VALUES (9, 'ELECON');
INSERT INTO public.watchlist_items VALUES (9, 'EMMVEE');
INSERT INTO public.watchlist_items VALUES (9, 'ENDURANCE');
INSERT INTO public.watchlist_items VALUES (9, 'EPACK');
INSERT INTO public.watchlist_items VALUES (9, 'EQUITASBNK');
INSERT INTO public.watchlist_items VALUES (9, 'ETERNAL');
INSERT INTO public.watchlist_items VALUES (9, 'EXIDEIND');
INSERT INTO public.watchlist_items VALUES (9, 'FEDERALBNK');
INSERT INTO public.watchlist_items VALUES (9, 'FIEMIND');
INSERT INTO public.watchlist_items VALUES (9, 'FLUOROCHEM');
INSERT INTO public.watchlist_items VALUES (9, 'FORTIS');
INSERT INTO public.watchlist_items VALUES (9, 'GESHIP');
INSERT INTO public.watchlist_items VALUES (9, 'GODREJPROP');
INSERT INTO public.watchlist_items VALUES (9, 'GPPL');
INSERT INTO public.watchlist_items VALUES (9, 'GRANULES');
INSERT INTO public.watchlist_items VALUES (9, 'GRASIM');
INSERT INTO public.watchlist_items VALUES (9, 'GROWW');
INSERT INTO public.watchlist_items VALUES (9, 'GVT&D');
INSERT INTO public.watchlist_items VALUES (9, 'HAL');
INSERT INTO public.watchlist_items VALUES (9, 'HAVELLS');
INSERT INTO public.watchlist_items VALUES (9, 'HBLENGINE');
INSERT INTO public.watchlist_items VALUES (9, 'HCLTECH');
INSERT INTO public.watchlist_items VALUES (9, 'HDFCBANK');
INSERT INTO public.watchlist_items VALUES (9, 'HEROMOTOCO');
INSERT INTO public.watchlist_items VALUES (9, 'ICICIBANK');
INSERT INTO public.watchlist_items VALUES (9, 'ICIL');
INSERT INTO public.watchlist_items VALUES (9, 'IDBI');
INSERT INTO public.watchlist_items VALUES (9, 'IDEA');
INSERT INTO public.watchlist_items VALUES (9, 'IIFLCAPS');
INSERT INTO public.watchlist_items VALUES (9, 'INA');
INSERT INTO public.watchlist_items VALUES (9, 'INDIANB');
INSERT INTO public.watchlist_items VALUES (9, 'INDUSINDBK');
INSERT INTO public.watchlist_items VALUES (9, 'INFY');
INSERT INTO public.watchlist_items VALUES (9, 'INOXGREEN');
INSERT INTO public.watchlist_items VALUES (9, 'INTELLECT');
INSERT INTO public.watchlist_items VALUES (9, 'INTERARCH');
INSERT INTO public.watchlist_items VALUES (9, 'IOLCP');
INSERT INTO public.watchlist_items VALUES (9, 'IXIGO');
INSERT INTO public.watchlist_items VALUES (9, 'JIOFIN');
INSERT INTO public.watchlist_items VALUES (9, 'JKCEMENT');
INSERT INTO public.watchlist_items VALUES (9, 'JKLAKSHMI');
INSERT INTO public.watchlist_items VALUES (9, 'JSFB');
INSERT INTO public.watchlist_items VALUES (9, 'JSWENERGY');
INSERT INTO public.watchlist_items VALUES (9, 'JSWINFRA');
INSERT INTO public.watchlist_items VALUES (9, 'KAYNES');
INSERT INTO public.watchlist_items VALUES (9, 'KEC');
INSERT INTO public.watchlist_items VALUES (9, 'KFINTECH');
INSERT INTO public.watchlist_items VALUES (9, 'KIMS');
INSERT INTO public.watchlist_items VALUES (9, 'KOTAKBANK');
INSERT INTO public.watchlist_items VALUES (9, 'KPIL');
INSERT INTO public.watchlist_items VALUES (9, 'KPITTECH');
INSERT INTO public.watchlist_items VALUES (9, 'LAURUSLABS');
INSERT INTO public.watchlist_items VALUES (9, 'LENSKART');
INSERT INTO public.watchlist_items VALUES (9, 'LGBBROSLTD');
INSERT INTO public.watchlist_items VALUES (9, 'LGEINDIA');
INSERT INTO public.watchlist_items VALUES (9, 'LODHA');
INSERT INTO public.watchlist_items VALUES (9, 'LOTUSDEV');
INSERT INTO public.watchlist_items VALUES (9, 'LT');
INSERT INTO public.watchlist_items VALUES (9, 'LTF');
INSERT INTO public.watchlist_items VALUES (9, 'LTM');
INSERT INTO public.watchlist_items VALUES (9, 'MAHABANK');
INSERT INTO public.watchlist_items VALUES (9, 'MAXHEALTH');
INSERT INTO public.watchlist_items VALUES (9, 'MAZDOCK');
INSERT INTO public.watchlist_items VALUES (9, 'MBEL');
INSERT INTO public.watchlist_items VALUES (9, 'MCX');
INSERT INTO public.watchlist_items VALUES (9, 'MEDANTA');
INSERT INTO public.watchlist_items VALUES (9, 'MIDHANI');
INSERT INTO public.watchlist_items VALUES (9, 'MINDACORP');
INSERT INTO public.watchlist_items VALUES (9, 'MOTHERSON');
INSERT INTO public.watchlist_items VALUES (9, 'MPHASIS');
INSERT INTO public.watchlist_items VALUES (9, 'MTARTECH');
INSERT INTO public.watchlist_items VALUES (9, 'NATIONALUM');
INSERT INTO public.watchlist_items VALUES (9, 'NAUKRI');
INSERT INTO public.watchlist_items VALUES (9, 'NAVINFLUOR');
INSERT INTO public.watchlist_items VALUES (9, 'NBCC');
INSERT INTO public.watchlist_items VALUES (9, 'NESCO');
INSERT INTO public.watchlist_items VALUES (9, 'NETWEB');
INSERT INTO public.watchlist_items VALUES (9, 'NEWGEN');
INSERT INTO public.watchlist_items VALUES (9, 'NH');
INSERT INTO public.watchlist_items VALUES (9, 'NSDL');
INSERT INTO public.watchlist_items VALUES (9, 'NUVAMA');
INSERT INTO public.watchlist_items VALUES (9, 'NUVOCO');
INSERT INTO public.watchlist_items VALUES (9, 'OBEROIRLTY');
INSERT INTO public.watchlist_items VALUES (9, 'OLECTRA');
INSERT INTO public.watchlist_items VALUES (9, 'PARAS');
INSERT INTO public.watchlist_items VALUES (9, 'PAYTM');
INSERT INTO public.watchlist_items VALUES (9, 'PERSISTENT');
INSERT INTO public.watchlist_items VALUES (9, 'PFC');
INSERT INTO public.watchlist_items VALUES (9, 'PGEL');
INSERT INTO public.watchlist_items VALUES (9, 'PHANTOMFX-SM');
INSERT INTO public.watchlist_items VALUES (9, 'PINELABS');
INSERT INTO public.watchlist_items VALUES (9, 'PNBHOUSING');
INSERT INTO public.watchlist_items VALUES (9, 'POLICYBZR');
INSERT INTO public.watchlist_items VALUES (9, 'POLYCAB');
INSERT INTO public.watchlist_items VALUES (9, 'POONAWALLA');
INSERT INTO public.watchlist_items VALUES (9, 'POWERGRID');
INSERT INTO public.watchlist_items VALUES (9, 'PRAJIND');
INSERT INTO public.watchlist_items VALUES (9, 'PREMIERENE');
INSERT INTO public.watchlist_items VALUES (9, 'PRESTIGE');
INSERT INTO public.watchlist_items VALUES (9, 'PRICOLLTD');
INSERT INTO public.watchlist_items VALUES (9, 'PTC');
INSERT INTO public.watchlist_items VALUES (9, 'RADIANTCMS');
INSERT INTO public.watchlist_items VALUES (9, 'RAINBOW');
INSERT INTO public.watchlist_items VALUES (9, 'RAMCOCEM');
INSERT INTO public.watchlist_items VALUES (9, 'RAMCOSYS');
INSERT INTO public.watchlist_items VALUES (9, 'RBLBANK');
INSERT INTO public.watchlist_items VALUES (9, 'RECLTD');
INSERT INTO public.watchlist_items VALUES (9, 'ROUTE');
INSERT INTO public.watchlist_items VALUES (9, 'RSYSTEMS');
INSERT INTO public.watchlist_items VALUES (9, 'RUBICON');
INSERT INTO public.watchlist_items VALUES (9, 'SAIL');
INSERT INTO public.watchlist_items VALUES (9, 'SAMMAANCAP');
INSERT INTO public.watchlist_items VALUES (9, 'SASKEN');
INSERT INTO public.watchlist_items VALUES (9, 'SBICARD');
INSERT INTO public.watchlist_items VALUES (9, 'SBIN');
INSERT INTO public.watchlist_items VALUES (9, 'SCHNEIDER');
INSERT INTO public.watchlist_items VALUES (9, 'SCI');
INSERT INTO public.watchlist_items VALUES (9, 'SHAILY');
INSERT INTO public.watchlist_items VALUES (9, 'SHAREINDIA');
INSERT INTO public.watchlist_items VALUES (9, 'SHOPERSTOP');
INSERT INTO public.watchlist_items VALUES (9, 'SHREECEM');
INSERT INTO public.watchlist_items VALUES (9, 'SHRIPISTON');
INSERT INTO public.watchlist_items VALUES (9, 'SIEMENS');
INSERT INTO public.watchlist_items VALUES (9, 'SILVERCASE');
INSERT INTO public.watchlist_items VALUES (9, 'SOLARINDS');
INSERT INTO public.watchlist_items VALUES (9, 'SOUTHBANK');
INSERT INTO public.watchlist_items VALUES (9, 'SRF');
INSERT INTO public.watchlist_items VALUES (9, 'STARCEMENT');
INSERT INTO public.watchlist_items VALUES (9, 'SUNDARMFIN');
INSERT INTO public.watchlist_items VALUES (9, 'SUNPHARMA');
INSERT INTO public.watchlist_items VALUES (9, 'SWIGGY');
INSERT INTO public.watchlist_items VALUES (9, 'SYRMA');
INSERT INTO public.watchlist_items VALUES (9, 'TARIL');
INSERT INTO public.watchlist_items VALUES (9, 'TATACHEM');
INSERT INTO public.watchlist_items VALUES (9, 'TATAPOWER');
INSERT INTO public.watchlist_items VALUES (9, 'TBOTEK');
INSERT INTO public.watchlist_items VALUES (9, 'TCS');
INSERT INTO public.watchlist_items VALUES (9, 'TDPOWERSYS');
INSERT INTO public.watchlist_items VALUES (9, 'TECHNOE');
INSERT INTO public.watchlist_items VALUES (9, 'TORNTPHARM');
INSERT INTO public.watchlist_items VALUES (9, 'TORNTPOWER');
INSERT INTO public.watchlist_items VALUES (9, 'TVSMOTOR');
INSERT INTO public.watchlist_items VALUES (9, 'UJJIVANSFB');
INSERT INTO public.watchlist_items VALUES (9, 'ULTRACEMCO');
INSERT INTO public.watchlist_items VALUES (9, 'UNIECOM');
INSERT INTO public.watchlist_items VALUES (9, 'UNIMECH');
INSERT INTO public.watchlist_items VALUES (9, 'UNIONBANK');
INSERT INTO public.watchlist_items VALUES (9, 'UNOMINDA');
INSERT INTO public.watchlist_items VALUES (9, 'UTKARSHBNK');
INSERT INTO public.watchlist_items VALUES (9, 'VARROC');
INSERT INTO public.watchlist_items VALUES (9, 'VIKRAN');
INSERT INTO public.watchlist_items VALUES (9, 'VINATIORGA');
INSERT INTO public.watchlist_items VALUES (9, 'WAAREEENER');
INSERT INTO public.watchlist_items VALUES (9, 'WALCHANNAG');
INSERT INTO public.watchlist_items VALUES (9, 'WEBELSOLAR');
INSERT INTO public.watchlist_items VALUES (9, 'WELSPUNLIV');
INSERT INTO public.watchlist_items VALUES (9, 'WIPRO');
INSERT INTO public.watchlist_items VALUES (9, 'YATHARTH');
INSERT INTO public.watchlist_items VALUES (9, 'YESBANK');
INSERT INTO public.watchlist_items VALUES (9, 'ZAGGLE');
INSERT INTO public.watchlist_items VALUES (9, 'ZENTEC');
INSERT INTO public.watchlist_items VALUES (9, 'ZYDUSLIFE');
INSERT INTO public.watchlist_items VALUES (10, 'BSE');
INSERT INTO public.watchlist_items VALUES (10, 'FEDFINA');
INSERT INTO public.watchlist_items VALUES (10, 'INDIASHLTR');
INSERT INTO public.watchlist_items VALUES (10, 'IREDA');
INSERT INTO public.watchlist_items VALUES (10, 'JIOFIN');
INSERT INTO public.watchlist_items VALUES (10, 'JMFINANCIL');
INSERT INTO public.watchlist_items VALUES (10, 'KFINTECH');
INSERT INTO public.watchlist_items VALUES (10, 'MASFIN');
INSERT INTO public.watchlist_items VALUES (10, 'SBFC');
INSERT INTO public.watchlist_items VALUES (10, 'SBICARD');
INSERT INTO public.watchlist_items VALUES (11, 'ADANIENT');
INSERT INTO public.watchlist_items VALUES (11, 'ADANIPORTS');
INSERT INTO public.watchlist_items VALUES (11, 'APOLLOHOSP');
INSERT INTO public.watchlist_items VALUES (11, 'AXISBANK');
INSERT INTO public.watchlist_items VALUES (11, 'BAJAJ-AUTO');
INSERT INTO public.watchlist_items VALUES (11, 'BAJAJFINSV');
INSERT INTO public.watchlist_items VALUES (11, 'BAJFINANCE');
INSERT INTO public.watchlist_items VALUES (11, 'BHARTIARTL');
INSERT INTO public.watchlist_items VALUES (11, 'BPCL');
INSERT INTO public.watchlist_items VALUES (11, 'BRITANNIA');
INSERT INTO public.watchlist_items VALUES (11, 'CIPLA');
INSERT INTO public.watchlist_items VALUES (11, 'COALINDIA');
INSERT INTO public.watchlist_items VALUES (11, 'DIVISLAB');
INSERT INTO public.watchlist_items VALUES (11, 'DRREDDY');
INSERT INTO public.watchlist_items VALUES (11, 'EICHERMOT');
INSERT INTO public.watchlist_items VALUES (11, 'ETERNAL');
INSERT INTO public.watchlist_items VALUES (11, 'GRASIM');
INSERT INTO public.watchlist_items VALUES (11, 'HCLTECH');
INSERT INTO public.watchlist_items VALUES (11, 'HDFCBANK');
INSERT INTO public.watchlist_items VALUES (11, 'HDFCLIFE');
INSERT INTO public.watchlist_items VALUES (11, 'HEROMOTOCO');
INSERT INTO public.watchlist_items VALUES (11, 'HINDALCO');
INSERT INTO public.watchlist_items VALUES (11, 'HINDUNILVR');
INSERT INTO public.watchlist_items VALUES (11, 'ICICIBANK');
INSERT INTO public.watchlist_items VALUES (11, 'INDUSINDBK');
INSERT INTO public.watchlist_items VALUES (11, 'INFY');
INSERT INTO public.watchlist_items VALUES (11, 'ITC');
INSERT INTO public.watchlist_items VALUES (11, 'JSWSTEEL');
INSERT INTO public.watchlist_items VALUES (11, 'KOTAKBANK');
INSERT INTO public.watchlist_items VALUES (11, 'LT');
INSERT INTO public.watchlist_items VALUES (11, 'LTM');
INSERT INTO public.watchlist_items VALUES (11, 'M&M');
INSERT INTO public.watchlist_items VALUES (11, 'MARUTI');
INSERT INTO public.watchlist_items VALUES (11, 'NESTLEIND');
INSERT INTO public.watchlist_items VALUES (11, 'NTPC');
INSERT INTO public.watchlist_items VALUES (11, 'ONGC');
INSERT INTO public.watchlist_items VALUES (11, 'POWERGRID');
INSERT INTO public.watchlist_items VALUES (11, 'RELIANCE');
INSERT INTO public.watchlist_items VALUES (11, 'SBILIFE');
INSERT INTO public.watchlist_items VALUES (11, 'SBIN');
INSERT INTO public.watchlist_items VALUES (11, 'SHRIRAMFIN');
INSERT INTO public.watchlist_items VALUES (11, 'SUNPHARMA');
INSERT INTO public.watchlist_items VALUES (11, 'TATACONSUM');
INSERT INTO public.watchlist_items VALUES (11, 'TATASTEEL');
INSERT INTO public.watchlist_items VALUES (11, 'TCS');
INSERT INTO public.watchlist_items VALUES (11, 'TECHM');
INSERT INTO public.watchlist_items VALUES (11, 'TITAN');
INSERT INTO public.watchlist_items VALUES (11, 'TMCV');
INSERT INTO public.watchlist_items VALUES (11, 'ULTRACEMCO');
INSERT INTO public.watchlist_items VALUES (11, 'WIPRO');
INSERT INTO public.watchlist_items VALUES (12, 'ASHOKLEY');
INSERT INTO public.watchlist_items VALUES (12, 'BAJAJ-AUTO');
INSERT INTO public.watchlist_items VALUES (12, 'BALKRISIND');
INSERT INTO public.watchlist_items VALUES (12, 'BHARATFORG');
INSERT INTO public.watchlist_items VALUES (12, 'BOSCHLTD');
INSERT INTO public.watchlist_items VALUES (12, 'EICHERMOT');
INSERT INTO public.watchlist_items VALUES (12, 'EXIDEIND');
INSERT INTO public.watchlist_items VALUES (12, 'HEROMOTOCO');
INSERT INTO public.watchlist_items VALUES (12, 'M&M');
INSERT INTO public.watchlist_items VALUES (12, 'MARUTI');
INSERT INTO public.watchlist_items VALUES (12, 'MOTHERSON');
INSERT INTO public.watchlist_items VALUES (12, 'MRF');
INSERT INTO public.watchlist_items VALUES (12, 'TIINDIA');
INSERT INTO public.watchlist_items VALUES (12, 'TMCV');
INSERT INTO public.watchlist_items VALUES (12, 'TVSMOTOR');
INSERT INTO public.watchlist_items VALUES (13, 'AUBANK');
INSERT INTO public.watchlist_items VALUES (13, 'AXISBANK');
INSERT INTO public.watchlist_items VALUES (13, 'BANDHANBNK');
INSERT INTO public.watchlist_items VALUES (13, 'BANKBARODA');
INSERT INTO public.watchlist_items VALUES (13, 'FEDERALBNK');
INSERT INTO public.watchlist_items VALUES (13, 'HDFCBANK');
INSERT INTO public.watchlist_items VALUES (13, 'ICICIBANK');
INSERT INTO public.watchlist_items VALUES (13, 'IDFCFIRSTB');
INSERT INTO public.watchlist_items VALUES (13, 'INDUSINDBK');
INSERT INTO public.watchlist_items VALUES (13, 'KOTAKBANK');
INSERT INTO public.watchlist_items VALUES (13, 'PNB');
INSERT INTO public.watchlist_items VALUES (13, 'SBIN');
INSERT INTO public.watchlist_items VALUES (14, 'ADANIGREEN');
INSERT INTO public.watchlist_items VALUES (14, 'BPCL');
INSERT INTO public.watchlist_items VALUES (14, 'COALINDIA');
INSERT INTO public.watchlist_items VALUES (14, 'GAIL');
INSERT INTO public.watchlist_items VALUES (14, 'IOC');
INSERT INTO public.watchlist_items VALUES (14, 'NTPC');
INSERT INTO public.watchlist_items VALUES (14, 'ONGC');
INSERT INTO public.watchlist_items VALUES (14, 'POWERGRID');
INSERT INTO public.watchlist_items VALUES (14, 'RELIANCE');
INSERT INTO public.watchlist_items VALUES (14, 'TATAPOWER');
INSERT INTO public.watchlist_items VALUES (15, 'AXISBANK');
INSERT INTO public.watchlist_items VALUES (15, 'BAJAJFINSV');
INSERT INTO public.watchlist_items VALUES (15, 'BAJFINANCE');
INSERT INTO public.watchlist_items VALUES (15, 'CHOLAFIN');
INSERT INTO public.watchlist_items VALUES (15, 'HDFCBANK');
INSERT INTO public.watchlist_items VALUES (15, 'HDFCLIFE');
INSERT INTO public.watchlist_items VALUES (15, 'ICICIBANK');
INSERT INTO public.watchlist_items VALUES (15, 'ICICIPRULI');
INSERT INTO public.watchlist_items VALUES (15, 'JIOFIN');
INSERT INTO public.watchlist_items VALUES (15, 'KOTAKBANK');
INSERT INTO public.watchlist_items VALUES (15, 'LICI');
INSERT INTO public.watchlist_items VALUES (15, 'M&MFIN');
INSERT INTO public.watchlist_items VALUES (15, 'MUTHOOTFIN');
INSERT INTO public.watchlist_items VALUES (15, 'PFC');
INSERT INTO public.watchlist_items VALUES (15, 'POONAWALLA');
INSERT INTO public.watchlist_items VALUES (15, 'RECLTD');
INSERT INTO public.watchlist_items VALUES (15, 'SBICARD');
INSERT INTO public.watchlist_items VALUES (15, 'SBILIFE');
INSERT INTO public.watchlist_items VALUES (15, 'SBIN');
INSERT INTO public.watchlist_items VALUES (15, 'SHRIRAMFIN');
INSERT INTO public.watchlist_items VALUES (16, 'BRITANNIA');
INSERT INTO public.watchlist_items VALUES (16, 'COLPAL');
INSERT INTO public.watchlist_items VALUES (16, 'DABUR');
INSERT INTO public.watchlist_items VALUES (16, 'EMAMILTD');
INSERT INTO public.watchlist_items VALUES (16, 'GODREJCP');
INSERT INTO public.watchlist_items VALUES (16, 'HINDUNILVR');
INSERT INTO public.watchlist_items VALUES (16, 'ITC');
INSERT INTO public.watchlist_items VALUES (16, 'MARICO');
INSERT INTO public.watchlist_items VALUES (16, 'NESTLEIND');
INSERT INTO public.watchlist_items VALUES (16, 'PGHH');
INSERT INTO public.watchlist_items VALUES (16, 'RADICO');
INSERT INTO public.watchlist_items VALUES (16, 'TATACONSUM');
INSERT INTO public.watchlist_items VALUES (16, 'UBL');
INSERT INTO public.watchlist_items VALUES (16, 'UNITDSPR');
INSERT INTO public.watchlist_items VALUES (16, 'VBL');
INSERT INTO public.watchlist_items VALUES (17, 'APOLLOHOSP');
INSERT INTO public.watchlist_items VALUES (17, 'FORTIS');
INSERT INTO public.watchlist_items VALUES (17, 'KIMS');
INSERT INTO public.watchlist_items VALUES (17, 'LALPATHLAB');
INSERT INTO public.watchlist_items VALUES (17, 'MAXHEALTH');
INSERT INTO public.watchlist_items VALUES (17, 'MEDANTA');
INSERT INTO public.watchlist_items VALUES (17, 'METROPOLIS');
INSERT INTO public.watchlist_items VALUES (17, 'RAINBOW');
INSERT INTO public.watchlist_items VALUES (17, 'STARHEALTH');
INSERT INTO public.watchlist_items VALUES (17, 'YATHARTH');
INSERT INTO public.watchlist_items VALUES (18, 'ABB');
INSERT INTO public.watchlist_items VALUES (18, 'ADANIPORTS');
INSERT INTO public.watchlist_items VALUES (18, 'BEL');
INSERT INTO public.watchlist_items VALUES (18, 'CONCOR');
INSERT INTO public.watchlist_items VALUES (18, 'DLF');
INSERT INTO public.watchlist_items VALUES (18, 'GRASIM');
INSERT INTO public.watchlist_items VALUES (18, 'HAL');
INSERT INTO public.watchlist_items VALUES (18, 'IRCTC');
INSERT INTO public.watchlist_items VALUES (18, 'IRFC');
INSERT INTO public.watchlist_items VALUES (18, 'LODHA');
INSERT INTO public.watchlist_items VALUES (18, 'LT');
INSERT INTO public.watchlist_items VALUES (18, 'NTPC');
INSERT INTO public.watchlist_items VALUES (18, 'POWERGRID');
INSERT INTO public.watchlist_items VALUES (18, 'SIEMENS');
INSERT INTO public.watchlist_items VALUES (18, 'ULTRACEMCO');
INSERT INTO public.watchlist_items VALUES (19, 'COFORGE');
INSERT INTO public.watchlist_items VALUES (19, 'HCLTECH');
INSERT INTO public.watchlist_items VALUES (19, 'INFY');
INSERT INTO public.watchlist_items VALUES (19, 'LTM');
INSERT INTO public.watchlist_items VALUES (19, 'MPHASIS');
INSERT INTO public.watchlist_items VALUES (19, 'PERSISTENT');
INSERT INTO public.watchlist_items VALUES (19, 'TATAELXSI');
INSERT INTO public.watchlist_items VALUES (19, 'TCS');
INSERT INTO public.watchlist_items VALUES (19, 'TECHM');
INSERT INTO public.watchlist_items VALUES (19, 'WIPRO');
INSERT INTO public.watchlist_items VALUES (20, 'HATHWAY');
INSERT INTO public.watchlist_items VALUES (20, 'NAZARA');
INSERT INTO public.watchlist_items VALUES (20, 'NETWORK18');
INSERT INTO public.watchlist_items VALUES (20, 'PVRINOX');
INSERT INTO public.watchlist_items VALUES (20, 'SAREGAMA');
INSERT INTO public.watchlist_items VALUES (20, 'SUNTV');
INSERT INTO public.watchlist_items VALUES (20, 'TIPSMUSIC');
INSERT INTO public.watchlist_items VALUES (20, 'TVTODAY');
INSERT INTO public.watchlist_items VALUES (20, 'ZEEL');
INSERT INTO public.watchlist_items VALUES (21, 'APLAPOLLO');
INSERT INTO public.watchlist_items VALUES (21, 'COALINDIA');
INSERT INTO public.watchlist_items VALUES (21, 'HINDALCO');
INSERT INTO public.watchlist_items VALUES (21, 'HINDCOPPER');
INSERT INTO public.watchlist_items VALUES (21, 'JINDALSTEL');
INSERT INTO public.watchlist_items VALUES (21, 'JSWSTEEL');
INSERT INTO public.watchlist_items VALUES (21, 'MOIL');
INSERT INTO public.watchlist_items VALUES (21, 'NATIONALUM');
INSERT INTO public.watchlist_items VALUES (21, 'NMDC');
INSERT INTO public.watchlist_items VALUES (21, 'RATNAMANI');
INSERT INTO public.watchlist_items VALUES (21, 'SAIL');
INSERT INTO public.watchlist_items VALUES (21, 'TATASTEEL');
INSERT INTO public.watchlist_items VALUES (21, 'VEDL');
INSERT INTO public.watchlist_items VALUES (21, 'WELCORP');
INSERT INTO public.watchlist_items VALUES (22, 'ABFRL');
INSERT INTO public.watchlist_items VALUES (22, 'ALKEM');
INSERT INTO public.watchlist_items VALUES (22, 'ASIANPAINT');
INSERT INTO public.watchlist_items VALUES (22, 'ASTRAL');
INSERT INTO public.watchlist_items VALUES (22, 'ATUL');
INSERT INTO public.watchlist_items VALUES (22, 'AUROPHARMA');
INSERT INTO public.watchlist_items VALUES (22, 'BATAINDIA');
INSERT INTO public.watchlist_items VALUES (22, 'BERGEPAINT');
INSERT INTO public.watchlist_items VALUES (22, 'BLUESTARCO');
INSERT INTO public.watchlist_items VALUES (22, 'BRIGADE');
INSERT INTO public.watchlist_items VALUES (22, 'CAMPUS');
INSERT INTO public.watchlist_items VALUES (22, 'CARBORUNIV');
INSERT INTO public.watchlist_items VALUES (22, 'CENTURYPLY');
INSERT INTO public.watchlist_items VALUES (22, 'COFORGE');
INSERT INTO public.watchlist_items VALUES (22, 'CROMPTON');
INSERT INTO public.watchlist_items VALUES (22, 'CUMMINSIND');
INSERT INTO public.watchlist_items VALUES (22, 'DEEPAKNTR');
INSERT INTO public.watchlist_items VALUES (22, 'DELHIVERY');
INSERT INTO public.watchlist_items VALUES (22, 'DMART');
INSERT INTO public.watchlist_items VALUES (22, 'ETERNAL');
INSERT INTO public.watchlist_items VALUES (22, 'GODREJPROP');
INSERT INTO public.watchlist_items VALUES (22, 'GRINDWELL');
INSERT INTO public.watchlist_items VALUES (22, 'HAVELLS');
INSERT INTO public.watchlist_items VALUES (22, 'INDHOTEL');
INSERT INTO public.watchlist_items VALUES (22, 'IPCALAB');
INSERT INTO public.watchlist_items VALUES (22, 'IRCTC');
INSERT INTO public.watchlist_items VALUES (22, 'KANSAINER');
INSERT INTO public.watchlist_items VALUES (22, 'LUPIN');
INSERT INTO public.watchlist_items VALUES (22, 'MANYAVAR');
INSERT INTO public.watchlist_items VALUES (22, 'MPHASIS');
INSERT INTO public.watchlist_items VALUES (22, 'NAUKRI');
INSERT INTO public.watchlist_items VALUES (22, 'PAGEIND');
INSERT INTO public.watchlist_items VALUES (22, 'PAYTM');
INSERT INTO public.watchlist_items VALUES (22, 'PERSISTENT');
INSERT INTO public.watchlist_items VALUES (22, 'PHOENIXLTD');
INSERT INTO public.watchlist_items VALUES (22, 'PIIND');
INSERT INTO public.watchlist_items VALUES (22, 'POLYCAB');
INSERT INTO public.watchlist_items VALUES (22, 'PRESTIGE');
INSERT INTO public.watchlist_items VALUES (22, 'RAYMOND');
INSERT INTO public.watchlist_items VALUES (22, 'RELAXO');
INSERT INTO public.watchlist_items VALUES (22, 'SCHAEFFLER');
INSERT INTO public.watchlist_items VALUES (22, 'SHOPERSTOP');
INSERT INTO public.watchlist_items VALUES (22, 'SKFINDIA');
INSERT INTO public.watchlist_items VALUES (22, 'SUNTECK');
INSERT INTO public.watchlist_items VALUES (22, 'SUPREMEIND');
INSERT INTO public.watchlist_items VALUES (22, 'TIMKEN');
INSERT INTO public.watchlist_items VALUES (22, 'TORNTPHARM');
INSERT INTO public.watchlist_items VALUES (22, 'TRENT');
INSERT INTO public.watchlist_items VALUES (22, 'VOLTAS');
INSERT INTO public.watchlist_items VALUES (22, 'WHIRLPOOL');
INSERT INTO public.watchlist_items VALUES (23, 'ABB');
INSERT INTO public.watchlist_items VALUES (23, 'ADANIGREEN');
INSERT INTO public.watchlist_items VALUES (23, 'AMBUJACEM');
INSERT INTO public.watchlist_items VALUES (23, 'ATGL');
INSERT INTO public.watchlist_items VALUES (23, 'AUROPHARMA');
INSERT INTO public.watchlist_items VALUES (23, 'BANKBARODA');
INSERT INTO public.watchlist_items VALUES (23, 'BEL');
INSERT INTO public.watchlist_items VALUES (23, 'BOSCHLTD');
INSERT INTO public.watchlist_items VALUES (23, 'CANBK');
INSERT INTO public.watchlist_items VALUES (23, 'CHOLAFIN');
INSERT INTO public.watchlist_items VALUES (23, 'COLPAL');
INSERT INTO public.watchlist_items VALUES (23, 'CONCOR');
INSERT INTO public.watchlist_items VALUES (23, 'DELHIVERY');
INSERT INTO public.watchlist_items VALUES (23, 'DLF');
INSERT INTO public.watchlist_items VALUES (23, 'ETERNAL');
INSERT INTO public.watchlist_items VALUES (23, 'GAIL');
INSERT INTO public.watchlist_items VALUES (23, 'GODREJCP');
INSERT INTO public.watchlist_items VALUES (23, 'HAL');
INSERT INTO public.watchlist_items VALUES (23, 'HAVELLS');
INSERT INTO public.watchlist_items VALUES (23, 'ICICIPRULI');
INSERT INTO public.watchlist_items VALUES (23, 'IDEA');
INSERT INTO public.watchlist_items VALUES (23, 'IIFL');
INSERT INTO public.watchlist_items VALUES (23, 'INDHOTEL');
INSERT INTO public.watchlist_items VALUES (23, 'INDUSTOWER');
INSERT INTO public.watchlist_items VALUES (23, 'IOC');
INSERT INTO public.watchlist_items VALUES (23, 'IRCTC');
INSERT INTO public.watchlist_items VALUES (23, 'IRFC');
INSERT INTO public.watchlist_items VALUES (23, 'JINDALSTEL');
INSERT INTO public.watchlist_items VALUES (23, 'JIOFIN');
INSERT INTO public.watchlist_items VALUES (23, 'LICI');
INSERT INTO public.watchlist_items VALUES (23, 'LODHA');
INSERT INTO public.watchlist_items VALUES (23, 'LUPIN');
INSERT INTO public.watchlist_items VALUES (23, 'M&MFIN');
INSERT INTO public.watchlist_items VALUES (23, 'MARICO');
INSERT INTO public.watchlist_items VALUES (23, 'MAXHEALTH');
INSERT INTO public.watchlist_items VALUES (23, 'MUTHOOTFIN');
INSERT INTO public.watchlist_items VALUES (23, 'NHPC');
INSERT INTO public.watchlist_items VALUES (23, 'OBEROIRLTY');
INSERT INTO public.watchlist_items VALUES (23, 'OFSS');
INSERT INTO public.watchlist_items VALUES (23, 'PAYTM');
INSERT INTO public.watchlist_items VALUES (23, 'PIDILITIND');
INSERT INTO public.watchlist_items VALUES (23, 'PNB');
INSERT INTO public.watchlist_items VALUES (23, 'POLYCAB');
INSERT INTO public.watchlist_items VALUES (23, 'POONAWALLA');
INSERT INTO public.watchlist_items VALUES (23, 'RECLTD');
INSERT INTO public.watchlist_items VALUES (23, 'SBICARD');
INSERT INTO public.watchlist_items VALUES (23, 'SIEMENS');
INSERT INTO public.watchlist_items VALUES (23, 'SJVN');
INSERT INTO public.watchlist_items VALUES (23, 'SOLARINDS');
INSERT INTO public.watchlist_items VALUES (23, 'SRF');
INSERT INTO public.watchlist_items VALUES (23, 'TATAELXSI');
INSERT INTO public.watchlist_items VALUES (23, 'TATAPOWER');
INSERT INTO public.watchlist_items VALUES (23, 'TORNTPHARM');
INSERT INTO public.watchlist_items VALUES (23, 'TRENT');
INSERT INTO public.watchlist_items VALUES (23, 'UNIONBANK');
INSERT INTO public.watchlist_items VALUES (23, 'UNITDSPR');
INSERT INTO public.watchlist_items VALUES (23, 'VBL');
INSERT INTO public.watchlist_items VALUES (23, 'VEDL');
INSERT INTO public.watchlist_items VALUES (23, 'ZYDUSLIFE');
INSERT INTO public.watchlist_items VALUES (24, 'ALKEM');
INSERT INTO public.watchlist_items VALUES (24, 'AUROPHARMA');
INSERT INTO public.watchlist_items VALUES (24, 'BIOCON');
INSERT INTO public.watchlist_items VALUES (24, 'CIPLA');
INSERT INTO public.watchlist_items VALUES (24, 'DIVISLAB');
INSERT INTO public.watchlist_items VALUES (24, 'DRREDDY');
INSERT INTO public.watchlist_items VALUES (24, 'GLENMARK');
INSERT INTO public.watchlist_items VALUES (24, 'GRANULES');
INSERT INTO public.watchlist_items VALUES (24, 'IPCALAB');
INSERT INTO public.watchlist_items VALUES (24, 'LAURUSLABS');
INSERT INTO public.watchlist_items VALUES (24, 'LUPIN');
INSERT INTO public.watchlist_items VALUES (24, 'NATCOPHARM');
INSERT INTO public.watchlist_items VALUES (24, 'SUNPHARMA');
INSERT INTO public.watchlist_items VALUES (24, 'TORNTPHARM');
INSERT INTO public.watchlist_items VALUES (24, 'ZYDUSLIFE');
INSERT INTO public.watchlist_items VALUES (25, 'AUBANK');
INSERT INTO public.watchlist_items VALUES (25, 'AXISBANK');
INSERT INTO public.watchlist_items VALUES (25, 'BANDHANBNK');
INSERT INTO public.watchlist_items VALUES (25, 'FEDERALBNK');
INSERT INTO public.watchlist_items VALUES (25, 'HDFCBANK');
INSERT INTO public.watchlist_items VALUES (25, 'ICICIBANK');
INSERT INTO public.watchlist_items VALUES (25, 'IDFCFIRSTB');
INSERT INTO public.watchlist_items VALUES (25, 'INDUSINDBK');
INSERT INTO public.watchlist_items VALUES (25, 'KOTAKBANK');
INSERT INTO public.watchlist_items VALUES (25, 'RBLBANK');
INSERT INTO public.watchlist_items VALUES (26, 'BEL');
INSERT INTO public.watchlist_items VALUES (26, 'BPCL');
INSERT INTO public.watchlist_items VALUES (26, 'COALINDIA');
INSERT INTO public.watchlist_items VALUES (26, 'CONCOR');
INSERT INTO public.watchlist_items VALUES (26, 'GAIL');
INSERT INTO public.watchlist_items VALUES (26, 'HAL');
INSERT INTO public.watchlist_items VALUES (26, 'IOC');
INSERT INTO public.watchlist_items VALUES (26, 'IRCTC');
INSERT INTO public.watchlist_items VALUES (26, 'IRFC');
INSERT INTO public.watchlist_items VALUES (26, 'NATIONALUM');
INSERT INTO public.watchlist_items VALUES (26, 'NHPC');
INSERT INTO public.watchlist_items VALUES (26, 'NMDC');
INSERT INTO public.watchlist_items VALUES (26, 'NTPC');
INSERT INTO public.watchlist_items VALUES (26, 'ONGC');
INSERT INTO public.watchlist_items VALUES (26, 'PFC');
INSERT INTO public.watchlist_items VALUES (26, 'POWERGRID');
INSERT INTO public.watchlist_items VALUES (26, 'RECLTD');
INSERT INTO public.watchlist_items VALUES (26, 'SAIL');
INSERT INTO public.watchlist_items VALUES (26, 'SBIN');
INSERT INTO public.watchlist_items VALUES (26, 'SJVN');
INSERT INTO public.watchlist_items VALUES (27, 'BANKBARODA');
INSERT INTO public.watchlist_items VALUES (27, 'BANKINDIA');
INSERT INTO public.watchlist_items VALUES (27, 'CANBK');
INSERT INTO public.watchlist_items VALUES (27, 'CENTRALBK');
INSERT INTO public.watchlist_items VALUES (27, 'INDIANB');
INSERT INTO public.watchlist_items VALUES (27, 'IOB');
INSERT INTO public.watchlist_items VALUES (27, 'MAHABANK');
INSERT INTO public.watchlist_items VALUES (27, 'PNB');
INSERT INTO public.watchlist_items VALUES (27, 'PSB');
INSERT INTO public.watchlist_items VALUES (27, 'SBIN');
INSERT INTO public.watchlist_items VALUES (27, 'UCOBANK');
INSERT INTO public.watchlist_items VALUES (27, 'UNIONBANK');
INSERT INTO public.watchlist_items VALUES (28, 'BRIGADE');
INSERT INTO public.watchlist_items VALUES (28, 'DLF');
INSERT INTO public.watchlist_items VALUES (28, 'GODREJPROP');
INSERT INTO public.watchlist_items VALUES (28, 'LODHA');
INSERT INTO public.watchlist_items VALUES (28, 'MAHLIFE');
INSERT INTO public.watchlist_items VALUES (28, 'OBEROIRLTY');
INSERT INTO public.watchlist_items VALUES (28, 'PHOENIXLTD');
INSERT INTO public.watchlist_items VALUES (28, 'PRESTIGE');
INSERT INTO public.watchlist_items VALUES (28, 'SOBHA');
INSERT INTO public.watchlist_items VALUES (28, 'SUNTECK');
INSERT INTO public.watchlist_items VALUES (29, 'ADANIGREEN');
INSERT INTO public.watchlist_items VALUES (29, 'APTUS');
INSERT INTO public.watchlist_items VALUES (29, 'AWL');
INSERT INTO public.watchlist_items VALUES (29, 'BAJAJHFL');
INSERT INTO public.watchlist_items VALUES (29, 'COFORGE');
INSERT INTO public.watchlist_items VALUES (29, 'GPPL');
INSERT INTO public.watchlist_items VALUES (29, 'IRFC');
INSERT INTO public.watchlist_items VALUES (29, 'TARIL');
INSERT INTO public.watchlist_items VALUES (30, 'ABB');
INSERT INTO public.watchlist_items VALUES (30, 'BEL');
INSERT INTO public.watchlist_items VALUES (30, 'CUMMINSIND');
INSERT INTO public.watchlist_items VALUES (30, 'HAVELLS');
INSERT INTO public.watchlist_items VALUES (30, 'JSWENERGY');
INSERT INTO public.watchlist_items VALUES (30, 'MAZDOCK');
INSERT INTO public.watchlist_items VALUES (30, 'POWERINDIA');
INSERT INTO public.watchlist_items VALUES (30, 'PRAJIND');
INSERT INTO public.watchlist_items VALUES (30, 'SIEMENS');
INSERT INTO public.watchlist_items VALUES (30, 'SJVN');
INSERT INTO public.watchlist_items VALUES (7, 'AEQUS');
INSERT INTO public.watchlist_items VALUES (7, 'BBOX');
INSERT INTO public.watchlist_items VALUES (7, 'DOLPHIN');
INSERT INTO public.watchlist_items VALUES (7, 'DYNAMATECH');
INSERT INTO public.watchlist_items VALUES (7, 'EMBDL');
INSERT INTO public.watchlist_items VALUES (7, 'GVT&D');
INSERT INTO public.watchlist_items VALUES (7, 'ICEMAKE');
INSERT INTO public.watchlist_items VALUES (7, 'JAINREC');
INSERT INTO public.watchlist_items VALUES (7, 'JLHL');
INSERT INTO public.watchlist_items VALUES (7, 'KSB');
INSERT INTO public.watchlist_items VALUES (7, 'MTARTECH');
INSERT INTO public.watchlist_items VALUES (7, 'PARADEEP');
INSERT INTO public.watchlist_items VALUES (7, 'PINELABS');
INSERT INTO public.watchlist_items VALUES (7, 'POWERMECH');
INSERT INTO public.watchlist_items VALUES (7, 'ROSSTECH');
INSERT INTO public.watchlist_items VALUES (7, 'ROTO');
INSERT INTO public.watchlist_items VALUES (7, 'RPOWER');
INSERT INTO public.watchlist_items VALUES (7, 'SANSERA');
INSERT INTO public.watchlist_items VALUES (7, 'SHARDACROP');
INSERT INTO public.watchlist_items VALUES (7, 'SMTEL');
INSERT INTO public.watchlist_items VALUES (7, 'SOLARA');
INSERT INTO public.watchlist_items VALUES (7, 'SOLARIUM');
INSERT INTO public.watchlist_items VALUES (7, 'SUNFLAG');
INSERT INTO public.watchlist_items VALUES (7, 'TEJASNET');
INSERT INTO public.watchlist_items VALUES (7, 'WPIL');


--
-- Name: alternative_names_id_seq; Type: SEQUENCE SET; Schema: public; Owner: jmbxdbuser
--

SELECT pg_catalog.setval('public.alternative_names_id_seq', 8, true);
SELECT pg_catalog.setval('public.sectors_id_seq', (SELECT MAX(id) FROM public.sectors), true);


--
-- Name: excluded_tickers_id_seq; Type: SEQUENCE SET; Schema: public; Owner: jmbxdbuser
--

SELECT pg_catalog.setval('public.excluded_tickers_id_seq', 3, true);


--
-- Name: fno_master_id_seq; Type: SEQUENCE SET; Schema: public; Owner: jmbxdbuser
--

SELECT pg_catalog.setval('public.fno_master_id_seq', 216, true);


--
-- PostgreSQL database dump complete
--

\unrestrict vWiPcON1dCJo7gvzD3HuAx5f3MR7YecJQsnNjpVDcta52ufrsWZaesIgib40drS

