// Behavioural tests for the `/api/reachable` contract. The Hono app is called
// through the same request handler Vercel uses, so these assert the status code
// and the JSON a client sees rather than any function inside the route.

import { describe, expect, it } from "vitest";
import { GET } from "@/app/api/[[...route]]/route";

const HAMBURG = "2911298";

type ReachableBody = {
  error?: string;
  measuredOn?: string;
  origin?: { cityId: string; name: string };
  destinations?: { cityId: string; minutes: number }[];
};

async function reachable(query: string): Promise<Response> {
  return GET(new Request(`http://localhost/api/reachable?${query}`));
}

async function readBody(response: Response): Promise<ReachableBody> {
  return (await response.json()) as ReachableBody;
}

describe("GET /api/reachable", () => {
  it("returns the origin and the destinations inside the band", async () => {
    const response = await reachable(`origin=${HAMBURG}&minHours=0&maxHours=6`);

    expect(response.status).toBe(200);
    const body = await readBody(response);
    expect(body.origin).toMatchObject({ cityId: HAMBURG });
    expect(body.measuredOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(body.destinations!.length).toBeGreaterThan(0);
    expect(body.destinations!.every((city) => city.minutes <= 6 * 60)).toBe(
      true,
    );
  });

  it("never counts the origin as a destination", async () => {
    const response = await reachable(`origin=${HAMBURG}&minHours=0&maxHours=6`);
    const body = await readBody(response);

    expect(response.status).toBe(200);
    expect(
      body.destinations!.find((city) => city.cityId === HAMBURG),
    ).toBeUndefined();
  });

  it("treats a band no destination falls into as a result, not an error", async () => {
    const response = await reachable(`origin=${HAMBURG}&minHours=0&maxHours=0`);

    expect(response.status).toBe(200);
    const body = await readBody(response);
    expect(body.destinations).toEqual([]);
    expect(body.origin).toMatchObject({ cityId: HAMBURG });
  });

  const rejected: [string, string][] = [
    ["no origin", `minHours=0&maxHours=6`],
    ["an origin the pipeline never measured", `origin=1&minHours=0&maxHours=6`],
    ["no band at all", `origin=${HAMBURG}`],
    ["a missing lower bound", `origin=${HAMBURG}&maxHours=6`],
    ["a missing upper bound", `origin=${HAMBURG}&minHours=0`],
    ["a non-numeric bound", `origin=${HAMBURG}&minHours=one&maxHours=6`],
    ["a fractional bound", `origin=${HAMBURG}&minHours=0.5&maxHours=6`],
    ["a negative bound", `origin=${HAMBURG}&minHours=-1&maxHours=6`],
    ["a bound past the 12 hour cap", `origin=${HAMBURG}&minHours=0&maxHours=13`],
    ["an inverted band", `origin=${HAMBURG}&minHours=7&maxHours=6`],
    ["the single bound this replaced", `origin=${HAMBURG}&hours=6`],
  ];

  it.each(rejected)("rejects %s with a 400", async (_case, query) => {
    const response = await reachable(query);

    expect(response.status).toBe(400);
    expect((await readBody(response)).error).toBeTruthy();
  });
});
