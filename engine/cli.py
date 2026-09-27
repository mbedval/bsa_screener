#!/usr/bin/env python3
import sys
import argparse
import logging
import time
from pathlib import Path
from dotenv import load_dotenv

# Add the parent directory of engine/ to path to allow absolute imports
ROOT_DIR = Path(__file__).resolve().parent.parent
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from engine.utils.logger import setup_logger
from engine.downloaders.market_data import download_all_tickers, download_ticker_data
from engine.downloaders.derivatives import download_all_derivatives, download_and_insert_derivatives
from engine.analysis.orchestrator import analyze_all_tickers, analyze_and_summarize_ticker
from engine.reports.html_generator import generate_html_report
from engine.reports.pdf_generator import generate_pdf_report
from engine.downloaders.mutual_fund import download_all_mf_holdings, download_mf_holdings_for_ticker

logger = setup_logger("bsa_cli")

def main():
    parser = argparse.ArgumentParser(description="BSA Consolidated Analysis & Processing Engine")
    parser.add_argument("--mode", choices=[
        "download-all", "download-spot", "download-mf", "download-fno",
        "analyze-all", "analyze-technical", "analyze-fundamental", "analyze-fo",
        "analyze-patterns", "analyze-mf", "analyze-elliot", "analyze-sector", "analyze-summaries",
        "full-pipeline", "news-analyze", "backup", "mutualfund"
    ], help="Pipeline batch operation mode")
    parser.add_argument("--ticker", type=str, help="Execute download and analysis on-demand for a single ticker")
    parser.add_argument("--report", type=str, help="Generate report for a specific ticker")
    parser.add_argument("--pdf", action="store_true", help="Explicitly opt-in to generate PDF report alongside HTML")

    parser.add_argument("--resume", "-r", action="store_true", help="Resume operation from last completed checkpoint")
    parser.add_argument("--fresh", "-f", action="store_true", help="Restart operation fresh from item 1, clearing previous checkpoint")
    parser.add_argument("--force", action="store_true", help="Force full re-download of price and fundamentals even if already up-to-date")

    args = parser.parse_args()

    if not args.mode and not args.ticker and not args.report:
        parser.print_help()
        sys.exit(1)

    load_dotenv()

    from engine.database.connection import get_db_connection
    from engine.utils.progress import create_phase_progress
    from engine.utils.checkpoint import get_completed_tickers, clear_phase_checkpoint
    from engine.utils.helpers import get_spot_tickers, get_fno_tickers

    def resolve_resume_flag(phase_name: str, phase_key: str, total_count: int, valid_tickers=None) -> bool:
        if args.fresh or args.force:
            logger.info(f"Clearing checkpoint for {phase_name} and starting fresh...")
            clear_phase_checkpoint(phase_key)
            return False

        completed = get_completed_tickers(phase_key, valid_tickers=valid_tickers)
        if not completed:
            return True
        if len(completed) >= total_count:
            return True

        if args.resume:
            logger.info(f"Resuming {phase_name} from checkpoint ({len(completed)}/{total_count} already completed).")
            return True

        if sys.stdin.isatty():
            try:
                print(f"\n[?] Incomplete work found for {phase_name}: {len(completed)}/{total_count} completed.")
                choice = input("    Should we download all [y] or resume from last checkpoint [r]? (y/r): ").strip().lower()
                if choice == "y":
                    logger.info(f"User requested fresh run ('y'). Clearing checkpoint for {phase_name}...")
                    clear_phase_checkpoint(phase_key)
                    return False
                else:
                    logger.info(f"User requested resume ('r'). Resuming {phase_name}...")
                    return True
            except Exception:
                return True

        # Non-interactive default without --resume flag: start fresh
        logger.info(f"Incomplete checkpoint found for {phase_name} ({len(completed)}/{total_count} completed). Starting fresh...")
        clear_phase_checkpoint(phase_key)
        return False

    # ── Phase 1: Raw Data Ingestion Sub-Runners ──────────────────────────────
    def run_phase_1_1():
        p_start = time.time()
        logger.info("=== Phase 1.1: Spot Data Download (Master Price & Fundamentals) ===")
        valid_tickers = get_spot_tickers()
        total = len(valid_tickers)
        resume = resolve_resume_flag("Phase 1.1 (Download Spot)", "spot_download", total, valid_tickers=valid_tickers)
        completed = get_completed_tickers("spot_download", valid_tickers=valid_tickers) if resume else set()
        pending_count = max(total - len(completed), 0)
        if pending_count == 0 and total > 0:
            logger.info(f"All {total} items for Phase 1.1 (Download Spot) are already completed. Use --fresh or --force to re-download.")
        else:
            progress, task_id = create_phase_progress(1, "Download Spot", pending_count if resume else total)
            with progress:
                def cb(ticker, status, advance=1):
                    if ticker is not None:
                        progress.update(task_id, advance=advance)
                download_all_tickers(progress_callback=cb, resume=resume, force=args.force)
        p_elapsed = time.time() - p_start
        logger.info(f"[✓] Phase 1.1 (Download Spot) completed in {p_elapsed:.2f}s.")

    def run_phase_1_2():
        p_start = time.time()
        logger.info("=== Phase 1.2: Mutual Fund & FII Holdings Download ===")
        from engine.downloaders.mutual_fund import ensure_mf_fii_tables_exist, download_all_fii_holdings
        ensure_mf_fii_tables_exist()
        total_tickers = len(get_spot_tickers())
        total_items = total_tickers * 2  # MF holdings (total_tickers) + FII holdings (total_tickers)
        progress, task_id = create_phase_progress(1, "Download MF & FII", total_items)
        with progress:
            def cb(current, total, ticker, count):
                progress.update(task_id, advance=1)
            download_all_mf_holdings(progress_callback=cb)
            download_all_fii_holdings(progress_callback=cb)
        p_elapsed = time.time() - p_start
        logger.info(f"[✓] Phase 1.2 (Download MF & FII) completed in {p_elapsed:.2f}s.")

    def run_phase_1_3():
        p_start = time.time()
        logger.info("=== Phase 1.3: F&O Derivatives Download ===")
        valid_tickers = get_fno_tickers()
        total = len(valid_tickers)
        resume = resolve_resume_flag("Phase 1.3 (Download F&O)", "fno_download", total, valid_tickers=valid_tickers)
        completed = get_completed_tickers("fno_download", valid_tickers=valid_tickers) if resume else set()
        pending_count = max(total - len(completed), 0)
        if pending_count == 0 and total > 0:
            logger.info(f"All {total} items for Phase 1.3 (Download F&O) are already completed. Use --fresh to re-download.")
        else:
            progress, task_id = create_phase_progress(1, "Download F&O", pending_count if resume else total)
            with progress:
                def cb(ticker, status, advance=1):
                    if ticker is not None:
                        progress.update(task_id, advance=advance)
                download_all_derivatives(progress_callback=cb, resume=resume)
        p_elapsed = time.time() - p_start
        logger.info(f"[✓] Phase 1.3 (Download F&O) completed in {p_elapsed:.2f}s.")

    def run_phase_1():
        p_start = time.time()
        logger.info("=== Starting Phase 1: Consolidated Raw Data Ingestion Pipeline ===")
        run_phase_1_1()
        run_phase_1_2()
        run_phase_1_3()
        p_elapsed = time.time() - p_start
        logger.info(f"[✓] Phase 1 (Raw Data Ingestion) fully completed in {p_elapsed:.2f}s.")

    # ── Phase 2: Multi-Factor Scoring & Analysis Sub-Runners ────────────────
    def run_phase_2_1():
        p_start = time.time()
        logger.info("[Sub-task 2.1/2.8] Starting Technical Analysis & Scanners (HHHL, Cup & Handle, Retracement)...")
        valid_tickers = get_spot_tickers()
        from engine.analysis.hhhl_scanner import scan_and_store_hhhl
        from engine.analysis.cup_and_handle_scanner import scan_and_store_cup_and_handle
        from engine.analysis.retracement import generate_retracement_speculator_analysis
        
        progress, task_id = create_phase_progress(2, "Analyze Technical", len(valid_tickers))
        with progress:
            for t in valid_tickers:
                try:
                    scan_and_store_hhhl(t)
                    scan_and_store_cup_and_handle(t)
                except Exception as e:
                    logger.error(f"Error in technical scanning for {t}: {e}")
                progress.update(task_id, advance=1)
        
        try:
            generate_retracement_speculator_analysis()
        except Exception as e:
            logger.error(f"Error running Retracement Speculator Analysis: {e}")
            
        p_elapsed = time.time() - p_start
        logger.info(f"[Sub-task 2.1/2.8] Technical Analysis completed in {p_elapsed:.2f}s.")

    def run_phase_2_2():
        p_start = time.time()
        logger.info("[Sub-task 2.2/2.8] Starting Fundamental Analysis (PAT Growth, PE, Debt/Equity)...")
        valid_tickers = get_spot_tickers()
        from engine.analysis.fundamental import analyze_fundamental
        progress, task_id = create_phase_progress(2, "Analyze Fundamental", len(valid_tickers))
        with progress:
            for t in valid_tickers:
                try:
                    analyze_fundamental(t)
                except Exception as e:
                    logger.error(f"Error in fundamental analysis for {t}: {e}")
                progress.update(task_id, advance=1)
        p_elapsed = time.time() - p_start
        logger.info(f"[Sub-task 2.2/2.8] Fundamental Analysis completed in {p_elapsed:.2f}s.")

    def run_phase_2_3():
        p_start = time.time()
        logger.info("[Sub-task 2.3/2.8] Starting F&O Derivative Options Analysis (PCR, Max Pain, Active Buildup)...")
        fno_tickers = get_fno_tickers()
        from engine.analysis.options import analyze_options_chain
        progress, task_id = create_phase_progress(2, "Analyze F&O Options", len(fno_tickers))
        with progress:
            for t in fno_tickers:
                try:
                    analyze_options_chain(t)
                except Exception as e:
                    logger.error(f"Error analyzing F&O options for {t}: {e}")
                progress.update(task_id, advance=1)
        p_elapsed = time.time() - p_start
        logger.info(f"[Sub-task 2.3/2.8] F&O Derivative Options Analysis completed in {p_elapsed:.2f}s.")

    def run_phase_2_4():
        p_start = time.time()
        logger.info("[Sub-task 2.4/2.8] Starting Candlestick Chart Pattern Scanning & Respecting Patterns Analysis...")
        valid_tickers = get_spot_tickers()
        from engine.analysis.patterns import scan_and_store_ticker_patterns
        from engine.analysis.stocks_respecting_patterns import generate_stocks_respecting_patterns
        progress, task_id = create_phase_progress(2, "Analyze Patterns", len(valid_tickers))
        with progress:
            for t in valid_tickers:
                try:
                    scan_and_store_ticker_patterns(t)
                except Exception as e:
                    logger.error(f"Error scanning chart patterns for {t}: {e}")
                progress.update(task_id, advance=1)
        try:
            generate_stocks_respecting_patterns()
        except Exception as e:
            logger.error(f"Error running Stocks Respecting Patterns: {e}")
        p_elapsed = time.time() - p_start
        logger.info(f"[Sub-task 2.4/2.8] Chart Pattern Analysis completed in {p_elapsed:.2f}s.")

    def run_phase_2_5():
        p_start = time.time()
        logger.info("[Sub-task 2.5/2.8] Starting Mutual Fund & FII Institutional Behavior Analysis...")
        try:
            from engine.analyzers.mf_behavior import precalculate_all_mf_behavior
            precalculate_all_mf_behavior()
        except Exception as e:
            logger.error(f"Error precalculating MF behavior: {e}")
        try:
            from engine.analyzers.fii_behavior import precalculate_all_fii_behavior
            precalculate_all_fii_behavior()
        except Exception as e:
            logger.error(f"Error precalculating FII behavior: {e}")
        p_elapsed = time.time() - p_start
        logger.info(f"[Sub-task 2.5/2.8] Mutual Fund & FII Behavior Analysis completed in {p_elapsed:.2f}s.")

    def run_phase_2_6():
        p_start = time.time()
        logger.info("[Sub-task 2.6/2.8] Starting Elliot Wave W3/W5 Momentum Analysis...")
        valid_tickers = get_spot_tickers()
        from engine.analysis.elliot import analyze_and_store_elliot
        progress, task_id = create_phase_progress(2, "Analyze Elliot", len(valid_tickers))
        with progress:
            for t in valid_tickers:
                try:
                    analyze_and_store_elliot(t)
                except Exception as e:
                    logger.error(f"Error executing Elliot Wave analysis for {t}: {e}")
                progress.update(task_id, advance=1)
        p_elapsed = time.time() - p_start
        logger.info(f"[Sub-task 2.6/2.8] Elliot Wave Analysis completed in {p_elapsed:.2f}s.")

    def run_phase_2_7():
        p_start = time.time()
        logger.info("[Sub-task 2.7/2.8] Starting Sectorwise Lead-Follow Relationship Groups Analysis...")
        try:
            from engine.analysis.sector_followers import generate_sector_followers_analysis
            generate_sector_followers_analysis()
        except Exception as e:
            logger.error(f"Error running Sectorwise Followers Analysis: {e}")
        p_elapsed = time.time() - p_start
        logger.info(f"[Sub-task 2.7/2.8] Sectorwise Lead-Follow Analysis completed in {p_elapsed:.2f}s.")

    def run_phase_2_8():
        p_start = time.time()
        logger.info("[Sub-task 2.8/2.8] Starting Multi-Factor Hybrid Synthesis, Historical Calls & Efficiency Tracking...")
        valid_tickers = get_spot_tickers()
        total = len(valid_tickers)
        resume = resolve_resume_flag("Phase 2.8 (Analyze Summaries)", "analysis", total, valid_tickers=valid_tickers)
        completed = get_completed_tickers("analysis", valid_tickers=valid_tickers) if resume else set()
        pending_count = max(total - len(completed), 0)

        if pending_count > 0 or not resume:
            progress, task_id = create_phase_progress(2, "Analyze Summaries", pending_count if resume else total)
            with progress:
                def cb(ticker, status, advance=1):
                    if ticker is not None:
                        progress.update(task_id, advance=advance)
                analyze_all_tickers(progress_callback=cb, resume=resume)
        else:
            logger.info(f"All {total} tickers already analyzed and synthesized! Use --fresh to re-synthesize.")
        p_elapsed = time.time() - p_start
        logger.info(f"[Sub-task 2.8/2.8] Multi-Factor Hybrid Synthesis completed in {p_elapsed:.2f}s.")

    def run_phase_2():
        phase2_start = time.time()
        logger.info("=== Starting Phase 2: Consolidated Scoring, Scanners & Analysis Engine (--mode analyze-all) ===")
        run_phase_2_1()
        run_phase_2_2()
        run_phase_2_3()
        run_phase_2_4()
        run_phase_2_5()
        run_phase_2_6()
        run_phase_2_7()
        run_phase_2_8()
        phase2_elapsed = time.time() - phase2_start
        logger.info(f"[✓] Phase 2 (Analyze All) fully completed in {phase2_elapsed:.2f}s.")

    def backup_historical_calls():
        logger.info("Executing Historical Calls Data Retaining & Backup Mechanism...")
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                # Ensure base historical_calls table exists with required columns
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
                """)

                cur.execute("""
                    CREATE TABLE IF NOT EXISTS historical_call_bkp (
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
                        closest_info TEXT,
                        backed_up_at TIMESTAMP DEFAULT now()
                    );
                """)

                # Ensure all columns exist on both tables if created from older/incomplete schema
                columns_schema = [
                    ("uniqueid", "TEXT"),
                    ("recommended_call", "TEXT"),
                    ("confidence", "DOUBLE PRECISION"),
                    ("cmp", "DOUBLE PRECISION"),
                    ("entry_price", "DOUBLE PRECISION"),
                    ("stop_loss", "DOUBLE PRECISION"),
                    ("target_price", "DOUBLE PRECISION"),
                    ("rr_ratio", "TEXT DEFAULT '1:2.00'"),
                    ("status", "TEXT DEFAULT 'OPEN'"),
                    ("timestamp", "TEXT"),
                    ("created_at", "TIMESTAMP DEFAULT now()"),
                    ("review_date", "DATE DEFAULT CURRENT_DATE"),
                    ("closed_at", "TIMESTAMP"),
                    ("final_cmp", "DOUBLE PRECISION"),
                    ("latest_cmp", "DOUBLE PRECISION"),
                    ("call_status", "TEXT DEFAULT 'OPEN'"),
                    ("outcome", "TEXT DEFAULT 'OPEN'"),
                    ("min_cmp", "DOUBLE PRECISION"),
                    ("max_cmp", "DOUBLE PRECISION"),
                    ("closest", "TEXT"),
                    ("closest_info", "TEXT"),
                ]
                for tbl in ["historical_calls", "historical_call_bkp"]:
                    for col_name, col_type in columns_schema:
                        cur.execute(f"ALTER TABLE {tbl} ADD COLUMN IF NOT EXISTS {col_name} {col_type};")
                conn.commit()

                cur.execute("""
                    INSERT INTO historical_call_bkp (
                        uniqueid, ticker, recommended_call, confidence, cmp, entry_price, stop_loss, target_price,
                        rr_ratio, status, timestamp, created_at, review_date, closed_at, final_cmp, latest_cmp,
                        call_status, outcome, min_cmp, max_cmp, closest, closest_info
                    )
                    SELECT 
                        hc.uniqueid, hc.ticker, hc.recommended_call, hc.confidence, hc.cmp, hc.entry_price, hc.stop_loss, hc.target_price,
                        hc.rr_ratio, hc.status, hc.timestamp, hc.created_at, hc.review_date, hc.closed_at, hc.final_cmp, hc.latest_cmp,
                        hc.call_status, hc.outcome, hc.min_cmp, hc.max_cmp, hc.closest, hc.closest_info
                    FROM historical_calls hc
                    WHERE hc.uniqueid IS NOT NULL 
                      AND hc.uniqueid NOT IN (
                          SELECT bkp.uniqueid 
                          FROM historical_call_bkp bkp 
                          WHERE bkp.uniqueid IS NOT NULL
                      );
                """)
                copied = cur.rowcount
                conn.commit()

                import csv
                bkp_csv_path = ROOT_DIR / "data" / "historical_call_bkp.csv"
                cur.execute("SELECT uniqueid, ticker, recommended_call, confidence, cmp, entry_price, stop_loss, target_price, rr_ratio, status, timestamp, created_at, review_date, closed_at, final_cmp, latest_cmp, call_status, outcome, min_cmp, max_cmp, closest, closest_info FROM historical_call_bkp;")
                rows = cur.fetchall()
                cols = [desc[0] for desc in cur.description]
                with open(bkp_csv_path, "w", newline="", encoding="utf-8") as f:
                    writer = csv.writer(f)
                    writer.writerow(cols)
                    writer.writerows(rows)
                    
                logger.info(f"[✓] Backup complete! Synchronized {copied} new historical call records to 'historical_call_bkp' table and saved backup to {bkp_csv_path}.")

    # ── Batch Operations Dispatcher ──────────────────────────────────────────
    if args.mode == "download-all":
        logger.info("Triggered Phase 1: Full Raw Data Ingestion Pipeline...")
        run_phase_1()
    elif args.mode == "download-spot":
        logger.info("Triggered Phase 1.1: Spot Data Download...")
        run_phase_1_1()
    elif args.mode in ("download-mf", "mutualfund"):
        logger.info("Triggered Phase 1.2: Mutual Fund & FII Holdings Download...")
        if args.ticker:
            ticker = args.ticker.upper().strip()
            from engine.downloaders.mutual_fund import download_fii_holdings_for_ticker
            ok, count = download_mf_holdings_for_ticker(ticker)
            ok_fii, count_fii = download_fii_holdings_for_ticker(ticker)
            logger.info(f"MF/FII download for {ticker}: MF(ok={ok}, saved={count}), FII(ok={ok_fii}, saved={count_fii}).")
        else:
            run_phase_1_2()
    elif args.mode == "download-fno":
        logger.info("Triggered Phase 1.3: F&O Derivatives Download...")
        run_phase_1_3()
    elif args.mode == "analyze-all":
        logger.info("Triggered Phase 2: Consolidated Scoring & Analysis Engine...")
        run_phase_2()
    elif args.mode == "analyze-technical":
        logger.info("Triggered Phase 2.1: Technical Analysis & Scanners...")
        run_phase_2_1()
    elif args.mode == "analyze-fundamental":
        logger.info("Triggered Phase 2.2: Fundamental Analysis...")
        run_phase_2_2()
    elif args.mode == "analyze-fo":
        logger.info("Triggered Phase 2.3: F&O Derivative Options Analysis...")
        run_phase_2_3()
    elif args.mode == "analyze-patterns":
        logger.info("Triggered Phase 2.4: Candlestick Chart Pattern Analysis...")
        run_phase_2_4()
    elif args.mode == "analyze-mf":
        logger.info("Triggered Phase 2.5: Mutual Fund & FII Behavior Analysis...")
        run_phase_2_5()
    elif args.mode == "analyze-elliot":
        logger.info("Triggered Phase 2.6: Elliot Wave Analysis...")
        run_phase_2_6()
    elif args.mode == "analyze-sector":
        logger.info("Triggered Phase 2.7: Sector Followers Analysis...")
        run_phase_2_7()
    elif args.mode == "analyze-summaries":
        logger.info("Triggered Phase 2.8: Multi-Factor Hybrid Synthesis...")
        run_phase_2_8()
    elif args.mode == "full-pipeline":
        logger.info("Triggered Full End-to-End Pipeline (Phase 1 Download All -> Phase 2 Analyze All -> Backup)...")
        run_phase_1()
        run_phase_2()
        backup_historical_calls()
        logger.info("[✓] Full pipeline execution completed successfully!")
    elif args.mode == "backup":
        backup_historical_calls()
    elif args.mode == "news-analyze":
        if not args.ticker:
            logger.error("--ticker argument is required when running --mode news-analyze (e.g. --mode news-analyze --ticker CROMPTON)")
            sys.exit(1)
        ticker = args.ticker.upper().strip()
        logger.info(f"Running news sentiment analysis for selected ticker: {ticker}")
        try:
            import yfinance as yf
            formatted = f"{ticker}.NS" if not ticker.endswith(".NS") and not ticker.startswith("^") else ticker
            tk = yf.Ticker(formatted)
            news = tk.news or []
            print(f"\nHeadline News for {ticker} ({len(news)} items):")
            for i, n in enumerate(news[:10], 1):
                print(f"  {i}. {n.get('title')}")
        except Exception as e:
            logger.error(f"Failed to fetch news for {ticker}: {e}")

    # Single Ticker On-demand Run
    if args.ticker:
        ticker = args.ticker.upper().strip()
        logger.info(f"Running on-demand pipeline for ticker: {ticker}")
        
        # 1. Download price and fundamentals
        dl_ok = download_ticker_data(ticker)
        if dl_ok:
            # 2. Check and download derivatives if F&O active
            from engine.database.connection import get_db_connection
            is_fno = False
            with get_db_connection() as conn:
                with conn.cursor() as cur:
                    cur.execute("SELECT is_fno FROM ticker_master WHERE ticker = %s", (ticker,))
                    row = cur.fetchone()
                    if row:
                        is_fno = row[0]
            if is_fno:
                download_and_insert_derivatives(ticker)
                
            # 3. Analyze and summarize
            ok = analyze_and_summarize_ticker(ticker)
            if ok:
                logger.info(f"Analysis completed and upserted for {ticker}")
                # Generate default HTML report
                generate_html_report(ticker)
                if args.pdf:
                    generate_pdf_report(ticker)
            else:
                logger.error(f"Analysis failed for {ticker}")
        else:
            logger.error(f"Data download failed for {ticker}")

    # Generate Report On-demand
    if args.report:
        ticker = args.report.upper().strip()
        logger.info(f"Generating reports for: {ticker}")
        
        # Check if analyzed first, if not run it
        from engine.database.connection import get_db_connection
        has_summary = False
        try:
            with get_db_connection() as conn:
                with conn.cursor() as cur:
                    cur.execute("SELECT 1 FROM analysis_summaries WHERE ticker = %s", (ticker,))
                    has_summary = cur.fetchone() is not None
        except Exception:
            pass

        if not has_summary:
            logger.info(f"No previous analysis found for {ticker}. Running download and analysis first...")
            dl_ok = download_ticker_data(ticker)
            if dl_ok:
                is_fno = False
                with get_db_connection() as conn:
                    with conn.cursor() as cur:
                        cur.execute("SELECT is_fno FROM ticker_master WHERE ticker = %s", (ticker,))
                        row = cur.fetchone()
                        if row:
                            is_fno = row[0]
                if is_fno:
                    download_and_insert_derivatives(ticker)
                analyze_and_summarize_ticker(ticker)
            else:
                logger.error(f"Download failed for {ticker}, cannot generate report.")

        html_path = generate_html_report(ticker)
        if html_path:
            logger.info(f"HTML Report: {html_path}")
        if args.pdf:
            pdf_path = generate_pdf_report(ticker)
            if pdf_path:
                logger.info(f"PDF Report: {pdf_path}")

if __name__ == "__main__":
    main()
