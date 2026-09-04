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

logger = setup_logger("bsa_cli")

def main():
    parser = argparse.ArgumentParser(description="BSA Consolidated Analysis & Processing Engine")
    parser.add_argument("--mode", choices=["download-all", "download-fno", "analyze-all", "full-pipeline", "news-analyze"], help="Pipeline batch operation mode")
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

    def get_spot_count():
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT COUNT(*) FROM ticker_master")
                return cur.fetchone()[0]

    def get_fno_count():
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                fno_set = set()
                cur.execute("SELECT ticker FROM ticker_master WHERE is_fno = TRUE")
                for row in cur.fetchall():
                    fno_set.add(row[0])
                try:
                    cur.execute("SELECT symbol FROM fno_master WHERE is_active = TRUE")
                    for row in cur.fetchall():
                        fno_set.add(row[0])
                except Exception:
                    pass
                for idx in ["NIFTY", "BANKNIFTY", "FINNIFTY", "MIDCPNIFTY"]:
                    fno_set.add(idx)
                return len(fno_set)

    def resolve_resume_flag(phase_name: str, phase_key: str, total_count: int) -> bool:
        completed = get_completed_tickers(phase_key)
        if not completed:
            return True
        if len(completed) >= total_count:
            return True

        if args.resume:
            logger.info(f"Resuming {phase_name} from checkpoint ({len(completed)}/{total_count} already completed).")
            return True
        if args.fresh or args.force:
            logger.info(f"Clearing checkpoint for {phase_name} and starting fresh...")
            clear_phase_checkpoint(phase_key)
            return False

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
        return True

    def run_phase_1():
        total = get_spot_count()
        resume = resolve_resume_flag("Phase 1 (Download Spot)", "spot_download", total)
        progress, task_id = create_phase_progress(1, "Download Spot", total)
        with progress:
            def cb(ticker, status, advance=1):
                progress.update(task_id, advance=advance)
            download_all_tickers(progress_callback=cb, resume=resume, force=args.force)

    def run_phase_2():
        total = get_fno_count()
        resume = resolve_resume_flag("Phase 2 (Download F&O)", "fno_download", total)
        progress, task_id = create_phase_progress(2, "Download F&O", total)
        with progress:
            def cb(ticker, status, advance=1):
                progress.update(task_id, advance=advance)
            download_all_derivatives(progress_callback=cb, resume=resume)

    def run_phase_3():
        total = get_spot_count()
        resume = resolve_resume_flag("Phase 3 (Analyze All)", "analysis", total)
        progress, task_id = create_phase_progress(3, "Analyze All", total)
        with progress:
            def cb(ticker, status, advance=1):
                progress.update(task_id, advance=advance)
            analyze_all_tickers(progress_callback=cb, resume=resume)

    # Batch Operations
    if args.mode == "download-all":
        logger.info("Triggered downloading data for all master tickers...")
        run_phase_1()
    elif args.mode == "download-fno":
        logger.info("Triggered downloading F&O option chain data...")
        run_phase_2()
    elif args.mode == "analyze-all":
        logger.info("Triggered scoring and analysis engine for all master tickers...")
        run_phase_3()
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
