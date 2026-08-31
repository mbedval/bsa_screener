import logging
import random
from engine.database.connection import get_db_connection

logger = logging.getLogger("bsa_projection_analysis")

def calculate_22d_projection(ticker: str, tech_score: float) -> list:
    """
    Simulates a 22-day daily closing price projection using trend and volatility (ATR).
    Returns a list of 22 floats.
    """
    try:
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                # Get latest close price
                cur.execute("""
                    SELECT close FROM ohlcv_daily
                    WHERE ticker = %s
                    ORDER BY trade_date DESC LIMIT 1
                """, (ticker,))
                price_row = cur.fetchone()
                
                # Get latest ATR
                cur.execute("""
                    SELECT atr14 FROM indicators_daily
                    WHERE ticker = %s
                    ORDER BY trade_date DESC LIMIT 1
                """, (ticker,))
                ind_row = cur.fetchone()

        if not price_row:
            return []

        cmp = float(price_row[0])
        atr = float(ind_row[0]) if ind_row and ind_row[0] else (cmp * 0.02) # Fallback to 2% ATR
        
        # Drift factor based on technical score
        # A score of +1.0 moves price up by ~1.5 ATRs over 22 days
        total_drift = tech_score * 1.5 * atr
        daily_drift = total_drift / 22.0
        
        projection = []
        current_val = cmp
        
        # Seed random to ensure consistency if run twice on same close/CMP
        random.seed(int(cmp * 100))
        
        for i in range(1, 23):
            # Drift + daily random noise (scaled by ATR)
            noise = random.normalvariate(0, atr * 0.15)
            current_val += daily_drift + noise
            projection.append(round(max(1.0, current_val), 2))
            
        return projection

    except Exception as e:
        logger.error(f"Error calculating 22-day projection for {ticker}: {e}")
        return []
