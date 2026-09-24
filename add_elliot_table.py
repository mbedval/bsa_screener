import sqlite3
import psycopg2
import os
from engine.database.connection import get_db_connection

query = """
CREATE TABLE IF NOT EXISTS elliot_analysis (
    ticker TEXT PRIMARY KEY,
    current_wave TEXT,
    weekly_probability DOUBLE PRECISION,
    intraday_probability DOUBLE PRECISION,
    updated_at TIMESTAMP DEFAULT now()
);
"""

try:
    with get_db_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(query)
        conn.commit()
    print("elliot_analysis table created successfully.")
except Exception as e:
    print(f"Error: {e}")
