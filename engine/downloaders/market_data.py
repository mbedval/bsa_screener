import time
import logging
import yfinance as yf
import pandas as pd
import numpy as np
from datetime import datetime
from concurrent.futures import ThreadPoolExecutor, as_completed
from enum import Enum
from engine.database.connection import get_db_connection
from engine.utils.helpers import format_ticker, clean_ticker
from engine.utils.rate_limiter import pace_yfinance_request, yfinance_safe_call, DEFAULT_MAX_WORKERS

logger = logging.getLogger("bsa_market_downloader")

class YFPeriod(str, Enum):
    DAY_1 = "1d"
    DAY_5 = "5d"
    MONTH_1 = "1mo"
    MONTH_3 = "3mo"
    MONTH_6 = "6mo"
    YEAR_1 = "1y"
    YEAR_2 = "2y"
    YEAR_5 = "5y"
    YEAR_10 = "10y"
    YTD = "ytd"
    MAX = "max"

    @classmethod
    def valid_periods(cls):
        return [e.value for e in cls]


def compute_indicators(df: pd.DataFrame) -> pd.DataFrame:
    """Compute standard technical indicators on a daily price DataFrame."""
    d = df.copy()
    if d.empty or len(d) < 2:
        return d

    # RSI-14
    delta = d["Close"].diff()
    gain = delta.where(delta > 0, 0.0)
    loss = -delta.where(delta < 0, 0.0)
    avg_gain = gain.rolling(14, min_periods=1).mean()
    avg_loss = loss.rolling(14, min_periods=1).mean()
    rs = avg_gain / avg_loss.replace(0, np.nan)
    d["RSI14"] = (100 - 100 / (1 + rs)).fillna(50.0)

    # SMA
    d["SMA20"] = d["Close"].rolling(20, min_periods=1).mean()
    d["SMA50"] = d["Close"].rolling(50, min_periods=1).mean()

    # EMA
    d["EMA12"] = d["Close"].ewm(span=12, adjust=False).mean()
    d["EMA26"] = d["Close"].ewm(span=26, adjust=False).mean()

    # MACD
    d["MACD_Line"] = d["EMA12"] - d["EMA26"]
    d["MACD_Signal"] = d["MACD_Line"].ewm(span=9, adjust=False).mean()
    d["MACD_Hist"] = d["MACD_Line"] - d["MACD_Signal"]

    # Bollinger Bands
    bb_std = d["Close"].rolling(20, min_periods=1).std().fillna(0)
    d["BB_Mid"] = d["SMA20"]
    d["BB_Upper"] = d["BB_Mid"] + 2 * bb_std
    d["BB_Lower"] = d["BB_Mid"] - 2 * bb_std

    # ATR-14
    hl = d["High"] - d["Low"]
    hc = (d["High"] - d["Close"].shift()).abs()
    lc = (d["Low"] - d["Close"].shift()).abs()
    tr = pd.concat([hl, hc, lc], axis=1).max(axis=1)
    d["ATR14"] = tr.rolling(14, min_periods=1).mean().fillna(hl.mean())

    # Ichimoku Cloud (9, 26, 52)
    nine_h = d["High"].rolling(9, min_periods=1).max()
    nine_l = d["Low"].rolling(9, min_periods=1).min()
    d["Tenkan_sen"] = (nine_h + nine_l) / 2

    twsx_h = d["High"].rolling(26, min_periods=1).max()
    twsx_l = d["Low"].rolling(26, min_periods=1).min()
    d["Kijun_sen"] = (twsx_h + twsx_l) / 2

    d["Span_A"] = ((d["Tenkan_sen"] + d["Kijun_sen"]) / 2).shift(26).bfill()
    fftw_h = d["High"].rolling(52, min_periods=1).max()
    fftw_l = d["Low"].rolling(52, min_periods=1).min()
    d["Span_B"] = ((fftw_h + fftw_l) / 2).shift(26).bfill()

    return d

def compute_vwap(df: pd.DataFrame) -> pd.Series:
    typical = (df["High"] + df["Low"] + df["Close"]) / 3
    return (typical * df["Volume"]).cumsum() / df["Volume"].cumsum().replace(0, 1)

def _safe_float(val) -> float or None:
    try:
        if val is None or (isinstance(val, float) and np.isnan(val)):
            return None
        return float(val)
    except Exception:
        return None

