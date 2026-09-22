CITY ?=

define REQUIRE
  $(if $(value $(1)),,$(error $(1) is required))
endef

.PHONY: check lint test city_json city_links

help:
	@echo "check - run formatting, lint and type checks"
	@echo "lint - the same checks, fixing findings in place"
	@echo "test - run the tests"
	@echo "city_json - write the euro 49 JSON for CITY. Requires CITY argument"
	@echo "city_links - resolve every map city's Wikipedia and Wikivoyage article"

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
