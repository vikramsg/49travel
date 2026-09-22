"""One row of facts per city, which the map's filters read.

Every metric is stored on its own. Nothing is combined into a score: a score
would hide which signal moved a city and would need re-tuning whenever a metric
changed, while separate columns let the map offer each one as its own filter and
let a reader see the evidence behind it.

| column | meaning |
| --- | --- |
| `wikipedia_sitelinks` | language editions of the city's Wikipedia article; 0 when none was resolved |
| `wikivoyage_article` | whether an English Wikivoyage article was resolved |
| `unesco_sites` | World Heritage Sites within `UNESCO_RADIUS_KM` |
| `tourism_pois` | mapped tourist features within `POI_RADIUS_KM` |
| `db_station_category` | Deutsche Bahn category of the nearest classified station |

Where each one comes from:

- `wikipedia_sitelinks` — Wikidata `wikibase:sitelinks`, read for the item
  `city_link.parquet` resolved from the article.
- `wikivoyage_article` — `city_link.parquet`.
- `unesco_sites` — Wikidata `P1435` with value `Q9259`.
- `tourism_pois` — the country's OpenStreetMap extract, read by DuckDB.
- `db_station_category` — Wikidata `P5606` with one of `DB_STATION_CATEGORY`;
  null when no classified station is near.

The Wikidata answers are read once per build and the OpenStreetMap extracts are
downloaded once and cached, so a rebuild re-counts rather than re-downloads. Only
the counts are committed.

The OpenStreetMap step is `duckdb`'s `ST_ReadOSM` over a Geofabrik extract. The
`sitelinks` count is read per item rather than from a count of articles, because
the item is what carries the other language editions; that item comes from
`city_link.parquet`, which resolved it from the article rather than from the
GeoNames id — that id's item is often a bot-created stub, which would report a
sitelink count of 0 for Munich.
"""

from __future__ import annotations

import json
import re
import urllib.parse
import urllib.request
from dataclasses import dataclass
from pathlib import Path

import duckdb
import pyarrow as pa

from trains.city import CITY_PARQUET, read_dataset, write_dataset
from trains.geo import PointGrid
from trains.links import CITY_LINK_PARQUET

CITY_METRIC_PARQUET = Path("data/trains/city_metric.parquet")

# The OpenStreetMap extracts, and the cache they land in. The cache is
# gitignored: an extract is gigabytes where the coordinates kept from it are
# hundreds of kilobytes, and the committed artifact is one count per city.
OSM_EXTRACT = "https://download.geofabrik.de/europe/{name}-latest.osm.pbf"
OSM_EXTRACT_NAMES = {
    "AT": "austria",
    "BE": "belgium",
    "CH": "switzerland",
    "CZ": "czech-republic",
    "DE": "germany",
    "DK": "denmark",
    "FR": "france",
    "IT": "italy",
    "LU": "luxembourg",
    "NL": "netherlands",
    "PL": "poland",
}
POI_CACHE_DIR = Path("data/pois")

WIKIDATA_SPARQL = "https://query.wikidata.org/sparql"
USER_AGENT = "49travel-map-metrics/0.1 (https://github.com/vikramsg/49travel)"

# Wikidata accepts large VALUES clauses but answers them slowly; this keeps each
# query to a few seconds.
SITELINK_BATCH = 250

# `P1435` (heritage designation) with this value is a World Heritage Site.
UNESCO_DESIGNATION = "Q9259"
UNESCO_RADIUS_KM = 30.0

# `P5606` (class of station) carries a per-country class. These seven values are
# the Deutsche Bahn categories, which is what a Deutschlandticket rider sees on
# the station sign. The ids are listed rather than the labels parsed: the labels
# read "category 1 railway station", but parsing a label is a guess where an
# explicit list is not.
DB_STATION_CATEGORY = {
    "Q18681579": 1,
    "Q18681660": 2,
    "Q18681688": 3,
    "Q18681690": 4,
    "Q18681691": 5,
    "Q18681692": 6,
    "Q18681693": 7,
}

# Far enough to cover a city whose station is in a neighbouring district, close
# enough that a station in the next town over is not claimed.
DB_STATION_RADIUS_KM = 10.0

