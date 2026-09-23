import sys
from engine.analysis.orchestrator import analyze_and_summarize_ticker
from engine.database.connection import get_db_connection

ticker = "RELIANCE"
print(f"Running analysis for {ticker}...")
analyze_and_summarize_ticker(ticker)

with get_db_connection() as conn:
    with conn.cursor() as cur:
        cur.execute("SELECT ticker, historical_cycles FROM continuous_hhhl_scanner WHERE ticker = %s", (ticker,))
        row = cur.fetchone()
        if row and row[1]:
            print(f"Historical cycles count: {len(row[1])}")
            print(f"First cycle: {row[1][0]}")
        else:
            print("DB Row:", row)
