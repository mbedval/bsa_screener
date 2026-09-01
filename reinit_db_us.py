#!/usr/bin/env python3
import os
import sys
import subprocess
import psycopg2
from dotenv import load_dotenv

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

def main():
    load_dotenv()
    
    host = os.getenv("POSTGRES_HOST", "127.0.0.1")
    port = os.getenv("POSTGRES_PORT", "5432")
    user = os.getenv("POSTGRES_USER", "jmbxdbuser")
    password = os.getenv("POSTGRES_PASSWORD", "jmbxdbpassword")
    target_db = os.getenv("POSTGRES_DB_US", "bsa_db_us")

    print("==================================================")
    print(f"INITIALIZING US MARKET DATABASE '{target_db}'")
    print("==================================================")

    maintenance_dsn = f"postgresql://{user}:{password}@{host}:{port}/postgres"
    try:
        conn = psycopg2.connect(maintenance_dsn)
        conn.autocommit = True
        with conn.cursor() as cur:
            cur.execute(f"""
                SELECT pg_terminate_backend(pg_stat_activity.pid)
                FROM pg_stat_activity
                WHERE pg_stat_activity.datname = '{target_db}' AND pid <> pg_backend_pid();
            """)
            cur.execute(f"DROP DATABASE IF EXISTS {target_db};")
            print(f"[✓] Database '{target_db}' dropped.")
            
            cur.execute(f"CREATE DATABASE {target_db};")
            print(f"[✓] Database '{target_db}' created.")
        conn.close()
    except Exception as e:
        print(f"[×] Error creating database: {e}")
        sys.exit(1)

    print("\nApplying US Market seeding_us.sql...")
    try:
        target_dsn = f"postgresql://{user}:{password}@{host}:{port}/{target_db}"
        conn = psycopg2.connect(target_dsn)
        conn.autocommit = True
        with open("seeding_us.sql", "r", encoding="utf-8") as f:
            sql_script = f.read()
        with conn.cursor() as cur:
            cur.execute(sql_script)
        conn.close()
        print(f"[✓] US Market database '{target_db}' seeded successfully!")
    except Exception as e:
        print(f"[×] Failed to run seeding: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()
