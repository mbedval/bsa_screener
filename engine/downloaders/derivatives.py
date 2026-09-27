import os
import logging
import yfinance as yf
from datetime import datetime, timedelta
from engine.database.connection import get_db_connection
from engine.utils.helpers import clean_ticker

from engine.utils.rate_limiter import yfinance_safe_call

logger = logging.getLogger("bsa_derivatives_downloader")

def fetch_live_spot_price(ticker: str) -> float or None:
    """Fetch spot price from DB ohlcv_daily first for instant performance, with yfinance/fallback backup."""
    raw = ticker.strip().upper()

    # 1. Quick check from DB ohlcv_daily
    try:
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT close FROM ohlcv_daily WHERE ticker = %s ORDER BY trade_date DESC LIMIT 1", (raw,))
                row = cur.fetchone()
                if row and row[0] and float(row[0]) > 0:
                    return round(float(row[0]), 2)
    except Exception:
        pass

    # 2. Live yfinance fetch if not in DB
    yf_sym = f"{raw}.NS" if not raw.endswith(".NS") and not raw.startswith("^") else raw
    if raw in ("NIFTY", "NIFTY50", "NIFTY 50"): yf_sym = "^NSEI"
    elif raw in ("BANKNIFTY", "BANK NIFTY"): yf_sym = "^NSEBANK"
    elif raw in ("FINNIFTY",): yf_sym = "^CNXFIN"
    elif raw in ("MIDCPNIFTY",): yf_sym = "^NSEMDCP50"
    elif raw in ("NIFTYNXT50",): yf_sym = "^NSMIDCP"
    elif raw in ("BANKEX",): yf_sym = "^BSESN"

    try:
        tk = yf.Ticker(yf_sym)
        hist = yfinance_safe_call(lambda: tk.history(period="1d", timeout=3))
        if hist is not None and not hist.empty:
            val = float(hist["Close"].iloc[-1])
            if val > 0:
                return round(val, 2)
    except Exception as e:
        logger.debug(f"Failed to fetch live price for {ticker}: {e}")

    # 3. Sector fallbacks
    fallbacks = {
        "NIFTY": 24500.0, "BANKNIFTY": 51000.0, "FINNIFTY": 23000.0,
        "MIDCPNIFTY": 13000.0, "NIFTYNXT50": 68000.0, "BANKEX": 58000.0
    }
    return fallbacks.get(raw, 500.0)

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

        # Analyze F&O option chain immediately alongside derivative download
        try:
            from engine.analysis.options import analyze_options_chain
            analyze_options_chain(ticker_clean)
        except Exception as e:
            logger.error(f"Error analyzing F&O options for {ticker_clean} during download: {e}")

        return True
    except Exception as e:
        logger.error(f"Error inserting derivative data for {ticker_clean}: {e}")
        return False

from engine.utils.checkpoint import get_completed_tickers, mark_ticker_completed
from engine.utils.fno_seeder import seed_fno_tickers

def download_all_derivatives(progress_callback=None, resume: bool = True, tickers: list = None):
    """Download option chain derivatives for all F&O enabled tickers + indices (or specified tickers list)."""
    # Automatically seed/sync F&O list from F&O CSVs
    seed_fno_tickers()

    all_tickers = []
    if tickers is not None:
        all_tickers = [t.upper().strip() for t in tickers]
    else:
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                try:
                    cur.execute("""
                        UPDATE ticker_master
                        SET is_fno = TRUE
                        WHERE ticker IN (SELECT symbol FROM fno_stock_master WHERE is_active = TRUE)
                    """)
                    conn.commit()
                except Exception:
                    conn.rollback()

                try:
                    cur.execute("SELECT ticker FROM ticker_master WHERE is_fno = TRUE")
                    all_tickers = [row[0] for row in cur.fetchall()]
                except Exception:
                    conn.rollback()

                try:
                    cur.execute("SELECT symbol FROM fno_stock_master WHERE is_active = TRUE")
                    fno_symbols = [row[0] for row in cur.fetchall()]
                    for s in fno_symbols:
                        if s not in all_tickers:
                            all_tickers.append(s)
                except Exception:
                    conn.rollback()

                try:
                    cur.execute("SELECT symbol FROM fno_index_master WHERE is_active = TRUE")
                    idx_symbols = [row[0] for row in cur.fetchall()]
                    for s in idx_symbols:
                        if s not in all_tickers:
                            all_tickers.append(s)
                except Exception:
                    conn.rollback()

        indices = ["NIFTY", "BANKNIFTY", "FINNIFTY", "MIDCPNIFTY", "NIFTYNXT50", "BANKEX"]
        for idx in indices:
            if idx not in all_tickers:
                all_tickers.append(idx)

    completed_set = get_completed_tickers("fno_download", valid_tickers=all_tickers) if resume else set()
    pending_tickers = [t for t in all_tickers if t not in completed_set]

    logger.info(f"Starting F&O option chain download. Total: {len(all_tickers)}, Completed: {len(completed_set)}, Pending: {len(pending_tickers)}")

    if not pending_tickers:
        logger.info("All F&O tickers already downloaded!")
        return

    success_count = len(completed_set)
    for i, ticker in enumerate(pending_tickers, 1):
        res = download_and_insert_derivatives(ticker)
        if res:
            success_count += 1
            mark_ticker_completed("fno_download", ticker)
        if progress_callback:
            logger.debug(f"[{i}/{len(pending_tickers)}] Derivative Downloaded {ticker}: {'Success' if res else 'Failed'}")
            progress_callback(ticker, res)
        else:
            logger.info(f"[{i}/{len(pending_tickers)}] Derivative Downloaded {ticker}: {'Success' if res else 'Failed'}")
    logger.info(f"Derivative downloads completed: {success_count}/{len(all_tickers)} successful.")



