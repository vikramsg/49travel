import json
from sqlite3 import Connection

import click

from src.common import city_table_connection


def join_cities_journeys(
    conn: Connection,
    city: str,
    cities_table: str,
    journeys_table: str,
    stops_table: str,
    joined_table: str,
) -> None:
    conn.execute(f"DROP TABLE IF EXISTS {joined_table}")

    conn.execute(
        f"""
        CREATE TABLE {joined_table} AS
        WITH destinations AS
        (
            SELECT {cities_table}.city as city,
            {cities_table}.description as description,
            {cities_table}.url as url,
            {journeys_table}.stops as stops,
            {journeys_table}.journey_time as journey_time
            FROM {cities_table}
            JOIN {journeys_table}
            ON {cities_table}.city = {journeys_table}.city
        ),
        destinations_stops AS
        (
            SELECT destinations.city as city,
            destinations.description as description,
            destinations.url as url,
            destinations.journey_time as journey_time,
            destinations.stops as stops,
            {stops_table}.stop_id as destination_stop,
            (SELECT stop_id FROM {stops_table} WHERE city='{city}') as origin_stop
            FROM destinations
            JOIN {stops_table}
            ON destinations.city = city_stops.city
            ORDER BY journey_time ASC
        )
        SELECT city, description, url, journey_time, stops, origin_stop, destination_stop FROM destinations_stops;
        """
    )

    conn.close()


def destinations_json(
    conn: Connection, destinations_table: str, output_file: str
) -> None:
    with conn:
        cursor = conn.cursor()

        cursor.execute(
            f"""
            SELECT city, url, journey_time, stops, origin_stop, destination_stop, description
            FROM {destinations_table}
            """
        )

        json_list = []
        row = cursor.fetchone()
        while row is not None:
            (
                city,
                url,
                journey_time,
                stops,
                origin_stop,
                destination_stop,
                description,
            ) = row
            json_list.append(
                {
                    "city": city,
                    "url": url,
                    "journey_time": journey_time,
                    "stops": stops,
                    "origin_stop": origin_stop,
                    "destination_stop": destination_stop,
                    "description": description,
                }
            )

            row = cursor.fetchone()

    with open(output_file, "w") as file_write:
        json.dump({"cities": json_list}, file_write)


@click.command()
@click.option(
    "--city", help="City for which output json has to be created", required=True
)
def get_city_json(city: str) -> None:
    cities_table = "cities"
    journeys_table = f"{city}_journeys"
    stops_table = "city_stops"
    joined_table = f"{city}_destinations"

    conn = city_table_connection()
    join_cities_journeys(
        conn, city, cities_table, journeys_table, stops_table, joined_table
    )

    output_file = f"data/{city.lower()}.json"
    conn = city_table_connection()
    destinations_json(conn, joined_table, output_file)


if __name__ == "__main__":
    get_city_json()
