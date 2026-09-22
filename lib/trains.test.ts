// Behavioural tests for the band query, run against the committed Parquet — the
// same files the map reads. They assert what a caller observes (which cities come
// back for a band), not how the SQL is written.

import { describe, expect, it } from "vitest";
import { destinationsBetween, originCity, supportedOrigins } from "@/lib/trains";

// The pipeline's sanity example and the map's default origin.
const HAMBURG = "2911298";
const CAP_MINUTES = 12 * 60;

/** A travel-time band with the size range left open, for the tests about time. */
function reachableWithin(
  originCityId: string,
  minMinutes: number,
  maxMinutes: number,
) {
  return destinationsBetween(originCityId, minMinutes, maxMinutes, 0, null);
}

describe("originCity", () => {
  it("returns the city and coordinates of a measured origin", async () => {
    const origin = await originCity(HAMBURG);
    expect(origin).toMatchObject({ cityId: HAMBURG, name: "Hamburg" });
    expect(Number.isFinite(origin?.latitude)).toBe(true);
    expect(Number.isFinite(origin?.longitude)).toBe(true);
  });

  it("returns nothing for a city the pipeline never measured as an origin", async () => {
    expect(await originCity("1")).toBeNull();
  });

  it("answers for an origin the map offers", async () => {
    const origins = await supportedOrigins();
    expect(origins.length).toBeGreaterThan(0);
    expect(origins.map((origin) => origin.cityId)).toContain(HAMBURG);
  });
});

describe("destinationsBetween", () => {
  it("leaves the origin out even when the band covers 0 minutes", async () => {
    const destinations = await reachableWithin(HAMBURG, 0, CAP_MINUTES);

    expect(destinations.length).toBeGreaterThan(0);
    expect(
      destinations.find((destination) => destination.cityId === HAMBURG),
    ).toBeUndefined();
    expect(
      destinations.every((destination) => destination.minutes > 0),
    ).toBe(true);
  });

  it("keeps a destination whose travel time sits exactly on a bound", async () => {
    const all = await reachableWithin(HAMBURG, 0, CAP_MINUTES);
    const sample = all.find((destination) => destination.minutes > 0);
    expect(sample).toBeDefined();

    const exact = await destinationsBetween(
      HAMBURG,
      sample!.minutes,
      sample!.minutes,
      0,
      null,
    );
    expect(exact.map((destination) => destination.cityId)).toContain(
      sample!.cityId,
    );
  });

  it("returns exactly the destinations at or beyond a lower bound", async () => {
    const all = await reachableWithin(HAMBURG, 0, CAP_MINUTES);
    const sample = all.find((destination) => destination.minutes > 0)!;

    const band = await reachableWithin(
      HAMBURG,
      sample.minutes,
      CAP_MINUTES,
    );
    expect(band.map((destination) => destination.cityId)).toEqual(
      all
        .filter((destination) => destination.minutes >= sample.minutes)
        .map((destination) => destination.cityId),
    );
  });

  it("returns nothing for a band no destination falls into", async () => {
    const all = await reachableWithin(HAMBURG, 0, CAP_MINUTES);
    const latest = Math.max(...all.map((destination) => destination.minutes));

    expect(
      await reachableWithin(HAMBURG, latest + 1, CAP_MINUTES),
    ).toEqual([]);
  });

  it("returns nothing for an origin the pipeline never measured", async () => {
    expect(await reachableWithin("1", 0, CAP_MINUTES)).toEqual([]);
  });
});

describe("the city-size range", () => {
  it("changes nothing when both ends are open", async () => {
    const all = await reachableWithin(HAMBURG, 0, CAP_MINUTES);
    expect(await destinationsBetween(HAMBURG, 0, CAP_MINUTES, 0, null)).toEqual(
      all,
    );
  });

  it("keeps only cities at or above a lower bound", async () => {
    const names = (
      await destinationsBetween(HAMBURG, 0, CAP_MINUTES, 1_000_000, null)
    ).map((destination) => destination.name);

    expect(names).toContain("Berlin");
    expect(names).not.toContain("Bad Segeberg");
  });

  it("keeps only cities at or below an upper bound", async () => {
    const names = (
      await destinationsBetween(HAMBURG, 0, CAP_MINUTES, 0, 50_000)
    ).map((destination) => destination.name);

    expect(names).toContain("Bad Segeberg");
    expect(names).not.toContain("Berlin");
  });

  it("applies both ends together", async () => {
    const names = (
      await destinationsBetween(HAMBURG, 0, CAP_MINUTES, 100_000, 500_000)
    ).map((destination) => destination.name);

    expect(names).toContain("Bonn");
    expect(names).not.toContain("Berlin");
    expect(names).not.toContain("Bad Segeberg");
  });

  it("narrows a travel-time band rather than replacing it", async () => {
    const byTime = await reachableWithin(HAMBURG, 0, 120);
    const byTimeAndSize = await destinationsBetween(
      HAMBURG,
      0,
      120,
      500_000,
      null,
    );

    expect(byTimeAndSize.length).toBeLessThan(byTime.length);
    expect(
      byTimeAndSize.every((destination) =>
        byTime.some((city) => city.cityId === destination.cityId),
      ),
    ).toBe(true);
  });
});
