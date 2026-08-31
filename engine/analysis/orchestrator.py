import logging
import json
from datetime import datetime
from engine.database.connection import get_db_connection
from engine.analysis.technical import analyze_technical
from engine.analysis.fundamental import analyze_fundamental
from engine.analysis.options import analyze_options_chain
from engine.analysis.footprint import analyze_footprint_and_news
from engine.analysis.projection import calculate_22d_projection

logger = logging.getLogger("bsa_orchestrator")

def analyze_and_summarize_ticker(ticker: str) -> bool:
    """
    Executes full analysis (Technical, Fundamental, Options, Footprint, Projections)
    for a single ticker and saves the summarized statistical outputs to database.
    Enforces deduplication rules.
    """
    try:
        # Get latest close price
        close = 0.0
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT close FROM ohlcv_daily WHERE ticker = %s ORDER BY trade_date DESC LIMIT 1", (ticker,))
                row = cur.fetchone()
                if row:
                    close = float(row[0])
                
                # Check F&O eligibility
                cur.execute("SELECT is_fno FROM ticker_master WHERE ticker = %s", (ticker,))
                fno_row = cur.fetchone()
                is_fno = fno_row[0] if fno_row else False

        if close <= 0.0:
            logger.warning(f"No price data available for {ticker}, skipping analysis.")
            return False

        # Run analysis modules
        tech_res = analyze_technical(ticker)
        fund_res = analyze_fundamental(ticker)
        foot_res = analyze_footprint_and_news(ticker)
        
        opt_res = analyze_options_chain(ticker)
        proj_22d = calculate_22d_projection(ticker, tech_res["score"])

        # Compute aggregate scores
        # Behavioral score based on news sentiment and accumulation index
        behavioral_score = round((foot_res["sentiment_score"] * 0.4) + ((foot_res["accumulation_score"] - 50.0) / 50.0 * 0.6), 2)
        
        # Hybrid score = 50% Technical + 50% Behavioral
        hybrid_score = round((tech_res["score"] * 0.5) + (behavioral_score * 0.5), 2)
        
        # Signal and confidence
        if hybrid_score >= 0.25:
            signal = "BUY"
            confidence = round(hybrid_score * 100, 1)
        elif hybrid_score <= -0.25:
            signal = "SELL"
            confidence = round(abs(hybrid_score) * 100, 1)
        else:
            signal = "HOLD"
            confidence = round((1.0 - abs(hybrid_score)) * 100, 1)

        # Reasons breakdown
        reasons_list = tech_res["reasons"] + fund_res["reasons"] + [foot_res["insight"]]
        reasons_str = "; ".join(reasons_list)

        # JSON representations
        proj_json = json.dumps(proj_22d)
        opt_json = json.dumps(opt_res)
        foot_json = json.dumps(foot_res)

        # Database Deduplication check
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("""
                    SELECT close, hybrid_score, overall_signal
                    FROM analysis_summaries
                    WHERE ticker = %s
                """, (ticker,))
                prev_record = cur.fetchone()
                
                if prev_record:
                    prev_close, prev_hybrid, prev_signal = prev_record
                    # If close and scores are identical, skip updating database (Deduplication Rule)
                    if (prev_close and abs(prev_close - close) < 0.01 and 
                        prev_hybrid and abs(prev_hybrid - hybrid_score) < 0.01 and 
                        prev_signal == signal):
                        logger.info(f"Deduplication rule: Skipping identical analysis summary for {ticker}.")
                        return True

                # Upsert records
                cur.execute("""
                    INSERT INTO analysis_summaries (
                        ticker, close, technical_score, fundamental_score, behavioral_score,
                        hybrid_score, overall_signal, confidence, reasons, projection_22d,
                        option_insights, news_footprint, updated_at
                    ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, now())
                    ON CONFLICT (ticker) DO UPDATE SET
                        close = EXCLUDED.close,
                        technical_score = EXCLUDED.technical_score,
                        fundamental_score = EXCLUDED.fundamental_score,
                        behavioral_score = EXCLUDED.behavioral_score,
                        hybrid_score = EXCLUDED.hybrid_score,
                        overall_signal = EXCLUDED.overall_signal,
                        confidence = EXCLUDED.confidence,
                        reasons = EXCLUDED.reasons,
                        projection_22d = EXCLUDED.projection_22d,
                        option_insights = EXCLUDED.option_insights,
                        news_footprint = EXCLUDED.news_footprint,
                        updated_at = now()
                """, (
                    ticker, close, tech_res["score"], fund_res["score"], behavioral_score,
                    hybrid_score, signal, confidence, reasons_str, proj_json, opt_json, foot_json
                ))
                conn.commit()
        return True

    except Exception as e:
        logger.error(f"Error orchestrating analysis for {ticker}: {e}")
        return False

def analyze_all_tickers(max_workers: int = 8):
    """Orchestrates analysis sequentially or concurrently for all tickers in database."""
    import time
    tickers = []
    with get_db_connection() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT ticker FROM ticker_master")
            tickers = [row[0] for row in cur.fetchall()]

    if not tickers:
        logger.warning("No tickers found to analyze.")
        return

    start_time = time.time()
    logger.info(f"Starting analysis process for {len(tickers)} tickers...")
    success_count = 0
    for i, ticker in enumerate(tickers, 1):
        res = analyze_and_summarize_ticker(ticker)
        if res:
            success_count += 1
        logger.info(f"[{i}/{len(tickers)}] Analyzed {ticker}: {'Success' if res else 'Failed'}")
        
    elapsed = time.time() - start_time
    failed_count = len(tickers) - success_count
    logger.info(f"Analysis process completed. Attempted: {len(tickers)}, Succeeded: {success_count}, Failed: {failed_count}, Time Taken: {elapsed:.2f}s")
