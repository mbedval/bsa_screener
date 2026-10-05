from psycopg.rows import dict_row
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

import re
from datetime import datetime
from typing import Any, Optional

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from psycopg import sql as psql
from pydantic import BaseModel

from .config import settings
from .database import get_connection

router = APIRouter(prefix="/api/master", tags=["master"])

# ── Helpers ──────────────────────────────────────────────────────────────────

def rawdata_conn(dataset: Optional[str] = None):
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


class IndexIn(BaseModel):
    symbol: str
    name: str
    exchange: str = "NSE"
    category: str = "BENCHMARK"
    is_fno: bool = True
    lot_size: int = 25
    benchmark_price: Optional[float] = None
    is_active: bool = True


class IndexUpdate(BaseModel):
    name: Optional[str] = None
    exchange: Optional[str] = None
    category: Optional[str] = None
    is_fno: Optional[bool] = None
    lot_size: Optional[int] = None
    benchmark_price: Optional[float] = None
    is_active: Optional[bool] = None


class WatchlistIn(BaseModel):
    name: str
    description: Optional[str] = None


class UserIn(BaseModel):
    email: str
    first_name: str
    last_name: str
    watchlist_id: Optional[int] = None
    is_subscribed: bool = False


class UserUpdate(BaseModel):
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    watchlist_id: Optional[int] = None
    is_subscribed: Optional[bool] = None


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


class BatchDeleteTickers(BaseModel):
    tickers: list[str]


class BatchDeleteWatchlists(BaseModel):
    ids: list[int]


class BatchDeleteUsers(BaseModel):
    emails: list[str]


class ScreenerTickerMappingIn(BaseModel):
    yfinance_ticker: str
    screener_ticker: str
    screener_company_id: Optional[int] = None
    company_name: Optional[str] = None
    notes: Optional[str] = None


class ScreenerTickerMappingUpdate(BaseModel):
    yfinance_ticker: Optional[str] = None
    screener_ticker: Optional[str] = None
    screener_company_id: Optional[int] = None
    company_name: Optional[str] = None
    notes: Optional[str] = None



# ─────────────────────────────────────────────────────────────────────────────
# Sectors
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/sectors")
def list_sectors(dataset: Optional[str] = None) -> list[dict]:
    with rawdata_conn(dataset) as conn, conn.cursor() as cur:
        cur.execute(
            "SELECT id, name, description, created_at FROM sectors ORDER BY name"
        )
        return cur.fetchall()


@router.post("/sectors", status_code=201)
def create_sector(body: SectorIn, dataset: Optional[str] = None) -> dict:
    with rawdata_conn(dataset) as conn, conn.cursor() as cur:
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
def update_sector(sector_id: int, body: SectorIn, dataset: Optional[str] = None) -> dict:
    with rawdata_conn(dataset) as conn, conn.cursor() as cur:
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
def delete_sector(sector_id: int, dataset: Optional[str] = None) -> None:
    with rawdata_conn(dataset) as conn, conn.cursor() as cur:
        cur.execute("DELETE FROM sectors WHERE id=%s RETURNING id", (sector_id,))
        if not cur.fetchone():
            raise _not_found("Sector", sector_id)
        conn.commit()


@router.get("/sectors/{sector_id}/tickers")
def sector_tickers(sector_id: int, dataset: Optional[str] = None) -> list[dict]:
    """All tickers belonging to a sector (with ticker_master details)."""
    with rawdata_conn(dataset) as conn, conn.cursor() as cur:
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


@router.post("/sectors/import-file")
def import_watchlist_sector_file(
    file: UploadFile = File(...),
    custom_sector: Optional[str] = Form(None),
    dataset: Optional[str] = Form(None),
) -> dict:
    """Imports a watchlist sector txt file (e.g. watchlist_pharma.txt).
    
    1. Extracts sector name from filename convention `watchlist_<sector>.txt` unless `custom_sector` is given.
    2. Ensures sector exists in `sectors` table.
    3. Reads tickers line-by-line (or comma-separated).
    4. For missing tickers, inserts into `ticker_master`.
    5. Maps ticker to sector in `ticker_sector`.
    """
    filename = file.filename or "watchlist_sector.txt"
    
    # 1. Determine Sector Name
    if custom_sector and custom_sector.strip():
        sector_name = custom_sector.strip()
    else:
        # Extract from filename: watchlist_pharma.txt -> pharma -> Pharma
        clean_name = Path(filename).stem
        if clean_name.lower().startswith("watchlist_"):
            clean_name = clean_name[10:]
        elif clean_name.lower().startswith("watchlist"):
            clean_name = clean_name[9:]
            
        # Clean delimiters (replace underscores/dashes with spaces and format nicely)
        clean_name = clean_name.strip(" _-")
        if not clean_name:
            sector_name = "General"
        else:
            # Capitalize words (e.g. "it_services" -> "It Services", handle uppercase abbreviations like "IT")
            words = clean_name.replace("_", " ").replace("-", " ").split()
            sector_name = " ".join(w.upper() if len(w) <= 3 and w.lower() in ("it", "fno", "bse", "nse", "fmcg") else w.capitalize() for w in words)

    # Read and parse file lines
    content = file.file.read().decode("utf-8", errors="ignore")
    raw_tokens = re.split(r"[\n\r,;\t]+", content)
    
    tickers_list = []
    for token in raw_tokens:
        tok = token.strip().upper()
        # Remove comments or empty lines
        if tok and not tok.startswith("#") and not tok.startswith("//"):
            # Strip extensions if user pasted full symbols like TCS.NS -> TCS
            clean_tok = re.sub(r"\.(NS|BO)$", "", tok)
            if clean_tok not in tickers_list:
                tickers_list.append(clean_tok)

    if not tickers_list:
        raise HTTPException(400, "No valid tickers found in the uploaded file.")

    default_exchange = "NASDAQ" if dataset == "us_intelligence" else "NSE"

    with rawdata_conn(dataset) as conn, conn.cursor() as cur:
        # 2. Get or create sector
        cur.execute("SELECT id, name FROM sectors WHERE LOWER(name) = LOWER(%s)", (sector_name,))
        sector_row = cur.fetchone()
        if sector_row:
            sector_id = sector_row["id"]
            sector_name = sector_row["name"] # preserve actual case in DB
        else:
            cur.execute(
                "INSERT INTO sectors (name, description) VALUES (%s, %s) RETURNING id, name",
                (sector_name, f"Imported from {filename}"),
            )
            created_sec = cur.fetchone()
            sector_id = created_sec["id"]
            sector_name = created_sec["name"]

        # Track statistics
        new_tickers_added = []
        existing_tickers_found = []
        new_mappings_created = []
        already_mapped = []

        for t in tickers_list:
            # Check if ticker exists in ticker_master
            cur.execute("SELECT ticker FROM ticker_master WHERE ticker = %s", (t,))
            t_row = cur.fetchone()
            if not t_row:
                # Add to ticker_master
                cur.execute(
                    "INSERT INTO ticker_master (ticker, company_name, exchange) VALUES (%s, %s, %s)",
                    (t, t, default_exchange),
                )
                new_tickers_added.append(t)
            else:
                existing_tickers_found.append(t)

            # Check if mapping exists in ticker_sector
            cur.execute(
                "SELECT ticker FROM ticker_sector WHERE ticker = %s AND sector_id = %s",
                (t, sector_id),
            )
            m_row = cur.fetchone()
            if not m_row:
                cur.execute(
                    "INSERT INTO ticker_sector (ticker, sector_id) VALUES (%s, %s)",
                    (t, sector_id),
                )
                new_mappings_created.append(t)
            else:
                already_mapped.append(t)

        conn.commit()

    return {
        "status": "success",
        "filename": filename,
        "sector_id": sector_id,
        "sector_name": sector_name,
        "total_tickers": len(tickers_list),
        "new_tickers_added_count": len(new_tickers_added),
        "new_tickers_added": new_tickers_added,
        "existing_tickers_count": len(existing_tickers_found),
        "new_mappings_count": len(new_mappings_created),
        "already_mapped_count": len(already_mapped),
        "tickers": tickers_list,
    }


