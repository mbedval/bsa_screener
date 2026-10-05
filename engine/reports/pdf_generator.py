import math
import os
import logging
import json
import random
from pathlib import Path
from datetime import datetime
from fpdf import FPDF
from engine.reports.pdf_htf_indicators import calculate_htf_indicators
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
    def __init__(self, title_text: str, timestamp_str: str, user_name: str = None):
        super().__init__()
        self.title_text = title_text
        self.timestamp_str = timestamp_str
        self.user_name = user_name

    def header(self):
        # Header only on subsequent pages
        if self.page_no() > 1:
            self.set_fill_color(30, 41, 59)
            self.rect(0, 0, 210, 20, 'F')
                
            self.set_text_color(255, 255, 255)
            self.set_font('Arial', 'B', 14)
            self.set_xy(10, 7)
            self.cell(0, 6, "BSA Logo", 0, 0, 'L')
            
            if self.user_name:
                self.set_font('Arial', 'B', 10)
                self.set_xy(100, 4)
                self.cell(100, 6, f"Doc name: {self.title_text}", 0, 1, 'R')
                self.set_font('Arial', '', 8)
                self.set_xy(100, 10)
                self.cell(100, 6, f"User : {self.user_name}", 0, 0, 'R')
            else:
                self.set_font('Arial', 'B', 12)
                self.set_xy(130, 7)
                self.cell(70, 6, f"{self.title_text}", 0, 0, 'R')
            
            self.set_text_color(0, 0, 0)
            self.set_y(25)

    def footer(self):
        # Footer only on subsequent pages
        if self.page_no() > 1:
            self.set_y(-15)
            self.set_font('Arial', 'I', 8)
            self.set_text_color(128, 128, 128)
            self.cell(0, 10, f"Page {self.page_no()} | Bindsol Stock Analysis (BSA) | Generated: {self.timestamp_str}", 0, 0, 'C')


def _add_disclaimer_page(pdf):
    pdf.add_page()
    pdf.set_y(45)
    pdf.set_font('Arial', 'B', 26)
    pdf.cell(0, 15, "Bindsol Stock Analysis (BSA)", 0, 1, 'C')
    pdf.ln(5)
    
    pdf.set_font('Arial', '', 12)
    intro_text = (
        "BSA is a state-of-the-art quantitative stock screener and analysis platform "
        "designed to uncover hidden market opportunities, assess fundamental valuations, "
        "and track technical momentum."
    )
    pdf.multi_cell(0, 8, intro_text)
    pdf.ln(20)
    
    pdf.set_font('Arial', 'B', 16)
    pdf.cell(0, 10, "Disclaimer", 0, 1, 'L')
    pdf.set_font('Arial', '', 10)
    
    disclaimer_path = Path("doc/disclaimer.md")
    if disclaimer_path.exists():
        with open(disclaimer_path, "r", encoding="utf-8") as f:
            disclaimer_text = f.read()
        clean_text = disclaimer_text.replace('# Legal Disclaimer', '').strip()
        pdf.multi_cell(0, 6, clean_text)
    else:
        pdf.multi_cell(0, 6, "The information contained in this report is intended solely for analysis. It does not constitute investment advice. Trading in equities and derivatives involves substantial risk.")


