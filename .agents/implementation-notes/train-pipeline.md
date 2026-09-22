# MOTIS pipeline — implementation notes (layer 2)

Stack layer 2. Plan: `.agents/plans/map-tab-nextjs-migration.md`, Phase 2. The plan
file is frozen; this file records what has actually been verified and every
decision that was not already agreed.

## What was built

- `python/src/trains/motis.py` — HTTP client for the local MOTIS server.
- `python/src/trains/city.py` — GeoNames city selection, station-to-city
  matching, both `city.parquet` and `city_station.parquet`.
- `python/src/trains/travel_time.py` — the measurement loop and
  `travel_time.parquet`.
- `python/justfile` — corrected engine/feed/import/server recipes.
- `docs/data_notes.md` — reference doc for the produced dataset.
- `python/tests/test_city.py`, `python/tests/test_travel_time.py`.

Produced and committed, after the position rule of decision 21 was applied and
the measurement re-run over the regenerated `city_station`:

| file | rows | size |
|---|---|---|
| `python/data/trains/city.parquet` | 4,922 | 167 KB |
| `python/data/trains/city_station.parquet` | 10,137 | 129 KB |
| `python/data/trains/travel_time.parquet` | 145,885 | 264 KB |

The first measurement (7 feeds) ran in 3 m 28 s over 82 origins — 410 calls. The
second (10 feeds) ran in 6 m 28 s over 96 origins — 480 calls, and the re-run
after decision 21 was a third pass of the same size. Hamburg sanity is unchanged:
Berlin 134 minutes (2 h 14 m), Munich 350 minutes (5 h 50 m).

## How MOTIS is run here

MOTIS v2.11.3 publishes `motis-linux-amd64`, `motis-linux-arm64`,
`motis-macos-arm64` and `motis-windows`. There is **no macOS x86_64 build**, and
this machine is an Intel Mac, so the engine runs as the linux/amd64 binary inside
Docker:

```
docker run --rm -v "$PWD/.motis":/data -w /data debian:bookworm-slim ./motis <command>
```

The binary is dynamically linked against glibc; `debian:bookworm-slim` is enough,
and no MOTIS Docker image is published. Verified: `config`, `import` and
`server` all work this way, and the Aachen dataset from `motis-project/test-data`
imports and serves.

## The plan's open question is answered: `one-to-many` does not help

The plan said: "If v2.11.3 exposes it, `travel_time.py` uses it and skips the whole
station-to-city reduction for destinations."

`/api/v1/one-to-many` exists in v2.11.3, but it is **street routing only**. Its
`mode` parameter accepts `WALK`, `BIKE` or `CAR`, and the summary reads "Street
routing from one to many places or many to one". It cannot answer a public
transport question.

The transit endpoint is `/api/v6/one-to-all`, operation id `oneToAll`. So the
plan's fallback path is the only path, and the stop-to-city reduction is
required. The "~44 GB of responses" in the plan's risk list is real in volume but
not in time: a 720-minute sweep from Hamburg is a 37 MB response in about 2 s.

## Verified request and response shape

```
GET /api/v6/one-to-all
      ?one=<stop id or lat,lon>
      &time=<ISO 8601>
      &maxTravelTime=<minutes>
      &arriveBy=false
```

Response:

```json
{
  "one": { "place": { ... }, "duration": 0, "k": 0 },
  "all": [
    { "place": { "name", "stopId", "lat", "lon", "level", "arrival", "modes", "vertexType" },
      "duration": 120, "k": 2 }
  ]
}
```

- `duration` is in **minutes**. Confirmed: a 720-minute request returns a maximum
  duration of 720.
- `duration` **includes waiting at the origin**. The origin's own entry has
  `duration: 0` and an `arrival` equal to the requested departure time, so the
  clock starts when you reach the origin platform.
- `k` is the number of connections used.
- One entry per reachable stop, not per city, so the stop-to-city reduction is
  required for destinations too.

`one=lat,lon` returns **zero** entries with this GTFS-only import: with no street
network and no geocoding there is nothing to snap coordinates to. The departure
has to be a stop id.

## Two things that will silently waste a run

**1. The 12-hour cap must be configured before importing.** `maxTravelTime` is
capped at 90 minutes by default and rejected above that. The cap is raised in
`config.yml`:

