#!/usr/bin/env python3
import os
import sys
import subprocess
import shutil
import psycopg2
from dotenv import load_dotenv

# Add the project root to python path to use imports
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

def confirm(prompt: str) -> bool:
    """Helper to prompt for yes/no confirmation on terminal."""
    val = input(prompt).strip().lower()
    return val in ("yes", "y")

def main():
    load_dotenv()
    
    # Connection details
    host = os.getenv("POSTGRES_HOST", "127.0.0.1")
    port = os.getenv("POSTGRES_PORT", "5432")
    user = os.getenv("POSTGRES_USER", "jmbxdbuser")
    password = os.getenv("POSTGRES_PASSWORD", "jmbxdbpassword")
    target_db = os.getenv("POSTGRES_DB", "bsa_db")

    print("==================================================")
    # Step 1: Confirm Database Drop
    print(f"STEP 1: DROP DATABASE '{target_db}'")
    print("==================================================")
    if not confirm(f"WARNING: This will drop the database '{target_db}' and delete ALL existing data. Proceed? (yes/no): "):
        print("Aborted.")
        sys.exit(0)

    # Connect to maintenance db to perform drop/create
    maintenance_dsn = f"postgresql://{user}:{password}@{host}:{port}/postgres"
    try:
        conn = psycopg2.connect(maintenance_dsn)
        conn.autocommit = True
        with conn.cursor() as cur:
            # Terminate active connections to the target db so it can be dropped
            cur.execute(f"""
                SELECT pg_terminate_backend(pg_stat_activity.pid)
                FROM pg_stat_activity
                WHERE pg_stat_activity.datname = '{target_db}' AND pid <> pg_backend_pid();
            """)
            print(f"Terminated other active connections to '{target_db}'.")
            
            cur.execute(f"DROP DATABASE IF EXISTS {target_db};")
            print(f"[✓] Database '{target_db}' dropped successfully.")
            
            cur.execute(f"CREATE DATABASE {target_db};")
            print(f"[✓] Fresh database '{target_db}' created successfully.")
        conn.close()
    except Exception as e:
        print(f"[×] Error dropping/recreating database: {e}")
        sys.exit(1)

    print("\n==================================================")
    # Step 2: Confirm Seeding
    print("STEP 2: INITIALIZE SCHEMA & SEED MASTER DATA")
    print("==================================================")
    if confirm("Would you like to initialize tables and seed full master data (2,570 tickers, About Company, sectors, indices, F&O lists)? (yes/no): "):
        try:
            print("1/2. Creating database schema tables from seeding.sql...")
            target_dsn = f"postgresql://{user}:{password}@{host}:{port}/{target_db}"
            psql_bin = shutil.which("psql")
            if psql_bin:
                cmd = [psql_bin, "-d", target_db, "-h", host, "-U", user, "-f", "seeding.sql"]
                env = os.environ.copy()
                env["PGPASSWORD"] = password
                res = subprocess.run(cmd, env=env, capture_output=True, text=True)
                if res.returncode != 0:
                    print(f"[×] Schema initialization failed:\n{res.stderr}")
                    sys.exit(1)
            else:
                conn = psycopg2.connect(target_dsn)
                conn.autocommit = True
                cur = conn.cursor()
                with open("seeding.sql", "r", encoding="utf-8") as f:
                    cur.execute(f.read())
                conn.close()
            
            print("2/2. Seeding full master data from CSV datasets (_production.csv)...")
            from engine.database.seeder import load_csv_files
            seeded = load_csv_files("_production.csv", verbose=True)
            if seeded:
                print("[✓] Full master dataset (2,570 tickers, About Company, sectors, F&O lists) initialized successfully.")
            else:
                print("[×] Master CSV data seeding encountered an error.")
                sys.exit(1)
        except Exception as e:
            print(f"[×] Failed to run master data initialization: {e}")
            sys.exit(1)
    else:
        print("Skipped seeding tables.")

    print("\n==================================================")
    # Step 3: Confirm Download & Analysis
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
        
        print("\n[✓] Database recreation, seeding, download, and analysis complete!")
    else:
        print("Skipped fresh download. Database is left blank and ready.")

if __name__ == "__main__":
    main()
