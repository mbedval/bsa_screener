-- PostgreSQL Database Dump for bsa_db (Master Setup Baseline Only)
-- Host: 192.168.1.18 Port: 5432


-- Data for table alternative_names
INSERT INTO alternative_names ("id", "data_ticker", "current_ticker", "company_name", "notes", "last_updated") VALUES (1, 'ZOMATO', 'ETERNAL', 'Eternal Ltd (formerly Zomato Ltd)', 'Company rebranded to Eternal Ltd; raw download ticker is ZOMATO', '2026-01-01') ON CONFLICT DO NOTHING;
INSERT INTO alternative_names ("id", "data_ticker", "current_ticker", "company_name", "notes", "last_updated") VALUES (2, 'MOTHERSUMI', 'MOTHERSON', 'Samvardhana Motherson International Ltd', 'Name updated post-demerger restructuring', '2026-01-01') ON CONFLICT DO NOTHING;
INSERT INTO alternative_names ("id", "data_ticker", "current_ticker", "company_name", "notes", "last_updated") VALUES (3, 'CADILAHC', 'ZYDUSLIFE', 'Zydus Lifesciences Ltd', 'Rebranded from Cadila Healthcare Ltd', '2026-01-01') ON CONFLICT DO NOTHING;
INSERT INTO alternative_names ("id", "data_ticker", "current_ticker", "company_name", "notes", "last_updated") VALUES (4, 'LTI', 'LTIM', 'LTIMindtree Ltd', 'Merged entity of LTI and Mindtree Ltd', '2026-01-01') ON CONFLICT DO NOTHING;

-- Data for table excluded_tickers
INSERT INTO excluded_tickers ("id", "ticker", "reason", "added_by", "status", "last_error", "created_at") VALUES (1, 'ABAN', 'Download error: Stock suspended / delisted from exchange', 'SYSTEM_AUTO', 'EXCLUDED', 'yfinance download error 404: No data found for ABAN.NS', '2026-01-01') ON CONFLICT DO NOTHING;
INSERT INTO excluded_tickers ("id", "ticker", "reason", "added_by", "status", "last_error", "created_at") VALUES (2, 'DEWAN', 'Delisted stock insolvency proceedings', 'SYSTEM_AUTO', 'EXCLUDED', 'yfinance download error 404: Symbol not found', '2026-01-01') ON CONFLICT DO NOTHING;
INSERT INTO excluded_tickers ("id", "ticker", "reason", "added_by", "status", "last_error", "created_at") VALUES (3, 'SREINFRA', 'Trading halted / insolvency status', 'MANUAL', 'EXCLUDED', 'Manual exclusion: insolvency resolution', '2026-01-01') ON CONFLICT DO NOTHING;

-- Data for table fno_index_master
INSERT INTO fno_index_master ("id", "symbol", "underlying_name", "instrument_type", "serial_number", "is_active", "entry_date", "exit_date", "created_at") VALUES (1, 'NIFTY', 'Nifty 50 Index', 'INDEX', 1, True, '2026-09-05', NULL, '2026-09-05 09:35:50.004677+05:30') ON CONFLICT DO NOTHING;
INSERT INTO fno_index_master ("id", "symbol", "underlying_name", "instrument_type", "serial_number", "is_active", "entry_date", "exit_date", "created_at") VALUES (2, 'BANKNIFTY', 'Nifty Bank Index', 'INDEX', 2, True, '2026-09-05', NULL, '2026-09-05 09:35:50.004677+05:30') ON CONFLICT DO NOTHING;
INSERT INTO fno_index_master ("id", "symbol", "underlying_name", "instrument_type", "serial_number", "is_active", "entry_date", "exit_date", "created_at") VALUES (3, 'FINNIFTY', 'Nifty Financial Services Index', 'INDEX', 3, True, '2026-09-05', NULL, '2026-09-05 09:35:50.004677+05:30') ON CONFLICT DO NOTHING;
INSERT INTO fno_index_master ("id", "symbol", "underlying_name", "instrument_type", "serial_number", "is_active", "entry_date", "exit_date", "created_at") VALUES (4, 'MIDCPNIFTY', 'Nifty Midcap Select Index', 'INDEX', 4, True, '2026-09-05', NULL, '2026-09-05 09:35:50.004677+05:30') ON CONFLICT DO NOTHING;
INSERT INTO fno_index_master ("id", "symbol", "underlying_name", "instrument_type", "serial_number", "is_active", "entry_date", "exit_date", "created_at") VALUES (5, 'NIFTYNXT50', 'Nifty Next 50 Index', 'INDEX', 5, True, '2026-09-05', NULL, '2026-09-05 09:35:50.004677+05:30') ON CONFLICT DO NOTHING;
INSERT INTO fno_index_master ("id", "symbol", "underlying_name", "instrument_type", "serial_number", "is_active", "entry_date", "exit_date", "created_at") VALUES (6, 'BANKEX', 'BSE Bankex Index', 'INDEX', 6, True, '2026-09-05', NULL, '2026-09-05 09:35:50.004677+05:30') ON CONFLICT DO NOTHING;

