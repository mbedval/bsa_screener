import logging
import os
from engine.database.connection import get_db_connection

logger = logging.getLogger("bsa_helpers")

# Cache for mappings and configurations to reduce database calls
_ticker_mappings = None
_system_config = {}

def clear_system_config_cache():
    """Clear the system config in-memory cache."""
    global _system_config
    _system_config = {}

def load_ticker_mappings_from_db():
    """Load ticker mappings from the database `ticker_mappings` table."""
    global _ticker_mappings
    if _ticker_mappings is not None:
        return _ticker_mappings

    _ticker_mappings = {}
    try:
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT old_ticker, new_ticker FROM ticker_mappings")
                rows = cur.fetchall()
                for old_tk, new_tk in rows:
                    _ticker_mappings[old_tk.upper()] = new_tk.upper()
    except Exception as e:
        logger.warning(f"Failed to load ticker mappings from DB: {e}")
    return _ticker_mappings

# Cache for exchanges
_ticker_exchanges = None

def load_ticker_exchanges_from_db():
    global _ticker_exchanges
    if _ticker_exchanges is not None:
        return _ticker_exchanges

    _ticker_exchanges = {}
    try:
        from engine.database.connection import get_db_connection
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT ticker, exchange FROM ticker_master WHERE exchange IS NOT NULL")
                rows = cur.fetchall()
                for tk, exc in rows:
                    if exc:
                        _ticker_exchanges[tk.upper()] = exc.upper()
    except Exception as e:
        logger.warning(f"Failed to load ticker exchanges from DB: {e}")
    return _ticker_exchanges

def format_ticker(ticker: str) -> str:
    """
    Standardizes stock ticker formats and applies overrides from ticker_mappings table in DB:
    - If ends with .BSE or .BO (case-insensitive), formats as .BO (BSE).
    - Otherwise, formats based on the exchange recorded in ticker_master (defaults to .NS).
    """
    mappings = load_ticker_mappings_from_db()
    ticker_upper = ticker.upper()
    
    # Strip any suffix first to check the base symbol mapping
    base_ticker = ticker_upper
    suffix = ""
    if base_ticker.endswith(".NS"):
        base_ticker = base_ticker[:-3]
        suffix = ".NS"
    elif base_ticker.endswith(".BO"):
        base_ticker = base_ticker[:-3]
        suffix = ".BO"
    elif base_ticker.endswith(".BSE"):
        base_ticker = base_ticker[:-4]
        suffix = ".BSE"
        
    # Yahoo Finance Index Translations
    index_map = {
        "NIFTY": "^NSEI",
        "NIFTY50": "^NSEI",
        "NIFTY 50": "^NSEI",
        "BANKNIFTY": "^NSEBANK",
        "BANK NIFTY": "^NSEBANK",
        "FINNIFTY": "^CNXFIN",
        "MIDCPNIFTY": "^NSEMDCP50",
        "NIFTYNXT50": "^NN50"
    }
    if base_ticker in index_map:
        return index_map[base_ticker]
        
    # Check if base ticker has a mapping override
    if base_ticker in mappings:
        mapped = mappings[base_ticker]
        if mapped == "NA":
            return "NA"
        base_ticker = mapped
        
    # Re-apply or standardize suffix
    if suffix == ".BO" or suffix == ".BSE":
        ticker_formatted = f"{base_ticker}.BO"
    elif suffix == ".NS":
        ticker_formatted = f"{base_ticker}.NS"
    else:
        # Check database for exchange
        exchanges = load_ticker_exchanges_from_db()
        exc = exchanges.get(base_ticker)
        
        # If not in cache, try fetching on-the-fly (in case it was just added)
        if exc is None:
            try:
                from engine.database.connection import get_db_connection
                with get_db_connection() as conn:
                    with conn.cursor() as cur:
                        cur.execute("SELECT exchange FROM ticker_master WHERE ticker = %s", (base_ticker,))
                        row = cur.fetchone()
                        if row and row[0]:
                            exc = row[0].upper()
                            _ticker_exchanges[base_ticker] = exc
            except Exception:
                pass
                
        if exc in ("BSE", "BO"):
            ticker_formatted = f"{base_ticker}.BO"
        else:
            ticker_formatted = f"{base_ticker}.NS"
        
    return ticker_formatted

