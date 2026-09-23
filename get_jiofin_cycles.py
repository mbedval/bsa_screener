from engine.analysis.orchestrator import analyze_and_summarize_ticker
from engine.database.connection import get_db_connection
import json

ticker = "JIOFIN"
analyze_and_summarize_ticker(ticker)

with get_db_connection() as conn:
    with conn.cursor() as cur:
        cur.execute("SELECT historical_cycles FROM continuous_hhhl_scanner WHERE ticker = %s", (ticker,))
        row = cur.fetchone()
        if row and row[0]:
            cycles = row[0]
            print(f"Total cycles for {ticker}: {len(cycles)}")
            for c in cycles:
                if '2026-07' in c['start_date'] or '2026-08' in c['start_date']:
                    print(c)
