"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import {
  METRIC_FILTER_SPECS,
  NO_METRIC_FILTERS,
  activeMetricBound,
  withMetricBound,
  type MetricFilters,
} from "@/lib/city-metric-filters";

/**
 * The five metric filters, behind one button, each of them a slider.
 *
 * Collapsed by default, and the five keep whatever is applied while it is
 * closed: the map opens on `DEFAULT_METRIC_FILTERS`, so the first thing a
 * visitor sees is the destinations worth travelling for rather than every stop
 * the range reaches. "Show all destinations" sits outside the disclosure so that
 * opening narrow is never a dead end.
 *
 * A slider applies as it moves rather than waiting for a button, the way the
 * travel-time band's does. Every position is a usable bound, so there is nothing
 * to validate and nothing to report: the leftmost position is the off one.
 */
export function MetricFilterPanel({
  filters,
  onApply,
}: {
  filters: MetricFilters;
  onApply: (filters: MetricFilters) => void;
}) {
  const [open, setOpen] = useState(false);

  const activeCount = METRIC_FILTER_SPECS.filter(
    (spec) => activeMetricBound(filters, spec.name) !== null,
  ).length;

  return (
    <div className="flex flex-col gap-3 rounded-xl border p-4">
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="justify-between"
        aria-expanded={open}
        onClick={() => setOpen((wasOpen) => !wasOpen)}
      >
        <span>Advanced filters</span>
        <span className="text-xs text-muted-foreground">
          {activeCount === 0 ? "none on" : `${activeCount} on`}
        </span>
      </Button>

      {open && (
        <div className="flex flex-col gap-4">
          <p className="text-xs text-muted-foreground">
            Each one narrows the map on its own. Left at the end it asks nothing
            of that metric.
          </p>
          {METRIC_FILTER_SPECS.map((spec) => {
            const bound = activeMetricBound(filters, spec.name) ?? 0;
            return (
              <div key={spec.name} className="flex flex-col gap-1">
                <div className="flex items-center justify-between gap-2">
                  {/* The slider points at this label through aria-labelledby,
                      which Base UI forwards to its focusable range input. */}
                  <Label id={`filter-${spec.name}-label`} className="text-xs">
                    {spec.label}
                  </Label>
                  <span className="text-xs font-medium tabular-nums">
                    {bound === 0 ? "Any" : bound}
                  </span>
                </div>
                <Slider
                  id={`filter-${spec.name}`}
                  className="py-1"
                  // Every scale starts at zero, which is the off position, even
                  // where the metric's own range starts at one: a station
                  // category of zero does not exist, and `withMetricBound` turns
                  // this zero into no bound rather than sending it.
                  min={0}
                  max={spec.max}
                  step={spec.step}
                  // An array keeps the thumb count honest. The wrapper falls back
                  // to a two-thumb range when it is handed a scalar, and each of
                  // these is a single bound.
                  value={[bound]}
                  aria-labelledby={`filter-${spec.name}-label`}
                  onValueChange={(value) => {
                    const next = Array.isArray(value) ? value[0] : value;
                    onApply(withMetricBound(filters, spec.name, next));
                  }}
                />
              </div>
            );
          })}
        </div>
      )}

      {activeCount > 0 && (
        <div className="flex flex-col gap-2">
          {!open && (
            <p className="text-xs text-muted-foreground">
              The map is showing the destinations worth travelling for.
            </p>
          )}
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => onApply(NO_METRIC_FILTERS)}
          >
            Show all destinations
          </Button>
        </div>
      )}
    </div>
  );
}
