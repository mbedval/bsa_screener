#!/usr/bin/env python3
"""
Initial Master Seeding Script for BSA Screener.
Workable on a totally fresh PostgreSQL installation.

Performs:
1. Connects to PostgreSQL, checks/creates application superuser and target database.
2. Initializes clean table DDL schemas from engine/database/schema.sql.
3. Dynamically ingests all *_sample.csv files from data/ directory.
"""

import os
import sys
import argparse
import psycopg2
from dotenv import load_dotenv

# Ensure root directory is in Python path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from engine.database.provisioner import provision_database_user_and_db
from engine.database.seeder import load_csv_files
from engine.utils.checkpoint import clear_all_checkpoints

def run_schema_ddl(verbose: bool = True) -> bool:
    load_dotenv()
    
    host = os.getenv("POSTGRES_HOST", "127.0.0.1")
    port = os.getenv("POSTGRES_PORT", "5432")
    user = os.getenv("POSTGRES_USER", "jmbxdbuser")
    password = os.getenv("POSTGRES_PASSWORD", "jmbxdbpassword")
    target_db = os.getenv("POSTGRES_DB", "bsa_db")

    schema_file = os.path.join(os.path.dirname(__file__), "engine", "database", "schema.sql")
    if not os.path.exists(schema_file):
        print(f"[×] Error: Schema file not found at {schema_file}")
        return False

    with open(schema_file, "r", encoding="utf-8") as f:
        schema_sql = f.read()

    dsn = f"postgresql://{user}:{password}@{host}:{port}/{target_db}"

    try:
        if verbose:
            print(f"[+] Re-creating clean public schema in database '{target_db}'...")
        conn = psycopg2.connect(dsn)
        conn.autocommit = True
        cursor = conn.cursor()
        
        # Reset public schema to guarantee a completely fresh database state
        cursor.execute("DROP SCHEMA IF EXISTS public CASCADE;")
        cursor.execute("CREATE SCHEMA public;")
        cursor.execute(f"GRANT ALL ON SCHEMA public TO \"{user}\";")
        cursor.execute("GRANT ALL ON SCHEMA public TO public;")

        if verbose:
            print(f"[+] Applying schema DDL from '{schema_file}' to database '{target_db}'...")
        cursor.execute(schema_sql)
        cursor.close()
        conn.close()
        if verbose:
            print("[✓] Schema DDL tables and indexes initialized successfully.")
        return True
    except Exception as e:
        print(f"[×] Error applying schema DDL: {e}")
        return False

def main():
    parser = argparse.ArgumentParser(description="Initialize database schema & load sample master data.")
    parser.add_argument("-y", "--yes", action="store_true", help="Automatic yes to confirmation prompts.")
    args = parser.parse_args()

    load_dotenv()
    target_db = os.getenv("POSTGRES_DB", "bsa_db")

    print("==================================================")
    print("BSA SCREENER - INITIAL MASTER SEEDING")
    print("==================================================")

    if not args.yes:
        val = input(f"This will provision database '{target_db}' and load SAMPLE datasets. Proceed? (y/n): ").strip().lower()
        if val not in ("y", "yes"):
            print("Aborted.")
            sys.exit(0)

    # 1. Provision user & db
    print("\n[PHASE 1] Provisioning User & Database...")
    clear_all_checkpoints()
    if not provision_database_user_and_db(verbose=True):
        print("[×] Provisioning failed.")
        sys.exit(1)

    # 2. Run DDL schema
    print("\n[PHASE 2] Initializing DDL Schema Tables...")
    if not run_schema_ddl(verbose=True):
        print("[×] DDL schema initialization failed.")
        sys.exit(1)

    # 3. Seed Sample CSV Data
    print("\n[PHASE 3] Ingesting Sample Master Data (_sample.csv)...")
    if not load_csv_files(file_suffix="_sample.csv", verbose=True):
        print("[×] Sample data seeding failed.")
        sys.exit(1)

    print("\n==================================================")
    print("[✓] INITIAL MASTER SEEDING COMPLETE!")
    print("==================================================")

if __name__ == "__main__":
    main()
