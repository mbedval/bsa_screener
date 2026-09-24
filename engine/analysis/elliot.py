import logging
from engine.database.connection import get_db_connection

logger = logging.getLogger("bsa_elliot_analysis")

def analyze_and_store_elliot(ticker: str):
    """
    Computes approximate Elliot Wave (W3, W5) patterns based on recent technicals
    and stores them in the elliot_analysis table.
    """
    try:
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                # Fetch recent indicators (up to 10 days) to see momentum trends
                cur.execute("""
                    SELECT trade_date, rsi14, macd_line, macd_signal, macd_hist, ema12, ema26, close
                    FROM indicators_daily i
                    JOIN ohlcv_daily o USING(ticker, trade_date)
                    WHERE ticker = %s
                    ORDER BY trade_date DESC LIMIT 10
                """, (ticker,))
                rows = cur.fetchall()

                if not rows or len(rows) < 3:
                    return

                # Get latest values
                latest = rows[0]
                rsi = float(latest[1]) if latest[1] else 0.0
                macd_hist = float(latest[4]) if latest[4] else 0.0
                macd_line = float(latest[2]) if latest[2] else 0.0
                ema12 = float(latest[5]) if latest[5] else 0.0
                ema26 = float(latest[6]) if latest[6] else 0.0
                
                prev = rows[1]
                prev_macd_hist = float(prev[4]) if prev[4] else 0.0

                current_wave = "None"
                weekly_prob = 0.0
                intraday_prob = 0.0

                # Wave 3 Approximation: Strong momentum, MACD expanding, RSI high but not overextended yet
                if macd_hist > 0 and macd_hist > prev_macd_hist and ema12 > ema26:
                    if 50 < rsi < 75:
                        current_wave = "W3"
                        weekly_prob = 80.0 + (rsi - 50)
                        intraday_prob = 75.0 + (macd_hist * 10)
                
                # Wave 5 Approximation: Divergence (price higher, but MACD/RSI lower than peak)
                # Simple approximation: RSI overextended, MACD positive but shrinking
                elif macd_hist > 0 and macd_hist < prev_macd_hist and ema12 > ema26:
                    if rsi > 70:
                        current_wave = "W5"
                        weekly_prob = 60.0
                        intraday_prob = 85.0
                
                # Cap probabilities
                weekly_prob = min(max(weekly_prob, 0.0), 99.0)
                intraday_prob = min(max(intraday_prob, 0.0), 99.0)

                # Store in DB
                cur.execute("""
                    INSERT INTO elliot_analysis (ticker, current_wave, weekly_probability, intraday_probability, updated_at)
                    VALUES (%s, %s, %s, %s, now())
                    ON CONFLICT (ticker) DO UPDATE SET
                        current_wave = EXCLUDED.current_wave,
                        weekly_probability = EXCLUDED.weekly_probability,
                        intraday_probability = EXCLUDED.intraday_probability,
                        updated_at = now()
                """, (ticker, current_wave, weekly_prob, intraday_prob))
            conn.commit()
    except Exception as e:
        logger.error(f"Error computing Elliot Wave for {ticker}: {e}")
