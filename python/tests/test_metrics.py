from pathlib import Path

import pyarrow as pa
import pyarrow.parquet as pq

from trains.metrics import (
    City,
    CityLinkRow,
    CityMetric,
    build_metrics,
    poi_counts,
)

# Hamburg's centre and Berlin's, both from `city.parquet`. Distances below are
# given in degrees of latitude, where 0.01 degrees is about 1.1 km, so the tests
# can say how far outside a radius a fixture sits without a distance helper.
HAMBURG = City("2911298", "DE", 53.55, 9.99)
BERLIN = City("2950159", "DE", 52.52, 13.40)

# Q1055 is Hamburg, Q64 is Berlin.
LINKS = {
    "2911298": CityLinkRow(
        "2911298", "https://en.wikivoyage.org/wiki/Hamburg", "Q1055"
    ),
    "2950159": CityLinkRow("2950159", None, "Q64"),
}


def feature_file(directory: Path, points: list[tuple[float, float]]) -> Path:
    """A cache file in the shape `cache_pois` writes: a latitude and a longitude."""
    path = directory / "features.parquet"
    pq.write_table(
        pa.table(
            {
                "lat": [latitude for latitude, _ in points],
                "lon": [longitude for _, longitude in points],
            }
        ),
        path,
    )
    return path


def build_one(
    city: City,
    links: dict[str, CityLinkRow] | None = None,
    sitelinks: dict[str, int] | None = None,
    unesco: list[tuple[float, float]] | None = None,
    stations: list[tuple[float, float, int]] | None = None,
    tourism: dict[str, int] | None = None,
) -> CityMetric:
    """The metrics for one city, with every source empty unless a test says otherwise."""
    return build_metrics(
        cities=[city],
        links=links or {},
        sitelinks=sitelinks or {},
        unesco=unesco or [],
        stations=stations or [],
        tourism=tourism or {},
    )[0]


def test_reads_the_sitelink_count_of_the_citys_own_wikidata_item():
    metric = build_one(HAMBURG, links=LINKS, sitelinks={"Q1055": 230})

    assert metric.wikipedia_sitelinks == 230
    assert metric.wikivoyage_article is True


def test_a_city_whose_article_was_never_resolved_reports_no_sitelinks():
    # Berlin has sitelinks in the source, but the resolver found no article for
    # it, so there is no item to read them from and the count must not leak in.
    metric = build_one(BERLIN, links={}, sitelinks={"Q64": 241})

    assert metric.wikipedia_sitelinks == 0
    assert metric.wikivoyage_article is False


def test_a_city_with_an_article_but_no_wikivoyage_page_still_reports_its_sitelinks():
    metric = build_one(BERLIN, links=LINKS, sitelinks={"Q64": 241})

    assert metric.wikipedia_sitelinks == 241
    assert metric.wikivoyage_article is False


def test_counts_world_heritage_sites_within_thirty_kilometres_and_not_beyond():
    metric = build_one(
        HAMBURG,
        unesco=[(53.56, 9.99), (53.58, 10.02), (54.00, 9.99)],
    )

    # 1.1 km and 3.3 km are inside; 50 km is not.
    assert metric.unesco_sites == 2


def test_reads_the_count_of_mapped_features_the_cache_carries():
    metric = build_one(HAMBURG, tourism={"2911298": 42})

    assert metric.tourism_pois == 42


def test_counts_mapped_features_within_five_kilometres_and_not_beyond(
    tmp_path: Path,
) -> None:
    features = feature_file(tmp_path, [(53.56, 9.99), (53.59, 9.99), (53.60, 9.99)])

    counts = poi_counts([HAMBURG], [features])

    # 1.1 km and 4.4 km are inside the 5 km; 5.6 km is not.
    assert counts == {"2911298": 2}


def test_a_city_with_nothing_near_it_has_no_count_rather_than_a_zero(
    tmp_path: Path,
) -> None:
    features = feature_file(tmp_path, [(54.50, 9.99)])

    assert poi_counts([HAMBURG], [features]) == {}


def test_takes_the_category_of_the_nearest_classified_station():
    metric = build_one(
        HAMBURG,
        stations=[(53.56, 9.99, 3), (53.552, 9.993, 1)],
    )

    assert metric.db_station_category == 1


def test_leaves_the_station_category_empty_when_no_classified_station_is_near():
    metric = build_one(HAMBURG, stations=[(53.70, 9.99, 2)])

    # 16.7 km away, past the 10 km the category is claimed over.
    assert metric.db_station_category is None
