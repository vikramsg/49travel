"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import { LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@/components/ui/combobox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import {
  MAX_BAND_HOURS,
  MIN_BAND_HOURS,
  parseHoursBand,
  type HoursBand,
  type HoursBandProblem,
} from "@/lib/hours-band";
import type { ReachableResponse, SupportedOrigin } from "@/lib/trains";

const ReachMap = dynamic(
  () => import("@/components/reach-map").then((module) => module.ReachMap),
  { ssr: false },
);

// The legend and the markers read the same constants, so they cannot disagree.
const ORIGIN_COLOR = "#0d6efd";
const CITY_COLOR = "#dc3545";

type OriginOption = {
  value: string;
  label: string;
};

/**
 * The outcome of the latest request, keyed by the origin/band/retry it answers.
 * Its key is how an in-flight request is detected without a separate `loading`
 * flag. A stale response can never win: the request is aborted on the next
 * change and its key no longer matches. The response itself is stored apart
 * from this (see `MapView`) so that loading and errors do not discard it.
 */
type RequestOutcome =
  | { key: string; status: "ready" }
  | { key: string; status: "error"; message: string };

type MapViewProps = {
  origins: SupportedOrigin[];
  defaultOriginCityId: string;
  defaultMinHours: number;
  defaultMaxHours: number;
};

