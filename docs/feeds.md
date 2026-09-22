# GTFS feeds

Timetable feeds loaded into the MOTIS import for the map tab. Each one is
downloaded by `just motis-data` into `.motis/feeds/` and named after the MOTIS
dataset id it becomes.

## Included

| Country | Dataset | URL | Size | Source | Licence |
|---|---|---|---|---|---|
| DE | `de-fv` | `https://download.gtfs.de/germany/fv_free/latest.zip` | 0.4 MB | gtfs.de | CC BY 4.0 |
| DE | `de-rv` | `https://download.gtfs.de/germany/rv_free/latest.zip` | 11 MB | gtfs.de | CC BY 4.0 |
| AT | `at` | `https://static.web.oebb.at/open-data/soll-fahrplan-gtfs/GTFS_Fahrplan_2026.zip` | 173 MB | ÖBB Open Data | CC BY 4.0 |
| NL | `nl` | `https://gtfs.ovapi.nl/nl/gtfs-nl.zip` | 229 MB | OVapi (NDOV national feed) | CC0 |
| CH | `ch` | `https://data.opentransportdata.swiss/de/dataset/timetable-2026-gtfs2020/permalink` | 254 MB | opentransportdata.swiss | see terms of use |
| LU | `lu` | `https://data.public.lu/fr/datasets/r/b0cf7705-434d-44c7-b211-4fd760784988` | 17.5 MB | data.public.lu | CC BY 4.0, attribution required |
| BE | `be` | `https://gtfs.irail.be/nmbs/gtfs/latest.zip` | 28.7 MB | iRail, mirroring SNCB | CC BY 4.0, attribution required |
| PL | `pl` | `https://gtfs.kasznia.net/static/pkp-ic.zip` | 150 MB | PKP Intercity community mirror | see source |
| CZ | `cz` | `https://data.jr.ggu.cz/results/latest/CZPTT_GTFS.zip` | 34 MB | CZPTT community mirror | see source |
| DK | `dk` | `https://www.rejseplanen.info/labs/GTFS.zip` | 50.9 MB | Rejseplanen Labs | free for non-commercial use, attribution requested |

`de-fv` covers DB's international network — long-distance trips and the foreign
stations they call at. The national feeds add onward travel on the operators of
each country, for example Wien→Klagenfurt on ÖBB, Utrecht→Groningen on NS, or
Antwerpen→Brugge on NMBS.

Attribution:

- **LU** (CC BY 4.0): attribute *data.public.lu* / the Luxembourg public-transport
  publishers wherever the derived data is shown.
- **BE** (CC BY 4.0): attribute *iRail / NMBS-SNCB*.
- **DK**: Rejseplanen asks for attribution and the feed is licensed for
  non-commercial use only. Confirm that this project's use qualifies before
  publishing derived Danish data.

## Not imported

| Country | Status |
|---|---|
| FR | No national feed is imported. A community NeTEx mirror exists (`https://mirror.traines.eu/french-netex/sncf-netex.fixed.zip`) but is not part of the build. French destinations appear only where the German and Swiss feeds call, so most of France has no station in the dataset. |
| IT | No directly downloadable, account-free national GTFS exists; Trenitalia's producer URL is flagged unstable in the catalogues. Regional and city feeds (ANM Naples, AMAT Palermo, AMTAB Bari, AMT Liguria, FCE Catania) are local transit operators: they add city stops and no intercity rail, so they cannot make Italian cities reachable from Germany. |

Belgium and Luxembourg are reachable because the feeds above are imported;
Denmark too. Italy is covered only in the north, through the stations the German,
Austrian and Swiss feeds connect.

## Operating notes

- Files download into `.motis/feeds/`, which is gitignored. No feed is committed.
- MOTIS ingests both GTFS and NeTEx.
- A MOTIS dataset id may not contain an underscore. The German feeds are
  therefore `de-fv.zip` and `de-rv.zip`; `de_fv` would be rejected at import.
- The ÖBB archive nests every file one directory deep. MOTIS reads a GTFS zip
  only when the `.txt` files are at the archive root, and imports an unflattened
  feed as an empty dataset without reporting an error, so `just motis-data`
  flattens that archive in place after downloading it. It is the only feed that
  needs this.
- The `be` feed is a community mirror because the official SNCB channel is
  API-key gated: `data.belgianmobility.io` answers 403 without an
  `Ocp-Apim-Subscription-Key`. Do not point the build at it.
- The `nl` feed is the NDOV national timetable served by OVapi. The OpenOV host
  (`gtfs.openov.nl`) rate-limits repeated bulk downloads with HTTP 429.
- `gtfs.de` free feeds are valid for 7 days; the ÖBB feed covers one timetable
  year. The import is a repeatable batch step.
- All URLs above were last fetched successfully on 2026-09-20.
