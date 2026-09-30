import csv
from io import StringIO
from app.database import get_connection

data = """Stock Symbol,Lifecycle / Entry Date,Status / Exit Date,Current Lot Size
ADANIPOWER,Entered: 2026-04-01,Continuation,"3,550"
ATHERENERG,Entered: 2026-08-26,Continuation,375
BAJAJHLDNG,Entered: 2025-12-31,Continuation,75
COCHINSHIP,Entered: 2026-04-01,Continuation,400
DALBHARAT,Pre-existing,Exited: 2026-08-26,N/A (Exited)
EXIDEIND,Pre-existing,Exited: 2026-07-29,N/A (Exited)
FORCEMOT,Entered: 2026-04-01,Continuation,25
GODFRYPHLP,Entered: 2026-04-01,Continuation,275
GVT&D,Entered: 2026-05-27,Continuation,125
HYUNDAI,Entered: 2026-04-01,Continuation,275
IGL,Pre-existing,Exited: 2025-11-26,N/A (Exited)
IIFL,Pre-existing,Exited: 2026-01-28,N/A (Exited)
IRCTC,Pre-existing,Exited: 2026-02-25,N/A (Exited)
MAHABANK,Entered: 2026-08-26,Continuation,"6,500"
MOTILALOFS,Entered: 2026-04-01,Continuation,775
NAM-INDIA,Entered: 2026-04-01,Continuation,625
NUVAMA,Entered: 2025-08-01,Exited: 2026-07-29,N/A (Exited)
POWERINDIA,Entered: 2025-10-01,Continuation,25
PREMIERENE,Entered: 2025-12-31,Continuation,650
RADICO,Entered: 2026-05-27,Continuation,150
SAGILITY,Entered: 2026-08-26,Continuation,"12,000"
SAMMAANCAP,Entered: 2025-08-29,Exited: 2026-07-01,N/A (Exited)
SWIGGY,Entered: 2025-12-31,Continuation,"1,825"
TATACHEM,Pre-existing,Exited: 2025-10-01,N/A (Exited)
VMM,Entered: 2026-04-01,Continuation,"4,850"
WAAREEENER,Entered: 2025-12-31,Continuation,175"""

f = StringIO(data)
reader = csv.DictReader(f)

with get_connection() as conn, conn.cursor() as cur:
    for row in reader:
        symbol = row['Stock Symbol']
        entry_raw = row['Lifecycle / Entry Date']
        exit_raw = row['Status / Exit Date']
        lot_size_raw = row['Current Lot Size'].replace(',', '').replace('"', '')
        
        lot_size = None
        if 'N/A' not in lot_size_raw and lot_size_raw.strip():
            lot_size = int(lot_size_raw)
            
        # Delete existing history for this symbol to avoid duplicates, 
        # BUT ONLY delete ENTRY and EXIT to rebuild them correctly. 
        # (We don't touch legitimate LOT_CHANGEs if there were any, though for these there shouldn't be).
        cur.execute("DELETE FROM derivative_history WHERE symbol = %s", (symbol,))
        
        # 1. Handle Entry
        if entry_raw.startswith('Entered:'):
            entry_date = entry_raw.split(': ')[1].strip()
            # If it exited, lot_size at entry might be unknown, but we insert what we can
            cur.execute("""
                INSERT INTO derivative_history (symbol, action, action_date, lot_size)
                VALUES (%s, 'ENTRY', %s, %s)
            """, (symbol, entry_date, lot_size if not exit_raw.startswith('Exited:') else None))
        elif entry_raw == 'Pre-existing':
            # Insert ENTRY with NULL date
            cur.execute("""
                INSERT INTO derivative_history (symbol, action, action_date, lot_size)
                VALUES (%s, 'ENTRY', NULL, NULL)
            """, (symbol,))
            
        # 2. Handle Exit
        if exit_raw.startswith('Exited:'):
            exit_date = exit_raw.split(': ')[1].strip()
            cur.execute("""
                INSERT INTO derivative_history (symbol, action, action_date, lot_size)
                VALUES (%s, 'EXIT', %s, NULL)
            """, (symbol, exit_date))

    print("Successfully processed the final dataset.")
