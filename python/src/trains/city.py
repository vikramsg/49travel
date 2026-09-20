"""The city table and the station-to-city mapping the map tab reads.

Two rules meet here. Which places are cities is a GeoNames selection: the 11
countries of the DB Fernverkehr network, above 10,000 inhabitants, without the
feature codes GeoNames uses for a section of a populated place. That rule is
deterministic. Which MOTIS stop serves which city is a name match, and it is the
fragile half of the dataset: a missed station makes a city look farther away, a
wrong one makes it look closer. `city_station.parquet` is committed so the match
can be reviewed by hand.

Run from `python/`, with the MOTIS server up:

    uv run python -m trains.city
"""

from __future__ import annotations

import math
import re
import unicodedata
import urllib.request
import zipfile
from collections import defaultdict
from collections.abc import Iterable, Sequence
from dataclasses import dataclass, field
from pathlib import Path

import pyarrow as pa
import pyarrow.parquet as pq

from trains import motis

GEONAMES_CITIES_URL = "https://download.geonames.org/export/dump/cities500.zip"

# GeoNames ships cities500 as a tab-separated dump with no header.
_GEONAME_ID_COLUMN = 0
_GEONAME_NAME_COLUMN = 1
_GEONAME_ASCII_NAME_COLUMN = 2
_GEONAME_ALTERNATE_NAMES_COLUMN = 3
_GEONAME_LATITUDE_COLUMN = 4
_GEONAME_LONGITUDE_COLUMN = 5
_GEONAME_FEATURE_CODE_COLUMN = 7
_GEONAME_COUNTRY_CODE_COLUMN = 8
_GEONAME_POPULATION_COLUMN = 14

COUNTRIES = frozenset(
    {"DE", "AT", "CH", "NL", "BE", "FR", "DK", "PL", "CZ", "IT", "LU"}
)

# GeoNames feature codes for a part of a populated place (a district, a
# borough, a quarter). They shadow the city they belong to and are not cities.
SECTION_FEATURE_CODES = frozenset({"PPLX", "PPLQ", "PPLCH", "PPLL", "PPLS"})

POPULATION_FLOOR = 10_000

# Places that GeoNames calls a plain populated place but that are part of a
# larger city: the 20 Paris arrondissements, the 16 Marseille ones, and Brno
# střed. A name rule finds them (a place whose name starts with another place's
# name in the same country, where that place has at least twice the population),
# but the same rule also matches six real separate towns (Freiberg am Neckar,
# Alba Adriatica, Macerata Campania, Massa Lubrense, Brzeg Dolny, Krosno
# Odrzańskie), so the 37 are listed by hand instead.
EXCLUDED_PLACE_NAMES = frozenset(
    [
        "Brno střed",
        "Marseille 01",
        "Marseille 02",
        "Marseille 03",
        "Marseille 04",
        "Marseille 05",
        "Marseille 06",
        "Marseille 07",
        "Marseille 08",
        "Marseille 09",
        "Marseille 10",
        "Marseille 11",
        "Marseille 12",
        "Marseille 13",
        "Marseille 14",
        "Marseille 15",
        "Marseille 16",
        "Paris 01 Louvre",
        "Paris 02 Bourse",
        "Paris 03 Temple",
        "Paris 04 Hôtel-de-Ville",
        "Paris 05 Panthéon",
        "Paris 06 Luxembourg",
        "Paris 07 Palais-Bourbon",
        "Paris 08 Élysée",
        "Paris 09 Opéra",
        "Paris 10 Entrepôt",
        "Paris 11 Popincourt",
        "Paris 12 Reuilly",
        "Paris 13 Gobelins",
        "Paris 14 Observatoire",
        "Paris 15 Vaugirard",
        "Paris 16 Passy",
        "Paris 17 Batignolles-Monceau",
        "Paris 18 Buttes-Montmartre",
        "Paris 19 Buttes-Chaumont",
        "Paris 20 Ménilmontant",
    ]
)

