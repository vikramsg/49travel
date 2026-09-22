// Behavioural tests for the band query, run against the committed Parquet — the
// same files the map reads. They assert what a caller observes (which cities come
// back for a band), not how the SQL is written.

import { describe, expect, it } from "vitest";
import {
  MAX_SITELINK_FILTER,
  NO_METRIC_FILTERS,
} from "@/lib/city-metric-filters";
import { destinationsBetween, originCity, supportedOrigins } from "@/lib/trains";

// The pipeline's sanity example and the map's default origin.
const HAMBURG = "2911298";
// In `city.parquet` as a destination, but never measured as an origin — the case
// that tells a real origin lookup apart from "is this any city at all".
const LUNEBURG = "2875115";
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

  it("returns nothing for a city that is a destination but not an origin", async () => {
    expect(await originCity(LUNEBURG)).toBeNull();
  });

  it("lists the map's default origin among the supported origins", async () => {
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

describe("destination links", () => {
  it("resolves articles for most destinations and leaves the rest empty", async () => {
    const destinations = await destinationsBetween(HAMBURG, 0, CAP_MINUTES);
    const linked = destinations.filter(
      (destination) => destination.wikipediaUrl !== null,
    );

    expect(linked.length * 2).toBeGreaterThan(destinations.length);
  });

  it("never invents a URL: a link is either absent or on the expected wiki", async () => {
    const destinations = await destinationsBetween(HAMBURG, 0, CAP_MINUTES);

    for (const { wikipediaUrl, wikivoyageUrl } of destinations) {
      expect(
        wikipediaUrl === null ||
          wikipediaUrl.startsWith("https://en.wikipedia.org/wiki/"),
      ).toBe(true);
      expect(
        wikivoyageUrl === null ||
          wikivoyageUrl.startsWith("https://en.wikivoyage.org/wiki/"),
      ).toBe(true);
    }
  });
});

describe("metric filters", () => {
  it("narrows the band by a metric without changing the band itself", async () => {
    const band = await destinationsBetween(HAMBURG, 0, CAP_MINUTES);
    const famous = await destinationsBetween(HAMBURG, 0, CAP_MINUTES, {
      ...NO_METRIC_FILTERS,
      minWikipediaSitelinks: 100,
    });

    expect(famous.length).toBeGreaterThan(0);
    expect(famous.length).toBeLessThan(band.length);
    expect(
      famous.every((city) =>
        band.some((other) => other.cityId === city.cityId),
      ),
    ).toBe(true);
  });

  it("narrows on a metric a destination can fail", async () => {
    // Exactly two hours from Hamburg is Diepholz, Heide, Preetz, Sehnde and
    // Wennigsen; only Heide and Preetz have a Wikivoyage article.
    const withArticle = await destinationsBetween(HAMBURG, 120, 120, {
      ...NO_METRIC_FILTERS,
      minWikivoyageArticles: 1,
    });

    expect(withArticle.map((city) => city.name).sort()).toEqual([
      "Heide",
      "Preetz",
    ]);
  });

  it("narrows to the cities a station category is known for", async () => {
    const band = await destinationsBetween(HAMBURG, 0, CAP_MINUTES);
    const categorised = await destinationsBetween(HAMBURG, 0, CAP_MINUTES, {
      ...NO_METRIC_FILTERS,
      maxDbStationCategory: 4,
    });

    // The category is Deutsche Bahn's, so it is set for German cities only.
    expect(categorised.length).toBeGreaterThan(0);
    expect(categorised.length).toBeLessThan(band.length);
  });

  it("can narrow to nothing, which is an answer rather than an error", async () => {
    const impossible = await destinationsBetween(HAMBURG, 0, CAP_MINUTES, {
      ...NO_METRIC_FILTERS,
      minWikipediaSitelinks: MAX_SITELINK_FILTER,
    });

    expect(impossible).toEqual([]);
  });
});
