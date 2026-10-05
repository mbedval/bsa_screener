import csv
from io import StringIO
from app.database import get_connection

data = """ID,Symbol,Action,Action Date,Lot Size
233,NUVAMA,ENTRY,2025-08-01,Not Available (Exited later)
238,SAMMAANCAP,ENTRY,2025-08-29,Not Available (Exited later)
221,TATACHEM,EXIT,2025-10-01,Not Available
234,POWERINDIA,ENTRY,2025-10-01,25
216,IGL,EXIT,2025-11-26,Not Available
224,BAJAJHLDNG,ENTRY,2025-12-31,75
235,PREMIERENE,ENTRY,2025-12-31,650
239,SWIGGY,ENTRY,2025-12-31,"1,825"
241,WAAREEENER,ENTRY,2025-12-31,175
217,IIFL,EXIT,2026-01-28,Not Available
218,IRCTC,EXIT,2026-02-25,Not Available
222,ADANIPOWER,ENTRY,2026-04-01,"3,550"
225,COCHINSHIP,ENTRY,2026-04-01,400
226,FORCEMOT,ENTRY,2026-04-01,25
227,GODFRYPHLP,ENTRY,2026-04-01,275
229,HYUNDAI,ENTRY,2026-04-01,275
231,MOTILALOFS,ENTRY,2026-04-01,775
232,NAM-INDIA,ENTRY,2026-04-01,625
240,VMM,ENTRY,2026-04-01,"4,850"
228,GVT&D,ENTRY,2026-05-27,125
236,RADICO,ENTRY,2026-05-27,150
220,SAMMAANCAP,EXIT,2026-07-01,Not Available
215,EXIDEIND,EXIT,2026-07-29,Not Available
219,NUVAMA,EXIT,2026-07-29,Not Available
214,DALBHARAT,EXIT,2026-08-26,Not Available
223,ATHERENERG,ENTRY,2026-08-26,375
230,MAHABANK,ENTRY,2026-08-26,"6,500"
237,SAGILITY,ENTRY,2026-08-26,"12,000"
"""

f = StringIO(data)
reader = csv.DictReader(f)

with get_connection() as conn, conn.cursor() as cur:
    for row in reader:
        symbol = row['Symbol']
        action = row['Action']
        action_date = row['Action Date']
        lot_size_raw = row['Lot Size'].replace(',', '')
        
        lot_size = None
        if 'Not Available' not in lot_size_raw and lot_size_raw.strip():
            lot_size = int(lot_size_raw)
            
        # Try to update existing record
        cur.execute('''
            UPDATE derivative_history 
            SET lot_size = %s 
            WHERE symbol = %s AND action = %s AND action_date = %s
        ''', (lot_size, symbol, action, action_date))
        
        if cur.rowcount == 0:
            # Insert if not found
            cur.execute('''
                INSERT INTO derivative_history (symbol, action, action_date, lot_size)
                VALUES (%s, %s, %s, %s)
            ''', (symbol, action, action_date, lot_size))
            
    print("Successfully updated lot sizes in derivative history.")
