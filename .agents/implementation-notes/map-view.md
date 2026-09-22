# Map view — implementation notes (layer 4)

Stack layer 4. Plan: `.agents/plans/map-tab-nextjs-migration.md`, Phase 4. The
plan file is frozen; this file records what was built, what was verified, and
every decision not already agreed.

## What the layer had to achieve

Add a navigable `/map` tab that answers "from city X, what can I reach by any
train within Y hours?", with a searchable origin selector over the 96 measured
origins, an hours slider (1–12, default 6), a Leaflet/OSM map with one marker per
reachable city and a distinct origin marker, and a Hono endpoint that evaluates
reachability against the committed Parquet. Home and the €49 pages do not change
behaviour.

## Files produced

```
app/map/page.tsx                 the map tab, server component
app/api/[[...route]]/route.ts    added GET /api/reachable
components/map-view.tsx          controls, request state, legend, states
components/reach-map.tsx         react-leaflet map, markers, popup text
lib/trains.ts                    shared Parquet queries + wire types
components/top-bar.tsx           rewritten as a client component with tabs
AGENTS.md                        final-state layout, commands and a Map tab section
```

Removed from the six controls a previous agent generated under
`components/ui/`: `textarea.tsx`, and the `Textarea` import, `InputGroupTextarea`
export and unused `Textarea` usage in `input-group.tsx`. The four others
(`combobox.tsx`, `input-group.tsx`, `input.tsx`, `label.tsx`) and `slider.tsx` are
used as generated.

## Decisions not already agreed

Each item: the decision, why, and where it lives.

### 1. The generated combobox and slider are reused, trimmed to the map's needs

- **Decision:** keep `combobox.tsx`, `input-group.tsx`, `input.tsx` and
  `label.tsx` as the origin selector and hour control, but reduce them to the
  functions the map actually reaches: `combobox.tsx` exports only `Combobox`,
  `ComboboxInput`, `ComboboxContent`, `ComboboxList`, `ComboboxItem` and
  `ComboboxEmpty`; `input-group.tsx` exports only `InputGroup`,
  `InputGroupAddon`, `InputGroupButton` and `InputGroupInput`. `textarea.tsx` is
  deleted, and its `InputGroupTextarea` consumer and the now-dead
  `has-[>textarea]` selector are removed.
- **Why:** the origin selector is a shadcn combobox and the hours control is a
  shadcn slider, so those primitives are used as generated. Everything else in
  the two files was either a control the map never renders (`Textarea`,
  chips/groups/clear, `InputGroupText`) or a chain that kept one alive for no
  caller. `Button` is retained because `InputGroupButton` is used by the
  combobox trigger; `ComboboxClear` was removed with the `showClear` prop the map
  never sets.
- **Where:** `components/ui/`, `components/map-view.tsx`.

### 2. A scalar slider value is passed as a one-element array

- **Decision:** `<Slider value={[hours]} …>` and read `value[0]` from
  `onValueChange`.
- **Why:** the generated slider computes its thumb count as
  `Array.isArray(value) ? value : Array.isArray(defaultValue) ? defaultValue : [min, max]`.
  A scalar `value` therefore falls through to `[min, max]` and renders **two**
  thumbs and two focusable range inputs for a single-value slider. Passing the
  value as an array makes the count one and leaves the generated component
  untouched. Verified in the browser: one `input[type=range]`, not two.
- **Where:** `components/map-view.tsx`.

### 3. The slider's accessible name comes from the root, not a per-thumb prop

- **Decision:** the visible `Travel time` label carries `id="travel-hours-label"`
  and the slider root receives `aria-labelledby="travel-hours-label"`.
- **Why:** the generated slider exposes no thumb props, so a per-thumb
  `aria-label` is impossible without editing it. Base UI forwards the root's
  `aria-labelledby` to each thumb's range input, which is the only naming path
  the generated wrapper leaves open. Verified: the range input reports
  `aria-labelledby="travel-hours-label"` and `aria-valuetext="6 hours"`.
- **Where:** `components/map-view.tsx`.

### 4. The combobox selects the current city name on focus

- **Decision:** `ComboboxInput` gets `onFocus={(event) => event.currentTarget.select()}`.
- **Why:** with a city already selected, the input contains its name and Base UI
  does not replace it on typing, so searching appended (`HamburgMun`) and matched
  nothing. Selecting the text means the first keystroke replaces it, which is what
  a searchable selector has to do. Verified by picture.
- **Where:** `components/map-view.tsx`.

