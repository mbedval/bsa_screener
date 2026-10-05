#!/usr/bin/env python3
import os
import sys
from datetime import datetime
from pathlib import Path
from dotenv import load_dotenv

# Add the project root to python path to use imports
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from engine.database.connection import get_db_connection
from engine.reports.pdf_generator import generate_pdf_report
from engine.utils.email_sender import send_email_with_attachment

def build_newsletter_html_table(tickers: list[str]) -> str:
    """Builds a beautiful HTML table of analysis summaries for the watchlist tickers."""
    if not tickers:
        return ""
        
    rows = []
    try:
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                # Load summaries
                cur.execute("""
                    SELECT ticker, close, technical_score, fundamental_score, behavioral_score,
                           hybrid_score, overall_signal, confidence
                    FROM analysis_summaries
                    WHERE ticker = ANY(%s)
                    ORDER BY ticker
                """, (tickers,))
                for r in cur.fetchall():
                    ticker, close, tech, fund, behav, hybrid, signal, confidence = r
                    
                    signal = str(signal).upper() if signal else "HOLD"
                    sig_color = "#cbd5e1"
                    if "BUY" in signal:
                        sig_color = "#10b981"
                    elif "SELL" in signal:
                        sig_color = "#ef4444"
                        
                    rows.append(f"""
                        <tr style="border-bottom: 1px solid #1e293b; background-color: #0f172a;">
                            <td style="padding: 10px; font-weight: bold; color: #38bdf8; font-family: monospace; border-bottom: 1px solid #1e293b;">{ticker}</td>
                            <td style="padding: 10px; text-align: right; color: #f1f5f9; font-family: monospace; border-bottom: 1px solid #1e293b;">₹{close:,.2f}</td>
                            <td style="padding: 10px; text-align: right; color: #cbd5e1; font-family: monospace; border-bottom: 1px solid #1e293b;">{tech:+.2f}</td>
                            <td style="padding: 10px; text-align: right; color: #cbd5e1; font-family: monospace; border-bottom: 1px solid #1e293b;">{fund:+.2f}</td>
                            <td style="padding: 10px; text-align: right; color: #cbd5e1; font-family: monospace; border-bottom: 1px solid #1e293b;">{behav:+.2f}</td>
                            <td style="padding: 10px; text-align: right; font-weight: bold; color: #f8fafc; font-family: monospace; border-bottom: 1px solid #1e293b;">{hybrid:+.2f}</td>
                            <td style="padding: 10px; text-align: center; font-weight: bold; color: {sig_color}; border-bottom: 1px solid #1e293b;">{signal}</td>
                            <td style="padding: 10px; text-align: right; color: #cbd5e1; font-family: monospace; border-bottom: 1px solid #1e293b;">{confidence:.1f}%</td>
                        </tr>
                    """)
    except Exception as e:
        print(f"    [×] Error building summary table: {e}")
        return ""

    if not rows:
        return "<p style='color: #ef4444;'>No pre-calculated analysis summaries found for these tickers. Please run analyze-all pipeline first.</p>"

    table_content = "\n".join(rows)
    return f"""
    <div style="margin: 20px 0; background-color: #0f172a; border-radius: 8px; border: 1px solid #1e293b; overflow: hidden; max-width: 900px;">
        <table style="width: 100%; border-collapse: collapse; text-align: left; font-size: 13px; color: #f1f5f9;">
            <thead>
                <tr style="background-color: #1e293b; color: #38bdf8; border-bottom: 2px solid #334155;">
                    <th style="padding: 12px 10px;">Ticker</th>
                    <th style="padding: 12px 10px; text-align: right;">CMP</th>
                    <th style="padding: 12px 10px; text-align: right;">Tech Score</th>
                    <th style="padding: 12px 10px; text-align: right;">Fund Score</th>
                    <th style="padding: 12px 10px; text-align: right;">Behav Score</th>
                    <th style="padding: 12px 10px; text-align: right;">Hybrid Score</th>
                    <th style="padding: 12px 10px; text-align: center;">Signal</th>
                    <th style="padding: 12px 10px; text-align: right;">Confidence</th>
                </tr>
            </thead>
            <tbody>
                {table_content}
            </tbody>
        </table>
    </div>
    """

