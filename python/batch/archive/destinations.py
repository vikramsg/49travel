from datetime import datetime
from typing import List

import requests

from src.model import (
    StopDeparturesResponseModel,
    TravelRoute,
    TripDepartureArrival,
    TripResponseModel,
)


def _get_trip_departure_arrival(trip_id: str) -> TripDepartureArrival:
    url = f"https://v6.db.transport.rest/trips/{trip_id}"

    response = requests.get(url)
    json_response = response.json()

    # Parse and validate the JSON response using the ResponseModel
    response_model = TripResponseModel.parse_obj(json_response)

    trip = response_model.trip
    planned_departure = trip.plannedDeparture
    planned_arrival = trip.plannedArrival

    return TripDepartureArrival(departure=planned_departure, arrival=planned_arrival)


def get_departures(stop_id: int) -> List[TravelRoute]:
    url = (
        f"https://v6.db.transport.rest/stops/{stop_id}/departures?"
        "duration=120&bus=false&national=false&nationalExpress=false&suburban=false&subway=false&when=2023-05-20T07:00"
    )

    response = requests.get(url)
    json_response = response.json()

    # Parse and validate the JSON response using the ResponseModel
    response_model = StopDeparturesResponseModel.parse_obj(json_response)

    # Access the data from the response model
    departures = response_model.departures

    travel_routes = set()
    # Print the first departure's tripId as an example
    for departure in departures:
        orig_name = departure.stop.name
        orig_id = departure.stop.id
        line = departure.line
        line_name = line.name
        destination_name = departure.destination.name
        destination_id = departure.destination.id
        trip_id = departure.tripId
        trip_departure_arrival = _get_trip_departure_arrival(trip_id)

        travel_route = TravelRoute(
            origin=orig_name,
            origin_id=orig_id,
            destination=destination_name,
            destination_id=destination_id,
            train_line=line_name,
            departure=trip_departure_arrival.departure,
            arrival=trip_departure_arrival.arrival,
        )
        travel_routes.add(travel_route)

    return list(travel_routes)


def _get_hours_minutes(date_time: datetime) -> str:
    return date_time.time().strftime("%H:%M")


if __name__ == "__main__":
    hamburg_stop_id = 8002549
    travel_routes = get_departures(hamburg_stop_id)
    for route in travel_routes:
        print(
            f"Origin: {route.origin}, Destination: {route.destination}, Train: {route.train_line},"
            f" Departure: {_get_hours_minutes(route.departure)}, Arrival: {_get_hours_minutes(route.arrival)}"
        )
