#!/usr/bin/env python3
"""
Single-command CLI script to download OHLCV market data, compute technical indicators, 
and execute algorithmic analysis & scoring for all US tickers present in ticker_master.

Target Database: bsa_db_us (US Market Database)
"""

import sys
import os
import logging
from datetime import datetime
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
import psycopg2
from psycopg2.extras import RealDictCursor
from dotenv import load_dotenv
import yfinance as yf
import pandas as pd
import numpy as np

# Setup Root Directory
ROOT_DIR = Path(__file__).resolve().parent
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

load_dotenv()

# Logging Configuration
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] (US_ENGINE) %(message)s",
    handlers=[
        logging.StreamHandler(sys.stdout)
    ]
)
logger = logging.getLogger("download_analyse_us_market")

def get_us_db_dsn() -> str:
    """Retrieve DSN for bsa_db_us database."""
    return os.getenv("POSTGRES_DSN_US") or os.getenv("US_POSTGRES_DSN") or "postgresql://jmbxdbuser:jmbxdbpassword@127.0.0.1:5432/bsa_db_us"

def get_us_conn():
    """Create connection to US database bsa_db_us."""
    return psycopg2.connect(get_us_db_dsn())

# ─── 1. Technical Indicators calculation ─────────────────────────────────────
def compute_vwap(df: pd.DataFrame) -> pd.Series:
    """Calculate Volume Weighted Average Price (VWAP)."""
    tp = (df["High"] + df["Low"] + df["Close"]) / 3.0
    return (tp * df["Volume"]).cumsum() / df["Volume"].cumsum()

def compute_indicators(df: pd.DataFrame) -> pd.DataFrame:
    """Compute RSI, SMA, EMA, MACD, Bollinger Bands, ATR, and Ichimoku Cloud."""
    df = df.copy()
    close = df["Close"]
    high = df["High"]
    low = df["Low"]

    # RSI (14)
    delta = close.diff()
    gain = delta.where(delta > 0, 0.0)
    loss = -delta.where(delta < 0, 0.0)
    avg_gain = gain.rolling(window=14, min_periods=14).mean()
    avg_loss = loss.rolling(window=14, min_periods=14).mean()
    rs = avg_gain / avg_loss.replace(0, np.nan)
    df["RSI14"] = 100 - (100 / (1 + rs))

    # SMAs and EMAs
    df["SMA20"] = close.rolling(20).mean()
    df["SMA50"] = close.rolling(50).mean()
    df["EMA12"] = close.ewm(span=12, adjust=False).mean()
    df["EMA26"] = close.ewm(span=26, adjust=False).mean()

    # MACD
    df["MACD_Line"] = df["EMA12"] - df["EMA26"]
    df["MACD_Signal"] = df["MACD_Line"].ewm(span=9, adjust=False).mean()
    df["MACD_Hist"] = df["MACD_Line"] - df["MACD_Signal"]

    # Bollinger Bands (20, 2)
    std20 = close.rolling(20).std()
    df["BB_Mid"] = df["SMA20"]
    df["BB_Upper"] = df["BB_Mid"] + (std20 * 2)
    df["BB_Lower"] = df["BB_Mid"] - (std20 * 2)

    # ATR (14)
    tr1 = high - low
    tr2 = (high - close.shift(1)).abs()
    tr3 = (low - close.shift(1)).abs()
    tr = pd.concat([tr1, tr2, tr3], axis=1).max(axis=1)
    df["ATR14"] = tr.rolling(14).mean()

    # Ichimoku Cloud
    df["Tenkan_sen"] = (high.rolling(9).max() + low.rolling(9).min()) / 2
    df["Kijun_sen"] = (high.rolling(26).max() + low.rolling(26).min()) / 2
    df["Span_A"] = ((df["Tenkan_sen"] + df["Kijun_sen"]) / 2).shift(26)
    df["Span_B"] = ((high.rolling(52).max() + low.rolling(52).min()) / 2).shift(26)

    return df

