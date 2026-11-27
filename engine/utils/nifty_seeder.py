#!/usr/bin/env python3
"""
Nifty 500 & F&O Derivative Master Seeder Utility.
Responsible for:
1. Fetching the official Nifty 500 stock list from NSE (https://nsearchives.nseindia.com/content/indices/ind_nifty500list.csv).
2. Fetching and extracting the 218 stock derivatives from "Derivatives on Individual Securities"
   via official NSE fo_mktlots.csv (https://nsearchives.nseindia.com/content/fo/fo_mktlots.csv).
3. Generating and synchronizing master tickers datasets (tickers_production.csv, tickers_sample.csv, tickers.csv).
4. Synchronizing F&O stock files (fno_stock_production.csv, fno_stock_sample.csv, fno_tickers.csv).
5. Aligning opportunities_risk, sectors, and related master files.
6. Pruning legacy records and setting is_fno accurately in SQLite database.
"""

import os
import csv
import json
import logging
import sqlite3
import urllib.request
from datetime import datetime
from pathlib import Path

logger = logging.getLogger("nifty_seeder")

NSE_NIFTY500_URL = "https://nsearchives.nseindia.com/content/indices/ind_nifty500list.csv"
NSE_FO_MKTLOTS_URL = "https://nsearchives.nseindia.com/content/fo/fo_mktlots.csv"
DEFAULT_USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"

# Core benchmark and sectoral index symbols to always preserve
PRESERVED_INDICES = {
    "NIFTY", "BANKNIFTY", "FINNIFTY", "MIDCPNIFTY", "NIFTYNXT50", 
    "BANKEX", "SENSEX", "NIFTY50", "NIFTY 50", "BANK NIFTY"
}

def pull_nifty500_csv(data_dir: str = "data", verbose: bool = True) -> str:
    """
    Downloads the official ind_nifty500list.csv from NSE Archives.
    If the network request fails (e.g. offline, sandboxed, timeout),
    falls back safely to the local cached file.
    """
    os.makedirs(data_dir, exist_ok=True)
    target_path = os.path.join(data_dir, "ind_nifty500list.csv")

    try:
        if verbose:
            print(f"[+] Attempting to pull latest Nifty 500 list from NSE: {NSE_NIFTY500_URL}")
        req = urllib.request.Request(
            NSE_NIFTY500_URL,
            headers={
                "User-Agent": DEFAULT_USER_AGENT,
                "Accept": "text/csv,text/plain,*/*"
            }
        )
        with urllib.request.urlopen(req, timeout=12) as response:
            content = response.read().decode("utf-8-sig", errors="replace")
            if "Symbol" in content and "Company Name" in content:
                with open(target_path, "w", encoding="utf-8") as f:
                    f.write(content)
                if verbose:
                    print(f"  [OK] Successfully fetched and updated '{target_path}' from NSE.")
                return target_path
            else:
                if verbose:
                    print(f"  [!] Received unexpected content format from NSE URL. Falling back to cached file.")
    except Exception as e:
        if verbose:
            print(f"  [!] Network pull from NSE failed ({e}). Falling back to cached file if present.")

    if os.path.exists(target_path):
        if verbose:
            print(f"  [OK] Using local cached Nifty 500 list from '{target_path}'.")
        return target_path

    raise FileNotFoundError(f"Could not download or find local Nifty 500 CSV at '{target_path}'")


