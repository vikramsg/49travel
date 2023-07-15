from pathlib import Path
import sqlite3
from typing import Any
from click import testing as click_testing
import pytest

from src.destinations import run_city_journeys


def test_run_city_stops(city_table_connection: sqlite3.Connection):
    # Given
    test_runner = click_testing.CliRunner()

    # When
    result = test_runner.invoke(
        run_city_journeys,
        ["--run-type", "stops", "--city", "London"],
        obj={"conn": city_table_connection},
        catch_exceptions=False,
    )
    # Use print(result.output) to see output of invoked functions

    # Then
    cursor = city_table_connection.cursor()
    cursor.execute("SELECT city, stop_id FROM city_stops ORDER BY city")
    city_stops = cursor.fetchall()

    assert result.exit_code == 0
    assert city_stops == [
        ("Berlin", 8011160),
        ("Cologne", 8096022),
        ("Hamburg", 8096009),
        ("Munich", 8000261),
    ]


@pytest.fixture
def city_table_connection() -> Any:
    db_path = Path(".").resolve() / "test" / "data" / "cities.sqlite"
    conn = sqlite3.connect(db_path)

    cursor = conn.cursor()
    cursor.execute("DROP TABLE IF EXISTS cities")
    cursor.execute("""CREATE TABLE cities(city TEXT)""")
    cursor.execute(
        """INSERT INTO cities
            ('city')
            VALUES ('Hamburg'), ('Berlin'), ('Munich'), ('Cologne')"""
    )
    cursor.execute("DROP TABLE IF EXISTS city_stops")
    cursor.close()

    yield conn

    conn.close()
