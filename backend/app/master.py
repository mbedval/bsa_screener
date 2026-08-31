"""Master data CRUD router — /api/master/

Endpoints:
  Sectors:
    GET    /api/master/sectors
    POST   /api/master/sectors
    PUT    /api/master/sectors/{sector_id}
    DELETE /api/master/sectors/{sector_id}

  Tickers:
    GET    /api/master/tickers
    POST   /api/master/tickers
    PUT    /api/master/tickers/{ticker}
    DELETE /api/master/tickers/{ticker}
    POST   /api/master/tickers/{ticker}/sectors   (assign sector list)

  Watchlists:
    GET    /api/master/watchlists
    POST   /api/master/watchlists
    PUT    /api/master/watchlists/{watchlist_id}
    DELETE /api/master/watchlists/{watchlist_id}
    POST   /api/master/watchlists/{watchlist_id}/tickers  (set ticker list)

  Users:
    GET    /api/master/users
    POST   /api/master/users
    PUT    /api/master/users/{email}
    DELETE /api/master/users/{email}

  Convenience:
    GET    /api/master/sectors/{sector_id}/tickers  (tickers for a sector)
"""

from datetime import datetime
from typing import Any, Optional

from fastapi import APIRouter, HTTPException
from psycopg import sql as psql
from pydantic import BaseModel

from .config import settings
from .database import get_connection

router = APIRouter(prefix="/api/master", tags=["master"])

# ── Helpers ──────────────────────────────────────────────────────────────────

def rawdata_conn():
    return get_connection(settings.rawdata_postgres_dsn)


def _not_found(entity: str, key: Any) -> HTTPException:
    return HTTPException(status_code=404, detail=f"{entity} '{key}' not found.")


def _conflict(msg: str) -> HTTPException:
    return HTTPException(status_code=409, detail=msg)


# ─────────────────────────────────────────────────────────────────────────────
# Pydantic Models
# ─────────────────────────────────────────────────────────────────────────────

class SectorIn(BaseModel):
    name: str
    description: Optional[str] = None


class TickerIn(BaseModel):
    ticker: str
    company_name: str
    is_fno: bool = False
    index_memberships: list[str] = []
    exchange: str = "NSE"


class TickerUpdate(BaseModel):
    company_name: Optional[str] = None
    is_fno: Optional[bool] = None
    index_memberships: Optional[list[str]] = None
    exchange: Optional[str] = None


class WatchlistIn(BaseModel):
    name: str
    description: Optional[str] = None


class UserIn(BaseModel):
    email: str
    first_name: str
    last_name: str
    watchlist_id: Optional[int] = None


class UserUpdate(BaseModel):
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    watchlist_id: Optional[int] = None


class AlternativeNameIn(BaseModel):
    data_ticker: str
    current_ticker: str
    company_name: Optional[str] = None
    notes: Optional[str] = None


class AlternativeNameUpdate(BaseModel):
    data_ticker: Optional[str] = None
    current_ticker: Optional[str] = None
    company_name: Optional[str] = None
    notes: Optional[str] = None


class ExcludedTickerIn(BaseModel):
    ticker: str
    reason: Optional[str] = "Manual exclusion from master interface"
    added_by: Optional[str] = "MANUAL"
    status: Optional[str] = "EXCLUDED"
    last_error: Optional[str] = None


class ExcludedTickerUpdate(BaseModel):
    reason: Optional[str] = None
    status: Optional[str] = None
    last_error: Optional[str] = None


class SectorAssign(BaseModel):
    sector_ids: list[int]


class TickerAssign(BaseModel):
    tickers: list[str]


# ─────────────────────────────────────────────────────────────────────────────
# Sectors
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/sectors")
def list_sectors() -> list[dict]:
    with rawdata_conn() as conn, conn.cursor() as cur:
        cur.execute(
            "SELECT id, name, description, created_at FROM sectors ORDER BY name"
        )
        return cur.fetchall()


