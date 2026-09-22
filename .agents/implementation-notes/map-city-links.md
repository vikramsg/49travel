# Destination article links — implementation notes

Plan: `.agents/plans/map-city-links.md`. The plan file is frozen; this file records what was built, what was
verified, and every decision not already agreed.

## What the change had to achieve

The map's popup named a destination and its travel time. It now also links the destination's English Wikipedia
and Wikivoyage article. The ask was a **draft** PR stacked on the travel-time range PR, so this is a first cut
with the resolution rule written down for review rather than a finished article resolver.

## Files produced

```
python/src/trains/links.py               resolves each city's two articles
python/data/trains/city_link.parquet     the committed result: 4,922 rows
python/Makefile                          `make city_links` to rebuild it
lib/trains.ts                            LEFT JOINs it; Destination gains the two URLs
components/reach-map.tsx                 the popup's link row
lib/trains.test.ts                       coverage and "never invents a URL"
app/api/[[...route]]/route.test.ts       the 200 body carries a link
AGENTS.md, docs/data_notes.md            the contract, the artifact, the resolution rule
```

## Decisions not already agreed

Each item: the decision, why, and where it lives.

### 1. Resolved once in the pipeline and committed, not resolved at request time

- **Decision:** `python/data/trains/city_link.parquet` is a committed dataset, built by `make city_links`.
- **Why:** the map is a frozen snapshot everywhere else — the measurement day, the reachability, the origins.
  A request-time lookup would make the popup depend on two wikis being reachable and fast, and would put a
  network call on the path of every marker click. It also keeps the app offline-capable, as the rest of it is.
- **Where:** `python/src/trains/links.py`, `python/data/trains/city_link.parquet`.

### 2. A separate artifact rather than new columns on `city.parquet`

- **Decision:** `city_link.parquet` with `city_id, wikipedia_url, wikivoyage_url`.
- **Why:** `city.parquet` is built from the GeoNames dump and the MOTIS stop matching; the links come from the
  two wikis. Different sources, different rebuild cadence, and the link file can be regenerated without
  touching the cities. `city_station.parquet` is separate for the same reason.
- **Where:** `python/src/trains/links.py`, `lib/trains.ts`.

### 3. Resolved by name with a coordinate check, not by GeoNames id

- **Decision:** ask each wiki for the page under the city's own name, follow normalisations and redirects, and
  keep the page only when the article's own coordinates are within 25 km of the city.
- **Why:** the id does not identify an article. The Wikidata item carrying `P1566` (the GeoNames id) is usually
  a bot-created stub with no sitelinks: Munich's `2867714` resolves to `Q32664319`, which has no articles, while
  `Q1726` is the article-bearing item. Verified against the live service before choosing the rule — Berlin and
  Hamburg resolved, Munich and Lüneburg did not. The coordinate check is what makes the name route safe: it
  rejects disambiguation pages (`Aalst`, `Aesch`, `Alpen`), and it rejects a name that resolves elsewhere
  (`Albino` resolved to *Albinism* and was dropped).
- **Where:** `python/src/trains/links.py` (`_article_urls`, `MATCH_RADIUS_KM`).

### 4. A missing link is omitted, never guessed

- **Decision:** a city that fails either test gets `null`, the popup drops that link, and drops the whole row
  when both are `null`.
- **Why:** a name-derived URL without a check would put wrong links on 19% of the map, silently. A missing
  link is a smaller lie than a link to somewhere else. The API documents the nulls, and the tests assert that
  every non-null URL is on the expected wiki, so a fabricated URL cannot pass.
- **Where:** `python/src/trains/links.py`, `components/reach-map.tsx`, `lib/trains.test.ts`.

### 5. The URL comes from the API, not from the title

- **Decision:** the pipeline stores the API's own `fullurl` (`prop=info&inprop=url`) rather than storing a
  title and letting the app compose a URL.
- **Why:** the API's URL is the canonical, correctly percent-encoded address. Composing one in the app would
  have to guess how to encode a title — and `encodeURIComponent` is wrong for a title containing a slash.
- **Where:** `python/src/trains/links.py`.

### 6. `LEFT JOIN`, so a missing link row cannot hide a destination

- **Decision:** the links table joins with `LEFT JOIN`.
- **Why:** the links are a supplement. An inner join would silently drop any destination the link file does not
  cover — which is now 947 of them — and the map's job is to show destinations, not linked destinations.
