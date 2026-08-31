import logging
from engine.database.connection import get_db_connection

logger = logging.getLogger("bsa_helpers")

# Cache for mappings and configurations to reduce database calls
_ticker_mappings = None
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

def format_ticker(ticker: str) -> str:
    """
    Standardizes stock ticker formats and applies overrides from ticker_mappings table in DB:
    - If ends with .BSE or .BO (case-insensitive), formats as .BO (BSE).
    - Otherwise, formats as .NS (NSE).
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
        
    # Check if base ticker has a mapping override
    if base_ticker in mappings:
        mapped = mappings[base_ticker]
        if mapped == "NA":
            return "NA"
        base_ticker = mapped
        
    # Re-apply or standardize suffix
    if suffix == ".BO" or suffix == ".BSE":
        ticker_formatted = f"{base_ticker}.BO"
    else:
        # Default to .NS
        ticker_formatted = f"{base_ticker}.NS"
        
    return ticker_formatted

def clean_ticker(ticker: str) -> str:
    """Returns the clean ticker symbol without the extension (e.g. INFY from INFY.NS)."""
    return ticker.upper().split(".")[0]

def get_system_config(key: str, default: str = "") -> str:
    """Get system configuration value from database `system_config` table."""
    global _system_config
    if key in _system_config:
        return _system_config[key]

    try:
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT value FROM system_config WHERE key = %s", (key,))
                row = cur.fetchone()
                if row:
                    _system_config[key] = row[0]
                    return row[0]
    except Exception as e:
        logger.warning(f"Failed to query system_config for '{key}': {e}")
    return default