@router.post("/sectors", status_code=201)
def create_sector(body: SectorIn) -> dict:
    with rawdata_conn() as conn, conn.cursor() as cur:
        try:
            cur.execute(
                "INSERT INTO sectors (name, description) VALUES (%s, %s) RETURNING *",
                (body.name, body.description),
            )
            conn.commit()
            return cur.fetchone()
        except Exception as exc:
            conn.rollback()
            if "unique" in str(exc).lower():
                raise _conflict(f"Sector '{body.name}' already exists.")
            raise HTTPException(500, str(exc))


@router.put("/sectors/{sector_id}")
def update_sector(sector_id: int, body: SectorIn) -> dict:
    with rawdata_conn() as conn, conn.cursor() as cur:
        cur.execute(
            "UPDATE sectors SET name=%s, description=%s WHERE id=%s RETURNING *",
            (body.name, body.description, sector_id),
        )
        row = cur.fetchone()
        if not row:
            raise _not_found("Sector", sector_id)
        conn.commit()
        return row


@router.delete("/sectors/{sector_id}", status_code=204)
def delete_sector(sector_id: int) -> None:
    with rawdata_conn() as conn, conn.cursor() as cur:
        cur.execute("DELETE FROM sectors WHERE id=%s RETURNING id", (sector_id,))
        if not cur.fetchone():
            raise _not_found("Sector", sector_id)
        conn.commit()


@router.get("/sectors/{sector_id}/tickers")
def sector_tickers(sector_id: int) -> list[dict]:
    """All tickers belonging to a sector (with ticker_master details)."""
    with rawdata_conn() as conn, conn.cursor() as cur:
        cur.execute(
            """
            SELECT tm.ticker, tm.company_name, tm.is_fno, tm.index_memberships, tm.exchange
            FROM ticker_master tm
            JOIN ticker_sector ts ON ts.ticker = tm.ticker
            WHERE ts.sector_id = %s
            ORDER BY tm.ticker
            """,
            (sector_id,),
        )
        return cur.fetchall()


# ─────────────────────────────────────────────────────────────────────────────
# Tickers
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/tickers")
def list_tickers(
    search: Optional[str] = None,
    sector_id: Optional[int] = None,
    is_fno: Optional[bool] = None,
) -> list[dict]:
    with rawdata_conn() as conn, conn.cursor() as cur:
        query = "SELECT ticker, company_name, is_fno, index_memberships, exchange, updated_at FROM ticker_master"
        where_clauses = []
        params = []

        if search:
            where_clauses.append("(ticker ILIKE %s OR company_name ILIKE %s)")
            params.extend([f"%{search}%", f"%{search}%"])
        if is_fno is not None:
            where_clauses.append("is_fno = %s")
            params.append(is_fno)

        if where_clauses:
            query += " WHERE " + " AND ".join(where_clauses)

        query += " ORDER BY ticker"
        cur.execute(query, params)
        tickers_rows = cur.fetchall()

        cur.execute("""
            SELECT ts.ticker, s.id, s.name
            FROM ticker_sector ts
            JOIN sectors s ON s.id = ts.sector_id
        """)
        sector_map: dict[str, list[dict[str, Any]]] = {}
        for r in cur.fetchall():
            t_sym = r["ticker"]
            if t_sym not in sector_map:
                sector_map[t_sym] = []
            sector_map[t_sym].append({"id": r["id"], "name": r["name"]})

        result = []
        for row in tickers_rows:
            row_dict = dict(row)
            row_dict["sectors"] = sector_map.get(row["ticker"], [])
            if sector_id:
                if any(s["id"] == sector_id for s in row_dict["sectors"]):
                    result.append(row_dict)
            else:
                result.append(row_dict)

        return result


