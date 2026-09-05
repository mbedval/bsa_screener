#!/usr/bin/env python3
"""
Full Production Dump Seeding Script for BSA Screener.

Ingests full production datasets (*_production.csv) including:
- 2,500+ master ticker records into ticker_master
- 210 official stock derivatives + index records into fno_master
- Full sector list, alternative names, excluded tickers, system configs, etc.
"""

import os
import sys
import argparse
from dotenv import load_dotenv

# Ensure root directory is in Python path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from engine.database.seeder import load_csv_files
from engine.utils.checkpoint import clear_all_checkpoints

def main():
    parser = argparse.ArgumentParser(description="Ingest full production datasets into database.")
    parser.add_argument("-y", "--yes", action="store_true", help="Automatic yes to confirmation prompts.")
    args = parser.parse_args()

    load_dotenv()
    target_db = os.getenv("POSTGRES_DB", "bsa_db")

    print("==================================================")
    print("BSA SCREENER - FULL PRODUCTION DUMP SEEDING")
    print("==================================================")

    if not args.yes:
        val = input(f"This will ingest FULL PRODUCTION datasets into '{target_db}'. Proceed? (y/n): ").strip().lower()
        if val not in ("y", "yes"):
            print("Aborted.")
            sys.exit(0)

    clear_all_checkpoints()

    print("\n[PHASE 1] Ingesting Production Datasets (_production.csv)...")
    if not load_csv_files(file_suffix="_production.csv", verbose=True):
        print("[×] Production data dump failed.")
        sys.exit(1)

    print("\n==================================================")
    print("[✓] FULL PRODUCTION DUMP SEEDING COMPLETE!")
    print("==================================================")

if __name__ == "__main__":
    main()
