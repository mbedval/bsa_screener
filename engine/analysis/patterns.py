"""
Candlestick Pattern Detection Engine
Supports 15 classic candlestick patterns across Daily (1D) and Weekly (1WK) timeframes:
- Neutral (3): Standard Doji, Spinning Top, Long-Legged Doji
- Bullish (6): Three White Soldiers, Morning Star, Bullish Engulfing, Inverted Hammer, Hammer, Piercing Line
- Bearish (6): Three Black Crows, Evening Star, Bearish Engulfing, Shooting Star, Dark Cloud Cover, Gravestone Doji

Persists detected patterns to PostgreSQL `chart_patterns` table for both NSE India and US databases.
"""

import logging
import json
from datetime import datetime, date
from typing import Dict, List, Any, Optional
import pandas as pd
import numpy as np
import psycopg2
from psycopg2.extras import RealDictCursor

from engine.database.connection import get_db_connection, os

logger = logging.getLogger("bsa_pattern_detector")
logger.setLevel(logging.INFO)

# ─── Pattern Definitions ──────────────────────────────────────────────────────
PATTERNS_CATALOG = [
    # Neutral Patterns
    {"code": "standard_doji", "name": "Standard Doji", "category": "NEUTRAL", "candles": 1, "description": "Open and close are virtually equal with small shadows."},
    {"code": "spinning_top", "name": "Spinning Top", "category": "NEUTRAL", "candles": 1, "description": "Small real body with long upper and lower shadows of similar length."},
    {"code": "long_legged_doji", "name": "Long-Legged Doji", "category": "NEUTRAL", "candles": 1, "description": "Doji with extremely long upper and lower shadows indicating high indecision."},

    # Bullish Patterns
    {"code": "three_white_soldiers", "name": "Three White Soldiers", "category": "BULLISH", "candles": 3, "description": "Three consecutive long green candles closing progressively higher."},
    {"code": "morning_star", "name": "Morning Star", "category": "BULLISH", "candles": 3, "description": "Long red candle followed by a small star and a strong green candle piercing upward."},
    {"code": "bullish_engulfing", "name": "Bullish Engulfing", "category": "BULLISH", "candles": 2, "description": "Green candle completely engulfs the prior small red candle body."},
    {"code": "inverted_hammer", "name": "Inverted Hammer", "category": "BULLISH", "candles": 1, "description": "Small body at bottom with long upper shadow after a downtrend."},
    {"code": "hammer", "name": "Hammer", "category": "BULLISH", "candles": 1, "description": "Small body at top with long lower shadow after a downtrend."},
    {"code": "piercing_line", "name": "Piercing Line", "category": "BULLISH", "candles": 2, "description": "Long red candle followed by a green candle closing above its 50% midpoint."},

    # Bearish Patterns
    {"code": "three_black_crows", "name": "Three Black Crows", "category": "BEARISH", "candles": 3, "description": "Three consecutive long red candles closing progressively lower."},
    {"code": "evening_star", "name": "Evening Star", "category": "BEARISH", "candles": 3, "description": "Long green candle followed by a small star and a strong red candle piercing downward."},
    {"code": "bearish_engulfing", "name": "Bearish Engulfing", "category": "BEARISH", "candles": 2, "description": "Red candle completely engulfs the prior small green candle body."},
    {"code": "shooting_star", "name": "Shooting Star", "category": "BEARISH", "candles": 1, "description": "Small body at bottom with long upper shadow after an uptrend."},
    {"code": "dark_cloud_cover", "name": "Dark Cloud Cover", "category": "BEARISH", "candles": 2, "description": "Long green candle followed by a red candle closing below its 50% midpoint."},
    {"code": "gravestone_doji", "name": "Gravestone Doji", "category": "BEARISH", "candles": 1, "description": "Doji with long upper shadow and virtually no lower shadow at peak."},
]

PATTERN_MAP = {p["code"]: p for p in PATTERNS_CATALOG}

