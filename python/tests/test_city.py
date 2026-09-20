from pathlib import Path

import pytest

from trains.city import (
    City,
    choose_origin_stop,
    city_from_geoname_row,
    origin_city_ids,
    select_cities,
    stations_by_city,
)
from trains.motis import MotisStop

_GEONAME_COLUMN_COUNT = 19


def geoname_row(
    geoname_id: str,
    name: str,
    country_code: str,
    population: int,
    *,
    feature_code: str = "PPL",
    latitude: float = 0.0,
    longitude: float = 0.0,
    ascii_name: str | None = None,
    alternate_names: str = "",
) -> list[str]:
    row = [""] * _GEONAME_COLUMN_COUNT
    row[0] = geoname_id
    row[1] = name
    row[2] = ascii_name if ascii_name is not None else name
    row[3] = alternate_names
    row[4] = str(latitude)
    row[5] = str(longitude)
    row[6] = "P"
    row[7] = feature_code
    row[8] = country_code
    row[14] = str(population)
    return row


def rail_stop(stop_id: str, name: str, latitude: float, longitude: float) -> MotisStop:
    return MotisStop(
        stop_id=stop_id,
        name=name,
        latitude=latitude,
        longitude=longitude,
        modes=("REGIONAL_RAIL",),
    )


def test_row_from_another_country_is_not_a_city() -> None:
    row = geoname_row("1", "Zürich", "CH", 415367)
    assert city_from_geoname_row(row) is not None

    outside = geoname_row("2", "Basel", "GB", 400000)
    assert city_from_geoname_row(outside) is None


@pytest.mark.parametrize("feature_code", ["PPLX", "PPLQ", "PPLCH", "PPLL", "PPLS"])
def test_section_of_a_populated_place_is_not_a_city(feature_code: str) -> None:
    row = geoname_row("3", "Somewhere District", "DE", 50000, feature_code=feature_code)
    assert city_from_geoname_row(row) is None


def test_place_at_or_below_the_population_floor_is_not_a_city() -> None:
    assert city_from_geoname_row(geoname_row("4", "Small", "DE", 10000)) is None
    assert city_from_geoname_row(geoname_row("5", "Big", "DE", 10001)) is not None


def test_reviewed_exclusion_list_removes_arrondissements() -> None:
    # Paris and Marseille arrive as plain populated places with real population,
    # so nothing in the GeoNames columns marks them apart from a city.
    assert (
        city_from_geoname_row(geoname_row("6", "Paris 15 Vaugirard", "FR", 229713))
        is None
    )
    assert city_from_geoname_row(geoname_row("7", "Marseille 08", "FR", 78837)) is None
    assert city_from_geoname_row(geoname_row("8", "Brno střed", "CZ", 86685)) is None
    # The six towns the mechanical rule would have caught by mistake stay in.
    assert (
        city_from_geoname_row(geoname_row("9", "Brzeg Dolny", "PL", 12511)) is not None
    )


def test_kept_city_carries_the_columns_the_map_reads() -> None:
    row = geoname_row(
        "2911298",
        "Hamburg",
        "DE",
        1973896,
        latitude=53.55073,
        longitude=9.99302,
    )
    city = city_from_geoname_row(row)
    assert city is not None
    assert (city.city_id, city.name, city.country_code) == ("2911298", "Hamburg", "DE")
    assert (city.latitude, city.longitude, city.population) == (
        53.55073,
        9.99302,
        1973896,
    )


def test_select_cities_keeps_only_the_matching_rows() -> None:
    rows = [
        geoname_row("10", "Hamburg", "DE", 1973896),
        geoname_row("11", "Klein", "DE", 4000),
        geoname_row("12", "Paris 15 Vaugirard", "FR", 229713),
        geoname_row("13", "Zürich", "CH", 415367),
    ]
    assert [city.name for city in select_cities(rows)] == ["Hamburg", "Zürich"]


def test_origins_are_the_largest_per_country() -> None:
    rows = [
        geoname_row(str(100 + index), f"DE {index}", "DE", 10_000 + index)
        for index in range(1, 13)
    ] + [geoname_row("200", "Zürich", "CH", 415367)]
    cities = select_cities(rows)
    origins = origin_city_ids(cities, per_country=10)
    assert len(origins) == 11
    assert "101" not in origins  # the smallest German city misses out
    assert "112" in origins
    assert "200" in origins


def test_country_with_fewer_cities_contributes_what_it_has() -> None:
    rows = [
        geoname_row("300", "Luxembourg", "LU", 76684),
        geoname_row("301", "Esch-sur-Alzette", "LU", 36625),
        geoname_row("302", "Dudelange", "LU", 18013),
    ]
    assert origin_city_ids(select_cities(rows), per_country=10) == [
        "300",
        "301",
        "302",
    ]


def test_station_named_after_its_city_is_matched() -> None:
    cities = select_cities(
        [geoname_row("10", "Hamburg", "DE", 1973896, latitude=53.55, longitude=10.0)]
    )
    stops = [
        rail_stop("de_1", "Hamburg, Hamburg Hbf", 53.5527, 10.0069),
        rail_stop("de_2", "Buxtehude", 53.47, 9.70),
    ]
    assert stations_by_city(cities, stops) == {
        "10": [stops[0]],
    }