@router.post("/tickers", status_code=201)
def create_ticker(body: TickerIn) -> dict:
    with rawdata_conn() as conn, conn.cursor() as cur:
        try:
            cur.execute(
                """
                INSERT INTO ticker_master (ticker, company_name, is_fno, index_memberships, exchange)
                VALUES (%s, %s, %s, %s, %s)
                RETURNING *
                """,
                (
                    body.ticker.upper(),
                    body.company_name,
                    body.is_fno,
                    body.index_memberships,
                    body.exchange,
                ),
            )
            row = cur.fetchone()
            conn.commit()
            return {**row, "sectors": []}
        except Exception as exc:
            conn.rollback()
            if "unique" in str(exc).lower():
                raise _conflict(f"Ticker '{body.ticker}' already exists.")
            raise HTTPException(500, str(exc))


@router.put("/tickers/{ticker}")
def update_ticker(ticker: str, body: TickerUpdate) -> dict:
    updates, params = [], []
    if body.company_name is not None:
        updates.append("company_name = %s"); params.append(body.company_name)
    if body.is_fno is not None:
        updates.append("is_fno = %s"); params.append(body.is_fno)
    if body.index_memberships is not None:
        updates.append("index_memberships = %s"); params.append(body.index_memberships)
    if body.exchange is not None:
        updates.append("exchange = %s"); params.append(body.exchange)
    if not updates:
        raise HTTPException(400, "No fields to update.")
    updates.append("updated_at = now()")
    params.append(ticker.upper())
    with rawdata_conn() as conn, conn.cursor() as cur:
        cur.execute(
            f"UPDATE ticker_master SET {', '.join(updates)} WHERE ticker = %s RETURNING *",
            params,
        )
        row = cur.fetchone()
        if not row:
            raise _not_found("Ticker", ticker)
        conn.commit()
        return row


@router.delete("/tickers/{ticker}", status_code=204)
def delete_ticker(ticker: str) -> None:
    with rawdata_conn() as conn, conn.cursor() as cur:
        cur.execute(
            "DELETE FROM ticker_master WHERE ticker=%s RETURNING ticker",
            (ticker.upper(),),
        )
        if not cur.fetchone():
            raise _not_found("Ticker", ticker)
        conn.commit()


@router.post("/tickers/{ticker}/sectors")
def assign_ticker_sectors(ticker: str, body: SectorAssign) -> dict:
    """Replace the sector assignments for a ticker."""
    t = ticker.upper()
    with rawdata_conn() as conn, conn.cursor() as cur:
        # Verify ticker exists
        cur.execute("SELECT ticker FROM ticker_master WHERE ticker=%s", (t,))
        if not cur.fetchone():
            raise _not_found("Ticker", t)
        # Replace all sector links
        cur.execute("DELETE FROM ticker_sector WHERE ticker=%s", (t,))
        if body.sector_ids:
            cur.executemany(
                "INSERT INTO ticker_sector (ticker, sector_id) VALUES (%s, %s) ON CONFLICT DO NOTHING",
                [(t, sid) for sid in body.sector_ids],
            )
        conn.commit()
    return {"ticker": t, "sector_ids": body.sector_ids}


# ─────────────────────────────────────────────────────────────────────────────
# Watchlists
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/watchlists")
def list_watchlists() -> list[dict]:
    with rawdata_conn() as conn, conn.cursor() as cur:
        cur.execute(
            """
            SELECT
                w.id,
                w.name,
                w.description,
                w.created_at,
                COALESCE(
                    json_agg(wi.ticker ORDER BY wi.ticker)
                    FILTER (WHERE wi.ticker IS NOT NULL),
                    '[]'
                ) AS tickers
            FROM watchlist w
            LEFT JOIN watchlist_items wi ON wi.watchlist_id = w.id
            GROUP BY w.id, w.name, w.description, w.created_at
            ORDER BY w.name
            """
        )
        return cur.fetchall()


