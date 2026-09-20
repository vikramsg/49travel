from trains import motis, travel_time
from trains.motis import parse_one_to_all
from trains.travel_time import (
    MAX_TRAVEL_MINUTES,
    MEASUREMENT_DATE,
    minimum_per_city,
    minutes_by_city,
    travel_time_table,
)

# The shape of a one-to-all response, trimmed to what the reduction reads. The
# origin's own entry is included, with duration 0, as MOTIS returns it.
CANNED_ONE_TO_ALL = {
    "one": {"place": {"stopId": "de-fv_460848", "name": "Hamburg, Hamburg Hbf"}},
    "all": [
        {
            "place": {"stopId": "de-fv_460848", "name": "Hamburg, Hamburg Hbf"},
            "duration": 0,
            "k": 0,
        },
        {
            "place": {"stopId": "de-rv_437333", "name": "Berlin Hbf"},
            "duration": 134,
            "k": 1,
        },
        {
            "place": {"stopId": "nl_3667679", "name": "Berlin Hbf"},
            "duration": 143,
            "k": 1,
        },
        {
            "place": {"stopId": "ch_8020347", "name": "München Hbf"},
            "duration": 350,
            "k": 2,
        },
        {
            "place": {"stopId": "fr_999", "name": "Somewhere Else"},
            "duration": 12,
            "k": 1,
        },
    ],
}

STOP_CITY = {
    "de-fv_460848": "hamburg",
    "de-rv_437333": "berlin",
    "nl_3667679": "berlin",
    "ch_8020347": "munich",
}


def test_reduction_keeps_the_shortest_arrival_at_any_station_of_a_city() -> None:
    minutes = minutes_by_city(parse_one_to_all(CANNED_ONE_TO_ALL), STOP_CITY)
    assert minutes == {"hamburg": 0, "berlin": 134, "munich": 350}


def test_reduction_drops_stops_that_no_city_owns() -> None:
    minutes = minutes_by_city(parse_one_to_all(CANNED_ONE_TO_ALL), STOP_CITY)
    # fr_999's 12 minutes belong to no city, so no city is measured at 12.
    assert 12 not in minutes.values()


def test_reduction_keeps_the_minimum_across_samples() -> None:
    samples = [
        {"hamburg": 0, "berlin": 145, "munich": 351},
        {"hamburg": 0, "berlin": 134},
        {"munich": 350},
    ]
    assert minimum_per_city(samples) == {"hamburg": 0, "berlin": 134, "munich": 350}


def test_origin_is_sampled_at_five_local_departures_and_reduced(
    monkeypatch,
) -> None:
    departures: list[str] = []
    stops: list[str] = []
    caps: list[int] = []

    def record(origin_stop_id: str, depart_at, max_travel_minutes: int):
        stops.append(origin_stop_id)
        departures.append(depart_at.isoformat())
        caps.append(max_travel_minutes)
        return parse_one_to_all(CANNED_ONE_TO_ALL)

    monkeypatch.setattr(motis, "one_to_all", record)
    minutes = travel_time.measure_origin("de-fv_460848", STOP_CITY)

    assert departures == [
        "2026-09-22T05:00:00+02:00",
        "2026-09-22T09:00:00+02:00",
        "2026-09-22T13:00:00+02:00",
        "2026-09-22T17:00:00+02:00",
        "2026-09-22T21:00:00+02:00",
    ]
    assert stops == ["de-fv_460848"] * 5
    assert caps == [MAX_TRAVEL_MINUTES] * 5
    assert minutes == {"hamburg": 0, "berlin": 134, "munich": 350}


def test_written_table_states_the_day_it_was_measured_on() -> None:
    table = travel_time_table({"hamburg": {"berlin": 134}})
    assert (
        table.schema.metadata[b"measurement_date"]
        == MEASUREMENT_DATE.isoformat().encode()
    )


def test_written_table_has_one_row_per_origin_and_city() -> None:
    table = travel_time_table({"hamburg": {"berlin": 134, "munich": 350}, "berlin": {}})
    assert table.to_pydict() == {
        "origin_city_id": ["hamburg", "hamburg"],
        "city_id": ["berlin", "munich"],
        "minutes": [134, 350],
    }
