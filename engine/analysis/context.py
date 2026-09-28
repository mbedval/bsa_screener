import logging
import pandas as pd
from typing import Optional, Dict, Any
from engine.database.connection import get_db_connection

logger = logging.getLogger("bsa_ticker_context")

class TickerContext:
    """
    In-memory consolidated data container for a single ticker.
    Loads OHLCV, indicators, fundamentals, and ticker metadata ONCE per stock.
    Eliminates redundant database SELECT queries across analysis modules.
    """
    def __init__(self, ticker: str):
        self.ticker: str = ticker.upper().strip()
        self.company_name: str = self.ticker
        self.sector: str = "General"
        self.exchange: str = "NS"
        self.is_fno: bool = False
        
        self.df_ohlcv: Optional[pd.DataFrame] = None
        self.df_indicators: Optional[pd.DataFrame] = None
        self.fundamentals: Dict[str, Any] = {}
        self.options_data: Optional[Dict[str, Any]] = None
        self.is_loaded: bool = False

    @classmethod
    def load(cls, ticker: str, conn=None) -> "TickerContext":
        ctx = cls(ticker)
        
        def _fetch(active_conn):
            with active_conn.cursor() as cur:
                # 1. Ticker Master
                cur.execute(
                    "SELECT company_name, sector, exchange, is_fno FROM ticker_master WHERE ticker = %s",
                    (ctx.ticker,)
                )
                tm_row = cur.fetchone()
                if tm_row:
                    ctx.company_name = tm_row[0] or ctx.ticker
                    ctx.sector = tm_row[1] or "General"
                    ctx.exchange = tm_row[2] or "NS"
                    ctx.is_fno = bool(tm_row[3]) if tm_row[3] is not None else False

                # 2. OHLCV Daily
                cur.execute("""
                    SELECT trade_date, open, high, low, close, volume, vwap
                    FROM ohlcv_daily
                    WHERE ticker = %s
                    ORDER BY trade_date ASC
                """, (ctx.ticker,))
                ohlcv_rows = cur.fetchall()
                if ohlcv_rows:
                    df = pd.DataFrame(ohlcv_rows, columns=['trade_date', 'open', 'high', 'low', 'close', 'volume', 'vwap'])
                    for col in ['open', 'high', 'low', 'close', 'volume', 'vwap']:
                        df[col] = pd.to_numeric(df[col], errors='coerce')
                    ctx.df_ohlcv = df

                # 3. Indicators Daily
                cur.execute("""
                    SELECT trade_date, rsi14, sma20, sma50, ema12, ema26, 
                           macd_line, macd_signal, macd_hist, bb_upper, bb_mid, bb_lower,
                           atr14, tenkan_sen, kijun_sen, span_a, span_b
                    FROM indicators_daily
                    WHERE ticker = %s
                    ORDER BY trade_date ASC
                """, (ctx.ticker,))
                ind_rows = cur.fetchall()
                if ind_rows:
                    df_ind = pd.DataFrame(ind_rows, columns=[
                        'trade_date', 'rsi14', 'sma20', 'sma50', 'ema12', 'ema26',
                        'macd_line', 'macd_signal', 'macd_hist', 'bb_upper', 'bb_mid', 'bb_lower',
                        'atr14', 'tenkan_sen', 'kijun_sen', 'span_a', 'span_b'
                    ])
                    for col in df_ind.columns:
                        if col != 'trade_date':
                            df_ind[col] = pd.to_numeric(df_ind[col], errors='coerce')
                    ctx.df_indicators = df_ind

                # 4. Fundamentals
                cur.execute("""
                    SELECT current_pe, debt_to_equity, is_pat_growing, fundamental_score
                    FROM fundamentals
                    WHERE ticker = %s
                    ORDER BY fetched_date DESC LIMIT 1
                """, (ctx.ticker,))
                f_row = cur.fetchone()
                if f_row:
                    ctx.fundamentals = {
                        "pe_ratio": f_row[0],
                        "debt_to_equity": f_row[1],
                        "pat_growth": 1.0 if f_row[2] else 0.0,
                        "fundamental_score": f_row[3]
                    }

            ctx.is_loaded = True

        if conn is not None:
            _fetch(conn)
        else:
            with get_db_connection() as active_conn:
                _fetch(active_conn)

        return ctx

    @property
    def latest_close(self) -> float:
        if self.df_ohlcv is not None and not self.df_ohlcv.empty:
            last_val = self.df_ohlcv['close'].dropna().iloc[-1] if not self.df_ohlcv['close'].dropna().empty else 0.0
            return float(last_val)
        return 0.0
