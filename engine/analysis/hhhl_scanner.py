import logging
import json
import numpy as np
import pandas as pd
from engine.database.connection import get_db_connection

logger = logging.getLogger("bsa_hhhl_scanner")

def scan_and_store_hhhl(ticker: str) -> bool:
    """
    Scans the historical OHLCV data for a ticker to compute:
    - current_hhhl: The length of the current consecutive HHHL streak ending today.
    - avg_continuity_count: The average length of all historical HHHL streaks.
    - broken_pattern_count: The length of the current bullish cycle including rest days.
    - broken_pattern_details: A string detailing the bursts in the current cycle.
    
    Upserts into continuous_hhhl_scanner.
    """
    try:
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                # Ensure table exists
                cur.execute("""
                    CREATE TABLE IF NOT EXISTS continuous_hhhl_scanner (
                        ticker TEXT PRIMARY KEY REFERENCES ticker_master(ticker) ON DELETE CASCADE,
                        close DOUBLE PRECISION,
                        current_hhhl INTEGER,
                        avg_continuity_count DOUBLE PRECISION,
                        broken_pattern_count INTEGER,
                        broken_pattern_details TEXT,
                        history_days_analyzed INTEGER,
                        history_start_date DATE,
                        cycle_start_date DATE,
                        historical_cycles JSONB,
                        updated_at TIMESTAMP DEFAULT now()
                    );
                """)
                
                cur.execute("""
                    ALTER TABLE continuous_hhhl_scanner ADD COLUMN IF NOT EXISTS history_days_analyzed INTEGER;
                    ALTER TABLE continuous_hhhl_scanner ADD COLUMN IF NOT EXISTS history_start_date DATE;
                    ALTER TABLE continuous_hhhl_scanner ADD COLUMN IF NOT EXISTS cycle_start_date DATE;
                    ALTER TABLE continuous_hhhl_scanner ADD COLUMN IF NOT EXISTS historical_cycles JSONB;
                """)
                
                cur.execute("""
                    SELECT trade_date, open, high, low, close
                    FROM ohlcv_daily
                    WHERE ticker = %s
                    ORDER BY trade_date ASC
                """, (ticker,))
                rows = cur.fetchall()

                if not rows or len(rows) < 5:
                    return False
                
                df = pd.DataFrame(rows, columns=['trade_date', 'open', 'high', 'low', 'close'])
                for col in ['open', 'high', 'low', 'close']:
                    df[col] = pd.to_numeric(df[col], errors='coerce')
                    
                df['prev_high'] = df['high'].shift(1)
                df['prev_low'] = df['low'].shift(1)
                
                df['is_hh'] = df['high'] > df['prev_high']
                df['is_hl'] = df['low'] > df['prev_low']
                df['is_hhhl'] = df['is_hh'] & df['is_hl']

                # Compute historical average streak
                streaks = []
                current_streak = 0
                for i in range(1, len(df)):
                    if df['is_hhhl'].iloc[i]:
                        current_streak += 1
                    else:
                        if current_streak > 0:
                            streaks.append(current_streak + 1)
                            current_streak = 0
                if current_streak > 0:
                    streaks.append(current_streak + 1)
                    
                avg_continuity_count = round(float(np.mean(streaks)), 2) if streaks else 0.0

                # Determine the current broken pattern and current hhhl backwards from today
                n = len(df)
                
                # Helper to check if a day is a rest day relative to the PREVIOUS day's range
                def is_rest(idx):
                    return (df['high'].iloc[idx] <= df['prev_high'].iloc[idx]) and (df['low'].iloc[idx] >= df['prev_low'].iloc[idx])

                current_cycle_length = 0
                current_hhhl = 0
                bursts = []
                
                active_burst = 0
                rests = 0
                
                # Go backwards to find the current active cycle
                i = n - 1
                
                # Check if we are currently in any active state (either HHHL or resting)
                if df['is_hhhl'].iloc[i] or is_rest(i):
                    while i >= 1:
                        if df['is_hhhl'].iloc[i]:
                            active_burst += 1
                        elif is_rest(i):
                            if active_burst > 0:
                                bursts.append(active_burst)
                                active_burst = 0
                            rests += 1
                        else:
                            # Cycle broken
                            if active_burst > 0:
                                bursts.append(active_burst)
                            break
                        
                        current_cycle_length += 1
                        i -= 1

                # If the last burst hasn't been added
                if active_burst > 0 and (not bursts or bursts[-1] != active_burst):
                    bursts.append(active_burst)
                
                # Reverse bursts so they are chronological
                bursts.reverse()
                
                # Adjust burst counts to represent actual days involved (a burst of 1 HHHL implies 2 days)
                adjusted_bursts = [b + 1 for b in bursts if b > 0]
                
                if current_cycle_length > 0:
                    # Add 1 to the cycle length to account for the first day that started the first transition
                    current_cycle_length += 1
                    
                # Compute current continuous HHHL from the end
                curr_hhhl = 0
                j = n - 1
                while j >= 1 and df['is_hhhl'].iloc[j]:
                    curr_hhhl += 1
                    j -= 1
                if curr_hhhl > 0:
                    curr_hhhl += 1
                
                history_days_analyzed = n
                history_start_date = str(df['trade_date'].iloc[0]) if n > 0 else None
                cycle_start_date = str(df['trade_date'].iloc[n - current_cycle_length]) if current_cycle_length > 0 else None
                
                # Forward parsing for ALL historical cycles
                all_cycles = []
                c_start_idx = None
                c_active_burst = 0
                c_bursts = []
                c_rests = 0
                c_len = 0
                
                from collections import Counter
                
                for idx in range(1, n):
                    if df['is_hhhl'].iloc[idx]:
                        if c_start_idx is None:
                            c_start_idx = idx - 1
                            c_len = 1
                        c_active_burst += 1
                        c_len += 1
                    elif is_rest(idx):
                        if c_start_idx is not None:
                            if c_active_burst > 0:
                                c_bursts.append(c_active_burst)
                                c_active_burst = 0
                            c_rests += 1
                            c_len += 1
                    else:
                        if c_start_idx is not None:
                            if c_active_burst > 0:
                                c_bursts.append(c_active_burst)
                            if len(c_bursts) > 0:
                                a_bursts = [b + 1 for b in c_bursts if b > 0]
                                counts = Counter(a_bursts)
                                parts = [f"{length} days repeated {cnt} times" for length, cnt in counts.items()]
                                all_cycles.append({
                                    "start_date": str(df['trade_date'].iloc[c_start_idx]),
                                    "end_date": str(df['trade_date'].iloc[idx - 1]),
                                    "start_price": float(df['close'].iloc[c_start_idx]),
                                    "end_price": float(df['close'].iloc[idx - 1]),
                                    "total_days": c_len,
                                    "bursts": a_bursts,
                                    "max_streak": max(a_bursts) if a_bursts else 0,
                                    "details": ", ".join(parts),
                                    "is_active": False
                                })
                            c_start_idx = None
                            c_active_burst = 0
                            c_bursts = []
                            c_rests = 0
                            c_len = 0
                
                if c_start_idx is not None:
                    if c_active_burst > 0:
                        c_bursts.append(c_active_burst)
                    if len(c_bursts) > 0:
                        a_bursts = [b + 1 for b in c_bursts if b > 0]
                        counts = Counter(a_bursts)
                        parts = [f"{length} days repeated {cnt} times" for length, cnt in counts.items()]
                        all_cycles.append({
                            "start_date": str(df['trade_date'].iloc[c_start_idx]),
                            "end_date": str(df['trade_date'].iloc[n - 1]),
                            "start_price": float(df['close'].iloc[c_start_idx]),
                            "end_price": float(df['close'].iloc[n - 1]),
                            "total_days": c_len,
                            "bursts": a_bursts,
                            "max_streak": max(a_bursts) if a_bursts else 0,
                            "details": ", ".join(parts),
                            "is_active": True
                        })
                
                # Sort descending by start date for recent first
                all_cycles.reverse()
                
                # Build details string
                if not adjusted_bursts:
                    details = "No active pattern"
                else:
                    from collections import Counter
                    counts = Counter(adjusted_bursts)
                    parts = []
                    for length, count in counts.items():
                        parts.append(f"{length} days repeated {count} times")
                    details = ", ".join(parts)

                latest_close = float(df['close'].iloc[-1])
                
                cur.execute("""
                    INSERT INTO continuous_hhhl_scanner (
                        ticker, close, current_hhhl, avg_continuity_count,
                        broken_pattern_count, broken_pattern_details, 
                        history_days_analyzed, history_start_date, cycle_start_date, historical_cycles, updated_at
                    ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, NOW())
                    ON CONFLICT (ticker) DO UPDATE SET
                        close = EXCLUDED.close,
                        current_hhhl = EXCLUDED.current_hhhl,
                        avg_continuity_count = EXCLUDED.avg_continuity_count,
                        broken_pattern_count = EXCLUDED.broken_pattern_count,
                        broken_pattern_details = EXCLUDED.broken_pattern_details,
                        history_days_analyzed = EXCLUDED.history_days_analyzed,
                        history_start_date = EXCLUDED.history_start_date,
                        cycle_start_date = EXCLUDED.cycle_start_date,
                        historical_cycles = EXCLUDED.historical_cycles,
                        updated_at = NOW()
                """, (
                    ticker, latest_close, curr_hhhl, avg_continuity_count,
                    current_cycle_length, details,
                    history_days_analyzed, history_start_date, cycle_start_date, json.dumps(all_cycles)
                ))
                
                conn.commit()
                return True
                
    except Exception as e:
        logger.error(f"Error scanning continuous HHHL for {ticker}: {e}")
        return False