# ─────────────────────────────────────────────────────────────────────────────
# Indices Master
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/indices")
def list_indices(
    search: Optional[str] = None,
    category: Optional[str] = None,
    is_fno: Optional[bool] = None,
    dataset: Optional[str] = None,
) -> list[dict]:
    with rawdata_conn(dataset) as conn, conn.cursor() as cur:
        query = "SELECT symbol, name, exchange, category, is_fno, lot_size, benchmark_price, is_active, updated_at FROM indices_master"
        where_clauses, params = [], []
        if search:
            where_clauses.append("(symbol ILIKE %s OR name ILIKE %s)")
            params.extend([f"%{search}%", f"%{search}%"])
        if category:
            where_clauses.append("category ILIKE %s")
            params.append(category)
        if is_fno is not None:
            where_clauses.append("is_fno = %s")
            params.append(is_fno)

        if where_clauses:
            query += " WHERE " + " AND ".join(where_clauses)
        query += " ORDER BY symbol"
        cur.execute(query, params)
        return [dict(r) for r in cur.fetchall()]


@router.post("/indices", status_code=201)
def create_index(body: IndexIn, dataset: Optional[str] = None) -> dict:
    with rawdata_conn(dataset) as conn, conn.cursor() as cur:
        try:
            cur.execute(
                """
                INSERT INTO indices_master (symbol, name, exchange, category, is_fno, lot_size, benchmark_price, is_active, updated_at)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, NOW())
                RETURNING *
                """,
                (
                    body.symbol.upper().strip(),
                    body.name.strip(),
                    body.exchange,
                    body.category.upper().strip(),
                    body.is_fno,
                    body.lot_size,
                    body.benchmark_price,
                    body.is_active,
                ),
            )
            row = cur.fetchone()
            conn.commit()
            return dict(row)
        except Exception as exc:
            conn.rollback()
            if "unique" in str(exc).lower() or "primary key" in str(exc).lower():
                raise _conflict(f"Index '{body.symbol}' already exists.")
            raise HTTPException(500, str(exc))


@router.put("/indices/{symbol}")
def update_index(symbol: str, body: IndexUpdate, dataset: Optional[str] = None) -> dict:
    updates, params = [], []
    if body.name is not None:
        updates.append("name = %s"); params.append(body.name)
    if body.exchange is not None:
        updates.append("exchange = %s"); params.append(body.exchange)
    if body.category is not None:
        updates.append("category = %s"); params.append(body.category)
    if body.is_fno is not None:
        updates.append("is_fno = %s"); params.append(body.is_fno)
    if body.lot_size is not None:
        updates.append("lot_size = %s"); params.append(body.lot_size)
    if body.benchmark_price is not None:
        updates.append("benchmark_price = %s"); params.append(body.benchmark_price)
    if body.is_active is not None:
        updates.append("is_active = %s"); params.append(body.is_active)

    if not updates:
        raise HTTPException(400, "No fields to update.")

    updates.append("updated_at = NOW()")
    params.append(symbol.upper().strip())

    with rawdata_conn(dataset) as conn, conn.cursor() as cur:
        cur.execute(
            f"UPDATE indices_master SET {', '.join(updates)} WHERE symbol = %s RETURNING *",
            params,
        )
        row = cur.fetchone()
        if not row:
            raise _not_found("Index", symbol)
        conn.commit()
        return dict(row)


@router.delete("/indices/{symbol}", status_code=204)
def delete_index(symbol: str, dataset: Optional[str] = None):
    with rawdata_conn(dataset) as conn, conn.cursor() as cur:
        cur.execute("DELETE FROM indices_master WHERE symbol = %s RETURNING symbol", (symbol.upper().strip(),))
        row = cur.fetchone()
        if not row:
            raise _not_found("Index", symbol)
        conn.commit()


