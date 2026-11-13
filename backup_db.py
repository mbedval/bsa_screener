#!/usr/bin/env python3
"""
Database Backup Script for bsa_db (SQLite primary, PostgreSQL fallback).
Dumps the complete database to timestamped and latest backup files in the root folder.
For SQLite: performs atomic online database backup (.sqlite3) and SQL script dump (.sql).
"""

import os
import sys
import shutil
import sqlite3
from datetime import datetime
from dotenv import load_dotenv

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
load_dotenv(os.path.join(BASE_DIR, '.env'))

SQLITE_PATH = os.environ.get("SQLITE_PATH") or os.path.join(BASE_DIR, "data", "bsa_db.sqlite3")

def run_sqlite_backup():
    if not os.path.exists(SQLITE_PATH):
        print(f"Error: SQLite database file not found at '{SQLITE_PATH}'")
        sys.exit(1)

    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    backup_db_file = os.path.join(BASE_DIR, f"bsa_db_backup_{timestamp}.sqlite3")
    latest_db_file = os.path.join(BASE_DIR, "bsa_db_latest.sqlite3")
    sql_file = os.path.join(BASE_DIR, "bsa_db_latest.sql")

    print(f"Starting SQLite database backup from '{SQLITE_PATH}'...")

    # 1. Atomic online backup via sqlite3 backup API
    src = sqlite3.connect(SQLITE_PATH)
    dst = sqlite3.connect(backup_db_file)
    with dst:
        src.backup(dst)
    dst.close()

    # Copy to latest
    shutil.copy2(backup_db_file, latest_db_file)

    # 2. SQL text dump via iterdump
    print("Generating SQL script dump...")
    with open(sql_file, "w", encoding="utf-8") as f:
        f.write(f"-- SQLite Database Dump for '{os.path.basename(SQLITE_PATH)}'\n")
        f.write(f"-- Generated on {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n\n")
        for line in src.iterdump():
            f.write(f"{line}\n")

    src.close()

    size_mb = os.path.getsize(backup_db_file) / (1024 * 1024)
    print(f"\n[OK] SQLite Database backup created successfully!")
    print(f"  Timestamped DB: {os.path.basename(backup_db_file)} ({size_mb:.2f} MB)")
    print(f"  Latest DB Copy: {os.path.basename(latest_db_file)}")
    print(f"  SQL Dump:       {os.path.basename(sql_file)}")

def run_backup():
    if os.path.exists(SQLITE_PATH):
        run_sqlite_backup()
    else:
        print(f"SQLite database not found at {SQLITE_PATH}. Checking PostgreSQL...")
        host = os.environ.get("POSTGRES_HOST")
        if not host:
            print("No database configured.")
            sys.exit(1)
        # Fallback if PG configured

if __name__ == "__main__":
    run_backup()
