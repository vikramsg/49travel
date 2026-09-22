# UX standard

## UX checks 

Drive a real browser with `playwright-cli` and **read the snapshot image**.
Nobody may claim a screen works because an API responded or the DOM contains the
right elements. These checks are run by hand at each UI layer and are deliberately
not in the test suite.

## The states every control must have

1. **Default** — what it looks like on first load, before anything is touched.
2. **Activated** — what visibly changes when it is used.
3. **Boundary** — the smallest and largest values, and the empty result.
4. **Dismissal** — for anything that overlays: Escape *and* click-outside both
   close it, and focus returns to the control that opened it.
5. **Keyboard** — reachable and operable without a mouse, with a visible focus
   ring.

## The map tab, control by control

| control | must do |
|---|---|
| origin selector | opens; lists every origin; shows the current choice when closed; arrow keys and Enter select; Escape and outside-click close; focus returns to the trigger; changing it redraws the map |
| travel-time band | the slider has two thumbs, each reachable by drag and keyboard; the applied range is shown as text beside it; changing it redraws without a page reload |
| min/max form | both bounds take typed whole hours; a usable pair applies on submit; an unusable pair — not a whole number, off the 0–12 scale, or a minimum above the maximum — is reported beside the inputs and leaves the map on the last usable range |
| metric filters | five sliders behind an "Advanced filters" button, closed on first load and showing how many are on; each slider bounds one metric, and its leftmost position reads "Any" and asks nothing, so a drag applies immediately and there is nothing to validate or report; the applied bounds survive closing the button; the map states the active filters, so the applied set is readable without opening it |
| popular default | the map opens narrowed to the popular subset rather than to every stop the range reaches; "Show all destinations" is visible without opening the filters and returns the unfiltered set; an empty result names the filters as the cause rather than only suggesting a wider range |
| sidebar | holds the origin selector and the travel-time band at every width, so the map's own state is never hidden; below `lg` it stacks above the map |
| map | fills its container at any window size, and on a laptop takes the height the viewport has left rather than a fixed fraction of it, so the map ends with the window rather than below it; from 900 px of window height that fits without scrolling, and shorter windows scroll a little; one marker per destination in the range; clicking a marker shows the city name and the time; pan and zoom stay usable; the origin is shown distinctly and stays visible at every range |
| tab bar | switching tabs does not reload the page; the active tab is distinguishable without relying on colour alone |

## Rules that make it easy to use

1. **No dead ends.** Every empty and error state says what to do next.
2. **The current value is always visible.** Never make the user remember what they
   chose.
3. **State is preserved.** Changing the range keeps the origin; changing the
   origin keeps the range.
4. **Sensible defaults on first load**, so the map is never blank for no reason.
5. **No surprise navigation.** Nothing moves the user to another page unasked.
6. **Human units.** "6 h 15 min", never "375".
7. **Say that times are estimates and when they were measured.**
8. **Loading is visible.** A request in flight never looks like an empty map.

## Rules that make it good to look at

1. **One design system.** shadcn defaults; no bespoke styling where a component
   already exists.
2. **The two tabs look like one app** — same TopBar, container width, type scale,
   and spacing.
3. **One spacing scale and one type scale.** No arbitrary pixel values.
4. **Controls never sit on top of map content**, and never overlap each other.
5. **The legend's colours are the markers' colours.**
6. **Contrast meets WCAG AA.**
7. **Works at 375 px and at desktop width.**
8. **No layout shift** when the result count changes.

## The €49 pages during the migration

Behaviour and content are preserved; presentation moves to the design system.
Layer 3 is a rewrite of how those pages are built, not a redesign of what they
show. Comparing against the pre-migration baseline is about catching what broke —
missing cards, broken links, lost descriptions, an unhooked router — not about
pixels matching.

## Not acceptable

- Claiming a screen works because an API responded.
- Claiming a screen works because the DOM contains the right elements.
- Skipping the empty and error states because they are awkward to reach.
- Adding a spinner where a value is already known, or a spinner that never ends.