def _add_summary_page(pdf, tickers, conn):
    """Adds a summary matrix page for up to 20 tickers."""
    pdf.add_page()
    
    pdf.set_font('Arial', 'B', 14)
    pdf.cell(0, 10, "Ticker Summary", 0, 1, 'C')
    pdf.ln(5)
    
    # We pack the table tightly (Portrait) using smaller font
    pdf.set_font('Arial', 'B', 7)
    pdf.set_fill_color(30, 41, 59)
    pdf.set_text_color(255, 255, 255)
    
    cols = [
        ("Ticker", 18),
        ("Call Setup", 20),
        ("Entry", 15),
        ("Stop", 15),
        ("Target", 20),
        ("22-D Proj", 25),
        ("S2-S1 Zone", 30),
        ("R1-R2 Zone", 30)
    ]
    
    for title, width in cols:
        pdf.cell(width, 8, title, 1, 0, 'C', True)
    pdf.ln()
    
    pdf.set_text_color(0, 0, 0)
    pdf.set_font('Arial', '', 6)
    with conn.cursor() as cur:
        for ticker in tickers:
            # Fetch Call setup dynamically from mock logic or DB
            # Fetch Entry, Stop, Target
            cur.execute("SELECT entry_price, stop_loss, target_price, recommended_call FROM historical_calls WHERE ticker = %s ORDER BY id DESC LIMIT 1", (ticker,))
            call_row = cur.fetchone()
            # Check intraday_call if historical_calls is empty
            if not call_row:
                cur.execute("SELECT entry_price, stop_loss, target_price, signal FROM intraday_call WHERE ticker = %s ORDER BY id DESC LIMIT 1", (ticker,))
                call_row = cur.fetchone()
                
            entry = f"{call_row[0]:.1f}" if call_row and call_row[0] else "N/A"
            stop = f"{call_row[1]:.1f}" if call_row and call_row[1] else "N/A"
            target = f"{call_row[2]:.1f}" if call_row and call_row[2] else "N/A"
            setup_val = str(call_row[3]).upper() if call_row and call_row[3] else "HOLD"
            
            cur.execute("SELECT projection_22d FROM analysis_summaries WHERE ticker = %s", (ticker,))
            proj_row = cur.fetchone()
            proj = "N/A"
            if proj_row and proj_row[0]:
                try:
                    import json
                    proj_arr = json.loads(proj_row[0])
                    if proj_arr:
                        proj = f"{proj_arr[-1]:.2f}"
                except Exception:
                    pass
            
            # Real Support/Resistance using standard floor pivots
            cur.execute("SELECT high, low, close FROM ohlcv_daily WHERE ticker = %s ORDER BY trade_date DESC LIMIT 1", (ticker,))
            ohlcv_row = cur.fetchone()
            if ohlcv_row and all(v is not None for v in ohlcv_row):
                high, low, close = ohlcv_row
                pivot = (high + low + close) / 3
                r1 = (2 * pivot) - low
                s1 = (2 * pivot) - high
                r2 = pivot + (high - low)
                s2 = pivot - (high - low)
                s2_s1 = f"{s2:.1f} - {s1:.1f}"
                r1_r2 = f"{r1:.1f} - {r2:.1f}"
            else:
                s2_s1 = "N/A"
                r1_r2 = "N/A"
            
            pdf.set_font('Arial', 'B', 6)
            pdf.set_fill_color(241, 245, 249)
            pdf.cell(cols[0][1], 6, ticker, 1, 0, 'C', True)
            pdf.set_font('Arial', '', 6)
            
            # Setup Color
            if setup_val in ["STRONG BUY", "BUY"]: pdf.set_text_color(34, 197, 94)
            elif setup_val in ["STRONG SELL", "SELL"]: pdf.set_text_color(239, 68, 68)
            else: pdf.set_text_color(0, 0, 0)
            
            pdf.cell(cols[1][1], 6, setup_val, 1, 0, 'C')
            pdf.set_text_color(0, 0, 0)
            
            pdf.cell(cols[2][1], 6, entry, 1, 0, 'C')
            pdf.cell(cols[3][1], 6, stop, 1, 0, 'C')
            pdf.cell(cols[4][1], 6, target, 1, 0, 'C')
            pdf.cell(cols[5][1], 6, proj, 1, 0, 'C')
            pdf.cell(cols[6][1], 6, s2_s1, 1, 0, 'C')
            pdf.cell(cols[7][1], 6, r1_r2, 1, 1, 'C')