# MOTIS mode names. SUBURBAN is an S-Bahn, which is rail and is sometimes the
# only service a city has. SUBWAY, TRAM and BUS are deliberately absent: the map
# answers about arriving by train, so a stop that only serves them is not a
# station for this dataset.
RAIL_MODES = frozenset(
    {"HIGHSPEED_RAIL", "LONG_DISTANCE", "NIGHT_RAIL", "REGIONAL_RAIL", "SUBURBAN"}
)

# A station is named after the city it serves, so a real match is within a few
# kilometres of the city centre. The cap removes coincidences where a city's
# alternate name happens to be some other place's name; without it, name
# matching alone would attach far-away stations to a city.
MAX_STATION_DISTANCE_KM = 30.0

_EARTH_RADIUS_KM = 6371.0

# The published Parquet is committed, so each file must stay below this.
MAX_PARQUET_BYTES = 10 * 1024 * 1024

# Words that name the principal station of a city in the feeds this dataset
# imports. GTFS marks no station as "the main one", so the departure stop is
# chosen by name first, then by how many platform-level stops carry that name,
# then by the shortest name. "g owny" and "g owna" are the Polish *Główny* and
# *Główna*: NFKD does not decompose "ł", so it survives as a word break.
MAIN_STATION_WORDS = (
    "hbf",
    "hauptbahnhof",
    "hb",
    "centraal",
    "centrale",
    "central",
    "centralna",
    "glowny",
    "glowna",
    "g owny",
    "g owna",
    "hl n",
    "sbb",
)

GEONAMES_CACHE_DIR = Path("data/geonames")
CITY_PARQUET = Path("data/trains/city.parquet")
CITY_STATION_PARQUET = Path("data/trains/city_station.parquet")


@dataclass(frozen=True)
class City:
    city_id: str
    name: str
    country_code: str
    latitude: float
    longitude: float
    population: int
    # Every spelling the station matching accepts, lower-cased, accents removed
    # and split into words. Not written to the Parquet: it is matching input.
    name_keys: frozenset[tuple[str, ...]] = field(default_factory=frozenset)


def city_from_geoname_row(row: Sequence[str]) -> City | None:
    """The city a GeoNames row describes, or None if the row is not one."""
    if row[_GEONAME_COUNTRY_CODE_COLUMN] not in COUNTRIES:
        return None
    if row[_GEONAME_FEATURE_CODE_COLUMN] in SECTION_FEATURE_CODES:
        return None
    if int(row[_GEONAME_POPULATION_COLUMN]) <= POPULATION_FLOOR:
        return None
    if row[_GEONAME_NAME_COLUMN] in EXCLUDED_PLACE_NAMES:
        return None
    return City(
        city_id=row[_GEONAME_ID_COLUMN],
        name=row[_GEONAME_NAME_COLUMN],
        country_code=row[_GEONAME_COUNTRY_CODE_COLUMN],
        latitude=float(row[_GEONAME_LATITUDE_COLUMN]),
        longitude=float(row[_GEONAME_LONGITUDE_COLUMN]),
        population=int(row[_GEONAME_POPULATION_COLUMN]),
        name_keys=_name_keys(row),
    )


def select_cities(rows: Iterable[Sequence[str]]) -> list[City]:
    """The cities in a GeoNames cities500 dump, sorted by id."""
    cities = [city for row in rows if (city := city_from_geoname_row(row)) is not None]
    cities.sort(key=lambda city: city.city_id)
    return cities


def origin_city_ids(cities: Sequence[City], per_country: int) -> list[str]:
    """The largest `per_country` cities of each country, sorted by id.

    A country with fewer qualifying cities contributes only those it has:
    Luxembourg has three above 10,000 inhabitants, so the set is smaller than
    `per_country` times the country count.
    """
    by_country: dict[str, list[City]] = defaultdict(list)
    for city in cities:
        by_country[city.country_code].append(city)
    origins = [
        city
        for country_cities in by_country.values()
        for city in sorted(country_cities, key=lambda city: -city.population)[
            :per_country
        ]
    ]
    return sorted(city.city_id for city in origins)


