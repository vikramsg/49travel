import sqlite3
from pathlib import Path
from typing import Optional

import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry


def city_table_connection(table_name: Optional[str] = None) -> sqlite3.Connection:
    db_path = Path(".").resolve() / "data" / "cities.sqlite"
    conn = sqlite3.connect(db_path)

    # FIXME: Connection should not be responsible for this
    # We should wrap our orchestrators in test so that we can
    # change these with confidence
    if table_name:
        conn.execute(f"DROP TABLE IF EXISTS {table_name}")

    return conn


def session_with_retry() -> requests.Session:
    session = requests.Session()

    retries = 3
    backoff_factor = 0.3

    retry = Retry(
        total=retries,
        read=retries,
        connect=retries,
        backoff_factor=backoff_factor,
    )

    adapter = HTTPAdapter(max_retries=retry)
    session.mount("http://", adapter)
    session.mount("https://", adapter)

    return session
