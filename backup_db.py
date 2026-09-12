#!/usr/bin/env python3
"""
PostgreSQL Database Backup Script for bsa_db.
Dumps the complete PostgreSQL database (schema + table records) to timestamped and latest backup SQL files in the root folder.
Works using Python psycopg connection or system pg_dump.
"""

import os
import sys
import subprocess
from datetime import datetime
from dotenv import load_dotenv

# Base Directory & ENV Loading
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
env_path = os.path.join(BASE_DIR, '.env')
load_dotenv(env_path)

HOST = os.environ.get("POSTGRES_HOST", "192.168.1.14")
PORT = int(os.environ.get("POSTGRES_PORT", "5432"))
USER = os.environ.get("POSTGRES_USER", "jmbxdbuser")
PASSWORD = os.environ.get("POSTGRES_PASSWORD", "jmbxdbpassword")
DB_NAME = os.environ.get("POSTGRES_DB", "bsa_db")

def format_sql_value(val):
    if val is None:
        return "NULL"
    if isinstance(val, bool):
        return "TRUE" if val else "FALSE"
    if isinstance(val, (int, float)):
        return str(val)
    if isinstance(val, (dict, list)):
        import json
        escaped = json.dumps(val).replace("'", "''")
        return f"'{escaped}'"
    val_str = str(val).replace("'", "''")
    return f"'{val_str}'"

def dump_via_pg_dump(backup_path):
    env = os.environ.copy()
    env["PGPASSWORD"] = PASSWORD
    cmd = [
        "pg_dump",
        "-h", HOST,
        "-p", str(PORT),
        "-U", USER,
        "-d", DB_NAME,
        "-F", "p",
        "--clean",
        "--if-exists"
    ]
    with open(backup_path, "w", encoding="utf-8") as outfile:
        res = subprocess.run(cmd, stdout=outfile, stderr=subprocess.PIPE, env=env, text=True)
    return res.returncode == 0

def dump_via_python(backup_path):
    # Try importing psycopg or psycopg2
    try:
        import psycopg2
        conn = psycopg2.connect(host=HOST, port=PORT, user=USER, password=PASSWORD, dbname=DB_NAME)
    except ImportError:
        import psycopg
        conn = psycopg.connect(f"postgresql://{USER}:{PASSWORD}@{HOST}:{PORT}/{DB_NAME}")

    schema_sql_path = os.path.join(BASE_DIR, "engine", "database", "schema.sql")

    with conn, conn.cursor() as cur, open(backup_path, "w", encoding="utf-8") as f:
        f.write(f"-- PostgreSQL Clean Database Dump for '{DB_NAME}'\n")
        f.write(f"-- Generated on {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n\n")
        f.write("SET statement_timeout = 0;\n")
        f.write("SET lock_timeout = 0;\n")
        f.write("SET client_encoding = 'UTF8';\n")
        f.write("SET check_function_bodies = false;\n")
        f.write("SET client_min_messages = warning;\n")
        f.write("SET row_security = off;\n")
        f.write("SET session_replication_role = 'replica';\n\n")  # Disables foreign key & trigger constraints during restore

        # Include Schema DDL if schema.sql exists
        if os.path.exists(schema_sql_path):
            f.write("-- ========================================================\n")
            f.write("-- SCHEMA TABLE DEFINITIONS (DDL)\n")
            f.write("-- ========================================================\n\n")
            with open(schema_sql_path, "r", encoding="utf-8") as sf:
                f.write(sf.read())
            f.write("\n\n")

        # Get all tables in public schema and sort ticker_master/master tables first
        cur.execute("SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename;")
        tables = [r[0] for r in cur.fetchall()]

        # Master tables first priority
        priority_order = [
            'system_config', 'ticker_mappings', 'sectors', 'ticker_master',
            'ticker_sector', 'watchlist', 'watchlist_items', 'users',
            'alternative_names', 'excluded_tickers', 'fno_stock_master',
            'fno_index_master', 'opportunities_risk'
        ]
        
        sorted_tables = []
        for p in priority_order:
            if p in tables:
                sorted_tables.append(p)
        for t in tables:
            if t not in sorted_tables:
                sorted_tables.append(t)

        f.write("-- ========================================================\n")
        f.write("-- TABLE DATA INSERTS\n")
        f.write("-- ========================================================\n\n")

        for tbl in sorted_tables:
            f.write(f"-- Data for Name: {tbl}\n")
            cur.execute(f"SELECT * FROM \"{tbl}\";")
            rows = cur.fetchall()
            col_names = [desc[0] for desc in cur.description]

            if rows:
                cols_str = '", "'.join(col_names)
                for row in rows:
                    vals = [format_sql_value(v) for v in row]
                    vals_str = ", ".join(vals)
                    f.write(f"INSERT INTO \"{tbl}\" (\"{cols_str}\") VALUES ({vals_str}) ON CONFLICT DO NOTHING;\n")
                f.write("\n")

        f.write("SET session_replication_role = 'origin';\n")
        f.write("-- Backup Completed Successfully\n")

def run_backup():
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    backup_filename = f"bsa_db_backup_{timestamp}.dump"
    backup_path = os.path.join(BASE_DIR, backup_filename)
    latest_path = os.path.join(BASE_DIR, "bsa_db_latest.dump")
    sql_path = os.path.join(BASE_DIR, "bsa_db_latest.sql")

    print(f"📦 Starting database dump for '{DB_NAME}' from {HOST}:{PORT}...")

    success = False
    try:
        success = dump_via_pg_dump(backup_path)
    except Exception:
        success = False

    if not success:
        print("ℹ️ Direct database exporter generating custom SQL dump format...")
        try:
            dump_via_python(backup_path)
            success = True
        except Exception as e:
            print(f"❌ Backup generation failed: {e}")
            sys.exit(1)

    if success and os.path.exists(backup_path):
        size_bytes = os.path.getsize(backup_path)
        size_mb = size_bytes / (1024 * 1024)

        # Copy to bsa_db_latest.dump reference
        with open(backup_path, "rb") as src, open(latest_path, "wb") as dst:
            dst.write(src.read())

        # Also mirror as bsa_db_latest.sql for text compatibility
        with open(backup_path, "rb") as src, open(sql_path, "wb") as dst:
            dst.write(src.read())

        print(f"\n✅ Database dump created successfully in root folder!")
        print(f"📄 Timestamped Dump: {backup_filename} ({size_mb:.2f} MB)")
        print(f"🔗 Latest Dump Copy: bsa_db_latest.dump")
        print(f"\n🚀 To restore this .dump on a remote machine, run:")
        print(f"   psql -h <REMOTE_HOST> -U <REMOTE_USER> -d bsa_db -f bsa_db_latest.dump")
        print(f"   -- OR --")
        print(f"   pg_restore -h <REMOTE_HOST> -U <REMOTE_USER> -d bsa_db bsa_db_latest.dump")

if __name__ == "__main__":
    run_backup()

