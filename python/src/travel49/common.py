import sqlite3
from pathlib import Path


def city_table_connection() -> sqlite3.Connection:
    """Open the committed seed database the €49 origin pages are generated from.

    The path is resolved against the working directory rather than this file, so
    callers must run from `python/`. `make -C python/` is what guarantees it.
    """
    db_path = Path(".").resolve() / "data" / "travel49" / "cities.sqlite"
    return sqlite3.connect(db_path)