def get_latest_trade_date(ticker_clean: str) -> datetime or None:
    """Query DB for the latest trade_date recorded for a ticker."""
    try:
        with get_db_connection() as conn:
            cur = conn.cursor()
            cur.execute("SELECT MAX(trade_date) FROM ohlcv_daily WHERE ticker = ?", (ticker_clean,))
            res = cur.fetchone()
            if res and res[0]:
                val = res[0]
                if isinstance(val, str):
                    return datetime.strptime(val, "%Y-%m-%d")
                elif hasattr(val, "strftime"):
                    return datetime.combine(val, datetime.min.time()) if not isinstance(val, datetime) else val
    except Exception:
        pass
    return None

def download_ticker_data(ticker_raw: str, period: str = None, force: bool = False, dl_technicals: bool = True, dl_fundamentals: bool = True) -> bool:
    """Download OHLCV, compute indicators, fetch meta & fundamentals with smart incremental freshness logic."""
    if not dl_technicals and not dl_fundamentals:
        return True
        
    if period and period not in YFPeriod.valid_periods():
        logger.error(f"Invalid period '{period}'. Valid periods are: {', '.join(YFPeriod.valid_periods())}")
        return False

    ticker_clean = clean_ticker(ticker_raw)
    formatted = format_ticker(ticker_raw)
    now_str = datetime.now().isoformat(timespec="seconds")
    today_date = datetime.now().date()

    try:
        tk = yf.Ticker(formatted)
        info = None
        
        if dl_technicals:
            # Determine smart fetch period if not specified
            if not period:
                last_date = get_latest_trade_date(ticker_clean)
                if last_date and not force:
                    days_diff = (today_date - last_date.date()).days
                    # If last trade date is today (or yesterday/weekend within 1-2 days), skip download
                    if days_diff <= 0 or (today_date.weekday() in [5, 6] and days_diff <= 2):
                        logger.info(f"Ticker {ticker_clean} is already up to date ({last_date.strftime('%Y-%m-%d')}). Skipping download.")
                        dl_technicals = False  # Skip technicals but maybe continue fundamentals if needed
                    elif days_diff <= 7:
                        period = YFPeriod.DAY_5.value
                    elif days_diff <= 30:
                        period = YFPeriod.MONTH_1.value
                    else:
                        period = YFPeriod.YEAR_2.value
                else:
                    period = YFPeriod.YEAR_2.value

        if dl_technicals:
            # 1. Fetch OHLCV with rate limit protection & backoff
            df = yfinance_safe_call(lambda: tk.history(period=period, interval="1d"))
            
            if (df is None or df.empty) and period in [YFPeriod.DAY_5.value, YFPeriod.MONTH_1.value]:
                logger.info(f"Retry fetching {ticker_clean} with period=1y because {period} returned empty")
                df = yfinance_safe_call(lambda: tk.history(period=YFPeriod.YEAR_1.value, interval="1d"))

            if df is None or df.empty:
                # Try fallback exchange
                alt_formatted = None
                alt_exchange = None
                if formatted.endswith(".NS"):
                    alt_formatted = formatted.replace(".NS", ".BO")
                    alt_exchange = "BSE"
                elif formatted.endswith(".BO"):
                    alt_formatted = formatted.replace(".BO", ".NS")
                    alt_exchange = "NSE"
                    
                if alt_formatted:
                    logger.info(f"No data for {formatted}, retrying with alternative exchange: {alt_formatted}")
                    alt_tk = yf.Ticker(alt_formatted)
                    df = yfinance_safe_call(lambda: alt_tk.history(period=period, interval="1d"))
                    
                    if df is not None and not df.empty:
                        logger.info(f"Success with {alt_formatted}. Updating ticker_master exchange to {alt_exchange}.")
                        formatted = alt_formatted
                        tk = alt_tk
                        # Clear cache so other helpers fetch the updated exchange
                        from engine.utils.helpers import _ticker_exchanges
                        if _ticker_exchanges is not None:
                            _ticker_exchanges[ticker_clean] = alt_exchange
                        
                        try:
                            with get_db_connection() as conn:
                                cur = conn.cursor()
                                cur.execute("UPDATE ticker_master SET exchange = ? WHERE ticker = ?", (alt_exchange, ticker_clean))
                                conn.commit()
                        except Exception as e:
                            logger.error(f"Failed to update exchange in DB: {e}")

            if df is None or df.empty:
                logger.warning(f"\033[91mCheck if ticker name is correct and no ticker is found for {ticker_clean}\033[0m")
                with get_db_connection() as conn:
                    cur = conn.cursor()
                    cur.execute("""
                        INSERT INTO excluded_tickers (ticker, reason, added_by, status, created_at)
                        VALUES (?, ?, ?, ?, ?)
                        ON CONFLICT (ticker) DO UPDATE SET 
                        reason = EXCLUDED.reason, status = EXCLUDED.status, created_at = EXCLUDED.created_at
                    """, (ticker_clean, "No price data found (possibly delisted)", "SYSTEM", "EXCLUDED", now_str))
                    conn.commit()
                return False

            # Localize timezones
            if isinstance(df.index, pd.DatetimeIndex) and df.index.tz is not None:
                df.index = df.index.tz_localize(None)

            df["VWAP"] = compute_vwap(df)
            enriched = compute_indicators(df)

            # Drop any row where Close is NaN/None before saving
            enriched = enriched.dropna(subset=["Close"])
            if enriched.empty:
                logger.warning(f"No valid close prices for {ticker_clean}")
                return False

            # 2. Save stock_meta information with rate limit protection
            info = yfinance_safe_call(lambda: tk.info) or {}
            company_name = info.get("longName", info.get("shortName", ticker_clean))
            sector = info.get("sector", "Unknown")
            exchange = "BO" if formatted.endswith(".BO") else "NS"

            from engine.database.connection import execute_values

            with get_db_connection() as conn:
                cur = conn.cursor()
                # Upsert ticker_master metadata
                cur.execute("""
                    INSERT INTO ticker_master (ticker, company_name, sector, exchange, updated_at)
                    VALUES (?, ?, ?, ?, ?)
                    ON CONFLICT (ticker) DO UPDATE SET
                        company_name = EXCLUDED.company_name,
                        sector = EXCLUDED.sector,
                        exchange = EXCLUDED.exchange,
                        updated_at = EXCLUDED.updated_at
                """, (ticker_clean, company_name, sector, exchange, now_str))

                # Batch upsert OHLCV and Indicators
                ohlcv_records = []
                indicators_records = []
                for idx, row in enriched.iterrows():
                    date_str = idx.strftime("%Y-%m-%d")
                    ohlcv_records.append((
                        ticker_clean, date_str,
                        _safe_float(row["Open"]), _safe_float(row["High"]),
                        _safe_float(row["Low"]), _safe_float(row["Close"]),
                        _safe_float(row["Volume"]), _safe_float(row["VWAP"]),
                        now_str
                    ))
                    indicators_records.append((
                        ticker_clean, date_str,
                        _safe_float(row.get("RSI14")), _safe_float(row.get("SMA20")),
                        _safe_float(row.get("SMA50")), _safe_float(row.get("EMA12")),
                        _safe_float(row.get("EMA26")), _safe_float(row.get("MACD_Line")),
                        _safe_float(row.get("MACD_Signal")), _safe_float(row.get("MACD_Hist")),
                        _safe_float(row.get("BB_Upper")), _safe_float(row.get("BB_Mid")),
                        _safe_float(row.get("BB_Lower")), _safe_float(row.get("ATR14")),
                        _safe_float(row.get("Tenkan_sen")), _safe_float(row.get("Kijun_sen")),
                        _safe_float(row.get("Span_A")), _safe_float(row.get("Span_B")), now_str
                    ))

                if ohlcv_records:
                    execute_values(cur, """
                        INSERT INTO ohlcv_daily (ticker, trade_date, open, high, low, close, volume, vwap, downloaded_at)
                        VALUES ?
                        ON CONFLICT (ticker, trade_date) DO UPDATE SET
                            open = EXCLUDED.open, high = EXCLUDED.high, low = EXCLUDED.low,
                            close = EXCLUDED.close, volume = EXCLUDED.volume, vwap = EXCLUDED.vwap,
                            downloaded_at = EXCLUDED.downloaded_at
                    """, ohlcv_records, page_size=500)

                if indicators_records:
                    execute_values(cur, """
                        INSERT INTO indicators_daily (
                            ticker, trade_date, rsi14, sma20, sma50, ema12, ema26,
                            macd_line, macd_signal, macd_hist, bb_upper, bb_mid, bb_lower,
                            atr14, tenkan_sen, kijun_sen, span_a, span_b, computed_at
                        ) VALUES ?
                        ON CONFLICT (ticker, trade_date) DO UPDATE SET
                            rsi14 = EXCLUDED.rsi14, sma20 = EXCLUDED.sma20, sma50 = EXCLUDED.sma50,
                            ema12 = EXCLUDED.ema12, ema26 = EXCLUDED.ema26, macd_line = EXCLUDED.macd_line,
                            macd_signal = EXCLUDED.macd_signal, macd_hist = EXCLUDED.macd_hist,
                            bb_upper = EXCLUDED.bb_upper, bb_mid = EXCLUDED.bb_mid, bb_lower = EXCLUDED.bb_lower,
                            atr14 = EXCLUDED.atr14, tenkan_sen = EXCLUDED.tenkan_sen, kijun_sen = EXCLUDED.kijun_sen,
                            span_a = EXCLUDED.span_a, span_b = EXCLUDED.span_b, computed_at = EXCLUDED.computed_at
                    """, indicators_records, page_size=500)

                conn.commit()

            # For technical score support we are using derivative information also,
            # so if derivative chain detail is not downloaded, do it for ticker flagged with fno
            is_fno = False
            with get_db_connection() as conn:
                cur = conn.cursor()
                cur.execute("SELECT is_fno FROM ticker_master WHERE ticker = ?", (ticker_clean,))
                row = cur.fetchone()
                if row:
                    is_fno = row[0]
            if is_fno:
                from engine.downloaders.derivatives import download_and_insert_derivatives
                download_and_insert_derivatives(ticker_clean)

        # 3. Fundamentals (reusing info dictionary)
        if dl_fundamentals:
            if info is None:
                info = yfinance_safe_call(lambda: tk.info) or {}
            download_fundamental_data(ticker_clean, formatted, tk, cached_info=info)

        return True

    except Exception as e:
        logger.error(f"Error downloading market data for {ticker_clean}: {e}")
        return False

