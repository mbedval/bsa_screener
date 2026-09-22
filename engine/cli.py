#!/usr/bin/env python3
import sys
import argparse
import logging
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
    parser.add_argument("--mode", choices=["download-spot", "download-fno", "analyze-all", "full-pipeline", "news-analyze", "backup", "mutualfund"], help="Pipeline batch operation mode")
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

    def get_spot_tickers():
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT ticker FROM ticker_master")
                return [row[0] for row in cur.fetchall()]

    def get_fno_tickers():
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                fno_set = set()
                try:
                    cur.execute("SELECT ticker FROM ticker_master WHERE is_fno = TRUE")
                    for row in cur.fetchall():
                        fno_set.add(row[0])
                except Exception:
                    conn.rollback()
                try:
                    cur.execute("SELECT symbol FROM fno_stock_master WHERE is_active = TRUE")
                    for row in cur.fetchall():
                        fno_set.add(row[0])
                except Exception:
                    conn.rollback()
                try:
                    cur.execute("SELECT symbol FROM fno_index_master WHERE is_active = TRUE")
                    for row in cur.fetchall():
                        fno_set.add(row[0])
                except Exception:
                    conn.rollback()
                for idx in ["NIFTY", "BANKNIFTY", "FINNIFTY", "MIDCPNIFTY", "NIFTYNXT50", "BANKEX"]:
                    fno_set.add(idx)
                return list(fno_set)

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

    def run_phase_1():
        valid_tickers = get_spot_tickers()
        total = len(valid_tickers)
        resume = resolve_resume_flag("Phase 1 (Download Spot)", "spot_download", total, valid_tickers=valid_tickers)
        completed = get_completed_tickers("spot_download", valid_tickers=valid_tickers) if resume else set()
        pending_count = max(total - len(completed), 0)
        if pending_count == 0 and total > 0:
            logger.info(f"All {total} items for Phase 1 (Download Spot) are already completed. Use --fresh or --force to re-download.")
            return
        progress, task_id = create_phase_progress(1, "Download Spot", pending_count if resume else total)
        with progress:
            def cb(ticker, status, advance=1):
                if ticker is not None:
                    progress.update(task_id, advance=advance)
            download_all_tickers(progress_callback=cb, resume=resume, force=args.force)

    def run_phase_2():
        valid_tickers = get_fno_tickers()
        total = len(valid_tickers)
        resume = resolve_resume_flag("Phase 2 (Download F&O)", "fno_download", total, valid_tickers=valid_tickers)
        completed = get_completed_tickers("fno_download", valid_tickers=valid_tickers) if resume else set()
        pending_count = max(total - len(completed), 0)
        if pending_count == 0 and total > 0:
            logger.info(f"All {total} items for Phase 2 (Download F&O) are already completed. Use --fresh to re-download.")
            return
        progress, task_id = create_phase_progress(2, "Download F&O", pending_count if resume else total)
        with progress:
            def cb(ticker, status, advance=1):
                if ticker is not None:
                    progress.update(task_id, advance=advance)
            download_all_derivatives(progress_callback=cb, resume=resume)

    def run_phase_3():
        valid_tickers = get_spot_tickers()
        total = len(valid_tickers)
        resume = resolve_resume_flag("Phase 3 (Analyze All)", "analysis", total, valid_tickers=valid_tickers)
        completed = get_completed_tickers("analysis", valid_tickers=valid_tickers) if resume else set()
        pending_count = max(total - len(completed), 0)
        if pending_count == 0 and total > 0:
            logger.info(f"All {total} items for Phase 3 (Analyze All) are already completed. Use --fresh to re-analyze.")
            return
        progress, task_id = create_phase_progress(3, "Analyze All", pending_count if resume else total)
        with progress:
            def cb(ticker, status, advance=1):
                if ticker is not None:
                    progress.update(task_id, advance=advance)
            analyze_all_tickers(progress_callback=cb, resume=resume)
        
        # Pre-calculate Stocks Respecting Chart Patterns for database
        try:
            from engine.analysis.stocks_respecting_patterns import generate_stocks_respecting_patterns
            generate_stocks_respecting_patterns()
        except Exception as e:
            logger.error(f"Error running pre-calculation for stocks respecting patterns: {e}")

        # Pre-calculate Sectorwise Lead-Follow Relationship Groups for database
        try:
            from engine.analysis.sector_followers import generate_sector_followers_analysis
            generate_sector_followers_analysis()
        except Exception as e:
            logger.error(f"Error running pre-calculation for sectorwise followers: {e}")

        # Pre-calculate Mutual Fund Behavior for database
        try:
            from engine.analyzers.mf_behavior import precalculate_all_mf_behavior
            precalculate_all_mf_behavior()
        except Exception as e:
            logger.error(f"Error running pre-calculation for MF behavior: {e}")

        # Pre-calculate FII Behavior for database
        try:
            from engine.analyzers.fii_behavior import precalculate_all_fii_behavior
            precalculate_all_fii_behavior()
        except Exception as e:
            logger.error(f"Error running pre-calculation for FII behavior: {e}")

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

    # Batch Operations
    if args.mode == "download-spot":
        logger.info("Triggered downloading spot data for all master tickers...")
        run_phase_1()
    elif args.mode == "download-fno":
        logger.info("Triggered downloading F&O option chain data...")
        run_phase_2()
    elif args.mode == "analyze-all":
        logger.info("Triggered scoring and analysis engine for all master tickers...")
        run_phase_3()
    elif args.mode == "full-pipeline":
        logger.info("Triggered Full End-to-End Pipeline (Spot Download -> F&O Download -> Scoring & Analysis -> Backup)...")
        logger.info("--- Starting Phase 1: Spot Data Download ---")
        run_phase_1()
        logger.info("--- Starting Phase 2: F&O Derivatives Download ---")
        run_phase_2()
        logger.info("--- Starting Phase 3: Technical & Fundamental Scoring & Analysis ---")
        run_phase_3()
        logger.info("--- Starting Backup: Retaining Historical Calls ---")
        backup_historical_calls()
        logger.info("[✓] Full pipeline execution completed successfully!")
    elif args.mode == "backup":
        backup_historical_calls()
    elif args.mode == "mutualfund":
        logger.info("Triggered downloading Mutual Fund & FII holdings from Screener.in...")
        if args.ticker:
            ticker = args.ticker.upper().strip()
            from engine.downloaders.mutual_fund import download_fii_holdings_for_ticker
            ok, count = download_mf_holdings_for_ticker(ticker)
            ok_fii, count_fii = download_fii_holdings_for_ticker(ticker)
            logger.info(f"MF/FII download for {ticker}: MF(ok={ok}, saved={count}), FII(ok={ok_fii}, saved={count_fii}).")
        else:
            total_tickers = len(get_spot_tickers())
            progress, task_id = create_phase_progress(1, "Mutual Fund & FII Holdings", total_tickers)
            from engine.downloaders.mutual_fund import download_all_fii_holdings
            with progress:
                def cb(current, total, ticker, count):
                    progress.update(task_id, advance=1)
                download_all_mf_holdings(progress_callback=cb)
                download_all_fii_holdings(progress_callback=cb)
            logger.info("[✓] Mutual Fund & FII holdings download completed!")
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