def clean_ticker(ticker: str) -> str:
    """Returns the clean ticker symbol without the extension (e.g. INFY from INFY.NS)."""
    return ticker.upper().split(".")[0]

def get_system_config(key: str, default: str = "") -> str:
    """Get system configuration value from database `system_config` table with fallback to environment variables."""
    global _system_config
    if key in _system_config and _system_config[key]:
        return _system_config[key]

    try:
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT value FROM system_config WHERE key = %s", (key,))
                row = cur.fetchone()
                if row and row[0] and str(row[0]).strip():
                    val = str(row[0]).strip()
                    _system_config[key] = val
                    return val
    except Exception as e:
        logger.warning(f"Failed to query system_config for '{key}': {e}")

    # Fallback to environment variables (e.g., GMAIL_USER, GMAIL_APP_PASSWORD, SMTP_USER, etc.)
    env_val = os.getenv(key.upper()) or os.getenv(key)
    if env_val:
        return env_val

    return default

def get_spot_tickers() -> list:
    """Retrieve all spot master tickers from database."""
    with get_db_connection() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT ticker FROM ticker_master ORDER BY ticker ASC")
            return [row[0] for row in cur.fetchall()]

def get_fno_tickers() -> list:
    """Retrieve all F&O stock and index master tickers from database."""
    with get_db_connection() as conn:
        with conn.cursor() as cur:
            fno_set = set()
            try:
                cur.execute("SELECT ticker FROM ticker_master WHERE is_fno = TRUE")
                for row in cur.fetchall():
                    fno_set.add(row[0])
            except Exception:
                conn.rollback()
            try:
                cur.execute("SELECT symbol FROM fno_stock_master WHERE is_active = TRUE")
                for row in cur.fetchall():
                    fno_set.add(row[0])
            except Exception:
                conn.rollback()
            try:
                cur.execute("SELECT symbol FROM fno_index_master WHERE is_active = TRUE")
                for row in cur.fetchall():
                    fno_set.add(row[0])
            except Exception:
                conn.rollback()
            for idx in ["NIFTY", "BANKNIFTY", "FINNIFTY", "MIDCPNIFTY", "NIFTYNXT50", "BANKEX"]:
                fno_set.add(idx)
            return sorted(list(fno_set))