```yml
limits:
  onetoall_max_travel_minutes: 720
  onetoall_max_results: 250000
  routing_max_timeout_seconds: 600
```

Two traps here. It is under a `limits:` section, not top level, and MOTIS parses
the config with `drop_trailing`, so a misplaced key is **silently discarded**
rather than reported. And `import` snapshots `config.yml` into `data/config.yml`,
which is the copy `server` actually reads — so setting the limit after importing
has no effect until the import is re-run. Both traps cost real time to find.

**2. `onetoall_max_results` defaults to 65535.** An 11-country sweep will exceed
that, so it is raised above.

## OSM is dropped: the build is GTFS-only

MOTIS imports and routes with **no `osm.pbf` at all**. `motis config` given only
GTFS zips generates a config with no `osm:` key, `street_routing: false`,
`geocoding: false` and `reverse_geocoding: false`, and `import` and `server` both
work.

What OSM buys, measured on the Aachen dataset by running the same query against an
OSM+GTFS instance and a GTFS-only instance:

- Same stop coverage: 6087 reachable stops either way, same 710-minute maximum.
- 415 stops (6.8%) differ, and **GTFS-only is never faster**, only equal or slower:
  mean penalty 14.1 minutes, maximum 30.
- Cause: OSM lets MOTIS route a walking path between two nearby stops. Without it
  MOTIS can only use transfers the feed declares, so it can miss a walking transfer
  and wait for a later departure.

Setting `extend_missing_footpaths: true` changes nothing, because extending a
footpath still requires a street network to route it on. There is no OSM-free way
to recover this in MOTIS.

**Decision: walking-transfer accuracy is not a requirement.** The measurement is
station to station and the feature answers "reachable within X hours"; a walking
leg inside a city is noise at that scale. So the OSM build is dropped entirely.

That removes roughly 14.5 GB of downloads and, more importantly, the memory wall.
Measured peak import memory:

| dataset | peak RSS |
|---|---|
| Aachen, OSM + GTFS | 1925 MiB |
| Aachen, GTFS only | **99 MiB** |
| Netherlands, OSM only | 5125 MiB |

The OSM path needs very roughly 2.4 MiB of RAM per MB of `osm.pbf`, so the merged
11-country extract would have needed on the order of 34 GB. The GTFS-only path is
two orders of magnitude smaller and fits the 7.77 GB container comfortably. The
11-country GTFS-only import peaked at 6.0 GiB and took 2 m 13 s.

Note the direction of the remaining error: dropping OSM makes times **pessimistic,
never optimistic**, so the map will under-report reachability at the margin rather
than promise a trip that cannot be made. That is the safe direction for this
feature, and it is the same order as the ~10-minute overstatement the plan already
accepts from the 5-point sampling grid.

## Stop catalogue without geocoding

`geocoding: false` means `/api/v1/geocode` is unavailable, so stops come from
`GET /api/v1/map/stops?min=<lat,lon>&max=<lat,lon>`, which returns a list of
`{name, stopId, lat, lon, level, vertexType, modes}`. Verified against the
11-country graph: 136,347 stops.

The endpoint rejects a box with too many stops with **HTTP 422 and
`{"error":"too many stops"}`** rather than truncating, so `motis.all_stops` splits
the box in four until every part is accepted. The full catalogue is 77 requests
and 1.5 s.

`modes` is not a reliable statement that a stop serves long-distance trains:
`Hamburg, Hamburg Hbf` reports `REGIONAL_RAIL` and still answers a query whose
first leg is an ICE, because MOTIS merges the stop across the `de-fv` and `de-rv`
feeds. `modes` was therefore used only to keep rail (including S-Bahn) stops in
and to drop bus-, tram- and ferry-only stops.

## Decisions not already agreed

1. **`city_id` is the GeoNames id, not a name slug.**
   Why: the plan's API examples use strings like `"hamburg"`, but no slug rule is
   defined, and deriving one from names collides for 82 of the 4,922 cities
   (three `Neunkirchen`, three `Münster`, `Baden` in AT and CH, and so on). The
   GeoNames id is unique and stable across dumps; a disambiguated slug would be
   neither readable nor stable.
   Where: `city.py`, `City.city_id`.