@router.post("/indices/upload-csv")
@router.post("/indices/import-file")
def import_indices_master_file(
    file: UploadFile = File(...),
    dataset: Optional[str] = Form(None),
) -> dict:
    """Imports indices master CSV/txt file into indices_master table."""
    import csv, io

    filename = file.filename or "indices_master.csv"
    raw_content = file.file.read().decode("utf-8-sig", errors="ignore")

    records = []
    lines = raw_content.splitlines()
    non_empty_lines = [l.strip() for l in lines if l.strip() and not l.strip().startswith("#")]
    if not non_empty_lines:
        raise HTTPException(400, "The uploaded file is empty.")

    first_line_parts = [p.strip().lower().replace('"', '').replace("'", "") for p in next(csv.reader([non_empty_lines[0]]))]
    has_header = "symbol" in first_line_parts or "name" in first_line_parts or "index" in first_line_parts

    if has_header:
        reader = csv.DictReader(io.StringIO(raw_content))
        for row in reader:
            if not row:
                continue
            sym = None
            for k, v in row.items():
                if k and k.strip().lower() in ("symbol", "index", "ticker"):
                    sym = str(v).strip().upper() if v else None
                    break
            if not sym:
                continue

            name_val = None
            for k, v in row.items():
                if k and k.strip().lower() in ("name", "index_name", "title"):
                    name_val = str(v).strip() if v else None
                    break

            exch_val = None
            for k, v in row.items():
                if k and k.strip().lower() == "exchange":
                    exch_val = str(v).strip() if v else None
                    break

            cat_val = None
            for k, v in row.items():
                if k and k.strip().lower() == "category":
                    cat_val = str(v).strip().upper() if v else None
                    break

            is_fno_val = True
            for k, v in row.items():
                if k and k.strip().lower() in ("is_fno", "fno"):
                    is_fno_val = str(v).strip().lower() in ("true", "1", "t", "yes")
                    break

            lot_val = 25
            for k, v in row.items():
                if k and k.strip().lower() in ("lot_size", "lot"):
                    try: lot_val = int(v)
                    except Exception: pass
                    break

            bm_price = None
            for k, v in row.items():
                if k and k.strip().lower() in ("benchmark_price", "price", "cmp"):
                    try: bm_price = float(v)
                    except Exception: pass
                    break

            records.append({
                "symbol": sym,
                "name": name_val or f"{sym} Index",
                "exchange": exch_val or "NSE",
                "category": cat_val or "BENCHMARK",
                "is_fno": is_fno_val,
                "lot_size": lot_val,
                "benchmark_price": bm_price,
                "is_active": True
            })
    else:
        raw_tokens = re.split(r"[\n\r,;\t]+", raw_content)
        for token in raw_tokens:
            tok = token.strip().upper()
            if tok and not tok.startswith("#"):
                if not any(r["symbol"] == tok for r in records):
                    records.append({
                        "symbol": tok,
                        "name": f"{tok} Index",
                        "exchange": "NSE",
                        "category": "BENCHMARK",
                        "is_fno": True,
                        "lot_size": 25,
                        "benchmark_price": None,
                        "is_active": True
                    })

    if not records:
        raise HTTPException(400, "No valid index entries found in the uploaded file.")

    new_indices = []
    updated_indices = []

    with rawdata_conn(dataset) as conn, conn.cursor() as cur:
        for rec in records:
            s = rec["symbol"]
            n = rec["name"]
            e = rec["exchange"]
            c = rec["category"]
            f = rec["is_fno"]
            l = rec["lot_size"]
            bp = rec["benchmark_price"]
            act = rec["is_active"]

            cur.execute("SELECT symbol FROM indices_master WHERE symbol = %s", (s,))
            exists = cur.fetchone()
            if not exists:
                cur.execute(
                    """
                    INSERT INTO indices_master (symbol, name, exchange, category, is_fno, lot_size, benchmark_price, is_active, updated_at)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, NOW())
                    """,
                    (s, n, e, c, f, l, bp, act),
                )
                new_indices.append(s)
            else:
                cur.execute(
                    """
                    UPDATE indices_master
                    SET name = COALESCE(NULLIF(%s, ''), name),
                        exchange = COALESCE(NULLIF(%s, ''), exchange),
                        category = COALESCE(NULLIF(%s, ''), category),
                        is_fno = %s,
                        lot_size = COALESCE(%s, lot_size),
                        benchmark_price = COALESCE(%s, benchmark_price),
                        is_active = %s,
                        updated_at = NOW()
                    WHERE symbol = %s
                    """,
                    (n, e, c, f, l, bp, act, s),
                )
                updated_indices.append(s)
        conn.commit()

    return {
        "status": "success",
        "filename": filename,
        "total_records": len(records),
        "new_indices_count": len(new_indices),
        "updated_indices_count": len(updated_indices),
        "indices": [r["symbol"] for r in records],
    }


# ─────────────────────────────────────────────────────────────────────────────
# Tickers
# ─────────────────────────────────────────────────────────────────────────────

def _parse_index_memberships(raw_val: Any) -> list[str]:
    if not raw_val:
        return []
    if isinstance(raw_val, list):
        return [str(x).strip() for x in raw_val if str(x).strip()]
    val_str = str(raw_val).strip()
    if not val_str:
        return []
    if val_str.startswith("{") and val_str.endswith("}"):
        inner = val_str[1:-1]
        return [x.strip(' "\'') for x in inner.split(",") if x.strip(' "\'')]
    if val_str.startswith("[") and val_str.endswith("]"):
        try:
            import json
            parsed = json.loads(val_str)
            if isinstance(parsed, list):
                return [str(x).strip() for x in parsed if str(x).strip()]
        except Exception:
            pass
    sep = "|" if "|" in val_str else ","
    return [x.strip() for x in val_str.split(sep) if x.strip()]


