# Plan: article links in the destination popup

Status: implemented on `map-city-links`, stacked on `map-time-band`. **Once implementation starts, do not
edit this file** — record all changes in `.agents/implementation-notes/map-city-links.md` instead.

## The ask

Add a stacked draft PR on top of the travel-time range that links each destination's Wikipedia and
Wikivoyage page from the map popup.

## Shape it forced

| Question | Answer |
|---|---|
| Where is a link resolved? | Once, in the pipeline, and committed — never at request time |
| Which article? | The English Wikipedia and English Wikivoyage article for the city |
| What if there is none? | The popup omits that link, and omits the row entirely if there are none |
| How is it delivered? | A draft PR on `map-city-links`, stacked on `map-time-band` |

## To-do list

1. Resolve each of the 4,922 cities to its two articles and commit the result as a dataset.
2. Join it into the reachability query, so `/api/reachable` carries the two URLs per destination.
3. Link whichever are present from the popup.
4. Cover it with behavioural tests; document the resolution and its coverage.
5. Run every check and test, verify the popup in a browser, then push and open the draft PR.
