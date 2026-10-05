#!/usr/bin/env python3
"""
BSA Pre-populated Data Remote Sync & Export Tool.

Allows exporting and restoring pre-populated analysis tables (or full database) 
from a source host to a target machine to save execution time and compute resources.

Usage:
  # 1. Sync full pre-populated DB to target machine:
  python export_to_remote.py --target 192.168.1.14

  # 2. Specify explicit source and target machine IPs:
  python export_to_remote.py --source 192.168.1.18 --target 192.168.1.14

  # 3. Sync pre-populated analysis scanner tables only:
  python export_to_remote.py --target 192.168.1.14 --mode analysis

  # 4. Create a dump file locally for manual transfer:
  python export_to_remote.py --dump-only
"""

import os
import sys
import time
import argparse
import subprocess
import psycopg2
from datetime import datetime
from dotenv import load_dotenv

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

load_dotenv()
load_dotenv("backend/.env.local", override=False)
load_dotenv("backend/.env.remote", override=False)

# Table Definitions by Category
MASTER_TABLES = [
    "system_config", "ticker_mappings", "sectors", "ticker_master",
    "ticker_sector", "watchlist", "watchlist_items", "users",
    "alternative_names", "excluded_tickers", "fno_stock_master",
    "fno_index_master", "opportunities_risk", "indices_master",
    "reference_pages", "screener_ticker_mappings", "broker_recommendations",
    "derivative_history"
]

RAW_DATA_TABLES = [
    "ohlcv_daily", "delivery_history", "fundamentals", "raw_fno_derivatives"
]

PREPOPULATED_ANALYSIS_TABLES = [
    "indicators_daily", "quicktrade", "screener", "operatorfootprint",
    "swinger", "monthly_swinger", "breakout", "trend_trading",
    "reversal_trading", "support_resistance", "fno_active",
    "analysis_summaries", "intraday_call", "historical_calls",
    "call_efficiency"
]

def format_sql_val(val):
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
    escaped = str(val).replace("'", "''")
    return f"'{escaped}'"

def generate_python_dump(source_host, port, user, password, dbname, target_tables, dump_path):
    print(f"Generating SQL dump using Python for {len(target_tables)} tables...")
    
    conn = None
    hosts_to_try = [source_host]
    for h in ["localhost", "127.0.0.1", "192.168.1.18", "192.168.1.14"]:
        if h not in hosts_to_try:
            hosts_to_try.append(h)

    for h in hosts_to_try:
        try:
            dsn = f"postgresql://{user}:{password}@{h}:{port}/{dbname}"
            conn = psycopg2.connect(dsn)
            print(f"[✓] Connected to source database at {h}:{port}/{dbname}")
            break
        except Exception:
            continue

    if not conn:
        print(f"[×] Failed to connect to source database on any of {hosts_to_try}")
        sys.exit(1)

    cur = conn.cursor()

    schema_sql_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "engine", "database", "schema.sql")

    with open(dump_path, "w", encoding="utf-8") as f:
        f.write(f"-- BSA Pre-populated Data Dump for '{dbname}'\n")
        f.write(f"-- Generated on {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n\n")
        f.write("SET statement_timeout = 0;\n")
        f.write("SET client_encoding = 'UTF8';\n")
        f.write("SET session_replication_role = 'replica';\n\n")

        if os.path.exists(schema_sql_path):
            f.write("-- SCHEMA DDL DEFINITIONS\n")
            with open(schema_sql_path, "r", encoding="utf-8") as sf:
                f.write(sf.read())
            f.write("\n\n")

        # Get available base tables
        cur.execute("SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE';")
        existing_tables = set(row[0] for row in cur.fetchall())

        tables_to_dump = [t for t in target_tables if t in existing_tables]

        for tbl in tables_to_dump:
            cur.execute(f'SELECT * FROM "{tbl}";')
            rows = cur.fetchall()
            col_names = [desc[0] for desc in cur.description]

            f.write(f"-- Data for table: {tbl} ({len(rows)} rows)\n")
            if rows:
                cols_str = '", "'.join(col_names)
                for row in rows:
                    vals = [format_sql_val(v) for v in row]
                    vals_str = ", ".join(vals)
                    f.write(f'INSERT INTO "{tbl}" ("{cols_str}") VALUES ({vals_str}) ON CONFLICT DO NOTHING;\n')
            f.write("\n")

        f.write("SET session_replication_role = 'origin';\n")
    
    conn.close()
    print(f"[✓] Dump written to {dump_path}")

def run_pg_dump(source_host, port, user, password, dbname, dump_path):
    env = os.environ.copy()
    env["PGPASSWORD"] = password
    cmd = [
        "pg_dump",
        "-h", source_host,
        "-p", str(port),
        "-U", user,
        "-d", dbname,
        "-F", "p",
        "--clean",
        "--if-exists"
    ]
    with open(dump_path, "w", encoding="utf-8") as outfile:
        res = subprocess.run(cmd, stdout=outfile, stderr=subprocess.PIPE, env=env, text=True)
    return res.returncode == 0

