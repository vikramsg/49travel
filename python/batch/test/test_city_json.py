import json
import sqlite3
from pathlib import Path
from sqlite3 import Connection
from typing import Any

import pytest

from src.city_json import destinations_json


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
                    "city": "New York",
                    "url": "https://www.example.com",
                    "journey_time": 1100,
                    "stops": 5,
                    "origin_stop": "Grand Central",
                    "destination_stop": "Penn Station",
                    "description": "A journey from Grand Central to Penn Station",
                }
            ]
        }

    # Tests the happy path scenario where a valid city is provided and the output json file is created with the expected data.
    def test_happy_path_city_exists(
        self,
        cities_table_connection_fixture,
        join_cities_journeys_fixture,
        destinations_json_fixture,
    ):
        # Generate the fixtures
        cities_table_connection_fixture = city_table_connection
        join_cities_journeys_fixture = join_cities_journeys
        destinations_json_fixture = destinations_json

        # Setup
        city = "Toronto"
        cities_table = "cities"
        journeys_table = f"{city}_journeys"
        stops_table = "city_stops"
        joined_table = f"{city}_destinations"
        output_file = f"data/{city.lower()}.json"

        # Create city table
        conn = cities_table_connection_fixture()
        conn.execute(
            f"CREATE TABLE {cities_table} (city TEXT, description TEXT, url TEXT)"
        )
        conn.execute(
            f"INSERT INTO {cities_table} VALUES ('Toronto', 'description', 'url')"
        )
        conn.commit()

        # Create journeys and stops table
        conn.execute(
            f"CREATE TABLE {journeys_table} (city TEXT, stops TEXT, journey_time TEXT)"
        )
        conn.execute(
            f"INSERT INTO {journeys_table} VALUES ('Toronto', '2 stops', '1h')"
        )
        conn.commit()

        conn.execute(f"CREATE TABLE {stops_table} (city TEXT, stop_id TEXT)")
        conn.execute(f"INSERT INTO {stops_table} VALUES ('Toronto', 'origin')")
        conn.execute(f"INSERT INTO {stops_table} VALUES ('Toronto', 'destination')")
        conn.commit()

        # Exercise
        conn = cities_table_connection_fixture()
        join_cities_journeys_fixture(
            conn, city, cities_table, journeys_table, stops_table, joined_table
        )
        destinations_json_fixture(conn, joined_table, output_file)

        # Assert
        with open(output_file, "r") as file_read:
            data = json.load(file_read)
            assert data["cities"][0]["city"] == "Toronto"
            assert data["cities"][0]["url"] == "url"
            assert data["cities"][0]["journey_time"] == "1h"
            assert data["cities"][0]["stops"] == "2 stops"
            assert data["cities"][0]["origin_stop"] == "origin"
            assert data["cities"][0]["destination_stop"] == "destination"
            assert data["cities"][0]["description"] == "description"


@pytest.fixture
def city_table_connection() -> Any:
    db_path = Path(".").resolve() / "test" / "data" / "cities.sqlite"
    conn = sqlite3.connect(db_path)

    cursor = conn.cursor()
    cursor.execute("DROP TABLE IF EXISTS destinations")
    cursor.execute(
        """CREATE TABLE destinations (city TEXT, url TEXT, journey_time INT, stops INT,
        origin_stop TEXT, destination_stop TEXT, description TEXT)"""
    )
    cursor.execute(
        """INSERT INTO destinations
            ('city', 'url', 'journey_time', 'stops', 'origin_stop', 'destination_stop', 'description')
            VALUES ('New York', 'https://www.example.com', 1100, 5, 'Grand Central', 'Penn Station',
           'A journey from Grand Central to Penn Station')"""
    )
    cursor.execute("DROP TABLE IF EXISTS destinations")
    cursor.close()

    yield conn

    conn.close()


@pytest.fixture
def city_table_connection_for_joining_and_json() -> Any:
    city = "Toronto"
    cities_table = "cities"
    journeys_table = f"{city}_journeys"
    stops_table = "city_stops"
    joined_table = f"{city}_destinations"

    db_path = Path(".").resolve() / "test" / "data" / "cities.sqlite"
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    cursor.execute("DROP TABLE IF EXISTS destinations")

    cursor.execute(
        f"CREATE TABLE {cities_table} (city TEXT, description TEXT, url TEXT)"
    )
    cursor.execute(
        f"INSERT INTO {cities_table} VALUES ('Toronto', 'description', 'url')"
    )

    # Create journeys and stops table
    cursor.execute(
        f"CREATE TABLE {journeys_table} (city TEXT, stops TEXT, journey_time TEXT)"
    )
    cursor.execute(f"INSERT INTO {journeys_table} VALUES ('Toronto', '2 stops', '1h')")

    cursor.execute(f"CREATE TABLE {stops_table} (city TEXT, stop_id TEXT)")
    cursor.execute(f"INSERT INTO {stops_table} VALUES ('Toronto', 'origin')")
    cursor.execute(f"INSERT INTO {stops_table} VALUES ('Toronto', 'destination')")

    cursor.execute("DROP TABLE IF EXISTS destinations")
    cursor.close()

    yield conn

    conn.close()
