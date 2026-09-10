import logging
from datetime import datetime
from engine.database.connection import get_db_connection

logger = logging.getLogger(__name__)

def ensure_retracement_table(conn):
    """Ensures retracement_speculator_patterns table exists in database with consolidation columns."""
    with conn.cursor() as cur:
        cur.execute("""
            CREATE TABLE IF NOT EXISTS retracement_speculator_patterns (
                ticker VARCHAR(50) PRIMARY KEY,
                company_name TEXT,
                sector TEXT,
                cap_type TEXT DEFAULT 'MID',
                cmp DOUBLE PRECISION DEFAULT 0.0,
                swing_high DOUBLE PRECISION DEFAULT 0.0,
                swing_low DOUBLE PRECISION DEFAULT 0.0,
                fib_retracement_level VARCHAR(20) DEFAULT '50.0%',
                fib_retracement_pct DOUBLE PRECISION DEFAULT 50.0,
                q1_buy_dump_ratio DOUBLE PRECISION DEFAULT 1.0,
                q2_buy_dump_ratio DOUBLE PRECISION DEFAULT 1.0,
                q3_buy_dump_ratio DOUBLE PRECISION DEFAULT 1.0,
                q4_buy_dump_ratio DOUBLE PRECISION DEFAULT 1.0,
                financial_year_tax_cycle_bias TEXT DEFAULT 'Balanced',
                consolidation_days INT DEFAULT 0,
                breakout_stage TEXT DEFAULT 'Consolidating',
                speculator_behavior_score DOUBLE PRECISION DEFAULT 50.0,
                behavioral_insight TEXT,
                analyzed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        """)
        # Auto-migrate table if missing new columns
        cur.execute("""
            ALTER TABLE retracement_speculator_patterns ADD COLUMN IF NOT EXISTS consolidation_days INT DEFAULT 0;
            ALTER TABLE retracement_speculator_patterns ADD COLUMN IF NOT EXISTS breakout_stage TEXT DEFAULT 'Consolidating';
            ALTER TABLE retracement_speculator_patterns DROP COLUMN IF EXISTS technical_speculator_bias;
            ALTER TABLE retracement_speculator_patterns DROP COLUMN IF EXISTS fundamental_speculator_bias;
        """)
        conn.commit()

