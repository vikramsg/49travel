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
	@echo "run - run game"

check:
	./static_checks.sh

lint:
	./linter.sh
	
install:
	poetry install --no-root
	poetry shell

city_journeys:
	$(call REQUIRE,CITY)
	poetry run python -m src.destinations --run-type=journeys_from_origin --city=$(CITY)