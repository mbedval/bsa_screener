"""
Database Seeder Utility Module.
Handles dynamic loading of CSV data files into PostgreSQL database tables.
"""

import os
import glob
import csv
import psycopg2
from psycopg2.extras import execute_values
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

SEQUENCE_TABLES = [
    ("sectors", "sectors_id_seq"),
    ("watchlist", "watchlist_id_seq"),
    ("fno_stock_master", "fno_stock_master_id_seq"),
    ("fno_index_master", "fno_index_master_id_seq"),
    ("alternative_names", "alternative_names_id_seq"),
    ("excluded_tickers", "excluded_tickers_id_seq"),
    ("historical_calls", "historical_calls_id_seq"),
    ("broker_recommendations", "broker_recommendations_id_seq"),
    ("reference_pages", "reference_pages_id_seq"),
    ("screener_ticker_mappings", "screener_ticker_mappings_id_seq")
]

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

def load_csv_files(file_suffix: str, data_dir: str = "data", verbose: bool = True) -> bool:
    """
    Scans data_dir for files matching *<file_suffix> (e.g. '_sample.csv' or '_production.csv')
    and seeds them into corresponding PostgreSQL tables.
    """
    load_dotenv()
    
    host = os.getenv("POSTGRES_HOST", "127.0.0.1")
    port = os.getenv("POSTGRES_PORT", "5432")
    user = os.getenv("POSTGRES_USER", "jmbxdbuser")
    password = os.getenv("POSTGRES_PASSWORD", "jmbxdbpassword")
    target_db = os.getenv("POSTGRES_DB", "bsa_db")

    dsn = f"postgresql://{user}:{password}@{host}:{port}/{target_db}"

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
        print(f"[+] Seeding {len(csv_files)} datasets matching '{file_suffix}' into database '{target_db}'...")

    try:
        conn = psycopg2.connect(dsn)
        conn.autocommit = False
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
                # Filter out 'id' column for fno_master if loading production without manual id primary keys
                rows = list(reader)

                if not rows:
                    if verbose:
                        print(f"  [-] No data rows in '{filename}' for table '{table_name}'")
                    continue

                # Conflict Resolution Targets
                conflict_target = "ON CONFLICT DO NOTHING"
                if table_name == "ticker_master":
                    conflict_target = "ON CONFLICT (ticker) DO NOTHING"
                elif table_name in ("fno_master", "fno_stock_master", "fno_index_master", "indices_master"):
                    conflict_target = "ON CONFLICT (symbol) DO NOTHING"
                elif table_name == "sectors":
                    conflict_target = "ON CONFLICT (name) DO NOTHING"
                elif table_name == "alternative_names":
                    conflict_target = "ON CONFLICT (data_ticker) DO NOTHING"
                elif table_name == "excluded_tickers":
                    conflict_target = "ON CONFLICT (ticker) DO NOTHING"
                elif table_name == "system_config":
                    conflict_target = "ON CONFLICT (key) DO NOTHING"
                elif table_name == "watchlist":
                    conflict_target = "ON CONFLICT (name) DO NOTHING"
                elif table_name == "users":
                    conflict_target = "ON CONFLICT (email) DO NOTHING"

                col_names = ", ".join(cols)
                sql = f"INSERT INTO {table_name} ({col_names}) VALUES %s {conflict_target};"

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
                            formatted_row.append(True)
                        elif val_str.lower() == "false":
                            formatted_row.append(False)
                        elif val_str.startswith("[") and val_str.endswith("]"):
                            # Format Python list str like "['NSE']" to PostgreSQL array format "{NSE}"
                            import ast
                            try:
                                parsed_list = ast.literal_eval(val_str)
                                if isinstance(parsed_list, list):
                                    formatted_row.append("{" + ",".join(str(x) for x in parsed_list) + "}")
                                else:
                                    formatted_row.append(val_str)
                            except Exception:
                                formatted_row.append(val_str)
                        elif val_str == "" and table_name == "system_config" and col_name == "value":
                            formatted_row.append("")
                        elif val_str == "":
                            formatted_row.append(None)
                        else:
                            formatted_row.append(val_str)
                    formatted_rows.append(tuple(formatted_row))

                if formatted_rows:
                    try:
                        execute_values(cursor, sql, formatted_rows, page_size=500)
                        conn.commit()
                        if verbose:
                            print(f"  [✓] Loaded '{filename}' -> table '{table_name}' ({len(formatted_rows)} records).")
                    except Exception as err:
                        if verbose:
                            print(f"    [!] Batch error inserting into {table_name}: {err}")
                        conn.rollback()

        # Synchronize sector master and ticker_sector mappings from ticker_master
        try:
            if verbose:
                print("  [+] Synchronizing sector master & ticker_sector mappings from ticker_master...")
            cursor.execute("""
                INSERT INTO sectors (name)
                SELECT DISTINCT sector 
                FROM ticker_master 
                WHERE sector IS NOT NULL AND TRIM(sector) != ''
                ON CONFLICT (name) DO NOTHING;
            """)
            cursor.execute("""
                INSERT INTO ticker_sector (ticker, sector_id)
                SELECT tm.ticker, s.id
                FROM ticker_master tm
                JOIN sectors s ON s.name = tm.sector
                WHERE tm.sector IS NOT NULL AND TRIM(tm.sector) != ''
                ON CONFLICT (ticker, sector_id) DO NOTHING;
            """)
            conn.commit()
            if verbose:
                print("  [✓] Sector master & ticker_sector mappings synchronized.")
        except Exception as sync_err:
            if verbose:
                print(f"  [!] Warning synchronizing sector master: {sync_err}")
            conn.rollback()

        # Reset sequences
        for table, seq in SEQUENCE_TABLES:
            try:
                cursor.execute(f"SELECT pg_catalog.setval('{seq}', COALESCE((SELECT MAX(id) FROM {table}), 1), true);")
                conn.commit()
            except Exception:
                conn.rollback()

        cursor.close()
        conn.close()
        if verbose:
            print(f"[✓] Seeding completed successfully for '{file_suffix}'.")
        return True

    except Exception as e:
        print(f"[×] Error during database seeding: {e}")
        return False

if __name__ == "__main__":
    import sys
    suffix = sys.argv[1] if len(sys.argv) > 1 else "_sample.csv"
    success = load_csv_files(file_suffix=suffix, verbose=True)
    sys.exit(0 if success else 1)
