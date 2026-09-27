"""
Mutual Fund Holdings Downloader Module.
Fetches mutual fund holdings per stock from Screener.in's public endpoint:
https://www.screener.in/api/3/{screener_company_id}/investors/domestic_institutions/quarterly/
and stores them in the `mf_holdings` table in PostgreSQL.
"""

import os
import time
import json
import logging
import requests
from datetime import datetime
from typing import List, Dict, Optional, Tuple
from engine.database.connection import get_db_connection

logger = logging.getLogger("bsa_mf_downloader")

DEFAULT_HEADERS = {
    "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "application/json, text/plain, */*",
    "X-Requested-With": "XMLHttpRequest"
}


_screener_ticker_cache: dict = {}
_screener_cache_loaded: bool = False
_screener_company_id_cache: dict = {}


def screener_safe_request(url: str, max_retries: int = 3, timeout: int = 10) -> Optional[requests.Response]:
    """Execute Screener API HTTP request with retry, backoff, and connection error handling."""
    for attempt in range(1, max_retries + 1):
        try:
            res = requests.get(url, headers=DEFAULT_HEADERS, timeout=timeout)
            if res.status_code == 200:
                return res
            elif res.status_code in (429, 502, 503, 504):
                sleep_time = attempt * 2.0
                logger.warning(f"Screener HTTP {res.status_code} for {url}. Retrying in {sleep_time}s (attempt {attempt}/{max_retries})...")
                time.sleep(sleep_time)
            else:
                logger.warning(f"Screener API returned HTTP {res.status_code} for {url}")
                return None
        except (requests.exceptions.RequestException, Exception) as err:
            sleep_time = attempt * 2.0
            if attempt < max_retries:
                logger.warning(f"Screener connection error ({err}). Retrying in {sleep_time}s (attempt {attempt}/{max_retries})...")
                time.sleep(sleep_time)
            else:
                logger.warning(f"Failed connecting to Screener ({url}) after {max_retries} attempts: {err}")
    return None


def _load_screener_ticker_mappings() -> dict:
    """Load yfinance_ticker → {screener_ticker, screener_company_id} mappings from DB into module-level cache."""
    global _screener_ticker_cache, _screener_cache_loaded
    if _screener_cache_loaded:
        return _screener_ticker_cache
    try:
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT yfinance_ticker, screener_ticker, screener_company_id FROM screener_ticker_mappings"
                )
                rows = cur.fetchall()
                _screener_ticker_cache = {
                    r[0].upper(): {
                        'screener_ticker': r[1].upper(),
                        'screener_company_id': r[2]  # may be None
                    }
                    for r in rows
                }
                _screener_cache_loaded = True
                logger.info(f"Loaded {len(_screener_ticker_cache)} screener ticker mappings from DB.")
    except Exception as err:
        logger.warning(f"Could not load screener ticker mappings from DB: {err}")
    return _screener_ticker_cache


def reload_screener_ticker_mappings():
    """Force reload the screener ticker mapping cache from DB (call after UI updates)."""
    global _screener_cache_loaded, _screener_company_id_cache
    _screener_cache_loaded = False
    _screener_company_id_cache.clear()
    return _load_screener_ticker_mappings()


def resolve_screener_company_id(ticker: str) -> Optional[int]:
    """
    Search Screener.in for ticker and return internal company ID integer.

    Fallback logic:
      0. Check in-memory resolved ID cache.
      1. Check screener_ticker_mappings table:
         a. If screener_company_id is set → use it directly (no search needed).
         b. If only screener_ticker is set → use it as the search query.
      2. Search screener.in API with the (possibly overridden) ticker name.
      3. Match by exact company URL pattern, then fall back to first result.
    """
    cleaned = ticker.replace(".NS", "").replace(".BO", "").strip().upper()

    # Step 0: Check in-memory cache first
    if cleaned in _screener_company_id_cache:
        return _screener_company_id_cache[cleaned]

    # Step 1: Check DB mapping for this ticker
    mappings = _load_screener_ticker_mappings()
    mapping = mappings.get(cleaned)
    if mapping:
        # Direct company ID override — skip search entirely
        if mapping.get('screener_company_id'):
            direct_id = mapping['screener_company_id']
            _screener_company_id_cache[cleaned] = direct_id
            logger.info(f"Screener direct ID override: {cleaned} → company_id={direct_id}")
            return direct_id
        search_name = mapping['screener_ticker']
        if search_name != cleaned:
            logger.info(f"Screener ticker mapping: {cleaned} → {search_name}")
    else:
        search_name = cleaned

    search_url = f"https://www.screener.in/api/company/search/?q={search_name}"
    res = screener_safe_request(search_url, max_retries=3, timeout=10)
    if res and res.status_code == 200:
        try:
            results = res.json()
            company_id = None
            for item in results:
                url = item.get("url", "")
                if f"/company/{search_name}/" in url or item.get("name", "").upper() == search_name:
                    company_id = item.get("id")
                    break
            if not company_id and results and isinstance(results, list):
                company_id = results[0].get("id")

            if company_id:
                _screener_company_id_cache[cleaned] = company_id
                return company_id
        except Exception as err:
            logger.warning(f"Error parsing Screener search result for {ticker}: {err}")
    return None


def fetch_mf_holdings_from_screener(company_id: int) -> Optional[Dict]:
    """
    Fetch DII / Mutual Fund quarterly shareholder data from Screener API.
    """
    api_url = f"https://www.screener.in/api/3/{company_id}/investors/domestic_institutions/quarterly/"
    res = screener_safe_request(api_url, max_retries=3, timeout=12)
    if res and res.status_code == 200:
        try:
            return res.json()
        except Exception:
            pass
    return None


def parse_and_rank_mf_holdings(raw_data: Dict) -> List[Dict]:
    """
    Parse raw Screener investors JSON and extract fund holdings sorted by holding_pct desc.
    Also retains historical quarter data for mf_behavior analysis.
    """
    parsed = []
    if not isinstance(raw_data, dict):
        return parsed

    for fund_name, holdings_by_q in raw_data.items():
        if not isinstance(holdings_by_q, dict):
            continue

        quarters = [q for q in holdings_by_q.keys() if q != "setAttributes"]
        if not quarters:
            continue

        latest_q = quarters[-1]
        pct_str = holdings_by_q.get(latest_q, "0")
        try:
            pct = float(pct_str)
        except (ValueError, TypeError):
            pct = 0.0

        # Extract historical quarters for this fund
        historical = []
        for q in quarters:
            try:
                hist_pct = float(holdings_by_q.get(q, "0"))
                historical.append({"quarter": q, "holding_pct": hist_pct})
            except:
                pass

        if pct > 0 or len(historical) > 0:
            parsed.append({
                "fund_name": fund_name.strip(),
                "holding_pct": pct,
                "disclosure_date": latest_q,
                "historical": historical
            })

    # Sort descending by holding %
    parsed.sort(key=lambda x: x["holding_pct"], reverse=True)

    # Assign ranks
    for rank, item in enumerate(parsed, 1):
        item["rank"] = rank

    return parsed


def quarter_str_to_date(q_str: str) -> str:
    try:
        month_str, year = q_str.split(" ")
        month_map = {"Mar": "03-31", "Jun": "06-30", "Sep": "09-30", "Dec": "12-31"}
        if month_str in month_map:
            return f"{year}-{month_map[month_str]}"
    except:
        pass
    return "2000-01-01"

def ensure_mf_fii_tables_exist(cur=None):
    """Ensure all required Mutual Fund and FII tables exist in PostgreSQL database."""
    ddl = """
        CREATE TABLE IF NOT EXISTS mf_amc (
            id SERIAL PRIMARY KEY,
            amc_name TEXT UNIQUE NOT NULL
        );

        CREATE TABLE IF NOT EXISTS mf_scheme (
            id SERIAL PRIMARY KEY,
            amc_id INTEGER REFERENCES mf_amc(id),
            scheme_code TEXT,
            scheme_name TEXT NOT NULL,
            UNIQUE(amc_id, scheme_name)
        );

        CREATE TABLE IF NOT EXISTS mf_holdings (
            id SERIAL PRIMARY KEY,
            ticker TEXT NOT NULL REFERENCES ticker_master(ticker) ON DELETE CASCADE,
            fund_name TEXT NOT NULL,
            holding_pct DOUBLE PRECISION DEFAULT 0.0,
            shares_held BIGINT DEFAULT 0,
            rank INTEGER DEFAULT 0,
            disclosure_date TEXT,
            downloaded_at TEXT,
            UNIQUE (ticker, fund_name)
        );
        CREATE INDEX IF NOT EXISTS idx_mf_holdings_ticker ON mf_holdings(ticker);

        CREATE TABLE IF NOT EXISTS mf_historical_holdings (
            id SERIAL PRIMARY KEY,
            snapshot_date DATE NOT NULL,
            scheme_id INTEGER REFERENCES mf_scheme(id),
            ticker TEXT REFERENCES ticker_master(ticker),
            isin TEXT,
            shares BIGINT,
            market_value DOUBLE PRECISION,
            portfolio_weight_pct DOUBLE PRECISION,
            source TEXT,
            source_date DATE,
            retrieved_at TIMESTAMP DEFAULT now(),
            UNIQUE(snapshot_date, scheme_id, ticker)
        );
        CREATE INDEX IF NOT EXISTS idx_mf_hist_ticker_date ON mf_historical_holdings(ticker, snapshot_date);

        CREATE TABLE IF NOT EXISTS fii_investor (
            id SERIAL PRIMARY KEY,
            investor_name TEXT NOT NULL UNIQUE
        );

        CREATE TABLE IF NOT EXISTS fii_historical_holdings (
            id SERIAL PRIMARY KEY,
            snapshot_date DATE NOT NULL,
            investor_id INTEGER REFERENCES fii_investor(id),
            ticker TEXT REFERENCES ticker_master(ticker),
            portfolio_weight_pct DOUBLE PRECISION,
            retrieved_at TIMESTAMP DEFAULT now(),
            UNIQUE(snapshot_date, investor_id, ticker)
        );
        CREATE INDEX IF NOT EXISTS idx_fii_hist_ticker_date ON fii_historical_holdings(ticker, snapshot_date);

        CREATE TABLE IF NOT EXISTS mf_behavior (
            ticker TEXT PRIMARY KEY REFERENCES ticker_master(ticker),
            data JSONB,
            updated_at TIMESTAMP DEFAULT now()
        );

        CREATE TABLE IF NOT EXISTS fii_behavior (
            ticker TEXT PRIMARY KEY REFERENCES ticker_master(ticker),
            data JSONB NOT NULL,
            updated_at TIMESTAMP DEFAULT now()
        );
    """
    if cur:
        cur.execute(ddl)
    else:
        with get_db_connection() as conn:
            with conn.cursor() as c:
                c.execute(ddl)
                conn.commit()


def save_mf_holdings_to_db(ticker: str, holdings: List[Dict]) -> bool:
    """
    Save parsed holdings to the DB (current snapshot and historical).
    """
    now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    try:
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                ensure_mf_fii_tables_exist(cur)

                # Delete old holdings for clean refresh
                cur.execute("DELETE FROM mf_holdings WHERE ticker = %s;", (ticker,))

                if holdings:
                    query = """
                        INSERT INTO mf_holdings (ticker, fund_name, holding_pct, shares_held, rank, disclosure_date, downloaded_at)
                        VALUES (%s, %s, %s, %s, %s, %s, %s)
                        ON CONFLICT (ticker, fund_name) 
                        DO UPDATE SET 
                            holding_pct = EXCLUDED.holding_pct,
                            rank = EXCLUDED.rank,
                            disclosure_date = EXCLUDED.disclosure_date,
                            downloaded_at = EXCLUDED.downloaded_at;
                    """
                    
                    hist_query = """
                        INSERT INTO mf_historical_holdings (snapshot_date, scheme_id, ticker, portfolio_weight_pct, source)
                        VALUES (%s, %s, %s, %s, 'screener')
                        ON CONFLICT (snapshot_date, scheme_id, ticker) 
                        DO UPDATE SET portfolio_weight_pct = EXCLUDED.portfolio_weight_pct;
                    """
                    
                    for h in holdings:
                        # 1. Save current snapshot
                        cur.execute(query, (
                            ticker,
                            h["fund_name"],
                            h["holding_pct"],
                            0,  # shares_held default
                            h["rank"],
                            h["disclosure_date"],
                            now_str
                        ))
                        
                        # 2. Save historical snapshots
                        if "historical" in h:
                            # resolve scheme_id
                            cur.execute("SELECT id FROM mf_scheme WHERE scheme_name = %s LIMIT 1", (h["fund_name"],))
                            res = cur.fetchone()
                            if res:
                                scheme_id = res[0]
                            else:
                                cur.execute("INSERT INTO mf_scheme (scheme_name) VALUES (%s) RETURNING id", (h["fund_name"],))
                                scheme_id = cur.fetchone()[0]

                            for hist in h["historical"]:
                                dt_str = quarter_str_to_date(hist["quarter"])
                                cur.execute(hist_query, (
                                    dt_str,
                                    scheme_id,
                                    ticker,
                                    hist["holding_pct"]
                                ))
                conn.commit()
        return True
    except Exception as err:
        logger.error(f"DB Error saving MF holdings for {ticker}: {err}")
        return False


def download_mf_holdings_for_ticker(ticker: str) -> Tuple[bool, int]:
    """
    Download and store MF holdings for a single ticker symbol.
    Returns (success_bool, num_holdings_saved).
    """
    cleaned = ticker.replace(".NS", "").replace(".BO", "").strip()
    company_id = resolve_screener_company_id(cleaned)
    if not company_id:
        logger.warning(f"Could not resolve Screener company ID for ticker: {cleaned}")
        return False, 0

    time.sleep(0.5)  # Polite delay
    raw_data = fetch_mf_holdings_from_screener(company_id)
    if raw_data is None:
        return False, 0

    holdings = parse_and_rank_mf_holdings(raw_data)
    saved = save_mf_holdings_to_db(cleaned, holdings)

    if saved:
        try:
            from engine.analyzers.mf_behavior import analyze_mf_behavior
            res = analyze_mf_behavior(cleaned)
            if res and "error" not in res:
                with get_db_connection() as conn:
                    with conn.cursor() as cur:
                        cur.execute("""
                            INSERT INTO mf_behavior (ticker, data, updated_at)
                            VALUES (%s, %s, now())
                            ON CONFLICT (ticker) DO UPDATE SET data = EXCLUDED.data, updated_at = now()
                        """, (cleaned, json.dumps(res)))
                        conn.commit()
        except Exception as e:
            logger.error(f"Error analyzing MF behavior for {cleaned} during download: {e}")

    return saved, len(holdings)


def download_all_mf_holdings(progress_callback=None, ticker_filter: Optional[str] = None, tickers: Optional[List[str]] = None) -> int:
    """
    Batch download MF holdings for active tickers in ticker_master (or specified tickers list).
    """
    if tickers is not None:
        tickers_list = [t.upper().strip() for t in tickers]
    else:
        tickers_list = []
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                if ticker_filter:
                    cur.execute("SELECT ticker FROM ticker_master WHERE ticker = %s;", (ticker_filter,))
                else:
                    cur.execute("SELECT ticker FROM ticker_master ORDER BY ticker ASC;")
                rows = cur.fetchall()
                tickers_list = [r[0] for r in rows]

    total = len(tickers_list)
    logger.info(f"Starting Mutual Fund holdings download for {total} tickers...")
    success_count = 0

    for i, t in enumerate(tickers_list):
        ok, num_saved = download_mf_holdings_for_ticker(t)
        if ok:
            success_count += 1
        if progress_callback:
            progress_callback(i + 1, total, t, num_saved)
        time.sleep(1.0)  # Rate limiting between requests

    logger.info(f"Completed MF holdings download: {success_count}/{total} succeeded.")
    return success_count

def fetch_fii_holdings_from_screener(company_id: int) -> Optional[Dict]:
    """
    Fetch FII / Foreign Institution quarterly shareholder data from Screener API.
    """
    api_url = f"https://www.screener.in/api/3/{company_id}/investors/foreign_institutions/quarterly/"
    res = screener_safe_request(api_url, max_retries=3, timeout=12)
    if res and res.status_code == 200:
        try:
            return res.json()
        except Exception:
            pass
    return None

def parse_and_rank_fii_holdings(raw_data: Dict) -> List[Dict]:
    """
    Parse raw Screener investors JSON and extract fund holdings sorted by holding_pct desc.
    """
    parsed = []
    if not isinstance(raw_data, dict):
        return parsed

    for fund_name, holdings_by_q in raw_data.items():
        if not isinstance(holdings_by_q, dict):
            continue

        quarters = [q for q in holdings_by_q.keys() if q != "setAttributes"]
        if not quarters:
            continue

        latest_q = quarters[-1]
        pct_str = holdings_by_q.get(latest_q, "0")
        try:
            pct = float(pct_str)
        except (ValueError, TypeError):
            pct = 0.0

        historical = []
        for q in quarters:
            val_str = holdings_by_q[q]
            try:
                val = float(val_str)
                # Ensure date parses correctly
                q_date = datetime.strptime(q, "%b %Y")
                # Go to end of month
                if q_date.month in [3, 6, 9, 12]:
                    import calendar
                    last_day = calendar.monthrange(q_date.year, q_date.month)[1]
                    q_date = q_date.replace(day=last_day)
                historical.append({"quarter": q, "date": q_date.strftime("%Y-%m-%d"), "pct": val})
            except Exception:
                pass

        if historical:
            parsed.append({
                "fund_name": fund_name.strip(),
                "holding_pct": pct,
                "historical": historical
            })

    parsed.sort(key=lambda x: x["holding_pct"], reverse=True)
    return parsed

def download_fii_holdings_for_ticker(ticker: str) -> tuple[bool, int]:
    """
    Coordinates FII holdings fetch for a single ticker and saves to database.
    """
    company_id = resolve_screener_company_id(ticker)
    if not company_id:
        logger.warning(f"Skipping FII download for {ticker} - Screener company ID not found.")
        return False, 0

    raw_data = fetch_fii_holdings_from_screener(company_id)
    if not raw_data:
        return False, 0

    parsed_data = parse_and_rank_fii_holdings(raw_data)
    if not parsed_data:
        return False, 0

    # Upsert to DB
    records_upserted = 0
    now_ts = datetime.now()
    
    with get_db_connection() as conn:
        with conn.cursor() as cur:
            ensure_mf_fii_tables_exist(cur)
            for item in parsed_data:
                investor_name = item['fund_name']
                
                # Upsert investor
                cur.execute("""
                    INSERT INTO fii_investor (investor_name)
                    VALUES (%s)
                    ON CONFLICT (investor_name) DO NOTHING
                    RETURNING id;
                """, (investor_name,))
                inv_id_res = cur.fetchone()
                
                if inv_id_res:
                    inv_id = inv_id_res[0]
                else:
                    cur.execute("SELECT id FROM fii_investor WHERE investor_name = %s", (investor_name,))
                    inv_id = cur.fetchone()[0]
                
                # Insert historical quarters
                for hist in item['historical']:
                    cur.execute("""
                        INSERT INTO fii_historical_holdings 
                        (snapshot_date, investor_id, ticker, portfolio_weight_pct, retrieved_at)
                        VALUES (%s, %s, %s, %s, %s)
                        ON CONFLICT (snapshot_date, investor_id, ticker) 
                        DO UPDATE SET portfolio_weight_pct = EXCLUDED.portfolio_weight_pct,
                                      retrieved_at = EXCLUDED.retrieved_at
                    """, (hist['date'], inv_id, ticker, hist['pct'], now_ts))
                    records_upserted += 1
            
            conn.commit()

    logger.info(f"[{ticker}] Upserted {records_upserted} historical FII holding records.")
    return True, records_upserted

def download_all_fii_holdings(progress_callback=None, tickers: Optional[List[str]] = None):
    from engine.utils.helpers import get_spot_tickers
    if tickers is not None:
        target_tickers = [t.upper().strip() for t in tickers]
    else:
        target_tickers = get_spot_tickers()
    if not target_tickers:
        return
    for idx, ticker in enumerate(target_tickers):
        ok, count = download_fii_holdings_for_ticker(ticker)
        if progress_callback:
            progress_callback(idx + 1, len(target_tickers), ticker, count)

