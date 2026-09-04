#!/usr/bin/env python3
import csv
import logging
from pathlib import Path
from engine.database.connection import get_db_connection

logger = logging.getLogger("fno_seeder")

ROOT_DIR = Path(__file__).resolve().parent.parent.parent
FNO_CSV_PATH = ROOT_DIR / "data" / "fno_tickers.csv"

def seed_fno_tickers() -> int:
    """Seed fno_master from data/fno_tickers.csv and update is_fno flag in ticker_master."""
    symbols_data = []

    if FNO_CSV_PATH.exists():
        try:
            with open(FNO_CSV_PATH, "r", encoding="utf-8") as f:
                reader = csv.DictReader(f)
                symbols_data = list(reader)
            logger.info(f"Loaded {len(symbols_data)} F&O symbols from {FNO_CSV_PATH}")
        except Exception as e:
            logger.error(f"Error reading CSV file: {e}")

    if not symbols_data:
        logger.warning("No F&O symbol data available to seed.")
        return 0

    count = 0
    updated_count = 0
    try:
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                for row in symbols_data:
                    symbol = row.get("SYMBOL", "").strip().upper()
                    name = row.get("UNDERLYING_NAME", symbol).strip()
                    itype = row.get("INSTRUMENT_TYPE", "STOCK").strip().upper()
                    if not symbol:
                        continue

                    # 1. Insert into fno_master
                    cur.execute("""
                        INSERT INTO fno_master (symbol, underlying_name, instrument_type, is_active)
                        VALUES (%s, %s, %s, TRUE)
                        ON CONFLICT (symbol) DO UPDATE SET
                            underlying_name = EXCLUDED.underlying_name,
                            instrument_type = EXCLUDED.instrument_type,
                            is_active = TRUE
                    """, (symbol, name, itype))
                    count += 1

                    # 2. Update is_fno in ticker_master (or insert missing FNO stock into ticker_master)
                    cur.execute("""
                        INSERT INTO ticker_master (ticker, company_name, is_fno, exchange)
                        VALUES (%s, %s, TRUE, 'NSE')
                        ON CONFLICT (ticker) DO UPDATE SET is_fno = TRUE
                    """, (symbol, name))
                    updated_count += 1
                conn.commit()

        logger.info(f"F&O Seeding complete: {count} symbols loaded into fno_master, {updated_count} ticker_master records marked as is_fno=TRUE.")
        return count
    except Exception as e:
        logger.error(f"Error seeding F&O tickers: {e}")
        return 0

if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    res = seed_fno_tickers()
    print(f"Direct Execution Finished. Seeded/Updated {res} symbols.")