@router.post("/watchlists", status_code=201)
def create_watchlist(body: WatchlistIn) -> dict:
    name = body.name.strip() if body.name else ""
    if not name:
        raise HTTPException(400, "Watchlist name cannot be empty or blank.")
    with rawdata_conn() as conn, conn.cursor() as cur:
        try:
            cur.execute(
                "INSERT INTO watchlist (name, description) VALUES (%s, %s) RETURNING *",
                (name, body.description),
            )
            row = cur.fetchone()
            conn.commit()
            return {**row, "tickers": []}
        except Exception as exc:
            conn.rollback()
            if "unique" in str(exc).lower():
                raise _conflict(f"Watchlist '{name}' already exists.")
            raise HTTPException(400, f"Invalid watchlist name or data: {exc}")


@router.put("/watchlists/{watchlist_id}")
def update_watchlist(watchlist_id: int, body: WatchlistIn) -> dict:
    name = body.name.strip() if body.name else ""
    if not name:
        raise HTTPException(400, "Watchlist name cannot be empty or blank.")
    with rawdata_conn() as conn, conn.cursor() as cur:
        try:
            cur.execute(
                "UPDATE watchlist SET name=%s, description=%s WHERE id=%s RETURNING *",
                (name, body.description, watchlist_id),
            )
            row = cur.fetchone()
            if not row:
                raise _not_found("Watchlist", watchlist_id)
            conn.commit()
            return row
        except HTTPException:
            raise
        except Exception as exc:
            conn.rollback()
            if "unique" in str(exc).lower():
                raise _conflict(f"Watchlist name '{name}' is already taken.")
            raise HTTPException(400, f"Invalid watchlist update: {exc}")


@router.delete("/watchlists/{watchlist_id}", status_code=204)
def delete_watchlist(watchlist_id: int) -> None:
    """Hard-deletes watchlist and cascades deletions to all references (watchlist_items & user foreign keys)."""
    with rawdata_conn() as conn, conn.cursor() as cur:
        cur.execute(
            "DELETE FROM watchlist WHERE id=%s RETURNING id", (watchlist_id,)
        )
        if not cur.fetchone():
            raise _not_found("Watchlist", watchlist_id)
        conn.commit()



@router.post("/watchlists/{watchlist_id}/tickers")
def set_watchlist_tickers(watchlist_id: int, body: TickerAssign) -> dict:
    """Replace ticker assignments for a watchlist."""
    with rawdata_conn() as conn, conn.cursor() as cur:
        cur.execute("SELECT id FROM watchlist WHERE id=%s", (watchlist_id,))
        if not cur.fetchone():
            raise _not_found("Watchlist", watchlist_id)
        cur.execute("DELETE FROM watchlist_items WHERE watchlist_id=%s", (watchlist_id,))
        tickers_upper = [t.upper() for t in body.tickers]
        if tickers_upper:
            cur.executemany(
                "INSERT INTO watchlist_items (watchlist_id, ticker) VALUES (%s, %s) ON CONFLICT DO NOTHING",
                [(watchlist_id, t) for t in tickers_upper],
            )
        conn.commit()
    return {"watchlist_id": watchlist_id, "tickers": tickers_upper}


# ─────────────────────────────────────────────────────────────────────────────
# Users
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/users")
def list_users() -> list[dict]:
    with rawdata_conn() as conn, conn.cursor() as cur:
        cur.execute(
            """
            SELECT
                u.email, u.first_name, u.last_name,
                u.watchlist_id, w.name AS watchlist_name,
                u.created_at
            FROM users u
            LEFT JOIN watchlist w ON w.id = u.watchlist_id
            ORDER BY u.email
            """
        )
        return cur.fetchall()


@router.post("/users", status_code=201)
def create_user(body: UserIn) -> dict:
    with rawdata_conn() as conn, conn.cursor() as cur:
        try:
            cur.execute(
                """
                INSERT INTO users (email, first_name, last_name, watchlist_id)
                VALUES (%s, %s, %s, %s)
                RETURNING *
                """,
                (body.email.lower(), body.first_name, body.last_name, body.watchlist_id),
            )
            row = cur.fetchone()
            conn.commit()
            return row
        except Exception as exc:
            conn.rollback()
            if "unique" in str(exc).lower():
                raise _conflict(f"User '{body.email}' already exists.")
            raise HTTPException(500, str(exc))