def stations_by_city(
    cities: Sequence[City], stops: Sequence[motis.MotisStop]
) -> dict[str, list[motis.MotisStop]]:
    """Assign each rail stop to the city whose name it carries.

    A stop can carry several city names (a city and a village inside it), so the
    nearest of the matching cities gets it. Stops that match no city are left
    out; that loses a station rather than attaching it to the wrong city.
    """
    index = _name_index(cities)
    assigned: dict[str, list[motis.MotisStop]] = defaultdict(list)
    for stop in stops:
        if not RAIL_MODES.intersection(stop.modes):
            continue
        city = _nearest_matching_city(index, stop)
        if city is not None:
            assigned[city.city_id].append(stop)
    return assigned


def choose_origin_stop(stations: Sequence[tuple[str, str]]) -> str:
    """The stop a measurement departs from, given a city's (name, stop id) rows.

    The busiest-looking station wins: a name carrying a main-station word beats
    one that does not, more platform-level stops beats fewer, and a shorter name
    beats a longer one. Ties break on the name and then the stop id so the
    choice does not depend on the order the rows arrive in.
    """
    platform_counts: dict[str, int] = defaultdict(int)
    for name, _ in stations:
        platform_counts[name] += 1

    def rank(station: tuple[str, str]) -> tuple[int, int, int, str, str]:
        name, stop_id = station
        return (
            0 if _has_main_station_word(name) else 1,
            -platform_counts[name],
            len(name),
            name,
            stop_id,
        )

    return min(stations, key=rank)[1]


def read_cities(path: Path) -> list[City]:
    with path.open(encoding="utf-8") as dump:
        return select_cities(line.rstrip("\n").split("\t") for line in dump)


def geonames_dump(cache_dir: Path = GEONAMES_CACHE_DIR) -> Path:
    """The extracted cities500 dump, downloading it once if it is not cached."""
    text_path = cache_dir / "cities500.txt"
    if text_path.exists():
        return text_path
    cache_dir.mkdir(parents=True, exist_ok=True)
    archive_path = cache_dir / "cities500.zip"
    urllib.request.urlretrieve(GEONAMES_CITIES_URL, archive_path)
    with zipfile.ZipFile(archive_path) as archive:
        archive.extract("cities500.txt", cache_dir)
    archive_path.unlink()
    return text_path


def city_table(cities: Sequence[City]) -> pa.Table:
    return pa.table(
        {
            "city_id": [city.city_id for city in cities],
            "name": [city.name for city in cities],
            "country_code": [city.country_code for city in cities],
            "latitude": [city.latitude for city in cities],
            "longitude": [city.longitude for city in cities],
            "population": [city.population for city in cities],
        },
        schema=pa.schema(
            [
                ("city_id", pa.string()),
                ("name", pa.string()),
                ("country_code", pa.string()),
                ("latitude", pa.float64()),
                ("longitude", pa.float64()),
                ("population", pa.int64()),
            ]
        ),
    )


def city_station_table(assigned: dict[str, list[motis.MotisStop]]) -> pa.Table:
    city_ids: list[str] = []
    stop_ids: list[str] = []
    station_names: list[str] = []
    for city_id in sorted(assigned):
        for stop in sorted(
            assigned[city_id], key=lambda stop: (stop.name, stop.stop_id)
        ):
            city_ids.append(city_id)
            stop_ids.append(stop.stop_id)
            station_names.append(stop.name)
    return pa.table(
        {
            "city_id": city_ids,
            "motis_stop_id": stop_ids,
            "station_name": station_names,
        },
        schema=pa.schema(
            [
                ("city_id", pa.string()),
                ("motis_stop_id", pa.string()),
                ("station_name", pa.string()),
            ]
        ),
    )


def write_dataset(table: pa.Table, path: Path) -> None:
    """Write a Parquet file, refusing to leave one that is too big to commit."""
    sink = pa.BufferOutputStream()
    pq.write_table(table, sink, compression="zstd")
    payload = sink.getvalue()
    if payload.size >= MAX_PARQUET_BYTES:
        raise ValueError(
            f"{path} would be {payload.size} bytes, at or above the "
            f"{MAX_PARQUET_BYTES} byte commit cap"
        )
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(payload.to_pybytes())
    print(f"wrote {path} ({payload.size} bytes)")


