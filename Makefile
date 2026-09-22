CITY ?=

define REQUIRE
  $(if $(value $(1)),,$(error $(1) is required))
endef

.PHONY: help python_json city_json

help:
	@echo "city_json - Get json for city. Requires CITY argument"

python_json:
	$(call REQUIRE,CITY)
	$(MAKE) -C python/ city_json CITY=$(CITY)

city_json: python_json
	@echo "Creating json for $(CITY)"
	@$(eval LOWERCASE_CITY := $(shell echo $(CITY) | tr '[:upper:]' '[:lower:]'))
	cp python/data/travel49/$(LOWERCASE_CITY).json src/data
