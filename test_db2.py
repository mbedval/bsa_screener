from engine.database.connection import get_db_connection
with get_db_connection() as conn:
    cur = conn.cursor()
    cur.execute("SELECT MAX(detected_date) FROM chart_patterns")
    print('Max date:', cur.fetchone())
    cur.execute("SELECT COUNT(*) FROM chart_patterns WHERE timeframe='DAILY' AND pattern_code='bullish_engulfing' AND detected_date >= CURRENT_DATE - INTERVAL '7 days'")
    print('Recent Bullish Engulfing:', cur.fetchone())
