#!/usr/bin/env python3
"""
seed_ticker_master_from_csv.py

Reads a CSV file containing ticker information (supporting both standard tickers.csv
and official NSE ind_nifty500list.csv) and upserts the data into the ticker_master table.
Supports both SQLite (default) and PostgreSQL databases.
"""

import os
import sys
import csv
import json
import sqlite3
from datetime import datetime
from dotenv import load_dotenv

ROOT_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
if ROOT_DIR not in sys.path:
    sys.path.insert(0, ROOT_DIR)

def normalise_ticker(raw: str) -> str:
    """Upper-case, strip .NS / .BO / .bo suffix, strip whitespace."""
    t = raw.strip().upper()
    for suffix in (".NS", ".BO", ".BSE"):
        if t.endswith(suffix):
            t = t[: -len(suffix)]
    return t

def main():
    env_path = os.path.join(ROOT_DIR, '.env')
    load_dotenv(env_path)

    # Choose CSV file (prefer tickers.csv, fallback to ind_nifty500list.csv)
    csv_file = os.path.join(ROOT_DIR, "data", "tickers.csv")
    if not os.path.isfile(csv_file):
        csv_file = os.path.join(ROOT_DIR, "data", "ind_nifty500list.csv")

    if not os.path.isfile(csv_file):
        print(f"Error: Neither tickers.csv nor ind_nifty500list.csv found in data directory.")
        return

    print(f"Reading CSV file from {csv_file}...")
    tickers_to_upsert = []
    now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    with open(csv_file, mode='r', encoding='utf-8-sig') as f:
        reader = csv.DictReader(f)
        for row in reader:
            raw_symbol = row.get("ticker") or row.get("SYMBOL") or row.get("Symbol") or ""
            company_name = row.get("company_name") or row.get("NAME OF COMPANY") or row.get("Company Name") or ""
            sector = row.get("sector") or row.get("Industry") or "Diversified"
            is_fno = row.get("is_fno", "False")
            is_fno_val = 1 if str(is_fno).strip().lower() in ("true", "1") else 0

            if not raw_symbol.strip():
                continue

            ticker = normalise_ticker(raw_symbol)
            tickers_to_upsert.append((
                ticker,
                company_name.strip(),
                is_fno_val,
                sector.strip(),
                json.dumps(["NSE", "NIFTY500"]),
                "NSE",
                now_str
            ))

    if not tickers_to_upsert:
        print("No valid tickers found in the CSV.")
        return

    # Check if Postgres DSN is specified, else default to SQLite
    pg_dsn = os.environ.get("POSTGRES_DSN") or os.environ.get("DATABASE_URL")
    sqlite_path = os.environ.get("SQLITE_PATH") or os.path.join(ROOT_DIR, "data", "bsa_db.sqlite3")

    if pg_dsn and "postgresql" in pg_dsn:
        try:
            import psycopg2
            from psycopg2.extras import execute_batch
            print(f"Connecting to PostgreSQL database...")
            conn = psycopg2.connect(pg_dsn)
            conn.autocommit = False
            cur = conn.cursor()
            query = """
                INSERT INTO ticker_master (ticker, company_name, is_fno, sector, index_memberships, exchange, updated_at)
                VALUES (%s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (ticker) DO UPDATE SET
                    company_name = EXCLUDED.company_name,
                    is_fno = EXCLUDED.is_fno,
                    sector = EXCLUDED.sector,
                    exchange = EXCLUDED.exchange,
                    updated_at = EXCLUDED.updated_at
            """
            execute_batch(cur, query, tickers_to_upsert)
            conn.commit()
            cur.close()
            conn.close()
            print(f"Successfully upserted {len(tickers_to_upsert)} tickers into PostgreSQL.")
            return
        except Exception as e:
            print(f"PostgreSQL connection/upsert failed ({e}). Falling back to SQLite.")

    # SQLite upsert
    print(f"Connecting to SQLite database at {sqlite_path}...")
    conn = sqlite3.connect(sqlite_path)
    cur = conn.cursor()
    query = """
        INSERT INTO ticker_master (ticker, company_name, is_fno, sector, index_memberships, exchange, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT (ticker) DO UPDATE SET
            company_name = excluded.company_name,
            is_fno = excluded.is_fno,
            sector = excluded.sector,
            exchange = excluded.exchange,
            updated_at = excluded.updated_at
    """
    cur.executemany(query, tickers_to_upsert)
    conn.commit()

    # Synchronize sectors and ticker_sector
    cur.execute("""
        INSERT OR IGNORE INTO sectors (name)
        SELECT DISTINCT sector FROM ticker_master WHERE sector IS NOT NULL AND TRIM(sector) != ''
    """)
    cur.execute("""
        INSERT OR IGNORE INTO ticker_sector (ticker, sector_id)
        SELECT tm.ticker, s.id
        FROM ticker_master tm
        JOIN sectors s ON s.name = tm.sector
        WHERE tm.sector IS NOT NULL AND TRIM(tm.sector) != ''
    """)
    conn.commit()
    conn.close()

    print("=" * 50)
    print("SEED COMPLETE")
    print(f"Successfully processed and upserted {len(tickers_to_upsert)} Nifty 500 tickers into SQLite.")

if __name__ == "__main__":
    main()
