# uv migration and layout — implementation notes

Stack layer 1. Plan: `.agents/plans/map-tab-nextjs-migration.md`, Phase 1. The plan
file itself was frozen when this layer started.

## What the layer had to achieve

Move the Python project from Poetry to `uv` and from `python/batch/` to `python/`,
without changing what the €49 JSON generator produces. Everything else in this
layer follows from that.

## Decisions taken that we had not agreed on

Each item: the decision, why, and where it lives.

### 1. The distribution name stays `deutschland-ticket`

- **Decision:** keep `name = "deutschland-ticket"` in `[project]`.
- **Why:** it is the existing name, and renaming it is a rename on the Python side
  for no functional gain. It is now slightly inaccurate, because the project will
  also build the train map data from layer 2 on. Renaming is a one-line change if
  you want it.
- **Where:** `python/pyproject.toml`.

### 2. The project is an installed package, not a `PYTHONPATH` convention

- **Decision:** `[build-system]` uses hatchling with
  `packages = ["src/travel49"]`, so `uv sync` installs an editable package and
  `import travel49` works from any directory.
- **Why:** the old layout relied on `PYTHONPATH` being set by the editor and on
  `src` being importable as a package. That is invisible configuration: nothing in
  the repo states it, and it breaks the moment you run from elsewhere. Layer 2
  appends `src/trains` to the same list.
- **Where:** `python/pyproject.toml`.

### 3. `common.py` keeps its working-directory-relative database path

- **Decision:** `city_table_connection` still resolves the database against
  `Path(".")`, with only the directory updated to `data/travel49/`.
- **Why:** the plan says the surviving code moves "unchanged" apart from the two
  named deletions. Changing the resolution rule would also change what the
  documented `python/` working-directory requirement means.
- **Consequence, and the reason this needs review:** `city_json.py` resolves its
  output directory from `Path(__file__)`, so the same project directory is located
  two different ways in two files that both need it. See item 4.
- **Where:** `python/src/travel49/common.py`.

### 4. `city_json.py` output directory moved to `parents[2]`

- **Decision:** `Path(__file__).resolve().parents[2] / "data" / "travel49"`.
- **Why:** forced. The module gained a directory level (`src/city_json.py` →
  `src/travel49/city_json.py`), so the old `parent.parent` pointed at `python/src`
  and would have written the JSON into the package directory.
- **Where:** `python/src/travel49/city_json.py`, the `__main__` block.

### 5. The `__main__` block now carries a comment

- **Decision:** comment explaining that click still parses `--city` from argv while
  `obj` supplies the connection and output path.
- **Why:** the block calls `get_city_json(obj={...})` without passing `--city`. It
  reads like a bug — the argument looks missing — but it works because click parses
  `sys.argv`. Nothing in the code says so.
- **Where:** `python/src/travel49/city_json.py`.

### 6. Line-length tolerance for lint is 120, formatting stays at 88

- **Decision:** `[tool.ruff.lint.pycodestyle] max-line-length = 120`, while
  `[tool.ruff] line-length = 88`.
- **Why:** the `.flake8` config being deleted allowed 120. The long lines it
  tolerated are SQL held as string literals, which the formatter cannot wrap, and
  the project's first instinct is not to rewrite the €49 SQL as part of a tooling
  migration. Without this, `ruff check` reports four pre-existing E501s.
- **Where:** `python/pyproject.toml`.

### 7. Lint rule selection

- **Decision:** `select = ["E", "F", "I", "UP", "B", "SIM"]`.
- **Why:** this approximates what flake8, isort and black enforced, and adds
  bugbear and simplify. `RUF` was left out because its ambiguous-unicode rules fire
  on the `€` character this codebase writes in prose.
- **Where:** `python/pyproject.toml`.

### 8. `ty` is pointed at explicit paths, not configured to exclude the archive

- **Decision:** `ty check src tests`, and the same in `python/Makefile` and CI.
- **Why:** `ty` takes paths on the command line, and its configuration surface is
  still moving at 0.0.x. Naming the two directories is honest and cannot silently
  stop working. `ruff` does get `extend-exclude = ["archive"]`, because it walks
  the tree itself.
- **Where:** `python/Makefile`, `.github/workflows/python.yaml`.

### 9. `tests/data/destinations.json` was deleted

- **Decision:** removed from the repository.
- **Why:** it was the output of a test, committed, and read by nothing. Once the
  test writes to `tmp_path` it is unreachable. It is a `.json`, so the
  never-delete-`.sqlite` rule does not apply.
