#!/usr/bin/env python3
"""
BSA Remote Database Schema Update Tool.

Updates/initializes the PostgreSQL database schema on a target machine (or local host).
Supports --target (or --remote) to specify the target machine IP address.

Usage:
  python update_remote_schema.py --target 192.168.1.14
  python update_remote_schema.py --target 192.168.1.18 --seed-master
"""

import os
import sys
import argparse
import psycopg2
from dotenv import load_dotenv

# Ensure engine modules can be imported if seed-master is requested
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

def main():
    load_dotenv()
    load_dotenv("backend/.env.local", override=False)
    load_dotenv("backend/.env.remote", override=False)

    parser = argparse.ArgumentParser(description="Update PostgreSQL schema on a target machine.")
    parser.add_argument("--target", "--remote", "-t", "-r", "--host", dest="target", 
                        default=os.getenv("POSTGRES_HOST", "192.168.1.18"),
                        help="Target machine IP address or host (default: 192.168.1.18 or POSTGRES_HOST)")
    parser.add_argument("--source", "-s", dest="source",
                        default=os.getenv("POSTGRES_HOST", "localhost"),
                        help="Source host IP or hostname (default: POSTGRES_HOST or localhost)")
    parser.add_argument("--port", "-p", 
                        default=os.getenv("POSTGRES_PORT", "5432"),
                        help="Target PostgreSQL port (default: 5432)")
    parser.add_argument("--user", "-u", 
                        default=os.getenv("POSTGRES_USER", "jmbxdbuser"),
                        help="Database username (default: jmbxdbuser)")
    parser.add_argument("--password", "-pwd", 
                        default=os.getenv("POSTGRES_PASSWORD", "jmbxdbpassword"),
                        help="Database password (default: jmbxdbpassword)")
    parser.add_argument("--dbname", "-d", 
                        default=os.getenv("POSTGRES_DB", "bsa_db"),
                        help="Database name (default: bsa_db)")
    parser.add_argument("--schema-file", 
                        default="seeding.sql",
                        help="Path to SQL schema file (default: seeding.sql)")
    parser.add_argument("--seed-master", action="store_true",
                        help="Also seed master datasets (_production.csv) after schema update")

    args = parser.parse_args()

    print("==================================================")
    print("BSA SCHEMA UPDATE TOOL")
    print("==================================================")
    print(f"  Target Host : {args.target}")
    print(f"  Port        : {args.port}")
    print(f"  Database    : {args.dbname}")
    print(f"  User        : {args.user}")
    print(f"  Schema File : {args.schema_file}")
    print("==================================================\n")

    # 1. Verify schema file exists
    schema_path = args.schema_file
    if not os.path.isabs(schema_path):
        schema_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), schema_path)

    if not os.path.exists(schema_path):
        # Fallback to engine/database/schema.sql if seeding.sql is missing
        alt_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "engine", "database", "schema.sql")
        if os.path.exists(alt_path):
            schema_path = alt_path
        else:
            print(f"[×] Error: Schema file '{args.schema_file}' not found.")
            sys.exit(1)

    print(f"Reading DDL schema from: {schema_path}")
    with open(schema_path, "r", encoding="utf-8") as f:
        sql_content = f.read()

    # 2. Connect to Target Database
    dsn = f"postgresql://{args.user}:{args.password}@{args.target}:{args.port}/{args.dbname}"
    print(f"Connecting to target PostgreSQL database at {args.target}:{args.port}/{args.dbname}...")

    try:
        conn = psycopg2.connect(dsn)
        conn.autocommit = True
        cur = conn.cursor()
        print(f"[✓] Connected successfully to {args.target}!")
    except Exception as e:
        print(f"[×] Connection failed: {e}")
        print("\nPlease check that:")
        print(f"  1. Target PostgreSQL server at {args.target} is running.")
        print("  2. Remote postgresql.conf allows listening on external IPs (listen_addresses = '*').")
        print(f"  3. Remote pg_hba.conf allows client IP access for user '{args.user}'.")
        print("  4. Firewall port 5432 is open on the target host.")
        sys.exit(1)

    # 3. Apply DDL Statements
    print("\nApplying schema DDL statements to target database...")
    try:
        cur.execute(sql_content)
        print("[✓] Target database schema updated successfully!")
    except Exception as e:
        print(f"[×] Error applying schema DDL: {e}")
        conn.close()
        sys.exit(1)

    # 4. Verify created tables
    cur.execute("""
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema='public' AND table_type='BASE TABLE'
        ORDER BY table_name;
    """)
    tables = [row[0] for row in cur.fetchall()]
    print(f"\n[✓] Target database '{args.dbname}' now contains {len(tables)} tables:")
    for t in tables:
        print(f"  - {t}")

    conn.close()

    # 5. Optional Master Data Seeding
    if args.seed_master:
        print("\nSeeding master data tables into target database...")
        # Override env vars temporarily for seeder module
        os.environ["POSTGRES_HOST"] = args.target
        os.environ["POSTGRES_PORT"] = str(args.port)
        os.environ["POSTGRES_USER"] = args.user
        os.environ["POSTGRES_PASSWORD"] = args.password
        os.environ["POSTGRES_DB"] = args.dbname

        try:
            from engine.database.seeder import load_csv_files
            seeded = load_csv_files("_production.csv", verbose=True)
            if seeded:
                print("[✓] Target master data seeded successfully!")
            else:
                print("[×] Seeding encountered warnings/errors.")
        except Exception as e:
            print(f"[×] Master data seeding failed: {e}")

    print("\n[✓] All target schema update tasks complete!")

if __name__ == "__main__":
    main()