# The tags that mark somewhere worth the trip. `amenity=restaurant` is
# deliberately absent: eateries are among the most mapped things there are, they
# would swamp the count, and a restaurant is a place to eat rather than something
# to go and look at.
POI_TAGS = {
    "tourism": (
        "museum",
        "attraction",
        "viewpoint",
        "gallery",
        "zoo",
        "theme_park",
        "aquarium",
    ),
    "historic": ("castle", "archaeological_site", "ruins"),
}
POI_RADIUS_KM = 5.0

# The join between cities and mapped features is filtered by this much of a
# degree before any distance is measured. It has to be at least as wide as
# POI_RADIUS_KM everywhere the map reaches: 0.15 degrees is about 17 km of
# latitude and 9 km of longitude at 57 degrees north, the map's furthest.
POI_PREFILTER_DEGREES = 0.15

_WKT_POINT = re.compile(r"Point\(([-\d.]+) ([-\d.]+)\)")


@dataclass(frozen=True)
class City:
    """The fields a metric needs: where the city is."""

    city_id: str
    country_code: str
    latitude: float
    longitude: float


@dataclass(frozen=True)
class CityLinkRow:
    """The two link columns the metrics read out of `city_link.parquet`."""

    city_id: str
    wikivoyage_url: str | None
    wikidata_id: str | None


@dataclass(frozen=True)
class CityMetric:
    """One city's metrics. Absent facts are 0 or None, never a guess."""

    city_id: str
    wikipedia_sitelinks: int
    wikivoyage_article: bool
    unesco_sites: int
    tourism_pois: int
    db_station_category: int | None


def _wkt_point(literal: str) -> tuple[float, float]:
    """A `geo:wktLiteral` as (latitude, longitude); WKT writes longitude first."""
    match = _WKT_POINT.search(literal)
    if match is None:
        raise ValueError(f"not a WKT point: {literal!r}")
    longitude, latitude = (float(value) for value in match.groups())
    return latitude, longitude


def _sparql(query: str) -> list[dict]:
    url = f"{WIKIDATA_SPARQL}?{urllib.parse.urlencode({'query': query})}"
    request = urllib.request.Request(
        url,
        headers={"User-Agent": USER_AGENT, "Accept": "application/sparql-results+json"},
    )
    with urllib.request.urlopen(request, timeout=180) as response:
        return json.load(response)["results"]["bindings"]


def wikipedia_sitelinks(items: list[str]) -> dict[str, int]:
    """Wikidata item id -> how many language editions that item's articles have."""
    counts: dict[str, int] = {}
    for start in range(0, len(items), SITELINK_BATCH):
        chunk = items[start : start + SITELINK_BATCH]
        rows = _sparql(
            "SELECT ?item ?count WHERE { VALUES ?item { "
            + " ".join(f"wd:{item}" for item in chunk)
            + " } ?item wikibase:sitelinks ?count }"
        )
        for row in rows:
            item = row["item"]["value"].rsplit("/", 1)[-1]
            counts[item] = int(row["count"]["value"])
        print(f"  sitelinks: {min(start + SITELINK_BATCH, len(items))}/{len(items)}")
    return counts


def unesco_points() -> list[tuple[float, float]]:
    """Every World Heritage Site that carries coordinates."""
    rows = _sparql(
        "SELECT ?location WHERE { ?site wdt:P1435 wd:Q9259 ; wdt:P625 ?location }"
    )
    return [_wkt_point(row["location"]["value"]) for row in rows]


def db_station_points() -> list[tuple[float, float, int]]:
    """(latitude, longitude, category) for every station with a Deutsche Bahn class."""
    rows = _sparql(
        "SELECT ?class ?location WHERE { VALUES ?class { "
        + " ".join(f"wd:{item}" for item in DB_STATION_CATEGORY)
        + " } ?station wdt:P5606 ?class ; wdt:P625 ?location }"
    )
    return [
        (
            *_wkt_point(row["location"]["value"]),
            DB_STATION_CATEGORY[row["class"]["value"].rsplit("/", 1)[-1]],
        )
        for row in rows
    ]


def _connect() -> duckdb.DuckDBPyConnection:
    """A DuckDB connection with the spatial extension, which brings `ST_ReadOSM`."""
    connection = duckdb.connect()
    connection.execute("INSTALL spatial; LOAD spatial")
    return connection


def _tourism_match() -> str:
    """The tag test that marks a mapped feature as somewhere worth the trip."""
    clauses = []
    for key, values in POI_TAGS.items():
        listed = ", ".join(f"'{value}'" for value in values)
        clauses.append(f"tags['{key}'] IN ({listed})")
    return " OR ".join(clauses)


