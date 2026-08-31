import logging
from engine.database.connection import get_db_connection

logger = logging.getLogger("bsa_fundamental_analysis")

def analyze_fundamental(ticker: str) -> dict:
    """
    Retrieves fundamental score and details from DB for a given ticker.
    Returns:
        dict: {"score": float, "reasons": list of str}
    """
    reasons = []
    try:
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("""
                    SELECT fundamental_score, is_pat_growing, is_other_income_ok, is_pe_ok, is_debt_equity_ok, current_pe, debt_to_equity
                    FROM fundamentals
                    WHERE ticker = %s
                    ORDER BY fetched_date DESC LIMIT 1
                """, (ticker,))
                row = cur.fetchone()
                
        if not row:
            return {"score": 0.5, "reasons": ["No fundamental records found"]}
            
        score_100, is_pat_grow, other_inc_ok, pe_ok, debt_ok, current_pe, d_e = row
        score = float(score_100) / 100.0
        
        if is_pat_grow:
            reasons.append("Profit After Tax (PAT) is growing YoY")
        else:
            reasons.append("PAT growth is slowing/flat")
            
        if other_inc_ok:
            reasons.append("Other income is in safe limits (<= 5% of average PAT)")
        else:
            reasons.append("High non-operating other income detected")
            
        if pe_ok:
            reasons.append(f"PE ratio (current: {current_pe}) is within safe range")
        else:
            reasons.append(f"PE ratio (current: {current_pe}) is overvalued")
            
        if debt_ok:
            reasons.append(f"Debt-to-equity ratio ({d_e}) is healthy")
        else:
            reasons.append(f"High leverage (D/E: {d_e}) detected")
            
        return {"score": score, "reasons": reasons}
        
    except Exception as e:
        logger.error(f"Error conducting fundamental analysis for {ticker}: {e}")
        return {"score": 0.5, "reasons": [f"Fundamental analysis error: {e}"]}
