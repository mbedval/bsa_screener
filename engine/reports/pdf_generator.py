import math
import os
import logging
import json
from pathlib import Path
from datetime import datetime
from fpdf import FPDF
from engine.database.connection import get_db_connection

logger = logging.getLogger("bsa_pdf_generator")

def format_crores(val, prefix: str = "Rs. ") -> str:
    """Format monetary value into Crores (1 Cr = 10,000,000 = 1e7)."""
    if val is None:
        return "N/A"
    try:
        v = float(val)
        if math.isnan(v) or math.isinf(v) or v == 0.0:
            return "N/A"
        v_cr = v / 1e7 if abs(v) >= 1e7 else v
        return f"{prefix}{v_cr:,.2f} Cr"
    except Exception:
        return str(val)

class BSAPDF(FPDF):
    def __init__(self, ticker: str, company_name: str, timestamp_str: str):
        super().__init__()
        self.ticker = ticker
        self.company_name = company_name
        self.timestamp_str = timestamp_str

    def header(self):
        # Header only on subsequent pages (page 2 and on)
        if self.page_no() > 1:
            self.set_fill_color(30, 41, 59)  # Slate/navy background
            self.rect(0, 0, 210, 20, 'F')
                
            self.set_text_color(255, 255, 255)
            self.set_font('Arial', 'B', 12)
            self.set_xy(10, 7)
            self.cell(0, 6, "BSA Stock Analysis Report", 0, 0, 'L')
            
            # Stock metadata on the right
            self.set_font('Arial', '', 10)
            self.set_xy(130, 7)
            self.cell(70, 6, f"{self.company_name} ({self.ticker})", 0, 0, 'R')
            
            self.set_text_color(0, 0, 0)
            self.set_y(25)

    def footer(self):
        # Footer only on subsequent pages (page 2 and on)
        if self.page_no() > 1:
            self.set_y(-15)
            self.set_font('Arial', 'I', 8)
            self.set_text_color(128, 128, 128)
            self.cell(0, 10, f"Page {self.page_no()} | Bindsol Stock Analysis (BSA)", 0, 0, 'C')

