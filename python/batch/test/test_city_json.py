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
    cursor.close()

    yield conn

    conn.close()
