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
    global _screener_cache_loaded
    _screener_cache_loaded = False
    return _load_screener_ticker_mappings()


def resolve_screener_company_id(ticker: str) -> Optional[int]:
    """
    Search Screener.in for ticker and return internal company ID integer.

    Fallback logic:
      1. Check screener_ticker_mappings table:
         a. If screener_company_id is set → use it directly (no search needed).
         b. If only screener_ticker is set → use it as the search query.
      2. Search screener.in API with the (possibly overridden) ticker name.
      3. Match by exact company URL pattern, then fall back to first result.
    """
    cleaned = ticker.replace(".NS", "").replace(".BO", "").strip().upper()

    # Step 1: Check DB mapping for this ticker
    mappings = _load_screener_ticker_mappings()
    mapping = mappings.get(cleaned)
    if mapping:
        # Direct company ID override — skip search entirely
        if mapping.get('screener_company_id'):
            direct_id = mapping['screener_company_id']
            logger.info(f"Screener direct ID override: {cleaned} → company_id={direct_id}")
            return direct_id
        search_name = mapping['screener_ticker']
        if search_name != cleaned:
            logger.info(f"Screener ticker mapping: {cleaned} → {search_name}")
    else:
        search_name = cleaned

    search_url = f"https://www.screener.in/api/company/search/?q={search_name}"
    try:
        res = requests.get(search_url, headers=DEFAULT_HEADERS, timeout=10)
        if res.status_code == 200:
            results = res.json()
            for item in results:
                # Match exact ticker in url e.g. /company/HDFCBANK/
                url = item.get("url", "")
                if f"/company/{search_name}/" in url or item.get("name", "").upper() == search_name:
                    return item.get("id")
            # If no exact URL match, pick first result if available
            if results and isinstance(results, list):
                return results[0].get("id")
    except Exception as err:
        logger.warning(f"Error resolving Screener company ID for {ticker}: {err}")
    return None


def fetch_mf_holdings_from_screener(company_id: int) -> Optional[Dict]:
    """
    Fetch DII / Mutual Fund quarterly shareholder data from Screener API.
    """
    api_url = f"https://www.screener.in/api/3/{company_id}/investors/domestic_institutions/quarterly/"
    try:
        res = requests.get(api_url, headers=DEFAULT_HEADERS, timeout=12)
        if res.status_code == 200:
            return res.json()
        else:
            logger.warning(f"Screener API returned HTTP {res.status_code} for company ID {company_id}")
    except Exception as err:
        logger.warning(f"Failed fetching Screener shareholders for company ID {company_id}: {err}")
    return None


def parse_and_rank_mf_holdings(raw_data: Dict) -> List[Dict]:
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

        if pct > 0:
            parsed.append({
                "fund_name": fund_name.strip(),
                "holding_pct": pct,
                "disclosure_date": latest_q
            })

    # Sort descending by holding %
    parsed.sort(key=lambda x: x["holding_pct"], reverse=True)

    # Assign ranks
    for rank, item in enumerate(parsed, 1):
        item["rank"] = rank

    return parsed


def save_mf_holdings_to_db(ticker: str, holdings: List[Dict]) -> bool:
    """
    Insert/Upsert parsed mutual fund holdings into `mf_holdings` PostgreSQL table.
    """
    if not holdings:
        return True

    now_str = datetime.now().isoformat()
    try:
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                # Delete old holdings for clean refresh
                cur.execute("DELETE FROM mf_holdings WHERE ticker = %s;", (ticker,))
                
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
                for h in holdings:
                    cur.execute(query, (
                        ticker,
                        h["fund_name"],
                        h["holding_pct"],
                        0,  # shares_held default
                        h["rank"],
                        h["disclosure_date"],
                        now_str
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
    return saved, len(holdings)


def download_all_mf_holdings(progress_callback=None, ticker_filter: Optional[str] = None) -> int:
    """
    Batch download MF holdings for all active tickers in ticker_master.
    """
    tickers = []
    with get_db_connection() as conn:
        with conn.cursor() as cur:
            if ticker_filter:
                cur.execute("SELECT ticker FROM ticker_master WHERE ticker = %s;", (ticker_filter,))
            else:
                cur.execute("SELECT ticker FROM ticker_master ORDER BY ticker ASC;")
            rows = cur.fetchall()
            tickers = [r[0] for r in rows]

    total = len(tickers)
    logger.info(f"Starting Mutual Fund holdings download for {total} tickers...")
    success_count = 0

    for i, t in enumerate(tickers):
        ok, num_saved = download_mf_holdings_for_ticker(t)
        if ok:
            success_count += 1
        if progress_callback:
            progress_callback(i + 1, total, t, num_saved)
        time.sleep(1.0)  # Rate limiting between requests

    logger.info(f"Completed MF holdings download: {success_count}/{total} succeeded.")
    return success_count
