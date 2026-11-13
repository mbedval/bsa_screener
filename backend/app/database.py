"""
FastAPI database connection helper (SQLite).

Returns a sqlite3 connection whose cursors yield dict-like rows.
"""
import sqlite3
from contextlib import contextmanager
from pathlib import Path
from .config import settings


def _dict_row_factory(cursor: sqlite3.Cursor, row: tuple) -> dict:
    """Row factory that returns dict instead of tuple."""
    return {col[0]: row[idx] for idx, col in enumerate(cursor.description)}


class CursorContext(sqlite3.Cursor):
    """Cursor subclass adding context manager support and auto-translating Postgres SQL dialect."""
    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        self.close()

    def _adapt_sql(self, sql: str) -> str:
        if not isinstance(sql, str):
            return sql
        # Strip Postgres typecasts (e.g. ::text, ::date, ::int)
        if "::" in sql:
            import re
            sql = re.sub(r"::[a-zA-Z0-9_]+", "", sql)
        # Convert %s placeholders to SQLite ?
        if "%s" in sql:
            sql = sql.replace("%s", "?")
        # Convert ILIKE to LIKE
        if "ILIKE" in sql:
            import re
            sql = re.sub(r"\bILIKE\b", "LIKE", sql)
        return sql

    def execute(self, sql, parameters=None):
        adapted = self._adapt_sql(sql)
        if parameters is None:
            return super().execute(adapted)
        return super().execute(adapted, parameters)

    def executemany(self, sql, seq_of_parameters):
        adapted = self._adapt_sql(sql)
        return super().executemany(adapted, seq_of_parameters)


class ConnectionWithCursorContext(sqlite3.Connection):
    """Connection subclass returning CursorContext cursors."""
    def cursor(self, factory=CursorContext):
        return super().cursor(factory)

    @contextmanager
    def transaction(self):
        with self:
            yield self


@contextmanager
def get_connection(path: str = None):
    """Context manager yielding a SQLite connection.

    The connection uses WAL mode for safe concurrent reads, and a
    dict-based row factory so callers can use row["column_name"].
    """
    db_path = path or settings.sqlite_path
    # Ensure parent directory exists
    Path(db_path).parent.mkdir(parents=True, exist_ok=True)

    conn = sqlite3.connect(db_path, check_same_thread=False, factory=ConnectionWithCursorContext)
    conn.row_factory = _dict_row_factory
    from datetime import datetime as _dt
    conn.create_function("now", 0, lambda: _dt.now().strftime("%Y-%m-%d %H:%M:%S"))
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    conn.execute("PRAGMA synchronous=NORMAL")
    conn.execute("PRAGMA cache_size=-32000")
    try:
        yield conn
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()