-- Data for table fno_stock_master
INSERT INTO fno_stock_master ("id", "symbol", "underlying_name", "instrument_type", "serial_number", "is_active", "entry_date", "exit_date", "created_at") VALUES (1, 'RELIANCE', 'Reliance Industries Limited', 'STOCK', 1, True, '2026-09-05', NULL, '2026-09-05 09:35:49.982575+05:30') ON CONFLICT DO NOTHING;
INSERT INTO fno_stock_master ("id", "symbol", "underlying_name", "instrument_type", "serial_number", "is_active", "entry_date", "exit_date", "created_at") VALUES (2, 'TCS', 'Tata Consultancy Services Limited', 'STOCK', 2, True, '2026-09-05', NULL, '2026-09-05 09:35:49.982575+05:30') ON CONFLICT DO NOTHING;
INSERT INTO fno_stock_master ("id", "symbol", "underlying_name", "instrument_type", "serial_number", "is_active", "entry_date", "exit_date", "created_at") VALUES (3, 'WIPRO', 'Wipro Limited', 'STOCK', 3, True, '2026-09-05', NULL, '2026-09-05 09:35:49.982575+05:30') ON CONFLICT DO NOTHING;
INSERT INTO fno_stock_master ("id", "symbol", "underlying_name", "instrument_type", "serial_number", "is_active", "entry_date", "exit_date", "created_at") VALUES (4, 'INFY', 'Infosys Limited', 'STOCK', 4, True, '2026-09-05', NULL, '2026-09-05 09:35:49.982575+05:30') ON CONFLICT DO NOTHING;
INSERT INTO fno_stock_master ("id", "symbol", "underlying_name", "instrument_type", "serial_number", "is_active", "entry_date", "exit_date", "created_at") VALUES (5, 'HDFCBANK', 'HDFC Bank Limited', 'STOCK', 5, True, '2026-09-05', NULL, '2026-09-05 09:35:49.982575+05:30') ON CONFLICT DO NOTHING;

