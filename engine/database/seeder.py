"""
Database Seeder Utility Module (SQLite).
Handles dynamic loading of CSV data files into the SQLite database tables.
"""

import os
import glob
import csv
import json
import sqlite3
from pathlib import Path
from dotenv import load_dotenv

TABLE_MAPPINGS = {
    "system_config": "system_config",
    "ticker_mappings": "ticker_mappings",
    "sectors": "sectors",
    "indices_master": "indices_master",
    "tickers": "ticker_master",
    "fno_stock": "fno_stock_master",
    "fno_index": "fno_index_master",
    "fno_tickers": "fno_stock_master",
    "watchlist": "watchlist",
    "watchlist_items": "watchlist_items",
    "users": "users",
    "alternative_names": "alternative_names",
    "excluded_tickers": "excluded_tickers",
    "recommendations": "broker_recommendations",
    "ticker_sector": "ticker_sector",
    "opportunities_risk": "opportunities_risk",
    "reference_pages": "reference_pages",
    "screener_ticker_mappings": "screener_ticker_mappings"
}

TABLE_LOAD_ORDER = [
    "system_config",
    "ticker_mappings",
    "sectors",
    "indices_master",
    "alternative_names",
    "excluded_tickers",
    "tickers",
    "opportunities_risk",
    "fno_stock",
    "fno_index",
    "fno_tickers",
    "watchlist",
    "watchlist_items",
    "users",
    "recommendations",
    "ticker_sector",
    "reference_pages",
    "screener_ticker_mappings"
]

# Tables that use INSERT OR REPLACE on conflict
REPLACE_TABLES = {"ticker_master", "system_config", "ticker_mappings", "indices_master"}

# Conflict resolution: INSERT OR IGNORE by default; INSERT OR REPLACE for specific tables
def _insert_sql(table_name: str, col_names: str) -> str:
    if table_name in REPLACE_TABLES:
        return f"INSERT OR REPLACE INTO {table_name} ({col_names}) VALUES ({', '.join(['?'] * col_names.count(',') + ['?'])})"
    return f"INSERT OR IGNORE INTO {table_name} ({col_names}) VALUES ({', '.join(['?'] * (col_names.count(',') + 1))})"


def get_sqlite_path() -> str:
    """Resolve the SQLite database file path."""
    path = os.getenv("SQLITE_PATH") or os.path.join(
        os.path.dirname(os.path.dirname(os.path.dirname(__file__))),
        "data", "bsa_db.sqlite3"
    )
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    return path


