import psycopg2
from engine.database.connection import get_db_connection
import pandas as pd
import numpy as np

def analyze_hhhl_history(ticker):
    with get_db_connection() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT trade_date, high, low, close
                FROM ohlcv_daily
                WHERE ticker = %s
                ORDER BY trade_date ASC
            """, (ticker,))
            rows = cur.fetchall()
            
    if not rows:
        return
        
    df = pd.DataFrame(rows, columns=['trade_date', 'high', 'low', 'close'])
    
    # Calculate HH and HL conditions
    df['prev_high'] = df['high'].shift(1)
    df['prev_low'] = df['low'].shift(1)
    
    df['is_hh'] = df['high'] > df['prev_high']
    df['is_hl'] = df['low'] > df['prev_low']
    df['is_hhhl'] = df['is_hh'] & df['is_hl']
    
    # Identify consolidations: inside bar or staying within the recent range
    # A simple consolidation might be: not HHHL, but low >= recent_swing_low and high <= recent_swing_high.
    # We can track state.
    
    streaks = []
    current_streak = 0
    
    for i in range(1, len(df)):
        if df['is_hhhl'].iloc[i]:
            current_streak += 1
        else:
            if current_streak > 0:
                streaks.append(current_streak + 1) # A streak of 1 HHHL means 2 days involved.
                current_streak = 0
                
    if current_streak > 0:
        streaks.append(current_streak + 1)
        
    print(f"Ticker: {ticker}")
    print(f"All streaks: {streaks}")
    if streaks:
        print(f"Avg streak: {np.mean(streaks):.2f}")
    
    # Complex broken pattern logic
    # To do this right, we need a state machine.
    
analyze_hhhl_history('RELIANCE')
