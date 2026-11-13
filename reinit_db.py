#!/usr/bin/env python3
"""
BSA Database Reset & Re-initialization Script (SQLite version).

Steps:
  1. Optionally delete the existing SQLite database file
  2. Re-apply the schema (creates all tables / indexes)
  3. Optionally seed master data from CSV files
  4. Optionally trigger a fresh download & analysis pipeline
"""
import os
import sys

# Add project root to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))


def confirm(prompt: str) -> bool:
    """Prompt for yes/no confirmation on terminal."""
    val = input(prompt).strip().lower()
    return val in ("yes", "y")


def main():
    from dotenv import load_dotenv
    load_dotenv()

    db_path = os.getenv("SQLITE_PATH") or os.path.join(
        os.path.dirname(os.path.abspath(__file__)), "data", "bsa_db.sqlite3"
    )

    print("==================================================")
    print("BSA DATABASE RESET & INITIALIZATION (SQLite)")
    print("==================================================")
    print(f"Database file: {db_path}")

    # Step 1: Confirm Delete
    print("\n==================================================")
    print("STEP 1: DELETE EXISTING DATABASE FILE")
    print("==================================================")
    if os.path.exists(db_path):
        if not confirm(
            f"WARNING: This will DELETE '{db_path}' and all existing data. Proceed? (yes/no): "
        ):
            print("Aborted.")
            sys.exit(0)
        try:
            os.remove(db_path)
            # Remove WAL and SHM sidecar files if present
            for ext in ("-wal", "-shm"):
                side = db_path + ext
                if os.path.exists(side):
                    os.remove(side)
            print(f"[OK] Database file '{db_path}' deleted successfully.")
        except Exception as e:
            print(f"[X] Error deleting database file: {e}")
            sys.exit(1)
    else:
        print(f"[i] No existing database found at '{db_path}'. Will create fresh.")

    # Step 2: Initialize Schema
    print("\n==================================================")
    print("STEP 2: INITIALIZE SCHEMA")
    print("==================================================")
    if confirm("Initialize database schema (create all tables & indexes)? (yes/no): "):
        import sqlite3
        from pathlib import Path
        Path(db_path).parent.mkdir(parents=True, exist_ok=True)
        schema_file = os.path.join(
            os.path.dirname(os.path.abspath(__file__)), "engine", "database", "schema.sql"
        )
        try:
            with open(schema_file, "r", encoding="utf-8") as f:
                schema_sql = f.read()
            conn = sqlite3.connect(db_path)
            conn.execute("PRAGMA journal_mode=WAL")
            conn.execute("PRAGMA foreign_keys=ON")
            conn.executescript(schema_sql)
            conn.commit()
            conn.close()
            print("[OK] Schema initialized successfully.")
        except Exception as e:
            print(f"[X] Schema initialization failed: {e}")
            sys.exit(1)

        # Step 2b: Seed master data
        if confirm("\nSeed full master data from CSV datasets (_production.csv)? (yes/no): "):
            try:
                from engine.database.seeder import load_csv_files
                seeded = load_csv_files("_production.csv", verbose=True)
                if seeded:
                    print("[OK] Full master dataset initialized successfully.")
                else:
                    print("[X] Master CSV data seeding encountered an error.")
                    sys.exit(1)
            except Exception as e:
                print(f"[X] Failed to run master data initialization: {e}")
                sys.exit(1)
    else:
        print("Skipped schema initialization.")

    # Step 3: Confirm Download & Analysis
    print("\n==================================================")
    print("STEP 3: EXECUTE FRESH DOWNLOAD & ANALYSIS PIPELINE")
    print("==================================================")
    if confirm("Would you like to trigger a fresh download and analysis for all tickers now? (yes/no): "):
        print("Importing pipeline modules...")
        from engine.downloaders.market_data import download_all_tickers
        from engine.downloaders.derivatives import download_all_derivatives
        from engine.analysis.orchestrator import analyze_all_tickers

        print("\nStarting Daily Market Data Download...")
        download_all_tickers()

        print("\nStarting Option Chain Derivatives Download...")
        download_all_derivatives()

        print("\nStarting Score Analysis Engine...")
        analyze_all_tickers()

        print("\n[OK] Database recreation, seeding, download, and analysis complete!")
    else:
        print("Skipped fresh download. Database is ready and initialized.")


if __name__ == "__main__":
    main()
