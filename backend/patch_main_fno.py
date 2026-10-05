import re

with open('/home/jmbx/apps/bsa_screener/backend/app/main.py', 'r') as f:
    content = f.read()

fno_query = '''
            # 14. Derivative History
            derivative_history = []
            try:
                with conn.transaction():
                    cur.execute("""
                        SELECT id, symbol, action, lot_size, action_date, created_at
                        FROM derivative_history
                        WHERE symbol = %s
                        ORDER BY action_date DESC, id DESC
                    """, (actual_ticker,))
                    derivative_history = [dict(r) for r in cur.fetchall()]
            except Exception as e:
                logger.error(f"Error querying derivative history for {actual_ticker}: {e}")

            return {
                "found": True,
                "ticker": actual_ticker,
                "master": master_data,
                "derivative_history": derivative_history,
'''

if 'derivative_history = []' not in content:
    content = content.replace('            return {\n                "found": True,\n                "ticker": actual_ticker,\n                "master": master_data,', fno_query.lstrip())

with open('/home/jmbx/apps/bsa_screener/backend/app/main.py', 'w') as f:
    f.write(content)