def poi_sql() -> str:
    """The query that pulls the tourist features out of an OpenStreetMap extract.

    `ST_ReadOSM` describes every element the extract holds: a node carries its
    coordinates, a way carries the ids of the nodes it joins, and a relation
    carries ids of other elements. Nodes are therefore read directly, and ways are
    placed at the average of the nodes they reference, which for a building or a
    castle is its centre.

    Relations are not resolved. Placing one means walking two hops, way ids and
    then node ids, and a tourist feature mapped as a relation is a multi-part
    site rather than a different kind of place, so leaving it out costs a few
    large sites rather than a class of them.
    """
    match = _tourism_match()
    return f"""
    WITH features AS (
      SELECT id, kind, refs, lat, lon
      FROM ST_ReadOSM(?)
      WHERE kind IN ('node', 'way') AND ({match})
    ),
    wanted AS (
      SELECT DISTINCT UNNEST(refs) AS node_id FROM features WHERE kind = 'way'
    ),
    nodes AS (
      SELECT node.id AS id, node.lat AS lat, node.lon AS lon
      FROM ST_ReadOSM(?) AS node
      SEMI JOIN wanted ON node.id = wanted.node_id
      WHERE node.kind = 'node'
    )
    SELECT lat, lon FROM features WHERE kind = 'node' AND lat IS NOT NULL
    UNION ALL
    SELECT avg(nodes.lat) AS lat, avg(nodes.lon) AS lon
    FROM features, UNNEST(features.refs) AS ref(node_id)
    JOIN nodes ON nodes.id = ref.node_id
    WHERE features.kind = 'way'
    GROUP BY features.id
    """


def _download(url: str, destination: Path) -> None:
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(request, timeout=1800) as response:
        destination.write_bytes(response.read())


def cache_pois(country_code: str) -> Path:
    """Fetch one country's tourist features into the cache, unless they are there.

    The extract is the whole country, gigabytes of it, so it is deleted once its
    features are read: what stays behind is a few hundred kilobytes of
    coordinates.
    """
    coordinates = POI_CACHE_DIR / f"{country_code}.parquet"
    if coordinates.exists():
        return coordinates

    POI_CACHE_DIR.mkdir(parents=True, exist_ok=True)
    extract = POI_CACHE_DIR / f"{country_code}.osm.pbf"
    _download(OSM_EXTRACT.format(name=OSM_EXTRACT_NAMES[country_code]), extract)

    connection = _connect()
    connection.execute(
        f"COPY ({poi_sql()}) TO '{coordinates}' (FORMAT PARQUET, COMPRESSION ZSTD)",
        [str(extract), str(extract)],
    )
    extract.unlink()

    count = connection.execute(
        "SELECT count(*) FROM read_parquet(?)", [str(coordinates)]
    ).fetchall()
    print(f"  {country_code}: {count[0][0]} mapped features")
    return coordinates


def cached_poi_files() -> list[Path]:
    """The per-country feature files the cache holds."""
    return sorted(POI_CACHE_DIR.glob("*.parquet"))


def poi_counts(cities: list[City], feature_files: list[Path]) -> dict[str, int]:
    """How many mapped tourist features sit within `POI_RADIUS_KM` of each city.

    DuckDB measures the distance. Every city against every feature is hundreds of
    millions of pairs, which the spatial extension does in one join; the
    bounding-box terms are there so it only measures the features that could be
    close enough.

    A city with nothing near it has no row rather than a zero, and the caller
    reads that as none.
    """
    connection = _connect()
    connection.register(
        "cities",
        pa.table(
            {
                "city_id": [city.city_id for city in cities],
                "latitude": [city.latitude for city in cities],
                "longitude": [city.longitude for city in cities],
            }
        ),
    )
    rows = connection.execute(
        """
        SELECT city.city_id AS city_id, count(*) AS pois
        FROM cities AS city
        JOIN read_parquet(?) AS feature
          ON abs(feature.lon - city.longitude) <= ?
         AND abs(feature.lat - city.latitude) <= ?
         AND ST_Distance_Sphere(
               ST_Point(city.longitude, city.latitude),
               ST_Point(feature.lon, feature.lat)
             ) <= ?
        GROUP BY city.city_id
        """,
        [
            [str(path) for path in feature_files],
            POI_PREFILTER_DEGREES,
            POI_PREFILTER_DEGREES,
            POI_RADIUS_KM * 1000,
        ],
    ).fetchall()
    return {row[0]: int(row[1]) for row in rows}