export function MapView({
  origins,
  defaultOriginCityId,
  defaultMinHours,
  defaultMaxHours,
}: MapViewProps) {
  const [originCityId, setOriginCityId] = useState(defaultOriginCityId);
  const [band, setBand] = useState<HoursBand>({
    minHours: defaultMinHours,
    maxHours: defaultMaxHours,
  });
  // The form's text is held apart from the applied band so that a half-typed
  // bound neither redraws the map nor fires a request for an invalid range.
  const [minText, setMinText] = useState(String(defaultMinHours));
  const [maxText, setMaxText] = useState(String(defaultMaxHours));
  const [bandError, setBandError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [response, setResponse] = useState<ReachableResponse | null>(null);
  const [outcome, setOutcome] = useState<RequestOutcome | null>(null);

  const { minHours, maxHours } = band;
  const queryKey = `${originCityId}|${minHours}|${maxHours}|${attempt}`;

  const originOptions = useMemo<OriginOption[]>(
    () => origins.map((origin) => ({ value: origin.cityId, label: origin.name })),
    [origins],
  );
  const selectedOrigin =
    originOptions.find((option) => option.value === originCityId) ?? null;
  const originName = selectedOrigin?.label ?? originCityId;

  useEffect(() => {
    const controller = new AbortController();
    const query = new URLSearchParams({
      origin: originCityId,
      minHours: String(minHours),
      maxHours: String(maxHours),
    });

    fetch(`/api/reachable?${query}`, { signal: controller.signal })
      .then(async (result) => {
        if (!result.ok) {
          const body = (await result.json().catch(() => null)) as {
            error?: string;
          } | null;
          throw new Error(body?.error ?? `Request failed (${result.status})`);
        }
        return (await result.json()) as ReachableResponse;
      })
      .then((data) => {
        if (controller.signal.aborted) return;
        setResponse(data);
        setOutcome({ key: queryKey, status: "ready" });
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        setOutcome({
          key: queryKey,
          status: "error",
          message: cause instanceof Error ? cause.message : "Request failed",
        });
      });

    return () => controller.abort();
  }, [originCityId, minHours, maxHours, queryKey]);

  const loading = outcome?.key !== queryKey;
  const error = !loading && outcome?.status === "error" ? outcome.message : null;

  const destinations = response?.destinations ?? [];
  const destinationCount = destinations.length;

  /** The one place the applied band changes: the slider and the form both go through it. */
  function applyBand(next: HoursBand) {
    setBand(next);
    setMinText(String(next.minHours));
    setMaxText(String(next.maxHours));
    setBandError(null);
  }

  function applyTypedBand(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = parseHoursBand(minText, maxText);
    if ("problem" in parsed) {
      setBandError(bandProblemText(parsed.problem, minText, maxText));
      return;
    }
    applyBand(parsed.band);
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-bold">Destinations</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Pick an origin and a travel-time range to see the destinations a train
          reaches between them.
        </p>
      </div>

      <div className="grid gap-6 rounded-xl border p-4 md:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="origin-selector">Origin city</Label>
          <Combobox
            items={originOptions}
            value={selectedOrigin}
            onValueChange={(option) => {
              if (option) setOriginCityId(option.value);
            }}
          >
            <ComboboxInput
              id="origin-selector"
              placeholder="Search a city"
              className="w-full"
              // Selecting the current name on focus means the first keystroke
              // replaces it instead of appending to it, so a search works
              // without the user clearing the field first.
              onFocus={(event) => event.currentTarget.select()}
            />
            <ComboboxContent>
              <ComboboxList>
                {(option: OriginOption) => (
                  <ComboboxItem key={option.value} value={option}>
                    {option.label}
                  </ComboboxItem>
                )}
              </ComboboxList>
              <ComboboxEmpty>No city matches that search.</ComboboxEmpty>
            </ComboboxContent>
          </Combobox>
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            {/* The slider points at this label through aria-labelledby, which
                Base UI forwards to its focusable range inputs. */}
            <Label id="travel-band-label">Travel time</Label>
            <span className="text-sm font-medium tabular-nums">
              {minHours}–{maxHours} h
            </span>
          </div>
          <Slider
            id="travel-band"
            className="py-2"
            min={MIN_BAND_HOURS}
            max={MAX_BAND_HOURS}
            step={1}
            // An array value keeps the slider two-thumb: a scalar makes the
            // shadcn wrapper's thumb-count fallback render a range it does not
            // have, and a range is what a band needs.
            value={[minHours, maxHours]}
            aria-labelledby="travel-band-label"
            onValueChange={(value) => {
              const [min, max] = Array.isArray(value)
                ? value
                : [value, value];
              applyBand({ minHours: min, maxHours: max });
            }}
            format={{ style: "unit", unit: "hour", unitDisplay: "long" }}
          />
          {/* The slider cannot express a band it cannot draw, so the typed form
              is the second way in: it is the only way to set a bound exactly and
              it is where an unusable pair is reported. */}
          <form
            className="flex flex-wrap items-end gap-2 pt-1"
            onSubmit={applyTypedBand}
          >
            <div className="flex flex-col gap-1">
              <Label htmlFor="band-min-hours" className="text-xs">
                Minimum (h)
              </Label>
              <Input
                id="band-min-hours"
                className="h-8 w-20"
                inputMode="numeric"
                value={minText}
                aria-invalid={bandError !== null}
                aria-describedby={bandError ? "band-error" : undefined}
                onChange={(event) => setMinText(event.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="band-max-hours" className="text-xs">
                Maximum (h)
              </Label>
              <Input
                id="band-max-hours"
                className="h-8 w-20"
                inputMode="numeric"
                value={maxText}
                aria-invalid={bandError !== null}
                aria-describedby={bandError ? "band-error" : undefined}
                onChange={(event) => setMaxText(event.target.value)}
              />
            </div>
            <Button type="submit" size="sm" variant="outline">
              Set
            </Button>
          </form>
          {bandError && (
            <p id="band-error" role="alert" className="text-xs text-destructive">
              {bandError}
            </p>
          )}
        </div>
      </div>

      {/* A fixed height keeps the map's top edge in the same place whether the
          line holds one short line or the long mobile empty message, so no
          result changes shift the map. `h-28` fits the longest of those at
          390 px; `md:h-12` is enough once the copy fits one line. */}
      <div
        role={error ? "alert" : "status"}
        aria-live="polite"
        className="flex h-28 flex-wrap items-center gap-2 text-sm md:h-12"
      >
        {loading && (
          <>
            <LoaderCircle className="size-4 animate-spin" aria-hidden />
            <span className="text-muted-foreground">
              Loading destinations between {minHours} h and {maxHours} h of{" "}
              {originName}…
            </span>
          </>
        )}
        {error && (
          <>
            <span>{error}</span>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setAttempt((count) => count + 1)}
            >
              Retry
            </Button>
          </>
        )}
        {!loading && !error && response && (
          <span className="text-muted-foreground">
            {destinationCount === 0
              ? `No destination is between ${minHours} h and ${maxHours} h of ${originName}. Widen the range or choose another origin.`
              : `${destinationCount} ${
                  destinationCount === 1 ? "destination" : "destinations"
                } between ${minHours} h and ${maxHours} h of ${originName}.`}{" "}
            Estimates measured on {response.measuredOn}.
          </span>
        )}
      </div>

      {response === null ? (
        <MapPlaceholder>
          {loading
            ? "Loading the map…"
            : "No destinations to draw — the request failed."}
        </MapPlaceholder>
      ) : (
        <div className="isolate h-[60vh] min-h-[360px] w-full overflow-hidden rounded-xl border">
          <ReachMap
            destinations={destinations}
            origin={response.origin}
            originColor={ORIGIN_COLOR}
            cityColor={CITY_COLOR}
          />
        </div>
      )}

      <ul className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-muted-foreground">
        <li className="flex items-center gap-2">
          <LegendDot color={ORIGIN_COLOR} size={14} />
          Origin
        </li>
        <li className="flex items-center gap-2">
          <LegendDot color={CITY_COLOR} size={10} />
          Destination
        </li>
      </ul>
    </div>
  );
}

/**
 * The form's wording for a rejected range. The same problems are worded for the
 * API in `app/api/[[...route]]/route.ts`, which names query parameters instead.
 */
function bandProblemText(
  problem: HoursBandProblem,
  minText: string,
  maxText: string,
): string {
  switch (problem) {
    case "not-whole-hours":
      return "Both bounds must be whole hours.";
    case "out-of-range":
      return `Both bounds must be between ${MIN_BAND_HOURS} and ${MAX_BAND_HOURS} h.`;
    case "minimum-above-maximum":
      return `Minimum (${minText}) must not exceed maximum (${maxText}).`;
  }
}

function LegendDot({ color, size }: { color: string; size: number }) {  return (
    <span
      aria-hidden
      className="rounded-full border-2 border-white"
      style={{
        width: size,
        height: size,
        backgroundColor: color,
        boxShadow: `0 0 0 1px ${color}`,
      }}
    />
  );
}

function MapPlaceholder({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-[60vh] min-h-[360px] w-full items-center justify-center rounded-xl border bg-muted/40 text-sm text-muted-foreground">
      {children}
    </div>
  );
}
