// The per-metric destination filters that the map's filter form and
// `/api/reachable` both agree on. Defined once so the two cannot drift apart,
// the same way `lib/hours-band.ts` holds the travel-time range.
//
// Each metric is a bound of its own. Nothing here combines them into a score: a
// score would hide which signal moved a destination and would have to be
// re-tuned whenever a metric changed.
//
// The values are the columns `python/src/trains/metrics.py` builds into
// `city_metric.parquet`. "Nearby" is that build's own radius, so the labels do
// not have to repeat it: 30 km for a World Heritage Site, 5 km for a mapped
// tourism feature, and 10 km for the station whose category is used.

// Each ceiling is above the largest value the committed artifact holds, so the
// strongest filter the data supports can still be asked for. Paris's 366
// language editions, 39 World Heritage Sites near one city, and 869 mapped
// sights near one city are today's maxima.

/** A city's Wikipedia article has at most a few hundred language editions. */
export const MAX_SITELINK_FILTER = 400;

/** A dense centre can have a few thousand mapped tourism features within 5 km. */
export const MAX_POI_FILTER = 1000;

/** A handful of World Heritage Sites can share one city's thirty kilometres. */
export const MAX_UNESCO_FILTER = 40;

/** Deutsche Bahn numbers its stations from 1, the largest, to 7, the smallest. */
export const MIN_STATION_CATEGORY = 1;
export const MAX_STATION_CATEGORY = 7;

/**
 * A bound for each metric, to leave it unfiltered.
 *
 * The four "at least" bounds are unfiltered at 0, which is why every city has
 * one. The station category has no equivalent — category 0 does not exist — so
 * `null` is how that one is left alone.
 */
export type MetricFilters = {
  /** At least this many language editions of the city's Wikipedia article. */
  minWikipediaSitelinks: number;
  /** 1 to require an English Wikivoyage article, 0 to accept either. */
  minWikivoyageArticles: number;
  /** At least this many World Heritage Sites within 30 km. */
  minUnescoSites: number;
  /** At least this many mapped tourism features within 5 km. */
  minTourismPois: number;
  /** At most this Deutsche Bahn station category, or null to accept any. */
  maxDbStationCategory: number | null;
};

export type MetricFilterName = keyof MetricFilters;

export const NO_METRIC_FILTERS: MetricFilters = {
  minWikipediaSitelinks: 0,
  minWikivoyageArticles: 0,
  minUnescoSites: 0,
  minTourismPois: 0,
  maxDbStationCategory: null,
};

/**
 * What the map opens on, so its first view is the destinations worth travelling
 * for rather than every stop the range reaches. The API's own default stays
 * unfiltered: a caller asking for a band should get the band, and only the map
 * chooses to open narrow.
 *
 * Two metrics narrow it, in this order: Wikipedia language editions first,
 * which is the broad "is this place known at all" cut, and then the mapped
 * sights within 5 km, which keeps the ones with something to see. Neither cut is
 * picked, both are measured against the default view: 60 language editions
 * leaves 227 of the 976 destinations Hamburg reaches in six hours and 228 of
 * Berlin's 1032, and adding the 50-sight cut leaves 103 and 98.
 *
 * The other three metrics stay off. They are filters of their own rather than
 * part of what "popular" means, so the map does not decide them for the visitor.
 */
export const DEFAULT_METRIC_FILTERS: MetricFilters = {
  ...NO_METRIC_FILTERS,
  minWikipediaSitelinks: 60,
  minTourismPois: 50,
};

/**
 * The filters with one metric set to a bound. Written as one branch per metric
 * rather than an indexed assignment, because the station category is the one
 * whose bound is nullable and a computed key over the union would not type.
 */
export function withMetricBound(
  filters: MetricFilters,
  name: MetricFilterName,
  bound: number,
): MetricFilters {
  switch (name) {
    case "minWikipediaSitelinks":
      return { ...filters, minWikipediaSitelinks: bound };
    case "minWikivoyageArticles":
      return { ...filters, minWikivoyageArticles: bound };
    case "minUnescoSites":
      return { ...filters, minUnescoSites: bound };
    case "minTourismPois":
      return { ...filters, minTourismPois: bound };
    case "maxDbStationCategory":
      // The map's slider has one off position, at zero, and a category of zero
      // does not exist. So zero becomes null here rather than being sent, and
      // the API's own range for this parameter stays 1 to 7.
      return {
        ...filters,
        maxDbStationCategory: bound === 0 ? null : bound,
      };
  }
}

