import os
import psycopg2
from dotenv import load_dotenv

load_dotenv()

# Connect to the remote database
host = "192.168.1.18"
port = os.getenv("POSTGRES_PORT", "5432")
user = os.getenv("POSTGRES_USER", "jmbxdbuser")
password = os.getenv("POSTGRES_PASSWORD", "jmbxdbpassword")
database = os.getenv("POSTGRES_DB", "bsa_db")

dsn = f"postgresql://{user}:{password}@{host}:{port}/{database}"

print(f"Connecting to remote database {database} on {host}...")
try:
    conn = psycopg2.connect(dsn)
    conn.autocommit = True
    cur = conn.cursor()
    
    print("Reading seeding.sql...")
    with open("seeding.sql", "r") as f:
        sql = f.read()
        
    print("Executing schema update (IF NOT EXISTS) on remote DB...")
    cur.execute(sql)
    
    print("Schema updated successfully on the remote database!")
except Exception as e:
    print(f"Error: {e}")
finally:
    if 'conn' in locals():
        conn.close()
