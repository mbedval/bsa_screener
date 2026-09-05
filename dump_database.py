#!/usr/bin/env python3
"""
BSA Database Master Setup Dump Script.
Enforces Rule 1.1 (Phase 0 Master Setup Baseline):
1. Cleanses database by removing all old market data, raw fundamentals, option chains, technical indicators, and scanner reports.
2. Dumps ONLY master setup metadata tables into bsa_db_backup.sql.
"""

import os
import psycopg2
from dotenv import load_dotenv

load_dotenv()

host = os.getenv("POSTGRES_HOST", "192.168.1.18")
port = os.getenv("POSTGRES_PORT", "5432")
user = os.getenv("POSTGRES_USER", "jmbxdbuser")
password = os.getenv("POSTGRES_PASSWORD", "jmbxdbpassword")
database = os.getenv("POSTGRES_DB", "bsa_db")

dsn = f"postgresql://{user}:{password}@{host}:{port}/{database}"
output_file = "bsa_db_backup.sql"

# MASTER METADATA TABLES ONLY (Rule 1.1)
ALLOWED_MASTER_TABLES = {
    "system_config",
    "ticker_mappings",
    "sectors",
    "ticker_master",
    "ticker_sector",
    "watchlist",
    "watchlist_items",
    "users",
    "alternative_names",
    "excluded_tickers",
    "fno_stock_master",
    "fno_index_master",
    "fno_master"
}

print(f"Connecting to database {database} on {host}...")
conn = psycopg2.connect(dsn)
conn.autocommit = True
cur = conn.cursor()

# Get all base tables
cur.execute("SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE';")
all_tables = [row[0] for row in cur.fetchall()]

master_tables = [t for t in all_tables if t in ALLOWED_MASTER_TABLES]
non_master_tables = [t for t in all_tables if t not in ALLOWED_MASTER_TABLES]

# 1. Truncate all non-master tables (remove old market data, indicators, & analysis)
print(f"Cleansing database: Truncating {len(non_master_tables)} non-master data & analysis tables...")
for t in non_master_tables:
    try:
        cur.execute(f"TRUNCATE TABLE {t} RESTART IDENTITY CASCADE;")
        print(f"  [✓] Cleared non-master table: {t}")
    except Exception as e:
        print(f"  [!] Skip truncate for {t}: {e}")

# 2. Dump ONLY master setup metadata tables
print(f"\nDumping {len(master_tables)} master setup metadata tables into {output_file}...")

with open(output_file, "w", encoding="utf-8") as f:
    f.write(f"-- PostgreSQL Database Dump for {database} (Master Setup Baseline Only)\n")
    f.write(f"-- Host: {host} Port: {port}\n\n")

    for table in sorted(master_tables):
        print(f"Dumping master table: {table}")
        f.write(f"\n-- Data for table {table}\n")
        cur.execute(f"SELECT * FROM {table};")
        rows = cur.fetchall()
        if not rows:
            continue
        
        cur.execute(f"SELECT column_name FROM information_schema.columns WHERE table_name='{table}' ORDER BY ordinal_position;")
        cols = [col[0] for col in cur.fetchall()]
        col_names = ", ".join([f'"{c}"' for c in cols])
        
        for row in rows:
            vals = []
            for v in row:
                if v is None:
                    vals.append("NULL")
                elif isinstance(v, (int, float)):
                    vals.append(str(v))
                elif isinstance(v, bool):
                    vals.append("TRUE" if v else "FALSE")
                else:
                    escaped = str(v).replace("'", "''")
                    vals.append(f"'{escaped}'")
            f.write(f"INSERT INTO {table} ({col_names}) VALUES ({', '.join(vals)}) ON CONFLICT DO NOTHING;\n")

conn.close()
print(f"\n[✓] Golden Master Dump complete! Removed old non-master data and saved sample setup baseline to {output_file}")


