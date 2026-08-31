import os
import logging
import threading
import contextlib
from typing import Generator
from dotenv import load_dotenv

logger = logging.getLogger("bsa_database")

# Load environment variables from root .env
load_dotenv()

def get_postgres_url() -> str:
    """Resolve the PostgreSQL connection URL from environment."""
    return os.environ.get("POSTGRES_DSN") or os.environ.get("DATABASE_URL") or "postgresql://jmbxdbuser:jmbxdbpassword@127.0.0.1:5432/bsa_db"

_pool_lock = threading.Lock()
_psycopg2_pool = None

def get_psycopg2_pool():
    """Returns the psycopg2 thread-safe connection pool."""
    global _psycopg2_pool
    if _psycopg2_pool is not None:
        return _psycopg2_pool

    with _pool_lock:
        if _psycopg2_pool is not None:
            return _psycopg2_pool

        import psycopg2.pool
        dsn = get_postgres_url()
        min_conn = int(os.environ.get("POOL_MIN", 2))
        max_conn = int(os.environ.get("POOL_MAX", 15))

        try:
            _psycopg2_pool = psycopg2.pool.ThreadedConnectionPool(min_conn, max_conn, dsn)
        except Exception as e:
            logger.error(f"Failed to initialize psycopg2 connection pool: {e}")
            raise e

        return _psycopg2_pool

@contextlib.contextmanager
def get_db_connection() -> Generator:
    """Context manager for obtaining a database connection from the psycopg2 pool."""
    pool = get_psycopg2_pool()
    conn = pool.getconn()
    try:
        yield conn
    finally:
        pool.putconn(conn)

@contextlib.contextmanager
def get_db_cursor(commit: bool = True) -> Generator:
    """Context manager for obtaining a database cursor with automatic commit/rollback."""
    with get_db_connection() as conn:
        cursor = conn.cursor()
        try:
            yield cursor
            if commit:
                conn.commit()
        except Exception as e:
            conn.rollback()
            raise e
        finally:
            cursor.close()

# For psycopg v3 support (FastAPI / backend)
_psycopg3_pool = None

def get_psycopg3_pool():
    """Returns the psycopg (v3) connection pool."""
    global _psycopg3_pool
    if _psycopg3_pool is not None:
        return _psycopg3_pool

    with _pool_lock:
        if _psycopg3_pool is not None:
            return _psycopg3_pool

        from psycopg_pool import ConnectionPool
        dsn = get_postgres_url()
        try:
            _psycopg3_pool = ConnectionPool(dsn, min_size=2, max_size=15)
        except Exception as e:
            logger.error(f"Failed to initialize psycopg (v3) connection pool: {e}")
            raise e

        return _psycopg3_pool
