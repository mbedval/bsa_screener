"""Create master reference tables in rawdata_db.

Tables created:
  - sectors          : master list of market sectors
  - ticker_master    : ticker metadata (FNO flag, index memberships)
  - ticker_sector    : many-to-many ticker ↔ sector
  - watchlist        : named watchlists
  - watchlist_items  : many-to-many watchlist ↔ ticker
  - users            : user profiles linked to a watchlist

Run from the backend directory:
    .venv/bin/python -m scripts.migrate_master
"""

from app.config import settings
from app.database import get_connection

DDL_STATEMENTS = [
    # ── Sectors master ──────────────────────────────────────────────────────
    """
    CREATE TABLE IF NOT EXISTS sectors (
        id          SERIAL PRIMARY KEY,
        name        TEXT NOT NULL UNIQUE,
        description TEXT,
        created_at  TIMESTAMP DEFAULT now()
    )
    """,
    # ── Ticker master ────────────────────────────────────────────────────────
    """
    CREATE TABLE IF NOT EXISTS ticker_master (
        ticker             TEXT PRIMARY KEY,
        company_name       TEXT NOT NULL,
        is_fno             BOOLEAN DEFAULT FALSE,
        index_memberships  TEXT[] DEFAULT '{}',
        exchange           TEXT DEFAULT 'NSE',
        updated_at         TIMESTAMP DEFAULT now()
    )
    """,
    # ── Ticker ↔ Sector (many-to-many) ───────────────────────────────────────
    """
    CREATE TABLE IF NOT EXISTS ticker_sector (
        ticker    TEXT    NOT NULL REFERENCES ticker_master(ticker) ON DELETE CASCADE,
        sector_id INTEGER NOT NULL REFERENCES sectors(id) ON DELETE CASCADE,
        PRIMARY KEY (ticker, sector_id)
    )
    """,
    # ── Watchlist master ─────────────────────────────────────────────────────
    """
    CREATE TABLE IF NOT EXISTS watchlist (
        id          SERIAL PRIMARY KEY,
        name        TEXT NOT NULL UNIQUE,
        description TEXT,
        created_at  TIMESTAMP DEFAULT now()
    )
    """,
    # ── Watchlist ↔ Ticker (many-to-many) ────────────────────────────────────
    """
    CREATE TABLE IF NOT EXISTS watchlist_items (
        watchlist_id INTEGER NOT NULL REFERENCES watchlist(id) ON DELETE CASCADE,
        ticker       TEXT    NOT NULL REFERENCES ticker_master(ticker) ON DELETE CASCADE,
        PRIMARY KEY (watchlist_id, ticker)
    )
    """,
    # ── Users ────────────────────────────────────────────────────────────────
    """
    CREATE TABLE IF NOT EXISTS users (
        email        TEXT PRIMARY KEY,
        first_name   TEXT NOT NULL,
        last_name    TEXT NOT NULL,
        watchlist_id INTEGER REFERENCES watchlist(id) ON DELETE SET NULL,
        created_at   TIMESTAMP DEFAULT now()
    )
    """,
]

INDEXES = [
    "CREATE INDEX IF NOT EXISTS idx_ticker_sector_sector_id ON ticker_sector(sector_id)",
    "CREATE INDEX IF NOT EXISTS idx_watchlist_items_watchlist_id ON watchlist_items(watchlist_id)",
    "CREATE INDEX IF NOT EXISTS idx_users_watchlist_id ON users(watchlist_id)",
]


def main() -> None:
    print(f"Connecting to rawdata_db: {settings.rawdata_postgres_dsn!r}")
    with get_connection(settings.rawdata_postgres_dsn) as conn, conn.cursor() as cur:
        for stmt in DDL_STATEMENTS:
            cur.execute(stmt)
            print(f"  ✓ {stmt.strip().splitlines()[0].strip()}")
        for idx in INDEXES:
            cur.execute(idx)
            print(f"  ✓ {idx}")
        conn.commit()
    print("\nMigration complete — 6 master tables and indexes created in rawdata_db.")


if __name__ == "__main__":
    main()