def generate_pdf_report(ticker: str) -> str:
    """
    Generate a professional multi-page vector PDF report for a specific ticker based on analysis summaries in PostgreSQL.
    Saves file under output/pdf/ and returns the absolute path.
    """
    output_dir = Path("output/pdf")
    output_dir.mkdir(parents=True, exist_ok=True)
    file_path = output_dir / f"{ticker}_report.pdf"

    try:
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                # Query analysis details & ticker master metadata
                cur.execute("""
                    SELECT a.close, a.technical_score, a.fundamental_score, a.behavioral_score,
                           a.hybrid_score, a.overall_signal, a.confidence, a.reasons, 
                           a.projection_22d, a.option_insights, a.news_footprint, a.updated_at,
                           m.company_name, m.sector, m.exchange, m.is_fno
                    FROM analysis_summaries a
                    JOIN ticker_master m ON a.ticker = m.ticker
                    WHERE a.ticker = %s
                """, (ticker,))
                row = cur.fetchone()

                # Fetch fundamentals metrics
                cur.execute("""
                    SELECT current_pe, avg_pe, debt_to_equity, last_pat, avg_pat, market_cap
                    FROM fundamentals WHERE ticker = %s ORDER BY fetched_date DESC LIMIT 1
                """, (ticker,))
                fund_row = cur.fetchone()

                # Fetch technical indicators
                cur.execute("""
                    SELECT rsi14, sma20, sma50, macd_line, macd_signal, bb_upper, bb_lower
                    FROM indicators_daily WHERE ticker = %s ORDER BY trade_date DESC LIMIT 1
                """, (ticker,))
                ind_row = cur.fetchone()

        if not row:
            logger.warning(f"No analysis summary record found for {ticker}. Cannot generate PDF report.")
            return ""

        close, tech_s, fund_s, beh_s, hyb_s, signal, conf, reasons, proj_raw, opt_raw, foot_raw, updated, name, sector, exchange, is_fno_master = row
        
        # Parse JSON
        proj_list = json.loads(proj_raw) if proj_raw else []
        opt_data = json.loads(opt_raw) if opt_raw and isinstance(opt_raw, str) else (opt_raw if isinstance(opt_raw, dict) else {})
        foot_data = json.loads(foot_raw) if foot_raw and isinstance(foot_raw, str) else (foot_raw if isinstance(foot_raw, dict) else {})

        if not opt_data or not foot_data:
            try:
                from engine.analysis.options import analyze_options_chain
                from engine.analysis.footprint import analyze_footprint_and_news
                if not opt_data:
                    opt_data = analyze_options_chain(ticker)
                if not foot_data:
                    foot_data = analyze_footprint_and_news(ticker)
            except Exception:
                pass

        if foot_data:
            beh_s = round((foot_data.get("sentiment_score", 0.0) * 0.4) + ((foot_data.get("accumulation_score", 50) - 50.0) / 50.0 * 0.6), 2)
            hyb_s = round((tech_s * 0.5) + (beh_s * 0.5), 2)
        
        timestamp_str = updated.strftime("%Y-%m-%d %H:%M:%S") if updated else datetime.now().strftime("%Y-%m-%d %H:%M:%S")

        # Initialize PDF (A4 Portrait)
        pdf = BSAPDF(ticker, name, timestamp_str)
        pdf.set_margins(15, 25, 15)
        
        # --- Page 1: COVER PAGE ---
        pdf.add_page()
        pdf.set_y(45)
        pdf.set_font('Arial', 'B', 26)
        pdf.cell(0, 10, "Stock Analysis Report", 0, 1, 'C')
        pdf.ln(8)
        
        pdf.set_font('Arial', 'B', 16)
        pdf.cell(0, 10, f"{name} ({ticker})", 0, 1, 'C')
        pdf.ln(16)
        
        # Metadata Block
        pdf.set_font('Arial', 'B', 12)
        pdf.set_fill_color(241, 245, 249)
        pdf.cell(0, 8, "  REPORT METADATA", 0, 1, 'L', True)
        pdf.ln(4)

        mcap_val = fund_row[5] if fund_row and len(fund_row) > 5 and fund_row[5] is not None else None
        mcap_str = format_crores(mcap_val, prefix="Rs. ")

        metadata = [
            ("Sector", sector or "General"),
            ("Exchange", exchange or "NS"),
            ("Market Segment", "EQUITY / F&O DERIVATIVES" if is_fno_master else "EQUITY (CASH SEGMENT ONLY)"),
            ("Market Cap", mcap_str),
            ("Current Close Price", f"Rs. {close:.2f}"),
            ("Generation Date", timestamp_str),
            ("Analysis Engine", "BSA Core Redesign Engine")
        ]
        
        for k, v in metadata:
            pdf.set_font('Arial', 'B', 10)
            pdf.cell(50, 6, f" {k}:", 0, 0)
            pdf.set_font('Arial', '', 10)
            pdf.cell(0, 6, str(v), 0, 1)
        pdf.ln(16)
        
        pdf.set_font('Arial', 'I', 9)
        pdf.set_text_color(100, 116, 139)
        pdf.multi_cell(0, 5, "CONFIDENTIALITY NOTICE: The information contained in this report is intended solely for analysis. It does not constitute investment advice. Trading in equities and derivatives involves substantial risk.")
        
        # --- Page 2: EXECUTIVE SUMMARY & FINANCIAL/TECHNICAL SNAPSHOT ---
        pdf.add_page()
        pdf.set_text_color(0, 0, 0)
        
        # Executive Summary
        pdf.set_font('Arial', 'B', 14)
        pdf.set_fill_color(241, 245, 249)
        pdf.cell(0, 8, "  EXECUTIVE SUMMARY", 0, 1, 'L', True)
        pdf.ln(4)
        
        pdf.set_font('Arial', 'B', 10)
        pdf.cell(50, 6, "Overall Recommendation:", 0, 0)
        pdf.set_font('Arial', 'B', 11)
        pdf.cell(0, 6, f"{signal} (Confidence: {conf}%)", 0, 1)
        
        pdf.set_font('Arial', 'B', 10)
        pdf.cell(50, 6, "Hybrid Analytical Score:", 0, 0)
        pdf.set_font('Arial', '', 10)
        pdf.cell(0, 6, str(hyb_s), 0, 1)
        pdf.ln(5)
        
        pdf.set_font('Arial', 'B', 12)
        pdf.cell(0, 6, "Key Signaling Factors:", 0, 1)
        pdf.set_font('Arial', '', 10)
        for reason in reasons.split(";"):
            if reason.strip():
                pdf.cell(5, 5, "-", 0, 0)
                pdf.multi_cell(0, 5, reason.strip())
        pdf.ln(8)
        
        # Scoring Metrics Table
        pdf.set_font('Arial', 'B', 12)
        pdf.cell(0, 6, "Composite Score Breakdown:", 0, 1)
        pdf.ln(2)
        
        headers = ["Metric/Module", "Score Scale (-1.0 to +1.0)"]
        pdf.set_font('Arial', 'B', 10)
        pdf.cell(90, 7, headers[0], 1, 0, 'L')
        pdf.cell(90, 7, headers[1], 1, 1, 'C')
        
        scores = [
            ("Technical Indicator Aggregate", str(tech_s)),
            ("Fundamental Valuation Snapshot", str(fund_s)),
            ("Behavioral Sentiment Index", str(beh_s)),
            ("Final Aggregated Hybrid Score", str(hyb_s))
        ]
        pdf.set_font('Arial', '', 10)
        for label, val in scores:
            pdf.cell(90, 7, label, 1, 0, 'L')
            pdf.cell(90, 7, val, 1, 1, 'C')
        pdf.ln(8)

        # Technical & Fundamental Financial Snapshot
        if fund_row or ind_row:
            pdf.set_font('Arial', 'B', 12)
            pdf.cell(0, 6, "Fundamental & Technical Key Indicators:", 0, 1)
            pdf.ln(2)
            
            pdf.set_font('Arial', 'B', 9)
            pdf.set_fill_color(241, 245, 249)
            pdf.cell(45, 6, "Metric", 1, 0, 'L', True)
            pdf.cell(45, 6, "Value", 1, 0, 'C', True)
            pdf.cell(45, 6, "Metric", 1, 0, 'L', True)
            pdf.cell(45, 6, "Value", 1, 1, 'C', True)

            pe_val = f"{float(fund_row[0]):.2f}" if fund_row and fund_row[0] is not None else "N/A"
            avg_pe_val = f"{float(fund_row[1]):.2f}" if fund_row and fund_row[1] is not None else "N/A"
            de_val = f"{float(fund_row[2]):.2f}" if fund_row and fund_row[2] is not None else "N/A"
            pat_val = format_crores(fund_row[3], prefix="Rs. ") if fund_row and len(fund_row) > 3 and fund_row[3] is not None else "N/A"
            avg_pat_val = format_crores(fund_row[4], prefix="Rs. ") if fund_row and len(fund_row) > 4 and fund_row[4] is not None else "N/A"

            rsi_val = f"{float(ind_row[0]):.1f}" if ind_row and ind_row[0] is not None else "N/A"
            sma20_val = f"Rs. {float(ind_row[1]):.2f}" if ind_row and ind_row[1] is not None else "N/A"
            sma50_val = f"Rs. {float(ind_row[2]):.2f}" if ind_row and ind_row[2] is not None else "N/A"
            macd_val = f"{float(ind_row[3]):.2f}" if ind_row and ind_row[3] is not None else "N/A"

            snapshot_rows = [
                ("Current P/E Ratio", pe_val, "RSI (14)", rsi_val),
                ("Avg Historical P/E", avg_pe_val, "20-Day SMA", sma20_val),
                ("Debt to Equity", de_val, "50-Day SMA", sma50_val),
                ("Last Quarter PAT", pat_val, "MACD Line", macd_val),
                ("Avg Quarterly PAT", avg_pat_val, "Market Cap", mcap_str),
            ]

            pdf.set_font('Arial', '', 9)
            for m1, v1, m2, v2 in snapshot_rows:
                pdf.cell(45, 6, m1, 1, 0, 'L')
                pdf.cell(45, 6, v1, 1, 0, 'C')
                pdf.cell(45, 6, m2, 1, 0, 'L')
                pdf.cell(45, 6, v2, 1, 1, 'C')

        # --- Page 3: DERIVATIVES & PROJECTION / PRICE PROJECTION ---
        pdf.add_page()
        
        is_fno_stock = opt_data.get("is_fno", is_fno_master) if isinstance(opt_data, dict) else is_fno_master

        pdf.set_font('Arial', 'B', 14)
        pdf.set_fill_color(241, 245, 249)
        if is_fno_stock:
            pdf.cell(0, 8, "  DERIVATIVE & PROJECTION ENGINE", 0, 1, 'L', True)
        else:
            pdf.cell(0, 8, "  PRICE PROJECTION ENGINE", 0, 1, 'L', True)
        pdf.ln(4)
        
        pdf.set_font('Arial', 'B', 12)
        if is_fno_stock:
            pdf.cell(0, 6, "Options Chain Metrics:", 0, 1)
            pdf.ln(2)
            
            opt_metrics = [
                ("ATM Strike", f"Rs. {opt_data.get('atm_strike', 0.0):.1f}" if opt_data.get('atm_strike') is not None else "N/A"),
                ("Immediate Support Line", f"Rs. {opt_data.get('support', 0.0):.1f}" if opt_data.get('support') is not None else "N/A"),
                ("Immediate Resistance Line", f"Rs. {opt_data.get('resistance', 0.0):.1f}" if opt_data.get('resistance') is not None else "N/A"),
                ("Put-Call Ratio (PCR)", str(opt_data.get('pcr', 'N/A')) if opt_data.get('pcr') is not None else "N/A"),
                ("Open Interest Buildup", str(opt_data.get('buildup', 'N/A')))
            ]
            
            pdf.set_font('Arial', '', 10)
            for label, val in opt_metrics:
                pdf.cell(90, 6, f"{label}:", 0, 0)
                pdf.cell(0, 6, val, 0, 1)
            pdf.ln(10)
        else:
            pdf.cell(0, 6, "Market Segment & Derivative Status:", 0, 1)
            pdf.ln(2)
            
            pdf.set_font('Arial', '', 10)
            pdf.cell(90, 6, "Derivatives Status:", 0, 0)
            pdf.cell(0, 6, "Non-F&O Stock (Cash Segment Only)", 0, 1)
            pdf.cell(90, 6, "Options Chain Analysis:", 0, 0)
            pdf.cell(0, 6, "Not Applicable", 0, 1)
            pdf.ln(4)
            pdf.set_font('Arial', 'I', 9)
            pdf.set_text_color(100, 116, 139)
            pdf.multi_cell(0, 5, f"Note: {ticker} is traded exclusively in the cash equity segment and is not listed in F&O derivatives. Price forecasts below are generated using price structure, technical momentum, and historical volatility modeling.")
            pdf.set_text_color(0, 0, 0)
            pdf.ln(8)
        
        # Projection Table (Row-based with Target, Range, and Expected Move)
        pdf.set_font('Arial', 'B', 12)
        pdf.cell(0, 6, "22-Day Forecast Trajectory & Target Ranges:", 0, 1)
        pdf.ln(3)

        pdf.set_fill_color(241, 245, 249)
        pdf.set_font('Arial', 'B', 9)
        pdf.cell(48, 7, "  Forecast Horizon", 1, 0, 'L', True)
        pdf.cell(42, 7, "Projected Target", 1, 0, 'C', True)
        pdf.cell(52, 7, "Expected Trading Range", 1, 0, 'C', True)
        pdf.cell(38, 7, "Projected Move", 1, 1, 'C', True)

        periods = [
            ("Week 1 (Day 1 - 5)", proj_list[0:5]),
            ("Week 2 (Day 6 - 10)", proj_list[5:10]),
            ("Week 3 (Day 11 - 15)", proj_list[10:15]),
            ("Week 4 (Day 16 - 20)", proj_list[15:20]),
            ("Monthly Close (Day 21 - 22)", proj_list[20:22]),
        ]

        for p_name, p_slice in periods:
            if p_slice:
                tgt = p_slice[-1]
                p_min = min(p_slice)
                p_max = max(p_slice)
                delta_pct = ((tgt - close) / close) * 100 if close > 0 else 0.0
                sign = "+" if delta_pct >= 0 else ""
                
                pdf.set_font('Arial', '', 9)
                pdf.cell(48, 7, f"  {p_name}", 1, 0, 'L')
                pdf.set_font('Arial', 'B', 9)
                pdf.cell(42, 7, f"Rs. {tgt:.2f}", 1, 0, 'C')
                pdf.set_font('Arial', '', 9)
                pdf.cell(52, 7, f"Rs. {p_min:.2f} - Rs. {p_max:.2f}", 1, 0, 'C')
                pdf.cell(38, 7, f"{sign}{delta_pct:.2f}%", 1, 1, 'C')
            else:
                pdf.set_font('Arial', '', 9)
                pdf.cell(48, 7, f"  {p_name}", 1, 0, 'L')
                pdf.cell(42, 7, f"Rs. {close:.2f}", 1, 0, 'C')
                pdf.cell(52, 7, f"Rs. {close:.2f} - Rs. {close:.2f}", 1, 0, 'C')
                pdf.cell(38, 7, "0.00%", 1, 1, 'C')
        
        pdf.ln(12)
        pdf.set_font('Arial', 'B', 10)
        pdf.cell(0, 6, "End of Analysis Report.", 0, 1, 'C')

        pdf.output(str(file_path))
        logger.info(f"PDF report successfully generated at {file_path}")
        return str(file_path.resolve())

    except Exception as e:
        logger.error(f"Error rendering PDF report for {ticker}: {e}")
        return ""
