import psycopg2
from engine.database.connection import get_db_connection

with get_db_connection() as conn:
    with conn.cursor() as cur:
        cur.execute("""
            SELECT table_name 
            FROM information_schema.columns 
            WHERE column_name = 'ticker' AND table_schema = 'public'
        """)
        tables = [row[0] for row in cur.fetchall()]
        print("Tables with ticker column:", tables)