@router.post("/tickers/upload-csv")
@router.post("/tickers/import-file")
def import_ticker_master_file(
    file: UploadFile = File(...),
    dataset: Optional[str] = Form(None),
) -> dict:
    """Imports ticker master CSV/txt file into ticker_master table.
    
    Supports:
    1. Standard CSV with header columns (ticker, company_name, is_fno, sector, index_memberships, exchange).
    2. Plain list of ticker symbols line-by-line or comma-separated.
    """
    import csv, io

    filename = file.filename or "ticker_master.csv"
    raw_content = file.file.read().decode("utf-8-sig", errors="ignore")

    records = []
    # Check if CSV has recognizable header
    lines = raw_content.splitlines()
    non_empty_lines = [l.strip() for l in lines if l.strip() and not l.strip().startswith("#") and not l.strip().startswith("//")]
    if not non_empty_lines:
        raise HTTPException(400, "The uploaded file is empty.")

    first_line_parts = [p.strip().lower().replace('"', '').replace("'", "") for p in next(csv.reader([non_empty_lines[0]]))]
    has_header = "ticker" in first_line_parts or "symbol" in first_line_parts

    if has_header:
        reader = csv.DictReader(io.StringIO(raw_content))
        for row in reader:
            if not row:
                continue
            # Find ticker column
            sym = None
            for k, v in row.items():
                if k and k.strip().lower() in ("ticker", "symbol"):
                    sym = str(v).strip().upper() if v else None
                    break
            if not sym:
                continue

            sym = re.sub(r"\.(NS|BO)$", "", sym)
            comp = None
            for k, v in row.items():
                if k and k.strip().lower() in ("company_name", "company", "name"):
                    comp = str(v).strip() if v else None
                    break
            
            is_fno_val = False
            for k, v in row.items():
                if k and k.strip().lower() in ("is_fno", "fno"):
                    val = str(v).strip().lower()
                    is_fno_val = val in ("true", "1", "t", "yes")
                    break

            sec_val = None
            for k, v in row.items():
                if k and k.strip().lower() == "sector":
                    sec_val = str(v).strip() if v else None
                    break

            idx_val = []
            for k, v in row.items():
                if k and k.strip().lower() in ("index_memberships", "indices", "indexes"):
                    idx_val = _parse_index_memberships(v)
                    break

            exch_val = None
            for k, v in row.items():
                if k and k.strip().lower() == "exchange":
                    exch_val = str(v).strip() if v else None
                    break

            about_val = None
            for k, v in row.items():
                if k and k.strip().lower() in ("about_company", "about company", "about"):
                    about_val = str(v).strip() if v else None
                    break

            prod_serv_val = None
            for k, v in row.items():
                if k and k.strip().lower() in ("product and service it do", "products & services", "product_services", "services"):
                    prod_serv_val = str(v).strip() if v else None
                    break

            records.append({
                "ticker": sym,
                "company_name": comp or sym,
                "is_fno": is_fno_val,
                "sector": sec_val,
                "index_memberships": idx_val,
                "exchange": exch_val,
                "about_company": about_val,
                "product_services": prod_serv_val
            })
    else:
        # Fallback raw token list parsing
        raw_tokens = re.split(r"[\n\r,;\t]+", raw_content)
        for token in raw_tokens:
            tok = token.strip().upper()
            if tok and not tok.startswith("#") and not tok.startswith("//"):
                clean_tok = re.sub(r"\.(NS|BO)$", "", tok)
                if not any(r["ticker"] == clean_tok for r in records):
                    records.append({
                        "ticker": clean_tok,
                        "company_name": clean_tok,
                        "is_fno": False,
                        "sector": None,
                        "index_memberships": [],
                        "exchange": None,
                        "about_company": None,
                        "product_services": None
                    })

    if not records:
        raise HTTPException(400, "No valid ticker entries found in the uploaded file.")

    default_exchange = "NASDAQ" if dataset == "us_intelligence" else "NSE"
    new_tickers = []
    updated_tickers = []

    with rawdata_conn(dataset) as conn, conn.cursor() as cur:
        for rec in records:
            t = rec["ticker"]
            c_name = rec["company_name"]
            fno = rec["is_fno"]
            sec = rec["sector"]
            idx = rec["index_memberships"]
            exch = rec["exchange"] or default_exchange
            about_c = rec.get("about_company")
            prod_s = rec.get("product_services")

            cur.execute("SELECT ticker FROM ticker_master WHERE ticker = %s", (t,))
            exists = cur.fetchone()
            if not exists:
                cur.execute(
                    """
                    INSERT INTO ticker_master (ticker, company_name, is_fno, sector, index_memberships, exchange, updated_at)
                    VALUES (%s, %s, %s, %s, %s, %s, NOW())
                    """,
                    (t, c_name, fno, sec, idx, exch),
                )
                new_tickers.append(t)
            else:
                cur.execute(
                    """
                    UPDATE ticker_master
                    SET company_name = COALESCE(NULLIF(%s, ''), company_name),
                        is_fno = %s,
                        sector = COALESCE(%s, sector),
                        index_memberships = CASE WHEN array_length(%s::text[], 1) > 0 THEN %s ELSE index_memberships END,
                        exchange = COALESCE(NULLIF(%s, ''), exchange),
                        updated_at = NOW()
                    WHERE ticker = %s
                    """,
                    (c_name, fno, sec, idx, idx, exch, t),
                )
                updated_tickers.append(t)

            # Upsert About Company + Product and services into opportunities_risk table
            if about_c or prod_s:
                full_about_text = f"{about_c or ''}\n\nProducts & Services: {prod_s or ''}".strip() if prod_s else (about_c or '')
                cur.execute(
                    """
                    INSERT INTO opportunities_risk (ticker, about_company, updated_at)
                    VALUES (%s, %s, NOW())
                    ON CONFLICT (ticker) DO UPDATE SET
                        about_company = EXCLUDED.about_company,
                        updated_at = NOW()
                    """,
                    (t, full_about_text),
                )

            if sec:
                cur.execute("SELECT id FROM sectors WHERE LOWER(name) = LOWER(%s)", (sec,))
                s_row = cur.fetchone()
                if s_row:
                    s_id = s_row["id"]
                else:
                    cur.execute(
                        "INSERT INTO sectors (name, description) VALUES (%s, %s) RETURNING id",
                        (sec, f"Imported from {filename}"),
                    )
                    s_id = cur.fetchone()["id"]

                cur.execute(
                    "INSERT INTO ticker_sector (ticker, sector_id) VALUES (%s, %s) ON CONFLICT (ticker, sector_id) DO NOTHING",
                    (t, s_id),
                )

            if fno:
                try:
                    cur.execute(
                        """
                        INSERT INTO fno_stock_master (symbol, underlying_name, instrument_type, is_active, entry_date, created_at)
                        VALUES (%s, %s, 'STOCK', true, CURRENT_DATE::text, NOW()::text)
                        ON CONFLICT (symbol) DO UPDATE SET is_active = true, underlying_name = EXCLUDED.underlying_name
                        """,
                        (t, c_name),
                    )
                except Exception:
                    pass

        conn.commit()

    return {
        "status": "success",
        "filename": filename,
        "total_records": len(records),
        "new_tickers_count": len(new_tickers),
        "updated_tickers_count": len(updated_tickers),
        "new_tickers": new_tickers,
        "updated_tickers": updated_tickers,
        "tickers": [r["ticker"] for r in records],
    }