2. **Station-to-city is a name match, not a nearest-stop assignment.**
   Why: a proximity rule gave the station of a big city to whichever inner
   district was a metre closer (Wrocław Główny to Przedmieście Świdnickie,
   Antwerpen-Centraal to Borgerhout, Paris Est to Paris 10), which dropped the
   parent city's data entirely. Matching the city's name (name, ASCII name and
   GeoNames alternate names, so `Wien` reaches Vienna) against the station name
   keeps the station with the city it is named after, and the nearest match wins
   when a name carries several cities. Stops that match nothing are dropped,
   which loses a station rather than attaching it to the wrong city.
   Where: `city.py`, `stations_by_city`, `_name_index`, `_nearest_matching_city`.

3. **A 30 km cap on a station match.**
   Why: a city's alternate-name list contains other places' names (Vienna's
   includes `Bienne`), so name matching alone can attach an unrelated far station
   to a city. A station named after its city is within a few kilometres of it, so
   the cap removes the coincidences without dropping real matches. The largest
   real distance in the data is the 12 km from Frankfurt to its airport station.
   Where: `city.py`, `MAX_STATION_DISTANCE_KM`.

4. **Alternate names with fewer than three letters in total and names
   containing digits are dropped from matching.**
   Why: GeoNames alternates include transliterations and abbreviations (`rm` for
   Rome, `as` for Asse, `brn` for Bern) that match almost any station name.
   Where: `city.py`, `_name_keys`.

5. **The departure stop is chosen by a main-station word, then by platform
   count, then by the shortest name.**
   Why: GTFS marks no station as the main one, and picking the nearest to the
   city centre chose a suburban stop: Hamburg to Munich measured 405 minutes from
   Jungfernstieg against 351 from Hamburg Hbf. The word list covers the languages
   of the imported feeds. It is imperfect in a few of the 96 measured origins:
   Geneva resolves to `Genève-Aéroport`, Turin to `Torino Lingotto` and Łódź to
   `Łódź Kaliska`. Rome looks like a fourth but is not a word-list problem: no
   Italian feed is imported, so `Roma Termini` is absent from the stop catalogue
   and both of Rome's stations are `Roma Tiburtina` under different spellings.
   Where: `city.py`, `MAIN_STATION_WORDS`, `choose_origin_stop`.

6. **The measurement day is a constant, not "today".**
   Why: it must fall inside the imported feeds' validity, and a re-run of the
   same import has to reproduce the same numbers and the same metadata. Set to
   2026-09-22, the date the plan's API contract uses.
   Where: `travel_time.py`, `MEASUREMENT_DATE`.

7. **One timezone for every origin.**
   Why: all 11 countries keep CET/CEST, so `Europe/Berlin` represents local time
   for every sampled departure and a per-country zone table would add nothing.
   Where: `travel_time.py`, `SAMPLE_TIMEZONE`.

8. **The origin is written as its own destination with `minutes` 0.**
   Why: the station-to-city reduction maps the origin's own stop to the origin
   city, and the plan's API contract returns the origin inside `cities` so the
   map can mark it distinctly. 82 such rows exist, all 0.
   Where: falls out of `travel_time.py`, `minutes_by_city`; no special case.

9. **Origins with no station are reported and skipped, not fatal.**
   Why: 21 of the 103 origins have no station in this feed set, and aborting
   would produce no dataset at all. The run prints them so the gap is visible.
   See "What the brief got wrong" below.
   Where: `travel_time.py`, `main`.

10. **The origin set is recomputed from `city.parquet`, not stored.**
    Why: the plan's `city` table has no origin column, so `travel_time.py` calls
    `origin_city_ids` on the same data rather than adding a fourth artefact.
    Where: `travel_time.py`, `main`; `city.py`, `origin_city_ids`.

11. **Parquet reading, writing and the 10 MB cap live in `city.py`.**
    Why: the brief specifies exactly three modules. `travel_time.py` already
    imports `city.py` for the origin rules, so the shared IO sits there instead of
    in a fourth module or duplicated in both.
    Where: `city.py`, `write_dataset`, `read_dataset`, `MAX_PARQUET_BYTES`.

