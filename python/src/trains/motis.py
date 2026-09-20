"""HTTP client for the local MOTIS server.

MOTIS owns stations and travel times. This module is the only place that knows
its URL shapes: callers pass a stop id and a departure time in, and get stop ids
and minutes out. It holds no city or dataset logic.
"""

from __future__ import annotations

import json
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from datetime import datetime
from typing import Any

BASE_URL = "http://localhost:8080"

# The transit endpoint. The similarly named `/api/v1/one-to-many` is street
# routing (WALK/BIKE/CAR) and cannot answer a public-transport question.
_ONE_TO_ALL_PATH = "/api/v6/one-to-all"
# Stop names, coordinates and modes, for the station-to-city mapping. The import
# runs with geocoding disabled, so `/api/v1/geocode` is unavailable and this
# endpoint is how the stop catalogue is read.
_MAP_STOPS_PATH = "/api/v1/map/stops"

# A map/stops bounding box that holds more stops than MOTIS will return is
# rejected rather than truncated, so `all_stops` splits until each part fits.
# The depth guard only exists to terminate if a box that small still overflows;
# 20 halvings take a degree-wide box below a metre.
_MAX_BOUNDING_BOX_SPLIT_DEPTH = 20

# Routing has a 600 second budget and the responses are large, so the socket
# timeout is set to match rather than to cut a slow query off.
_REQUEST_TIMEOUT_SECONDS = 600


class TooManyStopsError(Exception):
    """MOTIS refuses a bounding box that contains too many stops to return."""


@dataclass(frozen=True)
class MotisStop:
    stop_id: str
    name: str
    latitude: float
    longitude: float
    modes: tuple[str, ...]


@dataclass(frozen=True)
class StopArrival:
    motis_stop_id: str
    minutes: int


def all_stops(
    min_corner: tuple[float, float], max_corner: tuple[float, float]
) -> list[MotisStop]:
    """Every stop inside the box, split into requests that MOTIS accepts.

    Corners are `(latitude, longitude)`. MOTIS rejects a box that holds too many
    stops rather than truncating it, and the rejection is against the stop count,
    so no single box size always works: a rejected box splits in four.
    """
    stops: dict[str, MotisStop] = {}
    pending = [(min_corner, max_corner, 0)]
    while pending:
        low, high, depth = pending.pop()
        try:
            payload = _get_json(
                _MAP_STOPS_PATH,
                {"min": _corner(low), "max": _corner(high)},
            )
        except urllib.error.HTTPError as error:
            if not (error.code == 422 and _is_too_many_stops(error)):
                raise
            if depth >= _MAX_BOUNDING_BOX_SPLIT_DEPTH:
                raise TooManyStopsError from error
            pending.extend(
                (low, high, depth + 1) for low, high in _split_bbox(low, high)
            )
            continue
        for entry in payload:
            stop = _stop_from_json(entry)
            stops[stop.stop_id] = stop
    return list(stops.values())


def one_to_all(
    origin_stop_id: str, depart_at: datetime, max_travel_minutes: int
) -> list[StopArrival]:
    """Arrivals from one stop, measured from `depart_at`.

    `max_travel_minutes` caps how far MOTIS searches, and each returned
    `minutes` counts from standing on the origin platform, including the wait.
    """
    payload = _get_json(
        _ONE_TO_ALL_PATH,
        {
            "one": origin_stop_id,
            "time": depart_at.isoformat(),
            "maxTravelTime": max_travel_minutes,
            "arriveBy": "false",
        },
    )
    return parse_one_to_all(payload)


def parse_one_to_all(payload: dict[str, Any]) -> list[StopArrival]:
    """The reachable stops in a one-to-all response, one entry per stop."""
    return [
        StopArrival(motis_stop_id=entry["place"]["stopId"], minutes=entry["duration"])
        for entry in payload["all"]
    ]


def _split_bbox(
    min_corner: tuple[float, float], max_corner: tuple[float, float]
) -> list[tuple[tuple[float, float], tuple[float, float]]]:
    middle_latitude = (min_corner[0] + max_corner[0]) / 2
    middle_longitude = (min_corner[1] + max_corner[1]) / 2
    return [
        (min_corner, (middle_latitude, middle_longitude)),
        ((middle_latitude, min_corner[1]), (max_corner[0], middle_longitude)),
        ((min_corner[0], middle_longitude), (middle_latitude, max_corner[1])),
        ((middle_latitude, middle_longitude), max_corner),
    ]


def _corner(corner: tuple[float, float]) -> str:
    return f"{corner[0]},{corner[1]}"


def _is_too_many_stops(error: urllib.error.HTTPError) -> bool:
    try:
        return json.loads(error.read()).get("error") == "too many stops"
    except ValueError:
        return False


def _stop_from_json(entry: dict[str, Any]) -> MotisStop:
    return MotisStop(
        stop_id=entry["stopId"],
        name=entry["name"],
        latitude=float(entry["lat"]),
        longitude=float(entry["lon"]),
        modes=tuple(entry.get("modes") or ()),
    )


def _get_json(path: str, query: dict[str, Any]) -> Any:
    url = f"{BASE_URL}{path}?{urllib.parse.urlencode(query)}"
    with urllib.request.urlopen(url, timeout=_REQUEST_TIMEOUT_SECONDS) as response:
        return json.load(response)