# ─── Resample Daily OHLCV to Weekly Bars ──────────────────────────────────────
def resample_to_weekly(df: pd.DataFrame) -> pd.DataFrame:
    """Resample daily OHLCV DataFrame to weekly bars (ending Friday)."""
    if df.empty or "trade_date" not in df.columns:
        return pd.DataFrame()
    
    temp = df.copy()
    temp["trade_date"] = pd.to_datetime(temp["trade_date"])
    temp = temp.sort_values("trade_date").set_index("trade_date")

    weekly = temp.resample("W-FRI").agg({
        "open": "first",
        "high": "max",
        "low": "min",
        "close": "last",
        "volume": "sum"
    }).dropna().reset_index()

    weekly["trade_date"] = weekly["trade_date"].dt.strftime("%Y-%m-%d")
    return weekly

# ─── Pattern Scanner Logic ────────────────────────────────────────────────────
def detect_candlestick_patterns(df: pd.DataFrame, timeframe: str = "DAILY") -> List[Dict[str, Any]]:
    """
    Analyze OHLCV DataFrame and return list of detected pattern dictionaries.
    Only checks recent windows (last 45 bars) for actionable pattern signals.
    """
    if df is None or len(df) < 5:
        return []

    # Sort ascending by date
    df_sorted = df.copy().sort_values("trade_date").reset_index(drop=True)
    
    # Ensure numeric columns
    for col in ["open", "high", "low", "close"]:
        df_sorted[col] = pd.to_numeric(df_sorted[col], errors="coerce")

    records = df_sorted.to_dict("records")
    n = len(records)
    detected_patterns = []

    # Scan last 45 bars or length of series
    start_idx = max(3, n - 45)

    for i in range(start_idx, n):
        c0 = records[i]        # Current bar
        c1 = records[i - 1]    # 1 bar ago
        c2 = records[i - 2]    # 2 bars ago

        # Candle Math for c0
        o0, h0, l0, cl0 = c0["open"], c0["high"], c0["low"], c0["close"]
        body0 = abs(cl0 - o0)
        rng0 = max(0.001, h0 - l0)
        upper0 = h0 - max(o0, cl0)
        lower0 = min(o0, cl0) - l0
        is_bull0 = cl0 > o0
        is_bear0 = cl0 < o0

        # Candle Math for c1
        if c1:
            o1, h1, l1, cl1 = c1["open"], c1["high"], c1["low"], c1["close"]
            body1 = abs(cl1 - o1)
            rng1 = max(0.001, h1 - l1)
            is_bull1 = cl1 > o1
            is_bear1 = cl1 < o1

        # Candle Math for c2
        if c2:
            o2, h2, l2, cl2 = c2["open"], c2["high"], c2["low"], c2["close"]
            body2 = abs(cl2 - o2)
            rng2 = max(0.001, h2 - l2)
            is_bull2 = cl2 > o2
            is_bear2 = cl2 < o2

        # ── 1. Standard Doji (Neutral)
        if body0 / rng0 <= 0.10 and upper0 > (0.2 * rng0) and lower0 > (0.2 * rng0):
            detected_patterns.append({
                "code": "standard_doji",
                "start_date": str(c0["trade_date"]),
                "end_date": str(c0["trade_date"]),
                "detected_date": str(c0["trade_date"]),
                "high": h0, "low": l0, "close": cl0, "score": 65.0,
                "details": {"body_pct": round(body0 / rng0 * 100, 1)}
            })

        # ── 2. Spinning Top (Neutral)
        if 0.10 < (body0 / rng0) <= 0.30 and upper0 >= (body0 * 1.1) and lower0 >= (body0 * 1.1):
            detected_patterns.append({
                "code": "spinning_top",
                "start_date": str(c0["trade_date"]),
                "end_date": str(c0["trade_date"]),
                "detected_date": str(c0["trade_date"]),
                "high": h0, "low": l0, "close": cl0, "score": 60.0,
                "details": {"body_pct": round(body0 / rng0 * 100, 1)}
            })

        # ── 3. Long-Legged Doji (Neutral)
        if body0 / rng0 <= 0.10 and (upper0 + lower0) >= (0.75 * rng0) and upper0 > (0.3 * rng0) and lower0 > (0.3 * rng0):
            detected_patterns.append({
                "code": "long_legged_doji",
                "start_date": str(c0["trade_date"]),
                "end_date": str(c0["trade_date"]),
                "detected_date": str(c0["trade_date"]),
                "high": h0, "low": l0, "close": cl0, "score": 75.0,
                "details": {"shadow_span": round((upper0 + lower0) / rng0 * 100, 1)}
            })

        # ── 4. Hammer (Bullish)
        if body0 / rng0 <= 0.35 and lower0 >= (1.8 * body0) and upper0 <= (0.25 * body0):
            detected_patterns.append({
                "code": "hammer",
                "start_date": str(c0["trade_date"]),
                "end_date": str(c0["trade_date"]),
                "detected_date": str(c0["trade_date"]),
                "high": h0, "low": l0, "close": cl0, "score": 82.0,
                "details": {"lower_wick_ratio": round(lower0 / max(0.001, body0), 1)}
            })

        # ── 5. Inverted Hammer (Bullish)
        if body0 / rng0 <= 0.35 and upper0 >= (1.8 * body0) and lower0 <= (0.25 * body0):
            detected_patterns.append({
                "code": "inverted_hammer",
                "start_date": str(c0["trade_date"]),
                "end_date": str(c0["trade_date"]),
                "detected_date": str(c0["trade_date"]),
                "high": h0, "low": l0, "close": cl0, "score": 78.0,
                "details": {"upper_wick_ratio": round(upper0 / max(0.001, body0), 1)}
            })

        # ── 6. Shooting Star (Bearish)
        if body0 / rng0 <= 0.35 and upper0 >= (1.8 * body0) and lower0 <= (0.25 * body0):
            detected_patterns.append({
                "code": "shooting_star",
                "start_date": str(c0["trade_date"]),
                "end_date": str(c0["trade_date"]),
                "detected_date": str(c0["trade_date"]),
                "high": h0, "low": l0, "close": cl0, "score": 80.0,
                "details": {"upper_wick_ratio": round(upper0 / max(0.001, body0), 1)}
            })

        # ── 7. Gravestone Doji (Bearish)
        if body0 / rng0 <= 0.10 and upper0 >= (0.7 * rng0) and lower0 <= (0.1 * rng0):
            detected_patterns.append({
                "code": "gravestone_doji",
                "start_date": str(c0["trade_date"]),
                "end_date": str(c0["trade_date"]),
                "detected_date": str(c0["trade_date"]),
                "high": h0, "low": l0, "close": cl0, "score": 85.0,
                "details": {"upper_wick_span": round(upper0 / rng0 * 100, 1)}
            })

        # ── 2-Candle Patterns
        if c1:
            # ── 8. Bullish Engulfing
            if is_bear1 and is_bull0 and cl0 >= max(o1, cl1) and o0 <= min(o1, cl1) and body0 > body1:
                detected_patterns.append({
                    "code": "bullish_engulfing",
                    "start_date": str(c1["trade_date"]),
                    "end_date": str(c0["trade_date"]),
                    "detected_date": str(c0["trade_date"]),
                    "high": max(h0, h1), "low": min(l0, l1), "close": cl0, "score": 88.0,
                    "details": {"engulf_ratio": round(body0 / max(0.001, body1), 2)}
                })

            # ── 9. Bearish Engulfing
            if is_bull1 and is_bear0 and cl0 <= min(o1, cl1) and o0 >= max(o1, cl1) and body0 > body1:
                detected_patterns.append({
                    "code": "bearish_engulfing",
                    "start_date": str(c1["trade_date"]),
                    "end_date": str(c0["trade_date"]),
                    "detected_date": str(c0["trade_date"]),
                    "high": max(h0, h1), "low": min(l0, l1), "close": cl0, "score": 88.0,
                    "details": {"engulf_ratio": round(body0 / max(0.001, body1), 2)}
                })

            # ── 10. Piercing Line (Bullish)
            mid1 = (o1 + cl1) / 2.0
            if is_bear1 and is_bull0 and o0 < l1 and cl0 > mid1 and cl0 < o1:
                detected_patterns.append({
                    "code": "piercing_line",
                    "start_date": str(c1["trade_date"]),
                    "end_date": str(c0["trade_date"]),
                    "detected_date": str(c0["trade_date"]),
                    "high": max(h0, h1), "low": min(l0, l1), "close": cl0, "score": 83.0,
                    "details": {"pierce_depth": round((cl0 - cl1) / max(0.001, o1 - cl1) * 100, 1)}
                })

            # ── 11. Dark Cloud Cover (Bearish)
            if is_bull1 and is_bear0 and o0 > h1 and cl0 < mid1 and cl0 > o1:
                detected_patterns.append({
                    "code": "dark_cloud_cover",
                    "start_date": str(c1["trade_date"]),
                    "end_date": str(c0["trade_date"]),
                    "detected_date": str(c0["trade_date"]),
                    "high": max(h0, h1), "low": min(l0, l1), "close": cl0, "score": 83.0,
                    "details": {"cover_depth": round((cl1 - cl0) / max(0.001, cl1 - o1) * 100, 1)}
                })

        # ── 3-Candle Patterns
        if c1 and c2:
            # ── 12. Three White Soldiers (Bullish)
            if is_bull2 and is_bull1 and is_bull0 and (cl0 > cl1 > cl2) and (o0 > o1 > o2) and body0 > (0.4 * rng0) and body1 > (0.4 * rng1):
                detected_patterns.append({
                    "code": "three_white_soldiers",
                    "start_date": str(c2["trade_date"]),
                    "end_date": str(c0["trade_date"]),
                    "detected_date": str(c0["trade_date"]),
                    "high": max(h0, h1, h2), "low": min(l0, l1, l2), "close": cl0, "score": 92.0,
                    "details": {"gain_pct": round((cl0 - o2) / o2 * 100, 2)}
                })

            # ── 13. Three Black Crows (Bearish)
            if is_bear2 and is_bear1 and is_bear0 and (cl0 < cl1 < cl2) and (o0 < o1 < o2) and body0 > (0.4 * rng0) and body1 > (0.4 * rng1):
                detected_patterns.append({
                    "code": "three_black_crows",
                    "start_date": str(c2["trade_date"]),
                    "end_date": str(c0["trade_date"]),
                    "detected_date": str(c0["trade_date"]),
                    "high": max(h0, h1, h2), "low": min(l0, l1, l2), "close": cl0, "score": 92.0,
                    "details": {"drop_pct": round((o2 - cl0) / o2 * 100, 2)}
                })

            # ── 14. Morning Star (Bullish)
            mid2 = (o2 + cl2) / 2.0
            if is_bear2 and (body1 / rng1 <= 0.40) and is_bull0 and cl0 > mid2:
                detected_patterns.append({
                    "code": "morning_star",
                    "start_date": str(c2["trade_date"]),
                    "end_date": str(c0["trade_date"]),
                    "detected_date": str(c0["trade_date"]),
                    "high": max(h0, h1, h2), "low": min(l0, l1, l2), "close": cl0, "score": 90.0,
                    "details": {"reversal_score": round((cl0 - l1) / max(0.001, h2 - l1) * 100, 1)}
                })

            # ── 15. Evening Star (Bearish)
            if is_bull2 and (body1 / rng1 <= 0.40) and is_bear0 and cl0 < mid2:
                detected_patterns.append({
                    "code": "evening_star",
                    "start_date": str(c2["trade_date"]),
                    "end_date": str(c0["trade_date"]),
                    "detected_date": str(c0["trade_date"]),
                    "high": max(h0, h1, h2), "low": min(l0, l1, l2), "close": cl0, "score": 90.0,
                    "details": {"reversal_score": round((h1 - cl0) / max(0.001, h1 - l2) * 100, 1)}
                })

    return detected_patterns

