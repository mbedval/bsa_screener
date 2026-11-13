#!/usr/bin/env python3
"""
BSA Database Master Setup Dump Script (SQLite).
Enforces Rule 1.1 (Phase 0 Master Setup Baseline):
1. Cleanses database by removing all old market data, raw fundamentals, option chains, technical indicators, and scanner reports.
2. Dumps ONLY master setup metadata tables into bsa_db_backup.sql.
"""

import os
import sys
import argparse
import sqlite3
from dotenv import load_dotenv

load_dotenv()

def main():
    parser = argparse.ArgumentParser(description="BSA Database Master Setup Dump Script (SQLite).")
    parser.add_argument("--dbpath", "-d", dest="dbpath",
                        default=os.getenv("SQLITE_PATH", "data/bsa_db.sqlite3"),
                        help="Path to SQLite database file (default: SQLITE_PATH or data/bsa_db.sqlite3)")
    parser.add_argument("--output", "-o", dest="output",
                        default="bsa_db_backup.sql",
                        help="Output SQL dump file (default: bsa_db_backup.sql)")

    args = parser.parse_args()

    db_path = args.dbpath
    output_file = args.output

    # MASTER METADATA TABLES ONLY (Rule 1.1 & Phase 0 Baseline)
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
        "fno_master",
        "opportunities_risk",
        "indices_master",
        "reference_pages",
        "screener_ticker_mappings",
        "broker_recommendations",
        "derivative_history"
    }

    if not os.path.exists(db_path):
        print(f"Error: Database file '{db_path}' not found.")
        sys.exit(1)

    print(f"Connecting to SQLite database at {db_path}...")
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()

    # Get all user tables
    cur.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%';")
    all_tables = [row["name"] for row in cur.fetchall()]

    master_tables = [t for t in all_tables if t in ALLOWED_MASTER_TABLES]
    non_master_tables = [t for t in all_tables if t not in ALLOWED_MASTER_TABLES]

    # 1. Clear all non-master tables (remove old market data, indicators, & analysis)
    print(f"Cleansing database: Clearing {len(non_master_tables)} non-master data & analysis tables...")
    for t in non_master_tables:
        try:
            cur.execute(f"DELETE FROM {t};")
            print(f"  [OK] Cleared non-master table: {t}")
        except Exception as e:
            print(f"  [!] Skip clear for {t}: {e}")

    conn.commit()

    # 2. Dump ONLY master setup metadata tables
    print(f"\nDumping {len(master_tables)} master setup metadata tables into {output_file}...")

    with open(output_file, "w", encoding="utf-8") as f:
        f.write(f"-- SQLite Database Dump (Master Setup Baseline Only)\n")
        f.write(f"-- Database: {db_path}\n\n")

        for table in sorted(master_tables):
            cur.execute(f"PRAGMA table_info({table});")
            cols = [col["name"] for col in cur.fetchall()]
            col_names = ", ".join([f'"{c}"' for c in cols])

            cur.execute(f"SELECT * FROM {table};")
            rows = cur.fetchall()
            if not rows:
                continue

            print(f"Dumping master table: {table} ({len(rows)} rows)")
            f.write(f"\n-- Data for table {table}\n")

            for row in rows:
                vals = []
                for v in row:
                    if v is None:
                        vals.append("NULL")
                    elif isinstance(v, (int, float)):
                        vals.append(str(v))
                    else:
                        escaped = str(v).replace("'", "''")
                        vals.append(f"'{escaped}'")
                f.write(f"INSERT OR IGNORE INTO {table} ({col_names}) VALUES ({', '.join(vals)});\n")

    conn.close()
    print(f"\n[OK] Golden Master Dump complete! Removed old non-master data and saved sample setup baseline to {output_file}")

if __name__ == '__main__':
    main()
