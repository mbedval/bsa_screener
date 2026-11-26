"""
engine/downloaders/mf_historical.py

Provides the ingestion framework to load historical monthly Mutual Fund portfolio
snapshots from a standardized CSV file into the normalized database schema.
"""

import os
import csv
from datetime import datetime
from typing import List, Dict, Optional, Tuple
# MIGRATED: import psycopg2
from dotenv import load_dotenv

# Load environment to get DB config
load_dotenv()

def get_connection():
    """Returns a psycopg2 database connection based on environment variables."""
    host = os.getenv("POSTGRES_HOST", "127.0.0.1")
    port = os.getenv("POSTGRES_PORT", "5432")
    user = os.getenv("POSTGRES_USER", "jmbxdbuser")
    password = os.getenv("POSTGRES_PASSWORD", "jmbxdbpassword")
    db = os.getenv("POSTGRES_DB", "bsa_db")
    dsn = f"postgresql://{user}:{password}@{host}:{port}/{db}"
    return psycopg2.connect(dsn)

def _get_or_create_amc(cur, amc_name: str) -> int:
    """Normalizes and gets/creates an AMC record, returning its ID."""
    clean_name = amc_name.strip().upper()
    cur.execute("SELECT id FROM mf_amc WHERE amc_name = ?", (clean_name,))
    row = cur.fetchone()
    if row:
        return row[0]
    
    cur.execute("INSERT INTO mf_amc (amc_name) VALUES (?) RETURNING id", (clean_name,))
    return cur.fetchone()[0]

def _get_or_create_scheme(cur, amc_id: int, scheme_name: str, scheme_code: Optional[str]) -> int:
    """Normalizes and gets/creates a Scheme record, returning its ID."""
    clean_name = scheme_name.strip().upper()
    cur.execute("SELECT id FROM mf_scheme WHERE amc_id = ? AND scheme_name = ?", (amc_id, clean_name))
    row = cur.fetchone()
    if row:
        # Optionally update scheme_code if it was previously null and now provided
        if scheme_code and scheme_code.strip():
            cur.execute("UPDATE mf_scheme SET scheme_code = ? WHERE id = ? AND scheme_code IS NULL", (scheme_code.strip(), row[0]))
        return row[0]
    
    clean_code = scheme_code.strip() if scheme_code else None
    cur.execute(
        "INSERT INTO mf_scheme (amc_id, scheme_code, scheme_name) VALUES (?, ?, ?) RETURNING id",
        (amc_id, clean_code, clean_name)
    )
    return cur.fetchone()[0]

def ingest_historical_mf_csv(file_path: str, source_name: str = "MANUAL_CSV") -> Tuple[int, int, int]:
    """
    Ingests a standardized historical MF portfolio CSV.
    Expected CSV Headers:
    snapshot_date, amc_name, scheme_code, scheme_name, ticker, isin, shares, market_value, portfolio_weight_pct
    
    Returns:
        (total_processed, inserted, skipped_duplicates)
    """
    if not os.path.exists(file_path):
        raise FileNotFoundError(f"CSV file not found: {file_path}")

    total_processed = 0
    inserted = 0
    skipped = 0

    with get_connection() as conn, conn.cursor() as cur:
        with open(file_path, mode='r', encoding='utf-8') as f:
            reader = csv.DictReader(f)
            
            # Map columns safely (ignore case/spacing in headers)
            header_map = {k.strip().lower(): k for k in reader.fieldnames or []}
            
            for row in reader:
                try:
                    # Extract fields
                    snapshot_date_str = row.get(header_map.get('snapshot_date', ''), '').strip()
                    amc_name = row.get(header_map.get('amc_name', ''), '').strip()
                    scheme_code = row.get(header_map.get('scheme_code', ''), '').strip()
                    scheme_name = row.get(header_map.get('scheme_name', ''), '').strip()
                    ticker = row.get(header_map.get('ticker', ''), '').strip().upper()
                    isin = row.get(header_map.get('isin', ''), '').strip()
                    shares_str = row.get(header_map.get('shares', ''), '').replace(',', '').strip()
                    mv_str = row.get(header_map.get('market_value', ''), '').replace(',', '').strip()
                    weight_str = row.get(header_map.get('portfolio_weight_pct', ''), '').replace('%', '').strip()
                    
                    if not snapshot_date_str or not amc_name or not scheme_name or not ticker:
                        continue # Skip invalid rows
                        
                    snapshot_date = datetime.strptime(snapshot_date_str, '%Y-%m-%d').date()
                    shares = int(float(shares_str)) if shares_str else None
                    market_value = float(mv_str) if mv_str else None
                    weight_pct = float(weight_str) if weight_str else None
                    
                    # Normalization Layer
                    amc_id = _get_or_create_amc(cur, amc_name)
                    scheme_id = _get_or_create_scheme(cur, amc_id, scheme_name, scheme_code)
                    
                    # Validate if ticker exists in ticker_master (Optional strictness)
                    cur.execute("SELECT 1 FROM ticker_master WHERE ticker = ?", (ticker,))
                    if not cur.fetchone():
                        # If ticker isn't in our master, we might skip or just insert assuming it's valid for future
                        # For BSA Screener, we typically only care about mapped tickers
                        continue
                    
                    # Insert historical record
                    cur.execute("""
                        INSERT INTO mf_historical_holdings 
                        (snapshot_date, scheme_id, ticker, isin, shares, market_value, portfolio_weight_pct, source, source_date)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                        ON CONFLICT (snapshot_date, scheme_id, ticker) DO NOTHING
                        RETURNING id
                    """, (
                        snapshot_date, scheme_id, ticker, isin, shares, market_value, weight_pct, source_name, snapshot_date
                    ))
                    
                    if cur.fetchone():
                        inserted += 1
                    else:
                        skipped += 1
                        
                    total_processed += 1
                    
                except Exception as e:
                    print(f"Error processing row {row}: {e}")
                    conn.rollback()
                    continue
                    
        conn.commit()

    return total_processed, inserted, skipped

if __name__ == "__main__":
    import sys
    if len(sys.argv) > 1:
        filepath = sys.argv[1]
        print(f"Ingesting {filepath}...")
        try:
            tot, ins, skp = ingest_historical_mf_csv(filepath)
            print(f"Done. Processed: {tot}, Inserted: {ins}, Skipped: {skp}")
        except Exception as e:
            print(f"Failed: {e}")
    else:
        print("Usage: python mf_historical.py <path_to_csv>")
