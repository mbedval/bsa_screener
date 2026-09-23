import psycopg2
from engine.database.connection import get_db_connection

def test_sql():
    with get_db_connection() as conn:
        with conn.cursor() as cur:
            cur.execute("""
            WITH ranked_prices AS (
                SELECT 
                    ticker, trade_date, high, low, close,
                    LAG(high, 1) OVER (PARTITION BY ticker ORDER BY trade_date) as prev_high,
                    LAG(low, 1) OVER (PARTITION BY ticker ORDER BY trade_date) as prev_low,
                    LAG(high, 2) OVER (PARTITION BY ticker ORDER BY trade_date) as prev2_high,
                    LAG(low, 2) OVER (PARTITION BY ticker ORDER BY trade_date) as prev2_low,
                    ROW_NUMBER() OVER (PARTITION BY ticker ORDER BY trade_date DESC) as rn
                FROM ohlcv_daily
            )
            SELECT ticker, trade_date, high, prev_high, prev2_high, low, prev_low, prev2_low
            FROM ranked_prices
            WHERE rn = 1 
            AND high > prev_high AND prev_high > prev2_high
            AND low > prev_low AND prev_low > prev2_low
            LIMIT 5;
            """)
            for row in cur.fetchall():
                print(row)

test_sql()