# ─── 2. Download US Market Ticker ──────────────────────────────────────────
def download_us_ticker(ticker: str, period: str = "2y") -> bool:
    """Fetch OHLCV data from yfinance and store in bsa_db_us."""
    clean_t = ticker.strip().upper()
    now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    try:
        if clean_t == "TESTSYNTH" and os.path.exists("data/synthetic/TESTSYNTH_ohlcv.csv"):
            logger.info(f"🧪 Loading dummy ticker '{clean_t}' from seeding CSV file 'data/synthetic/TESTSYNTH_ohlcv.csv'")
            df_csv = pd.read_csv("data/synthetic/TESTSYNTH_ohlcv.csv")
            df_csv["trade_date"] = pd.to_datetime(df_csv["trade_date"])
            df_csv = df_csv.sort_values("trade_date").set_index("trade_date")
            df_csv.index.name = "Date"
            df = df_csv.rename(columns={"open": "Open", "high": "High", "low": "Low", "close": "Close", "volume": "Volume"})
            company_name = "Synthetic Testing Corp (Dummy)"
            sector = "Software & Testing"
            exchange = "NASDAQ"
        else:
            tk = yf.Ticker(clean_t)
            df = tk.history(period=period, interval="1d")
            if df.empty:
                logger.warning(f"⚠️ No market price data found for US stock '{clean_t}'")
                return False

            if isinstance(df.index, pd.DatetimeIndex) and df.index.tz is not None:
                df.index = df.index.tz_localize(None)

            # Metadata
            info = tk.info
            company_name = info.get("longName") or info.get("shortName") or clean_t
            sector = info.get("sector") or "US Technology"
            exchange = info.get("exchange") or "NASDAQ"

        df["VWAP"] = compute_vwap(df)
        enriched = compute_indicators(df)
        enriched = enriched.dropna(subset=["Close"])
        if enriched.empty:
            logger.warning(f"⚠️ No close prices remaining for '{clean_t}'")
            return False

        with get_us_conn() as conn:
            conn.autocommit = True
            with conn.cursor() as cur:
                # Update Ticker Master
                cur.execute("""
                    INSERT INTO ticker_master (ticker, company_name, sector, exchange, updated_at)
                    VALUES (%s, %s, %s, %s, %s)
                    ON CONFLICT (ticker) DO UPDATE SET
                        company_name = EXCLUDED.company_name,
                        sector = EXCLUDED.sector,
                        exchange = EXCLUDED.exchange,
                        updated_at = EXCLUDED.updated_at
                """, (clean_t, company_name, sector, exchange, now_str))

                # Insert Daily OHLCV & Technical Indicators
                for idx_dt, row in enriched.iterrows():
                    trade_date = idx_dt.strftime("%Y-%m-%d")
                    cur.execute("""
                        INSERT INTO ohlcv_daily (ticker, trade_date, open, high, low, close, volume, vwap, downloaded_at)
                        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                        ON CONFLICT (ticker, trade_date) DO UPDATE SET
                            open = EXCLUDED.open, high = EXCLUDED.high, low = EXCLUDED.low,
                            close = EXCLUDED.close, volume = EXCLUDED.volume, vwap = EXCLUDED.vwap,
                            downloaded_at = EXCLUDED.downloaded_at
                    """, (
                        clean_t, trade_date,
                        float(row["Open"]), float(row["High"]), float(row["Low"]), float(row["Close"]),
                        int(row["Volume"]), float(row["VWAP"]), now_str
                    ))

                    cur.execute("""
                        INSERT INTO indicators_daily (
                            ticker, trade_date, rsi14, sma20, sma50, ema12, ema26,
                            macd_line, macd_signal, macd_hist, bb_upper, bb_mid, bb_lower,
                            atr14, tenkan_sen, kijun_sen, span_a, span_b, computed_at
                        )
                        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                        ON CONFLICT (ticker, trade_date) DO UPDATE SET
                            rsi14 = EXCLUDED.rsi14, sma20 = EXCLUDED.sma20, sma50 = EXCLUDED.sma50,
                            ema12 = EXCLUDED.ema12, ema26 = EXCLUDED.ema26, macd_line = EXCLUDED.macd_line,
                            macd_signal = EXCLUDED.macd_signal, macd_hist = EXCLUDED.macd_hist,
                            bb_upper = EXCLUDED.bb_upper, bb_mid = EXCLUDED.bb_mid, bb_lower = EXCLUDED.bb_lower,
                            atr14 = EXCLUDED.atr14, tenkan_sen = EXCLUDED.tenkan_sen, kijun_sen = EXCLUDED.kijun_sen,
                            span_a = EXCLUDED.span_a, span_b = EXCLUDED.span_b, computed_at = EXCLUDED.computed_at
                    """, (
                        clean_t, trade_date,
                        float(row["RSI14"]) if pd.notnull(row["RSI14"]) else None,
                        float(row["SMA20"]) if pd.notnull(row["SMA20"]) else None,
                        float(row["SMA50"]) if pd.notnull(row["SMA50"]) else None,
                        float(row["EMA12"]) if pd.notnull(row["EMA12"]) else None,
                        float(row["EMA26"]) if pd.notnull(row["EMA26"]) else None,
                        float(row["MACD_Line"]) if pd.notnull(row["MACD_Line"]) else None,
                        float(row["MACD_Signal"]) if pd.notnull(row["MACD_Signal"]) else None,
                        float(row["MACD_Hist"]) if pd.notnull(row["MACD_Hist"]) else None,
                        float(row["BB_Upper"]) if pd.notnull(row["BB_Upper"]) else None,
                        float(row["BB_Mid"]) if pd.notnull(row["BB_Mid"]) else None,
                        float(row["BB_Lower"]) if pd.notnull(row["BB_Lower"]) else None,
                        float(row["ATR14"]) if pd.notnull(row["ATR14"]) else None,
                        float(row["Tenkan_sen"]) if pd.notnull(row["Tenkan_sen"]) else None,
                        float(row["Kijun_sen"]) if pd.notnull(row["Kijun_sen"]) else None,
                        float(row["Span_A"]) if pd.notnull(row["Span_A"]) else None,
                        float(row["Span_B"]) if pd.notnull(row["Span_B"]) else None,
                        now_str
                    ))
        logger.info(f"✅ Downloaded & stored US market data for '{clean_t}'")
        return True
    except Exception as e:
        logger.error(f"❌ Failed downloading '{clean_t}': {e}")
        return False

