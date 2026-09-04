#!/usr/bin/env python3
"""
seed_recommendation_master.py

Reads a CSV file containing broker/analyst recommendations and inserts them into
the broker_recommendations table in the database.

Expected CSV columns:
TICKER, DATE, RECOMMENDER, CMP, STOP_LOSS, TARGET, PERIOD, DESCRIPTION
"""

import os
import csv
import psycopg2
from psycopg2.extras import execute_batch
from dotenv import load_dotenv

def normalise_ticker(raw: str) -> str:
    """Upper-case, strip .NS / .BO suffix, strip whitespace."""
    t = raw.strip().upper()
    for suffix in (".NS", ".BO"):
        if t.endswith(suffix):
            t = t[: -len(suffix)]
    return t

def safe_float(val):
    try:
        return float(val) if val.strip() else None
    except:
        return None

def main():
    # 1. Load environment variables
    root_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    env_path = os.path.join(root_dir, '.env')
    load_dotenv(env_path)

    # 2. Get database connection string
    dsn = os.environ.get("POSTGRES_DSN") or os.environ.get("DATABASE_URL")
    if not dsn:
        dsn = "postgresql://jmbxdbuser:jmbxdbpassword@192.168.1.14:5432/bsa_db"
        
    csv_file = os.path.join(root_dir, "data", "recommendations_template.csv")
    if not os.path.isfile(csv_file):
        print(f"Error: CSV file not found at {csv_file}")
        return

    print(f"Connecting to database...")
    conn = psycopg2.connect(dsn)
    conn.autocommit = False
    cur = conn.cursor()

    # 3. Read CSV and prepare data
    print(f"Reading CSV file from {csv_file}...")
    records_to_insert = []
    
    with open(csv_file, mode='r', encoding='utf-8-sig') as f:
        reader = csv.DictReader(f)
        for row in reader:
            raw_ticker = row.get("TICKER", "").strip()
            rec_date = row.get("DATE", "").strip()
            recommender = row.get("RECOMMENDER", "").strip()
            
            if not raw_ticker or not rec_date or not recommender:
                print(f"Skipping invalid row (missing TICKER, DATE, or RECOMMENDER): {row}")
                continue
                
            ticker = normalise_ticker(raw_ticker)
            cmp_val = safe_float(row.get("CMP"))
            sl_val = safe_float(row.get("STOP_LOSS"))
            tgt_val = safe_float(row.get("TARGET"))
            period = row.get("PERIOD", "").strip()
            desc = row.get("DESCRIPTION", "").strip()[:255]

            records_to_insert.append((
                ticker, rec_date, recommender, cmp_val, sl_val, tgt_val, period, desc
            ))

    if not records_to_insert:
        print("No valid recommendations found in the CSV.")
        return

    # 4. Check that tickers exist in ticker_master
    tickers_in_file = tuple(set([r[0] for r in records_to_insert]))
    cur.execute("SELECT ticker FROM ticker_master WHERE ticker IN %s", (tickers_in_file,))
    valid_tickers = set([row[0] for row in cur.fetchall()])
    
    filtered_records = [r for r in records_to_insert if r[0] in valid_tickers]
    invalid_records = [r for r in records_to_insert if r[0] not in valid_tickers]
    
    if invalid_records:
        print(f"Warning: Skipped {len(invalid_records)} recommendations due to missing tickers in ticker_master.")

    if not filtered_records:
        print("No valid recommendations left after checking ticker_master.")
        return

    # 5. Insert into broker_recommendations
    print(f"Inserting {len(filtered_records)} recommendations into broker_recommendations...")
    
    query = """
        INSERT INTO broker_recommendations (
            ticker, rec_date, recommender, cmp, stop_loss, target, time_period, description
        ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
    """
    
    execute_batch(cur, query, filtered_records)
    
    conn.commit()
    cur.close()
    conn.close()
    
    print("=" * 50)
    print("SEED COMPLETE")
    print(f"Successfully processed and inserted {len(filtered_records)} recommendations.")

if __name__ == "__main__":
    main()
