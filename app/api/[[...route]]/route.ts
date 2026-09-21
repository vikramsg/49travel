import path from "node:path";
import { Hono } from "hono";
import { handle } from "hono/vercel";
import { trainsConnection, trainsDataDir } from "@/lib/duckdb";

export const runtime = "nodejs";

const app = new Hono().basePath("/api");

// Proves the native DuckDB client reads the committed Parquet. The map's
// `/api/reachable` query arrives in the next layer.
app.get("/health", async (c) => {
  const connection = await trainsConnection();
  const reader = await connection.runAndReadAll(
    "SELECT count(*) FROM read_parquet(?)",
    [path.join(trainsDataDir, "city.parquet")],
  );
  const [[cityCount]] = reader.getRows();
  return c.json({ status: "ok", cityCount: Number(cityCount) });
});

export const GET = handle(app);
