from typing import Optional
from pathlib import Path
from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

ROOT_DIR = Path(__file__).resolve().parent.parent.parent
ROOT_ENV = ROOT_DIR / ".env"


class Settings(BaseSettings):
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

    @model_validator(mode="after")
    def build_dsns(self) -> "Settings":
        default_dsn = self.postgres_dsn or self.database_url
        pw = f":{self.postgres_password}" if self.postgres_password else ""
        if self.postgres_db:
            self.postgres_db_rawdata = self.postgres_db
            self.postgres_db_bsa = self.postgres_db

        if not self.rawdata_postgres_dsn or ("127.0.0.1" in self.rawdata_postgres_dsn and self.postgres_host != "127.0.0.1"):
            if default_dsn:
                self.rawdata_postgres_dsn = default_dsn
            else:
                self.rawdata_postgres_dsn = f"postgresql://{self.postgres_user}{pw}@{self.postgres_host}:{self.postgres_port}/{self.postgres_db_rawdata}"
        if not self.bsa_postgres_dsn or ("127.0.0.1" in self.bsa_postgres_dsn and self.postgres_host != "127.0.0.1"):
            if default_dsn:
                self.bsa_postgres_dsn = default_dsn
            else:
                self.bsa_postgres_dsn = f"postgresql://{self.postgres_user}{pw}@{self.postgres_host}:{self.postgres_port}/{self.postgres_db_bsa}"
        return self


settings = Settings()