# ─── 3. Analyze US Market Ticker ──────────────────────────────────────────
def analyze_us_ticker(ticker: str) -> bool:
    """Perform technical scoring and update analysis summaries and call logs for US market."""
    clean_t = ticker.strip().upper()
    now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    try:
        with get_us_conn() as conn:
            conn.autocommit = True
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                # Fetch latest OHLCV & Indicators
                cur.execute("""
                    SELECT o.close, o.open, o.high, o.low, o.volume,
                           i.rsi14, i.sma20, i.sma50, i.macd_line, i.macd_signal
                    FROM ohlcv_daily o
                    LEFT JOIN indicators_daily i ON o.ticker = i.ticker AND o.trade_date = i.trade_date
                    WHERE o.ticker = %s AND o.close IS NOT NULL
                    ORDER BY o.trade_date DESC LIMIT 1
                """, (clean_t,))
                row = cur.fetchone()

                if not row or not row["close"]:
                    logger.warning(f"⚠️ No analysis data available for '{clean_t}'")
                    return False

                close = float(row["close"])
                rsi = float(row["rsi14"] or 50.0)
                sma20 = float(row["sma20"] or close)
                sma50 = float(row["sma50"] or close)
                macd_line = float(row["macd_line"] or 0.0)
                macd_sig = float(row["macd_signal"] or 0.0)

                # Compute Technical Score (-1.0 to +1.0)
                score = 0.0
                if close > sma20: score += 0.3
                else: score -= 0.3

                if close > sma50: score += 0.3
                else: score -= 0.3

                if rsi > 55: score += 0.2
                elif rsi < 45: score -= 0.2

                if macd_line > macd_sig: score += 0.2
                else: score -= 0.2

                score = round(max(-1.0, min(1.0, score)), 2)

                # Determine Signal & Target / Stop Loss
                if score >= 0.25:
                    signal = "BUY"
                    target = round(close * 1.08, 2)
                    stop_loss = round(close * 0.96, 2)
                    confidence = round(score * 100, 1)
                elif score <= -0.25:
                    signal = "SELL"
                    target = round(close * 0.92, 2)
                    stop_loss = round(close * 1.04, 2)
                    confidence = round(abs(score) * 100, 1)
                else:
                    signal = "HOLD"
                    target = round(close * 1.02, 2)
                    stop_loss = round(close * 0.98, 2)
                    confidence = 50.0

                tech_summary = f"RSI: {rsi:.1f}, Close: ${close:.2f}, SMA20: ${sma20:.2f}, SMA50: ${sma50:.2f}, Score: {score:.2f}"
                action_insight = f"{signal} recommendation generated with {confidence:.1f}% confidence score."

                # Upsert Analysis Summaries
                cur.execute("""
                    INSERT INTO analysis_summaries (
                        ticker, close, technical_score, fundamental_score, behavioral_score, hybrid_score,
                        overall_signal, confidence, reasons, updated_at
                    ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                    ON CONFLICT (ticker) DO UPDATE SET
                        close = EXCLUDED.close,
                        technical_score = EXCLUDED.technical_score,
                        fundamental_score = EXCLUDED.fundamental_score,
                        behavioral_score = EXCLUDED.behavioral_score,
                        hybrid_score = EXCLUDED.hybrid_score,
                        overall_signal = EXCLUDED.overall_signal,
                        confidence = EXCLUDED.confidence,
                        reasons = EXCLUDED.reasons,
                        updated_at = EXCLUDED.updated_at
                """, (
                    clean_t, close, score, 0.0, score, score,
                    signal, confidence, tech_summary, now_str
                ))

                # Deduplication & Historical Call Logging
                if signal in ["BUY", "SELL"]:
                    cur.execute("""
                        SELECT id, recommended_call, entry_price, target_price, stop_loss, created_at, status
                        FROM historical_calls
                        WHERE ticker = %s AND status = 'ACTIVE'
                        ORDER BY created_at DESC LIMIT 1
                    """, (clean_t,))
                    existing = cur.fetchone()

                    if existing:
                        # Existing active call - evaluate outcome against latest CMP
                        call_id = existing["id"]
                        rec_call = existing["recommended_call"]
                        target_p = float(existing["target_price"])
                        sl_p = float(existing["stop_loss"])
                        
                        outcome = "ACTIVE"
                        if rec_call == "BUY":
                            if close >= target_p: outcome = "PASSED"
                            elif close <= sl_p: outcome = "FAILED"
                        else:
                            if close <= target_p: outcome = "PASSED"
                            elif close >= sl_p: outcome = "FAILED"

                        status_val = "CLOSED" if outcome in ["PASSED", "FAILED"] else "ACTIVE"
                        csl_val = round(abs(close - sl_p) / sl_p * 100, 1)
                        ctl_val = round(abs(target_p - close) / target_p * 100, 1)
                        closest_str = f"(CSL: {csl_val}%, CTL: {ctl_val}%)"

                        cur.execute("""
                            UPDATE historical_calls
                            SET final_cmp = %s, outcome = %s, status = %s, closest_info = %s
                            WHERE id = %s
                        """, (close, outcome, status_val, closest_str, call_id))
                    else:
                        # Create new recommendation record in historical_calls
                        rr = round(abs(target - close) / max(0.01, abs(close - stop_loss)), 2)
                        csl_val = round(abs(close - stop_loss) / stop_loss * 100, 1)
                        ctl_val = round(abs(target - close) / target * 100, 1)
                        closest_str = f"(CSL: {csl_val}%, CTL: {ctl_val}%)"

                        cur.execute("""
                            INSERT INTO historical_calls (
                                ticker, recommended_call, confidence, entry_price, stop_loss, target_price,
                                rr_ratio, status, outcome, closest_info, created_at
                            ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                        """, (
                            clean_t, signal, confidence, close, stop_loss, target,
                            rr, "ACTIVE", "ACTIVE", closest_str, now_str
                        ))

                # Update Call Efficiency Statistics Table
                cur.execute("""
                    SELECT 
                        COUNT(*) AS total_calls,
                        COUNT(*) FILTER (WHERE outcome = 'PASSED') AS passed,
                        COUNT(*) FILTER (WHERE outcome = 'FAILED') AS failed,
                        COUNT(*) FILTER (WHERE outcome = 'PARTIAL_SUCCESS') AS partial_success,
                        COUNT(*) FILTER (WHERE outcome = 'PARTIAL_FAIL') AS partial_fail
                    FROM historical_calls
                """)
                eff = cur.fetchone()
                if eff:
                    cur.execute("""
                        INSERT INTO call_efficiency (ticker, total_calls, passed, failed, partial_success, partial_fail, last_updated)
                        VALUES (%s, %s, %s, %s, %s, %s, %s)
                        ON CONFLICT (ticker) DO UPDATE SET
                            total_calls = EXCLUDED.total_calls,
                            passed = EXCLUDED.passed,
                            failed = EXCLUDED.failed,
                            partial_success = EXCLUDED.partial_success,
                            partial_fail = EXCLUDED.partial_fail,
                            last_updated = EXCLUDED.last_updated
                    """, (
                        clean_t, eff["total_calls"], eff["passed"], eff["failed"],
                        eff["partial_success"], eff["partial_fail"], now_str
                    ))

        # Scan and store candlestick patterns
        from engine.analysis.patterns import scan_and_store_ticker_patterns
        scan_and_store_ticker_patterns(clean_t, get_us_db_dsn())

        logger.info(f"✅ Analyzed & scored US ticker '{clean_t}': Signal={signal}, Score={score:.2f}")
        return True
    except Exception as e:
        logger.error(f"❌ Error analyzing US ticker '{clean_t}': {e}")
        return False

