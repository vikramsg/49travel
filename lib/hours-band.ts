// The travel-time range that the map's slider, the map's min/max form and
// `/api/reachable` all agree on. Defined once so the three cannot drift apart,
// the same way `lib/trains.ts` holds the origin set once for its callers.

/**
 * The scale's floor. `travel_time` measures every destination at 1 minute or
 * more and gives the origin alone a 0-minute row, so a range starting at 0 still
 * describes real travel.
 */
export const MIN_BAND_HOURS = 0;

/** `travel_time` stops here, so a higher bound could only return the same cap. */
export const MAX_BAND_HOURS = 12;

// A leading minus is accepted so that a negative bound reaches the range check
// below and is reported as out of range rather than as a malformed number.
const WHOLE_HOURS = /^-?\d+$/;

/** Both bounds are inclusive, in whole hours. */
export type HoursBand = {
  minHours: number;
  maxHours: number;
};

/**
 * Why a pair of bounds is not a usable range. Each caller words this for its own
 * audience: the route names its query parameters, the form speaks to a person.
 */
export type HoursBandProblem =
  | "not-whole-hours"
  | "out-of-range"
  | "minimum-above-maximum";

/** A usable range, or why the two bounds are not one. */
export type HoursBandResult =
  | { band: HoursBand }
  | { problem: HoursBandProblem };

/**
 * Reads a range from untrusted text — the query string on the server, the form's
 * inputs in the browser — and reports why a pair of bounds is unusable. The
 * caller decides what a problem means: a `400` on the server, a message beside
 * the form.
 */
export function parseHoursBand(
  minText: string | null | undefined,
  maxText: string | null | undefined,
): HoursBandResult {
  if (!WHOLE_HOURS.test(minText ?? "") || !WHOLE_HOURS.test(maxText ?? "")) {
    return { problem: "not-whole-hours" };
  }

  const minHours = Number(minText);
  const maxHours = Number(maxText);
  if (
    minHours < MIN_BAND_HOURS ||
    maxHours < MIN_BAND_HOURS ||
    minHours > MAX_BAND_HOURS ||
    maxHours > MAX_BAND_HOURS
  ) {
    return { problem: "out-of-range" };
  }
  if (minHours > maxHours) {
    return { problem: "minimum-above-maximum" };
  }

  return { band: { minHours, maxHours } };
}
