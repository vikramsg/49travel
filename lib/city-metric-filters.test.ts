import { describe, expect, it } from "vitest";

import {
  NO_METRIC_FILTERS,
  activeMetricBound,
  metricFilterParams,
  parseMetricFilters,
} from "@/lib/city-metric-filters";

/** The parser as the route calls it: the query string, looked up by name. */
function parse(query: Record<string, string>) {
  return parseMetricFilters((name) => query[name]);
}

describe("parseMetricFilters", () => {
  it("asks nothing of any metric when no bound is given", () => {
    expect(parse({})).toEqual({ filters: NO_METRIC_FILTERS });
  });

  it("reads each metric from its own parameter", () => {
    expect(
      parse({
        minWikipediaSitelinks: "20",
        minWikivoyageArticles: "1",
        minUnescoSites: "1",
        minTourismPois: "40",
        maxDbStationCategory: "4",
      }),
    ).toEqual({
      filters: {
        minWikipediaSitelinks: 20,
        minWikivoyageArticles: 1,
        minUnescoSites: 1,
        minTourismPois: 40,
        maxDbStationCategory: 4,
      },
    });
  });

  it("leaves a metric alone when its bound is blank", () => {
    expect(parse({ minTourismPois: "" })).toEqual({ filters: NO_METRIC_FILTERS });
  });

  it("reports which metric was not a whole number", () => {
    expect(parse({ minTourismPois: "many" })).toEqual({
      problem: { name: "minTourismPois", kind: "not-whole-number" },
    });
  });

  it("reports which metric was out of range, a negative bound included", () => {
    expect(parse({ maxDbStationCategory: "8" })).toEqual({
      problem: { name: "maxDbStationCategory", kind: "out-of-range" },
    });
    expect(parse({ minWikipediaSitelinks: "-1" })).toEqual({
      problem: { name: "minWikipediaSitelinks", kind: "out-of-range" },
    });
  });
});

describe("activeMetricBound", () => {
  it("treats zero and null as no bound and anything else as a bound", () => {
    expect(activeMetricBound(NO_METRIC_FILTERS, "minTourismPois")).toBeNull();
    expect(
      activeMetricBound(NO_METRIC_FILTERS, "maxDbStationCategory"),
    ).toBeNull();
    expect(
      activeMetricBound(
        { ...NO_METRIC_FILTERS, minTourismPois: 5 },
        "minTourismPois",
      ),
    ).toBe(5);
  });
});

describe("metricFilterParams", () => {
  it("sends nothing when no filter is set", () => {
    expect(metricFilterParams(NO_METRIC_FILTERS)).toEqual({});
  });

  it("sends only the bounds that are set", () => {
    expect(
      metricFilterParams({ ...NO_METRIC_FILTERS, minWikipediaSitelinks: 20 }),
    ).toEqual({ minWikipediaSitelinks: "20" });
  });
});
