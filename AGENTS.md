# AGENTS.md

## Layout
- `src/` — React app. `App.js` wires routes by hand: each city is an explicit `src/data/*.json` import plus a `<Route path="/origin/<name>">` rendering `origin/CityPage.js`.
- `src/components/` — `Home` (city card grid), `About`, `TopBar`.
- `src/data/` — committed, generated JSON the app consumes.
- `python/batch/` — Poetry project (name `deutschland-ticket`) for the ETL. Entrypoints: `src/cities.py` (scrape + LLM summaries), `src/destinations.py` (HAFAS journey search), `src/city_json.py` (join + emit JSON), `src/common.py` (sqlite connection).
- `python/batch/data/cities.sqlite` — source-of-truth DB (~610 cities, ~460 resolved stops). Committed. **Never delete `.sqlite` files.**
- `python/batch/archive/` — dead code (old `v6.db.transport.rest` scraper). Do not build on it.

## Commands
Frontend, from repo root: `npm start` (port 3000), `npm run build`, `npm test`.

Python, **must run from `python/batch`**:
- `poetry install --no-root`
- `poetry run pytest` — fixtures resolve `Path(".") / "test/data/cities.sqlite"`, so CWD must be `python/batch`.
- `poetry run ./static_checks.sh` — `black --check`, `flake8`, `isort --check`, `mypy`. mypy sets `disallow_untyped_defs`.
- `poetry run ./linter.sh` — same tools but auto-fixing (writes files).

Root `Makefile` declares `install/test/lint/check/run` as `.PHONY` but defines none of them; only `make city_json` actually works at the root.

## Data pipeline
- `make city_json CITY=Hamburg` (repo root) → `destinations.py --run-type=journeys_from_origin --city=Hamburg`, then `city_json.py` → writes `python/batch/data/hamburg.json` and copies it to `src/data/`.
- `city_stops` must already exist (populate once via `--run-type=stops`). `make city_json` assumes it and only runs the journey step.
- `--city` matches `city_stops.city` exactly and case-sensitively.
- Requires network (WikiVoyage, Wikipedia, DB HAFAS) and `OPENAI_API_KEY` (loaded via dotenv in `langchain_summarize.py`); `.env` is gitignored.
- `python/batch/Makefile`'s `install` target runs `poetry shell` (interactive), and `city_journeys` depends on it, so `make city_json` can hang in a non-interactive shell. Install deps first.
- The journey search intentionally disables long-distance/bus/ferry/subway and drops FLX trains. That is the ticket constraint — do not "fix" it.