def generate_retracement_speculator_analysis(conn=None) -> bool:
    """
    Computes 52-week Fibonacci Retracement levels, quarterly speculator buy/dump volume ratios,
    financial year tax-cycle biases, consolidation period (days spent in tight rest range before breakout),
    and speculator behavior scores across all active tickers.
    Saves pre-calculated results into PostgreSQL table.
    """
    def _run_with_conn(active_conn):
        ensure_retracement_table(active_conn)
        logger.info("Generating Retracement Pattern & Speculator Behavior analysis with Consolidation Days for database...")

        with active_conn.cursor() as cur:
            cur.execute("TRUNCATE TABLE retracement_speculator_patterns;")
            
            # Fetch tickers with OHLCV data over the last 365 days
            cur.execute("""
                SELECT 
                    o.ticker,
                    COALESCE(m.company_name, o.ticker) AS company_name,
                    COALESCE(m.sector, 'General') AS sector,
                    MAX(o.high) AS swing_high,
                    MIN(o.low) AS swing_low,
                    (ARRAY_AGG(o.close ORDER BY o.trade_date DESC))[1] AS cmp,
                    COUNT(o.trade_date) AS total_days,
                    -- Q1: Apr-Jun
                    COALESCE(SUM(CASE WHEN EXTRACT(MONTH FROM o.trade_date::date) IN (4,5,6) AND o.close >= o.open THEN o.volume ELSE 0 END)::float / 
                             NULLIF(SUM(CASE WHEN EXTRACT(MONTH FROM o.trade_date::date) IN (4,5,6) AND o.close < o.open THEN o.volume ELSE 0 END), 0), 1.0) AS q1_ratio,
                    -- Q2: Jul-Sep
                    COALESCE(SUM(CASE WHEN EXTRACT(MONTH FROM o.trade_date::date) IN (7,8,9) AND o.close >= o.open THEN o.volume ELSE 0 END)::float / 
                             NULLIF(SUM(CASE WHEN EXTRACT(MONTH FROM o.trade_date::date) IN (7,8,9) AND o.close < o.open THEN o.volume ELSE 0 END), 0), 1.0) AS q2_ratio,
                    -- Q3: Oct-Dec
                    COALESCE(SUM(CASE WHEN EXTRACT(MONTH FROM o.trade_date::date) IN (10,11,12) AND o.close >= o.open THEN o.volume ELSE 0 END)::float / 
                             NULLIF(SUM(CASE WHEN EXTRACT(MONTH FROM o.trade_date::date) IN (10,11,12) AND o.close < o.open THEN o.volume ELSE 0 END), 0), 1.0) AS q3_ratio,
                    -- Q4: Jan-Mar (Tax Loss / Financial Year-End Profit Taking)
                    COALESCE(SUM(CASE WHEN EXTRACT(MONTH FROM o.trade_date::date) IN (1,2,3) AND o.close >= o.open THEN o.volume ELSE 0 END)::float / 
                             NULLIF(SUM(CASE WHEN EXTRACT(MONTH FROM o.trade_date::date) IN (1,2,3) AND o.close < o.open THEN o.volume ELSE 0 END), 0), 1.0) AS q4_ratio,
                    -- Tech & Fund scores
                    COALESCE(MAX(a.technical_score), 50.0) AS tech_score,
                    COALESCE(MAX(a.fundamental_score), 50.0) AS fund_score
                FROM ohlcv_daily o
                LEFT JOIN ticker_master m ON UPPER(o.ticker) = UPPER(m.ticker)
                LEFT JOIN analysis_summaries a ON UPPER(o.ticker) = UPPER(a.ticker)
                WHERE o.trade_date::date >= (SELECT MAX(trade_date::date) FROM ohlcv_daily) - INTERVAL '365 days'
                GROUP BY o.ticker, m.company_name, m.sector
                HAVING COUNT(o.trade_date) >= 30 AND MAX(o.high) > MIN(o.low)
            """)

            rows = cur.fetchall()
            if not rows:
                logger.warning("No daily OHLCV rows found to compute retracement patterns.")
                return False

            # Query detailed daily price history per ticker to calculate exact Consolidation Days
            cur.execute("""
                SELECT ticker, trade_date::date, high, low, close, volume
                FROM ohlcv_daily
                WHERE trade_date::date >= (SELECT MAX(trade_date::date) FROM ohlcv_daily) - INTERVAL '180 days'
                ORDER BY ticker, trade_date ASC;
            """)
            all_ohlcv = cur.fetchall()

            ticker_ohlcv_map = {}
            for r in all_ohlcv:
                t = r[0]
                if t not in ticker_ohlcv_map:
                    ticker_ohlcv_map[t] = []
                ticker_ohlcv_map[t].append({'date': r[1], 'high': float(r[2] or 0), 'low': float(r[3] or 0), 'close': float(r[4] or 0), 'vol': float(r[5] or 0)})

            records_to_insert = []

            for row in rows:
                ticker, company_name, sector, swing_high, swing_low, cmp, total_days, q1_ratio, q2_ratio, q3_ratio, q4_ratio, tech_score, fund_score = row

                swing_high = float(swing_high or 0.0)
                swing_low = float(swing_low or 0.0)
                cmp = float(cmp or 0.0)
                q1_ratio = round(float(q1_ratio or 1.0), 2)
                q2_ratio = round(float(q2_ratio or 1.0), 2)
                q3_ratio = round(float(q3_ratio or 1.0), 2)
                q4_ratio = round(float(q4_ratio or 1.0), 2)
                tech_score = float(tech_score or 50.0)
                fund_score = float(fund_score or 50.0)

                range_diff = swing_high - swing_low
                if range_diff <= 0:
                    continue

                # Calculate Retracement % from Swing High
                fib_pct = round(((swing_high - cmp) / range_diff) * 100.0, 1)
                
                # Classify nearest Fibonacci Level
                if fib_pct <= 28.7:
                    fib_level = '23.6%'
                elif fib_pct <= 44.1:
                    fib_level = '38.2%'
                elif fib_pct <= 55.9:
                    fib_level = '50.0%'
                elif fib_pct <= 70.2:
                    fib_level = '61.8%'
                else:
                    fib_level = '78.6%'

                # Determine Financial Year Tax Cycle Bias
                if q4_ratio < 0.75 and q1_ratio > 1.25:
                    tax_cycle_bias = 'Q4 Tax Loss Dump -> Q1 Rebalancing'
                elif q4_ratio > 1.40:
                    tax_cycle_bias = 'Q4 Pre-FY Profit Accumulation'
                elif q3_ratio < 0.70:
                    tax_cycle_bias = 'Q3 Mid-Year Tax Booking'
                elif q1_ratio > 1.30:
                    tax_cycle_bias = 'Q1 Post-Budget Accumulation'
                else:
                    tax_cycle_bias = 'Balanced Quarterly Rhythm'

                # Calculate Rest Period / Consolidation Days before Breakout
                # Definition: Count of consecutive trading days prior to recent rally/breakout where daily price fluctuated within a tight rest band (<= 6.5% range)
                history = ticker_ohlcv_map.get(ticker, [])
                consolidation_days = 0
                breakout_stage = 'Consolidating'

                if len(history) >= 10:
                    recent_closes = [h['close'] for h in history[-20:]]
                    recent_max = max(recent_closes)
                    recent_min = min(recent_closes)
                    latest_close = history[-1]['close']

                    # Check if currently breaking out above recent rest range
                    if latest_close >= recent_max * 0.98:
                        breakout_stage = 'Breakout Confirmed'
                    elif latest_close <= recent_min * 1.02:
                        breakout_stage = 'Breakdown Risk'
                    else:
                        breakout_stage = 'Resting Range'

                    # Backward scan to measure duration of tight rest consolidation range (within 6.5% high-low band)
                    tight_days = 0
                    for i in range(len(history) - 1, 0, -1):
                        window = history[max(0, i-5):i+1]
                        w_high = max(h['high'] for h in window)
                        w_low = min(h['low'] for h in window)
                        if w_low > 0 and ((w_high - w_low) / w_low) <= 0.08: # Rest range band
                            tight_days += 1
                        else:
                            if tight_days >= 3:
                                break
                    consolidation_days = max(3, tight_days)
                else:
                    consolidation_days = 5

                # Calculate Speculator Behavior Score (0 - 100)
                fib_score = 100.0 - abs(fib_pct - 50.0)
                quarterly_balance_score = min(100.0, max(20.0, ((q1_ratio + q2_ratio + q3_ratio + q4_ratio) / 4.0) * 50.0))
                consolidation_score = min(100.0, consolidation_days * 3.5) # Reward healthy rest base
                speculator_score = round((fib_score * 0.30) + (quarterly_balance_score * 0.30) + (consolidation_score * 0.25) + (tech_score * 0.15), 1)

                insight = f"{ticker} spent {consolidation_days} days in rest consolidation before reaching {breakout_stage} at {fib_level} Fib retracement with {tax_cycle_bias} (Q4 Buy/Dump: {q4_ratio}x)."

                records_to_insert.append((
                    ticker, company_name, sector, 'MID', cmp, swing_high, swing_low,
                    fib_level, fib_pct, q1_ratio, q2_ratio, q3_ratio, q4_ratio,
                    tax_cycle_bias, consolidation_days, breakout_stage, speculator_score, insight
                ))

            cur.executemany("""
                INSERT INTO retracement_speculator_patterns (
                    ticker, company_name, sector, cap_type, cmp, swing_high, swing_low,
                    fib_retracement_level, fib_retracement_pct, q1_buy_dump_ratio, q2_buy_dump_ratio,
                    q3_buy_dump_ratio, q4_buy_dump_ratio, financial_year_tax_cycle_bias,
                    consolidation_days, breakout_stage, speculator_behavior_score, behavioral_insight
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (ticker) DO UPDATE SET
                    cmp = EXCLUDED.cmp,
                    swing_high = EXCLUDED.swing_high,
                    swing_low = EXCLUDED.swing_low,
                    fib_retracement_level = EXCLUDED.fib_retracement_level,
                    fib_retracement_pct = EXCLUDED.fib_retracement_pct,
                    q1_buy_dump_ratio = EXCLUDED.q1_buy_dump_ratio,
                    q2_buy_dump_ratio = EXCLUDED.q2_buy_dump_ratio,
                    q3_buy_dump_ratio = EXCLUDED.q3_buy_dump_ratio,
                    q4_buy_dump_ratio = EXCLUDED.q4_buy_dump_ratio,
                    financial_year_tax_cycle_bias = EXCLUDED.financial_year_tax_cycle_bias,
                    consolidation_days = EXCLUDED.consolidation_days,
                    breakout_stage = EXCLUDED.breakout_stage,
                    speculator_behavior_score = EXCLUDED.speculator_behavior_score,
                    behavioral_insight = EXCLUDED.behavioral_insight,
                    analyzed_at = CURRENT_TIMESTAMP;
            """, records_to_insert)

            active_conn.commit()
            logger.info(f"Successfully generated {len(records_to_insert)} Retracement & Consolidation Days records.")
            return True

    if conn is not None:
        return _run_with_conn(conn)
    else:
        with get_db_connection() as new_conn:
            return _run_with_conn(new_conn)