### 5. The map wrapper is `isolate`d so Leaflet does not paint over the combobox popup

- **Decision:** the map container div carries Tailwind's `isolate`.
- **Why:** Leaflet's panes use z-indexes up to 1000 inside the map; without a
  stacking context those panes painted over the combobox's `z-50` portal, so the
  open list was partly hidden behind the map. `isolation: isolate` on the wrapper
  contains Leaflet's z-indexes. Verified by picture before and after.
- **Where:** `components/map-view.tsx`.

### 6. Two marker colours, and the origin marker is raised

- **Decision:** the origin is a larger blue (`#0d6efd`) marker, reachable cities
  are red (`#dc3545`); the origin marker gets `zIndexOffset={1000}`.
- **Why:** the legend has to match the markers, so the two colours are defined
  once in `map-view.tsx` and passed to the map for both the icons and the legend.
  Leaflet orders markers by latitude, so a dense cluster buried the origin; the
  offset keeps it on top. The legend sits below the map, never over it.
- **Where:** `components/map-view.tsx`, `components/reach-map.tsx`.

### 7. The map is loaded client-side only, with `next/dynamic` and `ssr: false`

- **Decision:** `map-view.tsx` imports `reach-map.tsx` through
  `dynamic(…, { ssr: false })`.
- **Why:** Leaflet reads `window` at import time and would break the server
  prerender. Leaflet's CSS is imported inside that client-only module, so it
  loads with the map rather than on every €49 page.
- **Where:** `components/map-view.tsx`, `components/reach-map.tsx`.

### 8. Loading is derived from a request key, not a `loading` flag set in the effect

- **Decision:** the last finished request is stored with the `origin|hours|retry`
  key it answers; `loading` is `result?.key !== queryKey`.
- **Why:** `react-hooks/set-state-in-effect` rejects synchronous `setState` in an
  effect body. Deriving loading from the key removes the flag and gives race
  protection for free: an aborted request's key no longer matches, so a stale
  response can never win. `AbortController` cleanup cancels the in-flight request.
- **Where:** `components/map-view.tsx`.

### 9. The last successful response is kept through loading and through a later error

- **Decision:** the successful response is stored separately from the request
  outcome. Loading never clears it, and a later error sets only the outcome, so
  the previous map stays on screen with the alert and Retry above it. Before any
  success there is no map: loading shows "Loading the map…", and a first-load
  error shows "No cities to draw — the request failed." No fallback data is
  substituted at any point.
- **Why:** `.agents/UX.md` forbids a request in flight looking like an empty map.
  Keeping the last response is the only representation that also survives an
  error after a success, which is what a 400/500 on a changed origin or hour
  produces. The placeholder uses the same height as the map, and the status line
  has a fixed height (`h-28`, `md:h-12`), so neither the first load nor a changed
  message moves the map.
- **Where:** `components/map-view.tsx`.

### 10. `measuredOn`, the origin list and the health count come from `lib/trains.ts`

- **Decision:** one server module holds `supportedOrigins`, `measuredOn`,
  `reachableCities` and `cityCount` plus the `/api/reachable` wire types.
- **Why:** `/map` needs the origin list and the route needs the same list to
  validate, so the SQL lives once. `cityCount` likewise moves the `/api/health`
  read out of the route so the route no longer needs the Parquet paths. The types
  live beside the SQL that fills them so the route and the client cannot drift.
  `measuredOn` is a metadata read, so no component or route hard-codes the date.
- **Where:** `lib/trains.ts`, `app/api/[[...route]]/route.ts`, `app/map/page.tsx`.

### 11. An unknown origin is detected by an empty result, not a second query

- **Decision:** the route runs the reachability query; zero rows is a `400`
  "unknown origin".
- **Why:** every measured origin reaches itself with `minutes` 0, so its own row
  is always present for any `hours` of at least 1. An empty result can therefore
  only mean the origin is not one of the 96. This keeps the request to one query.
- **Where:** `app/api/[[...route]]/route.ts`.

### 12. `hours` is validated as whole digits before it is compared

- **Decision:** `hours` must match `/^\d+$/` and then fall in 1–12; otherwise the
  same `400` as a missing value.
- **Why:** a bare `Number()` would accept `1.5`, `1e1` and `-1`. The regex rejects
  all three with one useful message.
- **Where:** `app/api/[[...route]]/route.ts`.

### 13. `/map` is statically prerendered with the origin list baked in

