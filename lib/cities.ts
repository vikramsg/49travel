// The single list of €49 origin cities. The Home cards, the `/origin/[city]`
// routes and the per-city destination data all read from here, so adding an
// origin is one entry plus its generated JSON.

export type Destination = {
  city: string;
  url: string;
  /** Journey time in seconds, as emitted by `travel49.city_json`. */
  journey_time: number;
  stops: number;
  origin_stop: number;
  destination_stop: number;
  description: string;
};

export type OriginCity = {
  /** URL segment under `/origin/`, and the file name of the generated JSON. */
  slug: string;
  /** The label the UI shows; an English exonym where one exists (Munich, Cologne). */
  name: string;
  /** The regional origin stop the journey search used, from the generated JSON. */
  originStopId: number;
  /** City centre, from the seed database's `cities_lat_lon` table. */
  latitude: number;
  longitude: number;
  loadDestinations: () => Promise<Destination[]>;
};

export const originCities: OriginCity[] = [
  {
    slug: "hamburg",
    name: "Hamburg",
    originStopId: 8096009,
    latitude: 53.55,
    longitude: 10.0,
    loadDestinations: async () =>
      (await import("@/python/data/travel49/hamburg.json")).default.cities,
  },
  {
    slug: "berlin",
    name: "Berlin",
    originStopId: 8011160,
    latitude: 52.52,
    longitude: 13.405,
    loadDestinations: async () =>
      (await import("@/python/data/travel49/berlin.json")).default.cities,
  },
  {
    slug: "munich",
    name: "Munich",
    originStopId: 8000261,
    latitude: 48.1375,
    longitude: 11.575,
    loadDestinations: async () =>
      (await import("@/python/data/travel49/munich.json")).default.cities,
  },
  {
    slug: "dusseldorf",
    name: "Düsseldorf",
    originStopId: 8000085,
    latitude: 51.23333333,
    longitude: 6.78333333,
    loadDestinations: async () =>
      (await import("@/python/data/travel49/düsseldorf.json")).default.cities,
  },
  {
    slug: "frankfurt",
    name: "Frankfurt",
    originStopId: 8096021,
    latitude: 50.11055556,
    longitude: 8.68222222,
    loadDestinations: async () =>
      (await import("@/python/data/travel49/frankfurt.json")).default.cities,
  },
  {
    slug: "cologne",
    name: "Cologne",
    originStopId: 8096022,
    latitude: 50.93638889,
    longitude: 6.95277778,
    loadDestinations: async () =>
      (await import("@/python/data/travel49/cologne.json")).default.cities,
  },
  {
    slug: "stuttgart",
    name: "Stuttgart",
    originStopId: 8000096,
    latitude: 48.7775,
    longitude: 9.18,
    loadDestinations: async () =>
      (await import("@/python/data/travel49/stuttgart.json")).default.cities,
  },
];

export function getOriginCity(slug: string): OriginCity | undefined {
  return originCities.find((city) => city.slug === slug);
}