# ─── 4. Main Batch Orchestration Handler ──────────────────────────────────────
def download_and_analyse_us_market(max_workers: int = 5):
    """
    Main function to fetch all US tickers in ticker_master, download OHLCV + indicators,
    and compute quantitative analysis scoring for each stock.
    """
    print("\n" + "=" * 65)
    print(" 🚀 STARTING US MARKET DOWNLOAD & ANALYSIS PIPELINE")
    print(f" Database Target DSN: {get_us_db_dsn()}")
    print("=" * 65 + "\n")

    # Fetch tickers from US ticker_master
    tickers = []
    try:
        with get_us_conn() as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT ticker FROM ticker_master ORDER BY ticker")
                tickers = [row[0] for row in cur.fetchall()]
    except Exception as e:
        logger.error(f"Failed fetching US tickers from ticker_master: {e}")
        sys.exit(1)

    if not tickers:
        logger.warning("No active tickers found in US ticker_master table!")
        return

    logger.info(f"Found {len(tickers)} active US tickers in master database: {', '.join(tickers)}")

    # 1. Download Phase
    logger.info("\n--- STEP 1: Downloading OHLCV Market Data & Indicators ---")
    dl_success = 0
    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        futures = {executor.submit(download_us_ticker, t): t for t in tickers}
        for i, future in enumerate(as_completed(futures), 1):
            t = futures[future]
            ok = future.result()
            if ok: dl_success += 1
            logger.info(f"[{i}/{len(tickers)}] Download Progress: {t} -> {'SUCCESS' if ok else 'FAILED'}")

    logger.info(f"Download Phase Completed: {dl_success}/{len(tickers)} Succeeded.")

    # 2. Analysis & Scoring Phase
    logger.info("\n--- STEP 2: Executing Scoring & Deduplication Analysis ---")
    an_success = 0
    for i, t in enumerate(tickers, 1):
        ok = analyze_us_ticker(t)
        if ok: an_success += 1
        logger.info(f"[{i}/{len(tickers)}] Analysis Progress: {t} -> {'SUCCESS' if ok else 'FAILED'}")

    print("\n" + "=" * 65)
    print(" 🎉 US MARKET PIPELINE COMPLETED SUCCESSFULLY!")
    print(f" Tickers Downloaded: {dl_success}/{len(tickers)}")
    print(f" Tickers Analyzed:   {an_success}/{len(tickers)}")
    print("=" * 65 + "\n")

if __name__ == "__main__":
    download_and_analyse_us_market()
