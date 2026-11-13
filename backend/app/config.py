from typing import Optional
from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict

ROOT_DIR = Path(__file__).resolve().parent.parent.parent
ROOT_ENV = ROOT_DIR / ".env"


class Settings(BaseSettings):
    # ── SQLite (primary) ──────────────────────────────────────────────────────
    sqlite_path: str = str(ROOT_DIR / "data" / "bsa_db.sqlite3")

    # ── PostgreSQL (kept for backward-compat with existing .env files, unused) ─
    postgres_host: str = "127.0.0.1"
    postgres_port: int = 5432
    postgres_user: str = "jmbxdbuser"
    postgres_password: str = ""
    postgres_db: Optional[str] = None
    postgres_db_rawdata: str = "bsa_db"
    postgres_db_bsa: str = "bsa_db"
    postgres_dsn: Optional[str] = None
    database_url: Optional[str] = None
    rawdata_postgres_dsn: Optional[str] = None
    bsa_postgres_dsn: Optional[str] = None
    database_schema: str = "public"

    model_config = SettingsConfigDict(
        env_file=str(ROOT_ENV),
        extra="ignore",
        env_file_encoding="utf-8"
    )


settings = Settings()