def download_fundamental_data(ticker_clean: str, formatted: str, yf_ticker_obj=None, cached_info: dict = None) -> bool:
    """Download quarterly financials and current PE ratios from yfinance and save to DB."""
    try:
        tk = yf_ticker_obj or yf.Ticker(formatted)
        qf = yfinance_safe_call(lambda: tk.quarterly_financials)
        if qf is None or qf.empty:
            return False

        # Get Net Income
        pat_keys = [k for k in qf.index if 'Net Income' in str(k) and 'Common' not in str(k)]
        if not pat_keys:
            return False
        pat_row = qf.loc[pat_keys[0]].dropna()
        if pat_row.empty:
            return False

        pat_values = pat_row.iloc[:8].astype(float)
        last_pat = float(pat_values.iloc[0])
        avg_pat = float(pat_values.mean())
        is_pat_growing = int(last_pat > avg_pat)

        # Other Income
        other_inc_keys = [k for k in qf.index if 'Other Non Operating Income' in str(k) or 'Other Income Expense' in str(k)]
        last_other_inc = 0.0
        avg_other_inc = 0.0
        if other_inc_keys:
            other_inc_row = qf.loc[other_inc_keys[0]].dropna()
            if not other_inc_row.empty:
                other_inc_values = other_inc_row.iloc[:8].astype(float)
                last_other_inc = float(other_inc_values.iloc[0])
                avg_other_inc = float(other_inc_values.mean())

        is_other_income_ok = int(abs(avg_other_inc) <= (0.05 * avg_pat)) if avg_pat > 0 else int(abs(avg_other_inc) == 0.0)

        # PE, Debt, and Market Cap (reusing cached_info)
        info = cached_info if cached_info is not None else (yfinance_safe_call(lambda: tk.info) or {})
        raw_mcap = info.get('marketCap') or info.get('totalAssets')
        market_cap = _safe_float(raw_mcap) or 0.0

        raw_pe = info.get('trailingPE') or info.get('forwardPE')
        current_pe = _safe_float(raw_pe) or 0.0
        avg_pe = 20.0  # standard fallback
        is_pe_ok = int(current_pe <= avg_pe) if current_pe > 0 else 1

        raw_dte = info.get('debtToEquity')
        debt_to_equity = _safe_float(raw_dte) or 0.0
        is_debt_equity_ok = int(debt_to_equity <= 100.0)

        # Calculate composite score
        score = int(25 * (is_pat_growing + is_other_income_ok + is_pe_ok + is_debt_equity_ok))
        passed = int(score >= 75)
        today = datetime.now().strftime("%Y-%m-%d")

        with get_db_connection() as conn:
            cur = conn.cursor()
            cur.execute("""
                INSERT INTO fundamentals (
                    ticker, fetched_date, market_cap, current_pe, avg_pe, last_pat, avg_pat,
                    last_other_income, avg_other_income, debt_to_equity,
                    is_pat_growing, is_other_income_ok, is_pe_ok, is_debt_equity_ok,
                    fundamental_score, passed, details
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT (ticker, fetched_date) DO UPDATE SET
                    market_cap = EXCLUDED.market_cap,
                    current_pe = EXCLUDED.current_pe, avg_pe = EXCLUDED.avg_pe,
                    last_pat = EXCLUDED.last_pat, avg_pat = EXCLUDED.avg_pat,
                    last_other_income = EXCLUDED.last_other_income, avg_other_income = EXCLUDED.avg_other_income,
                    debt_to_equity = EXCLUDED.debt_to_equity, is_pat_growing = EXCLUDED.is_pat_growing,
                    is_other_income_ok = EXCLUDED.is_other_income_ok, is_pe_ok = EXCLUDED.is_pe_ok,
                    is_debt_equity_ok = EXCLUDED.is_debt_equity_ok, fundamental_score = EXCLUDED.fundamental_score,
                    passed = EXCLUDED.passed, details = EXCLUDED.details
            """, (
                ticker_clean, today, market_cap, current_pe, avg_pe, last_pat, avg_pat,
                last_other_inc, avg_other_inc, debt_to_equity,
                is_pat_growing, is_other_income_ok, is_pe_ok, is_debt_equity_ok,
                score, passed, "{}"
            ))
            conn.commit()
        return True
    except Exception as e:
        logger.error(f"Error fetching fundamentals for {ticker_clean}: {e}")
        return False

