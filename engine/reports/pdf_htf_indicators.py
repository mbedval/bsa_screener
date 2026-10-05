import pandas as pd
import pandas_ta_classic as ta

def calculate_htf_indicators(ticker, conn, indicators):
    """
    Fetches daily OHLCV data, resamples to I, W, M, Q, and calculates
    all 15 indicators including RSI, MACD, Bollinger Bands, SMA, EMA, Ichimoku,
    VWAP, ADX, Donchian, OBV, Supertrend, Fibonacci, Pivot, and Breakout.
    """
    with conn.cursor() as cur:
        cur.execute("SELECT trade_date, open, high, low, close, volume FROM ohlcv_daily WHERE ticker = %s ORDER BY trade_date ASC", (ticker,))
        rows = cur.fetchall()
        
    if not rows:
        empty = {ind: "N/A" for ind in indicators}
        neutral = {ind: "Neutral" for ind in indicators}
        return empty, neutral, empty, neutral, empty, neutral, empty, neutral

    df = pd.DataFrame(rows, columns=['date', 'open', 'high', 'low', 'close', 'volume'])
    df['date'] = pd.to_datetime(df['date'])
    df.set_index('date', inplace=True)

    for col in ['open', 'high', 'low', 'close', 'volume']:
        df[col] = pd.to_numeric(df[col], errors='coerce')
    
    df.dropna(subset=['close'], inplace=True)
    if df.empty:
        empty = {ind: "N/A" for ind in indicators}
        neutral = {ind: "Neutral" for ind in indicators}
        return empty, neutral, empty, neutral, empty, neutral, empty, neutral

    resample_rules = {'I': '1d', 'W': '1wk', 'M': '1mo', 'Q': '3mo'}
    
    val_strs_w = {}
    signals_w = {}
    val_strs_m = {}
    signals_m = {}
    val_strs_q = {}
    signals_q = {}
    val_strs_i = {}
    signals_i = {}
    
    out_vals = {'W': val_strs_w, 'M': val_strs_m, 'Q': val_strs_q, 'I': val_strs_i}
    out_sigs = {'W': signals_w, 'M': signals_m, 'Q': signals_q, 'I': signals_i}

    import yfinance as yf
    
    # Try fetching ticker with .NS suffix if it's an Indian stock (assume all for now, or fallback)
    tk_symbol = ticker + ".NS"
    tk = yf.Ticker(tk_symbol)

    for period, rule in resample_rules.items():
        v = out_vals[period]
        s = out_sigs[period]
        
        for ind in indicators:
            v[ind] = "N/A"
            s[ind] = "Neutral"

        try:
            # Directly fetch the required timeframe from yfinance with maximum historical data
            rdf = tk.history(period="max", interval=rule)
        except Exception:
            rdf = pd.DataFrame()
            
        if rdf.empty:
            # Fallback to ticker without .NS just in case
            try:
                rdf = yf.Ticker(ticker).history(period="max", interval=rule)
            except Exception:
                rdf = pd.DataFrame()
                
        if rdf.empty or len(rdf) < 2:
            continue

        rdf = rdf.copy()
        # Ensure column names are lowercase to match the rest of the script logic
        rdf.columns = [c.lower() for c in rdf.columns]


        # Core Indicators
        rdf.ta.rsi(length=14, append=True)
        rdf.ta.macd(fast=12, slow=26, signal=9, append=True)
        rdf.ta.bbands(length=20, std=2, append=True)
        rdf.ta.sma(length=20, append=True)
        rdf.ta.ema(length=26, append=True)
        
        # New Indicators
        try: rdf.ta.vwap(append=True)
        except: pass
        try: rdf.ta.adx(append=True)
        except: pass
        try: rdf.ta.donchian(append=True)
        except: pass
        try: rdf.ta.obv(append=True)
        except: pass
        try: rdf.ta.supertrend(append=True)
        except: pass
        try: rdf.ta.sma(length=100, append=True)
        except: pass

        try:
            ichi_out = rdf.ta.ichimoku()
            if isinstance(ichi_out, tuple):
                ichi_df = ichi_out[0]
            elif isinstance(ichi_out, pd.DataFrame):
                ichi_df = ichi_out
            else:
                ichi_df = pd.DataFrame()
        except:
            ichi_df = pd.DataFrame()
        
        last = rdf.iloc[-1]
        close_px = last['close']
        
        # Helper to safely get column value
        def get_val(prefix):
            cols = [c for c in rdf.columns if c.startswith(prefix)]
            return last[cols[0]] if cols and pd.notna(last[cols[0]]) else None

        for ind in indicators:
            if ind == "RSI":
                rsi_val = get_val('RSI_')
                if rsi_val is not None:
                    s[ind] = "Overbought" if rsi_val > 70 else ("Oversold" if rsi_val < 30 else "Neutral")
                    v[ind] = f"{rsi_val:.1f}"
                    
            elif ind == "MACD Signal":
                m_val = get_val('MACD_')
                m_sig = get_val('MACDs_')
                if m_val is not None and m_sig is not None:
                    s[ind] = "Bullish" if m_val > m_sig else "Bearish"
                    v[ind] = f"{m_val:.2f}"
                    
            elif ind == "Bollinger signal":
                lower = get_val('BBL_')
                upper = get_val('BBU_')
                if lower is not None and upper is not None:
                    if close_px <= lower: s[ind] = "Bullish"
                    elif close_px >= upper: s[ind] = "Bearish"
                    v[ind] = f"{close_px:.2f}"
                    
            elif ind == "EMA20 signal":
                sma20 = get_val('SMA_20')
                if sma20 is not None:
                    s[ind] = "Bullish" if close_px > sma20 else "Bearish"
                    v[ind] = f"{sma20:.2f}"
                    
            elif ind == "EMA26":
                ema26 = get_val('EMA_26')
                if ema26 is not None:
                    s[ind] = "Bullish" if close_px > ema26 else "Bearish"
                    v[ind] = f"{ema26:.2f}"
                    
            elif ind == "SMA100 Signal":
                sma100 = get_val('SMA_100')
                if sma100 is not None:
                    s[ind] = "Bullish" if close_px > sma100 else "Bearish"
                    v[ind] = f"{sma100:.2f}"
                    
            elif ind == "VWAP Signal":
                vwap = get_val('VWAP_')
                if vwap is not None:
                    s[ind] = "Bullish" if close_px > vwap else "Bearish"
                    v[ind] = f"{vwap:.2f}"
                    
            elif ind == "ADX signal":
                adx = get_val('ADX_')
                dmp = get_val('DMP_')
                dmn = get_val('DMN_')
                if adx is not None and dmp is not None and dmn is not None:
                    if adx > 25:
                        s[ind] = "Bullish" if dmp > dmn else "Bearish"
                    else:
                        s[ind] = "Neutral"
                    v[ind] = f"{adx:.1f}"
                    
            elif ind == "Donchain upper":
                dcu = get_val('DCU_')
                dcl = get_val('DCL_')
                if dcu is not None and dcl is not None:
                    if close_px >= dcu * 0.99: s[ind] = "Bullish"
                    elif close_px <= dcl * 1.01: s[ind] = "Bearish"
                    v[ind] = f"{dcu:.2f}"
                    
            elif ind == "OBV Signal":
                obv = get_val('OBV')
                if obv is not None:
                    if len(rdf) > 5:
                        prev_obv = rdf.iloc[-5]['OBV'] if pd.notna(rdf.iloc[-5].get('OBV')) else obv
                        s[ind] = "Bullish" if obv > prev_obv else "Bearish"
                    
                    # Format OBV into Millions (M) or Thousands (K) to keep it readable
                    abs_obv = abs(obv)
                    if abs_obv >= 1_000_000:
                        v[ind] = f"{obv/1_000_000:.2f}M"
                    elif abs_obv >= 1_000:
                        v[ind] = f"{obv/1_000:.2f}K"
                    else:
                        v[ind] = f"{obv:.2f}"
                    
            elif ind == "Super trend signal":
                st_dir = get_val('SUPERTd_')
                st_val = get_val('SUPERT_')
                if st_dir is not None and st_val is not None:
                    s[ind] = "Bullish" if st_dir > 0 else "Bearish"
                    v[ind] = f"{st_val:.2f}"
                    
            elif ind == "Pivot Signal":
                if len(rdf) > 1:
                    prev = rdf.iloc[-2]
                    pp = (prev['high'] + prev['low'] + prev['close']) / 3
                    if pd.notna(pp):
                        s[ind] = "Bullish" if close_px > pp else "Bearish"
                        v[ind] = f"{pp:.2f}"
                        
            elif ind == "Breakout signal":
                if len(rdf) > 20:
                    recent_high = rdf['high'].iloc[-21:-1].max()
                    recent_low = rdf['low'].iloc[-21:-1].min()
                    if pd.notna(recent_high) and pd.notna(recent_low):
                        if close_px > recent_high: s[ind] = "Bullish"
                        elif close_px < recent_low: s[ind] = "Bearish"
                        v[ind] = f"{recent_high:.2f}"
                        
            elif ind == "Fibonacci signal":
                if len(rdf) > 52:
                    hh = rdf['high'].iloc[-52:].max()
                    ll = rdf['low'].iloc[-52:].min()
                    if pd.notna(hh) and pd.notna(ll):
                        fib38 = hh - 0.382 * (hh - ll)
                        fib61 = hh - 0.618 * (hh - ll)
                        if close_px > fib38: s[ind] = "Bullish"
                        elif close_px < fib61: s[ind] = "Bearish"
                        v[ind] = f"{fib38:.2f}"

            elif ind == "Ichimoku signal":
                if not ichi_df.empty:
                    span_a_cols = [c for c in ichi_df.columns if c.startswith('ISA_')]
                    span_b_cols = [c for c in ichi_df.columns if c.startswith('ISB_')]
                    if span_a_cols and span_b_cols:
                        try:
                            idx = rdf.index[-1]
                            if idx in ichi_df.index:
                                span_a = ichi_df.loc[idx, span_a_cols[0]]
                                span_b = ichi_df.loc[idx, span_b_cols[0]]
                                if pd.notna(span_a) and pd.notna(span_b):
                                    if close_px > max(span_a, span_b): s[ind] = "Bullish"
                                    elif close_px < min(span_a, span_b): s[ind] = "Bearish"
                                    v[ind] = f"{close_px:.2f}"
                        except: pass

    return val_strs_w, signals_w, val_strs_m, signals_m, val_strs_q, signals_q, val_strs_i, signals_i
