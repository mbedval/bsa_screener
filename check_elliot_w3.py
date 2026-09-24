from engine.database.connection import get_db_connection
with get_db_connection() as conn:
    with conn.cursor() as cur:
        cur.execute("SELECT count(*) FROM elliot_analysis WHERE current_wave != 'None'")
        print("Count W3/W5:", cur.fetchone()[0])
        cur.execute("SELECT count(*) FROM elliot_analysis")
        print("Total analyzed:", cur.fetchone()[0])