- **Where:** `python/tests/`.

### 10. Test outputs go to `tmp_path`

- **Decision:** both tests write their generated JSON into pytest's `tmp_path`
  instead of `tests/data/`.
- **Why:** the tests previously wrote `hamburg.json` and `destinations.json` into
  the fixture directory, one of which was untracked garbage after every run.
- **Where:** `python/tests/test_city_json.py`.

### 11. `python/Makefile` targets

- **Decision:** `install`, `check`, `lint`, `test`, `city_json`. `city_journeys` is
  gone, and `run` was dropped from `.PHONY` because no such target ever existed.
- **Why:** `city_journeys` invoked the pyhafas search, which is now archived. The
  journey data it produced is already in the committed database, which is what
  `city_json` reads, so `make city_json` still works end to end.
- **Where:** `python/Makefile`.

### 12. Root `Makefile` `.PHONY` corrected

- **Decision:** `help python_json city_json` instead of `install test lint check run`.
- **Why:** those four names were declared phony at the root and never defined, which
  is what made the old `AGENTS.md` note necessary. Two of the remaining names were
  undeclared.
- **Where:** `Makefile`.

### 13. CI file renamed and modernised

- **Decision:** `.github/workflows/pytest.yaml` → `python.yaml`; `actions/checkout@v7`;
  `astral-sh/setup-uv@v10`; `uv sync --locked`; then format check, lint, type check,
  tests, all with `working-directory: python`.
- **Why:** the file no longer runs only pytest. `--locked` makes CI fail if
  `uv.lock` is stale rather than silently resolving something else.
- **Where:** `.github/workflows/python.yaml`.

### 14. Editor settings drop `PYTHONPATH` and name ruff as the formatter

- **Decision:** `editor.defaultFormatter` is `charliermarsh.ruff` (the marketplace
  id), the deprecated `python.formatting.provider` key is gone, and the
  `terminal.integrated.env.osx.PYTHONPATH` entry is gone because the package is
  installed now.
- **Where:** `python/.vscode/settings.json`.

### 15. The archive was moved, not repaired

- **Decision:** `archive/` keeps the original imports (`from src.common import …`,
  `from src.model import …`) and is therefore not importable.
- **Why:** the instruction was that travel49 code is moved, not rewritten, and
  `src/model.py` is deleted, so the archived files could not be repaired without
  rewriting them anyway. They are excluded from ruff and ty, and nothing imports
  them. `AGENTS.md` and `python/README.md` both say so.
- **Where:** `python/archive/`, `AGENTS.md`, `python/README.md`.

### 16. `src/__init__.py` became `src/travel49/__init__.py`

- **Decision:** reused, so the rename shows as a rename in history. `src/` is no
  longer a package.
- **Where:** `python/src/travel49/__init__.py`.

### 17. The generated €49 JSON moved into `data/travel49/`

- **Decision:** `data/travel49/` holds both `cities.sqlite` and the seven generated
  `*.json` files. `data/trains/` is not created yet.
- **Why:** one directory per producer. The plan says `data/` splits into
  `data/travel49/` and `data/trains/`; an empty directory cannot be committed, so
  `data/trains/` arrives in layer 2 with its first Parquet file.
- **Where:** `python/data/travel49/`, root `Makefile`.

### 18. `.gitignore` gained `.venv/` and `__pycache__/`

- **Decision:** both ignored.
- **Why:** `uv sync` creates `python/.venv`, and nothing ignored it before because
  Poetry kept its virtualenv outside the project by default. `*.pyc` was already
  ignored but not the directories holding them.
- **Where:** `.gitignore`.

### 19. `python/.python-version` pins 3.14

- **Decision:** the file exists, containing `3.14`.
- **Why:** `requires-python = ">=3.14"` states the floor; the file states what `uv`
  should actually provision, so every machine resolves the same interpreter.
- **Where:** `python/.python-version`.

### 20. `testpaths = ["tests"]`

- **Decision:** declared in `[tool.pytest.ini_options]`.
- **Why:** it says where the tests live rather than relying on pytest's recursive
  discovery, which currently also walks `archive/`.
- **Where:** `python/pyproject.toml`.

## Things that need a decision from you

These are pre-existing, not caused by this layer, but this layer is where they
became visible.

### A. Running the pipeline rewrites the committed seed database

`make city_json CITY=X` drops and recreates `{City}_destinations` inside
`python/data/travel49/cities.sqlite`. The rows are identical afterwards, but SQLite
rewrites the pages, so `git status` shows the database as modified.

