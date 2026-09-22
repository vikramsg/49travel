import { Hono } from "hono";
import { handle } from "hono/vercel";
import { parseHoursBand } from "@/lib/hours-band";
import {
  cityCount,
  destinationsBetween,
  measuredOn,
  originCity,
} from "@/lib/trains";

export const runtime = "nodejs";

const app = new Hono().basePath("/api");

// `/health` proves the native DuckDB client reads the committed city.parquet.
app.get("/health", async (c) => {
  return c.json({ status: "ok", cityCount: await cityCount() });
});

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
  if ("error" in parsed) {
    return c.json({ error: parsed.error }, 400);
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
  return c.json({
    measuredOn: measured,
    origin,
    destinations,
  });
});

export const GET = handle(app);
