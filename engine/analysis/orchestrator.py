import logging
import json
from datetime import datetime
from engine.database.connection import get_db_connection
from engine.analysis.technical import analyze_technical
from engine.analysis.fundamental import analyze_fundamental
from engine.analysis.options import analyze_options_chain
from engine.analysis.footprint import analyze_footprint_and_news
from engine.analysis.projection import calculate_22d_projection
from engine.analysis.stocks_respecting_patterns import generate_stocks_respecting_patterns
from engine.analysis.sector_followers import generate_sector_followers_analysis
from engine.analysis.retracement import generate_retracement_speculator_analysis
from engine.analysis.patterns import scan_and_store_ticker_patterns
from engine.analysis.hhhl_scanner import scan_and_store_hhhl
from engine.analysis.cup_and_handle_scanner import scan_and_store_cup_and_handle
from engine.analysis.elliot import analyze_and_store_elliot

from engine.utils.logger import setup_logger

logger = setup_logger("bsa_orchestrator")

def _ensure_tables_exist(cur):
    cur.execute("""
        CREATE TABLE IF NOT EXISTS historical_calls (
            id SERIAL PRIMARY KEY,
            uniqueid TEXT,
            ticker TEXT NOT NULL,
            recommended_call TEXT,
            confidence DOUBLE PRECISION,
            cmp DOUBLE PRECISION,
            entry_price DOUBLE PRECISION,
            stop_loss DOUBLE PRECISION,
            target_price DOUBLE PRECISION,
            rr_ratio TEXT DEFAULT '1:2.00',
            status TEXT DEFAULT 'OPEN',
            timestamp TEXT,
            created_at TIMESTAMP DEFAULT now(),
            review_date DATE DEFAULT CURRENT_DATE,
            closed_at TIMESTAMP,
            final_cmp DOUBLE PRECISION,
            latest_cmp DOUBLE PRECISION,
            call_status TEXT DEFAULT 'OPEN',
            outcome TEXT DEFAULT 'OPEN',
            min_cmp DOUBLE PRECISION,
            max_cmp DOUBLE PRECISION,
            closest TEXT,
            closest_info TEXT
        );
        CREATE TABLE IF NOT EXISTS call_efficiency (
            ticker TEXT PRIMARY KEY REFERENCES ticker_master(ticker) ON DELETE CASCADE,
            total_calls INT DEFAULT 0,
            passed INT DEFAULT 0,
            failed INT DEFAULT 0,
            partial_success INT DEFAULT 0,
            partial_fail INT DEFAULT 0,
            success_rate_pct DOUBLE PRECISION DEFAULT 0.0,
            last_updated TIMESTAMP DEFAULT now()
        );
        CREATE TABLE IF NOT EXISTS intraday_call (
            id SERIAL PRIMARY KEY,
            uniqueid TEXT,
            ticker TEXT NOT NULL,
            signal TEXT,
            bet TEXT,
            confidence DOUBLE PRECISION,
            entry_price DOUBLE PRECISION,
            stop_loss DOUBLE PRECISION,
            target_price DOUBLE PRECISION,
            cmp DOUBLE PRECISION,
            actionable_insight TEXT,
            fo_buildup TEXT,
            tech_reason TEXT,
            analysed_at TIMESTAMP DEFAULT now(),
            pcr TEXT,
            support DOUBLE PRECISION,
            resistance DOUBLE PRECISION
        );
        CREATE TABLE IF NOT EXISTS cup_and_handle_scanner (
            ticker TEXT PRIMARY KEY REFERENCES ticker_master(ticker) ON DELETE CASCADE,
            is_active BOOLEAN DEFAULT False,
            pattern_start_date DATE,
            cup_bottom_date DATE,
            handle_start_date DATE,
            breakout_date DATE,
            breakout_price DOUBLE PRECISION,
            target_price DOUBLE PRECISION,
            stop_loss DOUBLE PRECISION,
            details JSONB,
            historical_patterns JSONB,
            last_updated TIMESTAMP DEFAULT now()
        );
    """)

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
                _ensure_tables_exist(cur)
                cur.execute("SELECT close FROM ohlcv_daily WHERE ticker = %s AND close IS NOT NULL ORDER BY trade_date DESC LIMIT 1", (ticker,))
                row = cur.fetchone()
                if row and row[0] is not None:
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
        
        try:
            scan_and_store_ticker_patterns(ticker)
        except Exception as pe:
            logger.error(f"Error scanning chart patterns for {ticker}: {pe}")
            
        try:
            analyze_and_store_elliot(ticker)
        except Exception as ee:
            logger.error(f"Error executing Elliot Wave analysis for {ticker}: {ee}")

        try:
            scan_and_store_hhhl(ticker)
        except Exception as he:
            logger.error(f"Error scanning HHHL for {ticker}: {he}")
            
        try:
            scan_and_store_cup_and_handle(ticker)
        except Exception as che:
            logger.error(f"Error scanning Cup and Handle for {ticker}: {che}")

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

        # JSON representations
        proj_json = json.dumps(proj_22d)
        opt_json = json.dumps(opt_res)
        foot_json = json.dumps(foot_res)

        # Database Deduplication check & Recommender Info
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                # Fetch recent broker recommendations to include in reasons
                try:
                    cur.execute("SELECT recommender, time_period FROM broker_recommendations WHERE ticker = %s ORDER BY rec_date DESC LIMIT 5", (ticker,))
                    recs = cur.fetchall()
                    if recs:
                        unique_recs = []
                        seen = set()
                        for r in recs:
                            if r[0] and r[0] not in seen:
                                seen.add(r[0])
                                period_str = f" for {r[1]}" if r[1] else ""
                                unique_recs.append(f"{r[0]}{period_str}")
                        if unique_recs:
                            reasons_list.append(f"Recommended by: {', '.join(unique_recs)}")
                except Exception:
                    conn.rollback()

                reasons_str = "; ".join(filter(None, reasons_list))

                cur.execute("""
                    SELECT close, hybrid_score, overall_signal
                    FROM analysis_summaries
                    WHERE ticker = %s
                """, (ticker,))
                prev_record = cur.fetchone()
                
                should_update_summary = True
                if prev_record:
                    prev_close, prev_hybrid, prev_signal = prev_record
                    if (prev_close and abs(prev_close - close) < 0.01 and 
                        prev_hybrid and abs(prev_hybrid - hybrid_score) < 0.01 and 
                        prev_signal == signal):
                        should_update_summary = False

                if should_update_summary:
                    # Upsert records in analysis_summaries (live current analysis state)
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

                # ── Persistent Historical Call Lifecycle & Efficiency Tracking ────────
                # Check for an active OPEN call for this ticker
                cur.execute("""
                    SELECT id, recommended_call, entry_price, stop_loss, target_price, created_at, min_cmp, max_cmp
                    FROM historical_calls
                    WHERE ticker = %s AND status = 'OPEN'
                    ORDER BY created_at DESC LIMIT 1
                """, (ticker,))
                active_call = cur.fetchone()

                now = datetime.now()

                if active_call:
                    call_id, rec_call, entry_price, stop_loss, target_price, created_at, prev_min, prev_max = active_call
                    entry_price = float(entry_price)
                    stop_loss = float(stop_loss)
                    target_price = float(target_price)

                    # Update lowest and highest CMP recorded over 30-day lifecycle
                    new_min = min(float(prev_min), close) if prev_min is not None else close
                    new_max = max(float(prev_max), close) if prev_max is not None else close

                    # Calculate call age in days (30 calendar days = 22 trading days horizon)
                    days_active = (now - created_at).days if created_at else 0
                    
                    is_closed = False
                    outcome = "OPEN"

                    if rec_call in ("BUY", "STRONG BUY"):
                        csl = new_min  # Closest to Stop Loss (lowest CMP during lifecycle)
                        ctl = new_max  # Closest to Target Price (highest CMP during lifecycle)
                        
                        dist_sl = abs(csl - stop_loss)
                        dist_tgt = abs(target_price - ctl)

                        if close >= target_price or ctl >= target_price:
                            is_closed, outcome = True, "PASSED"
                        elif close <= stop_loss or csl <= stop_loss:
                            is_closed, outcome = True, "FAILED"
                        elif days_active >= 30:
                            is_closed = True
                            # Balancer rule: if (Stop - CSL) < (Target - CTL) => Partial Fail else Partial Pass
                            if dist_sl < dist_tgt:
                                outcome = "PARTIAL FAIL"
                            else:
                                outcome = "PARTIAL SUCCESS"
                        
                        csl_pct = round(abs((csl - entry_price) / entry_price) * 100, 1)
                        ctl_pct = round(abs((ctl - entry_price) / entry_price) * 100, 1)
                        closest_str = f"(CSL: {csl_pct}%, CTL: {ctl_pct}%)"

                    else: # SELL / STRONG SELL
                        csl = new_max  # For short sell, highest CMP is closest to Stop Loss
                        ctl = new_min  # For short sell, lowest CMP is closest to Target Price

                        dist_sl = abs(stop_loss - csl)
                        dist_tgt = abs(ctl - target_price)

                        if close <= target_price or ctl <= target_price:
                            is_closed, outcome = True, "PASSED"
                        elif close >= stop_loss or csl >= stop_loss:
                            is_closed, outcome = True, "FAILED"
                        elif days_active >= 30:
                            is_closed = True
                            if dist_sl < dist_tgt:
                                outcome = "PARTIAL FAIL"
                            else:
                                outcome = "PARTIAL SUCCESS"

                        csl_pct = round(abs((csl - entry_price) / entry_price) * 100, 1)
                        ctl_pct = round(abs((ctl - entry_price) / entry_price) * 100, 1)
                        closest_str = f"(CSL: {csl_pct}%, CTL: {ctl_pct}%)"

                    # Update call record with min/max CMP and closest info
                    cur.execute("""
                        UPDATE historical_calls
                        SET min_cmp = %s, max_cmp = %s, closest_info = %s,
                            status = CASE WHEN %s::boolean THEN 'CLOSED' ELSE status END,
                            closed_at = CASE WHEN %s::boolean THEN NOW() ELSE closed_at END,
                            final_cmp = CASE WHEN %s::boolean THEN %s ELSE final_cmp END,
                            outcome = %s
                        WHERE id = %s
                    """, (new_min, new_max, closest_str, is_closed, is_closed, is_closed, close, outcome, call_id))

                # If no active OPEN call exists and signal is actionable, snapshot a NEW persistent call
                if not active_call and signal in ("BUY", "STRONG BUY", "SELL", "STRONG SELL"):
                    if signal in ("BUY", "STRONG BUY"):
                        sl = round(close * 0.96, 2)   # 4% Stop Loss
                        tgt = round(close * 1.08, 2)  # 8% Target Price
                    else:
                        sl = round(close * 1.04, 2)
                        tgt = round(close * 0.92, 2)

                    cur.execute("""
                        INSERT INTO historical_calls (
                            ticker, recommended_call, confidence, entry_price, stop_loss, target_price,
                            rr_ratio, status, created_at, review_date, outcome, min_cmp, max_cmp, closest_info
                        ) VALUES (%s, %s, %s, %s, %s, %s, '1:2.00', 'OPEN', NOW(), CURRENT_DATE, 'OPEN', %s, %s, '(CSL: 0.0%%, CTL: 0.0%%)')
                    """, (ticker, signal, confidence, close, sl, tgt, close, close))

                # Recompute Call Efficiency Statistics per Ticker
                cur.execute("""
                    SELECT 
                        COUNT(*) AS total_calls,
                        COUNT(CASE WHEN outcome = 'PASSED' THEN 1 END) AS passed,
                        COUNT(CASE WHEN outcome = 'FAILED' THEN 1 END) AS failed,
                        COUNT(CASE WHEN outcome = 'PARTIAL SUCCESS' THEN 1 END) AS partial_success,
                        COUNT(CASE WHEN outcome = 'PARTIAL FAIL' THEN 1 END) AS partial_fail
                    FROM historical_calls
                    WHERE ticker = %s
                """, (ticker,))
                eff = cur.fetchone()
                if eff and eff[0] > 0:
                    tot, p, f, ps, pf = eff
                    succ_rate = round(((p + (ps * 0.5)) / tot) * 100, 1)
                    cur.execute("""
                        INSERT INTO call_efficiency (
                            ticker, total_calls, passed, failed, partial_success, partial_fail, success_rate_pct, last_updated
                        ) VALUES (%s, %s, %s, %s, %s, %s, %s, NOW())
                        ON CONFLICT (ticker) DO UPDATE SET
                            total_calls = EXCLUDED.total_calls,
                            passed = EXCLUDED.passed,
                            failed = EXCLUDED.failed,
                            partial_success = EXCLUDED.partial_success,
                            partial_fail = EXCLUDED.partial_fail,
                            success_rate_pct = EXCLUDED.success_rate_pct,
                            last_updated = NOW()
                    """, (ticker, tot, p, f, ps, pf, succ_rate))

                conn.commit()
        return True

    except Exception as e:
        logger.error(f"Error orchestrating analysis for {ticker}: {e}")
        return False