12. **The GeoNames dump is downloaded by `city.py` into a gitignored
    `python/data/geonames/`.**
    Why: the recipe list in the brief has no GeoNames recipe, and the dump is a
    build input that must not be committed. Downloading inside the module keeps
    `just city` a single command and keeps `python -m trains.city` runnable.
    Where: `city.py`, `geonames_dump`; `.gitignore`.

13. **The feed set was left at the seven imported feeds in the first pass.**
    Why: the brief states the seven as the working state and the graph as already
    imported. The justfile is corrected for the two real defects — `de_fv` /
    `de_rv` filenames (a dataset id may not contain `_`) and the ÖBB archive's
    nested directory (an unflattened feed imports as an empty dataset without an
    error) — and keeps those seven. Superseded by decision 15, which adds the
    Luxembourg, Belgian and Danish feeds.
    Where: `python/justfile`.

14. **`python/Makefile`, the root `Makefile` and `AGENTS.md` are untouched.**
    Why: the plan's Phase 2 line about replacing the Makefiles with `just` would
    remove `make city_json`, which the €49 pages still need until layer 3 lands;
    the brief's deliverable list does not include them, and Phase 4 owns the
    `AGENTS.md` update. The Parquet path (`python/data/trains/`) does not interact
    with the Makefiles' `cp … src/data` step, which copies the €49 JSON.
    Where: not changed; flagged for the orchestrator.

15. **Added the `lu`, `be` and `dk` national feeds.**
    Why: they recover 14 of the 21 origins that had no station — six Belgian,
    six Danish and two Luxembourg communes — and add 266 destination cities. The
    import goes from 7 to 10 datasets.
    Where: `python/justfile`, `motis-data` and `motis-import`; `docs/feeds.md`.

16. **The Belgian feed is the iRail community mirror, not the official channel.**
    Why: `data.belgianmobility.io` answers 403 without an
    `Ocp-Apim-Subscription-Key`, so the official SNCB feed cannot be fetched
    unattended. The iRail mirror carries the same NMBS/SNCB data under CC BY 4.0
    with attribution.
    Where: `python/justfile` (comment above the `be` download); `docs/feeds.md`.

17. **Denmark's licence position is recorded, not assumed.**
    Why: Rejseplanen Labs licenses the feed for non-commercial use only and asks
    for attribution. That constraint has to be visible before derived Danish data
    is published.
    Where: `docs/feeds.md`, "Attribution".

18. **The Dutch feed now comes from OVapi, and every download uses `curl -f`.**
    Why: re-running `motis-data` hit `gtfs.openov.nl` with HTTP 429, and
    `curl -sSL` saved the 117-byte HTML error page under `nl.zip` — a silently
    broken feed that the import would then have ingested. `gtfs.ovapi.nl` serves
    the same NDOV national timetable and does not rate-limit the same way. `-f`
    and two retries were added to every download so an HTTP error stops the
    recipe instead of corrupting a feed.
    Where: `python/justfile`, the `curl_flags` variable and the `nl` download;
    `docs/feeds.md`.

19. **Italy stays uncovered, and the finding is recorded.**
    Why: there is no directly downloadable, account-free national Italian GTFS.
    The verified regional feeds (ANM Naples, AMAT Palermo, AMTAB Bari, AMT
    Liguria, FCE Catania) are local transit operators with no intercity rail, so
    they cannot make Naples, Palermo, Genoa, Bari or Catania reachable. Adding
    them would grow the stop catalogue without changing a single travel time.
    Where: `docs/feeds.md`, "Not imported"; `docs/data_notes.md`, "Coverage".

20. **`docs/feeds.md` now describes the ten feeds that are imported.**
    Why: it listed eleven rows, of which the Luxembourg entry was a CKAN
    metadata API rather than a file, the Belgian entry was a literal `<token>`
    placeholder that 404s, and the Danish entry was absent while its "Excluded"
    table wrongly called the country unrecoverable. France was listed as included
    but has never been in the graph.
    Where: `docs/feeds.md`.

