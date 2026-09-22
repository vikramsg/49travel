// The travel-time band that the map's slider, the map's min/max form and
// `/api/reachable` all agree on. Defined once so the three cannot drift apart,
// the same way `lib/trains.ts` holds the origin set once for its callers.

/**
 * The pipeline measures the origin itself at 0 minutes, so 0 is a valid lower
 * bound: a band starting at 0 contains the origin, a band starting above it
 * does not.
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

/** A usable band, or why the two bounds are not one. */
export type HoursBandResult = { band: HoursBand } | { error: string };

/**
 * Reads a band from untrusted text — the query string on the server, the form's
 * inputs in the browser — and reports why a pair of bounds is unusable. The
 * caller decides what an error means: a `400` on the server, an inline message
 * beside the form.
 */
export function parseHoursBand(
  minText: string | null | undefined,
  maxText: string | null | undefined,
): HoursBandResult {
  if (!WHOLE_HOURS.test(minText ?? "") || !WHOLE_HOURS.test(maxText ?? "")) {
    return {
      error: "minHours and maxHours must be whole numbers, e.g. ?minHours=0&maxHours=6",
    };
  }

  const minHours = Number(minText);
  const maxHours = Number(maxText);
  if (
    minHours < MIN_BAND_HOURS ||
    maxHours < MIN_BAND_HOURS ||
    minHours > MAX_BAND_HOURS ||
    maxHours > MAX_BAND_HOURS
  ) {
    return {
      error: `minHours and maxHours must be from ${MIN_BAND_HOURS} to ${MAX_BAND_HOURS}`,
    };
  }
  if (minHours > maxHours) {
    return {
      error: `minHours (${minHours}) must not exceed maxHours (${maxHours})`,
    };
  }

  return { band: { minHours, maxHours } };
}
