"""Reset all BSA application data while retaining PostgreSQL tables and schema.

Default mode is a dry run. A real reset requires --confirm-reset-all.
"""
import argparse
from psycopg import sql
from app.config import settings
from app.database import get_connection
from scripts.seed_demo import SCANNER_COLUMNS, SECTORS

BASE_TABLES = {
    "ohlcv_daily", "indicators_daily", "fundamentals", "stock_meta",
    "historical_calls", "intraday_call", "price_history", "raw_fundamentals",
    "delivery_history", "cash_flow_summary", "delivery_to_trade", "subscribers",
    *SCANNER_COLUMNS.keys(), *SECTORS, *(f"{sector}_delivery" for sector in SECTORS),
}


def bsa_tables(cursor) -> list[str]:
    cursor.execute(
        """SELECT table_name FROM information_schema.tables
           WHERE table_schema = %s AND table_type = 'BASE TABLE'""",
        (settings.database_schema,),
    )
    existing = {row["table_name"] for row in cursor.fetchall()}
    return sorted(existing & BASE_TABLES)


def main():
    parser = argparse.ArgumentParser(description="Reset BSA data, without dropping tables.")
    parser.add_argument("--confirm-reset-all", action="store_true", help="perform the irreversible row deletion")
    args = parser.parse_args()
    with get_connection() as connection, connection.cursor() as cursor:
        tables = bsa_tables(cursor)
        if not tables:
            print("No BSA-owned tables found; nothing to reset.")
            return
        print(f"BSA reset scope ({len(tables)} tables): {', '.join(tables)}")
        if not args.confirm_reset_all:
            print("Dry run only. Re-run with --confirm-reset-all to delete every row in this scope.")
            return
        targets = sql.SQL(", ").join(sql.SQL("{}.{}").format(sql.Identifier(settings.database_schema), sql.Identifier(table)) for table in tables)
        cursor.execute(sql.SQL("TRUNCATE TABLE {} RESTART IDENTITY CASCADE").format(targets))
        connection.commit()
    print(f"Reset complete. Deleted all rows from {len(tables)} BSA tables; table definitions remain.")


if __name__ == "__main__":
    main()