/** One metric's filter: its label for a person, and the values it accepts. */
export type MetricFilterSpec = {
  name: MetricFilterName;
  /** How the map's form words it. The route names the query parameter instead. */
  label: string;
  min: number;
  max: number;
  /**
   * How far the map's slider moves at a time. The scales are wide and the
   * interesting part of most of them is near zero, so a step of one would make
   * the low end unreachable by drag.
   */
  step: number;
};

export const METRIC_FILTER_SPECS: readonly MetricFilterSpec[] = [
  {
    name: "minWikipediaSitelinks",
    label: "Wikipedia languages",
    min: 0,
    max: MAX_SITELINK_FILTER,
    step: 5,
  },
  {
    name: "minWikivoyageArticles",
    label: "Wikivoyage articles",
    min: 0,
    max: 1,
    step: 1,
  },
  {
    name: "minUnescoSites",
    label: "World Heritage Sites nearby",
    min: 0,
    max: MAX_UNESCO_FILTER,
    step: 1,
  },
  {
    name: "minTourismPois",
    label: "Mapped sights nearby",
    min: 0,
    max: MAX_POI_FILTER,
    step: 5,
  },
  {
    name: "maxDbStationCategory",
    label: "Station category at most",
    min: MIN_STATION_CATEGORY,
    max: MAX_STATION_CATEGORY,
    step: 1,
  },
];

export function metricFilterSpec(name: MetricFilterName): MetricFilterSpec {
  const spec = METRIC_FILTER_SPECS.find((candidate) => candidate.name === name);
  if (!spec) {
    // Unreachable while `MetricFilterName` and `METRIC_FILTER_SPECS` agree, and a
    // missing label is worse than a crash if they ever stop agreeing.
    throw new Error(`no filter spec for ${name}`);
  }
  return spec;
}

// A leading minus reaches the range check and is reported as out of range
// rather than as a malformed number, as in `lib/hours-band.ts`.
const WHOLE_NUMBER = /^-?\d+$/;

/**
 * Why a filter cannot be applied. Each caller words this for its own audience:
 * the route names the query parameter, the form names the metric.
 */
export type MetricFilterProblem = {
  name: MetricFilterName;
  kind: "not-whole-number" | "out-of-range";
};

/** The filters to apply, or the first bound that cannot be applied. */
export type MetricFilterResult =
  | { filters: MetricFilters }
  | { problem: MetricFilterProblem };

/**
 * Reads every metric bound from untrusted text — the query string on the server,
 * the form's inputs in the browser. An absent or empty bound leaves its metric
 * unfiltered, which is what makes each filter independent.
 */
export function parseMetricFilters(
  read: (name: MetricFilterName) => string | null | undefined,
): MetricFilterResult {
  const values: Record<MetricFilterName, number | null> = {
    minWikipediaSitelinks: null,
    minWikivoyageArticles: null,
    minUnescoSites: null,
    minTourismPois: null,
    maxDbStationCategory: null,
  };

  for (const spec of METRIC_FILTER_SPECS) {
    const text = read(spec.name);
    if (text === null || text === undefined || text === "") continue;
    if (!WHOLE_NUMBER.test(text)) {
      return { problem: { name: spec.name, kind: "not-whole-number" } };
    }
    const value = Number(text);
    if (value < spec.min || value > spec.max) {
      return { problem: { name: spec.name, kind: "out-of-range" } };
    }
    values[spec.name] = value;
  }

  return {
    filters: {
      minWikipediaSitelinks: values.minWikipediaSitelinks ?? 0,
      minWikivoyageArticles: values.minWikivoyageArticles ?? 0,
      minUnescoSites: values.minUnescoSites ?? 0,
      minTourismPois: values.minTourismPois ?? 0,
      maxDbStationCategory: values.maxDbStationCategory,
    },
  };
}

/**
 * The bound a metric is narrowed by, or null when it is left unfiltered. Zero and
 * null both mean "no bound", which is the one rule that makes each filter
 * independent; the query builder, the request parameters and the form's own
 * count all ask it here rather than each deciding for itself.
 */
export function activeMetricBound(
  filters: MetricFilters,
  name: MetricFilterName,
): number | null {
  const value = filters[name];
  return value === null || value === 0 ? null : value;
}

/** The applied filters as the query parameters `/api/reachable` reads. */
export function metricFilterParams(
  filters: MetricFilters,
): Record<string, string> {
  const params: Record<string, string> = {};
  for (const spec of METRIC_FILTER_SPECS) {
    const bound = activeMetricBound(filters, spec.name);
    if (bound !== null) {
      params[spec.name] = String(bound);
    }
  }
  return params;
}