I verified the content is unchanged: all 17 tables compare identical, table by
table, before and after regenerating all seven cities. The committed bytes were
restored before committing this layer.

The fix is to write the joined table somewhere other than the source database.
That is a change to `city_json.py`'s design, so I have not made it.

### B. `python/tests/data/cities.sqlite` is now unused

The fixtures used to open it and `DROP`/`CREATE` their tables inside it. Because
`test_happy_path_city_exists` runs `join_cities_journeys`, which does
`CREATE TABLE {City}_destinations`, every test run left another table behind and
rewrote the committed bytes. The committed file was already carrying that residue.

Both fixtures now open `tmp_path / "cities.sqlite"`, so the tests are hermetic and
no committed file is touched. The old fixture database is left in place, unused,
because the never-delete-`.sqlite` rule stops me removing it. It should be deleted.

### C. Two ways to locate the project directory

`common.py` resolves against the working directory; `city_json.py` resolves against
`__file__`. Item 3 explains why I did not unify them in this layer. Unifying on
`__file__` would remove the documented `python/` working-directory requirement
entirely, and unifying on the working directory would make `city_json.py` fail when
invoked from anywhere else.

## What I need reviewed

1. **The path convention split** (items 3, 4 and C). Is leaving two resolution
   rules defensible for one layer, or should they have been unified here?
2. **The E501 tolerance** (item 6). Is carrying over 120 from a config we are
   deleting the right call, or should the long SQL have been rewrapped?
3. **The editable install** (item 2). Is installing the project the right way to get
   rid of `PYTHONPATH`, or is `pythonpath = ["src"]` in the pytest config enough and
   simpler?
4. **Deleting a committed file** (item 9). Confirm `tests/data/destinations.json`
   really is unreachable now.
5. **Test fixture mutation** (item B). Confirm the diagnosis and say whether the
   file should go.
6. **Anything in this layer that could have been smaller.** In particular, whether
   any of the seventeen decisions above was really necessary to move the project.
7. **The archive** (item 15). Confirm that leaving four non-importable files in the
   repository is acceptable, given they are excluded from every check.

## Review outcome

A reviewer agent read this layer against the plan and the hygiene rules. Its
findings, and what I did with each.

Accepted:

- **The test fixtures wrote into a committed database.** A real defect, and it had
  already polluted the committed file. Both fixtures now use `tmp_path`. This also
  removed the pytest working-directory requirement, so `AGENTS.md` and
  `python/README.md` no longer claim the tests need it.
- **`make install` duplicated `uv sync`.** The target is gone; the README already
  documents `uv sync` directly.
- **CI repeated the command list the Makefile owns.** CI now runs `make check` and
  `make test`, so adding a tool to the Makefile cannot leave CI behind.
- **Two comments narrated history.** The `pyproject.toml` comment about the 120 lint
  limit no longer cites the deleted flake8 config, and the wheel-packages comment no
  longer carries a note about layer 2.
- **`common.py` documented the test fixtures from production code.** Trimmed.
- **A comment restated the two `CREATE TABLE` calls beneath it.** Removed.
- **`AGENTS.md` said the root Makefile "exposes only `make city_json`".** It also
  defines `help` and `python_json`. Reworded.
- **The notes omitted three un-agreed changes.** Added as items 18 to 20.

Rejected:

- **Unify the two directory-resolution mechanisms on `__file__`.** That rewrites
  working travel49 code beyond the move, which is out of scope for this layer.
  Recorded as item C.
- **Drop `testpaths`.** It states where the tests live rather than relying on
  recursive discovery, which currently also walks the archive.
- **Flag `.agents/EXECUTION.md:58` ("Ruff replaces black, flake8, and isort").** That
  is the protocol document describing the current tool mapping, not a stale command.
- **Treat `python/FEEDS.md` as this layer's writing.** It is a byte-identical move.

The reviewer confirmed the move is complete: no reference to `python/batch`,
`src.common`, `src.city_json`, `poetry`, `black`, `flake8`, `isort`, `mypy` or
`test/data` remains outside `python/archive/` and the plan.

## Verification performed

- `ruff format --check`, `ruff check`, `ty check src tests`, `pytest` — all clean
  from `python/`.
- `make city_json CITY=<city>` for all seven origin cities, then
  `git diff --exit-code` on `python/data/travel49/` and `src/data/`: every generated
  JSON byte-identical to what was committed before the move.
- Table-by-table content comparison of `cities.sqlite` before and after
  regeneration: 17 tables, 0 differences.
