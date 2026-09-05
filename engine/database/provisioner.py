"""
Database Provisioner Module.
Handles connecting to a PostgreSQL server as a superuser, verifying/creating the application database user,
granting superuser privileges, setting the user password, and creating the target database.
"""

import os
import sys
import psycopg2
from psycopg2.extensions import ISOLATION_LEVEL_AUTOCOMMIT
from dotenv import load_dotenv

def provision_database_user_and_db(verbose: bool = True) -> bool:
    load_dotenv()
    
    host = os.getenv("POSTGRES_HOST", "127.0.0.1")
    port = os.getenv("POSTGRES_PORT", "5432")
    target_user = os.getenv("POSTGRES_USER", "jmbxdbuser")
    target_password = os.getenv("POSTGRES_PASSWORD", "jmbxdbpassword")
    target_db = os.getenv("POSTGRES_DB", "bsa_db")
    
    # Superuser credentials for initial maintenance connection
    superuser = os.getenv("POSTGRES_SUPERUSER", "postgres")
    superuser_password = os.getenv("POSTGRES_SUPERUSER_PASSWORD", target_password)

    if verbose:
        print("==================================================")
        print("DATABASE PROVISIONING SETUP")
        print("==================================================")
        print(f"Host: {host}:{port}")
        print(f"Target DB User: {target_user}")
        print(f"Target Database: {target_db}")

    # Try connecting as superuser first, fallback to target_user if superuser login isn't separate
    conn = None
    try:
        conn = psycopg2.connect(
            dbname="postgres",
            user=superuser,
            password=superuser_password,
            host=host,
            port=port
        )
    except Exception as err:
        if verbose:
            print(f"[!] Superuser login as '{superuser}' failed: {err}")
            print(f"[!] Attempting fallback login as '{target_user}'...")
        try:
            conn = psycopg2.connect(
                dbname="postgres",
                user=target_user,
                password=target_password,
                host=host,
                port=port
            )
        except Exception as fallback_err:
            print(f"[×] Error: Could not connect to PostgreSQL on {host}:{port} as '{superuser}' or '{target_user}': {fallback_err}")
            return False

    conn.set_isolation_level(ISOLATION_LEVEL_AUTOCOMMIT)
    cursor = conn.cursor()

    try:
        # 1. Check if user exists
        cursor.execute("SELECT 1 FROM pg_roles WHERE rolname = %s;", (target_user,))
        user_exists = cursor.fetchone() is not None

        if not user_exists:
            if verbose:
                print(f"[+] Creating DB user '{target_user}' with SUPERUSER privileges...")
            # Use identifier escaping for safety
            cursor.execute(f"CREATE ROLE \"{target_user}\" WITH SUPERUSER CREATEDB LOGIN PASSWORD %s;", (target_password,))
            if verbose:
                print(f"[✓] DB user '{target_user}' created successfully.")
        else:
            if verbose:
                print(f"[✓] DB user '{target_user}' already exists. Updating password & privileges...")
            cursor.execute(f"ALTER ROLE \"{target_user}\" WITH SUPERUSER CREATEDB LOGIN PASSWORD %s;", (target_password,))

        # 2. Check if database exists
        cursor.execute("SELECT 1 FROM pg_database WHERE datname = %s;", (target_db,))
        db_exists = cursor.fetchone() is not None

        if not db_exists:
            if verbose:
                print(f"[+] Creating database '{target_db}' owned by '{target_user}'...")
            cursor.execute(f"CREATE DATABASE \"{target_db}\" OWNER \"{target_user}\";")
            if verbose:
                print(f"[✓] Database '{target_db}' created successfully.")
        else:
            if verbose:
                print(f"[✓] Database '{target_db}' already exists.")

        cursor.close()
        conn.close()
        return True
    except Exception as e:
        print(f"[×] Failed to provision database/user: {e}")
        if cursor:
            cursor.close()
        if conn:
            conn.close()
        return False

if __name__ == "__main__":
    success = provision_database_user_and_db(verbose=True)
    sys.exit(0 if success else 1)
