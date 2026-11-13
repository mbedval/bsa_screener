"""
Database Provisioner Module (SQLite).

For SQLite, provisioning is trivially simple — just ensure the database file
directory exists. No server, no user accounts, no superuser required.
"""

import os
import sys
from pathlib import Path
from dotenv import load_dotenv


def provision_database_user_and_db(verbose: bool = True) -> bool:
    """Ensure the SQLite database directory exists.

    For SQLite there is nothing to 'provision' at the server level —
    the database file is created automatically when first opened.
    This function just makes sure the parent directory is present.
    """
    load_dotenv()

    db_path = os.getenv("SQLITE_PATH") or os.path.join(
        os.path.dirname(os.path.dirname(os.path.dirname(__file__))),
        "data", "bsa_db.sqlite3"
    )
    db_dir = Path(db_path).parent

    if verbose:
        print("==================================================")
        print("DATABASE PROVISIONING SETUP (SQLite)")
        print("==================================================")
        print(f"SQLite file: {db_path}")

    try:
        db_dir.mkdir(parents=True, exist_ok=True)
        if verbose:
            print(f"[OK] Database directory '{db_dir}' is ready.")
            print(f"[OK] SQLite database will be created at first connection.")
        return True
    except Exception as e:
        print(f"[X] Failed to create database directory: {e}")
        return False


if __name__ == "__main__":
    success = provision_database_user_and_db(verbose=True)
    sys.exit(0 if success else 1)
