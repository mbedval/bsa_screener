#!/usr/bin/env python3
"""
Initial Master Seeding Script for BSA Screener (SQLite).
Workable with zero external database server setup.

Performs:
1. Ensures SQLite data directory exists.
2. Initializes clean table DDL schemas from engine/database/schema.sql.
3. Dynamically ingests master data CSV files from data/ directory.
"""

import os
import sys
import argparse
import sqlite3
from dotenv import load_dotenv

# Ensure root directory is in Python path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from engine.database.provisioner import provision_database_user_and_db
from engine.database.seeder import load_csv_files
from engine.utils.checkpoint import clear_all_checkpoints

def get_sqlite_path() -> str:
    load_dotenv()
    return os.getenv("SQLITE_PATH") or os.path.join(
        os.path.dirname(os.path.abspath(__file__)), "data", "bsa_db.sqlite3"
    )

def run_schema_ddl(verbose: bool = True) -> bool:
    db_path = get_sqlite_path()
    schema_file = os.path.join(os.path.dirname(__file__), "engine", "database", "schema.sql")
    if not os.path.exists(schema_file):
        print(f"[X] Error: Schema file not found at {schema_file}")
        return False

    with open(schema_file, "r", encoding="utf-8") as f:
        schema_sql = f.read()

    try:
        if verbose:
            print(f"[+] Applying schema DDL from '{schema_file}' to SQLite DB at '{db_path}'...")
        conn = sqlite3.connect(db_path)
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("PRAGMA foreign_keys=ON")
        conn.executescript(schema_sql)
        conn.commit()
        conn.close()
        if verbose:
            print("[OK] Schema DDL tables and indexes initialized successfully.")
        return True
    except Exception as e:
        print(f"[X] Error applying schema DDL: {e}")
        return False

def main():
    parser = argparse.ArgumentParser(description="Initialize database schema & load sample master data.")
    parser.add_argument("-y", "--yes", action="store_true", help="Automatic yes to confirmation prompts.")
    parser.add_argument("--prod", action="store_true", help="Seed production master data (_production.csv) instead of sample data.")
    args = parser.parse_args()

    db_path = get_sqlite_path()

    print("==================================================")
    print("BSA SCREENER - INITIAL MASTER SEEDING (SQLite)")
    print("==================================================")
    print(f"Target DB: {db_path}")

    suffix = "_production.csv" if args.prod else "_sample.csv"

    if not args.yes:
        val = input(f"This will initialize SQLite database '{db_path}' and load master datasets ({suffix}). Proceed? (y/n): ").strip().lower()
        if val not in ("y", "yes"):
            print("Aborted.")
            sys.exit(0)

    # 1. Provision directory
    print("\n[PHASE 1] Ensuring SQLite data directory...")
    clear_all_checkpoints()
    if not provision_database_user_and_db(verbose=True):
        print("[X] Provisioning failed.")
        sys.exit(1)

    # 2. Run DDL schema
    print("\n[PHASE 2] Initializing DDL Schema Tables...")
    if not run_schema_ddl(verbose=True):
        print("[X] DDL schema initialization failed.")
        sys.exit(1)

    # 3. Seed CSV Data
    print(f"\n[PHASE 3] Ingesting Master Data ({suffix})...")
    if not load_csv_files(file_suffix=suffix, verbose=True):
        print("[X] Data seeding failed.")
        sys.exit(1)

    print("\n==================================================")
    print("[OK] INITIAL MASTER SEEDING COMPLETE!")
    print("==================================================")

if __name__ == "__main__":
    main()
