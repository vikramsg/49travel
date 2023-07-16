import sqlite3
from pathlib import Path
from typing import Any

import pytest
from click import testing as click_testing

from src.destinations import run_city_journeys


def test_run_city_stops(cities_table_connection: sqlite3.Connection) -> None:
    # Given
    test_runner = click_testing.CliRunner()

    # When
    result = test_runner.invoke(
        run_city_journeys,
        ["--run-type", "stops"],
        obj={"conn": cities_table_connection},
        catch_exceptions=False,
    )
    # Use print(result.output) to see output of invoked functions

    # Then
    cursor = cities_table_connection.cursor()
    cursor.execute("SELECT city, stop_id FROM city_stops ORDER BY city")
    city_stops = cursor.fetchall()

    assert result.exit_code == 0
    assert city_stops == [
        ("Bad Doberan", 8010016),
        ("Bad Kissingen", 8000714),
        ("Berlin", 8011160),
        ("Cologne", 8096022),
        ("Dernau", 8001417),
        ("Erding", 8001825),
        ("Hamburg", 8096009),
        ("Munich", 8000261),
        ("Nuremberg", 8096025),
        ("Pfullendorf", 8070630),
        ("Schwabenheim", 530068),
        ("Zeitz", 8010390),
    ]


def test_run_city_journeys(city_stops_table_connection: sqlite3.Connection) -> None:
    # Given
    test_runner = click_testing.CliRunner()

    # When
    result = test_runner.invoke(
        run_city_journeys,
        ["--run-type", "journeys_from_origin", "--city", "Hamburg"],
        obj={"conn": city_stops_table_connection},
        catch_exceptions=False,
    )

    # Then
    assert result.exit_code == 0

    cursor = city_stops_table_connection.cursor()
    cursor.execute("SELECT city, journey_time, stops FROM Hamburg_journeys")
    city_journeys = cursor.fetchall()

    assert city_journeys == [
        ("Bad Doberan", 11280, 2),
        ("Bad Kissingen", 27660, 4),
        ("Berlin", 14520, 3),
        ("Cologne", 22440, 3),
        ("Dernau", 31140, 6),
        ("Munich", 43260, 6),
        ("Nuremberg", 33720, 4),
        ("Zeitz", 22920, 4),
    ]


@pytest.fixture
def cities_table_connection() -> Any:
    db_path = Path(".").resolve() / "test" / "data" / "cities.sqlite"
    conn = sqlite3.connect(db_path)

    cursor = conn.cursor()
    cursor.execute("DROP TABLE IF EXISTS cities")
    cursor.execute("""CREATE TABLE cities(city TEXT)""")
    cursor.execute(
        """INSERT INTO cities
            ('city')
            VALUES
            ('Hamburg'), ('Berlin'), ('Munich'), ('Cologne'),
            ('Nuremberg'), ('Bad Kissingen'), ('Schwabenheim'), ('Dernau'),
            ('Erding'), ('Pfullendorf'), ('Bad Doberan'), ('Zeitz')
            """
    )
    cursor.execute("DROP TABLE IF EXISTS city_stops")
    cursor.close()

    yield conn

    cursor = conn.cursor()
    cursor.execute("DROP TABLE IF EXISTS city_stops")
    cursor.close()

    conn.close()


@pytest.fixture
def city_stops_table_connection() -> Any:
    db_path = Path(".").resolve() / "test" / "data" / "cities.sqlite"
    conn = sqlite3.connect(db_path)

    cursor = conn.cursor()
    cursor.execute("DROP TABLE IF EXISTS city_stops")
    cursor.execute("""CREATE TABLE city_stops (city TEXT, stop_id INTEGER)""")
    cursor.execute(
        """INSERT INTO city_stops
            ('city', 'stop_id')
            VALUES
            ('Bad Doberan', 8010016),
            ('Bad Kissingen', 8000714),
            ('Berlin', 8011160),
            ('Cologne', 8096022),
            ('Dernau', 8001417),
            ('Erding', 8001825),
            ('Hamburg', 8096009),
            ('Munich', 8000261),
            ('Nuremberg', 8096025),
            ('Pfullendorf', 8070630),
            ('Schwabenheim', 530068),
            ('Zeitz', 8010390)
            """
    )
    cursor.execute("DROP TABLE IF EXISTS Hamburg_journeys")
    cursor.close()

    yield conn

    cursor = conn.cursor()
    cursor.execute("DROP TABLE IF EXISTS Hamburg_journeys")
    cursor.close()

    conn.close()
