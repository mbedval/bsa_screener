"""
engine/analyzers/fii_behavior.py

Analyzes historical FII (Foreign Institutional Investors) behaviour for a given ticker.
Calculates accumulation/distribution breadth, holding changes over time,
and generates insights based on quarterly portfolio disclosures.
"""

import os
from typing import Dict, List, Optional, Any
from datetime import datetime
from dateutil.relativedelta import relativedelta
import psycopg2
from psycopg2.extras import RealDictCursor
from dotenv import load_dotenv

load_dotenv()

def get_connection():
    host = os.getenv("POSTGRES_HOST", "127.0.0.1")
    port = os.getenv("POSTGRES_PORT", "5432")
    user = os.getenv("POSTGRES_USER", "jmbxdbuser")
    password = os.getenv("POSTGRES_PASSWORD", "jmbxdbpassword")
    db = os.getenv("POSTGRES_DB", "bsa_db")
    dsn = f"postgresql://{user}:{password}@{host}:{port}/{db}"
    return psycopg2.connect(dsn)

def analyze_fii_behavior(ticker: str) -> Dict[str, Any]:
    ticker = ticker.upper()
    
    with get_connection() as conn, conn.cursor(cursor_factory=RealDictCursor) as cur:
        # Get all available snapshot dates for this ticker
        cur.execute("""
            SELECT DISTINCT snapshot_date 
            FROM fii_historical_holdings 
            WHERE ticker = %s 
            ORDER BY snapshot_date DESC
        """, (ticker,))
        
        dates_rows = cur.fetchall()
        if not dates_rows:
            return {"error": "No historical FII data found for ticker.", "historical_chart": []}
            
        all_dates = [r['snapshot_date'] for r in dates_rows]
        latest_date = all_dates[0]
        
        def get_closest_date(target_date):
            valid_dates = [d for d in all_dates if d <= target_date]
            return valid_dates[0] if valid_dates else None

        date_3m = get_closest_date(latest_date - relativedelta(months=3))
        date_6m = get_closest_date(latest_date - relativedelta(months=6))
        date_12m = get_closest_date(latest_date - relativedelta(months=12))
        
        def get_total_weight(date_val):
            if not date_val: return None
            cur.execute("""
                SELECT SUM(portfolio_weight_pct) as total_weight
                FROM fii_historical_holdings
                WHERE ticker = %s AND snapshot_date = %s
            """, (ticker, date_val))
            res = cur.fetchone()
            return res['total_weight'] if res and res['total_weight'] else 0.0

        current_weight = get_total_weight(latest_date)
        weight_3m = get_total_weight(date_3m)
        weight_6m = get_total_weight(date_6m)
        weight_12m = get_total_weight(date_12m)

        # Holder specific changes (Latest vs 3M ago)
        cur.execute("""
            SELECT investor_id, portfolio_weight_pct
            FROM fii_historical_holdings
            WHERE ticker = %s AND snapshot_date = %s
        """, (ticker, latest_date))
        latest_holdings = {r['investor_id']: r for r in cur.fetchall()}
        
        prev_holdings = {}
        if date_3m:
            cur.execute("""
                SELECT investor_id, portfolio_weight_pct
                FROM fii_historical_holdings
                WHERE ticker = %s AND snapshot_date = %s
            """, (ticker, date_3m))
            prev_holdings = {r['investor_id']: r['portfolio_weight_pct'] for r in cur.fetchall()}
            
        accumulating = 0
        distributing = 0
        stable = 0
        new_entrants = 0
        
        for sid, hold in latest_holdings.items():
            prev_weight = prev_holdings.get(sid)
            current_weight_ind = hold['portfolio_weight_pct'] or 0
            
            if prev_weight is None:
                new_entrants += 1
            else:
                if current_weight_ind > prev_weight:
                    accumulating += 1
                elif current_weight_ind < prev_weight:
                    distributing += 1
                else:
                    stable += 1
                    
        exited = 0
        for sid in prev_holdings.keys():
            if sid not in latest_holdings:
                exited += 1

        active_investors = len(latest_holdings)
        acc_breadth = round((accumulating / active_investors * 100), 2) if active_investors else 0.0
        dist_breadth = round((distributing / active_investors * 100), 2) if active_investors else 0.0

        # Concentration (Top 3)
        sorted_weights = sorted([(h['portfolio_weight_pct'] or 0.0) for h in latest_holdings.values()], reverse=True)
        top_3_weight = sum(sorted_weights[:3])
        concentration_pct = round((top_3_weight / current_weight * 100), 2) if current_weight > 0 else 0.0

        trend = "Stable"
        if weight_3m is not None:
            if current_weight > weight_3m * 1.05:
                trend = "Accumulation Trend"
            elif current_weight < weight_3m * 0.95:
                trend = "Distribution Trend"

        cur.execute("""
            SELECT snapshot_date as date, SUM(portfolio_weight_pct) as total_weight
            FROM fii_historical_holdings
            WHERE ticker = %s
            GROUP BY snapshot_date
            ORDER BY snapshot_date ASC
        """, (ticker,))
        historical_chart = [
            {"time": r['date'].strftime('%Y-%m-%d'), "value": float(round(r['total_weight'] or 0.0, 2))}
            for r in cur.fetchall()
        ]

        insights = []
        insights.append(f"FII ownership changed from {round(weight_6m or 0.0, 2)}% to {round(current_weight, 2)}% over the last 6 months.")
        if new_entrants > 0:
            insights.append(f"{new_entrants} new FII(s) entered in the latest snapshot.")
        if exited > 0:
            insights.append(f"{exited} FII(s) completely exited in the latest snapshot.")
        if acc_breadth > 50:
            insights.append(f"Broad-based accumulation observed: {accumulating} of {active_investors} FIIs increased positions.")
        if concentration_pct > 70:
            insights.append(f"Ownership is highly concentrated, with the top 3 FIIs controlling {concentration_pct}% of the FII share.")

        cur.execute("""
            SELECT h.portfolio_weight_pct as weight, i.investor_name as name
            FROM fii_historical_holdings h
            LEFT JOIN fii_investor i ON h.investor_id = i.id
            WHERE h.ticker = %s AND h.snapshot_date = %s
            ORDER BY h.portfolio_weight_pct DESC
            LIMIT 3
        """, (ticker, latest_date))
        top_holders = []
        for r in cur.fetchall():
            top_holders.append({
                "name": r['name'] or "Unknown FII",
                "weight": float(round(r['weight'] or 0.0, 2))
            })

        return {
            "latest_date": latest_date.strftime('%Y-%m-%d'),
            "current_weight": round(current_weight, 2),
            "changes": {
                "3M": round(current_weight - (weight_3m or current_weight), 2) if weight_3m is not None else None,
                "6M": round(current_weight - (weight_6m or current_weight), 2) if weight_6m is not None else None,
                "12M": round(current_weight - (weight_12m or current_weight), 2) if weight_12m is not None else None,
            },
            "breadth": {
                "active_schemes": active_investors,
                "accumulating": accumulating,
                "distributing": distributing,
                "stable": stable,
                "new_entrants": new_entrants,
                "exited": exited,
                "acc_breadth_pct": acc_breadth,
                "dist_breadth_pct": dist_breadth,
            },
            "concentration_pct": concentration_pct,
            "trend": trend,
            "historical_chart": historical_chart,
            "insights": insights,
            "top_holders": top_holders
        }