def read_dataset(path: Path) -> pa.Table:
    return pq.read_table(path)


def main() -> None:
    cities = read_cities(geonames_dump())
    print(f"{len(cities)} cities")
    stops = motis.all_stops(*_search_bounds(cities))
    print(f"{len(stops)} stops in the stop catalogue")
    assigned = stations_by_city(cities, stops)
    print(
        f"{sum(len(v) for v in assigned.values())} rail stations in {len(assigned)} cities"
    )
    write_dataset(city_table(cities), CITY_PARQUET)
    write_dataset(city_station_table(assigned), CITY_STATION_PARQUET)


def _name_keys(row: Sequence[str]) -> frozenset[tuple[str, ...]]:
    """Every spelling worth matching on: the name, its ASCII form, alternates.

    The alternate names are what carries the local spelling, because GeoNames'
    `name` is often an English exonym ("Vienna", "Munich"). Keys with fewer than
    three letters in total and keys with digits are dropped: they match almost
    any station name.
    """
    keys = set()
    for value in (
        row[_GEONAME_NAME_COLUMN],
        row[_GEONAME_ASCII_NAME_COLUMN],
        *row[_GEONAME_ALTERNATE_NAMES_COLUMN].split(","),
    ):
        words = tuple(_normalise_name(value).split())
        if len(words) == 0:
            continue
        if sum(len(word) for word in words) < 3 or any(
            character.isdigit() for word in words for character in word
        ):
            continue
        keys.add(words)
    return frozenset(keys)


def _normalise_name(value: str) -> str:
    decomposed = unicodedata.normalize("NFKD", value)
    stripped = "".join(
        character for character in decomposed if not unicodedata.combining(character)
    )
    return re.sub(r"[^a-z0-9]+", " ", stripped.lower()).strip()


def _has_main_station_word(name: str) -> bool:
    words = _normalise_name(name).split()
    for phrase in MAIN_STATION_WORDS:
        phrase_words = phrase.split()
        for position in range(len(words) - len(phrase_words) + 1):
            if words[position : position + len(phrase_words)] == phrase_words:
                return True
    return False


def _name_index(
    cities: Sequence[City],
) -> dict[str, list[tuple[tuple[str, ...], City]]]:
    """Name keys grouped by their first word, so a station name finds its cities."""
    index: dict[str, list[tuple[tuple[str, ...], City]]] = defaultdict(list)
    for city in cities:
        for key in city.name_keys:
            index[key[0]].append((key, city))
    return index


def _nearest_matching_city(
    index: dict[str, list[tuple[tuple[str, ...], City]]], stop: motis.MotisStop
) -> City | None:
    words = _normalise_name(stop.name).split()
    candidates: list[City] = []
    for position in range(len(words)):
        for key, city in index.get(words[position], ()):
            if tuple(words[position : position + len(key)]) == key:
                candidates.append(city)
    best: City | None = None
    best_distance = MAX_STATION_DISTANCE_KM
    for city in candidates:
        distance = _distance_km(
            city.latitude, city.longitude, stop.latitude, stop.longitude
        )
        if distance <= best_distance:
            best = city
            best_distance = distance
    return best


def _distance_km(
    from_latitude: float,
    from_longitude: float,
    to_latitude: float,
    to_longitude: float,
) -> float:
    """Distance on an equirectangular projection, which is fine at 30 km."""
    mean_latitude = math.radians((from_latitude + to_latitude) / 2)
    east = math.radians(to_longitude - from_longitude) * math.cos(mean_latitude)
    north = math.radians(to_latitude - from_latitude)
    return _EARTH_RADIUS_KM * math.hypot(east, north)


def _search_bounds(
    cities: Sequence[City], margin_degrees: float = 0.5
) -> tuple[tuple[float, float], tuple[float, float]]:
    """The box that contains every city, padded so stations just outside fit."""
    return (
        (
            min(city.latitude for city in cities) - margin_degrees,
            min(city.longitude for city in cities) - margin_degrees,
        ),
        (
            max(city.latitude for city in cities) + margin_degrees,
            max(city.longitude for city in cities) + margin_degrees,
        ),
    )


if __name__ == "__main__":
    main()
