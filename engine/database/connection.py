"""
Database Connection Module (SQLite).

Provides thread-safe SQLite connection utilities for the BSA engine.
Replaces the previous PostgreSQL/psycopg2 implementation.
"""

import os
import json
import logging
import threading
import contextlib
import sqlite3
from typing import Generator
from pathlib import Path
from dotenv import load_dotenv

logger = logging.getLogger("bsa_database")

# Load environment variables from root .env
env_path = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), '.env')
load_dotenv(env_path)


def get_sqlite_path() -> str:
    """Resolve the SQLite database file path from environment."""
    path = os.environ.get("SQLITE_PATH") or os.path.join(
        os.path.dirname(os.path.dirname(os.path.dirname(__file__))),
        "data", "bsa_db.sqlite3"
    )
    # Ensure parent directory exists
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    return path


class DictRow(dict):
    """Row dictionary supporting both key access and positional index access row[0]."""
    def __getitem__(self, item):
        if isinstance(item, int):
            return list(self.values())[item]
        return super().__getitem__(item)

    def __iter__(self):
        return iter(self.values())


def _dict_row_factory(cursor: sqlite3.Cursor, row: tuple) -> DictRow:
    """Row factory returning DictRow compatible with RealDictCursor and pandas DataFrame."""
    return DictRow({col[0]: row[idx] for idx, col in enumerate(cursor.description)})


class CursorContext(sqlite3.Cursor):
    """Cursor subclass adding context manager support and auto-translating Postgres SQL dialect."""
    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        self.close()

    def _adapt_sql(self, sql: str) -> str:
        if not isinstance(sql, str):
            return sql
        import re
        # Strip Postgres typecasts (e.g. ::text, ::date, ::int, ::numeric, ::float)
        if "::" in sql:
            sql = re.sub(r"::[a-zA-Z0-9_]+", "", sql)
        # Convert %s placeholders to SQLite ?
        if "%s" in sql:
            sql = sql.replace("%s", "?")
        # Convert ILIKE to LIKE
        if "ILIKE" in sql:
            sql = re.sub(r"\bILIKE\b", "LIKE", sql)
        # Convert Postgres now() function to SQLite datetime('now')
        if "now()" in sql.lower():
            sql = re.sub(r"\bnow\(\)", "(datetime('now'))", sql, flags=re.IGNORECASE)
        # Convert Postgres DDL types
        if "JSONB" in sql:
            sql = sql.replace("JSONB", "TEXT")
        if "DOUBLE PRECISION" in sql:
            sql = sql.replace("DOUBLE PRECISION", "REAL")
        if "TIMESTAMP DEFAULT now()" in sql:
            sql = sql.replace("TIMESTAMP DEFAULT now()", "TEXT DEFAULT (datetime('now'))")
        # Handle SQLite ALTER TABLE ADD COLUMN IF NOT EXISTS
        if "ADD COLUMN IF NOT EXISTS" in sql.upper():
            m = re.search(r"ALTER\s+TABLE\s+([a-zA-Z0-9_]+)\s+ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s+([a-zA-Z0-9_]+)\s+([^;]+)", sql, flags=re.IGNORECASE)
            if m:
                tbl, col, ctype = m.group(1), m.group(2), m.group(3)
                try:
                    cur_info = self.connection.execute(f"PRAGMA table_info({tbl})").fetchall()
                    existing = {row[1] for row in cur_info}
                    if col in existing:
                        return "SELECT 1"  # No-op
                    return f"ALTER TABLE {tbl} ADD COLUMN {col} {ctype}"
                except Exception:
                    pass
        return sql

    def execute(self, sql, parameters=None):
        adapted = self._adapt_sql(sql)
        # Multi-statement scripts without parameters (e.g. DDL tables setup)
        if parameters is None and isinstance(adapted, str) and adapted.strip().count(";") > 1:
            return self.connection.executescript(adapted)
        if parameters is None:
            return super().execute(adapted)
        return super().execute(adapted, parameters)

    def executemany(self, sql, seq_of_parameters):
        adapted = self._adapt_sql(sql)
        return super().executemany(adapted, seq_of_parameters)


def execute_values(cur, sql: str, records: list, page_size: int = 500):
    """Drop-in SQLite equivalent for psycopg2.extras.execute_values."""
    if not records:
        return
    first = records[0]
    qmarks = "(" + ", ".join(["?"] * len(first)) + ")"
    import re
    adapted_sql = re.sub(r"VALUES\s*(\?|%s)", f"VALUES {qmarks}", sql, flags=re.IGNORECASE)
    cur.executemany(adapted_sql, records)


class ConnectionWithCursorContext(sqlite3.Connection):
    """Connection subclass returning CursorContext cursors."""
    def cursor(self, factory=CursorContext):
        return super().cursor(factory)


def _make_connection(path: str) -> sqlite3.Connection:
    """Create and configure a SQLite connection."""
    conn = sqlite3.connect(path, check_same_thread=False, factory=ConnectionWithCursorContext)
    conn.row_factory = _dict_row_factory
    from datetime import datetime as _dt
    conn.create_function("now", 0, lambda: _dt.now().strftime("%Y-%m-%d %H:%M:%S"))
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA synchronous=NORMAL")
    conn.execute("PRAGMA foreign_keys=ON")
    conn.execute("PRAGMA cache_size=-32000")   # 32 MB page cache
    conn.execute("PRAGMA temp_store=MEMORY")
    return conn


# ---------------------------------------------------------------------------
# Thread-local connection pool (one connection per thread)
# ---------------------------------------------------------------------------
_tls = threading.local()
_db_path_lock = threading.Lock()
_db_path: str | None = None


def _get_db_path() -> str:
    global _db_path
    if _db_path is None:
        with _db_path_lock:
            if _db_path is None:
                _db_path = get_sqlite_path()
    return _db_path


def _get_thread_connection() -> sqlite3.Connection:
    """Return (or create) the per-thread SQLite connection."""
    path = _get_db_path()
    conn = getattr(_tls, "conn", None)
    if conn is None:
        conn = _make_connection(path)
        _tls.conn = conn
    return conn


class ConnectionProxy:
    """Connection proxy supporting both direct usage and context manager protocols."""
    def __init__(self, conn: sqlite3.Connection):
        self._conn = conn

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        if exc_type is not None:
            try:
                self._conn.rollback()
            except Exception:
                pass
        return False

    def close(self):
        # Don't destroy thread-local connection on per-call close()
        pass

    def __getattr__(self, name):
        return getattr(self._conn, name)


def get_db_connection() -> ConnectionProxy:
    """Obtain a database connection. Can be used as a context manager or directly."""
    return ConnectionProxy(_get_thread_connection())

get_connection = get_db_connection


@contextlib.contextmanager
def get_db_cursor(commit: bool = True) -> Generator:
    """Context manager for obtaining a database cursor with auto commit/rollback."""
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


# ---------------------------------------------------------------------------
# JSON helpers for array columns (index_memberships, etc.)
# ---------------------------------------------------------------------------

def encode_list(value) -> str:
    """Encode a Python list as a JSON string for storage."""
    if value is None:
        return "[]"
    if isinstance(value, list):
        return json.dumps(value)
    return str(value)


def decode_list(value) -> list:
    """Decode a JSON string back to a Python list."""
    if value is None:
        return []
    if isinstance(value, list):
        return value
    try:
        result = json.loads(value)
        return result if isinstance(result, list) else []
    except (json.JSONDecodeError, TypeError):
        return []
