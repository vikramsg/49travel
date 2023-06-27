import time
from datetime import datetime, timedelta
from sqlite3 import Connection
from typing import List, Optional

import click
import pydantic
import pyhafas
from pyhafas import HafasClient

from src.common import city_table_connection, session_with_retry
from src.hafas.retry_hafas import DBRetryProfile
from src.model import JourneySummary, Stop


def _location(city_query: str) -> Optional[int]:
    """
    Returns stop id for the given city

    The transport API has weird issues
    1. It only unblocks after timeout is reached
    2. It blocks if query params are used as params instead of in url
    """
    location_url = (
        f"https://v6.db.transport.rest/locations?query={city_query}&results=1"
    )
    request_session = session_with_retry()
    location_response = request_session.get(location_url, timeout=1)

    try:
        stop_response = Stop.parse_obj(location_response.json()[0])
    except pydantic.error_wrappers.ValidationError:
        print(f"Could not resolve {city_query}. Skipping.")
        return None

    return stop_response.id


def get_city_stops(conn: Connection, input_table: str, output_table: str) -> None:
    with conn:
        cursor = conn.cursor()
        cursor.execute(
            f"""CREATE TABLE IF NOT EXISTS {output_table}(
            city TEXT,
            stop_id INTEGER
        )
        """
        )

        cursor.execute(f"SELECT city from {input_table}")

        cities = cursor.fetchall()

        for city in cities:
            city_name = city[0]
            print(f"Processing stop ID for city: {city_name}")
            stop_id = _location("+".join(city_name.split()))

            if stop_id:
                cursor.execute(
                    f"INSERT INTO {output_table} (city, stop_id) VALUES (?, ?)",
                    (city[0], stop_id),
                )

    conn.close()


def _get_journeys(
    client: HafasClient, origin: int, destination: int
) -> Optional[List[pyhafas.types.fptf.Journey]]:
    time_val = datetime.strptime("2023-06-30T10:00", "%Y-%m-%dT%H:%M")
    try:
        return client.journeys(  # type: ignore
            origin=origin,
            destination=destination,
            date=time_val,
            products={
                "long_distance_express": False,
                "long_distance": False,
                "ferry": False,
                "bus": False,
                "suburban": False,
                "subway": False,
            },
        )
    except TypeError as e:
        print(f"Invalid journey. Error: {e.args[0]}. Skipping")
        return None


def _journey(origin: int, destination: int) -> Optional[JourneySummary]:
    client = HafasClient(DBRetryProfile())

    try:
        journeys = _get_journeys(client, origin, destination)

        if journeys:
            min_journey_time = timedelta(days=10)
            min_journey_legs = 100
            for journey in journeys:
                flag = 1
                for leg in journey.legs:
                    if leg.name and "FLX" in leg.name:
                        flag = 0

                if journey.duration < min_journey_time and flag:
                    min_journey_time = journey.duration
                    min_journey_legs = len(journey.legs)

            if min_journey_legs == 100:
                return None

            print(f"Journey time: {min_journey_time}, legs: {min_journey_legs}")
            return JourneySummary(
                journey_time=min_journey_time, journey_legs=min_journey_legs
            )
        else:
            print("No journey for this destination.")
            return None
    except pyhafas.types.exceptions.JourneysArrivalDepartureTooNearError as pe:
        print(f"PyHafas raised an error. Error: {pe.args[0]}. Skipping.")
        return None
    except TypeError as te:
        print(f"Something is wrong with the journeys. Error: {te.args[0]}. Skipping.")
        return None


def city_journeys(
    conn: Connection, origin_stop_id: int, input_table: str, output_table: str
) -> None:
    with conn:
        cursor = conn.cursor()
        cursor.execute(f"DROP TABLE IF EXISTS {output_table}")
        cursor.execute(
            f"""CREATE TABLE {output_table}(
            city TEXT,
            journey_time INT,
            stops INT
        )
        """
        )

        cursor.execute(f"SELECT city, stop_id from {input_table}")

        table_output = cursor.fetchall()
        cities = [city_stop[0] for city_stop in table_output]
        stop_ids = [city_stop[1] for city_stop in table_output]

        for it, destination_stop_id in enumerate(stop_ids):
            print(
                f"Processing journey to city: {cities[it]} with stop id: {destination_stop_id}"
            )
            if origin_stop_id != destination_stop_id:
                journey_summary = _journey(origin_stop_id, destination_stop_id)

                if journey_summary:
                    cursor.execute(
                        f"INSERT INTO {output_table} (city, journey_time, stops) VALUES (?, ?, ?)",
                        (
                            cities[it],
                            journey_summary.journey_time.total_seconds(),
                            journey_summary.journey_legs - 1,
                        ),
                    )

            # Rate limit the requests
            # time.sleep(1)


@click.command()
@click.option(
    "--run-type",
    type=click.Choice(["stops", "journeys_from_origin"]),
    help="Whether to get stops or run journeys for an origin city.",
    required=True,
)
@click.option(
    "--city",
    help="City to run for if we want to get journeys for a city",
    required=False,
)
def run_city_journeys(run_type: str, city: str) -> None:
    if run_type == "journeys_from_origin" and not city:
        raise click.ClickException(
            "When run type is 'journeys_from_origin', city must be provided"
        )

    conn = city_table_connection()
    if run_type == "stops":
        get_city_stops(conn, "cities", "city_stops")
    elif run_type == "journeys_from_origin":
        # First find the city in city_stops and get its stop id
        # Then run journeys from that city and create table
        cursor = conn.cursor()

        cursor.execute(f"SELECT city, stop_id FROM city_stops WHERE city='{city}'")
        city_row = cursor.fetchone()
        cursor.close()
        if not city_row:
            raise click.ClickException(
                "Invalid city. Are you sure about the city name?"
            )
        _, stop_id = city_row

        city_journeys(conn, stop_id, "city_stops", f"{city}_journeys")


if __name__ == "__main__":
    run_city_journeys()
