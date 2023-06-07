import json
from sqlite3 import Connection

from src.common import city_table_connection


def join_cities_journeys(
    conn: Connection,
    cities_table: str,
    hamburg_journeys_table: str,
    stops_table: str,
    joined_table: str,
) -> None:
    conn.execute(f"DROP TABLE IF EXISTS {joined_table}")

    city = "Hamburg"
    conn.execute(
        f"""
        CREATE TABLE {joined_table} AS
        WITH destinations AS
        (
            SELECT {cities_table}.city as city,
            {cities_table}.description as description,
            {cities_table}.url as url,
            {hamburg_journeys_table}.journey as journey,
            {hamburg_journeys_table}.journey_time as journey_time
            FROM {cities_table}
            JOIN {hamburg_journeys_table}
            ON {cities_table}.city = {hamburg_journeys_table}.city
        ),
        destinations_stops AS
        (
            SELECT destinations.city as city,
            destinations.description as description,
            destinations.url as url,
            destinations.journey_time as journey_time,
            {stops_table}.stop_id as destination_stop,
            (SELECT stop_id FROM {stops_table} WHERE city='{city}') as origin_stop
            FROM destinations
            JOIN {stops_table}
            ON destinations.city = city_stops.city
            ORDER BY journey_time ASC
        )
        SELECT city, description, url, journey_time, origin_stop, destination_stop FROM destinations_stops;
        """
    )

    conn.close()


def hamburg_destinations_json(
    conn: Connection, hamburg_destinations_table: str, output_file: str
) -> None:
    with conn:
        cursor = conn.cursor()

        cursor.execute(
            f"""
            SELECT city, url, journey_time, origin_stop, destination_stop, description
            FROM {hamburg_destinations_table}
            """
        )

        json_list = []
        row = cursor.fetchone()
        while row is not None:
            city, url, journey_time, origin_stop, destination_stop, description = row
            json_list.append(
                {
                    "city": city,
                    "url": url,
                    "journey_time": journey_time,
                    "origin_stop": origin_stop,
                    "destination_stop": destination_stop,
                    "description": description,
                }
            )

            row = cursor.fetchone()

    with open(output_file, "w") as file_write:
        json.dump({"cities": json_list}, file_write)


if __name__ == "__main__":
    cities_table = "cities"
    hamburg_journeys_table = "hamburg_journeys"
    stops_table = "city_stops"
    joined_table = "hamburg_destinations"

    conn = city_table_connection()
    join_cities_journeys(
        conn, cities_table, hamburg_journeys_table, stops_table, joined_table
    )

    output_file = "data/hamburg.json"
    conn = city_table_connection()
    hamburg_destinations_json(conn, joined_table, output_file)