def load_csv_files(file_suffix: str, data_dir: str = "data", verbose: bool = True) -> bool:
    """
    Scans data_dir for files matching *<file_suffix> (e.g. '_sample.csv' or '_production.csv')
    and seeds them into corresponding SQLite tables.
    """
    load_dotenv()

    db_path = get_sqlite_path()
    csv_pattern = os.path.join(data_dir, f"*{file_suffix}")
    found_files = glob.glob(csv_pattern)

    def sort_key(filepath):
        filename = os.path.basename(filepath)
        prefix = filename.replace(file_suffix, "")
        try:
            return TABLE_LOAD_ORDER.index(prefix)
        except ValueError:
            return 999

    csv_files = sorted(found_files, key=sort_key)

    if not csv_files:
        if verbose:
            print(f"[!] No CSV files found matching pattern '{csv_pattern}'.")
        return True

    if verbose:
        print(f"[+] Seeding {len(csv_files)} datasets matching '{file_suffix}' into '{db_path}'...")

    try:
        conn = sqlite3.connect(db_path, check_same_thread=False)
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("PRAGMA foreign_keys=ON")
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()

        for file_path in csv_files:
            filename = os.path.basename(file_path)
            prefix = filename.replace(file_suffix, "")
            table_name = TABLE_MAPPINGS.get(prefix)

            if not table_name:
                if verbose:
                    print(f"  [-] Skipping unknown file prefix: '{filename}'")
                continue

            with open(file_path, mode="r", encoding="utf-8-sig") as f:
                reader = csv.reader(f)
                header = next(reader, None)
                if not header:
                    if verbose:
                        print(f"  [-] Empty CSV file: '{filename}'")
                    continue

                cols = [c.strip().lower() for c in header]
                rows = list(reader)

                if not rows:
                    if verbose:
                        print(f"  [-] No data rows in '{filename}' for table '{table_name}'")
                    continue

                col_names = ", ".join(cols)
                placeholders = ", ".join(["?"] * len(cols))
                if table_name in REPLACE_TABLES:
                    sql = f"INSERT OR REPLACE INTO {table_name} ({col_names}) VALUES ({placeholders})"
                else:
                    sql = f"INSERT OR IGNORE INTO {table_name} ({col_names}) VALUES ({placeholders})"

                formatted_rows = []
                for row in rows:
                    if not row or all(str(val).strip() == "" for val in row):
                        continue
                    if len(row) < len(cols):
                        row = row + [""] * (len(cols) - len(row))

                    formatted_row = []
                    for i in range(len(cols)):
                        val_str = str(row[i]).strip()
                        col_name = cols[i]
                        if val_str.lower() == "true":
                            formatted_row.append(1)
                        elif val_str.lower() == "false":
                            formatted_row.append(0)
                        elif val_str.startswith("[") and val_str.endswith("]"):
                            # Convert Python list representation to JSON for SQLite storage
                            import ast
                            try:
                                parsed_list = ast.literal_eval(val_str)
                                if isinstance(parsed_list, list):
                                    formatted_row.append(json.dumps(parsed_list))
                                else:
                                    formatted_row.append(val_str)
                            except Exception:
                                formatted_row.append(val_str)
                        elif val_str.startswith("{") and val_str.endswith("}"):
                            # PostgreSQL array format {NSE,NIFTY50} -> JSON ["NSE","NIFTY50"]
                            inner = val_str[1:-1]
                            items = [x.strip().strip('"') for x in inner.split(",") if x.strip()]
                            formatted_row.append(json.dumps(items))
                        elif val_str == "" and table_name == "system_config" and col_name == "value":
                            formatted_row.append("")
                        elif val_str == "":
                            formatted_row.append(None)
                        else:
                            formatted_row.append(val_str)
                    formatted_rows.append(tuple(formatted_row))

                if formatted_rows:
                    try:
                        cursor.executemany(sql, formatted_rows)
                        conn.commit()
                        if verbose:
                            print(f"  [OK] Loaded '{filename}' -> table '{table_name}' ({len(formatted_rows)} records).")
                    except Exception as err:
                        if verbose:
                            print(f"    [!] Batch error inserting into {table_name}: {err}")
                        conn.rollback()

        # Synchronize sector master and ticker_sector mappings from ticker_master
        try:
            if verbose:
                print("  [+] Synchronizing sector master & ticker_sector mappings from ticker_master...")
            cursor.execute("""
                INSERT OR IGNORE INTO sectors (name)
                SELECT DISTINCT sector
                FROM ticker_master
                WHERE sector IS NOT NULL AND TRIM(sector) != ''
            """)
            cursor.execute("""
                INSERT OR IGNORE INTO ticker_sector (ticker, sector_id)
                SELECT tm.ticker, s.id
                FROM ticker_master tm
                JOIN sectors s ON s.name = tm.sector
                WHERE tm.sector IS NOT NULL AND TRIM(tm.sector) != ''
            """)
            conn.commit()
            if verbose:
                print("  [OK] Sector master & ticker_sector mappings synchronized.")
        except Exception as sync_err:
            if verbose:
                print(f"  [!] Warning synchronizing sector master: {sync_err}")
            conn.rollback()

        cursor.close()
        conn.close()
        if verbose:
            print(f"[OK] Seeding completed successfully for '{file_suffix}'.")
        return True

    except Exception as e:
        print(f"[X] Error during database seeding: {e}")
        return False


if __name__ == "__main__":
    import sys
    suffix = sys.argv[1] if len(sys.argv) > 1 else "_sample.csv"
    success = load_csv_files(file_suffix=suffix, verbose=True)
    sys.exit(0 if success else 1)
