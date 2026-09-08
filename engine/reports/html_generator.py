import logging
import json
from pathlib import Path
from datetime import datetime
from engine.database.connection import get_db_connection

logger = logging.getLogger("bsa_html_generator")

HTML_TEMPLATE = """<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>BSA Stock Analysis Report - {ticker}</title>
    <style>
        body {{ font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f8fafc; color: #1e293b; margin: 0; padding: 20px; }}
        .container {{ max-width: 1000px; margin: 0 auto; background-color: #ffffff; padding: 30px; border-radius: 12px; box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1); }}
        header {{ display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #e2e8f0; padding-bottom: 20px; margin-bottom: 30px; }}
        h1 {{ margin: 0; color: #0f172a; font-size: 28px; }}
        .badge {{ padding: 6px 12px; border-radius: 20px; font-weight: bold; font-size: 14px; text-transform: uppercase; }}
        .badge-buy {{ background-color: #dcfce7; color: #15803d; }}
        .badge-sell {{ background-color: #fee2e2; color: #b91c1c; }}
        .badge-hold {{ background-color: #fef9c3; color: #a16207; }}
        .grid {{ display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 30px; }}
        .card {{ background-color: #f8fafc; border: 1px solid #e2e8f0; padding: 20px; border-radius: 8px; }}
        .card h2 {{ margin-top: 0; color: #334155; font-size: 18px; border-bottom: 1px solid #cbd5e1; padding-bottom: 8px; }}
        .metric-row {{ display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px dashed #e2e8f0; }}
        .metric-row:last-child {{ border-bottom: none; }}
        .metric-label {{ font-weight: 500; color: #64748b; }}
        .metric-value {{ font-weight: 600; color: #0f172a; }}
        .reasons {{ background-color: #eff6ff; border-left: 4px solid #3b82f6; padding: 15px; border-radius: 4px; margin-bottom: 30px; }}
        .reasons ul {{ margin: 0; padding-left: 20px; }}
        .reasons li {{ margin-bottom: 6px; color: #1e3a8a; }}
        table {{ width: 100%; border-collapse: collapse; margin-top: 10px; }}
        th, td {{ border: 1px solid #e2e8f0; padding: 10px; text-align: center; }}
        th {{ background-color: #f1f5f9; color: #475569; font-weight: 600; }}
        tr:nth-child(even) {{ background-color: #f8fafc; }}
    </style>
</head>
<body>
    <div class="container">
        <header>
            <div>
                <h1>{company_name} ({ticker})</h1>
                <p style="color: #64748b; margin: 4px 0 0 0;">Sector: {sector} | Exchange: {exchange} | Generated: {generated_at}</p>
            </div>
            <div>
                <span class="badge badge-{signal_lower}">{overall_signal}</span>
                <span style="display: block; text-align: right; font-size: 12px; color: #64748b; margin-top: 5px;">Confidence: {confidence}%</span>
            </div>
        </header>

        <div class="reasons">
            <h3 style="margin-top: 0; color: #1e3a8a;">System Insights & Reasoning</h3>
            <ul>
                {reasons_li}
            </ul>
        </div>

        <div class="grid">
            <div class="card">
                <h2>Analysis Scores & Core Indicators</h2>
                <div class="metric-row"><span class="metric-label">Close Price</span><span class="metric-value">₹{close:.2f}</span></div>
                <div class="metric-row"><span class="metric-label">Hybrid Score</span><span class="metric-value">{hybrid_score}</span></div>
                <div class="metric-row"><span class="metric-label">Technical Score</span><span class="metric-value">{technical_score}</span></div>
                <div class="metric-row"><span class="metric-label">Fundamental Score</span><span class="metric-value">{fundamental_score}</span></div>
                <div class="metric-row"><span class="metric-label">Behavioral Score</span><span class="metric-value">{behavioral_score}</span></div>
            </div>

            <div class="card">
                <h2>F&O Derivative Insights</h2>
                <div class="metric-row"><span class="metric-label">ATM Strike</span><span class="metric-value">₹{atm_strike}</span></div>
                <div class="metric-row"><span class="metric-label">Option Support</span><span class="metric-value">₹{option_support}</span></div>
                <div class="metric-row"><span class="metric-label">Option Resistance</span><span class="metric-value">₹{option_resistance}</span></div>
                <div class="metric-row"><span class="metric-label">Put-Call Ratio (PCR)</span><span class="metric-value">{pcr}</span></div>
                <div class="metric-row"><span class="metric-label">Buildup Phase</span><span class="metric-value">{buildup}</span></div>
            </div>
        </div>

        <div class="card" style="margin-bottom: 30px;">
            <h2>News Sentiment & Smart Money Profile</h2>
            <div class="metric-row"><span class="metric-label">News Sentiment Label</span><span class="metric-value">{sentiment_label}</span></div>
            <div class="metric-row"><span class="metric-label">News Sentiment Score</span><span class="metric-value">{sentiment_score}</span></div>
            <div class="metric-row"><span class="metric-label">Smart Money Phase</span><span class="metric-value">{phase}</span></div>
            <div class="metric-row"><span class="metric-label">Accumulation Index</span><span class="metric-value">{accumulation_score}/100</span></div>
            <div class="metric-row"><span class="metric-label">Distribution Index</span><span class="metric-value">{distribution_score}/100</span></div>
        </div>

        <div class="card">
            <h2>22-Day Price Projection & Target Trajectory</h2>
            <table>
                <thead>
                    <tr>
                        <th style="text-align: left; padding-left: 15px;">Forecast Horizon</th>
                        <th>Projected Target</th>
                        <th>Expected Trading Range</th>
                        <th>Projected Move</th>
                    </tr>
                </thead>
                <tbody>
                    {proj_rows_html}
                </tbody>
            </table>
        </div>
    </div>
</body>
</html>
"""