def pull_and_sync_fno_derivatives(data_dir: str = "data", verbose: bool = True) -> set:
    """
    Downloads official NSE fo_mktlots.csv, extracts the exact 218 stock derivatives
    under 'Derivatives on Individual Securities', and synchronizes fno_stock_production.csv.
    """
    os.makedirs(data_dir, exist_ok=True)
    mktlots_path = os.path.join(data_dir, "fo_mktlots.csv")

    try:
        if verbose:
            print(f"[+] Attempting to pull latest F&O market lots list from NSE: {NSE_FO_MKTLOTS_URL}")
        req = urllib.request.Request(
            NSE_FO_MKTLOTS_URL,
            headers={
                "User-Agent": DEFAULT_USER_AGENT,
                "Accept": "text/csv,text/plain,*/*"
            }
        )
        with urllib.request.urlopen(req, timeout=12) as response:
            content = response.read().decode("utf-8-sig", errors="replace")
            if "Derivatives on Individual Securities" in content:
                with open(mktlots_path, "w", encoding="utf-8") as f:
                    f.write(content)
                if verbose:
                    print(f"  [OK] Successfully fetched and updated '{mktlots_path}' from NSE.")
    except Exception as e:
        if verbose:
            print(f"  [!] Network pull for F&O failed ({e}). Using local cached '{mktlots_path}'.")

    if not os.path.exists(mktlots_path):
        return set()

    with open(mktlots_path, mode="r", encoding="utf-8-sig") as f:
        lines = [l.strip() for l in f if l.strip()]

    in_sec = False
    fno_218 = []
    for l in lines:
        parts = [p.strip() for p in l.split(',')]
        if len(parts) >= 2:
            if "Derivatives on Individual Securities" in parts[0]:
                in_sec = True
                continue
            if in_sec:
                underlying = parts[0].strip()
                symbol = parts[1].strip().upper()
                if symbol and symbol != "SYMBOL":
                    fno_218.append((symbol, underlying))

    if verbose:
        print(f"  [OK] Extracted {len(fno_218)} stock derivatives from 'Derivatives on Individual Securities'.")

    now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    today_str = datetime.now().strftime("%Y-%m-%d")

    fno_stock_rows = []
    for i, (sym, name) in enumerate(fno_218, 1):
        fno_stock_rows.append({
            "id": i,
            "symbol": sym,
            "underlying_name": name,
            "instrument_type": "STOCK",
            "is_active": "True",
            "entry_date": today_str,
            "created_at": now_str
        })

    fields = ["id", "symbol", "underlying_name", "instrument_type", "is_active", "entry_date", "created_at"]
    for fn in ("fno_stock_production.csv", "fno_stock_sample.csv"):
        with open(os.path.join(data_dir, fn), "w", encoding="utf-8", newline="") as f:
            w = csv.DictWriter(f, fieldnames=fields)
            w.writeheader()
            w.writerows(fno_stock_rows)

    ticker_fields = ["symbol", "underlying_name", "instrument_type", "is_active", "entry_date", "created_at"]
    for fn in ("fno_tickers.csv", "fno_tickers_production.csv"):
        with open(os.path.join(data_dir, fn), "w", encoding="utf-8", newline="") as f:
            w = csv.DictWriter(f, fieldnames=ticker_fields)
            w.writeheader()
            w.writerows([{k: v for k, v in r.items() if k != "id"} for r in fno_stock_rows])

    return {sym for sym, _ in fno_218}


def load_fno_stock_symbols(data_dir: str = "data") -> set:
    """Reads F&O stock symbols from fno_stock_production.csv or fno_stock_sample.csv."""
    fno_symbols = set()
    for fname in ("fno_stock_production.csv", "fno_stock_sample.csv", "fno_tickers.csv"):
        fpath = os.path.join(data_dir, fname)
        if os.path.exists(fpath):
            try:
                with open(fpath, mode="r", encoding="utf-8-sig") as f:
                    reader = csv.DictReader(f)
                    for row in reader:
                        sym = (row.get("symbol") or row.get("Symbol") or "").strip().upper()
                        if sym:
                            fno_symbols.add(sym)
                if fno_symbols:
                    break
            except Exception:
                pass
    return fno_symbols