@router.put("/users/{email}")
def update_user(email: str, body: UserUpdate) -> dict:
    updates, params = [], []
    if body.first_name is not None:
        updates.append("first_name = %s"); params.append(body.first_name)
    if body.last_name is not None:
        updates.append("last_name = %s"); params.append(body.last_name)
    if body.watchlist_id is not None:
        updates.append("watchlist_id = %s"); params.append(body.watchlist_id)
    if not updates:
        raise HTTPException(400, "No fields to update.")
    params.append(email.lower())
    with rawdata_conn() as conn, conn.cursor() as cur:
        cur.execute(
            f"UPDATE users SET {', '.join(updates)} WHERE email = %s RETURNING *",
            params,
        )
        row = cur.fetchone()
        if not row:
            raise _not_found("User", email)
        conn.commit()
        return row


@router.delete("/users/{email}", status_code=204)
def delete_user(email: str) -> None:
    with rawdata_conn() as conn, conn.cursor() as cur:
        cur.execute(
            "DELETE FROM users WHERE email=%s RETURNING email", (email.lower(),)
        )
        if not cur.fetchone():
            raise _not_found("User", email)
        conn.commit()


# ─── Alternative Names (Ticker Aliases) ───────────────────────────────────────
@router.get("/alternative-names")
def list_alternative_names(search: Optional[str] = None) -> list[dict]:
    with rawdata_conn() as conn, conn.cursor() as cur:
        query = "SELECT * FROM alternative_names"
        params = []
        if search:
            query += " WHERE data_ticker ILIKE %s OR current_ticker ILIKE %s OR company_name ILIKE %s OR notes ILIKE %s"
            term = f"%{search}%"
            params = [term, term, term, term]
        query += " ORDER BY id DESC"
        cur.execute(query, params)
        return cur.fetchall()


@router.post("/alternative-names", status_code=201)
def create_alternative_name(body: AlternativeNameIn) -> dict:
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    with rawdata_conn() as conn, conn.cursor() as cur:
        try:
            cur.execute(
                """
                INSERT INTO alternative_names (data_ticker, current_ticker, company_name, notes, last_updated)
                VALUES (%s, %s, %s, %s, %s)
                RETURNING *
                """,
                (body.data_ticker.strip().upper(), body.current_ticker.strip().upper(), body.company_name, body.notes, now),
            )
            row = cur.fetchone()
            conn.commit()
            return row
        except Exception as exc:
            conn.rollback()
            if "unique" in str(exc).lower():
                raise _conflict(f"Mapping for data ticker '{body.data_ticker.upper()}' already exists.")
            raise HTTPException(500, str(exc))


@router.put("/alternative-names/{id}")
def update_alternative_name(id: int, body: AlternativeNameUpdate) -> dict:
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    updates, params = [], []
    if body.data_ticker is not None:
        updates.append("data_ticker = %s"); params.append(body.data_ticker.strip().upper())
    if body.current_ticker is not None:
        updates.append("current_ticker = %s"); params.append(body.current_ticker.strip().upper())
    if body.company_name is not None:
        updates.append("company_name = %s"); params.append(body.company_name)
    if body.notes is not None:
        updates.append("notes = %s"); params.append(body.notes)
    updates.append("last_updated = %s"); params.append(now)

    if len(updates) == 1:
        raise HTTPException(400, "No fields to update.")
    params.append(id)
    with rawdata_conn() as conn, conn.cursor() as cur:
        try:
            cur.execute(
                f"UPDATE alternative_names SET {', '.join(updates)} WHERE id = %s RETURNING *",
                params,
            )
            row = cur.fetchone()
            if not row:
                raise _not_found("Alternative Name Mapping", id)
            conn.commit()
            return row
        except HTTPException:
            raise
        except Exception as exc:
            conn.rollback()
            if "unique" in str(exc).lower():
                raise _conflict("A mapping for this data ticker already exists.")
            raise HTTPException(500, str(exc))