PENDING_REPORT_TEMPLATE = """<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>Report Pending - {ticker}</title>
    <style>
        body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #09111f; color: #e2e8f0; margin: 0; padding: 40px 20px; display: flex; justify-content: center; align-items: center; min-height: 80vh; }}
        .card {{ max-width: 680px; width: 100%; background: #0f172a; border: 1px solid rgba(126, 200, 240, 0.25); border-radius: 12px; padding: 32px; box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.5); }}
        .header-tag {{ background: rgba(56, 189, 248, 0.15); color: #38bdf8; border: 1px solid rgba(56, 189, 248, 0.3); padding: 4px 10px; border-radius: 6px; font-size: 11px; font-weight: 700; letter-spacing: 1px; display: inline-block; margin-bottom: 12px; }}
        h2 {{ margin: 0 0 8px 0; color: #ffffff; font-size: 22px; font-weight: 700; }}
        .subtitle {{ color: #94a3b8; font-size: 14px; margin-bottom: 20px; }}
        .info-box {{ background: rgba(255, 255, 255, 0.03); border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 8px; padding: 16px; margin-bottom: 24px; }}
        .info-box p {{ margin: 0; color: #cbd5e1; font-size: 13.5px; line-height: 1.6; }}
        .steps-box {{ background: rgba(15, 23, 42, 0.8); border-left: 4px solid #38bdf8; border-top: 1px solid rgba(255, 255, 255, 0.05); border-right: 1px solid rgba(255, 255, 255, 0.05); border-bottom: 1px solid rgba(255, 255, 255, 0.05); padding: 18px; border-radius: 4px 8px 8px 4px; }}
        .steps-box h4 {{ margin: 0 0 12px 0; color: #38bdf8; font-size: 14px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; }}
        .steps-box ol {{ margin: 0; padding-left: 20px; color: #e2e8f0; font-size: 13px; }}
        .steps-box li {{ margin-bottom: 10px; line-height: 1.5; }}
        code {{ background: #1e293b; color: #38bdf8; padding: 3px 8px; border-radius: 4px; font-family: monospace; font-size: 12px; font-weight: 600; }}
        .footer-note {{ font-size: 12px; color: #64748b; margin-top: 24px; padding-top: 16px; border-top: 1px dashed rgba(255, 255, 255, 0.1); }}
    </style>
</head>
<body>
    <div class="card">
        <span class="header-tag">INITIAL SETUP • NO PRE-CALCULATED REPORT</span>
        <h2>Research Report Pending: {company_name} ({ticker})</h2>
        <div class="subtitle">Sector: {sector}</div>

        <div class="info-box">
            <p>
                As part of initial setup, master ticker records are present in the system, but market price history and scoring analysis have not been run for <strong>{ticker}</strong> yet.
            </p>
        </div>

        <div class="steps-box">
            <h4>📋 Steps to Generate Report & Analysis:</h4>
            <ol>
                <li>
                    <strong>Download Market Data:</strong><br>
                    Run <code>python3 -m engine.cli --mode download-spot</code> to fetch daily OHLCV price history.
                </li>
                <li>
                    <strong>Download F&amp;O Derivatives (if applicable):</strong><br>
                    Run <code>python3 -m engine.cli --mode download-fno</code> to load active options chains.
                </li>
                <li>
                    <strong>Execute Multi-Factor Scoring Engine:</strong><br>
                    Run <code>python3 -m engine.cli --mode analyze-all</code> to generate reports for all tickers.
                </li>
                <li>
                    <strong>Or Run On-Demand Single Ticker Analysis:</strong><br>
                    Run <code>python3 -m engine.cli --ticker {ticker}</code> to instantly generate data &amp; report.
                </li>
            </ol>
        </div>

        <div class="footer-note">
            💡 <strong>Initial Setup Design:</strong> Master database seeding initializes clean configuration tables without pre-populating synthetic reports.
        </div>
    </div>
</body>
</html>
"""

