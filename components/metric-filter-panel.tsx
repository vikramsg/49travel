"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  EMPTY_METRIC_FILTER_TEXT,
  METRIC_FILTER_SPECS,
  NO_METRIC_FILTERS,
  activeMetricBound,
  metricFilterSpec,
  metricFilterText,
  parseMetricFilters,
  type MetricFilterName,
  type MetricFilterProblem,
  type MetricFilters,
} from "@/lib/city-metric-filters";

/**
 * The five metric filters, behind one button.
 *
 * Collapsed by default, and the five keep whatever is applied while it is
 * closed: the map opens on `DEFAULT_METRIC_FILTERS`, so the first thing a
 * visitor sees is the destinations worth travelling for rather than every stop
 * the range reaches. "Show all destinations" is always there so that opening
 * narrow is not a dead end.
 *
 * The draft text lives here rather than in `MapView`, because a half-typed bound
 * must not redraw the map and so nothing outside this panel needs to see it.
 */
export function MetricFilterPanel({
  filters,
  onApply,
}: {
  filters: MetricFilters;
  onApply: (filters: MetricFilters) => void;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState<Record<MetricFilterName, string>>(() =>
    metricFilterText(filters),
  );
  const [problem, setProblem] = useState<MetricFilterProblem | null>(null);

  const activeCount = METRIC_FILTER_SPECS.filter(
    (spec) => activeMetricBound(filters, spec.name) !== null,
  ).length;

  function apply(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = parseMetricFilters((name) => text[name]);
    if ("problem" in parsed) {
      setProblem(parsed.problem);
      return;
    }
    setProblem(null);
    onApply(parsed.filters);
  }

  function showAll() {
    setText(EMPTY_METRIC_FILTER_TEXT);
    setProblem(null);
    setOpen(false);
    onApply(NO_METRIC_FILTERS);
  }

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

      {open ? (
        <form className="flex flex-col gap-3" onSubmit={apply}>
          <p className="text-xs text-muted-foreground">
            Each one narrows the map on its own. A blank bound asks nothing of
            that metric.
          </p>
          {METRIC_FILTER_SPECS.map((spec) => (
            <div key={spec.name} className="flex flex-col gap-1">
              <Label htmlFor={`filter-${spec.name}`} className="text-xs">
                {spec.label}
              </Label>
              <Input
                id={`filter-${spec.name}`}
                className="h-8"
                inputMode="numeric"
                placeholder="Any"
                value={text[spec.name]}
                aria-invalid={problem?.name === spec.name}
                aria-describedby={
                  problem?.name === spec.name ? "filter-error" : undefined
                }
                onChange={(event) =>
                  setText({ ...text, [spec.name]: event.target.value })
                }
              />
            </div>
          ))}
          <div className="flex flex-wrap items-center gap-2">
            <Button type="submit" size="sm" variant="outline">
              Apply filters
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={showAll}>
              Clear
            </Button>
          </div>
          {problem && (
            <p
              id="filter-error"
              role="alert"
              className="text-xs text-destructive"
            >
              {filterProblemText(problem)}
            </p>
          )}
        </form>
      ) : (
        activeCount > 0 && (
          <div className="flex flex-col gap-2">
            <p className="text-xs text-muted-foreground">
              The map is showing the destinations worth travelling for.
            </p>
            <Button type="button" size="sm" variant="ghost" onClick={showAll}>
              Show all destinations
            </Button>
          </div>
        )
      )}
    </div>
  );
}

/**
 * The form's wording for a rejected bound. The same problem is worded for the API
 * in `app/api/[[...route]]/route.ts`, which names the query parameter instead.
 */
function filterProblemText(problem: MetricFilterProblem): string {
  const { label, min, max } = metricFilterSpec(problem.name);
  if (problem.kind === "not-whole-number") {
    return `${label} must be a whole number.`;
  }
  return `${label} must be between ${min} and ${max}.`;
}
