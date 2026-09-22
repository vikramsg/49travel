# Map travel-time range — implementation notes

Plan: `.agents/plans/map-time-band.md`. The plan file is frozen; this file records what was built, what was
verified, and every decision not already agreed.

## What the change had to achieve

`/map` asked "from city X, what can I reach by any train **within Y hours**?". It now asks "**in a
travel-time range**": `GET /api/reachable?origin=<city_id>&minHours=<n>&maxHours=<n>`, whole hours on a 0–12
scale, `minHours <= maxHours`, both bounds inclusive. The page defaults to 0–6 h. The origin selector, the
rest of Home, and the €49 pages are untouched.

## Files produced

```
lib/hours-band.ts                    the range, defined once: scale, parser, error text
lib/trains.ts                        originCity(); destinationsBetween(); Destination/Origin/ReachableResponse
app/api/[[...route]]/route.ts        /reachable now takes a range; origin looked up, not inferred
app/map/page.tsx                     DEFAULT_MIN_HOURS = 0, DEFAULT_MAX_HOURS = 6
components/map-view.tsx              two-thumb slider, min/max form, range copy
components/reach-map.tsx             origin and destinations as separate props
lib/trains.test.ts                   range query against the committed Parquet
app/api/[[...route]]/route.test.ts   the /reachable contract, driven through the Vercel handler
vitest.config.mts                    Vitest, with the `@/*` alias from tsconfig
.github/workflows/frontend.yaml      lint, tests and build on every PR
AGENTS.md                            map tab contract, layout entries, commands
docs/data_notes.md                   what the range means over `minutes`
.agents/UX.md                        the range control and the min/max form in the checklist
.agents/baseline/map-band-*.png      the new UI evidence
package.json, package-lock.json      vitest dev dependency, `npm run test`
```

## Decisions not already agreed

Each item: the decision, why it was taken, and where it lives.

### 1. The range is defined once, in `lib/hours-band.ts`

- **Decision:** the 0–12 scale, the "whole hours" rule and the "minimum may not exceed maximum" rule live in
  one module, and both the route and the map parse with it.
- **Why:** three surfaces have to agree on what a usable range is. Without it the same four rules would be
  written twice — once against query strings on the server, once against form text in the browser — and the
  two would drift. This is the same reasoning `lib/trains.ts` already uses for the origin set.
- **Where:** `lib/hours-band.ts`; imported by `app/api/[[...route]]/route.ts` and
  `components/map-view.tsx`. It is a client-safe module: it imports nothing.

### 2. The origin is excluded from the destinations in SQL, not by the route or the client

- **Decision:** `destinationsBetween` filters `t.city_id <> t.origin_city_id`.
- **Why:** the response used to return the origin inside `cities` at `minutes` 0, and the client counted it out
  with `cities.length - 1` while `reach-map.tsx` found the origin marker by matching `cityId` inside that same
  array. One array was doing three jobs. With a range this breaks twice over: a range starting above 0 drops
  the origin's row, so the marker would disappear and the count would be wrong; and a range with nothing in it
  would be indistinguishable from an origin that was never measured, which is what the old unknown-origin
  check relied on. Excluding it in the query makes `destinations` mean exactly one thing — places you can
  travel to inside the range — so `originCity()` answers existence, the client counts `length` directly, and
  the marker comes from its own field.
- **Where:** `lib/trains.ts` (`destinationsBetween`, `originCity`), `app/api/[[...route]]/route.ts`,
  `components/reach-map.tsx`.

### 3. Both bounds accept 0; the old "at least 1 hour" floor is gone

- **Decision:** the range is 0–12 on both bounds, with `minHours <= maxHours`. A range of 0–0 is valid and
  returns no destinations.
- **Why:** the only alternative is a special case on the upper bound that exists for no user-visible reason,
  and the empty result is already a state the map handles with copy that says what to do. The old floor on
  `hours` was about a single upper bound, which no longer exists.
- **Consequence:** dragging the maximum thumb to 0 empties the map. The status line reports it and says how to
  get out. **This is one of the things to review (see below).**
- **Where:** `lib/hours-band.ts`, `app/api/[[...route]]/route.ts`.

### 4. An unknown origin is answered by a lookup

- **Decision:** `originCity(cityId)` returns the city or `null`, joining `travel_time` so that "supported"
  means the same thing `supportedOrigins()` means.
- **Why:** the previous check was `cities.length === 0`, which is now a legitimate successful answer. The join
  is what makes a city an origin: `travel_time` only has rows for origins that produced measurable journeys.
- **Where:** `lib/trains.ts` (`originCity`), route.

### 5. The types are named for what the response holds

- **Decision:** `ReachableCity` → `Destination`; `reachableCities` → `destinationsBetween`; `originCityId`
  (a bare id beside a `cities` array) → `origin` (the whole city record). `MIN_HOURS`/`MAX_HOURS` →
  `MIN_BAND_HOURS`/`MAX_BAND_HOURS`.
- **Why:** the response no longer contains "reachable cities"; it contains an origin plus the destinations in
  the range. "Reachable" no longer distinguishes anything, and the old count name `reachableCount` became
  `destinationCount` so it matches the legend and the copy.
- **Where:** `lib/trains.ts`, `components/map-view.tsx`.

### 6. The typed form keeps a draft separate from the applied range

- **Decision:** `band` is the applied range; `minText`/`maxText` are the form's text, and only a successful
  submit copies one into the other. The slider writes both.
- **Why:** a half-typed bound must not redraw the map or fire a request. Submitting an unusable pair reports it
  beside the inputs and leaves the map on the last usable range, rather than putting a request error in the
  result area with a Retry button, which is not what a validation failure is.
- **Where:** `components/map-view.tsx` (`applyBand`, `applyTypedBand`).

### 7. The readout shows the applied range even while the form holds an unusable pair

- **Decision:** the text beside "Travel time" is `${minHours}–${maxHours} h` from the applied range, not from
  the inputs.
- **Why:** it is the range the map is showing. Echoing the typed value would claim a range that has not been
  applied. The invalid state therefore reads "0–0 h" beside inputs holding 7 and 6 — deliberate, and visible in
  `.agents/baseline/map-band-invalid-desktop.png`.
- **Where:** `components/map-view.tsx`.

### 8. Vitest is pinned to `^4`, not the latest

- **Decision:** `vitest@^4.1.11`.
- **Why:** vitest 5 requires `@types/node@^22 || >=24` and this project pins `^20`. Bumping `@types/node` is a
  wider change than adding a test runner, and `^4` needs nothing new. The config is `.mts` and uses
  `import.meta.dirname` so Vite's config loader does not warn about ESM in a CommonJS file.
- **Where:** `package.json`, `package-lock.json`, `vitest.config.mts`.
- **Note:** `pnpm-lock.yaml` is a CRA-era leftover that does not even list `next`. It was left alone.

### 9. A frontend CI job was added in this PR

- **Decision:** `.github/workflows/frontend.yaml` runs `npm ci`, `npm run lint`, `npm test` and
  `npm run build` on every pull request.
- **Why:** CI was Python-only, so the new tests would never have run on a PR and would have rotted. Node is
  pinned to 26 to match the version the app is developed on. **Whether this belongs in this PR is a question
  for review (see below).**
- **Where:** `.github/workflows/frontend.yaml`, `AGENTS.md`.

### 10. `hours` is removed outright

- **Decision:** no compatibility parameter, and its rejection is covered by a test.
- **Why:** the app is the only caller, and a shim would preserve a contract the product no longer has. The test
  exists so the old parameter cannot quietly come back.
- **Where:** `app/api/[[...route]]/route.ts`, `app/api/[[...route]]/route.test.ts`.

### 11. `.agents/UX.md` was updated here rather than deferred to the records branch

- **Decision:** the checklist names the range control and the min/max form in this PR.
- **Why:** `.agents/UX.md` is protocol and lives in every branch, unlike the plans, notes and baseline
  evidence, which are collected on the records branch.
- **Where:** `.agents/UX.md`.

### 12. The change is one commit, not a separate refactor commit

- **Decision:** the origin/destination separation and the range ship together, contrary to the to-do list,
  which said the separation would be its own commit.
- **Why:** they are one contract change. An intermediate commit with `hours` still in place but the origin
  already split out would define a response shape that never ships and would exist only to be replaced in the
  next commit, so the split would add a reviewable state that is not a real state. The separation is still
  visible as its own section of the diff: `lib/trains.ts`, the route's origin lookup, and `reach-map.tsx`.
- **Where:** commit `413264c`. Recorded here as the deviation from the agreed plan.

### 13. The stale baseline screenshots were not regenerated

- **Decision:** the new evidence is added as `map-band-*.png`; the existing `map-*.png` were left as they are.
- **Why:** 22 of them predate even the copy change, so they are already stale, and regenerating them means
  replaying selector-open, search, slider-drag, error and loading states. **Flagged for review rather than
  quietly left.**

### 14. The empty-range test uses 0–0

- **Decision:** the "a range with nothing in it is a success" test asserts on `minHours=0&maxHours=0`.
- **Why:** it is the only range guaranteed to be empty for every origin, including a well-connected one, so the
  test cannot start failing when the dataset is rebuilt.
- **Where:** `app/api/[[...route]]/route.test.ts`, `lib/trains.test.ts`.

## Verification

All run from the repo root unless stated.

| Check | Result |
|---|---|
| `make -C python check` (ruff format, ruff check, ty) | clean |
| `make -C python test` | 33 passed |
| `npm run lint` | clean |
| `npm test` | 22 passed, 2 files |
| `npm run build` | clean; `/`, `/about`, `/map` static, `/api/[[...route]]` dynamic, 7 `/origin/[city]` pages |

API, against the production build on port 3000:

| Request | Result |
|---|---|
| `origin=2911298&minHours=0&maxHours=6` | `200`, 976 destinations, origin present, origin **not** among them, latest 360 min |
| `origin=2911298&minHours=2&maxHours=4` | `200`, 288 destinations, all within 120–240 min |
| `origin=2911298&minHours=0&maxHours=0` | `200`, empty destinations, origin present |
| `origin=2911298&minHours=12&maxHours=12` | `200`, 1 destination at exactly 720 min — the bound is inclusive |
| `hours=6` (the replaced bound), missing bounds, non-numeric, fractional, negative, `maxHours=13`, inverted, unknown origin, missing origin | `400` with `{error}`, one message per class |

Before the change the same 0–6 h request returned 977 cities *including* the origin, so the new 976 is the old
977 minus the origin — the default view shows the same places.

Browser, on the production build, reading the rendered images:

- Default: heading **Destinations**, range readout `0–6 h`, a slider with two independently addressable thumbs,
  the min/max form, and "976 destinations between 0 h and 6 h of Hamburg." 977 markers — 976 in the
  destination colour and exactly 1 in the origin colour.
- Form submit 2–4: 289 markers (288 + origin), the origin still drawn and still framed, readout and both inputs
  updated, status "288 destinations between 2 h and 4 h of Hamburg."
- Dragging the maximum thumb left: the range follows and the inputs follow with it.
- Keyboard: two `ArrowRight` presses on the minimum thumb move it to 2 h and refetch; `End` moves a thumb to its
  bound.
- Range 0–0: only the origin is drawn, and the status says "No destination is between 0 h and 0 h of Hamburg.
  Widen the range or choose another origin." — no dead end, and the map is not blank.
- Inverted pair 7/6: the error reads "minHours (7) must not exceed maxHours (6)" in red, both inputs carry
  `aria-invalid="true"` and `aria-describedby="band-error"`, the result status does not change, and **no request
  is fired**. Re-submitting 0–6 clears the error, drops the ARIA attributes, and fetches again.
- Popups: a destination shows "Diepholz / 2 h"; the origin shows "Hamburg / Origin".
- 375 px: no horizontal overflow, the controls stack, and the copy wraps to two lines.
- The only console error is Vercel Analytics failing to load `/_vercel/insights/script.js` locally, which is
  pre-existing and unrelated.

## What to review

In rough order of how much the answer matters.

1. **Decision 3 — should a 0–0 range be allowed?** It is the cleanest rule set and it keeps the empty state
   well defined, but it also lets a user empty the map by dragging the maximum thumb to the far left. The
   alternative is a floor of 1 h on the maximum, which is a special case with no user-visible meaning.
2. **Decision 1 — does `lib/hours-band.ts` earn its place?** Try to delete it: if the route and the component
   can each hold their own two rules without drifting, it should go. This is the file most likely to be an
   unnecessary abstraction.
3. **Decision 2 — is the SQL the right layer for "the origin is not a destination"?** The alternative is
   filtering in the route, or returning the origin row and having the client ignore it, which is where the
   original bug came from.
4. **Decision 9 — does a frontend CI job belong in a feature PR?** It is what makes the new tests run at all,
   but it is also a repo-level change. It can be split out if that is preferred.
5. **Decision 12 — was one commit right?** The agreed to-do said the origin/destination separation would be a
   separate commit. The reason for combining them is above; disagree if the separation deserves its own
   reviewable step.
6. **Decision 7 — is the readout/inputs divergence acceptable?** The invalid state shows `0–0 h` beside inputs
   reading 7 and 6. It is deliberate, but it is the most surprising thing on the page.
7. **Decision 13 — the stale `map-*.png` evidence.** Should the baseline be regenerated now, or dropped?
8. **Decision 8 — the `vitest@^4` pin.** It exists only because `@types/node` is pinned to `^20`. If bumping
   `@types/node` is preferred, the pin goes away.
9. The doc set: `AGENTS.md`, `docs/data_notes.md` and `.agents/UX.md` were each updated. Check that no
   sentence about "within Y hours" survived, and that the UX checklist's new rows describe what the controls
   actually do.

## Review

A background reviewer read commit `413264c` and reported no correctness bug, no
simplification worth making and no layer violation. Its other findings are
recorded below as accepted or declined, each with the reason.

### Accepted

| Finding | What changed |
|---|---|
| `MIN_BAND_HOURS`'s comment still described the old model, where a range starting at 0 contained the origin | Rewritten: the scale's floor is 0 because every destination is measured at 1 minute or more and the origin alone has a 0-minute row |
| `AGENTS.md` claimed the slider and the form "use the same parser"; the slider uses only the scale constants | Now says they share the scale and bounds rule |
| The parser returned one message per problem, written for an API caller, and the form rendered it verbatim — so typing 7 and 6 reported "minHours (7) must not exceed maxHours (6)" and an empty bound suggested "?minHours=0&maxHours=6" | The parser now reports which rule failed and each surface words it: the route keeps the parameter names and the example, the form speaks to the person typing |
| `ReachableResponse` was imported by neither consumer, so the type's "so the route and the map client cannot drift apart" comment was aspirational | The route annotates its payload with it |
| The supported-origin join was only weakly pinned: `origin=1` is not in `city.parquet` at all, so a lookup that dropped the join to `travel_time` would still pass while accepting a never-measured origin | Added `originCity("2875115")` — Lüneburg, confirmed present in `city.parquet` and absent from `travel_time.origin_city_id` — and the matching route `400` |
| The route's serialization of the origin's coordinates was untested, though the map depends on it | The `200` body now asserts finite `latitude` and `longitude` |
| No accepted case at the top of the scale, only a rejection | Added 12–12, asserting every destination is exactly 720 minutes |
| A test named for `originCity` actually exercised `supportedOrigins` | Renamed to say what it asserts |

The reviewer's own first choice was the join test, which is the first thing added.

### Declined

| Finding | Why |
|---|---|
| "No `.agents/implementation-notes/` exists for this change, which `AGENTS.md` requires" | They exist, on the records branch (#31), which is where the plans and notes are kept so the feature diffs stay clean. The reviewer could not see that branch. The frozen plan still showing `?hours=6` is expected: plans are not edited once implementation starts. |
| The status element switches `role` between `status` and `alert` on one node while keeping `aria-live="polite"` | Pre-existing, untouched by this commit, and the reviewer rated it low confidence. Changing it would alter the announcement behaviour of the retry path that already ships. |
| `Origin` and `Destination` could share a shape through `Omit<Destination, "minutes">` | Couples the origin to the destination for no gain in reading. |

### What the simplification pass could not cut

The reviewer specifically tried the two obvious pressures and found nothing to
remove: whether the applied range and the typed draft could collapse into one
state (no — the draft must not apply on each keystroke, and the slider must write
back into it), and whether a `components/ui/` primitive was bypassed (no —
`Input`, `Label`, `Slider` and `Button` are all reused, and there is no two-bound
form primitive to reuse). It also confirmed `lib/hours-band.ts` has to stay a
separate, client-safe module rather than a section of `lib/trains.ts`.

## Records branch rebase

`agent-records` (PR #31) was still based on `6d7ca59`, the `main` that predates
the merged stack, so its tree was the old Create React App: no `app/`, no
`components/`, and a stale CRA-era `pnpm-lock.yaml` beside the CRA-era
`package.json`. Vercel picked pnpm for that tree and failed with
`ERR_PNPM_OUTDATED_LOCKFILE`. The branch was rebased onto the current `main`, so
its tree is now `main` plus the records, its Vercel build is the current Next
app, and its pull-request diff is unchanged.

## Post-review wiring

`.github/workflows/frontend.yaml` ran on the pull request and passed, so the
tests are exercised on CI rather than only locally.
