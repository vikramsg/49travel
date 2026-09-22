// Server-side reads of the committed map Parquet under `python/data/trains/`.
// `app/map/page.tsx` loads the origin list from here and `app/api/[[...route]]`
// answers reachability from here, so the origin set and the reachability filter
// are defined once rather than repeated per caller.

import path from "node:path";
import { trainsConnection, trainsDataDir } from "@/lib/duckdb";

const travelTimeParquet = path.join(trainsDataDir, "travel_time.parquet");
const cityParquet = path.join(trainsDataDir, "city.parquet");

/** A city the map draws, as returned by `GET /api/reachable`. */
export type ReachableCity = {
  /** GeoNames id. A string because the ids are identifiers, not quantities. */
  cityId: string;
  name: string;
  latitude: number;
  longitude: number;
  /** Minutes from leaving the origin station, per the pipeline's definition. */
  minutes: number;
};

/**
 * The `/api/reachable` response. Defined beside the SQL that fills it so the
 * route and the map client cannot drift apart.
 */
export type ReachableResponse = {
  /** The timetable day the pipeline measured on, read from Parquet metadata. */
  measuredOn: string;
  originCityId: string;
  /** The origin is included, with `minutes` 0, so the map can mark it. */
  cities: ReachableCity[];
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
 * Cities within `withinMinutes` of `originCityId`, the origin included at
 * `minutes` 0. Reachability is not stored, so it is this comparison — not a
 * precomputed flag — that the hours slider drives.
 *
 * An unknown origin yields an empty list: every measured origin reaches itself,
 * so its own row is always present at any `withinMinutes` of at least 0.
 */
export async function reachableCities(
  originCityId: string,
  withinMinutes: number,
): Promise<ReachableCity[]> {
  const connection = await trainsConnection();
  const reader = await connection.runAndReadAll(
    `SELECT t.city_id AS city_id, c.name AS name, c.latitude AS latitude,
            c.longitude AS longitude, t.minutes AS minutes
     FROM read_parquet(?) AS t
     JOIN read_parquet(?) AS c ON c.city_id = t.city_id
     WHERE t.origin_city_id = ? AND t.minutes <= ?
     ORDER BY t.minutes, c.name`,
    [travelTimeParquet, cityParquet, originCityId, withinMinutes],
  );
  return reader.getRowObjectsJS().map((row) => ({
    cityId: row.city_id as string,
    name: row.name as string,
    latitude: Number(row.latitude),
    longitude: Number(row.longitude),
    minutes: Number(row.minutes),
  }));
}