def sync_nifty500_master_files(data_dir: str = "data", verbose: bool = True) -> bool:
    """
    Pulls Nifty 500 list and updates:
    - data/tickers_production.csv
    - data/tickers_sample.csv
    - data/tickers.csv
    - data/opportunities_risk_production.csv
    - data/opportunities_risk_sample.csv
    - data/sectors_production.csv & data/sectors_sample.csv
    """
    try:
        csv_path = pull_nifty500_csv(data_dir=data_dir, verbose=verbose)
    except Exception as e:
        logger.error(f"Cannot sync Nifty 500 master files: {e}")
        return False

    # Pull & sync official 218 F&O stock derivatives list
    try:
        fno_symbols = pull_and_sync_fno_derivatives(data_dir=data_dir, verbose=verbose)
    except Exception as e:
        logger.warning(f"Error syncing F&O derivatives: {e}")
        fno_symbols = load_fno_stock_symbols(data_dir=data_dir)

    nifty500_tickers = []
    nifty500_symbols_set = set()
    nifty500_sectors = set()
    now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    with open(csv_path, mode="r", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        for row in reader:
            sym = (row.get("Symbol") or "").strip().upper()
            cname = (row.get("Company Name") or "").strip()
            industry = (row.get("Industry") or "Diversified").strip()
            if not sym:
                continue

            is_fno = sym in fno_symbols
            nifty500_symbols_set.add(sym)
            if industry:
                nifty500_sectors.add(industry)

            nifty500_tickers.append({
                "ticker": sym,
                "company_name": cname,
                "is_fno": "True" if is_fno else "False",
                "sector": industry,
                "index_memberships": json.dumps(["NSE", "NIFTY500"]),
                "exchange": "NSE",
                "updated_at": now_str
            })

    if not nifty500_tickers:
        logger.error("No valid tickers parsed from Nifty 500 CSV!")
        return False

    fno_in_n500 = sum(1 for t in nifty500_tickers if t['is_fno'] == 'True')
    if verbose:
        print(f"[+] Parsed {len(nifty500_tickers)} Nifty 500 stocks ({fno_in_n500} are in 218 F&O stock derivatives).")

    # 1. Write tickers CSV files
    ticker_fieldnames = ["ticker", "company_name", "is_fno", "sector", "index_memberships", "exchange", "updated_at"]
    for fname in ("tickers_production.csv", "tickers_sample.csv", "tickers.csv"):
        fpath = os.path.join(data_dir, fname)
        with open(fpath, mode="w", encoding="utf-8", newline="") as f:
            writer = csv.DictWriter(f, fieldnames=ticker_fieldnames)
            writer.writeheader()
            writer.writerows(nifty500_tickers)
        if verbose:
            print(f"  [OK] Saved {len(nifty500_tickers)} Nifty 500 records to '{fpath}'.")

    # 2. Sync opportunities & risk master files (keep only Nifty 500 stocks)
    for opp_fname in ("opportunities_risk_production.csv", "opportunities_risk_sample.csv"):
        opp_path = os.path.join(data_dir, opp_fname)
        existing_profiles = {}
        opp_fields = ["ticker", "about_company", "opportunities", "risk", "is_multibagger", "additional_note", "created_at", "updated_at", "product_services", "sectors"]

        if os.path.exists(opp_path):
            try:
                with open(opp_path, mode="r", encoding="utf-8-sig") as f:
                    reader = csv.DictReader(f)
                    opp_fields = reader.fieldnames or opp_fields
                    for r in reader:
                        tk = (r.get("ticker") or "").strip().upper()
                        if tk in nifty500_symbols_set:
                            existing_profiles[tk] = r
            except Exception as e:
                logger.warning(f"Error reading existing {opp_fname}: {e}")

        # Add missing Nifty 500 tickers with reasonable defaults
        synced_opp_rows = []
        for t in nifty500_tickers:
            tk = t["ticker"]
            if tk in existing_profiles:
                synced_opp_rows.append(existing_profiles[tk])
            else:
                cname = t["company_name"]
                sec = t["sector"]
                synced_opp_rows.append({
                    "ticker": tk,
                    "about_company": f"{cname} is a leading enterprise in the {sec} sector and part of the NIFTY 500 index.",
                    "opportunities": f"Expansion in {sec} demand, market leadership, and continuous operational efficiency.",
                    "risk": f"Sector regulatory shifts, competitive landscape, and macroeconomic fluctuations.",
                    "is_multibagger": "False",
                    "additional_note": "",
                    "created_at": now_str,
                    "updated_at": now_str,
                    "product_services": f"Core operations and services in {sec}.",
                    "sectors": sec
                })

        with open(opp_path, mode="w", encoding="utf-8", newline="") as f:
            writer = csv.DictWriter(f, fieldnames=opp_fields)
            writer.writeheader()
            writer.writerows(synced_opp_rows)

        if verbose:
            print(f"  [OK] Synchronized '{opp_path}' to exactly {len(synced_opp_rows)} Nifty 500 stocks.")

    # 3. Ensure sectors CSV has all sectors from Nifty 500
    for sec_fname in ("sectors_production.csv", "sectors_sample.csv"):
        sec_path = os.path.join(data_dir, sec_fname)
        sec_fields = ["id", "name", "description", "created_at"]
        existing_sectors = {}
        max_id = 0

        if os.path.exists(sec_path):
            try:
                with open(sec_path, mode="r", encoding="utf-8-sig") as f:
                    reader = csv.DictReader(f)
                    sec_fields = reader.fieldnames or sec_fields
                    for r in reader:
                        sname = (r.get("name") or "").strip()
                        if sname:
                            existing_sectors[sname.lower()] = r
                            try:
                                sid = int(r.get("id", 0))
                                if sid > max_id:
                                    max_id = sid
                            except ValueError:
                                pass
            except Exception:
                pass

        updated_sectors = list(existing_sectors.values())
        added_sec_count = 0
        for sname in sorted(nifty500_sectors):
            if sname.lower() not in existing_sectors:
                max_id += 1
                updated_sectors.append({
                    "id": str(max_id),
                    "name": sname,
                    "description": f"NSE Nifty 500 {sname} sector",
                    "created_at": now_str
                })
                added_sec_count += 1

        with open(sec_path, mode="w", encoding="utf-8", newline="") as f:
            writer = csv.DictWriter(f, fieldnames=sec_fields)
            writer.writeheader()
            writer.writerows(updated_sectors)

        if verbose and added_sec_count > 0:
            print(f"  [OK] Added {added_sec_count} new sectors to '{sec_path}'. Total sectors: {len(updated_sectors)}.")

    return True


def prune_database_non_nifty500(db_path: str, verbose: bool = True) -> int:
    """
    Deletes any legacy master records in the SQLite database that are not part
    of the Nifty 500 universe (or preserved index benchmarks).
    Also updates fno_stock_master and sets is_fno in ticker_master.
    """
    if not os.path.exists(db_path):
        return 0

    conn = sqlite3.connect(db_path)
    cur = conn.cursor()

    try:
        # Load active Nifty 500 tickers from data/tickers_production.csv
        data_dir = os.path.dirname(db_path)
        t_prod = os.path.join(data_dir, "tickers_production.csv")
        allowed_tickers = set()

        if os.path.exists(t_prod):
            with open(t_prod, mode="r", encoding="utf-8-sig") as f:
                reader = csv.DictReader(f)
                for r in reader:
                    sym = (r.get("ticker") or "").strip().upper()
                    if sym:
                        allowed_tickers.add(sym)

        # Check existing ticker_master
        cur.execute("SELECT ticker FROM ticker_master")
        current_in_db = {r[0].upper().strip() for r in cur.fetchall() if r[0]}
        to_delete = [t for t in current_in_db if t not in allowed_tickers]

        if to_delete:
            if verbose:
                print(f"[+] Pruning {len(to_delete)} legacy non-Nifty-500 stocks from database '{db_path}'...")
            chunk_size = 500
            for i in range(0, len(to_delete), chunk_size):
                chunk = to_delete[i:i + chunk_size]
                placeholders = ", ".join(["?"] * len(chunk))
                try:
                    cur.execute(f"DELETE FROM opportunities_risk WHERE ticker IN ({placeholders})", chunk)
                except Exception:
                    pass
                try:
                    cur.execute(f"DELETE FROM ticker_sector WHERE ticker IN ({placeholders})", chunk)
                except Exception:
                    pass
                cur.execute(f"DELETE FROM ticker_master WHERE ticker IN ({placeholders})", chunk)
            conn.commit()

        # Update fno_stock_master table from fno_stock_production.csv
        fno_prod = os.path.join(data_dir, "fno_stock_production.csv")
        if os.path.exists(fno_prod):
            with open(fno_prod, mode="r", encoding="utf-8-sig") as f:
                fno_rows = list(csv.DictReader(f))
            cur.execute("DELETE FROM fno_stock_master;")
            for r in fno_rows:
                sym = (r.get("symbol") or "").strip().upper()
                uname = (r.get("underlying_name") or sym).strip()
                itype = (r.get("instrument_type") or "STOCK").strip().upper()
                cur.execute("""
                    INSERT INTO fno_stock_master (symbol, underlying_name, instrument_type, is_active)
                    VALUES (?, ?, ?, 1)
                """, (sym, uname, itype))
            conn.commit()

            # Synchronize is_fno flag in ticker_master
            cur.execute("UPDATE ticker_master SET is_fno = 0;")
            cur.execute("""
                UPDATE ticker_master
                SET is_fno = 1
                WHERE ticker IN (SELECT symbol FROM fno_stock_master WHERE is_active = 1);
            """)
            conn.commit()

        cur.execute("SELECT COUNT(*) FROM ticker_master")
        remaining = cur.fetchone()[0]
        cur.execute("SELECT COUNT(*) FROM fno_stock_master")
        fno_count = cur.fetchone()[0]
        cur.execute("SELECT COUNT(*) FROM ticker_master WHERE is_fno = 1")
        tm_fno_count = cur.fetchone()[0]

        if verbose:
            print(f"[OK] Master tables aligned: ticker_master={remaining}, fno_stock_master={fno_count}, is_fno active={tm_fno_count}.")

        conn.close()
        return len(to_delete)

    except Exception as e:
        logger.error(f"Error during database alignment: {e}")
        conn.rollback()
        conn.close()
        return 0


if __name__ == "__main__":
    import sys
    ROOT_DIR = Path(__file__).resolve().parent.parent.parent
    if str(ROOT_DIR) not in sys.path:
        sys.path.insert(0, str(ROOT_DIR))
    print("==================================================")
    print("NIFTY 500 & 218 F&O DERIVATIVES MASTER SYNC")
    print("==================================================")
    success = sync_nifty500_master_files(verbose=True)
    if success:
        from engine.database.seeder import get_sqlite_path
        db_path = get_sqlite_path()
        prune_database_non_nifty500(db_path=db_path, verbose=True)
    sys.exit(0 if success else 1)
