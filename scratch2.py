import psycopg2
from engine.database.connection import get_db_connection

with get_db_connection() as conn:
    with conn.cursor() as cur:
        cur.execute("""
            SELECT table_name, column_name 
            FROM information_schema.columns 
            WHERE table_name IN ('watchlist', 'watchlist_items')
        """)
        for row in cur.fetchall():
            print(f"{row[0]}: {row[1]}")