def generate_html_report(ticker: str, dataset: str = "intelligence") -> str:
    """
    Generate an HTML report for a specific ticker based on analysis summaries in PostgreSQL.
    Saves file under output/htmls/ and returns the absolute path.
    """
    output_dir = Path("output/htmls")
    output_dir.mkdir(parents=True, exist_ok=True)
    file_path = output_dir / f"{ticker}_report.html"

    try:
        conn = get_db_connection().__enter__()

        with conn:
            with conn.cursor() as cur:
                # Query analysis details
                cur.execute("""
                    SELECT a.close, a.technical_score, a.fundamental_score, a.behavioral_score,
                           a.hybrid_score, a.overall_signal, a.confidence, a.reasons, 
                           a.projection_22d, a.option_insights, a.news_footprint, a.updated_at,
                           m.company_name, m.sector, m.exchange
                    FROM analysis_summaries a
                    JOIN ticker_master m ON a.ticker = m.ticker
                    WHERE a.ticker = %s
                """, (ticker,))
                row = cur.fetchone()

        if not row:
            company_name = ticker
            sector_name = "Market Security"
            try:
                with get_db_connection() as conn_m:
                    with conn_m.cursor() as cur_m:
                        cur_m.execute("SELECT company_name, sector FROM ticker_master WHERE ticker = %s", (ticker,))
                        m_row = cur_m.fetchone()
                        if m_row:
                            company_name = m_row[0] or ticker
                            sector_name = m_row[1] or "Market Security"
            except Exception:
                pass

            html_pending = PENDING_REPORT_TEMPLATE.format(
                ticker=ticker,
                company_name=company_name,
                sector=sector_name
            )
            with open(file_path, "w", encoding="utf-8") as f:
                f.write(html_pending)
            logger.info(f"Generated formatted Pending Report placeholder for {ticker} at {file_path}")
            return str(file_path.resolve())

        close, tech_s, fund_s, beh_s, hyb_s, signal, conf, reasons, proj_raw, opt_raw, foot_raw, updated, name, sector, exchange = row
        
        proj_list = json.loads(proj_raw) if proj_raw else []
        opt_data = json.loads(opt_raw) if opt_raw and isinstance(opt_raw, str) else (opt_raw if isinstance(opt_raw, dict) else {})
        foot_data = json.loads(foot_raw) if foot_raw and isinstance(foot_raw, str) else (foot_raw if isinstance(foot_raw, dict) else {})

        if (not opt_data or not foot_data) and dataset != "us_intelligence":
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

        # Generate clean projection row metrics
        periods = [
            ("Week 1 (Day 1 - 5)", proj_list[0:5]),
            ("Week 2 (Day 6 - 10)", proj_list[5:10]),
            ("Week 3 (Day 11 - 15)", proj_list[10:15]),
            ("Week 4 (Day 16 - 20)", proj_list[15:20]),
            ("Monthly Close (Day 21 - 22)", proj_list[20:22]),
        ]
        
        proj_rows_html = ""
        for name_p, p_slice in periods:
            if p_slice:
                tgt = p_slice[-1]
                p_min = min(p_slice)
                p_max = max(p_slice)
                delta_pct = ((tgt - close) / close) * 100 if close > 0 else 0.0
                sign = "+" if delta_pct >= 0 else ""
                color = "#15803d" if delta_pct >= 0 else "#b91c1c"
                proj_rows_html += f"""
                <tr>
                    <td style="text-align: left; padding-left: 15px; font-weight: 600; color: #334155;">{name_p}</td>
                    <td style="font-weight: 700; color: #0f172a;">₹{tgt:.2f}</td>
                    <td style="color: #64748b;">₹{p_min:.2f} – ₹{p_max:.2f}</td>
                    <td style="font-weight: 600; color: {color};">{sign}{delta_pct:.2f}%</td>
                </tr>
                """
            else:
                proj_rows_html += f"""
                <tr>
                    <td style="text-align: left; padding-left: 15px; font-weight: 600; color: #334155;">{name_p}</td>
                    <td style="font-weight: 700; color: #0f172a;">₹{close:.2f}</td>
                    <td style="color: #64748b;">₹{close:.2f} – ₹{close:.2f}</td>
                    <td style="font-weight: 600; color: #64748b;">0.00%</td>
                </tr>
                """

        # Reasons list formatting
        reasons_li = "".join(f"<li>{r.strip()}</li>" for r in reasons.split(";") if r.strip())

        # Render HTML
        html_content = HTML_TEMPLATE.format(
            ticker=ticker,
            company_name=name,
            sector=sector,
            exchange=exchange,
            generated_at=updated.strftime("%Y-%m-%d %H:%M:%S") if updated else datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            overall_signal=signal,
            signal_lower=signal.lower(),
            confidence=conf,
            reasons_li=reasons_li,
            close=close,
            hybrid_score=hyb_s,
            technical_score=tech_s,
            fundamental_score=fund_s,
            behavioral_score=beh_s,
            atm_strike=opt_data.get("atm_strike", 0.0),
            option_support=opt_data.get("support", 0.0),
            option_resistance=opt_data.get("resistance", 0.0),
            pcr=opt_data.get("pcr", 1.0),
            buildup=opt_data.get("buildup", "Neutral"),
            sentiment_label=foot_data.get("sentiment_label", "Neutral"),
            sentiment_score=foot_data.get("sentiment_score", 0.0),
            phase=foot_data.get("phase", "Markup"),
            accumulation_score=foot_data.get("accumulation_score", 50),
            distribution_score=foot_data.get("distribution_score", 50),
            proj_rows_html=proj_rows_html
        )

        with open(file_path, "w", encoding="utf-8") as f:
            f.write(html_content)

        logger.info(f"HTML report successfully generated at {file_path}")
        return str(file_path.resolve())

    except Exception as e:
        logger.error(f"Error rendering HTML report for {ticker}: {e}")
        return ""
