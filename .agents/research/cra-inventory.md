# CRA app inventory — reconnaissance for the Next.js port (layer 3)

Read-only reconnaissance of the React side, produced by a background `explore`
agent before layer 3 was planned. This is raw research, not a migration plan.
Layer 3 will be planned from it.

## Files

**Root:** `package.json` (CRA scripts, inline `eslintConfig`, `browserslist`),
`package-lock.json` **and** `pnpm-lock.yaml` (two lockfiles — package manager of
record is ambiguous), `.env.production`, `Makefile` (only the `city_json` targets),
`README.md`, `DEVELOPERS.md` (stock CRA/Vercel boilerplate), `ToDo.md` (gitignored).

**Absent:** no `.eslintrc*`, `.babelrc*`, `tsconfig.json`, `jsconfig.json`,
`vercel.json`, `next.config.*`, `tailwind.config.*`, `postcss.config.*`, or
`.github/`.

**`public/`:** `index.html` (CRA entry, `%PUBLIC_URL%` placeholders, Umami script),
`manifest.json` (stock, still says "React App"), `robots.txt`, `favico.ico`,
`logo192.png`, `logo512.png`.

**`src/`:** `index.js`, `App.js`, `App.css`, `index.css`, `App.test.js`,
`setupTests.js`, `reportWebVitals.js`, `vitals.js`, `logo.svg` (unreferenced),
`components/{TopBar,Home,About}.js`, `origin/CityPage.js`,
`data/{berlin,cologne,frankfurt,hamburg,munich,stuttgart,düsseldorf}.json`.

`CityPage` lives in `src/origin/`, not `src/components/`. No `.ts`/`.tsx` exists.

## Routing

All wiring is in `src/App.js`. `TopBar` is rendered **outside** `<Router>`, which
works only because it uses raw `<a href>`. Routes: `/`, `/about`, and seven
`/origin/<name>` entries, each importing its own JSON and passing it to `CityPage`
as `cardsData`. There is no 404 route and no layout wrapper.

Does not map cleanly:

- Routes are hand-written per city and duplicate `Home`'s hardcoded list; adding a
  city means editing both files.
- `/origin/dusseldorf` is ASCII while the data file is `düsseldorf.json`.
- Next wants `app/origin/[city]/page.tsx` selecting data by param, not seven
  distinct `<Route>` elements with distinct imports.
- No `<Suspense>`, loaders, error boundaries or redirects exist.

## Data contract

Each of the seven JSON files is a single line of shape
`{"cities": [{"city", "url", "journey_time", "stops", "origin_stop",
"destination_stop", "description"}]}`.

- `journey_time` is in **seconds**; `CityPage` multiplies by 1000 for `date-fns`.
- `origin_stop`/`destination_stop` are numeric stop ids.
- `description` is long prose and may contain `\n`.
- `CityPage` adds a client-only `expanded` property that is not in the JSON.
- `Home` reads no JSON at all; its seven cards are hardcoded.

## Components

- **`Home`** — no props, no state. Bootstrap `Container/Row/Col/Card/Card.*`, one
  react-router `<Link>` per hardcoded card, `key={index}` not the city.
- **`About`** — no props, no state. `Container/Row/Col`, two paragraphs, four
  external links with no `target`/`rel`.
- **`TopBar`** — no props, no state. `Navbar/Nav/Nav.Link` rendering plain anchors,
  so navigation is full page reloads today. One `Github` icon from
  `react-bootstrap-icons`.
- **`CityPage`** — one prop (`cardsData`). Three pieces of state: `cards` (with the
  injected `expanded`), `currentPage` (starts at 30, "Show More" adds 30), and
  `showButton`. Renders a card per city; expanding reveals a Bahn deep link, the
  description, and a WikiVoyage link. Uses `date-fns`
  `formatDuration(intervalToDuration(...))` and Bootstrap Icons carets.

## Styling

Two CSS files. `src/App.css` carries three real rules (`.custom-navbar` with a
hardcoded `#0d6efd`, `.card-clickable:hover`, `.icon-wrapper`) plus dead CRA
defaults. Bootstrap CSS, the Bootstrap **JS bundle**, and Bootstrap Icons CSS are
imported globally in `index.js`. No CSS variables, no theme, no dark mode.

Dropping `react-bootstrap` loses the component API and the responsive grid props,
not the utility classes — those come from plain Bootstrap CSS. The Bootstrap JS
bundle is imported but no JS-driven Bootstrap component is used.

Note: `index.js` imports `./App` **before** the Bootstrap stylesheets, so
`App.css` is evaluated first and Bootstrap wins ties.

## Dependencies

Used: `@vercel/analytics`, `bootstrap`, `bootstrap-icons`, `date-fns`, `react`,
`react-dom`, `react-bootstrap`, `react-bootstrap-icons`, `react-router-dom`,
`web-vitals`.

CRA scaffolding Next will not need: `react-scripts`, `@babel/runtime`, the
`eslintConfig`/`browserslist` blocks.

**Dead:** `reactstrap` (never imported — a second Bootstrap wrapper) and
`@testing-library/user-event`.

There is **no `devDependencies` key**; test tooling sits in `dependencies`.

## Surprises that need a decision

1. **`src/App.test.js` asserts `/learn react/i`**, which the app never renders.
   `npm test` is almost certainly red today and is not a meaningful gate.
2. **Favicon 404s.** `index.html` requests `favicon.ico`; the file is `favico.ico`.
3. **A stray `;` renders into the DOM** — `App.js` has `<Analytics />;` inside JSX.
4. **Three analytics systems**: `@vercel/analytics` `<Analytics/>`, the custom
   `vitals.js` `sendBeacon`, and a hardcoded Umami `<script>` in `index.html`. The
   Umami one has no direct Next equivalent and must move to `next/script`.
5. **`process.env.REACT_APP_VERCEL_ANALYTICS_ID`** is CRA-only; Next needs
   `NEXT_PUBLIC_` and build-time inlining.
6. **Legacy `ReactDOM.render`**, not `createRoot`, despite React 18.
7. **`index.html` head items with no automatic Next equivalent**: title, meta
   description, `theme-color`, apple-touch-icon, manifest link, `%PUBLIC_URL%`.
8. **Non-ASCII filename** `src/data/düsseldorf.json` against an ASCII route.
9. **Two lockfiles** — `package-lock.json` and `pnpm-lock.yaml`.
10. `showButton`/`currentPage` pagination is local state only; a refresh resets to
    30 cards.
11. `.env.production` is committed and holds only a variable reference, not a secret.
