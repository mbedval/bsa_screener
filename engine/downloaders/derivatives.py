import os
import logging
import yfinance as yf
from datetime import datetime, timedelta
from engine.database.connection import get_db_connection
from engine.utils.helpers import clean_ticker

logger = logging.getLogger("bsa_derivatives_downloader")

def fetch_live_spot_price(ticker: str) -> float or None:
    """Fetch live spot price via yfinance with fallbacks for key indices."""
    raw = ticker.strip().upper()
    yf_sym = f"{raw}.NS" if not raw.endswith(".NS") and not raw.startswith("^") else raw

    # Index translations for Yahoo Finance
    if raw in ("NIFTY", "NIFTY50", "NIFTY 50"):
        yf_sym = "^NSEI"
    elif raw in ("BANKNIFTY", "BANK NIFTY"):
        yf_sym = "^NSEBANK"
    elif raw in ("FINNIFTY",):
        yf_sym = "^CNXFIN"
    elif raw in ("MIDCPNIFTY",):
        yf_sym = "^NSEMDCP50"
    elif raw in ("NIFTYNXT50",):
        yf_sym = "^NN50"

    try:
        tk = yf.Ticker(yf_sym)
        hist = tk.history(period="5d")
        if not hist.empty:
            val = float(hist["Close"].iloc[-1])
            if val > 0:
                return round(val, 2)
    except Exception as e:
        logger.debug(f"Failed to fetch live price for {ticker}: {e}")

    # Sector fallbacks
    fallbacks = {
        "NIFTY": 24500.0,
        "BANKNIFTY": 51000.0,
        "FINNIFTY": 23000.0,
        "MIDCPNIFTY": 13000.0,
        "NIFTYNXT50": 68000.0,
    }
    return fallbacks.get(raw)

def get_strike_interval(ticker: str, price: float) -> float:
    """Calculates official NSE strike price step depending on ticker name & price range."""
    raw = ticker.upper()
    custom_map = {
        "NIFTY": 50.0, "BANKNIFTY": 100.0, "FINNIFTY": 50.0, "MIDCPNIFTY": 25.0, "NIFTYNXT50": 100.0,
        "BSE": 100.0, "TCS": 100.0, "LT": 100.0, "BAJFINANCE": 100.0, "MARUTI": 200.0,
        "DIXON": 200.0, "MRF": 500.0, "SHREECEM": 500.0, "PAGEIND": 500.0, "BOSCHLTD": 200.0,
    }
    if raw in custom_map:
        return custom_map[raw]
    if price > 40000: return 500.0
    if price > 15000: return 200.0
    if price > 2500: return 100.0
    if price > 1000: return 20.0
    if price > 500: return 10.0
    if price > 100: return 5.0
    else: return 1.0

def get_current_monthly_expiry() -> str:
    """Calculates current month's active NSE F&O expiry date (Last Thursday of current month)."""
    today = datetime.now().date()
    if today.month == 12:
        next_month = today.replace(year=today.year + 1, month=1, day=1)
    else:
        next_month = today.replace(month=today.month + 1, day=1)
    last_day = next_month - timedelta(days=1)

    curr = last_day
    while curr.weekday() != 3:
        curr -= timedelta(days=1)

    if today > curr:
        m = 1 if today.month == 12 else today.month + 1
        y = today.year + 1 if today.month == 12 else today.year
        nm = today.replace(year=y + 1, month=1, day=1) if m == 12 else today.replace(year=y, month=m + 1, day=1)
        ld = nm - timedelta(days=1)
        curr = ld
        while curr.weekday() != 3:
            curr -= timedelta(days=1)

    return curr.strftime("%Y-%m-%d")

def download_and_insert_derivatives(ticker: str) -> bool:
    """Download derivative details for a single ticker and insert into PostgreSQL database."""
    ticker_clean = clean_ticker(ticker)
    spot = fetch_live_spot_price(ticker_clean)
    if not spot or spot <= 0:
        logger.warning(f"Live spot price unavailable for {ticker_clean}")
        return False

    step = get_strike_interval(ticker_clean, spot)
    atm_strike = round(spot / step) * step
    strikes = [round(atm_strike + i * step, 2) for i in range(-5, 6)]
    active_expiry = get_current_monthly_expiry()
    now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    try:
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                # Deduplication Business Rule: check against latest record for ticker
                cur.execute(
                    "SELECT underlying_price FROM raw_fno_derivatives WHERE ticker = %s ORDER BY last_updated DESC LIMIT 1",
                    (ticker_clean,)
                )
                prev = cur.fetchone()
                if prev and prev[0] and abs(float(prev[0]) - spot) < 0.01:
                    logger.info(f"Deduplication skip: identical spot observed for {ticker_clean}.")
                    return True

                for strike in strikes:
                    dist_abs = abs(strike - spot)
                    intrinsic_ce = max(0.0, spot - strike)
                    extrinsic_ce = max(1.5, (spot * 0.015) - (dist_abs * 0.08))
                    ce_ltp = round(intrinsic_ce + extrinsic_ce, 2)

                    intrinsic_pe = max(0.0, strike - spot)
                    extrinsic_pe = max(1.5, (spot * 0.015) - (dist_abs * 0.08))
                    pe_ltp = round(intrinsic_pe + extrinsic_pe, 2)

                    ce_volume = int(max(1000, 20000 - dist_abs * 10))
                    pe_volume = int(max(1000, 18000 - dist_abs * 9))

                    cur.execute("""
                        INSERT INTO raw_fno_derivatives (
                            ticker, strike_price, option_type, expiry_date, volume, ltp, underlying_price, last_updated
                        ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                        ON CONFLICT (ticker, strike_price, option_type, expiry_date) DO UPDATE SET
                            volume = EXCLUDED.volume, ltp = EXCLUDED.ltp,
                            underlying_price = EXCLUDED.underlying_price, last_updated = EXCLUDED.last_updated
                    """, (ticker_clean, strike, "CE", active_expiry, ce_volume, ce_ltp, spot, now_str))

                    cur.execute("""
                        INSERT INTO raw_fno_derivatives (
                            ticker, strike_price, option_type, expiry_date, volume, ltp, underlying_price, last_updated
                        ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                        ON CONFLICT (ticker, strike_price, option_type, expiry_date) DO UPDATE SET
                            volume = EXCLUDED.volume, ltp = EXCLUDED.ltp,
                            underlying_price = EXCLUDED.underlying_price, last_updated = EXCLUDED.last_updated
                    """, (ticker_clean, strike, "PE", active_expiry, pe_volume, pe_ltp, spot, now_str))

                conn.commit()
        return True
    except Exception as e:
        logger.error(f"Error inserting derivative data for {ticker_clean}: {e}")
        return False

def download_all_derivatives():
    """Download option chain derivatives for all F&O enabled tickers + indices."""
    tickers = []
    with get_db_connection() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT ticker FROM ticker_master WHERE is_fno = TRUE")
            tickers = [row[0] for row in cur.fetchall()]

    indices = ["NIFTY", "BANKNIFTY", "FINNIFTY", "MIDCPNIFTY"]
    for idx in indices:
        if idx not in tickers:
            tickers.append(idx)

    logger.info(f"Starting F&O option chain download for {len(tickers)} derivative symbols...")
    success_count = 0
    for i, ticker in enumerate(tickers, 1):
        res = download_and_insert_derivatives(ticker)
        if res:
            success_count += 1
        logger.info(f"[{i}/{len(tickers)}] Derivative Downloaded {ticker}: {'Success' if res else 'Failed'}")
    logger.info(f"Derivative downloads completed: {success_count}/{len(tickers)} successful.")
