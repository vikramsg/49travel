// Behavioural tests for the band query, run against the committed Parquet — the
// same files the map reads. They assert what a caller observes (which cities come
// back for a band), not how the SQL is written.

import { describe, expect, it } from "vitest";
import { destinationsBetween, originCity, supportedOrigins } from "@/lib/trains";

// The pipeline's sanity example and the map's default origin.
const HAMBURG = "2911298";
const CAP_MINUTES = 12 * 60;

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
    const destinations = await destinationsBetween(HAMBURG, 0, CAP_MINUTES);

    expect(destinations.length).toBeGreaterThan(0);
    expect(
      destinations.find((destination) => destination.cityId === HAMBURG),
    ).toBeUndefined();
    expect(
      destinations.every((destination) => destination.minutes > 0),
    ).toBe(true);
  });

  it("keeps a destination whose travel time sits exactly on a bound", async () => {
    const all = await destinationsBetween(HAMBURG, 0, CAP_MINUTES);
    const sample = all.find((destination) => destination.minutes > 0);
    expect(sample).toBeDefined();

    const exact = await destinationsBetween(
      HAMBURG,
      sample!.minutes,
      sample!.minutes,
    );
    expect(exact.map((destination) => destination.cityId)).toContain(
      sample!.cityId,
    );
  });

  it("returns exactly the destinations at or beyond a lower bound", async () => {
    const all = await destinationsBetween(HAMBURG, 0, CAP_MINUTES);
    const sample = all.find((destination) => destination.minutes > 0)!;

    const band = await destinationsBetween(
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
    const all = await destinationsBetween(HAMBURG, 0, CAP_MINUTES);
    const latest = Math.max(...all.map((destination) => destination.minutes));

    expect(await destinationsBetween(HAMBURG, latest + 1, CAP_MINUTES)).toEqual(
      [],
    );
  });

  it("returns nothing for an origin the pipeline never measured", async () => {
    expect(await destinationsBetween("1", 0, CAP_MINUTES)).toEqual([]);
  });
});
