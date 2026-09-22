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
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
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
 * The outcome of the latest request, keyed by the origin/hours/retry it answers.
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
  defaultHours: number;
};

export function MapView({
  origins,
  defaultOriginCityId,
  defaultHours,
}: MapViewProps) {
  const [originCityId, setOriginCityId] = useState(defaultOriginCityId);
  const [hours, setHours] = useState(defaultHours);
  const [attempt, setAttempt] = useState(0);
  const [response, setResponse] = useState<ReachableResponse | null>(null);
  const [outcome, setOutcome] = useState<RequestOutcome | null>(null);

  const queryKey = `${originCityId}|${hours}|${attempt}`;

  const originOptions = useMemo<OriginOption[]>(
    () => origins.map((origin) => ({ value: origin.cityId, label: origin.name })),
    [origins],
  );
  const selectedOrigin =
    originOptions.find((option) => option.value === originCityId) ?? null;
  const originName = selectedOrigin?.label ?? originCityId;

  useEffect(() => {
    const controller = new AbortController();

    fetch(`/api/reachable?origin=${originCityId}&hours=${hours}`, {
      signal: controller.signal,
    })
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
  }, [originCityId, hours, queryKey]);

  const loading = outcome?.key !== queryKey;
  const error = !loading && outcome?.status === "error" ? outcome.message : null;

  const cities = response?.cities ?? [];
  const reachableCount = Math.max(cities.length - 1, 0);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-bold">Destinations</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Pick an origin and a travel time to see every city a train reaches
          within it.
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
                Base UI forwards to its focusable range input. */}
            <Label id="travel-hours-label">Travel time</Label>
            <span className="text-sm font-medium tabular-nums">{hours} h</span>
          </div>
          <Slider
            id="travel-hours"
            className="py-2"
            min={1}
            max={12}
            step={1}
            // An array value keeps the slider single-thumb; a scalar makes the
            // shadcn wrapper's thumb-count fallback render two.
            value={[hours]}
            aria-labelledby="travel-hours-label"
            onValueChange={(value) =>
              setHours(Array.isArray(value) ? value[0] : value)
            }
            format={{ style: "unit", unit: "hour", unitDisplay: "long" }}
          />
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
              Loading cities reachable from {originName}…
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
            {reachableCount === 0
              ? `No city is reachable within ${hours} h of ${originName}. Increase the travel time or choose another origin.`
              : `${reachableCount} ${
                  reachableCount === 1 ? "city" : "cities"
                } reachable within ${hours} h of ${originName}.`}{" "}
            Estimates measured on {response.measuredOn}.
          </span>
        )}
      </div>

      {response === null ? (
        <MapPlaceholder>
          {loading
            ? "Loading the map…"
            : "No cities to draw — the request failed."}
        </MapPlaceholder>
      ) : (
        <div className="isolate h-[60vh] min-h-[360px] w-full overflow-hidden rounded-xl border">
          <ReachMap
            cities={cities}
            originCityId={response.originCityId}
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

function LegendDot({ color, size }: { color: string; size: number }) {
  return (
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