def test_stop_only_serving_buses_is_not_a_station() -> None:
    cities = select_cities(
        [geoname_row("10", "Hamburg", "DE", 1973896, latitude=53.55, longitude=10.0)]
    )
    bus_stop = MotisStop("de_3", "Hamburg, ZOB", 53.55, 10.0, modes=("BUS",))
    assert stations_by_city(cities, [bus_stop]) == {}


def test_station_takes_the_nearest_city_of_those_it_names() -> None:
    # Germany has three Neunkirchens, and a station name carries the same word
    # for all of them, so distance is what decides.
    cities = select_cities(
        [
            geoname_row("20", "Neunkirchen", "DE", 50000, latitude=50.0, longitude=8.0),
            geoname_row("21", "Neunkirchen", "DE", 40000, latitude=50.1, longitude=8.1),
        ]
    )
    stop = rail_stop("de_4", "Neunkirchen Bahnhof", 50.105, 8.105)
    assert stations_by_city(cities, [stop]) == {"21": [stop]}


def test_station_far_from_the_city_it_names_is_not_matched() -> None:
    cities = select_cities(
        [geoname_row("10", "Hamburg", "DE", 1973896, latitude=53.55, longitude=10.0)]
    )
    far_stop = rail_stop("de_5", "Hamburg, Somewhere", 48.0, 10.0)
    assert stations_by_city(cities, [far_stop]) == {}


def test_station_matches_a_city_name_only_at_the_start_of_its_name() -> None:
    # A parenthesised part or a later word disambiguates a place; it is not the
    # station's own city. "Erzingen (Baden)" carries the German region Baden, not
    # the Swiss city of Baden, and "Leverkusen Opladen Bf" belongs to Leverkusen,
    # not to Opladen. Both stops sit within the distance cap, so the position
    # rule alone has to keep them off.
    cities = select_cities(
        [
            geoname_row("40", "Baden", "CH", 18000, latitude=47.47, longitude=8.31),
            geoname_row("41", "Opladen", "DE", 23000, latitude=51.07, longitude=7.0),
        ]
    )
    stops = [
        rail_stop("de_6", "Erzingen (Baden)", 47.6, 8.4),
        rail_stop("de_7", "Leverkusen Opladen Bf", 51.07, 7.0),
    ]
    assert stations_by_city(cities, stops) == {}


def test_station_starting_with_its_city_name_is_matched() -> None:
    cities = select_cities(
        [geoname_row("41", "Opladen", "DE", 23000, latitude=51.07, longitude=7.0)]
    )
    stop = rail_stop("de_8", "Opladen Bf", 51.07, 7.0)
    assert stations_by_city(cities, [stop]) == {"41": [stop]}


def test_local_spelling_of_an_english_geoname_name_is_matched() -> None:
    # GeoNames calls it Vienna; the station says Wien.
    cities = select_cities(
        [
            geoname_row(
                "30",
                "Vienna",
                "AT",
                1691468,
                latitude=48.20849,
                longitude=16.37208,
                alternate_names="Wien,Vienne,Bécs",
            )
        ]
    )
    stop = rail_stop("at_1", "Wien Hauptbahnhof", 48.1851, 16.3771)
    assert stations_by_city(cities, [stop]) == {"30": [stop]}


def test_departure_stop_prefers_a_main_station_word() -> None:
    stations = [
        ("Hamburg, Jungfernstieg", "de_1"),
        ("Hamburg, Hamburg Hbf", "de_2"),
        ("Hamburg Dammtor", "de_3"),
    ]
    assert choose_origin_stop(stations) == "de_2"


def test_departure_stop_falls_back_to_the_busiest_name() -> None:
    # No name carries a main-station word, so the name with the most
    # platform-level stops wins.
    stations = [
        ("Lyon Vaise", "fr_1"),
        ("Lyon Part Dieu", "fr_2"),
        ("Lyon Part Dieu", "fr_3"),
        ("Lyon Perrache", "fr_4"),
    ]
    assert choose_origin_stop(stations) == "fr_2"


def test_departure_stop_breaks_a_tie_on_the_shortest_name() -> None:
    stations = [
        ("Nice-Ville", "fr_1"),
        ("Nice Riquier", "fr_2"),
    ]
    assert choose_origin_stop(stations) == "fr_1"


def test_parquet_writer_refuses_a_file_over_the_commit_cap(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    import trains.city as city_module

    # Any Parquet file carries a footer, so a 100 byte cap is always exceeded.
    monkeypatch.setattr(city_module, "MAX_PARQUET_BYTES", 100)
    path = tmp_path / "oversized.parquet"
    with pytest.raises(ValueError):
        city_module.write_dataset(
            city_module.city_table([City("1", "Hamburg", "DE", 53.55, 10.0, 1973896)]),
            path,
        )
    assert not path.exists()
