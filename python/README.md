# Python pipeline

The batch pipeline behind 49travel. It reads the committed seed database and
writes the JSON the €49 origin pages are built from.

## Install

The project uses [uv](https://docs.astral.sh/uv/), which also manages the Python
version (see `.python-version`).

```
uv sync
```

## Checks

Formatting, lint and type checks, with [ruff](https://docs.astral.sh/ruff/) and
[ty](https://docs.astral.sh/ty/):

```
make check
```

To fix formatting and lint findings in place:

```
make lint
```

## Tests

```
make test
```

## Run

Write the €49 JSON for one city:

```
make city_json CITY=Hamburg
```

The city must match `cities.city` exactly and case-sensitively. The output lands
in `data/travel49/hamburg.json`.

## Data

- `data/travel49/cities.sqlite` — the seed database. Committed, and the source of
  truth for the €49 origin pages. It holds `cities`, `cities_lat_lon`, `city_stops`
  and the per-origin `{City}_journeys` tables. `city_json` writes a derived
  `{City}_destinations` join table into it as it runs.
- `data/travel49/*.json` — generated, one per origin city.

The feeds, their sources and their licences are documented in
[`../docs/feeds.md`](../docs/feeds.md), and what the produced numbers mean in
[`../docs/data_notes.md`](../docs/data_notes.md).

## Archive

`archive/` holds dead code kept for history: the old `v6.db.transport.rest`
scraper, the WikiVoyage/LLM scraper and the pyhafas journey search. It is
excluded from ruff and ty, and it no longer imports cleanly, because the models
it depended on are gone.
