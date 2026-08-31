#!/usr/bin/env python3
"""
seed_master_from_watchlists.py

Reads all watchlist text files from /home/jmbx/apps/b_screener/watchlist/
and populates the master reference tables in rawdata_db:

  - sectors        : derived from watchlist file names (nifty_it → "Nifty IT", etc.)
  - ticker_master  : all unique tickers found across all files
  - ticker_sector  : links tickers to sectors based on which files they appear in
  - watchlist      : one entry per file
  - watchlist_items: tickers → watchlist membership

Ticker names are normalised to UPPER CASE with .NS suffix stripped for the PK,
but the exact raw value is stored as a note for review.

is_fno and index_memberships are inferred best-effort from the file names:
  - Tickers in any nifty_* file get that index name added to index_memberships
  - Tickers listed under known F&O indices (nifty_50, nifty_bank, etc.) are
    flagged is_fno = TRUE as a reasonable starting assumption.

Run from any directory:
    python3 /home/jmbx/apps/b_screener_ui/backend/scripts/seed_master_from_watchlists.py
"""

import os
import re
import psycopg2
from psycopg2.extras import execute_batch

# ─── Config ───────────────────────────────────────────────────────────────────
WATCHLIST_DIR = "/home/jmbx/apps/b_screener/watchlist"
DSN = "postgresql://jmbxdbuser:jmbxdbpassword@127.0.0.1:5432/rawdata_db"

# Files that are "user" watchlists (not sector-mapped). They go into watchlist
# table but do NOT create a sector.
USER_WATCHLISTS = {
    "watchlist_default.txt",
    "watchlist_FII",
    "watchlist_fav.txt",
    "watchlist_fundamental.txt",
    "watchlist_highvolatile.txt",
    "watchlist_manish.txt",
    "watchlist_manish_01.txt",
    "watchlist_manishbedwal.txt",
    "watchlist_mukeshbedval.txt",
    "watchlist_nisharg.txt",
    "watchlist_usha.txt",
}

# Files treated as SECTOR watchlists — these create both a sector AND a watchlist.
# Key = filename stem after "watchlist_", Value = human-readable sector name.
SECTOR_FILE_MAP = {
    "nbfc":                   "NBFC",
    "nifty_50":               "Nifty 50",
    "nifty_auto":             "Nifty Auto",
    "nifty_bank":             "Nifty Bank",
    "nifty_energy":           "Nifty Energy",
    "nifty_financial_services": "Nifty Financial Services",
    "nifty_fmcg":             "Nifty FMCG",
    "nifty_healthcare":       "Nifty Healthcare",
    "nifty_infra":            "Nifty Infra",
    "nifty_it":               "Nifty IT",
    "nifty_media":            "Nifty Media",
    "nifty_metal":            "Nifty Metal",
    "nifty_midcap_50":        "Nifty Midcap 50",
    "nifty_next_50":          "Nifty Next 50",
    "nifty_pharma":           "Nifty Pharma",
    "nifty_private_bank":     "Nifty Private Bank",
    "nifty_pse":              "Nifty PSE",
    "nifty_psu_bank":         "Nifty PSU Bank",
    "nifty_realty":           "Nifty Realty",
    "power_engg":             "Power & Engineering",
}

# Indices considered primary F&O-eligible baskets
FNO_INDEX_STEMS = {
    "nifty_50", "nifty_bank", "nifty_financial_services",
    "nifty_it", "nifty_pharma", "nifty_auto", "nifty_fmcg",
    "nifty_metal", "nifty_realty", "nifty_energy",
}


# ─── Helpers ──────────────────────────────────────────────────────────────────
def normalise_ticker(raw: str) -> str:
    """Upper-case, strip .NS / .BO / .bo suffix, strip whitespace."""
    t = raw.strip().upper()
    for suffix in (".NS", ".BO"):
        if t.endswith(suffix):
            t = t[: -len(suffix)]
    return t


def read_tickers(filepath: str) -> list[str]:
    with open(filepath, encoding="utf-8") as fh:
        lines = [ln.strip() for ln in fh if ln.strip()]
    return [normalise_ticker(ln) for ln in lines if ln.strip()]


def file_stem(filename: str) -> str:
    """watchlist_nifty_50.txt  →  nifty_50"""
    stem = filename
    stem = re.sub(r"^watchlist_", "", stem)
    stem = re.sub(r"\.txt$", "", stem, flags=re.IGNORECASE)
    return stem