- **Decision:** `app/map/page.tsx` is a server component with no dynamic API and
  is not opted out of static generation.
- **Why:** the origin list is committed data that cannot change between builds, so
  prerendering it avoids a DuckDB read per page view. The browser still calls
  `/api/reachable` for every origin/hours change. `next build` reports `/map` as
  static and the build-time read succeeds.
- **Where:** `app/map/page.tsx`.

### 14. The TopBar is a client component with Home and Map tabs

- **Decision:** `top-bar.tsx` is `"use client"`, uses `usePathname`, renders
  Home/Map as tabs and keeps GitHub and About as they were. Active state is bold
  plus an underline, and `aria-current="page"`.
- **Why:** active state needs the path, which only exists on the client. Weight
  and underline distinguish the active tab without colour, as the tab-bar
  requirement asks. `/origin/[city]` counts as Home active because it is a €49
  page; About is not a tab and gets no `aria-current`.
- **Where:** `components/top-bar.tsx`.

### 15. `target` markers fit the view, single results centre instead

- **Decision:** after each result the map calls `fitBounds` over the returned
  cities; a single city uses `setView(…, 6)`.
- **Why:** `fitBounds` with one point is degenerate, and every origin returns at
  least itself. The three origins that reach only themselves (Turin, Florence,
  Marne La Vallée) are the case this exists for.
- **Where:** `components/reach-map.tsx`.

### 16. Human time is formatted in the map module

- **Decision:** a module-private `formatMinutes` returns `"45 min"`, `"2 h"` or
  `"2 h 14 min"`; the origin popup shows `Origin` instead of `0 min`.
- **Why:** the popup is the only place the map shows a duration, so the formatter
  stays private beside its one caller. It describes the units it renders, not the
  €49 pages, whose `date-fns` formatting it does not share.
- **Where:** `components/reach-map.tsx`.

### 17. Leaflet and React Leaflet versions

- **Decision:** `leaflet@1.9.4`, `react-leaflet@5.0.0`, `@types/leaflet` as a dev
  dependency.
- **Why:** react-leaflet 5 is the release that supports React 19, which this app
  is on. Tiles come from `tile.openstreetmap.org` with attribution; no API key and
  no local OSM data.
- **Where:** `package.json`.

### 18. Hamburg is the default origin, with no fallback

- **Decision:** `/map` opens on Hamburg (`2911298`) at 6 hours. The id is a named
  constant with a comment; there is no lookup that substitutes another origin if
  it is missing.
- **Why:** Hamburg is the pipeline's own sanity example (Hamburg→Berlin 134 min),
  so it is the default rather than an arbitrary first row. A fallback would hide
  a broken dataset: the id is valid because it is one of the 96 ids
  `supportedOrigins()` returns, and that invariant is what the code relies on.
- **Where:** `app/map/page.tsx`.

## Verification performed

- `npm run lint` — clean.
- `npm run build` — clean. `/map` is static; `/` `/about` `/origin/[city]`
  unchanged; `/api/[[...route]]` dynamic.
- Production `npm start`, `GET /api/reachable` for Hamburg (`2911298`):
  - `hours=3` → **195** cities, `hours=6` → **977**, `hours=12` → **2121**, each
    with `measuredOn: "2026-09-22"` and `originCityId: "2911298"`. These match the
    raw DuckDB counts of `minutes <= hours * 60` for that origin.
  - Response shape is exactly `{measuredOn, originCityId, cities:[{cityId, name,
    latitude, longitude, minutes}]}`; the origin is present at `minutes` 0.
  - `origin=999` → 400 `{"error":"unknown origin 999; choose one of the origins on /map"}`.
  - `hours=0`, `hours=13`, `hours=1.5`, missing `hours` → 400
    `{"error":"hours must be a whole number from 1 to 12"}`; missing `origin` →
    400 `{"error":"origin is required, e.g. ?origin=2911298"}`.
- Routes: `/` 200, `/map` 200, `/about` 200, `/origin/hamburg` 200,
  `/api/health` 200. `/api/health` reads `cityCount()` and returns
  `{"status":"ok","cityCount":4922}`.
- Vercel preview `49travel-rm1t7xqoy-vikramsgs-projects.vercel.app`: `/`, `/map`,
  `/origin/hamburg` and `/api/health` return 200. The preview reachability API
  returns the same Hamburg counts as local production: 195 / 977 / 2121 places
  at 3 / 6 / 12 hours. The preview map was captured and read with real OSM tiles.
