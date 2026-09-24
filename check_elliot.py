from engine.database.connection import get_db_connection
with get_db_connection() as conn:
    with conn.cursor() as cur:
        cur.execute("SELECT * FROM elliot_analysis")
        print(cur.fetchall())
