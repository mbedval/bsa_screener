import sys
import pandas as pd
from engine.database.connection import get_db_connection

ticker = "JIOFIN"

with get_db_connection() as conn:
    with conn.cursor() as cur:
        start_date = "2026-07-04"
        end_date = "2026-08-10"
        
        cur.execute("""
            SELECT trade_date, open, high, low, close
            FROM ohlcv_daily
            WHERE ticker = %s AND trade_date >= %s AND trade_date <= %s
            ORDER BY trade_date ASC
        """, (ticker, start_date, end_date))
        rows = cur.fetchall()

if not rows:
    print(f"No data for {ticker} between {start_date} and {end_date}")
    sys.exit(0)

df = pd.DataFrame(rows, columns=['trade_date', 'open', 'high', 'low', 'close'])
for col in ['open', 'high', 'low', 'close']:
    df[col] = pd.to_numeric(df[col], errors='coerce')

df['prev_high'] = df['high'].shift(1)
df['prev_low'] = df['low'].shift(1)

df['is_hh'] = df['high'] > df['prev_high']
df['is_hl'] = df['low'] > df['prev_low']
df['is_hhhl'] = df['is_hh'] & df['is_hl']

def is_rest(idx):
    if idx == 0: return False
    return (df['high'].iloc[idx] <= df['prev_high'].iloc[idx]) and (df['low'].iloc[idx] >= df['prev_low'].iloc[idx])

df['is_rest'] = [is_rest(i) for i in range(len(df))]

print(df[['trade_date', 'close', 'high', 'low', 'prev_high', 'prev_low', 'is_hh', 'is_hl', 'is_hhhl', 'is_rest']].to_string())