# ─── Database Scanner & Persistence Orchestrator ──────────────────────────────
def scan_and_store_ticker_patterns(ticker: str, dsn: Optional[str] = None) -> int:
    """
    Fetch OHLCV daily data for ticker, compute both Daily and Weekly patterns,
    and persist into `chart_patterns` PostgreSQL table.
    """
    clean_t = ticker.strip().upper()
    target_dsn = dsn or os.getenv("POSTGRES_DSN") or "postgresql://jmbxdbuser:jmbxdbpassword@127.0.0.1:5432/bsa_db"

    try:
        conn = psycopg2.connect(target_dsn)
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute("""
                SELECT trade_date, open, high, low, close, volume
                FROM ohlcv_daily
                WHERE ticker = %s AND close > 0
                ORDER BY trade_date ASC
            """, (clean_t,))
            rows = cur.fetchall()

            if not rows or len(rows) < 5:
                conn.close()
                return 0

            df_daily = pd.DataFrame(rows)
            df_weekly = resample_to_weekly(df_daily)

            daily_patterns = detect_candlestick_patterns(df_daily, timeframe="DAILY")
            weekly_patterns = detect_candlestick_patterns(df_weekly, timeframe="WEEKLY")

            all_detected = []
            for p in daily_patterns:
                p["timeframe"] = "DAILY"
                all_detected.append(p)

            for p in weekly_patterns:
                p["timeframe"] = "WEEKLY"
                all_detected.append(p)

            stored_count = 0
            for p in all_detected:
                meta = PATTERN_MAP.get(p["code"], {"name": p["code"], "category": "NEUTRAL"})
                cur.execute("""
                    INSERT INTO chart_patterns (
                        ticker, pattern_code, pattern_name, category, timeframe,
                        detected_date, start_date, end_date, high_price, low_price, close_price,
                        strength_score, details, created_at
                    ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, NOW())
                    ON CONFLICT (ticker, pattern_code, timeframe, detected_date) DO UPDATE SET
                        start_date = EXCLUDED.start_date,
                        end_date = EXCLUDED.end_date,
                        high_price = EXCLUDED.high_price,
                        low_price = EXCLUDED.low_price,
                        close_price = EXCLUDED.close_price,
                        strength_score = EXCLUDED.strength_score,
                        details = EXCLUDED.details,
                        created_at = NOW()
                """, (
                    clean_t, p["code"], meta["name"], meta["category"], p["timeframe"],
                    p["detected_date"], p["start_date"], p["end_date"],
                    float(p["high"]), float(p["low"]), float(p["close"]),
                    float(p["score"]), json.dumps(p["details"])
                ))
                stored_count += 1
            conn.commit()

        conn.close()
        return stored_count
    except Exception as e:
        logger.error(f"Error scanning patterns for {clean_t}: {e}")
        return 0


def scan_all_database_patterns(dsn: Optional[str] = None) -> int:
    """Scan all active tickers in ticker_master and update chart_patterns table."""
    target_dsn = dsn or os.getenv("POSTGRES_DSN") or "postgresql://jmbxdbuser:jmbxdbpassword@127.0.0.1:5432/bsa_db"

    try:
        conn = psycopg2.connect(target_dsn)
        with conn:
            with conn.cursor() as cur:
                cur.execute("SELECT ticker FROM ticker_master ORDER BY ticker")
                tickers = [r[0] for r in cur.fetchall()]
        conn.close()

        total_patterns = 0
        for t in tickers:
            total_patterns += scan_and_store_ticker_patterns(t, target_dsn)
        return total_patterns
    except Exception as e:
        logger.error(f"Error scanning all database patterns: {e}")
        return 0