def precalculate_all_fii_behavior(tickers: Optional[List[str]] = None):
    import json
    import logging
    
    logger = logging.getLogger("fii_behavior")
    logger.setLevel(logging.INFO)
    if not logger.handlers:
        ch = logging.StreamHandler()
        ch.setFormatter(logging.Formatter('%(asctime)s [%(levelname)s] %(message)s'))
        logger.addHandler(ch)

    logger.info("Starting FII Behavior pre-calculation...")
    
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            if tickers is not None:
                target_tickers = [t.upper().strip() for t in tickers]
            else:
                cur.execute("SELECT DISTINCT ticker FROM fii_historical_holdings")
                target_tickers = [r[0] for r in cur.fetchall()]
            
            logger.info(f"Pre-calculating FII Behavior for {len(target_tickers)} tickers.")
            
            count = 0
            for t in target_tickers:
                try:
                    data = analyze_fii_behavior(t)
                    cur.execute("""
                        INSERT INTO fii_behavior (ticker, data, updated_at)
                        VALUES (%s, %s, now())
                        ON CONFLICT (ticker) DO UPDATE SET 
                        data = EXCLUDED.data, updated_at = EXCLUDED.updated_at
                    """, (t, json.dumps(data)))
                    count += 1
                    if count % 100 == 0:
                        logger.info(f"Processed {count}/{len(tickers)} tickers...")
                except Exception as e:
                    logger.error(f"Error calculating FII behavior for {t}: {e}")
            conn.commit()
            logger.info("FII Behavior pre-calculation completed.")
    except Exception as e:
        logger.error(f"Failed FII precalc: {e}")
    finally:
        conn.close()
