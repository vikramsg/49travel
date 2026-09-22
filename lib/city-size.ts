// The city-size range that the map's slider and `/api/reachable` both work in.
// Defined once, like `lib/hours-band.ts`, so the slider's scale and the route's
// bounds are described in one place.
//
// Population is not spread evenly: nine in ten of the places a train reaches are
// under 100,000, and the largest is 3,400,000. A slider over that span would
// spend almost all of its length past the last place anyone would choose, so the
// positions below are the slider's scale instead, and each is a round number.

/** The lower bound each slider position stands for, in people. */
export const CITY_SIZE_STOPS = [
  0, 20_000, 50_000, 100_000, 250_000, 500_000, 1_000_000,
] as const;

/** The top position, which as a lower bound means 1,000,000 or more. */
export const CITY_SIZE_TOP_INDEX = CITY_SIZE_STOPS.length - 1;

/**
 * Where the slider's two thumbs are. Indices rather than people because the
 * stops are uneven: index 0 is "any" and index 6 is "1,000,000 or more".
 */
export type CitySizeRange = {
  minIndex: number;
  maxIndex: number;
};

/** The whole scale, which filters nothing out. */
export const DEFAULT_CITY_SIZE: CitySizeRange = {
  minIndex: 0,
  maxIndex: CITY_SIZE_TOP_INDEX,
};

/** The bounds `/api/reachable` takes, in people. */
export type CitySizeBounds = {
  /** A lower bound of 0 hides nothing. */
  minPopulation: number;
  /** `null` is the open top: the top position as a ceiling means no ceiling. */
  maxPopulation: number | null;
};

/**
 * The people bounds a pair of slider positions stands for.
 *
 * The top position is open as a ceiling on purpose: a ceiling of 1,000,000 would
 * hide every large city, which is the opposite of what a control whose job is to
 * hide small places is for. As a floor the same position simply means "1,000,000
 * or more", so the position reads correctly at either end of the scale.
 */
export function citySizeBounds(range: CitySizeRange): CitySizeBounds {
  return {
    minPopulation: CITY_SIZE_STOPS[range.minIndex],
    maxPopulation:
      range.maxIndex === CITY_SIZE_TOP_INDEX
        ? null
        : CITY_SIZE_STOPS[range.maxIndex],
  };
}

const PEOPLE = new Intl.NumberFormat("en-GB");

/** The slider's readout, phrased the way the bound actually reads. */
export function describeCitySize(range: CitySizeRange): string {
  const { minPopulation, maxPopulation } = citySizeBounds(range);

  if (maxPopulation === null) {
    return minPopulation === 0
      ? "any size"
      : `${PEOPLE.format(minPopulation)} or more`;
  }
  if (minPopulation === 0) {
    return `up to ${PEOPLE.format(maxPopulation)}`;
  }
  return `${PEOPLE.format(minPopulation)}–${PEOPLE.format(maxPopulation)}`;
}

/** What the upper thumb's position means read on its own. */
export function describeCitySizeCeiling(index: number): string {
  return index === CITY_SIZE_TOP_INDEX
    ? "no upper limit"
    : `up to ${PEOPLE.format(CITY_SIZE_STOPS[index])}`;
}

// A leading minus is rejected here rather than reaching the range check below,
// because a negative number of people is not a bound that reads as out of range.
const WHOLE_PEOPLE = /^\d+$/;

/** Usable bounds, or why the two ends are not one. */
export type CitySizeParseResult =
  | { bounds: CitySizeBounds }
  | { error: string };

/**
 * Reads size bounds from untrusted text — the query string on the server. Both
 * ends are optional, because the scale is open at both ends: omitting
 * `minPopulation` means no lower bound and omitting `maxPopulation` means no
 * upper bound, which is how an open end is written in a query string.
 */
export function parseCitySize(
  minText: string | null | undefined,
  maxText: string | null | undefined,
): CitySizeParseResult {
  if (minText && !WHOLE_PEOPLE.test(minText)) {
    return {
      error: "minPopulation must be a whole number of people, e.g. ?minPopulation=50000",
    };
  }
  if (maxText && !WHOLE_PEOPLE.test(maxText)) {
    return {
      error: "maxPopulation must be a whole number of people, e.g. ?maxPopulation=250000",
    };
  }

  const minPopulation = minText ? Number(minText) : 0;
  const maxPopulation = maxText ? Number(maxText) : null;

  // A bound has to survive the trip into the 64-bit `population` column. A digit
  // string too long for a JS integer to hold exactly would reach the database and
  // come back as a 500 rather than as this 400, which is the only reason a bound
  // is refused for its size.
  if (!Number.isSafeInteger(minPopulation)) {
    return {
      error: `minPopulation (${minText}) is too large to use as a bound`,
    };
  }
  if (maxPopulation !== null && !Number.isSafeInteger(maxPopulation)) {
    return {
      error: `maxPopulation (${maxText}) is too large to use as a bound`,
    };
  }

  if (maxPopulation !== null && minPopulation > maxPopulation) {
    return {
      error: `minPopulation (${minPopulation}) must not exceed maxPopulation (${maxPopulation})`,
    };
  }

  return { bounds: { minPopulation, maxPopulation } };
}