- **Where:** `lib/trains.ts` (`destinationsBetween`).

### 7. Links open in a new tab

- **Decision:** `target="_blank"` with `rel="noreferrer"`.
- **Why:** following a link in place would discard the origin, the range and the map's position, and the user
  would have to rebuild the view to get back. Suggested by the popup's own purpose: it is a place to look
  something up from, not to navigate away from.
- **Where:** `components/reach-map.tsx`.

### 8. The coverage is a known, published limit

- **Decision:** 3,975 of 4,922 cities have a Wikipedia article and 1,358 have a Wikivoyage article, and both
  numbers are written into `docs/data_notes.md` and the PR description.
- **Why:** one in five destinations has no Wikipedia link and most have no Wikivoyage link. A diagnostic run
  over the misses showed that most are **real articles that carry no coordinates**, not absent articles — so the
  rule is conservative rather than the data being thin. That is the thing to decide on review: whether to keep
  the conservative rule or add the country check described below.
- **Where:** `docs/data_notes.md`.

### 9. This PR is a draft, and part of a real stack

- **Decision:** `map-city-links` is a draft PR based on `map-time-band`, linked into GitHub stack #35 by
  `gh stack link`.
- **Why:** `gh stack link` was used rather than `gh stack submit`, because submit regenerates PR titles and
  descriptions. The draft state is the ask, and the resolution rule above is what it is asking about.
- **Where:** PRs #32 and #34, stack #35.

## Verification

| Check | Result |
|---|---|
| `make -C python lint` / `check` | clean (ruff format, ruff check, `ty`) |
| `make -C python test` | 33 passed |
| `npm run lint` | clean |
| `npm test` | 27 passed, 2 files |
| `npm run build` | clean |

The resolver was run once against the live wikis: `4922 cities: 3975 with a Wikipedia article, 1358 with a
Wikivoyage article -> data/trains/city_link.parquet` (75,523 bytes, well under the 10 MB commit cap).

API, against the production build: `origin=2911298&minHours=2&maxHours=2` returns the 5 destinations that sit
at exactly 2 h, each with its URLs — `Diepholz`, `Sehnde`, `Wennigsen` with Wikipedia only, `Heide` and
`Preetz` with both.

Browser: with the range at 2–2 h, the popup for `Heide` reads **Heide / 2 h / Wikipedia · Wikivoyage** with
`https://en.wikipedia.org/wiki/Heide` and `https://en.wikivoyage.org/wiki/Heide`, both opening in a new tab;
the popup for `Diepholz` shows the Wikipedia link alone and no empty Wikivoyage link. Evidence:
`.agents/baseline/map-popup-links-mobile.png`.

Tests added: the 200 body carries at least one link; more than half the destinations have a Wikipedia link, so
a change that nulls the feature fails; and no URL is ever present unless it is on the expected wiki, so an
invented or mis-premised URL fails.

## What to review

1. **Decision 3 and 8 — the resolution rule and its coverage.** This is the substance of the PR. The rule is
   conservative: it drops real articles that carry no coordinates, which is most of the 947 Wikipedia misses.
   The refinement that would recover them is to allow an article without coordinates when its Wikidata item's
   country (P17) matches the city's and no other city in that country shares the name — which also keeps
   `Alba` (Gaelic for Scotland) from being attached to the Italian town. It needs a second batched Wikidata
   call and is deliberately not built yet. Decide whether to build it, accept the coverage, or drop the feature.
2. **Decision 2 — a separate `city_link.parquet`.** The alternative is two more columns on `city.parquet`. If
   the links are considered part of a city's identity rather than a supplement, they belong there and the join
   disappears.
3. **Decision 5 — `fullurl` in the dataset.** If the dataset should hold the article title and let the app
   build the URL, this is the place to say so.
4. **Decision 4 — omitting rather than guessing.** If a destination should always show both links, even when
   one is a red link or a search result, that is a different product decision and it changes the resolver.
5. **Decision 9 — the stack's shape.** `map-time-band` must merge before `map-city-links`; and if the links
   are wanted regardless of whether the range PR lands, this should be rebased onto `main` instead.
6. **Wikivoyage at 28%.** Worth a spot check of a few misses against a browser: if Wikivoyage covers German
   towns better than the numbers suggest, the rule is wrong rather than the data being thin.
