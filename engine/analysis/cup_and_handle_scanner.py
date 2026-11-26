import logging
import json
import pandas as pd
import numpy as np
# MIGRATED: from psycopg2.extras import RealDictCursor
from engine.database.connection import get_db_connection

logger = logging.getLogger("bsa_cup_handle")
logger.setLevel(logging.INFO)

_table_created = False

def ensure_cup_and_handle_table(cur=None):
    global _table_created
    if _table_created:
        return
    if cur is not None:
        cur.execute("""
            CREATE TABLE IF NOT EXISTS cup_and_handle_scanner (
                ticker TEXT PRIMARY KEY REFERENCES ticker_master(ticker) ON DELETE CASCADE,
                is_active INTEGER DEFAULT 0,
                pattern_start_date DATE,
                cup_bottom_date DATE,
                handle_start_date DATE,
                breakout_date DATE,
                breakout_price REAL,
                target_price REAL,
                stop_loss REAL,
                details TEXT,
                historical_patterns TEXT,
                last_updated TEXT DEFAULT (datetime('now'))
            );
        """)
        if hasattr(cur, 'connection') and cur.connection:
            cur.connection.commit()
    else:
        with get_db_connection() as conn:
            c = conn.cursor()
            c.execute("""
                CREATE TABLE IF NOT EXISTS cup_and_handle_scanner (
                    ticker TEXT PRIMARY KEY REFERENCES ticker_master(ticker) ON DELETE CASCADE,
                    is_active INTEGER DEFAULT 0,
                    pattern_start_date DATE,
                    cup_bottom_date DATE,
                    handle_start_date DATE,
                    breakout_date DATE,
                    breakout_price REAL,
                    target_price REAL,
                    stop_loss REAL,
                    details TEXT,
                    historical_patterns TEXT,
                    last_updated TEXT DEFAULT (datetime('now'))
                );
            """)
            conn.commit()
    _table_created = True

def scan_and_store_cup_and_handle(ticker: str, context=None) -> bool:
    """
    Scans for Cup and Handle patterns over the stock's entire history and saves
    active and historical patterns to `cup_and_handle_scanner` table.
    """
    try:
        ensure_cup_and_handle_table()
        df = None
        if context and context.df_ohlcv is not None and not context.df_ohlcv.empty:
            df = context.df_ohlcv[['trade_date', 'open', 'high', 'low', 'close']].copy()
            for col in ["open", "high", "low", "close"]:
                df[col] = pd.to_numeric(df[col], errors="coerce")
        else:
            with get_db_connection() as conn:
                cur = conn.cursor()
                ensure_cup_and_handle_table(cur)
                cur.execute("""
                    SELECT trade_date, open, high, low, close
                    FROM ohlcv_daily
                    WHERE ticker = ? AND close > 0
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
        dates = df['trade_date'].values
        highs = df['high'].values
        lows = df['low'].values
        closes = df['close'].values
        
        # Iterate over history to find valid C&H formations using fast C-level NumPy arrays
        for i in range(25, n):
            breakout_price = closes[i]
            
            for h_len in range(5, 21):
                h_start_idx = i - h_len
                if h_start_idx < 1:
                    continue
                
                handle_peak_price = highs[h_start_idx:i].max()
                handle_low_price = lows[h_start_idx:i].min()
                
                if breakout_price <= handle_peak_price:
                    continue
                
                for c_len in range(20, 131):
                    c_start_idx = h_start_idx - c_len
                    if c_start_idx < 0:
                        break
                        
                    left_lip_price = highs[c_start_idx]
                    right_lip_price = handle_peak_price
                    lip_diff = abs(left_lip_price - right_lip_price) / max(left_lip_price, right_lip_price)
                    if lip_diff > 0.15:
                        continue
                        
                    cup_low_slice = lows[c_start_idx:h_start_idx]
                    cup_bottom_price = cup_low_slice.min()
                    cup_bottom_offset = cup_low_slice.argmin()
                    cup_bottom_date = str(dates[c_start_idx + cup_bottom_offset])
                    
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
                        "pattern_start_date": str(dates[c_start_idx]),
                        "cup_bottom_date": cup_bottom_date,
                        "handle_start_date": str(dates[h_start_idx]),
                        "breakout_date": str(dates[i]),
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
            match_indices = df[df['trade_date'] == most_recent['breakout_date']].index
            if len(match_indices) > 0:
                breakout_idx = match_indices[0]
                if (latest_idx - breakout_idx) <= 10:
                    curr_price = df.iloc[-1]['close']
                    if most_recent['stop_loss'] < curr_price < most_recent['target_price']:
                        is_active = True
                        all_patterns[0]['is_active'] = True
                        active_pattern_data = all_patterns[0]

        with get_db_connection() as conn:
            cur = conn.cursor()
            if not all_patterns:
                cur.execute("""
                    INSERT INTO cup_and_handle_scanner (ticker, is_active, historical_patterns, last_updated)
                    VALUES (?, FALSE, ?, now())
                    ON CONFLICT (ticker) DO UPDATE SET 
                        is_active = FALSE,
                        historical_patterns = ?,
                        last_updated = now()
                """, (ticker, json.dumps([]), json.dumps([])))
            else:
                ap = active_pattern_data or {}
                cur.execute("""
                    INSERT INTO cup_and_handle_scanner (
                        ticker, is_active, pattern_start_date, cup_bottom_date, handle_start_date,
                        breakout_date, breakout_price, target_price, stop_loss, details, historical_patterns, last_updated
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, now())
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
