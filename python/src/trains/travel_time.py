"""Minutes from each origin city to every other city, measured with MOTIS.

One number per origin and city: the smallest, across the five sampled departure
times of the measurement day, of the time from the origin platform to any
station that belongs to the destination city. A wait at the origin counts, so
sampling more departures is what drives it toward zero. Nothing is written for a
city that no train reaches within the cap.

Run from `python/`, with the MOTIS server up and `trains.city` already run:

    uv run python -m trains.travel_time
"""

from __future__ import annotations

from collections import defaultdict
from collections.abc import Iterable, Mapping
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import date, datetime
from pathlib import Path
from zoneinfo import ZoneInfo

import pyarrow as pa

from trains import motis
from trains.city import (
    CITY_PARQUET,
    CITY_STATION_PARQUET,
    City,
    choose_origin_stop,
    origin_city_ids,
    read_dataset,
    write_dataset,
)

TRAVEL_TIME_PARQUET = Path("data/trains/travel_time.parquet")

# The reference day the whole dataset describes. It has to fall inside the
# imported feeds' validity, and it is fixed rather than "today" so a re-run of
# the same import reproduces the same numbers and the metadata stays meaningful.
MEASUREMENT_DATE = date(2026, 9, 22)

# Local departure times. The gap between samples caps how much of an origin
# wait the minimum can absorb; a 00:00-05:00 departure is deliberately not
# sampled, which is the constraint the plan chose.
SAMPLE_HOURS = (5, 9, 13, 17, 21)

# The 11 countries all keep CET/CEST, so one zone gives every origin's local
# time. Values are minutes, because `maxTravelTime` and `duration` both are.
SAMPLE_TIMEZONE = ZoneInfo("Europe/Berlin")

# 720 minutes (12 hours). The same cap is `max_travel_minutes` in `justfile`,
# which sets MOTIS's `onetoall_max_travel_minutes`; this is what the client asks
# for. MOTIS refuses a request above the configured limit.
MAX_TRAVEL_MINUTES = 720

ORIGINS_PER_COUNTRY = 10

# The measurement saturates well before the server's eight threads: 40 calls take
# 40.5 s at 4 in flight and 42.2 s at 8, because routing is single-threaded per
# query and each response is tens of megabytes. Four is where the gain stops.
MAX_IN_FLIGHT_REQUESTS = 4


class MeasurementOutOfTimetableError(Exception):
    """No origin reached anything but itself, so the pinned day is out of range."""


def _smallest_per_key(pairs: Iterable[tuple[str, int]]) -> dict[str, int]:
    smallest: dict[str, int] = {}
    for key, value in pairs:
        if key not in smallest or value < smallest[key]:
            smallest[key] = value
    return smallest


def minutes_by_city(
    arrivals: Iterable[motis.StopArrival], stop_city: Mapping[str, str]
) -> dict[str, int]:
    """The shortest arrival at any station of each city, keyed by city id.

    Stops with no city are dropped: they belong to no place in the dataset.
    """
    return _smallest_per_key(
        (stop_city[arrival.motis_stop_id], arrival.minutes)
        for arrival in arrivals
        if arrival.motis_stop_id in stop_city
    )


def minimum_per_city(samples: Iterable[Mapping[str, int]]) -> dict[str, int]:
    """Merge one sample's per-city minutes into the smallest across samples."""
    return _smallest_per_key(
        (city_id, minutes) for sample in samples for city_id, minutes in sample.items()
    )


def require_a_reachable_destination(
    minutes_by_origin: Mapping[str, Mapping[str, int]],
) -> None:
    """Refuse a measurement in which no origin reaches a place other than itself.

    A `MEASUREMENT_DATE` outside the imported timetable is not an error to MOTIS:
    asked for such a day it answers 200 with only the origin's own stop area, no
    trip taken and no other place, so every origin ends up with a single row.
    Writing that would silently replace the committed dataset with an empty one.
    The origin is present either way, and three real origins (Marne La Vallée,
    Turin and Florence) reach only themselves on a valid day too, so this
    whole-run check is the one signal that separates the two.
    """
    if any(
        city_id != origin_city_id
        for origin_city_id, minutes in minutes_by_origin.items()
        for city_id in minutes
    ):
        return
    raise MeasurementOutOfTimetableError(
        f"no origin reached any place other than itself on {MEASUREMENT_DATE}; "
        "the measurement date is outside the imported timetable"
    )