@router.get("/tickers")
def list_tickers(
    search: Optional[str] = None,
    sector_id: Optional[int] = None,
    is_fno: Optional[bool] = None,
    dataset: Optional[str] = None,
) -> list[dict]:
    with rawdata_conn(dataset) as conn, conn.cursor() as cur:
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
def create_ticker(body: TickerIn, dataset: Optional[str] = None) -> dict:
    with rawdata_conn(dataset) as conn, conn.cursor() as cur:
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
            if body.is_fno:
                try:
                    cur.execute(
                        """
                        INSERT INTO fno_stock_master (symbol, underlying_name, instrument_type, is_active, entry_date, created_at)
                        VALUES (%s, %s, 'STOCK', true, CURRENT_DATE::text, NOW()::text)
                        ON CONFLICT (symbol) DO UPDATE SET is_active = true, underlying_name = EXCLUDED.underlying_name
                        """,
                        (body.ticker.upper(), body.company_name),
                    )
                except Exception:
                    pass
            conn.commit()
            return {**row, "sectors": []}
        except Exception as exc:
            conn.rollback()
            if "unique" in str(exc).lower():
                raise _conflict(f"Ticker '{body.ticker}' already exists.")
            raise HTTPException(500, str(exc))


@router.put("/tickers/{ticker}")
def update_ticker(ticker: str, body: TickerUpdate, dataset: Optional[str] = None) -> dict:
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
    with rawdata_conn(dataset) as conn, conn.cursor() as cur:
        cur.execute(
            f"UPDATE ticker_master SET {', '.join(updates)} WHERE ticker = %s RETURNING *",
            params,
        )
        row = cur.fetchone()
        if not row:
            raise _not_found("Ticker", ticker)
        if row.get("is_fno"):
            try:
                cur.execute(
                    """
                    INSERT INTO fno_stock_master (symbol, underlying_name, instrument_type, is_active, entry_date, created_at)
                    VALUES (%s, %s, 'STOCK', true, CURRENT_DATE::text, NOW()::text)
                    ON CONFLICT (symbol) DO UPDATE SET is_active = true, underlying_name = EXCLUDED.underlying_name
                    """,
                    (row["ticker"], row["company_name"]),
                )
            except Exception:
                pass
        conn.commit()
        return row


@router.delete("/tickers/{ticker}", status_code=204)
def delete_ticker(ticker: str, dataset: Optional[str] = None) -> None:
    with rawdata_conn(dataset) as conn, conn.cursor() as cur:
        cur.execute(
            "DELETE FROM ticker_master WHERE ticker=%s RETURNING ticker",
            (ticker.upper(),),
        )
        if not cur.fetchone():
            raise _not_found("Ticker", ticker)
        conn.commit()


@router.post("/tickers/batch-delete")
def delete_tickers_batch(body: BatchDeleteTickers, dataset: Optional[str] = None) -> dict:
    if not body.tickers:
        return {"deleted_count": 0}
    clean_tickers = [t.upper() for t in body.tickers]
    with rawdata_conn(dataset) as conn, conn.cursor() as cur:
        cur.execute(
            "DELETE FROM ticker_master WHERE ticker = ANY(%s) RETURNING ticker",
            (clean_tickers,),
        )
        deleted = cur.fetchall()
        conn.commit()
        return {"deleted_count": len(deleted), "deleted_tickers": [r["ticker"] for r in deleted]}



@router.post("/tickers/{ticker}/sectors")
def assign_ticker_sectors(ticker: str, body: SectorAssign, dataset: Optional[str] = None) -> dict:
    """Replace the sector assignments for a ticker."""
    t = ticker.upper()
    with rawdata_conn(dataset) as conn, conn.cursor() as cur:
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


@router.post("/watchlists/batch-delete")
def delete_watchlists_batch(body: BatchDeleteWatchlists) -> dict:
    if not body.ids:
        return {"deleted_count": 0}
    with rawdata_conn() as conn, conn.cursor() as cur:
        cur.execute(
            "DELETE FROM watchlist WHERE id = ANY(%s) RETURNING id",
            (body.ids,),
        )
        deleted = cur.fetchall()
        conn.commit()
        return {"deleted_count": len(deleted), "deleted_ids": [r["id"] for r in deleted]}




@router.get("/watchlists/download-csv")
def download_watchlists_csv():
    from fastapi.responses import StreamingResponse
    import csv, io
    with rawdata_conn() as conn, conn.cursor() as cur:
        cur.execute("""
            SELECT w.name, w.description, wi.ticker
            FROM watchlist w
            LEFT JOIN watchlist_items wi ON w.id = wi.watchlist_id
            ORDER BY w.name ASC, wi.ticker ASC
        """)
        rows = cur.fetchall()

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["Watchlist Name", "Description", "Ticker"])
    for row in rows:
        writer.writerow([row["name"], row["description"] or "", row["ticker"] or ""])
    output.seek(0)
    return StreamingResponse(
        output,
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=watchlists.csv"}
    )


@router.post("/watchlists/upload-csv")
def upload_watchlists_csv(file: UploadFile = File(...)):
    import csv, io
    if not file.filename.endswith(".csv"):
        raise HTTPException(400, "Only CSV files are supported.")
    try:
        raw_content = file.file.read().decode("utf-8", errors="replace")
    except Exception as e:
        raise HTTPException(400, f"Error reading file: {e}")

    records = []
    try:
        reader = csv.DictReader(io.StringIO(raw_content))
        for row in reader:
            w_name = None
            w_desc = None
            t_ticker = None
            for k, v in row.items():
                if k:
                    kl = k.strip().lower()
                    if kl in ("watchlist name", "watchlist", "name"):
                        w_name = str(v).strip() if v else None
                    elif kl in ("description", "desc"):
                        w_desc = str(v).strip() if v else None
                    elif kl in ("ticker", "symbol"):
                        t_ticker = str(v).strip().upper() if v else None
            
            if w_name:
                records.append({
                    "name": w_name,
                    "description": w_desc or "",
                    "ticker": t_ticker
                })
    except Exception as e:
        raise HTTPException(400, f"Failed to parse CSV: {e}")

    if not records:
        raise HTTPException(400, "No valid watchlist entries found in the uploaded file.")

    watchlists_data = {}
    for rec in records:
        name = rec["name"]
        if name not in watchlists_data:
            watchlists_data[name] = {"description": rec["description"], "tickers": set()}
        if not watchlists_data[name]["description"] and rec["description"]:
             watchlists_data[name]["description"] = rec["description"]
        if rec["ticker"]:
             watchlists_data[name]["tickers"].add(rec["ticker"])

    with rawdata_conn() as conn, conn.cursor() as cur:
        cur.execute("SELECT ticker FROM ticker_master")
        known_tickers = {r["ticker"] for r in cur.fetchall()}
        
        for w_name, w_data in watchlists_data.items():
            cur.execute(
                "INSERT INTO watchlist (name, description) VALUES (%s, %s) ON CONFLICT (name) DO UPDATE SET description = EXCLUDED.description RETURNING id",
                (w_name, w_data["description"])
            )
            w_id = cur.fetchone()["id"]
            
            valid_tickers = [t for t in w_data["tickers"] if t in known_tickers]
            if valid_tickers:
                 cur.execute("DELETE FROM watchlist_items WHERE watchlist_id = %s", (w_id,))
                 cur.executemany(
                     "INSERT INTO watchlist_items (watchlist_id, ticker) VALUES (%s, %s) ON CONFLICT DO NOTHING",
                     [(w_id, t) for t in valid_tickers]
                 )
        conn.commit()

    return {"message": f"Successfully imported {len(watchlists_data)} watchlists from CSV."}


