# Metric pipeline and filters — implementation notes

Plan: `.agents/plans/map-metric-filters.md`. The plan file is frozen; this file records what was built,
what was verified, and every decision not already agreed.

Two pull requests, stacked on the destination-links PR:

- `map-metrics-pipeline` — `city_metric.parquet`, one row of facts per city.
- `map-metric-filters` — one optional filter per metric, in the API and on the map.

## What the change had to achieve

Five metrics, each exposed as its own filter, with **no combined score**. The scoring step was explicitly
deferred, so nothing here weights one metric against another.

## Files produced

```
python/src/trains/metrics.py             builds the metric artifact
python/src/trains/geo.py                 haversine_km, and the radius index
python/data/trains/city_metric.parquet   one row per city, one column per metric
python/tests/test_metrics.py             the counting and the assembly
python/Makefile                          `make city_metrics`
python/src/trains/links.py               now also records the Wikidata item
lib/city-metric-filters.ts               the bounds, the parser and the "off" rule
lib/trains.ts                            joins the metrics and applies the bounds
app/api/[[...route]]/route.ts            reads and validates the five parameters
components/map-view.tsx                  one control per metric
AGENTS.md, docs/data_notes.md, .agents/UX.md
```

## Decisions not already agreed

Each item: the decision, why, and where it lives.

### 1. The OSM features come from Geofabrik extracts read by DuckDB, not from Overpass

- **Decision:** `tourism_pois` is counted from each country's Geofabrik `.osm.pbf`, read with DuckDB's
  `ST_ReadOSM`, instead of from Overpass queries.
- **Why:** the Overpass route was tried first and is recorded here because the reason matters.
  - It was asked for a radius around each of 4,922 cities, which is thousands of queries.
  - Batching by country still tripped Overpass's rate limit: the first attempt fetched Austria, Belgium and
    Switzerland and then answered **HTTP 429 Too Many Requests**.
  - `ST_ReadOSM` reads Luxembourg's 4.8 million elements in **0.1 s** and the tagged subset in 0.2 s, with no
    rate limit and no config file, because DuckDB parses the PBF directly instead of GDAL's OSM driver.
- **Where:** `python/src/trains/metrics.py` (`poi_sql`, `cache_pois`, `poi_counts`), `docs/data_notes.md`.

### 2. `quackosm` could not be installed, so DuckDB's own reader does the same job

- **Decision:** the pipeline depends on `duckdb` (with its `spatial` extension) and not on `quackosm`,
  although the ask named QuackOSM.
- **Why:** `uv add quackosm` fails on this project. QuackOSM depends on `geopandas`, which depends on
  `pyproj`, and **`pyproj` publishes no wheel for Python 3.14** — the project pins `requires-python = ">=3.14"`
  and CI installs that. `pyproj` therefore tries to build from source and stops at `proj executable not found`.
  Installing PROJ locally via Homebrew would fix this machine and still fail CI. DuckDB's `ST_ReadOSM` is the
  same idea QuackOSM is built on — DuckDB reading the PBF — so the pipeline got the behaviour without the
  dependency. **If QuackOSM specifically is wanted, the project's Python pin has to come down to 3.13.**
- **Where:** `python/pyproject.toml` (`duckdb`), `docs/data_notes.md`.

### 3. Ways are placed at the average of the nodes they reference; relations are not resolved

- **Decision:** nodes are read directly, a `way` is counted at the mean position of the nodes it joins, and a
  `relation` is left out.
- **Why:** `ST_ReadOSM` returns node coordinates but only element ids for ways and relations, so a way needs
  one hop and a relation needs two. Most tourist features are nodes or buildings, so the second hop buys a few
  multi-part sites rather than a class of places. Luxembourg confirms the scale of the loss: 1,004 tagged
  elements, 989 counted.
- **Where:** `python/src/trains/metrics.py` (`poi_sql`).

### 4. `amenity=restaurant` is deliberately not a tourism feature

- **Decision:** the POI tags are `tourism` in museum, attraction, viewpoint, gallery, zoo, theme park or
  aquarium, and `historic` in castle, archaeological_site or ruins.
- **Why:** the ask listed `amenity=restaurant` among its examples. Eateries are among the most mapped things
  in OpenStreetMap, so including them would swamp the count and turn the metric into food density rather than
  "things to go and look at", which is what the other four tags measure.
