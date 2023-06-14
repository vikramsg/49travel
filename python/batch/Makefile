CITY ?=

define REQUIRE
  $(if $(value $(1)),,$(error $(1) is required))
endef

.PHONY: install test lint check run 

help:
	@echo "install - install dependencies with poetry"
	@echo "test - run unit tests"
	@echo "lint - run linter and checks"
	@echo "check - run static checks"
	@echo "city_json - Get json for city. Requires CITY argument"

check:
	./static_checks.sh

lint:
	./linter.sh
	
install:
	poetry install --no-root
	poetry shell

city_journeys: install
	$(call REQUIRE,CITY)
	poetry run python -m src.destinations --run-type=journeys_from_origin --city=$(CITY)
	
city_json: city_journeys
	$(call REQUIRE,CITY)
	poetry run python -m src.city_json --city=$(CITY)