@router.post("/watchlists/{watchlist_id}/tickers")
def set_watchlist_tickers(watchlist_id: int, body: TickerAssign) -> dict:
    """Replace ticker assignments for a watchlist. Silently skips tickers not in ticker_master."""
    with rawdata_conn() as conn, conn.cursor() as cur:
        cur.execute("SELECT id FROM watchlist WHERE id=%s", (watchlist_id,))
        if not cur.fetchone():
            raise _not_found("Watchlist", watchlist_id)

        tickers_upper = list(dict.fromkeys(t.upper().strip() for t in body.tickers if t.strip()))

        # Validate: only keep tickers that exist in ticker_master (FK constraint)
        valid_tickers: list[str] = []
        skipped_tickers: list[str] = []
        if tickers_upper:
            cur.execute(
                "SELECT ticker FROM ticker_master WHERE ticker = ANY(%s)",
                (tickers_upper,)
            )
            known = {r["ticker"] for r in cur.fetchall()}
            valid_tickers = [t for t in tickers_upper if t in known]
            skipped_tickers = [t for t in tickers_upper if t not in known]

        cur.execute("DELETE FROM watchlist_items WHERE watchlist_id=%s", (watchlist_id,))
        if valid_tickers:
            cur.executemany(
                "INSERT INTO watchlist_items (watchlist_id, ticker) VALUES (%s, %s) ON CONFLICT DO NOTHING",
                [(watchlist_id, t) for t in valid_tickers],
            )
        conn.commit()
    return {
        "watchlist_id": watchlist_id,
        "tickers": valid_tickers,
        "skipped": skipped_tickers,
        "saved_count": len(valid_tickers),
        "skipped_count": len(skipped_tickers),
    }


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
                u.is_subscribed, u.created_at
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
                INSERT INTO users (email, first_name, last_name, watchlist_id, is_subscribed)
                VALUES (%s, %s, %s, %s, %s)
                RETURNING *
                """,
                (body.email.lower(), body.first_name, body.last_name, body.watchlist_id, body.is_subscribed),
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
    if body.is_subscribed is not None:
        updates.append("is_subscribed = %s"); params.append(body.is_subscribed)
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


@router.post("/users/batch-delete")
def delete_users_batch(body: BatchDeleteUsers) -> dict:
    if not body.emails:
        return {"deleted_count": 0}
    clean_emails = [e.lower() for e in body.emails]
    with rawdata_conn() as conn, conn.cursor() as cur:
        cur.execute(
            "DELETE FROM users WHERE email = ANY(%s) RETURNING email",
            (clean_emails,),
        )
        deleted = cur.fetchall()
        conn.commit()
        return {"deleted_count": len(deleted), "deleted_emails": [r["email"] for r in deleted]}



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


# ─── Newsletter Dispatch Router ──────────────────────────────────────────────
from pathlib import Path
from engine.reports.pdf_generator import generate_pdf_report, generate_newsletter_pdfs
from engine.utils.email_sender import send_email_with_attachment

@router.post("/users/{email}/newsletter-send")
def send_user_newsletter(email: str):
    """Generates PDF reports for a user's watchlist and emails them if they are subscribed."""
    with rawdata_conn() as conn, conn.cursor() as cur:
        # Check user details & subscription status
        cur.execute("SELECT first_name, watchlist_id, is_subscribed FROM users WHERE email = %s", (email.lower(),))
        user_row = cur.fetchone()
        if not user_row:
            raise _not_found("User", email)
            
        first_name, watchlist_id, is_subscribed = user_row["first_name"], user_row["watchlist_id"], user_row["is_subscribed"]
        
        if not is_subscribed:
            raise HTTPException(400, f"User '{email}' is not subscribed to the newsletter.")
            
        if not watchlist_id:
            raise HTTPException(400, f"User '{email}' does not have an assigned watchlist.")
            
        # Get watchlist tickers
        cur.execute("SELECT ticker FROM watchlist_items WHERE watchlist_id = %s", (watchlist_id,))
        tickers = [row["ticker"] for row in cur.fetchall()]
        
    if not tickers:
        raise HTTPException(400, f"Watchlist is empty. Add tickers to watchlist first.")
        
    # Generate batched newsletter PDFs
    user_name = f"{first_name} {user_row.get('last_name', '')}".strip()
    pdf_paths = generate_newsletter_pdfs(email, tickers, user_name=user_name)
            
    if not pdf_paths:
        raise HTTPException(500, "Failed to generate newsletter PDF reports for the watchlist.")
        
    # Build inline HTML summary table
    from send_newsletters import build_newsletter_html_table
    table_html = build_newsletter_html_table(tickers)

    # Send email
    subject = f"Your BSA Daily Watchlist Reports - {datetime.now().strftime('%Y-%m-%d')}"
    body = f"""
    <html>
        <body style="font-family: Arial, sans-serif; color: #333; background-color: #f8fafc; padding: 20px;">
            <div style="background-color: #ffffff; padding: 24px; border-radius: 8px; border: 1px solid #e2e8f0; max-width: 900px; margin: 0 auto;">
                <h3 style="color: #0f172a; margin-top: 0;">Hello {first_name},</h3>
                <p style="font-size: 14px; color: #475569;">Please find below the daily summary and attached PDF analysis reports for the tickers in your watchlist.</p>
                
                <h4 style="color: #0f172a; border-bottom: 2px solid #cbd5e1; padding-bottom: 6px; margin-top: 24px;">Watchlist Performance Snapshot</h4>
                {table_html}
                
                <p style="font-size: 12px; color: #64748b; margin-top: 30px; border-top: 1px solid #e2e8f0; padding-top: 12px;">
                    This email was sent automatically by the <strong>BSA Screener Engine</strong>.
                </p>
            </div>
        </body>
    </html>
    """
    
    sent_result = send_email_with_attachment(subject, body, pdf_paths, [email], return_detail=True)
    if isinstance(sent_result, tuple):
        sent, err_detail = sent_result
    else:
        sent, err_detail = sent_result, "Failed to deliver newsletter email via SMTP server."

    if not sent:
        raise HTTPException(500, err_detail)

    return {"status": "success", "detail": f"Sent {len(pdf_paths)} reports to {email}"}


