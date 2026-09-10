import logging
from engine.database.connection import get_db_connection

logger = logging.getLogger(__name__)

def ensure_table_exists(conn):
    """Ensures stocks_respecting_patterns database table exists."""
    with conn.cursor() as cur:
        cur.execute("""
            CREATE TABLE IF NOT EXISTS stocks_respecting_patterns (
                id SERIAL PRIMARY KEY,
                timeframe VARCHAR(10) NOT NULL,
                ticker VARCHAR(50) NOT NULL,
                company_name TEXT,
                sector TEXT,
                total_patterns INT DEFAULT 0,
                pass_count INT DEFAULT 0,
                fail_count INT DEFAULT 0,
                pass_rate DOUBLE PRECISION DEFAULT 0.0,
                avg_return_pct DOUBLE PRECISION DEFAULT 0.0,
                rank INT DEFAULT 1,
                analyzed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                CONSTRAINT stocks_respecting_patterns_unique UNIQUE (timeframe, ticker)
            );
        """)
        conn.commit()

def generate_stocks_respecting_patterns(conn=None) -> bool:
    """
    Computes top stocks that best respect chart pattern theory across 7 historical lookback durations
    (2d, 4d, 8d, 15d, 1m, 3m, 5m) and saves pre-calculated records into PostgreSQL database table.
    """
    durations = {
        "2d": 2,
        "4d": 4,
        "8d": 8,
        "15d": 15,
        "1m": 30,
        "3m": 90,
        "5m": 150
    }

    def _run_with_conn(active_conn):
        ensure_table_exists(active_conn)
        logger.info("Generating pre-calculated Stocks Respecting Patterns analysis for database...")

        with active_conn.cursor() as cur:
            cur.execute("TRUNCATE TABLE stocks_respecting_patterns RESTART IDENTITY;")
            total_records_inserted = 0

            for tf, days in durations.items():
                cur.execute(f"""
                    WITH pattern_subset AS (
                        SELECT p.ticker, p.pattern_name, p.category, p.close_price, p.detected_date
                        FROM chart_patterns p
                        WHERE p.detected_date >= (SELECT COALESCE(MAX(detected_date), CURRENT_DATE) FROM chart_patterns) - INTERVAL '{days} days'
                    ),
                    evaluated_subset AS (
                        SELECT 
                            p.ticker,
                            COALESCE(m.company_name, p.ticker) AS company_name,
                            COALESCE(m.sector, 'General') AS sector,
                            COUNT(*)::int AS total_patterns,
                            SUM(
                                CASE 
                                    WHEN p.category = 'BULLISH' AND sub.max_high > (p.close_price * 1.003) THEN 1
                                    WHEN p.category = 'BEARISH' AND sub.min_low < (p.close_price * 0.997) THEN 1
                                    WHEN p.category = 'NEUTRAL' AND (ABS(sub.latest_close - p.close_price) / NULLIF(p.close_price, 0)) * 100.0 >= 0.5 THEN 1
                                    ELSE 0
                                END
                            )::int AS pass_count,
                            (COUNT(*) - SUM(
                                CASE 
                                    WHEN p.category = 'BULLISH' AND sub.max_high > (p.close_price * 1.003) THEN 1
                                    WHEN p.category = 'BEARISH' AND sub.min_low < (p.close_price * 0.997) THEN 1
                                    WHEN p.category = 'NEUTRAL' AND (ABS(sub.latest_close - p.close_price) / NULLIF(p.close_price, 0)) * 100.0 >= 0.5 THEN 1
                                    ELSE 0
                                END
                            ))::int AS fail_count,
                            ROUND(
                                (SUM(
                                    CASE 
                                        WHEN p.category = 'BULLISH' AND sub.max_high > (p.close_price * 1.003) THEN 1
                                        WHEN p.category = 'BEARISH' AND sub.min_low < (p.close_price * 0.997) THEN 1
                                        WHEN p.category = 'NEUTRAL' AND (ABS(sub.latest_close - p.close_price) / NULLIF(p.close_price, 0)) * 100.0 >= 0.5 THEN 1
                                        ELSE 0
                                    END
                                )::numeric / COUNT(*)::numeric) * 100.0, 1
                            )::float AS pass_rate,
                            ROUND(
                                AVG(
                                    CASE 
                                        WHEN p.category = 'BULLISH' THEN ((sub.max_high - p.close_price) / NULLIF(p.close_price, 0)) * 100.0
                                        WHEN p.category = 'BEARISH' THEN ((p.close_price - sub.min_low) / NULLIF(p.close_price, 0)) * 100.0
                                        ELSE (ABS(sub.latest_close - p.close_price) / NULLIF(p.close_price, 0)) * 100.0
                                    END
                                )::numeric, 2
                            )::float AS avg_return_pct
                        FROM pattern_subset p
                        LEFT JOIN ticker_master m ON UPPER(p.ticker) = UPPER(m.ticker)
                        LEFT JOIN LATERAL (
                            SELECT 
                                COALESCE(MAX(o.high), p.close_price) AS max_high,
                                COALESCE(MIN(o.low), p.close_price) AS min_low,
                                COALESCE((SELECT o2.close FROM ohlcv_daily o2 WHERE o2.ticker = p.ticker AND o2.trade_date::date > p.detected_date::date ORDER BY o2.trade_date::date DESC LIMIT 1), p.close_price) AS latest_close
                            FROM ohlcv_daily o 
                            WHERE o.ticker = p.ticker AND o.trade_date::date > p.detected_date::date AND o.trade_date::date <= p.detected_date::date + INTERVAL '10 days'
                        ) sub ON TRUE
                        GROUP BY p.ticker, m.company_name, m.sector
                        ORDER BY pass_count DESC, pass_rate DESC, total_patterns DESC
                        LIMIT 25
                    )
                    INSERT INTO stocks_respecting_patterns 
                        (timeframe, ticker, company_name, sector, total_patterns, pass_count, fail_count, pass_rate, avg_return_pct, rank, analyzed_at)
                    SELECT 
                        '{tf}', ticker, company_name, sector, total_patterns, pass_count, fail_count, pass_rate, avg_return_pct,
                        ROW_NUMBER() OVER (ORDER BY pass_count DESC, pass_rate DESC, total_patterns DESC)::int,
                        CURRENT_TIMESTAMP
                    FROM evaluated_subset;
                """)
                total_records_inserted += cur.rowcount

            active_conn.commit()
            logger.info(f"[✓] Successfully populated {total_records_inserted} records into 'stocks_respecting_patterns' table across 7 lookback durations.")
            return True

    try:
        if conn is not None:
            return _run_with_conn(conn)
        else:
            with get_db_connection() as new_conn:
                return _run_with_conn(new_conn)
    except Exception as e:
        logger.error(f"Error generating stocks respecting patterns: {e}")
        return False

if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    generate_stocks_respecting_patterns()
