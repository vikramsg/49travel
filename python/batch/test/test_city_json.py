import json
import sqlite3
from pathlib import Path
from sqlite3 import Connection
from typing import Any
from click import testing as click_testing

import pytest

from src.city_json import destinations_json, get_city_json


def test_destinations_json(city_table_connection: Connection) -> None:
    # Given
    conn = city_table_connection
    output_file = Path(".").resolve() / "test" / "data" / "destinations.json"

    # When
    destinations_json(conn, "destinations", str(output_file))

    # Then
    with open(output_file, "r") as file_read:
        data = json.load(file_read)
        assert data == {
            "cities": [
                {
                    "city": "Hamburg",
                    "url": "https://www.example.com",
                    "journey_time": 1100,
                    "stops": 5,
                    "origin_stop": 8009009,
                    "destination_stop": 803456,
                    "description": "A journey on the train",
                }
            ]
        }


def test_happy_path_city_exists(
    city_table_connection_for_joining_and_json: Connection,
) -> None:
    # Given
    city = "Hamburg"
    output_file_path = Path(".").resolve() / "test" / "data"
    output_file = output_file_path / f"{city.lower()}.json"
    runner = click_testing.CliRunner()

    # When
    result = runner.invoke(
        get_city_json,
        ["--city", city],
        obj={
            "conn": city_table_connection_for_joining_and_json,
            "output_file_path": output_file_path,
        },
    )

    # Then
    assert result.exit_code == 0

    with open(output_file, "r") as file_read:
        data = json.load(file_read)
        assert len(data["cities"]) == 2

        assert data["cities"][0]["city"] == "Cologne"
        assert data["cities"][0]["url"] == "Cologne_url"
        assert data["cities"][0]["journey_time"] == 100
        assert data["cities"][0]["stops"] == 1
        assert data["cities"][0]["origin_stop"] == 8009009
        assert data["cities"][0]["destination_stop"] == 803456
        assert data["cities"][0]["description"] == "Cologne_description"

        assert data["cities"][1]["city"] == "Munich"
        assert data["cities"][1]["url"] == "Munich_url"
        assert data["cities"][1]["journey_time"] == 160
        assert data["cities"][1]["stops"] == 2
        assert data["cities"][1]["origin_stop"] == 8009009
        assert data["cities"][1]["destination_stop"] == 813456
        assert data["cities"][1]["description"] == "Munich_description"


@pytest.fixture
def city_table_connection() -> Any:
    db_path = Path(".").resolve() / "test" / "data" / "cities.sqlite"
    conn = sqlite3.connect(db_path)

    cursor = conn.cursor()
    cursor.execute("DROP TABLE IF EXISTS destinations")
    cursor.execute(
        """CREATE TABLE destinations (city TEXT, url TEXT, journey_time INT, stops INT,
        origin_stop INT, destination_stop INT, description TEXT)"""
    )
    cursor.execute(
        """INSERT INTO destinations
            ('city', 'url', 'journey_time', 'stops', 'origin_stop', 'destination_stop', 'description')
            VALUES ('Hamburg', 'https://www.example.com', 1100, 5, 8009009, 803456,
           'A journey on the train')"""
    )
    cursor.close()

    yield conn

    cursor = conn.cursor()
    cursor.execute("DROP TABLE IF EXISTS destinations")
    cursor.close()

    conn.close()


@pytest.fixture
def city_table_connection_for_joining_and_json() -> Any:
    city = "Hamburg"
    cities_table = "cities"
    journeys_table = f"{city}_journeys"
    stops_table = "city_stops"

    db_path = Path(".").resolve() / "test" / "data" / "cities.sqlite"
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    cursor.execute(f"DROP TABLE IF EXISTS {cities_table}")
    cursor.execute(f"DROP TABLE IF EXISTS {journeys_table}")
    cursor.execute(f"DROP TABLE IF EXISTS {stops_table}")
    cursor.execute(
        f"CREATE TABLE {cities_table} (city TEXT, description TEXT, url TEXT)"
    )
    cursor.execute(
        f"""INSERT INTO {cities_table} VALUES
        ('Hamburg', 'Hamburg_description', 'Hamburg_url'),
        ('Munich', 'Munich_description', 'Munich_url'),
        ('Cologne', 'Cologne_description', 'Cologne_url')"""
    )

    # Create journeys and stops table
    cursor.execute(
        f"CREATE TABLE {journeys_table} (city TEXT, stops INTEGER, journey_time INTEGER)"
    )
    cursor.execute(
        f"INSERT INTO {journeys_table} VALUES ('Munich', 2, 160), ('Cologne', 1, 100)"
    )

    cursor.execute(f"CREATE TABLE {stops_table} (city TEXT, stop_id INTEGER)")
    cursor.execute(
        f"""INSERT INTO {stops_table}
                   VALUES
                   ('Hamburg', 8009009), ('Munich', 813456), ('Cologne', 803456)"""
    )
    cursor.close()

    yield conn

    cursor = conn.cursor()
    cursor.execute(f"DROP TABLE IF EXISTS {cities_table}")
    cursor.execute(f"DROP TABLE IF EXISTS {journeys_table}")
    cursor.execute(f"DROP TABLE IF EXISTS {stops_table}")
    cursor.close()

    conn.close()
