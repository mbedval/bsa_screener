"""
engine/analyzers/mf_behavior.py

Analyzes historical Mutual Fund behaviour for a given ticker.
Calculates accumulation/distribution breadth, holding changes over time,
and generates insights based on monthly portfolio disclosures.
"""

import os
from typing import Dict, List, Optional, Any
from datetime import datetime, date
from dateutil.relativedelta import relativedelta
# MIGRATED: import psycopg2
# MIGRATED: from psycopg2.extras import RealDictCursor
from dotenv import load_dotenv

load_dotenv()

from engine.database.connection import get_db_connection as get_connection
def analyze_mf_behavior(ticker: str) -> Dict[str, Any]:
    """
    Computes mutual fund behaviour metrics for a specific ticker.
    """
    ticker = ticker.upper()
    
    with get_connection() as conn, conn.cursor() as cur:
        # Get all available snapshot dates for this ticker
        cur.execute("""
            SELECT DISTINCT snapshot_date 
            FROM mf_historical_holdings 
            WHERE ticker = ? 
            ORDER BY snapshot_date DESC
        """, (ticker,))
        
        dates_rows = cur.fetchall()
        if not dates_rows:
            return {"error": "No historical MF data found for ticker.", "historical_chart": []}
            
        def _to_date(d):
            if isinstance(d, (datetime, date)):
                return d if isinstance(d, date) else d.date()
            if isinstance(d, str):
                return datetime.strptime(d[:10], "%Y-%m-%d").date()
            return d

        all_dates = [_to_date(r['snapshot_date']) for r in dates_rows if r['snapshot_date']]
        latest_date = all_dates[0]
        
        # Calculate target dates for 1M, 3M, 6M, 12M lookbacks
        def get_closest_date(target_date):
            # Find the closest date before or equal to target_date
            valid_dates = [d for d in all_dates if d <= target_date]
            return valid_dates[0] if valid_dates else None

        date_1m = get_closest_date(latest_date - relativedelta(months=1))
        date_3m = get_closest_date(latest_date - relativedelta(months=3))
        date_6m = get_closest_date(latest_date - relativedelta(months=6))
        date_12m = get_closest_date(latest_date - relativedelta(months=12))
        
        # Helper to get total holding weight for a date
        def get_total_weight(date_val):
            if not date_val: return None
            cur.execute("""
                SELECT SUM(portfolio_weight_pct) as total_weight
                FROM mf_historical_holdings
                WHERE ticker = ? AND snapshot_date = ?
            """, (ticker, date_val))
            res = cur.fetchone()
            return res['total_weight'] if res and res['total_weight'] else 0.0

        current_weight = get_total_weight(latest_date)
        weight_1m = get_total_weight(date_1m)
        weight_3m = get_total_weight(date_3m)
        weight_6m = get_total_weight(date_6m)
        weight_12m = get_total_weight(date_12m)

        # Holder specific changes (Latest vs 1M ago)
        cur.execute("""
            SELECT scheme_id, shares, portfolio_weight_pct, source_date
            FROM mf_historical_holdings
            WHERE ticker = ? AND snapshot_date = ?
        """, (ticker, latest_date))
        latest_holdings = {r['scheme_id']: r for r in cur.fetchall()}
        
        prev_holdings = {}
        if date_1m:
            cur.execute("""
                SELECT scheme_id, shares
                FROM mf_historical_holdings
                WHERE ticker = ? AND snapshot_date = ?
            """, (ticker, date_1m))
            prev_holdings = {r['scheme_id']: r['shares'] for r in cur.fetchall()}
            
        accumulating = 0
        distributing = 0
        stable = 0
        new_entrants = 0
        
        for sid, hold in latest_holdings.items():
            prev_shares = prev_holdings.get(sid)
            current_shares = hold['shares'] or 0
            
            if prev_shares is None:
                new_entrants += 1
            else:
                if current_shares > prev_shares:
                    accumulating += 1
                elif current_shares < prev_shares:
                    distributing += 1
                else:
                    stable += 1
                    
        exited = 0
        for sid in prev_holdings.keys():
            if sid not in latest_holdings:
                exited += 1

        active_schemes = len(latest_holdings)
        acc_breadth = round((accumulating / active_schemes * 100), 2) if active_schemes else 0.0
        dist_breadth = round((distributing / active_schemes * 100), 2) if active_schemes else 0.0

        # Concentration (Top 3)
        sorted_weights = sorted([(h['portfolio_weight_pct'] or 0.0) for h in latest_holdings.values()], reverse=True)
        top_3_weight = sum(sorted_weights[:3])
        concentration_pct = round((top_3_weight / current_weight * 100), 2) if current_weight > 0 else 0.0

        # Trend logic
        trend = "Stable"
        if weight_3m is not None:
            if current_weight > weight_3m * 1.05:
                trend = "Accumulation Trend"
            elif current_weight < weight_3m * 0.95:
                trend = "Distribution Trend"

        # Monthly series for chart
        cur.execute("""
            SELECT snapshot_date as date, SUM(portfolio_weight_pct) as total_weight, SUM(shares) as total_shares
            FROM mf_historical_holdings
            WHERE ticker = ?
            GROUP BY snapshot_date
            ORDER BY snapshot_date ASC
        """, (ticker,))
        historical_chart = [
            {"time": (r['date'][:10] if isinstance(r['date'], str) else r['date'].strftime('%Y-%m-%d')), "value": float(round(r['total_weight'] or 0.0, 2))}
            for r in cur.fetchall()
        ]

        # Factual Insights
        insights = []
        insights.append(f"MF ownership changed from {round(weight_6m or 0.0, 2)}% to {round(current_weight, 2)}% over the last 6 months.")
        if new_entrants > 0:
            insights.append(f"{new_entrants} new scheme(s) entered in the latest snapshot.")
        if exited > 0:
            insights.append(f"{exited} scheme(s) completely exited in the latest snapshot.")
        if acc_breadth > 50:
            insights.append(f"Broad-based accumulation observed: {accumulating} of {active_schemes} funds increased positions.")
        if concentration_pct > 70:
            insights.append(f"Ownership is highly concentrated, with the top 3 holders controlling {concentration_pct}% of the MF share.")

        # Fetch Top 3 Holding Funds for the latest date
        cur.execute("""
            SELECT h.portfolio_weight_pct as weight, s.scheme_name as name
            FROM mf_historical_holdings h
            LEFT JOIN mf_scheme s ON h.scheme_id = s.id
            WHERE h.ticker = ? AND h.snapshot_date = ?
            ORDER BY h.portfolio_weight_pct DESC
            LIMIT 3
        """, (ticker, latest_date))
        top_holders = []
        for r in cur.fetchall():
            top_holders.append({
                "name": r['name'] or "Unknown Scheme",
                "weight": float(round(r['weight'] or 0.0, 2))
            })

        return {
            "latest_date": (latest_date[:10] if isinstance(latest_date, str) else latest_date.strftime('%Y-%m-%d')),
            "current_weight": round(current_weight, 2),
            "changes": {
                "1M": round(current_weight - (weight_1m or current_weight), 2) if weight_1m is not None else None,
                "3M": round(current_weight - (weight_3m or current_weight), 2) if weight_3m is not None else None,
                "6M": round(current_weight - (weight_6m or current_weight), 2) if weight_6m is not None else None,
                "12M": round(current_weight - (weight_12m or current_weight), 2) if weight_12m is not None else None,
            },
            "breadth": {
                "active_schemes": active_schemes,
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

def precalculate_all_mf_behavior(tickers: Optional[List[str]] = None):
    import json
    import logging
    
    logger = logging.getLogger("mf_behavior")
    logger.setLevel(logging.INFO)
    if not logger.handlers:
        ch = logging.StreamHandler()
        ch.setFormatter(logging.Formatter('%(asctime)s [%(levelname)s] %(message)s'))
        logger.addHandler(ch)

    logger.info("Starting Mutual Fund Behavior pre-calculation...")
    
    conn = get_connection()
    try:
        cur = conn.cursor()
        cur.execute("""
            CREATE TABLE IF NOT EXISTS mf_behavior (
                ticker TEXT PRIMARY KEY,
                data TEXT,
                updated_at TEXT DEFAULT (datetime('now'))
            )
        """)
            
        if tickers is not None:
            tickers_list = [t.upper().strip() for t in tickers]
        else:
            cur.execute("SELECT DISTINCT ticker FROM mf_historical_holdings")
            tickers_list = [r['ticker'] for r in cur.fetchall()]
            
        conn.commit()
    except Exception as e:
        conn.rollback()
        logger.error(f"Failed during initialization: {e}")
        conn.close()
        return

    total = len(tickers_list)
    logger.info(f"Pre-calculating MF Behavior for {total} tickers.")
    
    for i, ticker in enumerate(tickers_list, 1):
        try:
            res = analyze_mf_behavior(ticker)
            cur = conn.cursor()
            if res and "error" not in res:
                cur.execute("""
                    INSERT INTO mf_behavior (ticker, data, updated_at)
                    VALUES (?, ?, now())
                    ON CONFLICT (ticker) DO UPDATE 
                    SET data = EXCLUDED.data, updated_at = now()
                """, (ticker, json.dumps(res)))
            else:
                cur.execute("""
                    DELETE FROM mf_behavior WHERE ticker = ?
                """, (ticker,))
            conn.commit()
        except Exception as e:
            conn.rollback()
            logger.error(f"Failed to precalculate mf behavior for {ticker}: {e}")
        
        if i % 100 == 0:
            logger.info(f"Processed {i}/{total} tickers...")

    conn.close()
    logger.info("Mutual Fund Behavior pre-calculation completed.")

if __name__ == "__main__":
    import sys
    import json
    if len(sys.argv) > 1:
        res = analyze_mf_behavior(sys.argv[1])
        print(json.dumps(res, indent=2))

