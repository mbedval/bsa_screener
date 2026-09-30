from app.database import get_connection

with get_connection() as conn, conn.cursor() as cur:
    # Set action = ENTRY and action_date = NULL for the initial LOT_CHANGE records
    # where there is no earlier ENTRY record for that symbol.
    cur.execute("""
        UPDATE derivative_history dh
        SET action = 'ENTRY', action_date = NULL
        WHERE action = 'LOT_CHANGE' 
          AND action_date = '2026-09-30'
          AND NOT EXISTS (
              SELECT 1 FROM derivative_history dh2 
              WHERE dh2.symbol = dh.symbol AND dh2.action = 'ENTRY'
          )
    """)
    print(f"Updated {cur.rowcount} initial records to ENTRY with NULL date.")

