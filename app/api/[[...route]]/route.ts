import { Hono } from "hono";
import { handle } from "hono/vercel";
import { cityCount, measuredOn, reachableCities } from "@/lib/trains";

export const runtime = "nodejs";

const app = new Hono().basePath("/api");

// `/health` proves the native DuckDB client reads the committed city.parquet.
app.get("/health", async (c) => {
  return c.json({ status: "ok", cityCount: await cityCount() });
});

// The hours range is a product limit, not a data limit: `travel_time` is capped
// at 12 hours, so a longer request could only return the same 12-hour result.
const MIN_HOURS = 1;
const MAX_HOURS = 12;
const WHOLE_HOURS = /^\d+$/;

/**
 * Reachability from one origin within a whole number of hours.
 * See `docs/data_notes.md` for what `minutes` means and how it is measured.
 */
app.get("/reachable", async (c) => {
  const origin = c.req.query("origin");
  const hoursParam = c.req.query("hours");

  if (!origin) {
    return c.json(
      { error: "origin is required, e.g. ?origin=2911298" },
      400,
    );
  }
  if (!WHOLE_HOURS.test(hoursParam ?? "")) {
    return c.json(
      { error: `hours must be a whole number from ${MIN_HOURS} to ${MAX_HOURS}` },
      400,
    );
  }
  const hours = Number(hoursParam);
  if (hours < MIN_HOURS || hours > MAX_HOURS) {
    return c.json(
      { error: `hours must be a whole number from ${MIN_HOURS} to ${MAX_HOURS}` },
      400,
    );
  }

  const cities = await reachableCities(origin, hours * 60);
  if (cities.length === 0) {
    return c.json(
      { error: `unknown origin ${origin}; choose one of the origins on /map` },
      400,
    );
  }

  const measured = await measuredOn();
  return c.json({
    measuredOn: measured,
    originCityId: origin,
    cities,
  });
});

export const GET = handle(app);