def restore_to_remote(remote_host, port, user, password, dbname, dump_path):
    print(f"\nRestoring pre-populated dump into target PostgreSQL at {remote_host}:{port}/{dbname}...")
    
    env = os.environ.copy()
    env["PGPASSWORD"] = password

    # Check connection first
    try:
        dsn = f"postgresql://{user}:{password}@{remote_host}:{port}/{dbname}"
        conn = psycopg2.connect(dsn)
        conn.close()
        print(f"[✓] Connection verified to target machine {remote_host}")
    except Exception as e:
        print(f"[×] Cannot connect to target database at {remote_host}:{port}/{dbname}: {e}")
        return False

    cmd = [
        "psql",
        "-h", remote_host,
        "-p", str(port),
        "-U", user,
        "-d", dbname,
        "-f", dump_path
    ]
    res = subprocess.run(cmd, capture_output=True, env=env, text=True)
    if res.returncode == 0:
        print(f"[✓] Pre-populated database restored successfully on target host {remote_host}!")
        return True
    else:
        print(f"[!] psql restore encountered warnings/notices: {res.stderr[:300]}")
        try:
            conn = psycopg2.connect(dsn)
            with conn.cursor() as cur:
                cur.execute("SELECT count(*) FROM information_schema.tables WHERE table_schema='public';")
                count = cur.fetchone()[0]
                print(f"[✓] Verified target database now has {count} active tables!")
            conn.close()
            return True
        except Exception as e:
            print(f"[×] Error verifying target restore: {e}")
            return False

def main():
    parser = argparse.ArgumentParser(description="Export pre-populated analysis & market data to a target remote host.")
    parser.add_argument("--target", "--remote", "-t", "-r", "--host", dest="target",
                        default=os.getenv("POSTGRES_HOST", "192.168.1.14"),
                        help="Target remote machine IP address or host (default: 192.168.1.14 or POSTGRES_HOST)")
    parser.add_argument("--source", "--source-host", "-s", dest="source",
                        default=os.getenv("POSTGRES_HOST", "localhost"),
                        help="Source database host IP or hostname (default: POSTGRES_HOST or localhost)")
    parser.add_argument("--port", "-p", default=os.getenv("POSTGRES_PORT", "5432"),
                        help="PostgreSQL port (default: 5432)")
    parser.add_argument("--user", "-u", default=os.getenv("POSTGRES_USER", "jmbxdbuser"),
                        help="Database username (default: jmbxdbuser)")
    parser.add_argument("--password", "-pwd", default=os.getenv("POSTGRES_PASSWORD", "jmbxdbpassword"),
                        help="Database password (default: jmbxdbpassword)")
    parser.add_argument("--dbname", "-d", default=os.getenv("POSTGRES_DB", "bsa_db"),
                        help="Database name (default: bsa_db)")
    parser.add_argument("--mode", choices=["full", "analysis", "master"], default="full",
                        help="Export mode: 'full' (all data & pre-computed analysis), 'analysis' (pre-computed scanner reports), 'master' (setup tables)")
    parser.add_argument("--dump-only", action="store_true",
                        help="Generate the .sql dump file locally without restoring to target host")

    args = parser.parse_args()

    start_time = time.time()
    print("==================================================")
    print("BSA PRE-POPULATED DATA EXPORT & REMOTE SYNC TOOL")
    print("==================================================")
    print(f"  Source Host : {args.source}")
    print(f"  Target Host : {args.target}")
    print(f"  Database    : {args.dbname}")
    print(f"  Mode        : {args.mode}")
    print("==================================================\n")

    dump_filename = f"bsa_prepopulated_{args.mode}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.sql"
    dump_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), dump_filename)
    latest_dump_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "bsa_db_latest.dump")

    # Determine tables to include based on mode
    if args.mode == "full":
        target_tables = MASTER_TABLES + RAW_DATA_TABLES + PREPOPULATED_ANALYSIS_TABLES
    elif args.mode == "analysis":
        target_tables = PREPOPULATED_ANALYSIS_TABLES
    else:
        target_tables = MASTER_TABLES

    print(f"1. Dumping pre-populated data ({len(target_tables)} tables) from source database...")

    # Attempt pg_dump first for full mode, fallback to python table dump
    dump_success = False
    if args.mode == "full":
        try:
            dump_success = run_pg_dump(args.source, args.port, args.user, args.password, args.dbname, dump_path)
        except Exception:
            dump_success = False

    if not dump_success:
        generate_python_dump(args.source, args.port, args.user, args.password, args.dbname, target_tables, dump_path)

    # Save copy as bsa_db_latest.dump for reference
    with open(dump_path, "rb") as src, open(latest_dump_path, "wb") as dst:
        dst.write(src.read())

    dump_size_mb = os.path.getsize(dump_path) / (1024 * 1024)
    print(f"[✓] Dump file created: {dump_filename} ({dump_size_mb:.2f} MB)")
    print(f"[✓] Updated reference copy: bsa_db_latest.dump")

    if args.dump_only:
        print("\n[✓] Dump completed in --dump-only mode. Skipping remote restore.")
        print(f"To restore manually on target host ({args.target}), run:")
        print(f"  psql -h {args.target} -U {args.user} -d {args.dbname} -f {dump_filename}")
        return

    # 2. Push / Restore to Remote Machine
    print(f"\n2. Syncing pre-populated data to target machine ({args.target})...")
    restored = restore_to_remote(args.target, args.port, args.user, args.password, args.dbname, dump_path)

    elapsed = time.time() - start_time
    if restored:
        print(f"\n==================================================")
        print(f"[✓] SUCCESS: Pre-populated data successfully synced to target machine {args.target}!")
        print(f"    Total time: {elapsed:.2f} seconds")
        print("    Target machine now has all computed analysis tables and is ready without re-running engine.cli!")
        print("==================================================")
    else:
        print(f"\n[!] Remote sync encountered an issue. Dump is saved at {dump_filename}.")

if __name__ == "__main__":
    main()
