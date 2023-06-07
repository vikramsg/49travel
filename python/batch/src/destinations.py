import json
from datetime import datetime, timedelta
from sqlite3 import Connection
from typing import Optional

import pydantic
import requests

from src.common import city_table_connection, session_with_retry
from src.model import JourneyResponse, JourneySummary, Stop


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
    conn.execute(
        f"""CREATE TABLE {output_table}(
            city TEXT,
            stop_id INTEGER
        )
        """
    )
    with conn:
        cursor = conn.cursor()
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


def _journey(origin: int, destination: int) -> Optional[JourneySummary]:
    url = (
        "https://v6.db.transport.rest/journeys"
        "?from="
        f"{origin}"
        "&to="
        f"{destination}"
        "&bus=false"
        "&national=false"
        "&nationalExpress=false"
        "&suburban=false"
        "&subway=false"
        "&departure=2023-05-27T05:00"
    )

    request_session = session_with_retry()
    try:
        response = request_session.get(url, timeout=1)

        journey_response = JourneyResponse.parse_obj(response.json())

        journey_info = []
        if journey_response.journeys:
            min_journey_time = timedelta(days=1)
            for journey in journey_response.journeys:
                leg_summary = []
                for leg in journey.legs:
                    line_name = leg.line.name if leg.line else None
                    leg_summary.append(
                        (
                            leg.origin.name,
                            leg.plannedDeparture,
                            leg.destination.name,
                            leg.plannedArrival,
                            line_name,
                        )
                    )
                journey_departure_time = datetime.strptime(
                    leg_summary[0][1], "%Y-%m-%dT%H:%M:%S%z"
                )
                journey_arrival_time = datetime.strptime(
                    leg_summary[-1][3], "%Y-%m-%dT%H:%M:%S%z"
                )

                min_journey_time = min(
                    min_journey_time, journey_arrival_time - journey_departure_time
                )

                journey_info.append(leg_summary)

            return JourneySummary(
                journey_time=min_journey_time, journey_info=journey_info
            )
        else:
            return None
    # Even with backoff, if it does not work, then we just ignore it
    except requests.exceptions.ConnectionError:
        print("Timeout occured. Returning None.")
        return None


def hamburg_journeys(conn: Connection, input_table: str, output_table: str) -> None:
    hamburg_stop_id = 8096009

    conn.execute(
        f"""CREATE TABLE {output_table}(
            city TEXT,
            journey TEXT,
            journey_time INT
        )
        """
    )
    with conn:
        cursor = conn.cursor()
        cursor.execute(f"SELECT city, stop_id from {input_table}")

        table_output = cursor.fetchall()
        cities = [city_stop[0] for city_stop in table_output]
        stop_ids = [city_stop[1] for city_stop in table_output]

        for it, destination_stop_id in enumerate(stop_ids):
            print(
                f"Processing journey to city: {cities[it]} with stop id: {destination_stop_id}"
            )
            journey_summary = _journey(hamburg_stop_id, destination_stop_id)

            if journey_summary:
                journey_summary_json = json.dumps(journey_summary.journey_info)

                cursor.execute(
                    f"INSERT INTO {output_table} (city, journey, journey_time) VALUES (?, ?, ?)",
                    (
                        cities[it],
                        journey_summary_json,
                        journey_summary.journey_time.total_seconds(),
                    ),
                )

    conn.close()


if __name__ == "__main__":
    conn = city_table_connection("city_stops")
    get_city_stops(conn, "cities_lat_lon", "city_stops")

    conn = city_table_connection("hamburg_journeys")
    hamburg_journeys(conn, "city_stops", "hamburg_journeys")

    # ToDo
    # We don't really need lat lon at all!
    # We should just save these as gists
    # Actually just create another folder and save these files
    # Helps when referencing in blog
