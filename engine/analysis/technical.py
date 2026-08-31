import logging
from engine.database.connection import get_db_connection

logger = logging.getLogger("bsa_technical_analysis")

def analyze_technical(ticker: str) -> dict:
    """
    Computes technical score between -1.0 and 1.0 based on latest daily indicators.
    Returns:
        dict: {"score": float, "reasons": list of str}
    """
    reasons = []
    score = 0.0
    
    try:
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                # Get the latest indicators
                cur.execute("""
                    SELECT rsi14, sma20, sma50, ema12, ema26, macd_line, macd_signal, 
                           bb_upper, bb_mid, bb_lower, tenkan_sen, kijun_sen, span_a, span_b
                    FROM indicators_daily
                    WHERE ticker = %s
                    ORDER BY trade_date DESC LIMIT 1
                """, (ticker,))
                ind_row = cur.fetchone()
                
                # Get the latest price
                cur.execute("""
                    SELECT close
                    FROM ohlcv_daily
                    WHERE ticker = %s
                    ORDER BY trade_date DESC LIMIT 1
                """, (ticker,))
                price_row = cur.fetchone()
                
        if not ind_row or not price_row:
            return {"score": 0.0, "reasons": ["No technical data available"]}
            
        close = float(price_row[0])
        rsi, sma20, sma50, ema12, ema26, macd_l, macd_s, bb_u, bb_m, bb_l, tenkan, kijun, span_a, span_b = [
            float(x) if x is not None else None for x in ind_row
        ]
        
        # RSI Check
        if rsi is not None:
            if rsi < 30:
                score += 0.3
                reasons.append("RSI is oversold (< 30)")
            elif rsi > 70:
                score -= 0.3
                reasons.append("RSI is overbought (> 70)")
            elif 45 <= rsi <= 60:
                score += 0.1
                reasons.append("RSI in bullish momentum zone (45-60)")
                
        # Moving Averages Check
        if sma20 and sma50:
            if close > sma20:
                score += 0.2
            else:
                score -= 0.2
            if sma20 > sma50:
                score += 0.2
                reasons.append("SMA Golden crossover (20 > 50)")
            else:
                score -= 0.2
                reasons.append("SMA Death crossover (20 < 50)")
                
        # MACD Crossover Check
        if macd_l is not None and macd_s is not None:
            if macd_l > macd_s:
                score += 0.15
                reasons.append("MACD Bullish crossover")
            else:
                score -= 0.15
                reasons.append("MACD Bearish crossover")
                
        # Bollinger Bands Check
        if bb_u and bb_l and bb_m:
            bb_width = bb_u - bb_l
            if bb_width > 0:
                pct = (close - bb_l) / bb_width
                if pct < 0.15:
                    score += 0.2
                    reasons.append("Price near lower Bollinger Band")
                elif pct > 0.85:
                    score -= 0.2
                    reasons.append("Price near upper Bollinger Band")
                    
        # Ichimoku Cloud Check
        if span_a and span_b:
            cloud_top = max(span_a, span_b)
            cloud_bottom = min(span_a, span_b)
            if close > cloud_top:
                score += 0.25
                reasons.append("Price is above Ichimoku Cloud")
            elif close < cloud_bottom:
                score -= 0.25
                reasons.append("Price is below Ichimoku Cloud")
                
        # Normalize score between -1.0 and 1.0
        final_score = round(max(-1.0, min(1.0, score)), 2)
        return {"score": final_score, "reasons": reasons}
        
    except Exception as e:
        logger.error(f"Error executing technical analysis for {ticker}: {e}")
        return {"score": 0.0, "reasons": [f"Technical analysis error: {e}"]}
