import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // `@duckdb/node-api` loads a platform-specific `.node` binding, so it must
  // stay out of the bundle and be traced in as files instead.
  serverExternalPackages: ["@duckdb/node-api"],
  outputFileTracingIncludes: {
    "/*": [
      "./python/data/trains/*.parquet",
      "./node_modules/@duckdb/node-bindings-*/duckdb.node",
      "./node_modules/@duckdb/node-bindings-*/libduckdb.*",
    ],
  },
};

export default nextConfig;
