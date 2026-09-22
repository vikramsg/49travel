# AGENTS.md

## Layout
- `app/` — Next.js App Router (TypeScript). `page.tsx` is Home, `about/page.tsx`, `origin/[city]/page.tsx` resolves its origin through the city manifest, `map/page.tsx` is the map tab, and `api/[[...route]]/route.ts` mounts Hono.
- `components/` — `TopBar` (shared, with the Home/Map tabs), `CityPage`, `github-icon`, plus `components/ui/` for shadcn primitives.
- `components/map-view.tsx` — the map tab's controls, request state and legend. Loads `components/reach-map.tsx` client-side only, because Leaflet needs `window`.
- `lib/cities.ts` — the single €49 city manifest (slug, display name, origin stop id, destination loader). The Home cards and the `/origin/[city]` routes are derived from it.
- `lib/trains.ts` — server-side reads of the map's Parquet: the 96 supported origins, the measurement date, an origin lookup, and the travel-time band filter. Both `/map` and `/api/reachable` use it.
- `lib/hours-band.ts` — the travel-time range, defined once: its 0–12 scale and the rule that the minimum may not exceed the maximum. `/api/reachable` reports why a range is unusable using it, and the map's slider and min/max form share its scale and bounds rule, so the three cannot disagree.
- `.github/workflows/python.yaml` — the pipeline's checks and tests. `.github/workflows/frontend.yaml` — the app's lint, tests and build.
- `lib/duckdb.ts` — native DuckDB connection for the map's Parquet datasets.
- `python/` — `uv` project (distribution `deutschland-ticket`) for the batch pipeline. The package is `src/travel49/`: `common.py` (sqlite connection) and `city_json.py` (join + emit the €49 JSON).
- `python/data/travel49/cities.sqlite` — source-of-truth DB (~610 cities, ~460 resolved stops). Committed. **Never delete `.sqlite` files.**
- `python/data/travel49/*.json` — generated €49 JSON, imported directly by the app through the manifest.
- `python/data/trains/*.parquet` — committed map datasets, read at runtime by the Hono API.
- `python/archive/` — dead code: the old `v6.db.transport.rest` scraper, the WikiVoyage/LLM scraper and the pyhafas journey search. Kept for history only. It is excluded from ruff and ty, and it no longer imports cleanly, because the models it depended on are gone. Do not build on it.
- `docs/` — reference docs describing the current state: `feeds.md` (GTFS feed selection, URLs, licences) and `data_notes.md` (what the map dataset is and what its numbers mean).

## Commands
Frontend, from repo root: `npm run dev` (port 3000), `npm run build`, `npm run lint`, `npm run test` (Vitest).

Python, **must run from `python/`**:
- `uv sync` — install dependencies into `python/.venv`.
- `make check` — `ruff format --check`, `ruff check`, `ty check src tests`.
- `make lint` — the same tools, fixing formatting and lint findings in place.
- `make test` — `pytest`.

The pipeline resolves its data paths against the working directory, which is why
these run from `python/`. `make -C python/` from the repo root guarantees it.

Root `Makefile` documents only `make city_json`, which delegates to `python/Makefile`.

## Data pipeline
- `make city_json CITY=Hamburg` (repo root) → `python/Makefile` runs `travel49.city_json` → writes `python/data/travel49/hamburg.json`, which the app imports directly.
- `--city` matches `cities.city` exactly and case-sensitively.
- The journey search that populated `city_stops` and `{City}_journeys` is archived. Those tables are still in the committed database, and they are what `city_json` reads.
- Nothing under `python/` needs network access any more. The archived scrapers did.
- The archived search intentionally disabled long-distance/bus/ferry/subway and dropped FLX trains. That is the ticket constraint — do not "fix" it.

## Map tab
- `/map` is a navigable tab, not the landing page. Home (`/`, `/origin/[city]`) stays the €49 regional view; `/map` answers "*from city X, what can I reach by any train in a given travel-time range?*" from the any-train dataset. The two surfaces share the TopBar and nothing else.
- `GET /api/reachable?origin=<city_id>&minHours=<n>&maxHours=<n>` returns `{measuredOn, origin: {cityId, name, latitude, longitude}, destinations: [{cityId, name, latitude, longitude, minutes}]}`. `cityId` values are GeoNames ids as strings.
- Valid `origin` values are exactly the 96 origins present in `travel_time.parquet`; valid `minHours` and `maxHours` are whole numbers 0–12 with `minHours <= maxHours`, and both bounds are inclusive. Anything else is a `400` with `{error}` — including an origin that is not one of the 96, which is looked up rather than inferred from an empty result, because a range no destination falls into is a valid empty answer.
- Reachability is `minHours * 60 <= minutes <= maxHours * 60`, evaluated per request. The origin is never among the destinations, because a destination is somewhere you travel to; it is carried in its own field, and the Parquet gives it a row at `minutes` 0 so that the map can draw it. `measuredOn` is read from the Parquet's `measurement_date` metadata, never hard-coded.
- `/map` loads the origin list server-side through `lib/trains.ts`; the browser fetches `/api/reachable` and redraws. The measurement day is a frozen snapshot, not live data.
