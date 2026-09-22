// The city-size range's own rules: what a pair of slider positions means, how it
// reads, and what the query string may contain. These are the assertions the
// slider and the route both lean on.

import { describe, expect, it } from "vitest";
import {
  CITY_SIZE_STOPS,
  CITY_SIZE_TOP_INDEX,
  DEFAULT_CITY_SIZE,
  citySizeBounds,
  describeCitySize,
  describeCitySizeCeiling,
  describeCitySizeFloor,
  parseCitySize,
} from "@/lib/city-size";

describe("citySizeBounds", () => {
  it("reads the whole scale as no bound at all", () => {
    expect(citySizeBounds(DEFAULT_CITY_SIZE)).toEqual({
      minPopulation: 0,
      maxPopulation: null,
    });
  });

  it("reads a position below the top as a real ceiling", () => {
    expect(citySizeBounds({ minIndex: 2, maxIndex: 4 })).toEqual({
      minPopulation: 50_000,
      maxPopulation: 250_000,
    });
  });

  it("reads the top position as an open ceiling", () => {
    expect(
      citySizeBounds({ minIndex: 2, maxIndex: CITY_SIZE_TOP_INDEX }),
    ).toEqual({ minPopulation: 50_000, maxPopulation: null });
  });

  it("reads the top position as a real floor when it is the lower thumb", () => {
    expect(
      citySizeBounds({
        minIndex: CITY_SIZE_TOP_INDEX,
        maxIndex: CITY_SIZE_TOP_INDEX,
      }),
    ).toEqual({
      minPopulation: CITY_SIZE_STOPS[CITY_SIZE_TOP_INDEX],
      maxPopulation: null,
    });
  });
});

describe("describeCitySize", () => {
  it("says so when nothing is filtered out", () => {
    expect(describeCitySize(DEFAULT_CITY_SIZE)).toBe("any size");
  });

  it("reads an open top as 'or more'", () => {
    expect(describeCitySize({ minIndex: 2, maxIndex: CITY_SIZE_TOP_INDEX })).toBe(
      "50,000 or more",
    );
  });

  it("reads an open bottom as 'under'", () => {
    expect(describeCitySize({ minIndex: 0, maxIndex: 4 })).toBe("under 250,000");
  });

  it("reads a closed range as two bounds", () => {
    expect(describeCitySize({ minIndex: 2, maxIndex: 4 })).toBe(
      "50,000–250,000",
    );
  });
});

describe("the per-thumb wording", () => {
  it("names what the lower thumb means on its own", () => {
    expect(describeCitySizeFloor(0)).toBe("any size");
    expect(describeCitySizeFloor(2)).toBe("50,000 or more");
  });

  it("names what the upper thumb means on its own", () => {
    expect(describeCitySizeCeiling(CITY_SIZE_TOP_INDEX)).toBe("no upper limit");
    expect(describeCitySizeCeiling(4)).toBe("up to 250,000");
  });
});

describe("parseCitySize", () => {
  it("treats a missing end as an open one", () => {
    expect(parseCitySize(undefined, undefined)).toEqual({
      bounds: { minPopulation: 0, maxPopulation: null },
    });
    expect(parseCitySize("50000", undefined)).toEqual({
      bounds: { minPopulation: 50_000, maxPopulation: null },
    });
    expect(parseCitySize(undefined, "250000")).toEqual({
      bounds: { minPopulation: 0, maxPopulation: 250_000 },
    });
  });

  it("reads both ends when both are given", () => {
    expect(parseCitySize("50000", "250000")).toEqual({
      bounds: { minPopulation: 50_000, maxPopulation: 250_000 },
    });
  });

  it("rejects a lower bound above the upper one", () => {
    expect(parseCitySize("250000", "50000")).toHaveProperty("error");
  });

  it("rejects an end that is not whole people", () => {
    expect(parseCitySize("50.5", undefined)).toHaveProperty("error");
    expect(parseCitySize("many", undefined)).toHaveProperty("error");
    expect(parseCitySize(undefined, "250k")).toHaveProperty("error");
  });

  it("rejects a negative bound", () => {
    expect(parseCitySize("-1", undefined)).toHaveProperty("error");
  });
});
