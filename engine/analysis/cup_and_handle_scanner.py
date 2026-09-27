import logging
import json
import pandas as pd
import numpy as np
from psycopg2.extras import RealDictCursor
from engine.database.connection import get_db_connection

logger = logging.getLogger("bsa_cup_handle")
logger.setLevel(logging.INFO)

def scan_and_store_cup_and_handle(ticker: str) -> bool:
    """
    Scans for Cup and Handle patterns over the stock's entire history and saves
    active and historical patterns to `cup_and_handle_scanner` table.
    
    Mathematical Definition:
    1. Cup Duration: 20 to 130 trading days.
    2. Cup Depth: Bottom between 10% and 40% lower than left lip.
    3. Handle Duration: 5 to 20 days.
    4. Handle Depth: Retraces between 10% and 50% of cup depth.
    5. Breakout: Price closes above handle's peak resistance.
    """
    try:
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("""
                    CREATE TABLE IF NOT EXISTS cup_and_handle_scanner (
                        ticker TEXT PRIMARY KEY REFERENCES ticker_master(ticker) ON DELETE CASCADE,
                        is_active BOOLEAN DEFAULT False,
                        pattern_start_date DATE,
                        cup_bottom_date DATE,
                        handle_start_date DATE,
                        breakout_date DATE,
                        breakout_price DOUBLE PRECISION,
                        target_price DOUBLE PRECISION,
                        stop_loss DOUBLE PRECISION,
                        details JSONB,
                        historical_patterns JSONB,
                        last_updated TIMESTAMP DEFAULT now()
                    );
                """)
                conn.commit()

        with get_db_connection() as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute("""
                    SELECT trade_date, open, high, low, close
                    FROM ohlcv_daily
                    WHERE ticker = %s AND close > 0
                    ORDER BY trade_date ASC
                """, (ticker,))
                rows = cur.fetchall()

        if not rows or len(rows) < 30:
            return False

        df = pd.DataFrame(rows)
        for col in ["open", "high", "low", "close"]:
            df[col] = pd.to_numeric(df[col], errors="coerce")
            
        df['trade_date'] = df['trade_date'].astype(str)

        all_patterns = []
        n = len(df)
        
        # We need to iterate over history to find valid C&H formations.
        for i in range(25, n):
            breakout_day = df.iloc[i]
            breakout_price = breakout_day['close']
            
            for h_len in range(5, 21):
                h_start_idx = i - h_len
                if h_start_idx < 1:
                    continue
                
                handle_start_day = df.iloc[h_start_idx]
                handle_peak_price = df.iloc[h_start_idx:i]['high'].max()
                handle_low_price = df.iloc[h_start_idx:i]['low'].min()
                
                if breakout_price <= handle_peak_price:
                    continue
                
                for c_len in range(20, 131):
                    c_start_idx = h_start_idx - c_len
                    if c_start_idx < 0:
                        break
                        
                    cup_start_day = df.iloc[c_start_idx]
                    left_lip_price = cup_start_day['high']
                    
                    right_lip_price = handle_peak_price
                    lip_diff = abs(left_lip_price - right_lip_price) / max(left_lip_price, right_lip_price)
                    if lip_diff > 0.15:
                        continue
                        
                    cup_bottom_price = df.iloc[c_start_idx:h_start_idx]['low'].min()
                    cup_bottom_idx = df.iloc[c_start_idx:h_start_idx]['low'].idxmin()
                    cup_bottom_date = str(df.iloc[cup_bottom_idx]['trade_date'])
                    
                    avg_lip = (left_lip_price + right_lip_price) / 2
                    cup_depth_pct = (avg_lip - cup_bottom_price) / avg_lip
                    
                    if not (0.10 <= cup_depth_pct <= 0.40):
                        continue
                        
                    cup_depth_abs = avg_lip - cup_bottom_price
                    handle_depth_abs = right_lip_price - handle_low_price
                    
                    if cup_depth_abs == 0:
                        continue
                        
                    handle_retracement = handle_depth_abs / cup_depth_abs
                    
                    if not (0.10 <= handle_retracement <= 0.50):
                        continue
                        
                    target_price = breakout_price + cup_depth_abs
                    stop_loss = handle_low_price
                    
                    all_patterns.append({
                        "pattern_start_date": str(cup_start_day['trade_date']),
                        "cup_bottom_date": cup_bottom_date,
                        "handle_start_date": str(handle_start_day['trade_date']),
                        "breakout_date": str(breakout_day['trade_date']),
                        "breakout_price": round(float(breakout_price), 2),
                        "target_price": round(float(target_price), 2),
                        "stop_loss": round(float(stop_loss), 2),
                        "cup_depth_pct": round(float(cup_depth_pct * 100), 2),
                        "handle_retracement_pct": round(float(handle_retracement * 100), 2),
                        "cup_duration": c_len,
                        "handle_duration": h_len,
                        "is_active": False
                    })
                    break 

        is_active = False
        active_pattern_data = None
        
        all_patterns.sort(key=lambda x: x["breakout_date"], reverse=True)
        
        if all_patterns:
            most_recent = all_patterns[0]
            latest_idx = df.index[-1]
            breakout_idx = df[df['trade_date'] == most_recent['breakout_date']].index[0]
            
            if (latest_idx - breakout_idx) <= 10:
                curr_price = df.iloc[-1]['close']
                if most_recent['stop_loss'] < curr_price < most_recent['target_price']:
                    is_active = True
                    all_patterns[0]['is_active'] = True
                    active_pattern_data = all_patterns[0]

        with get_db_connection() as conn:
            with conn.cursor() as cur:
                if not all_patterns:
                    cur.execute("""
                        INSERT INTO cup_and_handle_scanner (ticker, is_active, historical_patterns, last_updated)
                        VALUES (%s, FALSE, %s, now())
                        ON CONFLICT (ticker) DO UPDATE SET 
                            is_active = FALSE,
                            historical_patterns = %s,
                            last_updated = now()
                    """, (ticker, json.dumps([]), json.dumps([])))
                else:
                    ap = active_pattern_data or {}
                    cur.execute("""
                        INSERT INTO cup_and_handle_scanner (
                            ticker, is_active, pattern_start_date, cup_bottom_date, handle_start_date,
                            breakout_date, breakout_price, target_price, stop_loss, details, historical_patterns, last_updated
                        ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, now())
                        ON CONFLICT (ticker) DO UPDATE SET
                            is_active = EXCLUDED.is_active,
                            pattern_start_date = EXCLUDED.pattern_start_date,
                            cup_bottom_date = EXCLUDED.cup_bottom_date,
                            handle_start_date = EXCLUDED.handle_start_date,
                            breakout_date = EXCLUDED.breakout_date,
                            breakout_price = EXCLUDED.breakout_price,
                            target_price = EXCLUDED.target_price,
                            stop_loss = EXCLUDED.stop_loss,
                            details = EXCLUDED.details,
                            historical_patterns = EXCLUDED.historical_patterns,
                            last_updated = now()
                    """, (
                        ticker,
                        is_active,
                        ap.get('pattern_start_date'),
                        ap.get('cup_bottom_date'),
                        ap.get('handle_start_date'),
                        ap.get('breakout_date'),
                        ap.get('breakout_price'),
                        ap.get('target_price'),
                        ap.get('stop_loss'),
                        json.dumps({
                            "cup_depth_pct": ap.get("cup_depth_pct"),
                            "handle_retracement_pct": ap.get("handle_retracement_pct"),
                            "cup_duration": ap.get("cup_duration"),
                            "handle_duration": ap.get("handle_duration")
                        }) if is_active else None,
                        json.dumps(all_patterns)
                    ))
                conn.commit()
                
        return True

    except Exception as e:
        logger.error(f"Error analyzing Cup and Handle for {ticker}: {e}")
        return False
