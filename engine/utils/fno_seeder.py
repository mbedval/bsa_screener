#!/usr/bin/env python3
import csv
import logging
from pathlib import Path
from engine.database.connection import get_db_connection

ROOT_DIR = Path(__file__).resolve().parent.parent.parent
logger = logging.getLogger("fno_seeder")

def get_fno_csv_paths() -> list[Path]:
    """Check ticker_master size to choose sample vs production fno CSVs."""
    try:
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT COUNT(*) FROM ticker_master")
                count = cur.fetchone()[0]
                if count <= 10:
                    paths = [ROOT_DIR / "data" / "fno_stock_sample.csv", ROOT_DIR / "data" / "fno_index_sample.csv"]
                    return [p for p in paths if p.exists()]
    except Exception:
        pass
    paths = [ROOT_DIR / "data" / "fno_stock_production.csv", ROOT_DIR / "data" / "fno_index_production.csv"]
    existing = [p for p in paths if p.exists()]
    if existing:
        return existing
    legacy = ROOT_DIR / "data" / "fno_tickers.csv"
    return [legacy] if legacy.exists() else []

def seed_fno_tickers() -> int:
    """Seed fno_stock_master and fno_index_master from F&O CSVs and update is_fno flag in ticker_master."""
    csv_paths = get_fno_csv_paths()
    if not csv_paths:
        logger.warning("No F&O symbol data available to seed.")
        return 0

    count = 0
    updated_count = 0
    try:
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                for path in csv_paths:
                    with open(path, "r", encoding="utf-8") as f:
                        reader = csv.DictReader(f)
                        rows = list(reader)
                    for row in rows:
                        symbol = row.get("symbol") or row.get("SYMBOL") or ""
                        symbol = symbol.strip().upper()
                        name = row.get("underlying_name") or row.get("UNDERLYING_NAME") or symbol
                        name = name.strip()
                        itype = row.get("instrument_type") or row.get("INSTRUMENT_TYPE") or "STOCK"
                        itype = itype.strip().upper()
                        if not symbol:
                            continue

                        target_table = "fno_index_master" if itype == "INDEX" else "fno_stock_master"
                        cur.execute(f"""
                            INSERT INTO {target_table} (symbol, underlying_name, instrument_type, is_active)
                            VALUES (%s, %s, %s, TRUE)
                            ON CONFLICT (symbol) DO UPDATE SET
                                underlying_name = EXCLUDED.underlying_name,
                                instrument_type = EXCLUDED.instrument_type,
                                is_active = TRUE
                        """, (symbol, name, itype))
                        count += 1

                        if target_table == "fno_stock_master":
                            cur.execute("""
                                UPDATE ticker_master
                                SET is_fno = TRUE
                                WHERE ticker = %s
                            """, (symbol,))
                            updated_count += 1
                conn.commit()

        logger.info(f"F&O Seeding complete: {count} symbols loaded into fno_stock_master / fno_index_master.")
        return count
    except Exception as e:
        logger.error(f"Error seeding F&O tickers: {e}")
        return 0

if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    res = seed_fno_tickers()
    print(f"Direct Execution Finished. Seeded/Updated {res} symbols.")