def main():
    load_dotenv()
    print("==================================================")
    print("BSA NEWSLETTER BROADCAST PIPELINE")
    print("==================================================")

    # 1. Fetch all subscribed users with watchlists
    users = []
    try:
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("""
                    SELECT u.email, u.first_name, u.watchlist_id, w.name AS watchlist_name
                    FROM users u
                    JOIN watchlist w ON w.id = u.watchlist_id
                    WHERE u.is_subscribed = true
                """)
                users = [
                    {
                        "email": row[0],
                        "first_name": row[1],
                        "watchlist_id": row[2],
                        "watchlist_name": row[3]
                    }
                    for row in cur.fetchall()
                ]
    except Exception as e:
        print(f"[×] Database error: {e}")
        sys.exit(1)

    if not users:
        print("No subscribed users with watchlists found in the database. Pipeline finished.")
        sys.exit(0)

    print(f"Found {len(users)} subscribed user(s). Processing transmissions...")

    # 2. Process each user
    pdf_dir = Path("output/pdf")
    pdf_dir.mkdir(parents=True, exist_ok=True)
    today_str = datetime.now().strftime("%Y-%m-%d")

    for user in users:
        email = user["email"]
        first_name = user["first_name"]
        watchlist_id = user["watchlist_id"]
        wl_name = user["watchlist_name"]

        print(f"\nProcessing '{email}' (Watchlist: '{wl_name}')...")

        # Get tickers in watchlist
        tickers = []
        try:
            with get_db_connection() as conn:
                with conn.cursor() as cur:
                    cur.execute("SELECT ticker FROM watchlist_items WHERE watchlist_id = %s", (watchlist_id,))
                    tickers = [row[0] for row in cur.fetchall()]
        except Exception as e:
            print(f"  [×] Failed to query watchlist items for {email}: {e}")
            continue

        if not tickers:
            print(f"  [-] Watchlist '{wl_name}' is empty. Skipping email.")
            continue

        print(f"  Found {len(tickers)} ticker(s) in watchlist. Compiling PDFs...")

        pdf_paths = []
        for ticker in tickers:
            pdf_path = pdf_dir / f"{ticker}_report.pdf"
            # Ensure PDF exists or generate
            if not pdf_path.exists():
                print(f"    Generating PDF for {ticker}...")
                try:
                    generate_pdf_report(ticker)
                except Exception as e:
                    print(f"    [×] Failed to generate PDF for {ticker}: {e}")
            
            if pdf_path.exists():
                pdf_paths.append(str(pdf_path.resolve()))
            else:
                print(f"    [×] PDF report file missing for {ticker}.")

        if not pdf_paths:
            print(f"  [×] No PDF reports could be compiled for {email}. Skipping email.")
            continue

        # Build inline HTML summary table
        table_html = build_newsletter_html_table(tickers)

        # Send email
        subject = f"Your BSA Daily Watchlist Reports - {today_str}"
        body = f"""
        <html>
            <body style="font-family: Arial, sans-serif; color: #333; background-color: #f8fafc; padding: 20px;">
                <div style="background-color: #ffffff; padding: 24px; border-radius: 8px; border: 1px solid #e2e8f0; max-width: 900px; margin: 0 auto;">
                    <h3 style="color: #0f172a; margin-top: 0;">Hello {first_name},</h3>
                    <p style="font-size: 14px; color: #475569;">Please find below the daily summary and attached PDF analysis reports for the tickers in your watchlist: <strong>{wl_name}</strong>.</p>
                    
                    <h4 style="color: #0f172a; border-bottom: 2px solid #cbd5e1; padding-bottom: 6px; margin-top: 24px;">Watchlist Performance Snapshot</h4>
                    {table_html}
                    
                    <p style="font-size: 12px; color: #64748b; margin-top: 30px; border-top: 1px solid #e2e8f0; padding-top: 12px;">
                        This email was sent automatically by the <strong>BSA Screener Engine</strong>.
                    </p>
                </div>
            </body>
        </html>
        """

        print(f"  Sending email with watchlist summary table & {len(pdf_paths)} attachment(s)...")
        success = send_email_with_attachment(subject, body, pdf_paths, [email])
        if success:
            print(f"  [✓] Email sent successfully to {email}")
        else:
            print(f"  [×] Failed to deliver email to {email}")

    print("\n==================================================")
    print("NEWSLETTER PIPELINE COMPLETED")
    print("==================================================")

if __name__ == "__main__":
    main()