def _add_ticker_detail_page(pdf, ticker, conn):
    """Adds the detailed analysis page for a specific ticker."""
    pdf.add_page()
    
    with conn.cursor() as cur:
        # Query ticker master metadata
        cur.execute("SELECT company_name, sector, is_fno FROM ticker_master WHERE ticker = %s", (ticker,))
        row = cur.fetchone()
        name = row[0] if row else ticker
        sector = row[1] if row else "N/A"

        # Fetch fundamentals metrics
        cur.execute("SELECT current_pe, last_pat, last_other_income FROM fundamentals WHERE ticker = %s ORDER BY fetched_date DESC LIMIT 1", (ticker,))
        fund_row = cur.fetchone()
        pe = f"{float(fund_row[0]):.2f}" if fund_row and fund_row[0] is not None else "N/A"
        l_pat = float(fund_row[1]) if fund_row and fund_row[1] is not None else 0.0
        l_oth = float(fund_row[2]) if fund_row and fund_row[2] is not None else 0.0
        pat = format_crores(l_pat, prefix="Rs. ") if l_pat != 0.0 else "N/A"
        
        cf_val = l_pat + l_oth
        cash_flow = format_crores(cf_val, prefix="Rs. ") if cf_val != 0.0 else "N/A"
        
        # Sector PE
        cur.execute("""
            SELECT AVG(f.current_pe) FILTER (WHERE f.current_pe > 0 AND f.current_pe < 500) 
            FROM fundamentals f JOIN ticker_master tm ON f.ticker = tm.ticker 
            WHERE tm.sector = %s
        """, (sector,))
        sec_row = cur.fetchone()
        sec_pe = f"{float(sec_row[0]):.2f}" if sec_row and sec_row[0] is not None else "N/A"

        # Risk & Opportunity
        cur.execute("SELECT risk, opportunities FROM opportunities_risk WHERE ticker = %s", (ticker,))
        ro_row = cur.fetchone()
        risks = ro_row[0] if ro_row and ro_row[0] else "No significant risks identified in the system."
        opps = ro_row[1] if ro_row and ro_row[1] else "No significant opportunities identified in the system."

        # Fetch technical indicators daily
        cur.execute("""
            SELECT rsi14, sma20, macd_line, ema12, ema26, macd_signal, bb_upper, bb_mid, bb_lower, tenkan_sen, kijun_sen, span_a, span_b 
            FROM indicators_daily WHERE ticker = %s ORDER BY trade_date DESC LIMIT 1
        """, (ticker,))
        ind_row = cur.fetchone()
        
        cur.execute("SELECT close FROM ohlcv_daily WHERE ticker = %s ORDER BY trade_date DESC LIMIT 1", (ticker,))
        price_row = cur.fetchone()
        close_px = float(price_row[0]) if price_row and price_row[0] is not None else None
        
        ind_data = {}
        if ind_row:
            cols = ["rsi14", "sma20", "macd_line", "ema12", "ema26", "macd_signal", "bb_upper", "bb_mid", "bb_lower", "tenkan_sen", "kijun_sen", "span_a", "span_b"]
            for i, col in enumerate(cols):
                ind_data[col] = float(ind_row[i]) if ind_row[i] is not None else None

    indicators = [
        "VWAP Signal", "Pivot Signal", "Breakout signal", "RSI", 
        "ADX signal", "Donchain upper", "Bollinger signal", "EMA20 signal", 
        "EMA26", "MACD Signal", "OBV Signal", "Super trend signal", 
        "Fibonacci signal", "Ichimoku signal", "SMA100 Signal"
    ]
    
    
    val_strs_w, signals_w, val_strs_m, signals_m, val_strs_q, signals_q, val_strs_i, signals_i = calculate_htf_indicators(ticker, conn, indicators)

    def evaluate_setup(period_signals, primary_keys, secondary_keys):
        score = 0
        primary_bull = 0
        primary_bear = 0
        total_signals = 0
        
        for k, sig in period_signals.items():
            if sig != "Neutral":
                total_signals += 1
            w = 2 if k in primary_keys else (1 if k in secondary_keys else 0.5)
            val = 1 if "Bullish" in sig or "Oversold" in sig else (-1 if "Bearish" in sig or "Overbought" in sig else 0)
            if k in primary_keys:
                if val > 0: primary_bull += 1
                elif val < 0: primary_bear += 1
            score += val * w
            
        if total_signals == 0:
            return "N/A"
            
        if score > 4 and primary_bull > 0: return "Strong Buy"
        elif score > 1: return "Buy"
        elif score < -4 and primary_bear > 0: return "Strong Sell"
        elif score < -1: return "Sell"
        else: return "Hold"

    setup_q = evaluate_setup(signals_q, ["SMA100 Signal", "MACD Signal"], [])
    setup_m = evaluate_setup(signals_m, ["MACD Signal", "SMA100 Signal", "Super trend signal", "Ichimoku signal"], ["RSI", "Bollinger signal"])
    setup_w = evaluate_setup(signals_w, ["MACD Signal", "SMA100 Signal", "Super trend signal", "Ichimoku signal"], ["RSI", "Bollinger signal"])
    setup_i = evaluate_setup(signals_i, ["VWAP Signal", "RSI", "EMA20 signal"], ["Pivot Signal", "Breakout signal"])

    def generate_insight(period, setup, signals, primary_keys):
        strong_signals = [k for k in primary_keys if "Bullish" in signals[k] or "Oversold" in signals[k] or "Bearish" in signals[k] or "Overbought" in signals[k]]
        dominant = f"{strong_signals[0]} showing {signals[strong_signals[0]]}" if strong_signals else "mixed signals"
            
        if setup in ["Strong Buy", "Buy"]:
            return f"The {period.lower()} setup is marked as {setup}. This is primarily driven by {dominant}, indicating sustained upward momentum."
        elif setup in ["Strong Sell", "Sell"]:
            return f"The {period.lower()} setup is marked as {setup}. This is heavily influenced by {dominant}, pointing to downward pressure."
        else:
            return f"The {period.lower()} setup is currently a {setup}, as {dominant} is offset by conflicting secondary indicators."
            
    insight_q = generate_insight("Quarterly", setup_q, signals_q, ["SMA100 Signal", "MACD Signal"])
    insight_m = generate_insight("Monthly", setup_m, signals_m, ["MACD Signal", "SMA100 Signal", "Super trend signal", "Ichimoku signal"])
    insight_w = generate_insight("Weekly", setup_w, signals_w, ["MACD Signal", "SMA100 Signal", "Super trend signal", "Ichimoku signal"])
    insight_i = generate_insight("Intraday", setup_i, signals_i, ["VWAP Signal", "RSI", "EMA20 signal"])

    # 1.1 About Company
    pdf.set_font('Arial', 'B', 11)
    pdf.set_fill_color(241, 245, 249)
    pdf.cell(180, 8, f"  1.1 About {name}", 1, 1, 'L', True)
    
    pdf.set_font('Arial', '', 9)
    company_info = f"{name} operates in the {sector} sector."
    pdf.multi_cell(180, 6, company_info, 1, 'L')
    pdf.ln(5)
    
    # 1.2 Trade Setup (Formerly Insights)
    pdf.set_font('Arial', 'B', 11)
    pdf.set_fill_color(241, 245, 249)
    pdf.cell(180, 8, "  1.2 Trade Setup", 1, 1, 'L', True)
    
    pdf.set_text_color(0, 0, 0)
    pdf.set_font('Arial', '', 9)
    
    pdf.multi_cell(180, 6, insight_i, 1, 'L')
    pdf.ln(4)

    # 1.3 Fundamental Info
    pdf.set_font('Arial', 'B', 11)
    pdf.set_fill_color(241, 245, 249)
    pdf.cell(180, 8, "  1.3 Fundamental Info", 1, 1, 'L', True)
    
    pdf.set_font('Arial', 'B', 9)
    pdf.cell(45, 7, "Current PE", 1, 0, 'C')
    pdf.cell(45, 7, "Sector PE", 1, 0, 'C')
    pdf.cell(45, 7, "PAT", 1, 0, 'C')
    pdf.cell(45, 7, "Cash Flow", 1, 1, 'C')
    
    pdf.set_font('Arial', '', 9)
    pdf.cell(45, 7, pe, 1, 0, 'C')
    pdf.cell(45, 7, sec_pe, 1, 0, 'C')
    pdf.cell(45, 7, pat, 1, 0, 'C')
    pdf.cell(45, 7, cash_flow, 1, 1, 'C')
    pdf.ln(5)

    # 1.4 Risk and Opportunity (Formerly 1.2)
    pdf.set_font('Arial', 'B', 11)
    pdf.set_fill_color(241, 245, 249)
    pdf.cell(180, 8, "  1.4 Risk and Opportunity", 1, 1, 'L', True)
    
    pdf.set_font('Arial', '', 9)
    x_start = pdf.get_x()
    y_start = pdf.get_y()
    
    if risks != "No significant risks identified in the system.":
        pdf.set_text_color(239, 68, 68)
    pdf.multi_cell(90, 6, risks, 1, 'L')
    pdf.set_text_color(0, 0, 0)
    y_end1 = pdf.get_y()
    
    pdf.set_xy(x_start + 90, y_start)
    if opps != "No significant opportunities identified in the system.":
        pdf.set_text_color(34, 197, 94)
    pdf.multi_cell(90, 6, opps, 1, 'L')
    pdf.set_text_color(0, 0, 0)
    y_end2 = pdf.get_y()
    
    pdf.set_y(max(y_end1, y_end2))
    pdf.ln(5)
    
    # 1.5 Technical Info (Formerly 1.4)
    pdf.set_font('Arial', 'B', 11)
    pdf.set_fill_color(241, 245, 249)
    pdf.cell(180, 8, "  1.5 Technical Info", 1, 1, 'L', True)
    
    pdf.set_font('Arial', 'B', 8)
    pdf.set_fill_color(30, 41, 59)
    pdf.set_text_color(255, 255, 255)
    col_w = 180 / 5
    pdf.cell(col_w, 7, "Indicator", 1, 0, 'C', True)
    pdf.cell(col_w, 7, "Quarterly", 1, 0, 'C', True)
    pdf.cell(col_w, 7, "Monthly", 1, 0, 'C', True)
    pdf.cell(col_w, 7, "Weekly", 1, 0, 'C', True)
    pdf.cell(col_w, 7, "Intraday", 1, 1, 'C', True)
    
    pdf.set_text_color(0, 0, 0)
    pdf.set_font('Arial', '', 7)
    
    def print_colored_cell(val_str, sig, is_last=False):
        if "Bullish" in sig or "Oversold" in sig:
            pdf.set_text_color(34, 197, 94)
        elif "Bearish" in sig or "Overbought" in sig:
            pdf.set_text_color(239, 68, 68)
        else:
            pdf.set_text_color(0, 0, 0)
        pdf.cell(col_w, 6, val_str, 1, 1 if is_last else 0, 'C')
        pdf.set_text_color(0, 0, 0)
    
    for ind in indicators:
        pdf.set_font('Arial', 'B', 7)
        pdf.set_fill_color(241, 245, 249)
        pdf.cell(col_w, 6, ind, 1, 0, 'L', True)
        pdf.set_font('Arial', '', 7)
        
        print_colored_cell(val_strs_q.get(ind, "N/A"), signals_q.get(ind, "Neutral"))
        print_colored_cell(val_strs_m.get(ind, "N/A"), signals_m.get(ind, "Neutral"))
        print_colored_cell(val_strs_w.get(ind, "N/A"), signals_w.get(ind, "Neutral"))
        print_colored_cell(val_strs_i.get(ind, "N/A"), signals_i.get(ind, "Neutral"), is_last=True)
        
    # Overall Consensus Row
    pdf.set_font('Arial', 'B', 9)
    pdf.set_fill_color(241, 245, 249)
    pdf.cell(col_w, 7, "Overall Trade Setup", 1, 0, 'L', True)
    
    def print_overall_cell(val, is_last=False):
        val = str(val).upper()
        if val in ["STRONG BUY", "BUY"]:
            pdf.set_text_color(34, 197, 94)
        elif val in ["STRONG SELL", "SELL"]:
            pdf.set_text_color(239, 68, 68)
        else:
            pdf.set_text_color(0, 0, 0)
        pdf.cell(col_w, 7, val, 1, 1 if is_last else 0, 'C', True)
        pdf.set_text_color(0, 0, 0)

    print_overall_cell(setup_q)
    print_overall_cell(setup_m)
    print_overall_cell(setup_w)
    print_overall_cell(setup_i, is_last=True)
    pdf.ln(5)