@router.get("/users/{email}/newsletter-download")
def download_user_newsletter(email: str):
    """Generates PDF newsletter for a user's watchlist and returns it as a download."""
    with rawdata_conn() as conn, conn.cursor() as cur:
        cur.execute("SELECT first_name, last_name, watchlist_id FROM users WHERE email = %s", (email.lower(),))
        user_row = cur.fetchone()
        if not user_row:
            raise _not_found("User", email)
            
        first_name, watchlist_id = user_row["first_name"], user_row["watchlist_id"]
        
        if not watchlist_id:
            raise HTTPException(400, f"User '{email}' does not have an assigned watchlist.")
            
        cur.execute("SELECT ticker FROM watchlist_items WHERE watchlist_id = %s", (watchlist_id,))
        tickers = [row["ticker"] for row in cur.fetchall()]
        
    if not tickers:
        raise HTTPException(400, f"Watchlist is empty. Add tickers to watchlist first.")
        
    user_name = f"{first_name} {user_row.get('last_name', '')}".strip()
    pdf_paths = generate_newsletter_pdfs(email, tickers, user_name=user_name)
    
    if not pdf_paths:
        raise HTTPException(500, "Failed to generate newsletter PDF.")
        
    # If multiple parts, return the first one (or ideally we'd zip them, but standard is first one)
    from fastapi.responses import FileResponse
    return FileResponse(pdf_paths[0], media_type="application/pdf", filename=f"newsletter_{email}.pdf")


# ── Reference Pages CRUD ──────────────────────────────────────────────────────

class ReferencePageCreate(BaseModel):
    title: str
    url: str
    category: Optional[str] = "General"
    description: Optional[str] = None

class ReferencePageUpdate(BaseModel):
    title: Optional[str] = None
    url: Optional[str] = None
    category: Optional[str] = None
    description: Optional[str] = None

@router.get("/reference-pages")
def get_reference_pages(dataset: Optional[str] = None):
    with rawdata_conn(dataset) as conn, conn.cursor() as cur:
        cur.execute("SELECT id, title, url, category, description, created_at::text FROM reference_pages ORDER BY id DESC")
        return cur.fetchall()

@router.post("/reference-pages", status_code=201)
def create_reference_page(data: ReferencePageCreate, dataset: Optional[str] = None):
    if not data.title.strip() or not data.url.strip():
        raise HTTPException(400, "Title and URL are required.")
    with rawdata_conn(dataset) as conn, conn.cursor() as cur:
        cur.execute(
            "INSERT INTO reference_pages (title, url, category, description) VALUES (%s, %s, %s, %s) RETURNING id, title, url, category, description, created_at::text",
            (data.title.strip(), data.url.strip(), data.category.strip() if data.category else "General", data.description)
        )
        conn.commit()
        return cur.fetchone()

@router.put("/reference-pages/{ref_id}")
def update_reference_page(ref_id: int, data: ReferencePageUpdate, dataset: Optional[str] = None):
    with rawdata_conn(dataset) as conn, conn.cursor() as cur:
        cur.execute("SELECT id FROM reference_pages WHERE id = %s", (ref_id,))
        if not cur.fetchone():
            raise _not_found("Reference Page", ref_id)
        
        updates = []
        params = []
        if data.title is not None:
            updates.append("title = %s"); params.append(data.title.strip())
        if data.url is not None:
            updates.append("url = %s"); params.append(data.url.strip())
        if data.category is not None:
            updates.append("category = %s"); params.append(data.category.strip())
        if data.description is not None:
            updates.append("description = %s"); params.append(data.description)
        
        if updates:
            params.append(ref_id)
            cur.execute(f"UPDATE reference_pages SET {', '.join(updates)} WHERE id = %s", params)
            conn.commit()
        
        cur.execute("SELECT id, title, url, category, description, created_at::text FROM reference_pages WHERE id = %s", (ref_id,))
        return cur.fetchone()

@router.delete("/reference-pages/{ref_id}")
def delete_reference_page(ref_id: int, dataset: Optional[str] = None):
    with rawdata_conn(dataset) as conn, conn.cursor() as cur:
        cur.execute("SELECT id FROM reference_pages WHERE id = %s", (ref_id,))
        if not cur.fetchone():
            raise _not_found("Reference Page", ref_id)
        cur.execute("DELETE FROM reference_pages WHERE id = %s", (ref_id,))
        conn.commit()
        return {"status": "deleted", "id": ref_id}


# ── Screener Ticker Mappings (YFinance ↔ Screener.in) ────────────────────────

def _ensure_screener_ticker_mappings_table():
    """Auto-create screener_ticker_mappings table if it doesn't exist."""
    with rawdata_conn() as conn, conn.cursor() as cur:
        cur.execute("""
            CREATE TABLE IF NOT EXISTS screener_ticker_mappings (
                id                  SERIAL PRIMARY KEY,
                yfinance_ticker     TEXT UNIQUE NOT NULL,
                screener_ticker     TEXT NOT NULL,
                screener_company_id INTEGER DEFAULT NULL,
                company_name        TEXT,
                notes               TEXT,
                last_updated        TEXT
            )
        """)
        # Add screener_company_id column if upgrading from old schema
        try:
            cur.execute("ALTER TABLE screener_ticker_mappings ADD COLUMN IF NOT EXISTS screener_company_id INTEGER DEFAULT NULL")
        except Exception:
            pass
        conn.commit()