- **Where:** `python/src/trains/metrics.py` (`POI_TAGS`), `docs/data_notes.md`.

### 5. The radii are 30 km, 5 km and 10 km, and they are choices

- **Decision:** 30 km for a World Heritage Site, 5 km for a tourism feature, 10 km for the station whose
  category is used.
- **Why:** a World Heritage Site is often outside the town that serves it; a tourism feature is counted where
  it is walking distance from the centre; a station category belongs to a station, not to a town, so the
  nearest classified one is the station a traveller would use. Each is documented beside its constant, and
  none is derived from the data.
- **Where:** `python/src/trains/metrics.py`, `docs/data_notes.md`.

### 6. The Deutsche Bahn category comes from Wikidata `P5606`, listed by id

- **Decision:** `db_station_category` is read from `P5606` (class of station), restricted to the seven class
  ids `Q18681579`, `Q18681660`, `Q18681688`, `Q18681690`, `Q18681691`, `Q18681692`, `Q18681693`.
- **Why:** the ask named the DB categories without naming a source; `P5606` is the property that carries them,
  and it is used for per-country classes, so the ids are listed rather than the labels `"category 3 railway
  station"` parsed. 3,055 German stations carry it. A station's nearest classified neighbour within 10 km is
  used, because the pipeline's station ids are MOTIS regional ids (`de-rv_…`) and not DB codes, so there is no
  id to join on.
- **Where:** `python/src/trains/metrics.py` (`DB_STATION_CATEGORY`).

### 7. Wikipedia sitelinks are read from the item the article resolved, not from the GeoNames id

- **Decision:** `wikipedia_sitelinks` is `wikibase:sitelinks` for the item `city_link.parquet` recorded.
- **Why:** the GeoNames id does not name the article-bearing item — that was established for the links PR and
  is why the resolver goes by name. A sitelink count read from the GeoNames id's item would report 0 for
  Munich.
- **Where:** `python/src/trains/metrics.py` (`wikipedia_sitelinks`).

### 8. Wikivoyage article *status* is not built; presence is

- **Decision:** the Wikivoyage metric is "does an English Wikivoyage article exist", with no outline / usable /
  guide / star grade, although the ask named the status.
- **Why:** the status is not machine-readable. There is no Wikidata property for it — a property search for
  "Wikivoyage status" returns nothing, and the ask's suggested `P1151` is "topic's main Wikimedia portal",
  which is unrelated. The status is not in the article's lead section either: fetching the lead of Hamburg,
  Berlin, Munich, Lüneburg, Heide and Preetz returned page-banner templates only, and the talk pages are
  empty. Getting it would mean fetching and parsing article wikitext for a template that these articles do
  not carry in a findable position.
- **Where:** `python/src/trains/metrics.py`, `docs/data_notes.md`.

### 9. `links.py` now records the Wikidata item — a change to the PR below this one

- **Decision:** `city_link.parquet` gains a `wikidata_id` column, so the pipeline PR touches the resolver the
  links PR introduced.
- **Why:** the item is already in the API response the resolver reads (`pageprops.wikibase_item`), so recording
  it costs nothing, and the alternative was asking the two wikis for the same pages a second time from
  `metrics.py`. It also puts the item in the artifact that already exists to hold what was resolved from the
  article. `links.py` was re-run; the counts are unchanged (3,975 Wikipedia, 1,358 Wikivoyage).
- **Where:** `python/src/trains/links.py`.

### 10. Two counting mechanisms: the radius index for Wikidata's sets, DuckDB for OpenStreetMap's

- **Decision:** `geo.PointGrid` counts the World Heritage Sites and the stations; DuckDB counts the OSM
  features.
- **Why:** the Wikidata sets are 3,398 and 3,055 points, which the index handles in about a second; the OSM
  features run to hundreds of thousands per country, which is what DuckDB is for. `haversine_km` is shared by
  both. The alternative is doing all three in DuckDB, which would delete about eighty lines of index and its
  tests — flagged for review.
- **Where:** `python/src/trains/geo.py`, `python/src/trains/metrics.py`.

### 11. Every filter is a numeric bound, one per metric, and absent means unfiltered