def generate_pdf_report(ticker: str) -> str:
    """
    Generate a professional multi-page vector PDF report for a specific ticker based on analysis summaries in PostgreSQL.
    Saves file under output/pdf/ and returns the absolute path.
    """
    output_dir = Path("output/pdf")
    output_dir.mkdir(parents=True, exist_ok=True)
    file_path = output_dir / f"{ticker}_report.pdf"

    try:
        timestamp_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        pdf = BSAPDF(f"{ticker} Report", timestamp_str)
        pdf.set_margins(15, 20, 15)
        pdf.set_auto_page_break(auto=True, margin=15)
        
        _add_disclaimer_page(pdf)
        
        with get_db_connection() as conn:
            _add_ticker_detail_page(pdf, ticker, conn)

        pdf.output(str(file_path))
        logger.info(f"PDF report successfully generated at {file_path}")
        return str(file_path.resolve())

    except Exception as e:
        logger.error(f"Error rendering PDF report for {ticker}: {e}")
        return ""


def generate_newsletter_pdfs(user_id: str, tickers: list[str], user_name: str = None) -> list[str]:
    """
    Generate batch PDF reports for a list of tickers, splitting them into chunks of 20.
    Returns a list of generated file paths.
    """
    output_dir = Path("output/pdf")
    output_dir.mkdir(parents=True, exist_ok=True)
    
    generated_files = []
    chunk_size = 20
    timestamp_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    
    try:
        with get_db_connection() as conn:
            for i in range(0, len(tickers), chunk_size):
                chunk = tickers[i:i + chunk_size]
                part_num = (i // chunk_size) + 1
                
                file_name = f"newsletter_{user_id}_part{part_num}.pdf" if len(tickers) > chunk_size else f"newsletter_{user_id}.pdf"
                file_path = output_dir / file_name
                
                pdf = BSAPDF("Newsletter", timestamp_str, user_name=user_name)
                pdf.set_margins(15, 20, 15)
                pdf.set_auto_page_break(auto=True, margin=15)
                
                # Page 1: Disclaimer
                _add_disclaimer_page(pdf)
                
                # Page 2: Summary Page for the chunk
                _add_summary_page(pdf, chunk, conn)
                
                # Pages 3+: Individual Ticker Details
                for ticker in chunk:
                    _add_ticker_detail_page(pdf, ticker, conn)
                    
                pdf.output(str(file_path))
                generated_files.append(str(file_path.resolve()))
                
        return generated_files

    except Exception as e:
        logger.error(f"Error rendering newsletter PDFs for user {user_id}: {e}")
        return generated_files


def generate_pdf_report(ticker: str) -> str:
    """
    Generate a quick PDF report for a single ticker.
    """
    output_dir = Path("output/pdf")
    output_dir.mkdir(parents=True, exist_ok=True)
    file_path = output_dir / f"{ticker}_report.pdf"
    
    timestamp_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    
    pdf = BSAPDF(f"{ticker} Quick Report", timestamp_str)
    pdf.set_margins(15, 20, 15)
    pdf.set_auto_page_break(auto=True, margin=15)
    
    try:
        with get_db_connection() as conn:
            _add_disclaimer_page(pdf)
            _add_ticker_detail_page(pdf, ticker, conn)
            
        pdf.output(str(file_path))
        return str(file_path.resolve())
    except Exception as e:
        import traceback; traceback.print_exc()
        return ""
