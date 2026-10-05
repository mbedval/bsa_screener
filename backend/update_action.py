from app.database import get_connection

symbols = [
    'ADANIPOWER', 'ATHERENERG', 'BAJAJHLDNG', 'COCHINSHIP', 'FORCEMOT',
    'GODFRYPHLP', 'GVT&D', 'HYUNDAI', 'MAHABANK', 'MOTILALOFS', 'NAM-INDIA',
    'POWERINDIA', 'PREMIERENE', 'RADICO', 'SAGILITY', 'SWIGGY', 'VMM', 'WAAREEENER'
]

with get_connection() as conn, conn.cursor() as cur:
    cur.execute("""
        UPDATE derivative_history
        SET action = 'LOT_CHANGE'
        WHERE symbol = ANY(%s) AND action = 'ENTRY' AND lot_size IS NOT NULL
    """, (symbols,))
    print(f"Updated {cur.rowcount} records from ENTRY to LOT_CHANGE.")