- **Decision:** the API takes `minWikipediaSitelinks`, `minWikivoyageArticles`, `minUnescoSites`,
  `minTourismPois` and `maxDbStationCategory`. Each is optional. A blank or absent bound asks nothing of its
  metric; `0` means the same as absent; the station category has no `0`, so only absent means unfiltered.
- **Why:** uniform parameters are one validation rule instead of five, and a bound is what a threshold metric
  actually is. `activeMetricBound` is the single place the "off" rule lives, so the SQL, the query string and
  the form cannot disagree about what an unfiltered metric looks like.
- **Where:** `lib/city-metric-filters.ts`.

### 12. A filter that asks about a metric excludes a city with no value for it

- **Decision:** once a metric is filtered, a city the pipeline has no value for is dropped. With no filter, it
  stays.
- **Why:** the join is a `LEFT JOIN` and every clause is omitted at its "off" value, so a city with no row is
  only reached by a comparison against NULL, which is not true. For the station category this is the intent:
  the category is Deutsche Bahn's, so setting it hides every city outside Germany, which is what "hide the
  small stops" means.
- **Where:** `lib/trains.ts` (`destinationsBetween`).

### 13. The form is number inputs with one Apply, and the filters are named when the map empties

- **Decision:** one number input per metric with the metric's label, `Clear` beside `Apply filters`, a visible
  count of active filters, and an empty result that says the filters are why.
- **Why:** it reuses the primitives that exist (`Input`, `Label`, `Button`) and the pattern the travel-time
  form already set, where a half-typed bound applies only on submit. Naming the filters matters because
  "widen the range" is wrong advice when a filter emptied the map.
- **Where:** `components/map-view.tsx`, `.agents/UX.md`.

### 14. No metric value is shown on a destination, and no filter is on by default