from engine.utils.checkpoint import get_completed_tickers, mark_ticker_completed

def analyze_all_tickers(max_workers: int = 8, progress_callback=None, resume: bool = True, tickers: list = None):
    """Orchestrates analysis sequentially or concurrently for all tickers in database (or specified tickers list)."""
    import time
    all_tickers = []
    if tickers is not None:
        all_tickers = [t.upper().strip() for t in tickers]
    else:
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT ticker FROM ticker_master")
                all_tickers = [row[0] for row in cur.fetchall()]

    if not all_tickers:
        logger.warning("No tickers found to analyze.")
        return

    completed_set = get_completed_tickers("analysis", valid_tickers=all_tickers) if resume else set()
    pending_tickers = [t for t in all_tickers if t not in completed_set]

    start_time = time.time()
    logger.info(f"Starting analysis process. Total: {len(all_tickers)}, Completed: {len(completed_set)}, Pending: {len(pending_tickers)}")

    if not pending_tickers:
        logger.info("All tickers already analyzed!")
        return

    success_count = len(completed_set)
    from concurrent.futures import ThreadPoolExecutor, as_completed

    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        futures = {executor.submit(analyze_and_summarize_ticker, ticker): ticker for ticker in pending_tickers}
        for i, future in enumerate(as_completed(futures), 1):
            t = futures[future]
            res = future.result()
            if res:
                success_count += 1
                mark_ticker_completed("analysis", t)
            if progress_callback:
                progress_callback(t, res)
            else:
                logger.debug(f"[{i}/{len(pending_tickers)}] Analyzed {t}: {'Success' if res else 'Failed'}")

    elapsed = time.time() - start_time
    failed_count = len(all_tickers) - success_count
    logger.info(f"Core Ticker Analysis completed. Total: {len(all_tickers)}, Succeeded: {success_count}, Failed: {failed_count}, Time Taken: {elapsed:.2f}s")

