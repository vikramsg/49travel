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

That is not a count of separate towns. GeoNames gives some city districts a
plain-city feature code, and their names do not contain their parent city's
name, so neither the section-code list nor a name-prefix rule can catch them. The
largest groups are **Warsaw's 18** districts (Mokotów, Wola, Bemowo, Śródmieście,
…), **Wrocław's 21** (Przedmieście Świdnickie, Huby, Szczepin, Ołbin, …),
**Naples' 12** (Fuorigrotta, Pianura, Ponticelli, Secondigliano, …) and one
district of Rome. They are kept deliberately: each is a real place above the
population threshold, the map draws only cities reachable within the chosen
number of hours, and a district that no station serves never appears in a result.
A mechanical replacement rule keyed on a district and its parent city sharing the
GeoNames `adm3` code was tested and rejected, because it also removes real towns:
Villeurbanne, Roubaix, Tourcoing, Schaerbeek, Ixelles, Anderlecht, Stolberg,
Herzogenrath and Laatzen — and Schaerbeek and Anderlecht are origins.

The **origins** are the largest 10 cities of each country by population.
Luxembourg has only three above 10,000, so the set is **103** cities, not 110.
Seven of them have no station in the imported feeds — Naples, Palermo, Genoa,
Bari and Catania in Italy, Frederiksberg in Denmark, and Eisenzicken in Austria
— so the measurement covers **96** origins. See coverage below.

## Station matching

Each MOTIS stop is assigned to the city whose name it carries, matching against
the city's name, its ASCII name and its GeoNames alternate names so that
`Wien Hauptbahnhof` reaches Vienna and `Wrocław Główny` reaches Wrocław. A stop
matches only when the city name is the **first** words of the stop name. A
parenthesised part or a later word is a disambiguator, not the station's own
place: `Erzingen (Baden)` carries the German region Baden and not the Swiss city
of Baden, and `Leverkusen Opladen Bf` belongs to Leverkusen and not to Opladen.
A stop that carries several city names as a prefix goes to the nearest of them.
A stop that matches no city is left out, and a station named after its city but
more than 30 km from it is treated as a coincidence and also left out.

This is the fragile part of the dataset. A missed station makes a city look
farther away than it is; a station wrongly attached to a city makes it look
closer. `city_station.parquet` exists so the assignment can be reviewed.

## Coverage

The import loads ten GTFS feeds, one national feed per country except France and
Italy: `de-fv` and `de-rv` (gtfs.de), `at` (ÖBB), `nl` (OVapi, the NDOV national
timetable), `ch` (opentransportdata.swiss), `lu` (data.public.lu), `be` (iRail,
mirroring SNCB), `pl` (PKP Intercity community mirror), `cz` (CZPTT community
mirror) and `dk` (Rejseplanen Labs). The consequences are visible in the data.

The share of each country's cities that have at least one station in
`city_station.parquet`, measured on the committed data:

| Country | Cities | With a station |
|---|---|---|
| LU | 3 | 100.0% |
| AT | 51 | 98.0% |
| CZ | 147 | 87.8% |
| CH | 133 | 85.7% |
| DK | 90 | 76.7% |
| DE | 1,517 | 74.0% |
| PL | 460 | 57.6% |
| BE | 371 | 55.0% |
| NL | 292 | 54.8% |
| FR | 913 | 21.5% |
| IT | 945 | 4.4% |

This counts stations, not reachability: a city with a station is not
necessarily reachable from any origin. France and Italy are low because they
have no national feed, so most of their cities have no station in the graph at
all; the others fall short because the imported feeds do not call at every place
over 10,000 inhabitants that GeoNames lists.

- France has no national feed, so French destinations appear only where the
  German and Swiss feeds call: Paris, Strasbourg, Lyon, Marseille, Bordeaux,
  Toulouse, Nantes, Nice and Montpellier, but few others.
- Italy is covered in the north only (Milan, Turin, Bologna, Florence, Rome
  through connecting feeds). There is no account-free national Italian GTFS, and
  the regional city feeds are local transit with no intercity rail, so Naples,
  Palermo, Genoa, Bari and Catania have no station and no data.

There are **2,300** distinct destination cities in `travel_time.parquet`. The
number a single origin reaches ranges from **1** — Marne La Vallée, Turin and
Florence — to **2,145** (Berlin, in the middle of the best-covered country).
Marne La Vallée's only inbound service comes from feeds that do not call there
within 12 hours; Turin and Florence are reached only through the few
northern-Italy calls the German, Austrian and Swiss feeds make.

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