- **Decision:** the popup is unchanged, and the map opens unfiltered.
- **Why:** the ask was to show the *filters*. The ask also mentioned a default threshold ("keep the map
  clean"), but every threshold it suggested is a score, and the score was deferred. Both are recorded as
  review questions rather than guessed at.
- **Where:** `components/map-view.tsx`.

### 15. Every filter ceiling sits above the largest value the artifact holds

- **Decision:** the ceilings are 400 language editions, 40 World Heritage Sites and 1,000 mapped features;
  the station category keeps its natural 1–7.
- **Why:** the first values written were 300, 10 and 2,000 — round numbers chosen before the artifact
  existed. Once it did, two of them turned out to be **below** the data: Paris has 366 language editions and
  one city has 39 World Heritage Sites within 30 km. So the strongest filter the data supports could not be
  asked for, and the test that a filter can empty the map would not have emptied it. Each ceiling is now
  above today's maximum, and the comment beside it records what that maximum is.
- **Where:** `lib/city-metric-filters.ts`.

## Verification

| Check | Result |
|---|---|
| `make -C python lint` / `check` | clean (ruff format, ruff check, `ty`) |
| `make -C python test` | 42 passed |
| `npm run lint` | clean |
| `npm test` | 44 passed, 3 files |
| `npm run build` | clean |
| `ST_ReadOSM` on Luxembourg | 4.8M elements in 0.1 s; 989 tourist features in 0.4 s |
| `make -C python city_metrics` | 1 minute 7 seconds; 341,082 features cached across 11 countries |

The OSM step, per country: AT 13,925 · BE 7,411 · CH 11,837 · CZ 14,000 · DE 93,211 · DK 30,231 ·
FR 74,832 · IT 55,265 · LU 989 · NL 10,435 · PL 27,874.

### What the artifact holds

4,922 cities. 1,358 have a Wikivoyage article, 2,631 are within 30 km of a World Heritage Site and 1,355
have a station category — all of them German, since the category is Deutsche Bahn's. Every city has a
sitelink count and a feature count, 0 when nothing was found. The largest values are Paris's 366 language
editions, 39 World Heritage Sites near one city, and 869 mapped features within 5 km of one city.

The site and station figures are 126 and 14 higher than the first build produced. The review section below
has the reason, and it was a real defect rather than a rounding.

### API, against a production build

From Hamburg over 0–6 h: **976** destinations with no filter — the same 976 as before the metrics existed,
so the join changes nothing until a filter asks it to. Each filter alone: 80 with 100+ languages, 373 with
a Wikivoyage article, 456 near a World Heritage Site, 45 with 100+ mapped features, 341 at station category
4 or better. All five together: 14. A 400-language bound: 200 with no destinations. Four bad bounds —
`maxDbStationCategory=8`, `maxDbStationCategory=0`, `minTourismPois=many`, `minUnescoSites=-1` — all 400,
each naming its own parameter.

### Browser, before the sidebar rework

All five controls render. Applying three of them narrows the map to 49 destinations, the status line says
"narrowed by 3 filters", and the map itself states "Showing destinations with Wikipedia languages at least
100; Wikivoyage articles at least 1; Station category at most 4." An impossible bound leaves the origin alone
on the map, and the status names the filters as the cause rather than suggesting a wider range. A
non-numeric bound reports "Mapped sights nearby must be a whole number", marks only its own input
`aria-invalid`, and points only that input at the message. Nothing overflows at 375 px. Evidence:
`.agents/baseline/map-filters-applied-desktop.png`, `map-filters-rejected-desktop.png`,
`map-filters-mobile.png`.

### Browser, after the sidebar rework

On a fresh load: "103 destinations between 0 h and 6 h of Hamburg, narrowed by 2 filters", the map stating
"Showing destinations with Wikipedia languages at least 60; Mapped sights nearby at least 50", 104 markers,
the origin selector and the travel-time band both in the sidebar and visible, the button reading "Advanced
filters · 2 on" and collapsed with `aria-expanded="false"`, no filter input rendered, and "Show all
destinations" visible without opening it. Opening the button sets `aria-expanded="true"` and prefills exactly
`minWikipediaSitelinks=60` and `minTourismPois=50`, with the other three blank.

"Show all destinations" returns the unfiltered set: 976 destinations and 977 markers, measured on an earlier
build of the same handler. Nothing overflows at 375 px, where the sidebar stacks above the map. Evidence:
`.agents/baseline/map-sidebar-default-desktop.png`, `map-sidebar-advanced-desktop.png`,
`map-sidebar-mobile.png`.

Two mistakes of my own are worth recording, because each made a check pass that should not have. The first
verification run served a build from before the default changed, so it reported the single-metric default
that had already been discarded. The second probed `aria-expanded` on the origin combobox rather than on the
new button, so "collapsed" and "expanded" were read from the wrong element. Both were harness errors rather
than product ones, and both were caught by reading the numbers instead of trusting the probe.

### 16. The map opens on a measured "popular" default; the API does not

- **Decision:** the map's first view applies `minWikipediaSitelinks = 60` and `minTourismPois = 50`. The
  other three metrics start off, and `/api/reachable`'s own default stays unfiltered.
- **Why:** every filter being off meant the first thing a visitor saw was all 976 stops the default range
  reaches, which is a wall rather than an answer. Two metrics narrow it, in the order asked for: Wikipedia
  language editions first — the broad "is this place known at all" cut — and then mapped sights, which keeps
  the ones with something to see. Neither number is picked: 60 leaves 227 of Hamburg's 976 and 228 of
  Berlin's 1032, and adding the 50-sight cut leaves **103** and **98**, so the pair lands on the ~100 asked
  for. The API keeps its unfiltered default because a caller asking for a band should get the band; only the
  map chooses to open narrow.
- **Where:** `lib/city-metric-filters.ts` (`DEFAULT_METRIC_FILTERS`), `components/map-view.tsx`.

### 17. The controls moved to a left sidebar, and the five metrics behind one button

- **Decision:** a left sidebar holds the origin selector and the travel-time band, always visible, with the
  five metric filters behind an "Advanced filters" button. Collapsed, the applied filters still apply and a
  "Show all destinations" button drops back to unfiltered. Below `lg` the sidebar stacks above the map.
- **Why:** the origin and the range are the map's own two controls, and hiding them behind a disclosure would
  make the map's state invisible. The five metrics are the optional layer, so they fold away; a button rather
  than a tab because there is nothing else to switch between. "Show all destinations" is there because
  opening narrow must not be a dead end, and it is visible without opening the button so the escape is always
  one click away.
- **Where:** `components/map-view.tsx`, `components/metric-filter-panel.tsx`, `.agents/UX.md`.

### 18. The filter form became its own component

- **Decision:** `components/metric-filter-panel.tsx` holds the five inputs, the button, and the form's draft
  text and error state. `MapView` keeps only the applied filters, the request and the map.
- **Why:** the draft must not redraw the map, so nothing outside the form needs to see it — which made the
  panel a natural unit. It also keeps `map-view.tsx` about the map as the sidebar markup grows it.
- **Where:** `components/metric-filter-panel.tsx`.

## Review

A background reviewer read both commits. Its two findings are below, with what was done about each, and so
are the simplifications it tried and could not make.

### Accepted

| Finding | What changed |
|---|---|
| `geo.PointGrid` worked out its cell reach from the 111 km a degree of latitude is and used that one number for longitude too, so at northern latitudes it looked too few cells east and west and dropped points that were inside the radius | The two axes are now reached separately, the longitude one scaled by the cosine of the latitude. It was not a theoretical gap: rebuilding found **126 more** cities within 30 km of a World Heritage Site (2,505 → 2,631) and **14 more** with a station category (1,341 → 1,355). Two tests pin the boundary at 57 degrees north, and the comment claiming a narrower longitude window "only shrinks the candidate set" is gone — shrinking the candidate set before the exact test *is* the defect, because the test cannot recover a point it is never offered |
| The `city_metrics` comment in the Makefile still described one Overpass query per country and claimed both sources were cached, when the build downloads Geofabrik extracts and re-reads Wikidata on every run | Rewritten to say what the build actually does |

The east/west reach was also the one finding that changed committed data, so the artifact was rebuilt and
both branches re-verified: 44 frontend tests, the API unchanged at 976 unfiltered, and the two affected
filters recounted at 456 and 341.

### Simplifications the reviewer tried and rejected

- **Counting the World Heritage and station sets in DuckDB as well**, which would delete `PointGrid`.
  Rejected: the split is reasonable — OpenStreetMap needs DuckDB and is large, the Wikidata sets are small
  and pass into `build_metrics` as ordinary data — and moving them would add spatial setup for two otherwise
  simple metrics. Fixing the reach was the smaller, safer change.
- **Removing `geo.haversine_km`.** Rejected: it is genuinely shared by `links.py` and the in-memory metric
  distances.
- **Collapsing `lib/city-metric-filters.ts`.** Rejected: the spec table is what keeps the browser labels, the
  server parsing and the off-rule aligned, and a smaller version would repeat one of those in three places.
- **Sharing the metric form with the travel-time band form.** Rejected: the band's bounds are coupled and
  apply continuously through its slider, while the metrics are independent and apply only on submit.

### Checked and found correct

SQL parameter order and the `LEFT JOIN` semantics the comments claim; filter independence with no score;
`lib/city-metric-filters.ts` staying client-safe with `lib/trains.ts` as its only server consumer; the Python
`trains` package not reaching into `travel49`; the three artifacts each holding 4,922 unique city ids; and
the new form's labels, `aria-invalid`, `aria-describedby` and `role="alert"`.

## What to review

1. **Decision 2 — `quackosm` was not used.** The ask named it and the reason is a Python-version wall in
   `pyproj`. Decide whether to lower the project's Python pin to 3.13 for it, or to accept DuckDB's reader.
2. **Decision 1 and 4 — the OSM metric itself.** The tag set leaves out `amenity=restaurant`; the radius is
   5 km; ways are placed at a mean and relations are skipped. Any of these changes what the number means, and
   the number is the whole of the filter.
3. **Decision 8 — no Wikivoyage grade.** This is the one asked-for metric that is not built, because the
   grade is not machine-readable. Decide whether to drop it, or to pay for wikitext parsing.
4. **Decision 10 — two counting mechanisms.** Unifying on DuckDB would delete `PointGrid` and its tests.
5. **Decision 12 — non-German cities vanish when the station filter is set.** That is the consequence of a
   German-only metric; decide whether the filter should instead apply only within Germany.
6. **Decisions 16 and 17 — what "popular" means, and where the line is.** The map opens on two metrics,
   Wikipedia language editions and then mapped sights. Decide whether that pair is right, whether the cuts
   should be the measured 60 and 50, and whether the map should open narrow at all — and check the sidebar
   reads well at desktop width as well as at 375 px.
7. **Decision 9 — a resolver change inside the pipeline PR.** It belongs to the PR below it in the stack.
8. **The coverage numbers.** How many cities get each metric is a data question, not a code question, and the
   numbers are in `docs/data_notes.md`.