21. **A station matches a city only when the city's name starts the station's
    name.**
    Why: the match used to accept a city name at any word position, so a city
    whose name also appeared as a region qualifier or as a later word took
    stations belonging to other places. Measured over the same catalogue of
    26,451 rail stops with only the matching rule changed: 386 stations move off
    a city that wrongly held them, across 196 cities; 39 move onto the city that
    owns them; and 54 cities are left with no station at all. Berlin is the
    largest single loss at 133, all `S … (Berlin)`, `S+U … (Berlin)` and
    `Flughafen BER` spellings that carry the city only inside the qualifier or
    behind a transit marker. The measurement is unchanged where it matters —
    Hamburg→Berlin 134 minutes, Hamburg→Munich 350 — because every city keeps the
    station that carries its name plainly.
    The alternative, accepting a qualifying or later word as the city, was
    rejected deliberately: nothing separates `S Adlershof (Berlin)`, which is
    Berlin's, from `Erzingen (Baden)`, which is not, and that is precisely the
    mechanism that produced H1. Every error that remains is pessimistic.
    Where: `city.py`, `_nearest_matching_city`.

22. **The city-district problem is documented rather than coded away.**
    Why: GeoNames gives some city districts a plain-city feature code and a name
    that does not contain their city's name, so neither the section-code list nor
    the reviewed name-prefix list reaches them. Two mechanical replacements were
    built and measured against the committed city set, and both were rejected.
    Sharing the parent city's `adm3` code removes 450 German and 511 French
    places, among them Villeurbanne, Roubaix and Tourcoing, which are cities in
    their own right. Also requiring a sub-`adm4` code removes 16 Belgian places,
    among them Schaerbeek, Ixelles and Anderlecht, which are **origins** of this
    dataset. Deleting origins to tidy up map markers is not a trade worth making,
    so the districts stay and `docs/data_notes.md` states what the count does and
    does not mean.
    Where: `docs/data_notes.md`; no code change.

23. **A completed measurement with no cross-origin row is refused before it is
    written.**
    Why: a `MEASUREMENT_DATE` outside the imported timetable is not an error to
    MOTIS. Probed on the running server with the committed graph, one-to-all for
    2027-06-15 and for 2026-01-05 both answer **HTTP 200** with a 14-entry `all`
    list — the origin's own stop area, every entry `k = 0`, no trip taken — and
    the origin stop is present with `duration` 0 (the later date) or 32588 (the
    earlier one, an offset from a time outside the calendar). So the origin is
    never absent, and a per-origin "nothing was reached" test is also unsafe:
    Marne La Vallée, Turin and Florence legitimately reach only themselves, at
    all five samples, on the valid measurement day. The only signal that
    separates a stale day from a valid one is at the whole-run level, so
    `require_a_reachable_destination` raises if no origin reached any place but
    itself, and `main` calls it before `write_dataset`. Without it a stale date
    would silently replace the committed dataset with an empty one.
    Where: `travel_time.py`, `MeasurementOutOfTimetableError`,
    `require_a_reachable_destination`, `main`.

## Concurrency

Decision: the measurement runs at most `MAX_IN_FLIGHT_REQUESTS = 4` one-to-all
requests at a time, submitted one task per origin through a
`ThreadPoolExecutor`.

Why 4: it is where the gain stops. With the ten-feed graph and Docker at 8 CPUs,
40 calls take 40.5 s at 4 in flight and 42.2 s at 8 — routing is single-threaded
per query and each response is tens of megabytes, so extra concurrency only adds
server memory. The number is a named constant with that reasoning beside it, not
a config knob, because there is exactly one caller and one machine.

Where: `travel_time.py`, `MAX_IN_FLIGHT_REQUESTS`.

Measured on the first graph (7 feeds): one 720-minute call from Hamburg Hbf takes
1.97 s and returns 170,397 arrivals; a batch of 4 origins × 5 samples = 20 calls
at concurrency 4 takes 17.6 s (0.88 s per call effective). The real run of 410
calls took 3 m 28 s. On the ten-feed graph a call costs about 1.0 s effective and
the 480-call run took 6 m 28 s.

## What the brief got wrong

1. **`city.parquet` has 4,922 rows, not 4,959.** 4,959 is the count after the
   section-code exclusion but *before* the reviewed 37-name exclusion list;
   applying the list subtracts 37 and gives 4,922. The brief's acceptance
   criterion asks for both "after the exclusions" and 4,959, which the data
   cannot satisfy at once. The plan (`Spike results`) quotes 4,959 for the
   pre-exclusion set, so 4,922 is the consistent reading.