def read_cities(path: Path = CITY_PARQUET) -> list[City]:
    """The map's cities, sorted by id."""
    cities = [
        City(
            city_id=str(row["city_id"]),
            country_code=row["country_code"],
            latitude=row["latitude"],
            longitude=row["longitude"],
        )
        for row in read_dataset(path).to_pylist()
    ]
    cities.sort(key=lambda city: city.city_id)
    return cities


def read_city_links(path: Path = CITY_LINK_PARQUET) -> dict[str, CityLinkRow]:
    """The link rows, keyed by city id."""
    return {
        row["city_id"]: CityLinkRow(
            city_id=row["city_id"],
            wikivoyage_url=row["wikivoyage_url"],
            wikidata_id=row["wikidata_id"],
        )
        for row in read_dataset(path).to_pylist()
    }


def build_metrics(
    cities: list[City],
    links: dict[str, CityLinkRow],
    sitelinks: dict[str, int],
    unesco: list[tuple[float, float]],
    stations: list[tuple[float, float, int]],
    tourism: dict[str, int],
) -> list[CityMetric]:
    """One metric row per city, in the order given."""
    unesco_grid = PointGrid(unesco)
    station_grid = PointGrid(
        [(latitude, longitude) for latitude, longitude, _ in stations]
    )
    station_categories = [category for _, _, category in stations]

    metrics: list[CityMetric] = []
    for city in cities:
        link = links.get(city.city_id)
        nearest_station = station_grid.nearest_index(
            city.latitude, city.longitude, DB_STATION_RADIUS_KM
        )
        metrics.append(
            CityMetric(
                city_id=city.city_id,
                wikipedia_sitelinks=(
                    sitelinks.get(link.wikidata_id, 0)
                    if link is not None and link.wikidata_id is not None
                    else 0
                ),
                wikivoyage_article=link is not None and link.wikivoyage_url is not None,
                unesco_sites=unesco_grid.count_within(
                    city.latitude, city.longitude, UNESCO_RADIUS_KM
                ),
                tourism_pois=tourism.get(city.city_id, 0),
                db_station_category=(
                    station_categories[nearest_station]
                    if nearest_station is not None
                    else None
                ),
            )
        )
    return metrics


def city_metric_table(metrics: list[CityMetric]) -> pa.Table:
    return pa.table(
        {
            "city_id": [metric.city_id for metric in metrics],
            "wikipedia_sitelinks": pa.array(
                [metric.wikipedia_sitelinks for metric in metrics], pa.int32()
            ),
            "wikivoyage_article": pa.array(
                [metric.wikivoyage_article for metric in metrics], pa.bool_()
            ),
            "unesco_sites": pa.array(
                [metric.unesco_sites for metric in metrics], pa.int32()
            ),
            "tourism_pois": pa.array(
                [metric.tourism_pois for metric in metrics], pa.int32()
            ),
            "db_station_category": pa.array(
                [metric.db_station_category for metric in metrics], pa.int32()
            ),
        }
    )


def main() -> None:
    cities = read_cities()
    # First, because it is the slow step: a cold cache downloads gigabytes.
    for country_code in sorted({city.country_code for city in cities}):
        cache_pois(country_code)

    links = read_city_links()
    metrics = build_metrics(
        cities=cities,
        links=links,
        sitelinks=wikipedia_sitelinks(
            sorted(
                {
                    link.wikidata_id
                    for link in links.values()
                    if link.wikidata_id is not None
                }
            )
        ),
        unesco=unesco_points(),
        stations=db_station_points(),
        tourism=poi_counts(cities, cached_poi_files()),
    )
    write_dataset(city_metric_table(metrics), CITY_METRIC_PARQUET)

    print(
        f"{len(metrics)} cities: "
        f"{sum(1 for metric in metrics if metric.wikivoyage_article)} with a "
        f"Wikivoyage article, "
        f"{sum(1 for metric in metrics if metric.unesco_sites)} near a World "
        f"Heritage Site, "
        f"{sum(1 for metric in metrics if metric.db_station_category is not None)} "
        f"with a station category -> {CITY_METRIC_PARQUET}"
    )


if __name__ == "__main__":
    main()
