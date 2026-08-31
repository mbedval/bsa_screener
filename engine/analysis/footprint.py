import logging
import yfinance as yf
from datetime import datetime
from engine.database.connection import get_db_connection
from engine.utils.helpers import format_ticker

logger = logging.getLogger("bsa_footprint_analysis")

def analyze_footprint_and_news(ticker: str) -> dict:
    """
    Analyzes volume profiles for smart money footprint:
    - Phase: Accumulation (volume spike on +ve close), Distribution (volume spike on -ve close)
    - News Sentiment: parsed news headlines from yfinance ticker object.
    """
    formatted = format_ticker(ticker)
    sentiment_score = 0.0
    sentiment_label = "Neutral"
    accumulation_score = 50
    distribution_score = 50
    phase = "Markup"
    
    try:
        # 1. Fetch News & Sentiment from yfinance
        try:
            tk = yf.Ticker(formatted)
            news = tk.news or []
            positive_words = {"growth", "rise", "surge", "up", "profit", "gain", "buy", "bullish", "record"}
            negative_words = {"fall", "drop", "down", "loss", "decline", "sell", "bearish", "slump", "debt"}
            
            hits_pos = 0
            hits_neg = 0
            
            for item in news:
                title = item.get("title", "").lower()
                for w in title.split():
                    if w in positive_words:
                        hits_pos += 1
                    elif w in negative_words:
                        hits_neg += 1
                        
            total = hits_pos + hits_neg
            if total > 0:
                sentiment_score = (hits_pos - hits_neg) / total
                if sentiment_score > 0.2:
                    sentiment_label = "Bullish"
                elif sentiment_score < -0.2:
                    sentiment_label = "Bearish"
        except Exception as e:
            logger.debug(f"Failed to fetch news for {ticker}: {e}")

        # 2. Footprint / Volume Anomalies
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                # Fetch recent candles
                cur.execute("""
                    SELECT close, volume
                    FROM ohlcv_daily
                    WHERE ticker = %s
                    ORDER BY trade_date DESC LIMIT 20
                """, (ticker,))
                rows = cur.fetchall()

        if rows and len(rows) >= 5:
            latest_close, latest_vol = float(rows[0][0]), int(rows[0][1])
            prev_close = float(rows[1][0])
            avg_vol = sum(int(r[1]) for r in rows[1:]) / len(rows[1:])
            
            price_up = latest_close > prev_close
            
            if avg_vol > 0:
                vol_ratio = latest_vol / avg_vol
                if vol_ratio > 1.5:
                    if price_up:
                        phase = "Accumulation"
                        accumulation_score = min(100, int(50 + 20 * vol_ratio))
                        distribution_score = max(0, int(50 - 10 * vol_ratio))
                    else:
                        phase = "Distribution"
                        distribution_score = min(100, int(50 + 20 * vol_ratio))
                        accumulation_score = max(0, int(50 - 10 * vol_ratio))
                else:
                    phase = "Markup" if price_up else "Markdown"

        return {
            "phase": phase,
            "accumulation_score": accumulation_score,
            "distribution_score": distribution_score,
            "sentiment_score": round(sentiment_score, 2),
            "sentiment_label": sentiment_label,
            "insight": f"Smart Money Phase: {phase} with {sentiment_label} news sentiment."
        }

    except Exception as e:
        logger.error(f"Error conducting footprint analysis for {ticker}: {e}")
        return {
            "phase": "Unknown",
            "accumulation_score": 50,
            "distribution_score": 50,
            "sentiment_score": 0.0,
            "sentiment_label": "Neutral",
            "insight": f"Footprint analysis error: {e}"
        }
