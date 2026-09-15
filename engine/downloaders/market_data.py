import time
import logging
import yfinance as yf
import pandas as pd
import numpy as np
from datetime import datetime
from concurrent.futures import ThreadPoolExecutor, as_completed
from engine.database.connection import get_db_connection
from engine.utils.helpers import format_ticker, clean_ticker
from engine.utils.rate_limiter import pace_yfinance_request, yfinance_safe_call, DEFAULT_MAX_WORKERS

logger = logging.getLogger("bsa_market_downloader")

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
            with conn.cursor() as cur:
                cur.execute("SELECT MAX(trade_date) FROM ohlcv_daily WHERE ticker = %s", (ticker_clean,))
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

def download_ticker_data(ticker_raw: str, period: str = None, force: bool = False) -> bool:
    """Download OHLCV, compute indicators, fetch meta & fundamentals with smart incremental freshness logic."""
    ticker_clean = clean_ticker(ticker_raw)
    formatted = format_ticker(ticker_raw)
    now_str = datetime.now().isoformat(timespec="seconds")
    today_date = datetime.now().date()

    try:
        # Determine smart fetch period if not specified
        if not period:
            last_date = get_latest_trade_date(ticker_clean)
            if last_date and not force:
                days_diff = (today_date - last_date.date()).days
                # If last trade date is today (or yesterday/weekend within 1-2 days), skip download
                if days_diff <= 0 or (today_date.weekday() in [5, 6] and days_diff <= 2):
                    logger.info(f"Ticker {ticker_clean} is already up to date ({last_date.strftime('%Y-%m-%d')}). Skipping download.")
                    return True
                elif days_diff <= 7:
                    period = "5d"
                elif days_diff <= 30:
                    period = "1mo"
                else:
                    period = "2y"
            else:
                period = "2y"

        # 1. Fetch OHLCV with rate limit protection & backoff
        tk = yf.Ticker(formatted)
        df = yfinance_safe_call(lambda: tk.history(period=period, interval="1d"))
        if df is None or df.empty:
            logger.warning(f"No price data found for {ticker_clean}")
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
        has_options = bool(yfinance_safe_call(lambda: tk.options)) if hasattr(tk, "options") else False

        with get_db_connection() as conn:
            with conn.cursor() as cur:
                # Upsert ticker_master metadata while preserving/updating is_fno
                cur.execute("""
                    INSERT INTO ticker_master (ticker, company_name, is_fno, sector, exchange, updated_at)
                    VALUES (%s, %s, %s, %s, %s, %s)
                    ON CONFLICT (ticker) DO UPDATE SET
                        company_name = EXCLUDED.company_name,
                        is_fno = CASE WHEN EXCLUDED.is_fno = TRUE THEN TRUE ELSE ticker_master.is_fno END,
                        sector = EXCLUDED.sector,
                        exchange = EXCLUDED.exchange,
                        updated_at = EXCLUDED.updated_at
                """, (ticker_clean, company_name, has_options, sector, exchange, now_str))

                # Upsert OHLCV and Indicators
                for idx, row in enriched.iterrows():
                    date_str = idx.strftime("%Y-%m-%d")
                    
                    cur.execute("""
                        INSERT INTO ohlcv_daily (ticker, trade_date, open, high, low, close, volume, vwap, downloaded_at)
                        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                        ON CONFLICT (ticker, trade_date) DO UPDATE SET
                            open = EXCLUDED.open, high = EXCLUDED.high, low = EXCLUDED.low,
                            close = EXCLUDED.close, volume = EXCLUDED.volume, vwap = EXCLUDED.vwap,
                            downloaded_at = EXCLUDED.downloaded_at
                    """, (
                        ticker_clean, date_str,
                        _safe_float(row["Open"]), _safe_float(row["High"]),
                        _safe_float(row["Low"]), _safe_float(row["Close"]),
                        _safe_float(row["Volume"]), _safe_float(row["VWAP"]),
                        now_str
                    ))

                    cur.execute("""
                        INSERT INTO indicators_daily (
                            ticker, trade_date, rsi14, sma20, sma50, ema12, ema26,
                            macd_line, macd_signal, macd_hist, bb_upper, bb_mid, bb_lower,
                            atr14, tenkan_sen, kijun_sen, span_a, span_b, computed_at
                        ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                        ON CONFLICT (ticker, trade_date) DO UPDATE SET
                            rsi14 = EXCLUDED.rsi14, sma20 = EXCLUDED.sma20, sma50 = EXCLUDED.sma50,
                            ema12 = EXCLUDED.ema12, ema26 = EXCLUDED.ema26, macd_line = EXCLUDED.macd_line,
                            macd_signal = EXCLUDED.macd_signal, macd_hist = EXCLUDED.macd_hist,
                            bb_upper = EXCLUDED.bb_upper, bb_mid = EXCLUDED.bb_mid, bb_lower = EXCLUDED.bb_lower,
                            atr14 = EXCLUDED.atr14, tenkan_sen = EXCLUDED.tenkan_sen, kijun_sen = EXCLUDED.kijun_sen,
                            span_a = EXCLUDED.span_a, span_b = EXCLUDED.span_b, computed_at = EXCLUDED.computed_at
                    """, (
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
                conn.commit()

        # 3. Fundamentals
        download_fundamental_data(ticker_clean, formatted, tk)

        # 4. Auto-analyze and summarize immediately
        try:
            from engine.analysis.orchestrator import analyze_and_summarize_ticker
            analyze_and_summarize_ticker(ticker_clean)
        except Exception as e:
            logger.error(f"Error auto-analyzing after download for {ticker_clean}: {e}")

        return True

    except Exception as e:
        logger.error(f"Error downloading market data for {ticker_clean}: {e}")
        return False

def download_fundamental_data(ticker_clean: str, formatted: str, yf_ticker_obj=None) -> bool:
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

        # PE, Debt, and Market Cap
        info = yfinance_safe_call(lambda: tk.info) or {}
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
            with conn.cursor() as cur:
                cur.execute("""
                    INSERT INTO fundamentals (
                        ticker, fetched_date, market_cap, current_pe, avg_pe, last_pat, avg_pat,
                        last_other_income, avg_other_income, debt_to_equity,
                        is_pat_growing, is_other_income_ok, is_pe_ok, is_debt_equity_ok,
                        fundamental_score, passed, details
                    ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
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

def download_all_tickers(max_workers: int = DEFAULT_MAX_WORKERS, progress_callback=None, resume: bool = True, force: bool = False):
    """Download OHLCV and fundamentals for all tickers in the database master list with rate limit protection."""
    all_tickers = []
    with get_db_connection() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT ticker FROM ticker_master")
            all_tickers = [row[0] for row in cur.fetchall()]

    if not all_tickers:
        logger.warning("No tickers found in ticker_master!")
        return
    completed_set = get_completed_tickers("spot_download", valid_tickers=all_tickers) if resume else set()
    pending_tickers = [t for t in all_tickers if t not in completed_set]

    logger.info(f"Starting spot download pipeline (max_workers={max_workers}). Total: {len(all_tickers)}, Completed: {len(completed_set)}, Pending: {len(pending_tickers)}")

    if not pending_tickers:
        logger.info("All spot tickers already downloaded!")
        return

    success_count = len(completed_set)
    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        futures = {executor.submit(download_ticker_data, ticker, force=force): ticker for ticker in pending_tickers}
        for i, future in enumerate(as_completed(futures), 1):
            t = futures[future]
            res = future.result()
            if res:
                success_count += 1
                mark_ticker_completed("spot_download", t)
            if progress_callback:
                logger.debug(f"[{i}/{len(pending_tickers)}] Downloaded {t}: {'Success' if res else 'Failed'}")
                progress_callback(t, res)
            else:
                logger.info(f"[{i}/{len(pending_tickers)}] Downloaded {t}: {'Success' if res else 'Failed'}")
            
            # Batch sleep every 10 tickers to avoid triggering Yahoo Finance rate limit blocks
            if i % 10 == 0 and i < len(pending_tickers):
                time.sleep(1.0)
                
    failed_count = len(all_tickers) - success_count
    logger.info(f"Pipeline completed. Total: {len(all_tickers)}, Succeeded: {success_count}, Failed: {failed_count}")
