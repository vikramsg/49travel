# Map tab data

The map tab answers "from city X, what can I reach by train within Y hours?".
This document describes the Parquet it reads, what the numbers mean, and how
they are produced. The feeds themselves are documented in [`feeds.md`](feeds.md).

## Files

The pipeline writes three files under `python/data/trains/`. All three are
committed.

| File | Columns | Read by |
|---|---|---|
| `city.parquet` | `city_id, name, country_code, latitude, longitude, population` | the map's markers |
| `city_station.parquet` | `city_id, motis_stop_id, station_name` | nothing at runtime; shipped so the stop matching can be reviewed |
| `travel_time.parquet` | `origin_city_id, city_id, minutes` | the reachability filter |

`city_station.motis_stop_id` points at MOTIS, which owns stations. There is no
local station table, so it is not an enforceable foreign key.

`city_id` is the GeoNames id of the place. GeoNames assigns it once and it does
not change between dumps, which a name-derived id would not guarantee.

Every file is written only if it compresses below 10 MB. A run that would
produce a larger file raises instead of writing it.

## What `minutes` means

`travel_time.parquet` has one row per origin city and destination city that a
train reaches.

- `minutes` is the smallest, across the five sampled departure times, of the
  time from leaving the origin station to arriving at **any** station that
  belongs to the destination city.
- Waiting at the origin is included: the clock starts when the traveller is on
  the origin platform. Sampling several departures is what drives the wait down
  toward zero.
- The cap is 12 hours (720 minutes). A destination nothing reaches within the
  cap has no row at all.
- The origin is its own destination, with `minutes` 0, so the map can mark it.
- Reachability is **not** stored. The API computes it as
  `minutes <= hours * 60` when the slider moves.

The measurement day is in the Parquet file metadata under `measurement_date`,
because a `minutes` value cannot be read without knowing the timetable it came
from. The value is a fixed reference date inside the imported feeds' validity,
not the day the pipeline happened to run.

The measurement samples local departures at 05:00, 09:00, 13:00, 17:00 and
21:00. Departures between 00:00 and 05:00 are deliberately not sampled. There is
no weekday/weekend split: on the same grid the weekend never produces a shorter
time than the weekdays.

## The cities

A place is in `city.parquet` when all of the following hold.

- It is in one of the 11 countries of the DB Fernverkehr network: DE, AT, CH,
  NL, BE, FR, DK, PL, CZ, IT, LU.
- Its GeoNames population is above 10,000.
- Its feature code is not one of the GeoNames section-of-populated-place codes
  (`PPLX`, `PPLQ`, `PPLCH`, `PPLL`, `PPLS`).
- Its name is not in the reviewed exclusion list in `trains/city.py`: the 20
  Paris arrondissements, the 16 Marseille arrondissements and `Brno střed`.
  GeoNames gives these plain-city feature codes, so the code list does not
  catch them.

Together that is **4,922** places.

The **origins** are the largest 10 cities of each country by population.
Luxembourg has only three above 10,000, so the set is **103** cities, not 110.
Twenty-one of them have no station in the imported feeds (Belgium, Denmark, the
southern half of Italy, one Austrian GeoNames artefact and two Luxembourg
communes); see coverage below.

## Station matching

Each MOTIS stop is assigned to the city whose name it carries, matching against
the city's name, its ASCII name and its GeoNames alternate names so that
`Wien Hauptbahnhof` reaches Vienna and `Wrocław Główny` reaches Wrocław. A stop
that carries several city names goes to the nearest of them. A stop that
matches no city is left out, and a station named after its city but more than
30 km from it is treated as a coincidence and also left out.

This is the fragile part of the dataset. A missed station makes a city look
farther away than it is; a station wrongly attached to a city makes it look
closer. `city_station.parquet` exists so the assignment can be reviewed.

## Coverage

The import loads seven GTFS feeds: `de-fv` and `de-rv` (gtfs.de), `at` (ÖBB),
`nl` (OpenOV), `ch` (opentransportdata.swiss), `pl` (PKP Intercity community
mirror) and `cz` (CZPTT community mirror). The consequences are visible in the
data.

- Germany, Austria, Switzerland, the Netherlands, Poland and Czechia are
  covered end to end.
- Belgium, France and Denmark appear only through the foreign stations that
  `de-fv` calls at, so most of their cities have no station and never appear as
  a destination. Reaching them as an origin is impossible for the same reason.
- Italy is covered in the north only (Milan, Turin, Bologna, Florence, Rome
  through connecting feeds). No Italian feed is imported, so Naples, Palermo,
  Genoa, Bari and Catania have no station and no data.
- Luxembourg City and a few neighbouring communes appear through `de-fv`;
  Esch-sur-Alzette and Dudelange do not.

The number of destinations a single origin reaches therefore varies from 1
(Turin, whose Italian network is absent) to about 1,950 (Berlin, in the middle
of the best-covered country).

## The GTFS-only import

MOTIS is imported with **no OpenStreetMap extract**. There is no `osm.pbf`, no
street graph and no address index. MOTIS routes only the trips and transfers the
feeds declare, and cannot route a walking path between two nearby stops.

Measured on the Aachen reference dataset, running the same 720-minute query
against an OSM+GTFS instance and a GTFS-only one:

| | |
|---|---|
| reachable stops | 6087 both |
| maximum duration | 710 minutes both |
| stops differing | 415 of 6087 (**6.8%**) |
| direction | GTFS-only is **never faster**, only equal or slower |
| mean penalty where it differs | **14.1 minutes** |
| maximum penalty | **30 minutes** |

The cause is a missing walking transfer: without a street network MOTIS cannot
move between two stops the feed does not connect, so it waits for a later
departure.

This is accepted for two reasons. The measurement is **station to station**, and
a walking leg inside a city is noise at the scale the map answers at. And the
error is **one-directional**: the map can under-report that a city is reachable
within the chosen number of hours, but it never promises a trip that cannot be
made. The sampling grid (below) overstates times in the same direction.

## Accuracy

- The five-point sampling grid reports up to about one grid step more than the
  true floor. Measured: Hamburg to Berlin is 145 minutes from the 05:00 sample
  where the timetable floor is about 135, and the minimum over all five samples
  is 134.
- The numbers describe the imported feeds and the pinned measurement day. They
  are a snapshot of a timetable, not live data, and re-measuring after a new
  import changes them.
