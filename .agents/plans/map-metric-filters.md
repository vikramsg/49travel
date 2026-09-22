# Plan: a metric pipeline and the filters that read it

Status: `map-metrics-pipeline` implements the pipeline and `map-metric-filters`
the filters, stacked on `map-city-links`. **Once implementation starts, do not
edit this file** — record all changes in
`.agents/implementation-notes/map-metric-filters.md` instead.

## The ask

Two more PRs on top of the stack: one that builds the metrics, and one that shows
them. Each metric is exposed as its own filter. **No combined score** — not yet,
and not as part of this.

The metrics asked for, and the source each was suggested with:

| Metric | Suggested source |
|---|---|
| Wikivoyage presence and article status | Wikidata |
| Wikipedia sitelink count | Wikidata |
| UNESCO World Heritage Sites | Wikidata or OSM |
| OSM POI density | Overpass |
| DB station category | Deutsche Bahn |

## Shape it forced

| Question | Answer |
|---|---|
| One score, or separate columns? | Separate columns, one per metric, and one filter each |
| When is a metric computed? | Once, in the pipeline, and committed — never at request time |
| Where do the OSM features come from? | Each country's Geofabrik extract, read with DuckDB |
| What does "nearby" mean? | The pipeline's own radius per metric: 30 km, 5 km, 10 km |
| What if a metric is unknown for a city? | The filter that asks about it excludes the city; with no filter set, the city stays |
| Where do the bounds live? | One client-safe module, `lib/city-metric-filters.ts`, shared by the route, the SQL and the form |

## To-do list

1. Build `city_metric.parquet`: one row per city, one column per metric.
2. Join it into `/api/reachable` and accept one optional bound per metric.
3. Give the map one filter control per metric, with the active count visible.
4. Cover both with behavioural tests; document the sources, the radii and the
   coverage.
5. Run every check and test, verify the filters in a browser, then push both PRs
   and stack them.
