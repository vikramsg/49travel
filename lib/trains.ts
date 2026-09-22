// Server-side reads of the committed map Parquet under `python/data/trains/`.
// `app/map/page.tsx` loads the origin list from here and `app/api/[[...route]]`
// answers reachability from here, so the origin set and the reachability filter
// are defined once rather than repeated per caller.

import path from "node:path";
import { trainsConnection, trainsDataDir } from "@/lib/duckdb";

const travelTimeParquet = path.join(trainsDataDir, "travel_time.parquet");
const cityParquet = path.join(trainsDataDir, "city.parquet");
const cityLinkParquet = path.join(trainsDataDir, "city_link.parquet");

/** A city inside the requested travel-time band, as returned by `GET /api/reachable`. */
export type Destination = {
  /** GeoNames id. A string because the ids are identifiers, not quantities. */
  cityId: string;
  name: string;
  latitude: number;
  longitude: number;
  /** Minutes from leaving the origin station, per the pipeline's definition. */
  minutes: number;
  /**
   * English Wikipedia article, or null when the pipeline resolved none for this
   * city. Null is a real answer: the map then shows no link rather than one that
   * leads somewhere else.
   */
  wikipediaUrl: string | null;
  /** English Wikivoyage article, or null. Wikivoyage covers fewer places. */
  wikivoyageUrl: string | null;
};

/**
 * Where a request starts. Kept apart from the destinations because the map draws
 * it whatever the band is, and because it is never somewhere you travel to.
 */
export type Origin = {
  /** GeoNames id, one of the ids `supportedOrigins()` returns. */
  cityId: string;
  name: string;
  latitude: number;
  longitude: number;
};

/**
 * The `/api/reachable` response. Defined beside the SQL that fills it so the
 * route and the map client cannot drift apart.
 */
export type ReachableResponse = {
  /** The timetable day the pipeline measured on, read from Parquet metadata. */
  measuredOn: string;
  origin: Origin;
  destinations: Destination[];
};

/** An origin the pipeline actually measured, i.e. a `travel_time` origin. */
export type SupportedOrigin = {
  cityId: string;
  name: string;
};

/**
 * The 96 origins present in `travel_time.parquet`. Cities the pipeline selected
 * as origins but could not measure have no station and therefore no rows, so
 * they are absent here and cannot be queried.
 */
export async function supportedOrigins(): Promise<SupportedOrigin[]> {
  const connection = await trainsConnection();
  const reader = await connection.runAndReadAll(
    `SELECT DISTINCT t.origin_city_id AS city_id, c.name AS name
     FROM read_parquet(?) AS t
     JOIN read_parquet(?) AS c ON c.city_id = t.origin_city_id
     ORDER BY c.name`,
    [travelTimeParquet, cityParquet],
  );
  return reader.getRowObjectsJS().map((row) => ({
    cityId: row.city_id as string,
    name: row.name as string,
  }));
}

/** Rows in `city.parquet`; `/api/health` uses it to prove the read works. */
export async function cityCount(): Promise<number> {
  const connection = await trainsConnection();
  const reader = await connection.runAndReadAll(
    "SELECT count(*) FROM read_parquet(?)",
    [cityParquet],
  );
  const [[count]] = reader.getRows();
  return Number(count);
}

/** The pipeline's measurement day, from the Parquet file's `measurement_date`. */
export async function measuredOn(): Promise<string> {
  const connection = await trainsConnection();
  const reader = await connection.runAndReadAll(
    `SELECT CAST(value AS VARCHAR) AS measured_on
     FROM parquet_kv_metadata(?)
     WHERE CAST(key AS VARCHAR) = 'measurement_date'`,
    [travelTimeParquet],
  );
  const [[value]] = reader.getRows();
  return String(value);
}

/**
 * The origin with this GeoNames id, or null when the pipeline never measured
 * it. The join is what makes an id supported: `travel_time` only has rows for
 * origins that produced measurable journeys, which is the same set
 * `supportedOrigins()` lists.
 *
 * Existence is answered here rather than by an empty destination list, because a
 * band that no destination falls into is a valid, empty result.
 */
export async function originCity(cityId: string): Promise<Origin | null> {
  const connection = await trainsConnection();
  const reader = await connection.runAndReadAll(
    `SELECT c.city_id AS city_id, c.name AS name, c.latitude AS latitude,
            c.longitude AS longitude
     FROM read_parquet(?) AS c
     JOIN read_parquet(?) AS t ON t.origin_city_id = c.city_id
     WHERE c.city_id = ?
     LIMIT 1`,
    [cityParquet, travelTimeParquet, cityId],
  );
  const [row] = reader.getRowObjectsJS();
  if (!row) return null;
  return {
    cityId: row.city_id as string,
    name: row.name as string,
    latitude: Number(row.latitude),
    longitude: Number(row.longitude),
  };
}

/**
 * Destinations reachable from `originCityId` in at least `minMinutes` and at
 * most `maxMinutes`, both bounds inclusive. The origin is not one of them: a
 * destination is somewhere you travel to, and `travel_time` gives the origin its
 * own row at 0 minutes only so that it can be drawn.
 *
 * Reachability is not stored, so it is this comparison — not a precomputed flag —
 * that the band drives. An origin the pipeline never measured has no rows at all
 * and therefore yields nothing.
 */
export async function destinationsBetween(
  originCityId: string,
  minMinutes: number,
  maxMinutes: number,
): Promise<Destination[]> {
  const connection = await trainsConnection();
  const reader = await connection.runAndReadAll(
    `SELECT t.city_id AS city_id, c.name AS name, c.latitude AS latitude,
            c.longitude AS longitude, t.minutes AS minutes,
            l.wikipedia_url AS wikipedia_url, l.wikivoyage_url AS wikivoyage_url
     FROM read_parquet(?) AS t
     JOIN read_parquet(?) AS c ON c.city_id = t.city_id
     LEFT JOIN read_parquet(?) AS l ON l.city_id = t.city_id
     WHERE t.origin_city_id = ? AND t.city_id <> t.origin_city_id
       AND t.minutes >= ? AND t.minutes <= ?
     ORDER BY t.minutes, c.name`,
    [
      travelTimeParquet,
      cityParquet,
      cityLinkParquet,
      originCityId,
      minMinutes,
      maxMinutes,
    ],
  );
  return reader.getRowObjectsJS().map((row) => ({
    cityId: row.city_id as string,
    name: row.name as string,
    latitude: Number(row.latitude),
    longitude: Number(row.longitude),
    minutes: Number(row.minutes),
    wikipediaUrl: (row.wikipedia_url as string | null) ?? null,
    wikivoyageUrl: (row.wikivoyage_url as string | null) ?? null,
  }));
}
