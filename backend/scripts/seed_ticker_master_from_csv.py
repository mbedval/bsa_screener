#!/usr/bin/env python3
"""
seed_ticker_master_from_csv.py

Reads a CSV file containing ticker information and upserts the data into
the ticker_master table in the database.

Expected CSV columns:
SYMBOL,NAME OF COMPANY, SERIES, DATE OF LISTING, PAID UP VALUE, MARKET LOT, ISIN NUMBER, FACE VALUE
"""

import os
import csv
import psycopg2
from psycopg2.extras import execute_batch
from dotenv import load_dotenv

def normalise_ticker(raw: str) -> str:
    """Upper-case, strip .NS / .BO / .bo suffix, strip whitespace."""
    t = raw.strip().upper()
    for suffix in (".NS", ".BO"):
        if t.endswith(suffix):
            t = t[: -len(suffix)]
    return t

def main():
    # 1. Load environment variables
    root_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    env_path = os.path.join(root_dir, '.env')
    load_dotenv(env_path)

    # 2. Get database connection string
    dsn = os.environ.get("POSTGRES_DSN") or os.environ.get("DATABASE_URL")
    if not dsn:
        dsn = "postgresql://jmbxdbuser:jmbxdbpassword@192.168.1.14:5432/bsa_db"
        
    csv_file = os.path.join(root_dir, "data", "tickers.csv")
    if not os.path.isfile(csv_file):
        print(f"Error: CSV file not found at {csv_file}")
        return

    print(f"Connecting to database...")
    conn = psycopg2.connect(dsn)
    conn.autocommit = False
    cur = conn.cursor()

    # 3. Read CSV and prepare data
    print(f"Reading CSV file from {csv_file}...")
    tickers_to_upsert = []
    
    with open(csv_file, mode='r', encoding='utf-8-sig') as f:
        reader = csv.DictReader(f)
        for row in reader:
            raw_symbol = row.get("SYMBOL", "").strip()
            company_name = row.get("NAME OF COMPANY", "").strip()
            
            if not raw_symbol:
                continue
                
            ticker = normalise_ticker(raw_symbol)
            tickers_to_upsert.append((
                ticker,
                company_name,
                "NSE"  # Default exchange
            ))

    if not tickers_to_upsert:
        print("No valid tickers found in the CSV.")
        return

    # 4. Upsert into ticker_master
    print(f"Upserting {len(tickers_to_upsert)} tickers into ticker_master...")
    
    query = """
        INSERT INTO ticker_master (ticker, company_name, exchange)
        VALUES (%s, %s, %s)
        ON CONFLICT (ticker) DO UPDATE SET
            company_name = EXCLUDED.company_name,
            updated_at = now()
    """
    
    execute_batch(cur, query, tickers_to_upsert)
    
    conn.commit()
    cur.close()
    conn.close()
    
    print("=" * 50)
    print("SEED COMPLETE")
    print(f"Successfully processed and upserted {len(tickers_to_upsert)} tickers.")

if __name__ == "__main__":
    main()
