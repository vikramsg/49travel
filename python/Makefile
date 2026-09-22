CITY ?=

define REQUIRE
  $(if $(value $(1)),,$(error $(1) is required))
endef

.PHONY: check lint test city_json city_links city_metrics

help:
	@echo "check - run formatting, lint and type checks"
	@echo "lint - the same checks, fixing findings in place"
	@echo "test - run the tests"
	@echo "city_json - write the euro 49 JSON for CITY. Requires CITY argument"
	@echo "city_links - resolve every map city's Wikipedia and Wikivoyage article"
	@echo "city_metrics - one row of facts per city for the map's filters"

check:
	uv run ruff format --check
	uv run ruff check
	uv run ty check src tests

lint:
	uv run ruff format
	uv run ruff check --fix

test:
	uv run pytest

city_json:
	$(call REQUIRE,CITY)
	uv run python -m travel49.city_json --city=$(CITY)

# Needs network: it queries the two wikis. The Parquet it writes is committed, so
# the app never resolves a link at request time.
city_links:
	uv run python -m trains.links

# Needs network: Wikidata for the item counts and each country's OpenStreetMap
# extract. An extract is downloaded once, its matching coordinates are cached
# under `data/`, and the extract is then deleted. Only the per-city counts are
# committed, and only the extracts are cached — the Wikidata answers are read
# afresh on every build.
city_metrics:
	uv run python -m trains.metrics