2. **The origin set has 103 cities, not 110.** "The largest 10 per country"
   gives 110 only if every country has 10 cities above 10,000. Luxembourg has
   three (Luxembourg, Esch-sur-Alzette, Dudelange), so the set is 10 × 10 + 3 =
   103.

3. **The `lu`, `be` and `dk` feeds recover 14 origins, not 15, so 96 origins are
   measurable, not 97.** The three feeds work exactly as described and remove 14
   of the original 21 gaps — six Belgian (Anderlecht, Schaerbeek, Gent,
   Charleroi, Brugge, Namur), six Danish (Århus, Aalborg, Esbjerg, Randers,
   Horsens, Vejle) and two Luxembourg (Esch-sur-Alzette, Dudelange). Seven
   origins still have no station:
   - **Frederiksberg** (DK). The only rail stop in the municipality is
     `Peter Bangs Vej St.` (S-train, `SUBURBAN`), which does not carry the name
     Frederiksberg. Every stop that does carry it — `Frederiksberg St.`,
     `Frederiksberg Allé St.`, `Frederiksberg Runddel` — is `BUS` or `SUBWAY`,
     and SUBWAY is deliberately not rail. A name match cannot reach it without a
     proximity rule, which was rejected (decision 2).
   - **Naples, Palermo, Genoa, Bari, Catania.** Italy has no feed (decision 19).
   - **Eisenzicken** (AT). A GeoNames place with 54,353 inhabitants and no
     station; it ranks eighth in Austria by that figure.

4. **The justfile skeleton had a third defect beyond the two named.** The
   `docker run … -v "$$PWD":/data` lines passed `$$PWD` through to the shell,
   where `$$` expands to the shell's process id, so `$$PWD` became `<pid>PWD`
   and Docker mounted an empty directory. `./motis` was then "no such file or
   directory" inside the container. The fix is `"$PWD"`. `just motis-fetch`,
   `just motis-data` and `just motis-server` were exercised end to end after the
   fix.

## Also verified

- `/api/v6/stoptimes?stopId=…&time=…&n=…` works and pages with `pageCursor`,
  capped at `n=1024`; it was considered for picking a main station by departure
  count and dropped because the counts are per platform-level stop, not per
  station, and paging made it expensive.
- A name-slug `city_id` collides for 82 of 4,922 cities (see decision 1).
- The ten-dataset import peaked at **6287 MiB / 11.7 GiB**, with an 8-CPU,
  11.7 GiB Docker Desktop. The graph's timetable metrics show 10 datasets, all
  covering 2026-09-22: DE, AT, CH, NL, PL, CZ, BE, DK and LU.
- The stop catalogue grew from 136,347 stops / 9,547 rail stations in 2,144
  cities to 177,660 stops / 10,849 rail stations in 2,409 cities. The position
  rule of decision 21 then moved 386 of those stations off the cities that
  wrongly held them, leaving 10,137 rows over 2,355 cities.

## Review outcome

A reviewer read this layer against the plan and raised H1–H6 and L1–L6. Every one
was checked against the committed data or the running server before it was acted
on. Two proposed fixes rested on premises the evidence does not support and were
corrected rather than applied as written.