- Browser checks with `playwright-cli`, read as images. Desktop 1440×1000 and
  mobile 390×844; captures in `.agents/baseline/map-*.png`:
  - default Hamburg/6 h, selector open, selector search for "Mun", Munich
    selected by ArrowDown+Enter, hours 12 by `End`, hours 1 by `Home`, hours 9 by
    dragging the thumb, loading via a delayed route, empty via Turin, first-load
    error via a mocked 500, error after a success, origin popup, Lüneburg popup
    showing "30 min", zoom, pan, combobox focus ring, slider focus ring, Home tab
    active, mobile default, mobile selector open, mobile empty, mobile error, and
    `/origin/hamburg` and `/about` smoke.
  - **Error after a success:** with the Munich/6 h map on screen, a mocked 500 on
    the next request leaves `974` markers and the map in the DOM while the alert
    reads "Measurement data is unavailable." with Retry.
  - **First-load error:** with the 500 mocked before the first request, no
    `.leaflet-container` exists and the placeholder reads "No cities to draw — the
    request failed."
  - **Mobile status height:** default, empty and error all keep the status region
    at `112 px` (`h-28`) and the next element (map or placeholder) at `top: 476`,
    so no state moves the map.
  - Escape closes the list and focus returns to the combobox input
    (`document.activeElement` is `origin-selector`); clicking outside closes it;
    the slider is a single labelled range input; client-side navigation keeps a
    `window` marker alive and moves `aria-current` from Home to Map.
  - The only console error is Vercel Analytics' `/_vercel/insights/script.js`,
    expected off Vercel.
- Not run: an automated visual/DOM test suite, by design
  (`.agents/EXECUTION.md`: rendering is verified by picture, not automated).

## Review outcome

A reviewer read this layer and raised M1 and L1–L7. Adjudication:

- **M1 (accepted, fixed).** The map originally discarded the last response on a
  later error. The response is now stored apart from the request outcome, so a
  changed origin or hour that fails keeps the last map and shows the alert and
  Retry; a first-load failure shows a non-contradictory unavailable placeholder.
  Supersedes the earlier decision 9, which claimed a behaviour the code did not
  have. Verified by picture for both cases.
- **L1 (accepted).** The "largest German origin" claim is gone from
  `app/map/page.tsx`; Hamburg stays the default because it is the pipeline's
  sanity example (decision 18).
- **L2 (accepted).** `combobox.tsx` and `input-group.tsx` are trimmed to the
  functions the map and each other use; the dead textarea selectors are gone;
  `Button` stays via `InputGroupButton`, and the unused `ComboboxClear`/`showClear`
  chain was removed. `textarea.tsx` is not restored. Combobox behaviour rechecked
  by picture.
- **L3 (accepted).** `formatMinutes` is module-private.
- **L4 (accepted).** Its comment describes the hours/minutes it formats and no
  longer claims the €49 page text.
- **L5 (accepted, fixed with a fixed layout).** The status region is a fixed
  `h-28` / `md:h-12` instead of a growable `min-height`, keeping status above the
  map while holding the map's top edge steady across default, empty and error at
  390 px (`112 px`, `top: 476`). Verified by measurement and picture.
- **L6 (accepted).** The health count moved into `lib/trains.ts` as `cityCount()`;
  the route calls it and no longer imports the Parquet paths or DuckDB directly.
- **L7 (accepted as deliberate).** Hamburg's stable GeoNames id is kept and the
  absence of a fallback is recorded as the dataset invariant in decision 18.

Sound areas the reviewer saw no change needed in: the `/api/reachable` contract
and validation, the race handling around the response/outcome split after M1, the
map tab's UX, the server/client layer boundary, the 2,121 markers at 12 h, and
the absence of automated rendering tests.

## What to review

1. **The `isolate` fix and the combobox's stacking** (decision 5). Confirm this
   is the right layer to fix it, versus a portal-level z-index override.
2. **The slider workaround** (decisions 2 and 3). Confirm passing an array and a
   root `aria-labelledby` is preferable to a two-line edit of the generated
   `slider.tsx`, or whether the generated component should be fixed instead.
3. **Selecting on focus** (decision 4): is select-on-focus acceptable, or should
   the input be cleared when the popup opens?
4. **Turin as the empty state.** Turin reaches only itself, so the empty state's
   copy says "No city is reachable within 6 h of Turin." Confirm that wording is
   the right dead-end instruction.
5. **`/map` static prerender** (decision 13). Confirm the origin list baked at
   build time is fine, or whether the tab should read it per request.
