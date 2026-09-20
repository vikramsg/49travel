# GTFS / NeTEx feeds

Timetable feeds loaded into the MOTIS import for the map tab.

`de_fv` covers DB's international network (long-distance trips and the foreign
stations they call at). The national feeds add onward travel on foreign
operators, for example Wien→Klagenfurt on ÖBB or Warszawa→Gdańsk on PKP.

## Included

| Country | Feed | URL | Size | Source | License |
|---|---|---|---|---|---|
| DE | Long-distance rail (`de_fv`) | `https://download.gtfs.de/germany/fv_free/latest.zip` | 0.4 MB | gtfs.de | CC-BY 4.0 |
| DE | Regional rail (`de_rv`) | `https://download.gtfs.de/germany/rv_free/latest.zip` | 11 MB | gtfs.de | CC-BY 4.0 |
| AT | ÖBB GTFS Fahrplan 2026 | `https://static.web.oebb.at/open-data/soll-fahrplan-gtfs/GTFS_Fahrplan_2026.zip` | 173 MB | ÖBB Open Data | CC BY 4.0 |
| NL | OpenOV national | `https://gtfs.openov.nl/gtfs-rt/gtfs-openov-nl.zip` | 228 MB | OpenOV | CC0 |
| CH | Swiss timetable | `https://data.opentransportdata.swiss/de/dataset/timetable-2026-gtfs2020/permalink` | 254 MB | opentransportdata.swiss | see terms of use |
| LU | Public transport | `https://data.public.lu/api/1/datasets/horaires-et-arrets-des-transport-publics-gtfs/` | metadata API | data.public.lu | open |
| BE | SNCB / NMBS | `https://sncb-opendata.hafas.de/gtfs/static/<token>` | 16 MB | SNCB Open Data | verify |
| FR | SNCF national rail (NeTEx) | `https://mirror.traines.eu/french-netex/sncf-netex.fixed.zip` | 24 MB | community mirror | open (verify) |
| PL | PKP Intercity | `https://gtfs.kasznia.net/static/pkp-ic.zip` | 150 MB | community mirror | verify |
| CZ | CZPTT | `https://data.jr.ggu.cz/results/latest/CZPTT_GTFS.zip` | 34 MB | community | verify |

## Excluded

| Country | Reason |
|---|---|
| DK | No directly downloadable GTFS; Rejseplanen requires an account. Danish destinations served by DB still appear via `de_fv`. |

## Operating notes

- Files download into `.motis/`, which is gitignored. No feed is committed.
- MOTIS ingests both GTFS and NeTEx, so the French NeTEx feed is used as-is.
- `gtfs.de` free feeds are valid for 7 days; the ÖBB feed covers one timetable
  year. The import is a repeatable batch step.
- The FR, PL, and CZ feeds come from community mirrors rather than the operator.
  Verify their licenses and expect the URLs to move.
- All URLs above were last verified to return HTTP 200 without credentials on
  2026-09-20.