# ─── Main ─────────────────────────────────────────────────────────────────────
def main() -> None:
    conn = psycopg2.connect(DSN)
    conn.autocommit = False
    cur = conn.cursor()

    files = sorted(os.listdir(WATCHLIST_DIR))

    # ── 1. Build in-memory structures ─────────────────────────────────────────
    # sector_stem → { name, tickers[] }
    sectors: dict[str, dict] = {}
    # watchlist_name → tickers[]
    watchlists: dict[str, list[str]] = {}
    # ticker → { is_fno, index_memberships }
    all_tickers: dict[str, dict] = {}

    for fname in files:
        fpath = os.path.join(WATCHLIST_DIR, fname)
        if not os.path.isfile(fpath):
            continue
        stem = file_stem(fname)
        tickers = read_tickers(fpath)
        if not tickers:
            continue

        # Determine watchlist display name
        wl_name = stem.replace("_", " ").title()
        watchlists[wl_name] = tickers

        # Determine if this is a sector file
        if stem in SECTOR_FILE_MAP:
            sector_name = SECTOR_FILE_MAP[stem]
            sectors[stem] = {"name": sector_name, "tickers": tickers}
            is_fno = stem in FNO_INDEX_STEMS
            for t in tickers:
                if t not in all_tickers:
                    all_tickers[t] = {"is_fno": False, "index_memberships": set()}
                if is_fno:
                    all_tickers[t]["is_fno"] = True
                # Add index membership label
                all_tickers[t]["index_memberships"].add(sector_name)
        else:
            # User watchlist — just register tickers without sector
            for t in tickers:
                if t not in all_tickers:
                    all_tickers[t] = {"is_fno": False, "index_memberships": set()}

    # ── 2. Upsert sectors ──────────────────────────────────────────────────────
    print(f"Upserting {len(sectors)} sectors…")
    sector_id_map: dict[str, int] = {}  # sector_name → id
    for stem, info in sectors.items():
        cur.execute(
            """
            INSERT INTO sectors (name, description)
            VALUES (%s, %s)
            ON CONFLICT (name) DO UPDATE SET description = EXCLUDED.description
            RETURNING id
            """,
            (info["name"], f"Auto-seeded from {stem} watchlist"),
        )
        sector_id_map[info["name"]] = cur.fetchone()[0]
        print(f"  ✓ sector: {info['name']} (id={sector_id_map[info['name']]})")

    # ── 3. Upsert ticker_master ────────────────────────────────────────────────
    print(f"\nUpserting {len(all_tickers)} tickers into ticker_master…")
    for ticker, meta in all_tickers.items():
        if not ticker:
            continue
        memberships = sorted(meta["index_memberships"])
        cur.execute(
            """
            INSERT INTO ticker_master (ticker, company_name, is_fno, index_memberships, exchange)
            VALUES (%s, %s, %s, %s, %s)
            ON CONFLICT (ticker) DO UPDATE SET
                is_fno            = GREATEST(ticker_master.is_fno, EXCLUDED.is_fno),
                index_memberships = (
                    SELECT ARRAY(
                        SELECT DISTINCT unnest(
                            ticker_master.index_memberships || EXCLUDED.index_memberships
                        ) ORDER BY 1
                    )
                ),
                updated_at = now()
            """,
            (
                ticker,
                ticker,           # company_name starts same as ticker; user can update
                meta["is_fno"],
                memberships,
                "NSE",
            ),
        )
    print(f"  ✓ {len(all_tickers)} tickers upserted")

    # ── 4. Upsert ticker_sector ────────────────────────────────────────────────
    print("\nUpserting ticker_sector mappings…")
    ts_rows = []
    for stem, info in sectors.items():
        sid = sector_id_map[info["name"]]
        for t in info["tickers"]:
            if t:
                ts_rows.append((t, sid))
    execute_batch(
        cur,
        "INSERT INTO ticker_sector (ticker, sector_id) VALUES (%s, %s) ON CONFLICT DO NOTHING",
        ts_rows,
    )
    print(f"  ✓ {len(ts_rows)} ticker↔sector links upserted")

    # ── 5. Upsert watchlists ───────────────────────────────────────────────────
    print(f"\nUpserting {len(watchlists)} watchlists…")
    wl_id_map: dict[str, int] = {}
    for wl_name in watchlists:
        cur.execute(
            """
            INSERT INTO watchlist (name, description)
            VALUES (%s, %s)
            ON CONFLICT (name) DO UPDATE SET description = EXCLUDED.description
            RETURNING id
            """,
            (wl_name, f"Auto-seeded from watchlist file"),
        )
        wl_id_map[wl_name] = cur.fetchone()[0]
        print(f"  ✓ watchlist: {wl_name} (id={wl_id_map[wl_name]}, {len(watchlists[wl_name])} tickers)")

    # ── 6. Upsert watchlist_items ──────────────────────────────────────────────
    print("\nUpserting watchlist_items…")
    wi_rows = []
    for wl_name, tickers in watchlists.items():
        wl_id = wl_id_map[wl_name]
        for t in tickers:
            if t and t in all_tickers:
                wi_rows.append((wl_id, t))
    execute_batch(
        cur,
        "INSERT INTO watchlist_items (watchlist_id, ticker) VALUES (%s, %s) ON CONFLICT DO NOTHING",
        wi_rows,
    )
    print(f"  ✓ {len(wi_rows)} watchlist_items upserted")

    conn.commit()
    cur.close()
    conn.close()

    print()
    print("=" * 60)
    print("SEED COMPLETE — review summary:")
    print(f"  Sectors       : {len(sectors)}")
    print(f"  Tickers       : {len(all_tickers)}")
    print(f"  Sector links  : {len(ts_rows)}")
    print(f"  Watchlists    : {len(watchlists)}")
    print(f"  Watchlist items: {len(wi_rows)}")
    print()
    print("NOTE: company_name is currently set to the ticker symbol.")
    print("      Update ticker_master.company_name via the UI or a follow-up script.")
    print("      is_fno and index_memberships are inferred — review and correct via UI.")


if __name__ == "__main__":
    main()
