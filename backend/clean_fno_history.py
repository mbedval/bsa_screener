from app.database import get_connection
from psycopg.rows import dict_row

with get_connection() as conn, conn.cursor(row_factory=dict_row) as cur:
    cur.execute("SELECT * FROM derivative_history ORDER BY symbol ASC, action_date ASC, id ASC")
    rows = cur.fetchall()
    
    to_delete = []
    
    current_symbol = None
    current_lot_size = None
    
    for row in rows:
        if row['symbol'] != current_symbol:
            current_symbol = row['symbol']
            current_lot_size = None
            
        if row['action'] == 'ENTRY':
            current_lot_size = row['lot_size']
        elif row['action'] == 'EXIT':
            current_lot_size = None
        elif row['action'] == 'LOT_CHANGE':
            # If lot size is the same as current, or we have no current lot size (meaning we don't have an ENTRY before this but we already set LOT_CHANGE as the initial population), wait...
            # The script that populated LOT_CHANGE today did it for ALL 213 stocks.
            # If we recently added an ENTRY for a stock with the same lot size, the LOT_CHANGE is redundant.
            if row['lot_size'] == current_lot_size:
                to_delete.append(row['id'])
            else:
                current_lot_size = row['lot_size']
                
    if to_delete:
        print(f"Deleting {len(to_delete)} redundant LOT_CHANGE records.")
        cur.execute("DELETE FROM derivative_history WHERE id = ANY(%s)", (to_delete,))
    else:
        print("No redundant LOT_CHANGE records found.")

