import { DuckDBInstance, type DuckDBConnection } from "@duckdb/node-api";
import path from "node:path";

// `next.config.ts` traces this directory into the Vercel function, so the path
// resolves on a serverless build as well as locally.
export const trainsDataDir = path.join(
  process.cwd(),
  "python",
  "data",
  "trains",
);

let connectionPromise: Promise<DuckDBConnection> | undefined;

// One in-memory DuckDB per warm server instance. Opening a database and
// loading its native binding costs more than the queries this dataset needs.
export function trainsConnection(): Promise<DuckDBConnection> {
  connectionPromise ??= DuckDBInstance.create(":memory:").then((instance) =>
    instance.connect(),
  );
  return connectionPromise;
}