| Finding | Outcome |
|---|---|
| H1 a station attached to the wrong city | **Accepted, fixed.** Worse than reported: Swiss `Baden` held `Erzingen (Baden)` and `Erzingen (Baden) Bahnhof`, a German town, because `(Baden)` names the German region; `Baden-Baden` held `Bietigheim (Baden)`, `Bischweier (Baden)` and `Spielberg (Baden)`; `Opladen` held `Leverkusen Opladen Bf`. Fixed by decision 21. |
| H2 the city count is not a count of towns | **Accepted as a documented data-source limitation.** Confirmed at 18 Warsaw districts, 21 Wrocław, 12 Naples and one of Rome. An exclusion mechanism that is not hand-reviewed was **rejected** (decision 22): both mechanical rules built for it delete real towns and origins. `docs/data_notes.md` now says the count is places, not towns. |
| H3 `docs/feeds.md` overstated what was imported | **Accepted, fixed** by decision 20. Re-checked: the ten URLs in the table are exactly the ten the justfile downloads, and the French mirror is the only other URL, marked "Not imported". |
| H4 the coverage claims in `docs/data_notes.md` were wrong | **Accepted, fixed.** "Covered end to end" was false and is now a measured per-country table, verified against the committed `city_station.parquet`. The reviewer's own replacement numbers were wrong in the other direction (it named Munich as the maximum at 1,950); the data says Berlin, and the low end is three origins. |
| H5 enforce `MEASUREMENT_DATE` against feed validity | **Accepted in purpose, corrected in mechanism** (decision 23). The proposed guard cannot fire: probed on the running server, an out-of-validity date answers HTTP 200 with the origin present. A run-level guard was added instead, because that is the only signal that separates a stale day from a valid one. |
| H6 move the Aachen OSM-versus-GTFS measurement out of the reference doc | **Accepted, fixed.** `docs/data_notes.md` now states the contract and the consequence; the measured Aachen evidence lives only here. |
| L1 single-use `stops_in_bbox` | **Accepted, fixed.** Folded into `all_stops`. |
| L2 the minimum reduction written twice | **Accepted, fixed.** Both call sites use `_smallest_per_key`. |
| L3 move the Parquet read and write out of `city.py` | **Rejected.** The brief requires exactly three modules, and decision 11 records why the shared IO lives there. Moving it is churn with no behaviour change. |
| L4 an assertion that could not fail | **Accepted, fixed.** It asserted a stop id was absent from the fixture's own mapping; it now asserts that the unowned stop's 12 minutes reach no city. |
| L5 Rome is a fourth imperfect departure stop | **Accepted as context.** Not a word-list failure: no Italian feed is imported, so `Roma Termini` is absent and both of Rome's stations are `Roma Tiburtina`. Recorded in decision 5. |
| L6 two sources of truth for the 720-minute cap | **Accepted as unavoidable.** A justfile and a Python module cannot share a constant, and MOTIS refuses a `maxTravelTime` above the configured limit rather than silently shortening it. Both definitions now state the value and the unit beside them. |

The reviewer's `_corner` naming nit is fixed: the helper is `_format_corner`.

## What to review

- **The 386 stations the position rule moved, 133 of them Berlin's**
  (decision 21). This is the largest judgement in the layer. Look at Berlin's
  rows in `python/data/trains/city_station.parquet`. If losing the
  `S … (Berlin)` spellings is worse than the risk that comes with accepting a
  qualifier, say so there: the gain would be Berlin's S-Bahn coverage and the
  price a rule that cannot tell Berlin's `(Berlin)` from a German region's
  `(Baden)`.
- **The districts left in `city.parquet`** (decision 22). Decide whether the
  documented posture is right, or whether the reviewed exclusion list should be
  grown by hand for Warsaw, Wrocław, Naples and Rome.
- **The seven origins with no station**, now listed in "What the brief got
  wrong" item 3. Decide whether Frederiksberg is worth a proximity rule, whether
  Eisenzicken should join the exclusion list, and whether the map's origin
  selector should offer all 103 origins or only the 96 with data.
- **The imperfect departure-stop picks.** Geneva → `Genève-Aéroport`,
  Turin → `Torino Lingotto`, Łódź → `Łódź Kaliska`. Decide whether the word list
  should grow, whether an airport station should be demoted, or whether the
  `city_station` review is the right place to fix them. Rome is not on this list:
  it has only `Roma Tiburtina` to choose from (decision 5).
- **The 30 km station-match cap and the three-letter alternate-name floor.**
  Both are judgement calls; check they do not drop a real station, especially in
  Switzerland, where stations and cities are dense.
- **The Dutch URL change** (decision 18). OVapi serves the same NDOV data, but
  someone should confirm it is an acceptable source to depend on.
- **The Danish licence** (decision 17): non-commercial only. Confirm the project
  qualifies before publishing derived Danish data.
- **Whether to import the French NeTEx feed.** It is the only large country still
  absent, and the FR origins already work, so it would add French destinations
  rather than fix an origin.
- **The untouched Makefiles and `AGENTS.md`** (decision 14).
- **The run-level corrupt-output guard** (decision 23). Confirm that refusing a
  run in which no origin reaches any other place is the right trigger, given the
  probe showed the proposed origin-presence test cannot fire and the per-origin
  "nothing reached" signal occurs legitimately for three origins.
