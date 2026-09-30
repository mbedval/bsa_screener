import csv
import io
import requests
import datetime
from app.database import get_connection

def fetch_fno_list():
    # URL for NSE F&O market lots which contains the list of all active F&O symbols
    url = "https://nsearchives.nseindia.com/content/fo/fo_mktlots.csv"
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
        "Accept": "text/csv,text/plain"
    }
    print(f"Fetching F&O list from {url}...")
    response = requests.get(url, headers=headers, timeout=15)
    response.raise_for_status()
    
    # NSE files sometimes have BOM or strange encodings
    content = response.content.decode('utf-8-sig', errors='replace')
    
    tickers = {}
    lines = content.splitlines()
    for i, line in enumerate(lines):
        line = line.replace('\x00', '')
        if not line.strip(): continue
        
        # Skip the header row
        if i == 0: continue
        
        parts = [p.strip() for p in line.split(',')]
        if len(parts) >= 3:
            symbol = parts[1].strip()
            # typically column 2 (index 2) is the near month expiry lot size
            try:
                lot_size = int(parts[2].strip())
            except ValueError:
                lot_size = None
                
            if symbol and symbol.upper() != "SYMBOL":
                tickers[symbol.upper()] = lot_size
                
    return tickers

def update_db(tickers_data):
    if not tickers_data:
        print("No tickers found to update.")
        return

    # Filter out known indices (these are managed in indices_master/fno_index_master)
    indices = {"NIFTY", "BANKNIFTY", "FINNIFTY", "MIDCPNIFTY", "SENSEX", "BANKEX", "NIFTYNXT50", "NIFTYFPI"}
    stock_tickers = {k: v for k, v in tickers_data.items() if k not in indices}
    
    print(f"Found {len(stock_tickers)} F&O stock tickers.")
    today_str = datetime.date.today().strftime('%Y-%m-%d')
    
    with get_connection() as conn, conn.cursor(row_factory=dict_row) as cur:
        # Fetch current state
        cur.execute("SELECT symbol, is_active, lot_size FROM fno_stock_master")
        current_state = {row['symbol']: row for row in cur.fetchall()}
        
        # We need regular cursor for insertions
        with conn.cursor() as write_cur:
            # 1. Handle Exits
            for sym, state in current_state.items():
                if state['is_active'] and sym not in stock_tickers:
                    write_cur.execute("UPDATE fno_stock_master SET is_active = False, exit_date = %s WHERE symbol = %s", (today_str, sym))
                    write_cur.execute("UPDATE ticker_master SET is_fno = False WHERE ticker = %s", (sym,))
                    write_cur.execute("INSERT INTO derivative_history (symbol, action, lot_size, action_date) VALUES (%s, 'EXIT', %s, %s)", (sym, state['lot_size'], today_str))
                    print(f"EXIT detected: {sym}")

            # 2. Handle Entries and Lot Size Changes
            for sym, lot_size in stock_tickers.items():
                state = current_state.get(sym)
                
                # Check ticker master
                write_cur.execute("SELECT ticker FROM ticker_master WHERE ticker = %s", (sym,))
                if not write_cur.fetchone():
                    write_cur.execute("INSERT INTO ticker_master (ticker, company_name, is_fno, exchange) VALUES (%s, %s, True, 'NSE')", (sym, sym))
                else:
                    write_cur.execute("UPDATE ticker_master SET is_fno = True WHERE ticker = %s", (sym,))
                
                if not state:
                    # New Entry
                    write_cur.execute(
                        "INSERT INTO fno_stock_master (symbol, underlying_name, instrument_type, is_active, entry_date, lot_size, created_at) "
                        "VALUES (%s, %s, 'OPTSTK', True, %s, %s, NOW())",
                        (sym, sym, today_str, lot_size)
                    )
                    write_cur.execute("INSERT INTO derivative_history (symbol, action, lot_size, action_date) VALUES (%s, 'ENTRY', %s, %s)", (sym, lot_size, today_str))
                    print(f"ENTRY detected: {sym} (Lot Size: {lot_size})")
                else:
                    # Existed
                    if not state['is_active']:
                        # Re-entry
                        write_cur.execute("UPDATE fno_stock_master SET is_active = True, entry_date = %s, exit_date = NULL, lot_size = %s WHERE symbol = %s", (today_str, lot_size, sym))
                        write_cur.execute("INSERT INTO derivative_history (symbol, action, lot_size, action_date) VALUES (%s, 'ENTRY', %s, %s)", (sym, lot_size, today_str))
                        print(f"RE-ENTRY detected: {sym} (Lot Size: {lot_size})")
                    else:
                        # Still active, check lot size
                        if state['lot_size'] != lot_size:
                            write_cur.execute("UPDATE fno_stock_master SET lot_size = %s WHERE symbol = %s", (lot_size, sym))
                            write_cur.execute("INSERT INTO derivative_history (symbol, action, lot_size, action_date) VALUES (%s, 'LOT_CHANGE', %s, %s)", (sym, lot_size, today_str))
                            print(f"LOT SIZE CHANGE detected: {sym} ({state['lot_size']} -> {lot_size})")
        conn.commit()
        print("Successfully updated the database with the latest F&O stock list and lot sizes.")

if __name__ == "__main__":
    try:
        from psycopg.rows import dict_row
        fno_tickers_data = fetch_fno_list()
        update_db(fno_tickers_data)
    except Exception as e:
        print(f"Error fetching/updating F&O list: {e}")
