from contextlib import contextmanager
from psycopg import connect
from psycopg.rows import dict_row
from app.config import settings

@contextmanager
def get_connection(dsn: str = None):
    if dsn is None:
        dsn = settings.bsa_postgres_dsn
    with connect(dsn, row_factory=dict_row, connect_timeout=3) as connection:
        yield connection