-- Data for table sectors
INSERT INTO sectors ("id", "name", "description", "created_at") VALUES (1, 'Information Technology', 'IT Services Software Development and Digital Solutions', '2026-09-05 09:35:49.814187') ON CONFLICT DO NOTHING;
INSERT INTO sectors ("id", "name", "description", "created_at") VALUES (2, 'Banking & Financials', 'Public/Private Sector Banks NBFCs and Asset Management', '2026-09-05 09:35:49.814187') ON CONFLICT DO NOTHING;
INSERT INTO sectors ("id", "name", "description", "created_at") VALUES (3, 'Automobiles', 'Passenger Vehicles Commercial Vehicles and Auto Components', '2026-09-05 09:35:49.814187') ON CONFLICT DO NOTHING;
INSERT INTO sectors ("id", "name", "description", "created_at") VALUES (4, 'Energy', 'Oil & Gas Exploration Refining Power Generation and Utilities', '2026-09-05 09:35:49.814187') ON CONFLICT DO NOTHING;
INSERT INTO sectors ("id", "name", "description", "created_at") VALUES (5, 'Healthcare', 'Pharmaceuticals Biotechnology and Hospital Chains', '2026-09-05 09:35:49.814187') ON CONFLICT DO NOTHING;
INSERT INTO sectors ("id", "name", "description", "created_at") VALUES (6, 'FMCG', 'Fast Moving Consumer Goods and Retail Products', '2026-09-05 09:35:49.814187') ON CONFLICT DO NOTHING;
INSERT INTO sectors ("id", "name", "description", "created_at") VALUES (7, 'Metal & Mining', 'Ferrous Non-Ferrous Metals and Mining Operations', '2026-09-05 09:35:49.814187') ON CONFLICT DO NOTHING;
INSERT INTO sectors ("id", "name", "description", "created_at") VALUES (8, 'Real Estate', 'Commercial and Residential Property Developers', '2026-09-05 09:35:49.814187') ON CONFLICT DO NOTHING;
INSERT INTO sectors ("id", "name", "description", "created_at") VALUES (9, 'Telecommunications', 'Telecom Operators and Communication Infrastructure', '2026-09-05 09:35:49.814187') ON CONFLICT DO NOTHING;
INSERT INTO sectors ("id", "name", "description", "created_at") VALUES (10, 'Capital Goods', 'Heavy Electrical Engineering and Industrial Equipment', '2026-09-05 09:35:49.814187') ON CONFLICT DO NOTHING;
INSERT INTO sectors ("id", "name", "description", "created_at") VALUES (11, 'Media & Entertainment', 'Broadcasting Digital Media and Entertainment Services', '2026-09-05 09:35:49.814187') ON CONFLICT DO NOTHING;
INSERT INTO sectors ("id", "name", "description", "created_at") VALUES (12, 'Consumer Durables', 'Home Appliances Electronics and Lifestyle Products', '2026-09-05 09:35:49.814187') ON CONFLICT DO NOTHING;
INSERT INTO sectors ("id", "name", "description", "created_at") VALUES (13, 'Chemical', 'Specialty Chemicals Agrochemicals and Petrochemicals', '2026-09-05 09:35:49.814187') ON CONFLICT DO NOTHING;
INSERT INTO sectors ("id", "name", "description", "created_at") VALUES (14, 'Defense', 'Defense Equipment Manufacturing and Aerospace Electronics', '2026-09-05 09:35:49.814187') ON CONFLICT DO NOTHING;
INSERT INTO sectors ("id", "name", "description", "created_at") VALUES (15, 'Shipping & Logistics', 'Port Operators Logistics and Supply Chain Services', '2026-09-05 09:35:49.814187') ON CONFLICT DO NOTHING;
INSERT INTO sectors ("id", "name", "description", "created_at") VALUES (16, 'Infrastructure', 'Construction Highways and Infrastructure Development', '2026-09-05 09:35:49.814187') ON CONFLICT DO NOTHING;
INSERT INTO sectors ("id", "name", "description", "created_at") VALUES (17, 'Services', 'Commercial Services E-Commerce and Hospitality', '2026-09-05 09:35:49.814187') ON CONFLICT DO NOTHING;
INSERT INTO sectors ("id", "name", "description", "created_at") VALUES (18, 'Miscellaneous', 'Diversified Conglomerates and Other Sectors', '2026-09-05 09:35:49.814187') ON CONFLICT DO NOTHING;

-- Data for table system_config
INSERT INTO system_config ("key", "value", "updated_at") VALUES ('telegram_bot_token', '', '2026-09-05 09:35:49.774873') ON CONFLICT DO NOTHING;
INSERT INTO system_config ("key", "value", "updated_at") VALUES ('telegram_chat_id', '', '2026-09-05 09:35:49.774873') ON CONFLICT DO NOTHING;
INSERT INTO system_config ("key", "value", "updated_at") VALUES ('gmail_user', '', '2026-09-05 09:35:49.774873') ON CONFLICT DO NOTHING;
INSERT INTO system_config ("key", "value", "updated_at") VALUES ('gmail_app_password', '', '2026-09-05 09:35:49.774873') ON CONFLICT DO NOTHING;

