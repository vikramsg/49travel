import { Hono } from "hono";
import { handle } from "hono/vercel";
import {
  MAX_BAND_HOURS,
  MIN_BAND_HOURS,
  parseHoursBand,
  type HoursBandProblem,
} from "@/lib/hours-band";
import {
  cityCount,
  destinationsBetween,
  measuredOn,
  originCity,
  type ReachableResponse,
} from "@/lib/trains";

export const runtime = "nodejs";

const app = new Hono().basePath("/api");

// `/health` proves the native DuckDB client reads the committed city.parquet.
app.get("/health", async (c) => {
  return c.json({ status: "ok", cityCount: await cityCount() });
});

// Written for whoever calls the endpoint, so it names the query parameters and
// gives an example. The map's form words the same problems for a person.
const BAND_ERROR: Record<HoursBandProblem, string> = {
  "not-whole-hours":
    "minHours and maxHours must be whole numbers, e.g. ?minHours=0&maxHours=6",
  "out-of-range": `minHours and maxHours must be from ${MIN_BAND_HOURS} to ${MAX_BAND_HOURS}`,
  "minimum-above-maximum": "minHours must not exceed maxHours",
};

/**
 * Destinations reachable from one origin within a whole-hour travel-time band,
 * both bounds inclusive. See `docs/data_notes.md` for what `minutes` means and
 * how it is measured.
 */
app.get("/reachable", async (c) => {
  const originParam = c.req.query("origin");

  if (!originParam) {
    return c.json(
      { error: "origin is required, e.g. ?origin=2911298" },
      400,
    );
  }

  const parsed = parseHoursBand(
    c.req.query("minHours"),
    c.req.query("maxHours"),
  );
  if ("problem" in parsed) {
    return c.json({ error: BAND_ERROR[parsed.problem] }, 400);
  }

  // An unknown origin cannot be told apart from a band with nothing in it by an
  // empty result, so it is looked up instead of inferred.
  const origin = await originCity(originParam);
  if (!origin) {
    return c.json(
      { error: `unknown origin ${originParam}; choose one of the origins on /map` },
      400,
    );
  }

  const destinations = await destinationsBetween(
    origin.cityId,
    parsed.band.minHours * 60,
    parsed.band.maxHours * 60,
  );

  const measured = await measuredOn();
  const payload: ReachableResponse = {
    measuredOn: measured,
    origin,
    destinations,
  };
  return c.json(payload);
});

export const GET = handle(app);
