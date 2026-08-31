import logging
import json
from engine.database.connection import get_db_connection

logger = logging.getLogger("bsa_options_analysis")

def analyze_options_chain(ticker: str) -> dict:
    """
    Analyzes option chain from `raw_fno_derivatives` to calculate:
    - ATM Strike
    - Support (strike with max Put volume)
    - Resistance (strike with max Call volume)
    - PCR (Put-Call Ratio)
    - Buildup classification
    """
    try:
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                # Fetch options rows
                cur.execute("""
                    SELECT strike_price, option_type, volume, ltp, underlying_price
                    FROM raw_fno_derivatives
                    WHERE ticker = %s
                    ORDER BY strike_price ASC
                """, (ticker,))
                rows = cur.fetchall()

        if not rows:
            return {
                "atm_strike": 0.0,
                "support": 0.0,
                "resistance": 0.0,
                "pcr": 1.0,
                "buildup": "Neutral",
                "insights": "No options chain data available."
            }

        spot = float(rows[0][4])
        
        # Aggregate Option volumes and locate active strikes
        ce_vol_total = 0
        pe_vol_total = 0
        
        max_ce_vol = -1
        max_pe_vol = -1
        
        resistance_strike = 0.0
        support_strike = 0.0
        
        # Calculate ATM strike
        # Find unique strikes
        strikes = sorted(list(set(float(r[0]) for r in rows)))
        atm_strike = min(strikes, key=lambda x: abs(x - spot))

        for strike, opt_type, vol, ltp, _ in rows:
            vol = int(vol or 0)
            if opt_type == "CE":
                ce_vol_total += vol
                if vol > max_ce_vol:
                    max_ce_vol = vol
                    resistance_strike = float(strike)
            elif opt_type == "PE":
                pe_vol_total += vol
                if vol > max_pe_vol:
                    max_pe_vol = vol
                    support_strike = float(strike)

        pcr = round(pe_vol_total / ce_vol_total, 2) if ce_vol_total > 0 else 1.0
        
        # Buildup logic
        if pcr > 1.25:
            buildup = "Long Buildup (Bullish Put Writing)"
            insight = f"High PCR of {pcr} indicates heavy put writing. Strong support pinned at ₹{support_strike}."
        elif pcr < 0.8:
            buildup = "Short Buildup (Bearish Call Writing)"
            insight = f"Low PCR of {pcr} indicates call writing overhead. Resistance at ₹{resistance_strike}."
        else:
            buildup = "Long Unwinding"
            insight = f"PCR is balanced at {pcr}. Rangebound pinning expected between ₹{support_strike} and ₹{resistance_strike}."

        return {
            "atm_strike": atm_strike,
            "support": support_strike,
            "resistance": resistance_strike,
            "pcr": pcr,
            "buildup": buildup,
            "insights": insight
        }

    except Exception as e:
        logger.error(f"Error conducting options chain analysis for {ticker}: {e}")
        return {
            "atm_strike": 0.0,
            "support": 0.0,
            "resistance": 0.0,
            "pcr": 1.0,
            "buildup": "Neutral",
            "insights": f"Options chain analysis error: {e}"
        }
