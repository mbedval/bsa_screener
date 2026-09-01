import logging
from datetime import datetime
from concurrent.futures import ThreadPoolExecutor, as_completed
import yfinance as yf
import pandas as pd

from engine.database.connection import get_db_connection
from engine.downloaders.market_data import compute_indicators, compute_vwap
from engine.utils.logger import setup_logger

logger = setup_logger("bsa_us_market")

def download_us_ticker_data(ticker_raw: str, period: str = "2y") -> bool:
    """Download OHLCV, compute indicators, fetch metadata for US stocks (NYSE/NASDAQ)."""
    ticker_clean = ticker_raw.strip().upper()
    now_str = datetime.now().isoformat(timespec="seconds")

    try:
        tk = yf.Ticker(ticker_clean)
        df = tk.history(period=period, interval="1d")
        if df.empty:
            logger.warning(f"No price data found for US stock {ticker_clean}")
            return False

        if isinstance(df.index, pd.DatetimeIndex) and df.index.tz is not None:
            df.index = df.index.tz_localize(None)

        df["VWAP"] = compute_vwap(df)
        enriched = compute_indicators(df)

        enriched = enriched.dropna(subset=["Close"])
        if enriched.empty:
            logger.warning(f"No valid close prices for US stock {ticker_clean}")
            return False

        # Metadata
        info = tk.info
        company_name = info.get("longName", info.get("shortName", ticker_clean))
        sector = info.get("sector", "US Technology")
        exchange = info.get("exchange", "NASDAQ")

        with get_db_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("""
                    INSERT INTO ticker_master (ticker, company_name, sector, exchange, updated_at)
                    VALUES (%s, %s, %s, %s, %s)
                    ON CONFLICT (ticker) DO UPDATE SET
                        company_name = EXCLUDED.company_name,
                        sector = EXCLUDED.sector,
                        exchange = EXCLUDED.exchange,
                        updated_at = EXCLUDED.updated_at
                """, (ticker_clean, company_name, sector, exchange, now_str))

                # Insert OHLCV
                for idx_dt, row in enriched.iterrows():
                    trade_date = idx_dt.strftime("%Y-%m-%d")
                    cur.execute("""
                        INSERT INTO ohlcv_daily (ticker, trade_date, open, high, low, close, volume, vwap, downloaded_at)
                        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                        ON CONFLICT (ticker, trade_date) DO UPDATE SET
                            open = EXCLUDED.open,
                            high = EXCLUDED.high,
                            low = EXCLUDED.low,
                            close = EXCLUDED.close,
                            volume = EXCLUDED.volume,
                            vwap = EXCLUDED.vwap,
                            downloaded_at = EXCLUDED.downloaded_at
                    """, (
                        ticker_clean, trade_date,
                        float(row["Open"]), float(row["High"]), float(row["Low"]), float(row["Close"]),
                        int(row["Volume"]), float(row["VWAP"]), now_str
                    ))

                    # Insert Indicators
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
                        ticker_clean, trade_date,
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

                conn.commit()
        logger.info(f"Successfully downloaded US market data for {ticker_clean}")
        return True

    except Exception as e:
        logger.error(f"Error downloading US stock data for {ticker_clean}: {e}")
        return False

def download_all_us_tickers(max_workers: int = 5):
    """Download OHLCV and indicators for all US tickers in database."""
    tickers = []
    with get_db_connection() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT ticker FROM ticker_master")
            tickers = [row[0] for row in cur.fetchall()]

    if not tickers:
        logger.warning("No US tickers found in ticker_master!")
        return

    logger.info(f"Starting US market download for {len(tickers)} tickers...")
    success_count = 0
    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        futures = {executor.submit(download_us_ticker_data, ticker): ticker for ticker in tickers}
        for i, future in enumerate(as_completed(futures), 1):
            t = futures[future]
            res = future.result()
            if res:
                success_count += 1
            logger.info(f"[{i}/{len(tickers)}] US Downloaded {t}: {'Success' if res else 'Failed'}")
    failed_count = len(tickers) - success_count
    logger.info(f"US Download completed. Attempted: {len(tickers)}, Succeeded: {success_count}, Failed: {failed_count}")
