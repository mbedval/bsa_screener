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
    parser.add_argument("--mode", choices=["download-all", "download-fno", "analyze-all", "full-pipeline"], help="Pipeline batch operation mode")
    parser.add_argument("--ticker", type=str, help="Execute download and analysis on-demand for a single ticker")
    parser.add_argument("--report", type=str, help="Generate report for a specific ticker")
    parser.add_argument("--pdf", action="store_true", help="Explicitly opt-in to generate PDF report alongside HTML")

    args = parser.parse_args()

    if not args.mode and not args.ticker and not args.report:
        parser.print_help()
        sys.exit(1)

    load_dotenv()

    # Batch Operations
    if args.mode == "download-all":
        logger.info("Triggered downloading data for all master tickers...")
        download_all_tickers()
    elif args.mode == "download-fno":
        logger.info("Triggered downloading F&O option chain data...")
        download_all_derivatives()
    elif args.mode == "analyze-all":
        logger.info("Triggered scoring and analysis engine for all master tickers...")
        analyze_all_tickers()
    elif args.mode == "full-pipeline":
        logger.info("Triggered full pipeline: Downloading all data...")
        download_all_tickers()
        logger.info("Downloading F&O option chain data...")
        download_all_derivatives()
        logger.info("Triggered scoring and analysis engine for all master tickers...")
        analyze_all_tickers()

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
