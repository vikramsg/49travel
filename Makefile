CITY ?=

define REQUIRE
  $(if $(value $(1)),,$(error $(1) is required))
endef

.PHONY: install test lint check run 

help:
	@echo "city_json - Get json for city. Requires CITY argument"


python_json:
	$(call REQUIRE,CITY)
	$(MAKE) -C python/batch/ city_json CITY=$(CITY)

	
city_json: python_json 
	@echo "Creating json for $(CITY)"
	@$(eval LOWERCASE_CITY := $(shell echo $(CITY) | tr '[:upper:]' '[:lower:]'))
	cp python/batch/data/$(LOWERCASE_CITY).json src/data 