"""Remove only the rows inserted by scripts.seed_demo; never drops tables.

The legacy clauses cover the initial timestamped seed version that shipped before
the stable DEMO_SEED_V1 marker was introduced.
"""
from psycopg import sql
from app.database import get_connection
from scripts.seed_demo import DEMO_RUN_ID, SECTORS


def delete(cursor, table, condition, params=()):
    cursor.execute(sql.SQL("DELETE FROM {} WHERE " + condition).format(sql.Identifier(table)), params)
    return cursor.rowcount


def main():
    removed = 0
    with get_connection() as connection, connection.cursor() as cursor:
        # Stable records from all future runs and exact textual/value fingerprints
        # from the first timestamped mock run.
        removed += delete(cursor, "historical_calls", """uniqueid = %s OR
            (ticker = 'SONACOMS' AND cmp = 815.0 AND closest = 'CSL: 769.40, CTL: 915.40') OR
            (ticker = 'SYNGENE' AND cmp = 403.4 AND closest = 'CSL: 388.36, CTL: 418.44') OR
            (ticker = 'COFORGE' AND cmp = 2014.6 AND closest = 'CSL: 1952.47, CTL: 2151.29') OR
            (ticker = 'TATAPOWER' AND cmp = 448.2 AND closest = 'Target progression') OR
            (ticker = 'MGL' AND cmp = 1092.8 AND closest = 'Range-bound')""", (DEMO_RUN_ID,))
        removed += delete(cursor, "intraday_call", "uniqueid = %s OR actionable_insight IN ('Above VWAP with broad market support', 'Volume confirms a range breakout', 'Wait for a decisive close above resistance')", (DEMO_RUN_ID,))
        scanner_tables = ["quicktrade_timestamp", "screener_timestamp", "operatorfootprint", "swinger", "monthly_swinger", "breakout", "trend_trading", "reversal_trading", "support_resistance"]
        for table in scanner_tables:
            removed += delete(cursor, table, "run_time = %s OR (ticker = 'SONACOMS' AND close = 823.6)", (DEMO_RUN_ID,))
        removed += delete(cursor, "price_history", "ticker = 'SONACOMS' AND close >= 785 AND close <= 823 AND volume BETWEEN 1200000 AND 1380000")
        removed += delete(cursor, "delivery_history", "ticker = 'SONACOMS' AND delivery_ratio IN (39, 46.2, 53.4, 60.6)")
        mock_fundamental_tickers = ("POLYCAB", "SYNGENE", "KAYNES", "BEL", "DIVISLAB")
        for ticker, company, market_cap in [("POLYCAB", "Polycab India", 520000), ("SYNGENE", "Syngene International", 170000), ("KAYNES", "Kaynes Technology", 350000), ("BEL", "Bharat Electronics", 290000), ("DIVISLAB", "Divi's Laboratories", 160000)]:
            removed += delete(cursor, "raw_fundamentals", "ticker = %s AND stock_name = %s AND market_cap = %s", (ticker, company, market_cap))
        for index, sector in enumerate(SECTORS):
            ticker = mock_fundamental_tickers[index % len(mock_fundamental_tickers)]
            removed += delete(cursor, sector, "ticker = %s AND score = %s", (ticker, round(71 + index * 1.3, 1)))
            removed += delete(cursor, f"{sector}_delivery", "ticker = %s AND insight = 'Delivery ratio is 70.6%% above the 30-day average — accumulation watch.'", (ticker,))
        connection.commit()
    print(f"Removed {removed} BSA demo rows. Tables were preserved.")


if __name__ == "__main__":
    main()
