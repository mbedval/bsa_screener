from engine.database.connection import get_db_connection
with get_db_connection() as conn:
    cur = conn.cursor()
    cur.execute("SELECT COUNT(*) FROM chart_patterns WHERE timeframe='DAILY'")
    print('Total DAILY:', cur.fetchone())
    cur.execute("SELECT COUNT(*) FROM chart_patterns WHERE timeframe='DAILY' AND pattern_code='bullish_engulfing'")
    print('Bullish Engulfing DAILY:', cur.fetchone())
