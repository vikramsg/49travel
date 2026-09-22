"""Resolve each city's English Wikipedia and Wikivoyage article.

A GeoNames id does not reliably name an article. The Wikidata item carrying
`P1566` (GeoNames id) is often a bot-created stub imported from GeoNames with no
sitelinks at all, so looking up an article by id finds the stub and misses the
article — Munich's `2867714` resolves to `Q32664319`, which has no articles,
while the article-bearing item is `Q1726`.

This asks each wiki for the page under the city's own name instead, follows the
normalisations and redirects, and keeps the page only when the article's own
coordinates land within `MATCH_RADIUS_KM` of the city. That drops disambiguation
pages and places that merely share a name.

A city whose article fails either test gets no link, and the map omits it. That
is deliberate: a missing link is a smaller lie than a link to somewhere else.

The result is committed, so the map never resolves a link at request time. Each
accepted Wikipedia article also brings its Wikidata item, the handle the metrics
build reads sitelink counts from — the item is already in the same response, so
recording it costs no extra request.
"""

from __future__ import annotations

import json
import urllib.parse
import urllib.request
from dataclasses import dataclass
from pathlib import Path

import pyarrow as pa

from trains.city import CITY_PARQUET, read_dataset, write_dataset
from trains.geo import haversine_km

WIKI_API = {
    "wikipedia_url": "https://en.wikipedia.org/w/api.php",
    "wikivoyage_url": "https://en.wikivoyage.org/w/api.php",
}

CITY_LINK_PARQUET = Path("data/trains/city_link.parquet")

# The MediaWiki API accepts 50 titles per query for anonymous callers.
TITLES_PER_REQUEST = 50

# How far an article's own coordinates may sit from the city it is claimed for.
# Wide enough for an article pinned to a city centre or a district, narrow enough
# that a same-named place elsewhere is rejected.
MATCH_RADIUS_KM = 25.0

USER_AGENT = "49travel-map-links/0.1 (https://github.com/vikramsg/49travel)"


@dataclass(frozen=True)
class CityPlace:
    """What an article match needs: a name to look up and a point to check."""

    city_id: str
    name: str
    latitude: float
    longitude: float


@dataclass(frozen=True)
class CityLink:
    """The articles found for one city, and the item the Wikipedia one is about.

    Either article may be absent. `wikidata_id` is the item the Wikipedia article
    is about, so it is absent exactly when the Wikipedia article is.
    """

    city_id: str
    wikipedia_url: str | None
    wikivoyage_url: str | None
    wikidata_id: str | None


@dataclass(frozen=True)
class _Article:
    """An article a wiki accepted, with the Wikidata item it is about."""

    url: str
    wikidata_id: str | None


def _query(api: str, params: dict[str, str]) -> dict:
    url = f"{api}?{urllib.parse.urlencode(params)}"
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(request, timeout=60) as response:
        return json.load(response)


def _final_title(name: str, followed: dict[str, str]) -> str:
    """The title a lookup lands on, through normalisation and redirects in turn."""
    title, seen = name, set()
    while title in followed and title not in seen:
        seen.add(title)
        title = followed[title]
    return title


def _articles(api: str, places: list[CityPlace]) -> dict[str, _Article]:
    """city_id -> article, for the places whose article passed both checks."""
    found: dict[str, _Article] = {}
    names = sorted({place.name for place in places})
    for start in range(0, len(names), TITLES_PER_REQUEST):
        chunk = names[start : start + TITLES_PER_REQUEST]
        payload = _query(
            api,
            {
                "action": "query",
                "format": "json",
                "formatversion": "2",
                "redirects": "1",
                "prop": "coordinates|info|pageprops",
                "inprop": "url",
                "titles": "|".join(chunk),
                "colimit": "max",
            },
        )
        query = payload.get("query", {})
        followed = {entry["from"]: entry["to"] for entry in query.get("normalized", [])}
        followed.update(
            {entry["from"]: entry["to"] for entry in query.get("redirects", [])}
        )
        pages = {page["title"]: page for page in query.get("pages", [])}

        # Every place is checked against its own coordinates, so two cities that
        # share a name cannot both claim the one article that is near either.
        for place in places:
            if place.name not in chunk:
                continue
            page = pages.get(_final_title(place.name, followed))
            if page is None or "missing" in page:
                continue
            if "disambiguation" in page.get("pageprops", {}):
                continue
            coordinates = page.get("coordinates") or []
            if not coordinates:
                continue
            distance = haversine_km(
                place.latitude,
                place.longitude,
                coordinates[0]["lat"],
                coordinates[0]["lon"],
            )
            if distance > MATCH_RADIUS_KM:
                continue
            found[place.city_id] = _Article(
                page["fullurl"], page.get("pageprops", {}).get("wikibase_item")
            )

        print(f"  {api}: {min(start + TITLES_PER_REQUEST, len(names))}/{len(names)}")

    return found


def resolve_city_links(places: list[CityPlace]) -> list[CityLink]:
    """One link record per place, in the order given."""
    articles = {column: _articles(api, places) for column, api in WIKI_API.items()}
    links: list[CityLink] = []
    for place in places:
        wikipedia = articles["wikipedia_url"].get(place.city_id)
        wikivoyage = articles["wikivoyage_url"].get(place.city_id)
        links.append(
            CityLink(
                city_id=place.city_id,
                wikipedia_url=wikipedia.url if wikipedia else None,
                wikivoyage_url=wikivoyage.url if wikivoyage else None,
                wikidata_id=wikipedia.wikidata_id if wikipedia else None,
            )
        )
    return links


def read_places(path: Path = CITY_PARQUET) -> list[CityPlace]:
    """The destinations the map draws, sorted by id."""
    places = [
        CityPlace(
            city_id=str(row["city_id"]),
            name=row["name"],
            latitude=row["latitude"],
            longitude=row["longitude"],
        )
        for row in read_dataset(path).to_pylist()
    ]
    places.sort(key=lambda place: place.city_id)
    return places


def city_link_table(links: list[CityLink]) -> pa.Table:
    return pa.table(
        {
            "city_id": [link.city_id for link in links],
            "wikipedia_url": pa.array(
                [link.wikipedia_url for link in links], pa.string()
            ),
            "wikivoyage_url": pa.array(
                [link.wikivoyage_url for link in links], pa.string()
            ),
            "wikidata_id": pa.array([link.wikidata_id for link in links], pa.string()),
        }
    )


def main() -> None:
    places = read_places()
    links = resolve_city_links(places)
    write_dataset(city_link_table(links), CITY_LINK_PARQUET)

    wikipedia = sum(1 for link in links if link.wikipedia_url)
    wikivoyage = sum(1 for link in links if link.wikivoyage_url)
    print(
        f"{len(links)} cities: {wikipedia} with a Wikipedia article, "
        f"{wikivoyage} with a Wikivoyage article -> {CITY_LINK_PARQUET}"
    )


if __name__ == "__main__":
    main()
