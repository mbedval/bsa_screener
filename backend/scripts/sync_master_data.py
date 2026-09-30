import argparse
import sys
from psycopg import connect
from psycopg.rows import dict_row
from app.config import settings

MASTER_TABLES = [
    "sectors",
    "watchlist",
    "users",
    "system_config",
    "alternative_names",
    "excluded_tickers",
    "ticker_mappings",
    "ticker_master",
    "ticker_sector",
    "watchlist_items",
    "fno_stock_master",
    "fno_index_master",
    "opportunities_risk",
    "derivative_history"
]

def get_primary_key(conn, table_name):
    query = """
        SELECT a.attname
        FROM   pg_index i
        JOIN   pg_attribute a ON a.attrelid = i.indrelid
                             AND a.attnum = ANY(i.indkey)
        WHERE  i.indrelid = %s::regclass
        AND    i.indisprimary;
    """
    try:
        with conn.cursor() as cur:
            cur.execute(query, (table_name,))
            return [row['attname'] for row in cur.fetchall()]
    except Exception as e:
        print(f"Error getting PK for {table_name}: {e}")
        conn.rollback()
        return []

def resolve_unique_constraints(conn, table_name, pks, rows):
    """
    Deletes rows in the replica that have the same unique key as the master data
    but a different primary key, avoiding unique constraint violations.
    """
    if not pks or len(pks) > 1:
        return
    
    pk = pks[0]
    
    query = """
        SELECT a.attname
        FROM   pg_index i
        JOIN   pg_attribute a ON a.attrelid = i.indrelid
                             AND a.attnum = ANY(i.indkey)
        WHERE  i.indrelid = %s::regclass
        AND    i.indisunique AND NOT i.indisprimary;
    """
    try:
        with conn.cursor() as cur:
            cur.execute(query, (table_name,))
            unique_cols = [row['attname'] for row in cur.fetchall()]
    except Exception as e:
        print(f"Could not check unique constraints for {table_name}: {e}")
        conn.rollback()
        return

    for col in unique_cols:
        master_mapping = {r[col]: r[pk] for r in rows if col in r and pk in r and r[col] is not None}
        if not master_mapping:
            continue
            
        placeholders = ", ".join(["%s"] * len(master_mapping))
        try:
            with conn.cursor() as cur:
                cur.execute(f'SELECT "{pk}", "{col}" FROM "{table_name}" WHERE "{col}" IN ({placeholders})', list(master_mapping.keys()))
                replica_rows = cur.fetchall()
                
                conflicting_pks = []
                for r_row in replica_rows:
                    if master_mapping.get(r_row[col]) != r_row[pk]:
                        conflicting_pks.append(r_row[pk])
                
                if conflicting_pks:
                    pk_placeholders = ", ".join(["%s"] * len(conflicting_pks))
                    cur.execute(f'DELETE FROM "{table_name}" WHERE "{pk}" IN ({pk_placeholders})', conflicting_pks)
                    print(f"Resolved {len(conflicting_pks)} unique constraint conflicts for {table_name} on column {col}")
        except Exception as e:
            print(f"Error resolving conflicts for {table_name}: {e}")
            conn.rollback()

def upsert_rows(conn, table_name, pks, rows):
    if not rows:
        return 0

    cols = list(rows[0].keys())
    
    # Properly quote identifiers to avoid syntax errors
    col_names = ", ".join([f'"{c}"' for c in cols])
    placeholders = ", ".join([f"%({c})s" for c in cols])

    if pks:
        pk_names = ", ".join([f'"{pk}"' for pk in pks])
        update_cols = [c for c in cols if c not in pks]
        if update_cols:
            update_set = ", ".join([f'"{c}" = EXCLUDED."{c}"' for c in update_cols])
            conflict_clause = f"ON CONFLICT ({pk_names}) DO UPDATE SET {update_set}"
        else:
            conflict_clause = f"ON CONFLICT ({pk_names}) DO NOTHING"
    else:
        conflict_clause = ""
    
    query = f'INSERT INTO "{table_name}" ({col_names}) VALUES ({placeholders}) {conflict_clause}'
    
    with conn.cursor() as cur:
        cur.executemany(query, rows)
    
    return len(rows)

def sync_data(master_dsn, replica_dsn):
    print(f"Connecting to master: {master_dsn}")
    print(f"Connecting to replica: {replica_dsn}")
    
    try:
        master_conn = connect(master_dsn, row_factory=dict_row)
    except Exception as e:
        print(f"Failed to connect to master DB: {e}")
        sys.exit(1)
        
    try:
        replica_conn = connect(replica_dsn, row_factory=dict_row)
    except Exception as e:
        print(f"Failed to connect to replica DB: {e}")
        sys.exit(1)

    with master_conn, replica_conn:
        for table in MASTER_TABLES:
            try:
                with master_conn.cursor() as cur:
                    cur.execute(f'SELECT * FROM "{table}"')
                    rows = cur.fetchall()
            except Exception as e:
                print(f"Skipping {table}, could not fetch from master: {e}")
                master_conn.rollback()
                continue
            
            if not rows:
                print(f"Table {table} is empty on master, skipping.")
                continue
            
            # get PK from replica
            pks = get_primary_key(replica_conn, table)
            
            # resolve unique constraints to avoid conflicts
            resolve_unique_constraints(replica_conn, table, pks, rows)
            
            try:
                count = upsert_rows(replica_conn, table, pks, rows)
                replica_conn.commit()
                print(f"Synced {count} rows for table {table}")
            except Exception as e:
                print(f"Failed to sync table {table}: {e}")
                replica_conn.rollback()

def main():
    parser = argparse.ArgumentParser(description="Sync master data tables from a master DB to a replica DB.")
    parser.add_argument("--masterdb", required=True, help="IP address or host of the master database")
    parser.add_argument("--replica", required=True, help="IP address or host of the replica database")
    parser.add_argument("--user", default=settings.postgres_user, help="Database user")
    parser.add_argument("--password", default=settings.postgres_password, help="Database password")
    parser.add_argument("--dbname", default=settings.postgres_db_rawdata, help="Database name")
    parser.add_argument("--port", default=str(settings.postgres_port), help="Database port")
    
    args = parser.parse_args()
    
    pw_part = f":{args.password}" if args.password else ""
    master_dsn = f"postgresql://{args.user}{pw_part}@{args.masterdb}:{args.port}/{args.dbname}"
    replica_dsn = f"postgresql://{args.user}{pw_part}@{args.replica}:{args.port}/{args.dbname}"
    
    sync_data(master_dsn, replica_dsn)

if __name__ == "__main__":
    main()