def list_all_watchlists() -> list:
    """Retrieves all available watchlists and their ticker counts from database."""
    with get_db_connection() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT w.id, w.name, w.description, COUNT(DISTINCT wi.ticker) AS ticker_count
                FROM watchlist w
                LEFT JOIN watchlist_items wi ON wi.watchlist_id = w.id
                GROUP BY w.id, w.name, w.description
                ORDER BY w.id ASC
            """)
            rows = cur.fetchall()
            return [
                {
                    "id": r[0],
                    "name": r[1],
                    "description": r[2] or "",
                    "ticker_count": r[3]
                }
                for r in rows
            ]

def get_tickers_for_watchlist(watchlist_inputs: list) -> tuple:
    """
    Given watchlist names or IDs from CLI (e.g. ['Default Watchlist'], ['1', '2'], ['Nifty 50,Nifty IT']),
    queries database `watchlist` and `watchlist_items` tables and returns:
      (tickers: list[str], matched_watchlists: list[dict])
    """
    if not watchlist_inputs:
        return [], []

    raw_tokens = []
    for item in watchlist_inputs:
        if isinstance(item, str):
            for token in item.split(","):
                cleaned = token.strip()
                if cleaned:
                    raw_tokens.append(cleaned)

    if not raw_tokens:
        return [], []

    matched_watchlists = []
    tickers = set()

    if any(t.lower() == 'all' for t in raw_tokens):
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT id, name, description FROM watchlist")
                rows = cur.fetchall()
                for row in rows:
                    wl_id, wl_name, wl_desc = row[0], row[1], row[2]
                    cur.execute("SELECT COUNT(DISTINCT ticker) FROM watchlist_items WHERE watchlist_id = %s", (wl_id,))
                    cnt = cur.fetchone()[0]
                    matched_watchlists.append({
                        'id': wl_id,
                        'name': wl_name,
                        'description': wl_desc,
                        'ticker_count': cnt
                    })
                cur.execute("SELECT DISTINCT ticker FROM watchlist_items")
                for t_row in cur.fetchall():
                    if t_row[0]:
                        tickers.add(t_row[0].upper().strip())
        return sorted(list(tickers)), matched_watchlists

    with get_db_connection() as conn:
        with conn.cursor() as cur:
            for token in raw_tokens:
                token_lower = token.lower()
                query = """
                    SELECT id, name, description
                    FROM watchlist
                    WHERE id::text = %s
                       OR LOWER(name) = %s
                       OR LOWER(REPLACE(name, ' ', '_')) = %s
                       OR LOWER(REPLACE(name, '_', ' ')) = %s
                """
                cur.execute(query, (token_lower, token_lower, token_lower, token_lower))
                rows = cur.fetchall()

                if not rows:
                    cur.execute(
                        "SELECT id, name, description FROM watchlist WHERE LOWER(name) LIKE %s",
                        (f"%{token_lower}%",)
                    )
                    rows = cur.fetchall()

                for row in rows:
                    wl_id, wl_name, wl_desc = row[0], row[1], row[2]
                    if not any(w['id'] == wl_id for w in matched_watchlists):
                        cur.execute("SELECT COUNT(DISTINCT ticker) FROM watchlist_items WHERE watchlist_id = %s", (wl_id,))
                        cnt = cur.fetchone()[0]
                        matched_watchlists.append({
                            'id': wl_id,
                            'name': wl_name,
                            'description': wl_desc,
                            'ticker_count': cnt
                        })
                        cur.execute("SELECT DISTINCT ticker FROM watchlist_items WHERE watchlist_id = %s", (wl_id,))
                        for t_row in cur.fetchall():
                            if t_row[0]:
                                tickers.add(t_row[0].upper().strip())

            if not matched_watchlists and len(raw_tokens) > 1:
                combined = " ".join(raw_tokens).lower()
                query = """
                    SELECT id, name, description
                    FROM watchlist
                    WHERE LOWER(name) = %s
                       OR LOWER(REPLACE(name, ' ', '_')) = %s
                       OR LOWER(REPLACE(name, '_', ' ')) = %s
                       OR LOWER(name) LIKE %s
                """
                cur.execute(query, (combined, combined, combined, f"%{combined}%"))
                rows = cur.fetchall()
                for row in rows:
                    wl_id, wl_name, wl_desc = row[0], row[1], row[2]
                    if not any(w['id'] == wl_id for w in matched_watchlists):
                        cur.execute("SELECT COUNT(DISTINCT ticker) FROM watchlist_items WHERE watchlist_id = %s", (wl_id,))
                        cnt = cur.fetchone()[0]
                        matched_watchlists.append({
                            'id': wl_id,
                            'name': wl_name,
                            'description': wl_desc,
                            'ticker_count': cnt
                        })
                        cur.execute("SELECT DISTINCT ticker FROM watchlist_items WHERE watchlist_id = %s", (wl_id,))
                        for t_row in cur.fetchall():
                            if t_row[0]:
                                tickers.add(t_row[0].upper().strip())

    return sorted(list(tickers)), matched_watchlists