@router.delete("/alternative-names/{id}", status_code=204)
def delete_alternative_name(id: int) -> None:
    with rawdata_conn() as conn, conn.cursor() as cur:
        cur.execute("DELETE FROM alternative_names WHERE id = %s RETURNING id", (id,))
        if not cur.fetchone():
            raise _not_found("Alternative Name Mapping", id)
        conn.commit()


# ─── Excluded Tickers (Logical Exclusion Layer) ──────────────────────────────
@router.get("/excluded-tickers")
def list_excluded_tickers(search: Optional[str] = None) -> list[dict]:
    with rawdata_conn() as conn, conn.cursor() as cur:
        query = "SELECT * FROM excluded_tickers"
        params = []
        if search:
            query += " WHERE ticker ILIKE %s OR reason ILIKE %s OR added_by ILIKE %s OR status ILIKE %s OR last_error ILIKE %s"
            term = f"%{search}%"
            params = [term, term, term, term, term]
        query += " ORDER BY id DESC"
        cur.execute(query, params)
        return cur.fetchall()


@router.get("/excluded-tickers/active-list")
def list_active_excluded_tickers() -> list[str]:
    """Returns simple list of active excluded ticker symbols for pipelines & background downloaders."""
    with rawdata_conn() as conn, conn.cursor() as cur:
        cur.execute("SELECT ticker FROM excluded_tickers WHERE UPPER(status) = 'EXCLUDED' OR status IS NULL")
        return [row["ticker"].upper() for row in cur.fetchall()]


@router.post("/excluded-tickers", status_code=201)
def create_excluded_ticker(body: ExcludedTickerIn) -> dict:
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    with rawdata_conn() as conn, conn.cursor() as cur:
        try:
            cur.execute(
                """
                INSERT INTO excluded_tickers (ticker, reason, added_by, status, last_error, created_at)
                VALUES (%s, %s, %s, %s, %s, %s)
                RETURNING *
                """,
                (
                    body.ticker.strip().upper(),
                    body.reason or "Manual exclusion from master interface",
                    body.added_by or "MANUAL",
                    body.status or "EXCLUDED",
                    body.last_error,
                    now,
                ),
            )
            row = cur.fetchone()
            conn.commit()
            return row
        except Exception as exc:
            conn.rollback()
            if "unique" in str(exc).lower():
                raise _conflict(f"Ticker '{body.ticker.upper()}' is already in the exclusion list.")
            raise HTTPException(500, str(exc))


@router.put("/excluded-tickers/{id}")
def update_excluded_ticker(id: int, body: ExcludedTickerUpdate) -> dict:
    updates, params = [], []
    if body.reason is not None:
        updates.append("reason = %s"); params.append(body.reason)
    if body.status is not None:
        updates.append("status = %s"); params.append(body.status)
    if body.last_error is not None:
        updates.append("last_error = %s"); params.append(body.last_error)

    if not updates:
        raise HTTPException(400, "No fields to update.")
    params.append(id)
    with rawdata_conn() as conn, conn.cursor() as cur:
        cur.execute(
            f"UPDATE excluded_tickers SET {', '.join(updates)} WHERE id = %s RETURNING *",
            params,
        )
        row = cur.fetchone()
        if not row:
            raise _not_found("Excluded Ticker", id)
        conn.commit()
        return row


@router.delete("/excluded-tickers/{id}", status_code=204)
def delete_excluded_ticker(id: int) -> None:
    with rawdata_conn() as conn, conn.cursor() as cur:
        cur.execute("DELETE FROM excluded_tickers WHERE id = %s RETURNING id", (id,))
        if not cur.fetchone():
            raise _not_found("Excluded Ticker", id)
        conn.commit()