def travel_time_table(
    minutes_by_origin: Mapping[str, Mapping[str, int]],
) -> pa.Table:
    origin_ids: list[str] = []
    city_ids: list[str] = []
    minutes: list[int] = []
    for origin_city_id in sorted(minutes_by_origin):
        for city_id in sorted(minutes_by_origin[origin_city_id]):
            origin_ids.append(origin_city_id)
            city_ids.append(city_id)
            minutes.append(minutes_by_origin[origin_city_id][city_id])
    table = pa.table(
        {
            "origin_city_id": origin_ids,
            "city_id": city_ids,
            "minutes": minutes,
        },
        schema=pa.schema(
            [
                ("origin_city_id", pa.string()),
                ("city_id", pa.string()),
                ("minutes", pa.int32()),
            ]
        ),
    )
    return table.replace_schema_metadata(
        {b"measurement_date": MEASUREMENT_DATE.isoformat().encode()}
    )


def measure_origin(origin_stop_id: str, stop_city: Mapping[str, str]) -> dict[str, int]:
    """The per-city minimum from one origin stop, across the sampled hours."""
    samples = []
    for hour in SAMPLE_HOURS:
        depart_at = datetime(
            MEASUREMENT_DATE.year,
            MEASUREMENT_DATE.month,
            MEASUREMENT_DATE.day,
            hour,
            tzinfo=SAMPLE_TIMEZONE,
        )
        arrivals = motis.one_to_all(origin_stop_id, depart_at, MAX_TRAVEL_MINUTES)
        samples.append(minutes_by_city(arrivals, stop_city))
    return minimum_per_city(samples)


def index_city_stations(
    table: pa.Table,
) -> tuple[dict[str, list[tuple[str, str]]], dict[str, str]]:
    """Index `city_station` by city, and by stop id for the reduction."""
    stations: dict[str, list[tuple[str, str]]] = defaultdict(list)
    stop_city: dict[str, str] = {}
    for row in table.to_pylist():
        city_id = row["city_id"]
        stations[city_id].append((row["station_name"], row["motis_stop_id"]))
        stop_city[row["motis_stop_id"]] = city_id
    return stations, stop_city


def main() -> None:
    cities = [City(**row) for row in read_dataset(CITY_PARQUET).to_pylist()]
    stations, stop_city = index_city_stations(read_dataset(CITY_STATION_PARQUET))

    origin_ids = origin_city_ids(cities, ORIGINS_PER_COUNTRY)
    measurable: list[tuple[str, str]] = []
    for origin_city_id in origin_ids:
        if origin_city_id not in stations:
            print(f"{origin_city_id}: no station, skipped")
            continue
        measurable.append(
            (origin_city_id, choose_origin_stop(stations[origin_city_id]))
        )
    print(f"{len(measurable)} of {len(origin_ids)} origins have a station")

    minutes_by_origin: dict[str, dict[str, int]] = {}
    with ThreadPoolExecutor(max_workers=MAX_IN_FLIGHT_REQUESTS) as pool:
        futures = {
            pool.submit(measure_origin, stop_id, stop_city): origin_city_id
            for origin_city_id, stop_id in measurable
        }
        for future in as_completed(futures):
            origin_city_id = futures[future]
            minutes_by_origin[origin_city_id] = future.result()
            print(f"{origin_city_id}: {len(minutes_by_origin[origin_city_id])} cities")

    require_a_reachable_destination(minutes_by_origin)
    write_dataset(travel_time_table(minutes_by_origin), TRAVEL_TIME_PARQUET)


if __name__ == "__main__":
    main()