try:
    _ensure_screener_ticker_mappings_table()
except Exception:
    pass  # Tolerate startup failures — table creation retried on first API call


@router.get("/screener-ticker-mappings")
def list_screener_ticker_mappings(search: Optional[str] = None) -> list[dict]:
    _ensure_screener_ticker_mappings_table()
    with rawdata_conn() as conn, conn.cursor() as cur:
        query = "SELECT * FROM screener_ticker_mappings"
        params = []
        if search:
            query += " WHERE yfinance_ticker ILIKE %s OR screener_ticker ILIKE %s OR company_name ILIKE %s OR notes ILIKE %s"
            term = f"%{search}%"
            params = [term, term, term, term]
        query += " ORDER BY id DESC"
        cur.execute(query, params)
        return cur.fetchall()


@router.post("/screener-ticker-mappings", status_code=201)
def create_screener_ticker_mapping(body: ScreenerTickerMappingIn) -> dict:
    _ensure_screener_ticker_mappings_table()
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    with rawdata_conn() as conn, conn.cursor() as cur:
        try:
            cur.execute(
                """
                INSERT INTO screener_ticker_mappings (yfinance_ticker, screener_ticker, screener_company_id, company_name, notes, last_updated)
                VALUES (%s, %s, %s, %s, %s, %s)
                RETURNING *
                """,
                (
                    body.yfinance_ticker.strip().upper(),
                    body.screener_ticker.strip().upper(),
                    body.screener_company_id,
                    body.company_name,
                    body.notes,
                    now,
                ),
            )
            row = cur.fetchone()
            conn.commit()
            return row
        except Exception as exc:
            conn.rollback()
            if "unique" in str(exc).lower():
                raise _conflict(f"A Screener mapping for yfinance ticker '{body.yfinance_ticker.upper()}' already exists.")
            raise HTTPException(500, str(exc))


@router.put("/screener-ticker-mappings/{mapping_id}")
def update_screener_ticker_mapping(mapping_id: int, body: ScreenerTickerMappingUpdate) -> dict:
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    updates, params = [], []
    if body.yfinance_ticker is not None:
        updates.append("yfinance_ticker = %s"); params.append(body.yfinance_ticker.strip().upper())
    if body.screener_ticker is not None:
        updates.append("screener_ticker = %s"); params.append(body.screener_ticker.strip().upper())
    if body.screener_company_id is not None:
        updates.append("screener_company_id = %s"); params.append(body.screener_company_id)
    if body.company_name is not None:
        updates.append("company_name = %s"); params.append(body.company_name)
    if body.notes is not None:
        updates.append("notes = %s"); params.append(body.notes)
    updates.append("last_updated = %s"); params.append(now)

    if len(updates) == 1:
        raise HTTPException(400, "No fields to update.")
    params.append(mapping_id)
    with rawdata_conn() as conn, conn.cursor() as cur:
        try:
            cur.execute(
                f"UPDATE screener_ticker_mappings SET {', '.join(updates)} WHERE id = %s RETURNING *",
                params,
            )
            row = cur.fetchone()
            if not row:
                raise _not_found("Screener Ticker Mapping", mapping_id)
            conn.commit()
            return row
        except HTTPException:
            raise
        except Exception as exc:
            conn.rollback()
            if "unique" in str(exc).lower():
                raise _conflict("A Screener mapping for this yfinance ticker already exists.")
            raise HTTPException(500, str(exc))


@router.delete("/screener-ticker-mappings/{mapping_id}", status_code=204)
def delete_screener_ticker_mapping(mapping_id: int) -> None:
    with rawdata_conn() as conn, conn.cursor() as cur:
        cur.execute("DELETE FROM screener_ticker_mappings WHERE id = %s RETURNING id", (mapping_id,))
        if not cur.fetchone():
            raise _not_found("Screener Ticker Mapping", mapping_id)
        conn.commit()


@router.get("/recommendations")
def list_master_recommendations() -> list[dict]:
    with rawdata_conn() as conn, conn.cursor() as cur:
        cur.execute("SELECT * FROM broker_recommendations ORDER BY id DESC LIMIT 500")
        return cur.fetchall()


# ── System Config CRUD ──────────────────────────────────────────────────────────

class SystemConfigUpdate(BaseModel):
    value: str

@router.get("/system-config")
def list_system_config(dataset: Optional[str] = None):
    with rawdata_conn(dataset) as conn, conn.cursor() as cur:
        cur.execute("SELECT key, value, updated_at::text FROM system_config ORDER BY key ASC")
        return cur.fetchall()

@router.put("/system-config/{key}")
def update_system_config(key: str, data: SystemConfigUpdate, dataset: Optional[str] = None):
    from engine.utils.helpers import clear_system_config_cache
    with rawdata_conn(dataset) as conn, conn.cursor() as cur:
        cur.execute("""
            INSERT INTO system_config (key, value, updated_at)
            VALUES (%s, %s, CURRENT_TIMESTAMP)
            ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = CURRENT_TIMESTAMP
            RETURNING key, value, updated_at::text
        """, (key, data.value))
        row = cur.fetchone()
        conn.commit()
        clear_system_config_cache()
        return row



# -- Derivative History --

@router.get("/derivative_history")
def get_derivative_history(dataset: Optional[str] = None):
    with rawdata_conn(dataset) as conn, conn.cursor(row_factory=dict_row) as cur:
        try:
            cur.execute("""
                SELECT id, symbol, action, lot_size, action_date, created_at
                FROM derivative_history
                ORDER BY action_date DESC, id DESC
            """)
            return cur.fetchall()
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))

@router.get("/derivative_history/{ticker}")
def get_derivative_history_by_ticker(ticker: str, dataset: Optional[str] = None):
    with rawdata_conn(dataset) as conn, conn.cursor(row_factory=dict_row) as cur:
        try:
            cur.execute("""
                SELECT id, symbol, action, lot_size, action_date, created_at
                FROM derivative_history
                WHERE symbol = %s
                ORDER BY action_date DESC, id DESC
            """, (ticker.upper(),))
            return cur.fetchall()
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))