-- Data for table ticker_mappings
INSERT INTO ticker_mappings ("old_ticker", "new_ticker") VALUES ('BATA', 'BATAINDIA') ON CONFLICT DO NOTHING;
INSERT INTO ticker_mappings ("old_ticker", "new_ticker") VALUES ('BERGERPAINTS', 'BERGEPAINT') ON CONFLICT DO NOTHING;
INSERT INTO ticker_mappings ("old_ticker", "new_ticker") VALUES ('BLUESTARLT', 'BLUESTARCO') ON CONFLICT DO NOTHING;
INSERT INTO ticker_mappings ("old_ticker", "new_ticker") VALUES ('DATAPATNS', 'DATAPATTNS') ON CONFLICT DO NOTHING;
INSERT INTO ticker_mappings ("old_ticker", "new_ticker") VALUES ('LTIM', 'LTM') ON CONFLICT DO NOTHING;
INSERT INTO ticker_mappings ("old_ticker", "new_ticker") VALUES ('NALCO', 'NATIONALUM') ON CONFLICT DO NOTHING;
INSERT INTO ticker_mappings ("old_ticker", "new_ticker") VALUES ('NATCOPHARMA', 'NATCOPHARM') ON CONFLICT DO NOTHING;
INSERT INTO ticker_mappings ("old_ticker", "new_ticker") VALUES ('PVR', 'PVRINOX') ON CONFLICT DO NOTHING;
INSERT INTO ticker_mappings ("old_ticker", "new_ticker") VALUES ('TATAMOTORS', 'TMCV') ON CONFLICT DO NOTHING;
INSERT INTO ticker_mappings ("old_ticker", "new_ticker") VALUES ('TIPS', 'TIPSMUSIC') ON CONFLICT DO NOTHING;
INSERT INTO ticker_mappings ("old_ticker", "new_ticker") VALUES ('TV18BRDCST', 'NETWORK18') ON CONFLICT DO NOTHING;
INSERT INTO ticker_mappings ("old_ticker", "new_ticker") VALUES ('ZOMATO', 'ETERNAL') ON CONFLICT DO NOTHING;

-- Data for table ticker_master
INSERT INTO ticker_master ("ticker", "company_name", "is_fno", "sector", "index_memberships", "exchange", "updated_at") VALUES ('WIPRO', 'Wipro Limited', True, 'Technology', '[''NIFTY'', ''NIFTY50'']', 'NS', '2026-09-05 12:15:37') ON CONFLICT DO NOTHING;
INSERT INTO ticker_master ("ticker", "company_name", "is_fno", "sector", "index_memberships", "exchange", "updated_at") VALUES ('HDFCBANK', 'HDFC Bank Limited', True, 'Financial Services', '[''NIFTY'', ''NIFTY50'']', 'NS', '2026-09-05 12:15:37') ON CONFLICT DO NOTHING;
INSERT INTO ticker_master ("ticker", "company_name", "is_fno", "sector", "index_memberships", "exchange", "updated_at") VALUES ('INFY', 'Infosys Limited', True, 'Technology', '[''NIFTY'', ''NIFTY50'']', 'NS', '2026-09-05 12:15:37') ON CONFLICT DO NOTHING;
INSERT INTO ticker_master ("ticker", "company_name", "is_fno", "sector", "index_memberships", "exchange", "updated_at") VALUES ('TCS', 'Tata Consultancy Services Limited', True, 'Technology', '[''NIFTY'', ''NIFTY50'']', 'NS', '2026-09-05 12:15:37') ON CONFLICT DO NOTHING;
INSERT INTO ticker_master ("ticker", "company_name", "is_fno", "sector", "index_memberships", "exchange", "updated_at") VALUES ('RELIANCE', 'Reliance Industries Limited', True, 'Energy', '[''NIFTY'', ''NIFTY50'']', 'NS', '2026-09-05 12:15:38') ON CONFLICT DO NOTHING;

-- Data for table ticker_sector

-- Data for table users
INSERT INTO users ("email", "first_name", "last_name", "watchlist_id", "is_subscribed", "created_at") VALUES ('admin@example.com', 'Admin', 'User', 1, True, '2026-09-05 09:35:50.071664') ON CONFLICT DO NOTHING;
INSERT INTO users ("email", "first_name", "last_name", "watchlist_id", "is_subscribed", "created_at") VALUES ('trader@example.com', 'Pro', 'Trader', 1, True, '2026-09-05 09:35:50.071664') ON CONFLICT DO NOTHING;

-- Data for table watchlist
INSERT INTO watchlist ("id", "name", "description", "created_at") VALUES (1, 'Default Watchlist', 'Primary sample watchlist for active screening', '2026-09-05 09:35:50.023779') ON CONFLICT DO NOTHING;

-- Data for table watchlist_items
INSERT INTO watchlist_items ("watchlist_id", "ticker") VALUES (1, 'RELIANCE') ON CONFLICT DO NOTHING;
INSERT INTO watchlist_items ("watchlist_id", "ticker") VALUES (1, 'TCS') ON CONFLICT DO NOTHING;
INSERT INTO watchlist_items ("watchlist_id", "ticker") VALUES (1, 'WIPRO') ON CONFLICT DO NOTHING;
