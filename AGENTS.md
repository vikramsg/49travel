# AGENTS.md

## Layout
- `src/` — React app. `App.js` wires routes by hand: each city is an explicit `src/data/*.json` import plus a `<Route path="/origin/<name>">` rendering `origin/CityPage.js`.
- `src/components/` — `Home` (city card grid), `About`, `TopBar`.
- `src/data/` — committed, generated JSON the app consumes.
- `python/` — `uv` project (distribution `deutschland-ticket`) for the batch pipeline. The package is `src/travel49/`: `common.py` (sqlite connection) and `city_json.py` (join + emit the €49 JSON).
- `python/data/travel49/cities.sqlite` — source-of-truth DB (~610 cities, ~460 resolved stops). Committed. **Never delete `.sqlite` files.**
- `python/data/travel49/*.json` — generated €49 JSON, copied to `src/data/`.
- `python/archive/` — dead code: the old `v6.db.transport.rest` scraper, the WikiVoyage/LLM scraper and the pyhafas journey search. Kept for history only. It is excluded from ruff and ty, and it no longer imports cleanly, because the models it depended on are gone. Do not build on it.
- `docs/` — reference docs describing the current state: `feeds.md` (GTFS feed selection, URLs, licences) and `data_notes.md` (what the map dataset is and what its numbers mean).

## Commands
Frontend, from repo root: `npm start` (port 3000), `npm run build`, `npm test`.

Python, **must run from `python/`**:
- `uv sync` — install dependencies into `python/.venv`.
- `make check` — `ruff format --check`, `ruff check`, `ty check src tests`.
- `make lint` — the same tools, fixing formatting and lint findings in place.
- `make test` — `pytest`.

The pipeline resolves its data paths against the working directory, which is why
these run from `python/`. `make -C python/` from the repo root guarantees it.

Root `Makefile` documents only `make city_json`, which delegates to `python/Makefile`.

## Data pipeline
- `make city_json CITY=Hamburg` (repo root) → `python/Makefile` runs `travel49.city_json` → writes `python/data/travel49/hamburg.json` and copies it to `src/data/`.
- `--city` matches `cities.city` exactly and case-sensitively.
- The journey search that populated `city_stops` and `{City}_journeys` is archived. Those tables are still in the committed database, and they are what `city_json` reads.
- Nothing under `python/` needs network access any more. The archived scrapers did.
- The archived search intentionally disabled long-distance/bus/ferry/subway and dropped FLX trains. That is the ticket constraint — do not "fix" it.
