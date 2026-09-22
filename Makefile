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

# The Next app imports the generated JSON from python/data/travel49 directly,
# so there is no copy step: regenerating the file is what the app reads.
city_json: python_json
	@echo "Created json for $(CITY)"
