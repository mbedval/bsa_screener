import sys
from engine.analysis.orchestrator import analyze_and_summarize_ticker
from engine.database.connection import get_db_connection

ticker = "RELIANCE"
print(f"Running analysis for {ticker}...")
analyze_and_summarize_ticker(ticker)

with get_db_connection() as conn:
    with conn.cursor() as cur:
        cur.execute("SELECT ticker, history_days_analyzed, history_start_date, cycle_start_date FROM continuous_hhhl_scanner WHERE ticker = %s", (ticker,))
        row = cur.fetchone()
        print("DB Row:", row)