from engine.utils.checkpoint import get_completed_tickers, mark_ticker_completed

def download_all_tickers(max_workers: int = DEFAULT_MAX_WORKERS, progress_callback=None, resume: bool = True, force: bool = False, tickers: list = None, dl_technicals: bool = True, dl_fundamentals: bool = True, checkpoint_key: str = "spot_download"):
    """Download OHLCV and/or fundamentals for tickers in the database master list (or specified tickers list) with rate limit protection."""
    all_tickers = []
    if tickers is not None:
        all_tickers = [t.upper().strip() for t in tickers]
    else:
        with get_db_connection() as conn:
            cur = conn.cursor()
            cur.execute("""
                SELECT tm.ticker 
                FROM ticker_master tm
                LEFT JOIN excluded_tickers et ON tm.ticker = et.ticker AND (UPPER(et.status) = 'EXCLUDED' OR et.status IS NULL)
                WHERE et.ticker IS NULL
            """)
            all_tickers = [row[0] for row in cur.fetchall()]

    if not all_tickers:
        logger.warning("No tickers found in ticker_master!")
        return
    completed_set = get_completed_tickers(checkpoint_key, valid_tickers=all_tickers) if resume else set()
    pending_tickers = [t for t in all_tickers if t not in completed_set]

    logger.info(f"Starting spot download pipeline (max_workers={max_workers}, key={checkpoint_key}). Total: {len(all_tickers)}, Completed: {len(completed_set)}, Pending: {len(pending_tickers)}")

    if not pending_tickers:
        logger.info(f"All tickers already downloaded for {checkpoint_key}!")
        return

    success_count = len(completed_set)
    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        futures = {executor.submit(download_ticker_data, ticker, force=force, dl_technicals=dl_technicals, dl_fundamentals=dl_fundamentals): ticker for ticker in pending_tickers}
        for i, future in enumerate(as_completed(futures), 1):
            t = futures[future]
            res = future.result()
            if res:
                success_count += 1
                mark_ticker_completed(checkpoint_key, t)
            if progress_callback:
                logger.debug(f"[{i}/{len(pending_tickers)}] Downloaded {t}: {'Success' if res else 'Failed'}")
                progress_callback(t, res)
            else:
                logger.info(f"[{i}/{len(pending_tickers)}] Downloaded {t}: {'Success' if res else 'Failed'}")
                
    failed_count = len(all_tickers) - success_count
    logger.info(f"Pipeline completed. Total: {len(all_tickers)}, Succeeded: {success_count}, Failed: {failed_count}")
