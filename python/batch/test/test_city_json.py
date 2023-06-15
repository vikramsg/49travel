import json
from sqlite3 import Connection
import pytest
from src.city_json import destinations_json

# Tests that the function correctly generates a JSON file with the expected data from the destinations table in the database.
def test_destinations_json(city_table_fixture):
    # Given
    conn = city_table_fixture
    cursor = conn.cursor()
    cursor.execute("""INSERT INTO destinations 
    VALUES ('New York', 'https://www.example.com', '2 hours', '5', 'Grand Central', 'Penn Station', 
    'A journey from Grand Central to Penn Station')""")
    output_file = "data/test.json"

    # When
    destinations_json(conn, "destinations", output_file)

    # Then
    with open(output_file, "r") as file_read:
        data = json.load(file_read)
        assert data == {"cities": [{"city": "New York", "url": "https://www.example.com", 
                                    "journey_time": "2 hours", "stops": "5", "origin_stop": "Grand Central", "destination_stop": "Penn Station", "description": "A journey from Grand Central to Penn Station"}]}}


@pytest.fixture
def city_table_fixture() -> Connection:
    conn = city_table_connection()
    yield conn
    conn.close()