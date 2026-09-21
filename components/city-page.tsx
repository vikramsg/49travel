"use client";

import { useState } from "react";
import { formatDuration, intervalToDuration } from "date-fns";
import { ChevronDown, ChevronUp } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Destination } from "@/lib/cities";

const CARDS_PER_PAGE = 30;

type CityPageProps = {
  /** Regional origin stop, used to build the bahn.de live-status link. */
  originStopId: number;
  destinations: Destination[];
};

export function CityPage({ originStopId, destinations }: CityPageProps) {
  const [expandedCards, setExpandedCards] = useState<Set<number>>(new Set());
  const [visibleCount, setVisibleCount] = useState(CARDS_PER_PAGE);

  const visibleDestinations = destinations.slice(0, visibleCount);
  const hasMore = visibleCount < destinations.length;

  function toggleCard(index: number) {
    setExpandedCards((previous) => {
      const next = new Set(previous);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  }

  return (
    <main className="mx-auto mt-6 max-w-7xl px-4">
      <div className="grid gap-6 md:grid-cols-2">
        {visibleDestinations.map((destination, index) => {
          const expanded = expandedCards.has(index);
          const liveStatusUrl =
            "https://mobile.bahn.de/bin/query.exe/dox" +
            `?S=${originStopId}&Z=${destination.destination_stop}` +
            "&timeSel=depart&start=1&journeyProducts=1100";

          return (
            // The generated JSON repeats some destinations (Würzburg appears
            // four times from Hamburg, with the same name and stop id), so no
            // domain field is unique. The visible list is a stable prefix —
            // pagination only appends — so the row index is the unique key.
            <Card key={index} className="relative">
              <CardHeader className="border-b bg-muted/50">
                <CardTitle className="text-xl">{destination.city}</CardTitle>
              </CardHeader>
              <CardContent>
                <p>
                  Journey time is{" "}
                  {formatDuration(
                    intervalToDuration({
                      start: 0,
                      end: destination.journey_time * 1000,
                    }),
                  )}{" "}
                  with {destination.stops}{" "}
                  {destination.stops === 1 ? "stop" : "stops"}.
                </p>
                {expanded && (
                  <>
                    <a
                      href={liveStatusUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={buttonVariants({ size: "sm", className: "mt-3" })}
                    >
                      Live Status
                    </a>
                    <p className="mt-3">{destination.description}</p>
                    <p className="mt-3">
                      Find out more at{" "}
                      <a
                        href={destination.url}
                        className="text-primary underline"
                      >
                        WikiVoyage
                      </a>
                      .
                    </p>
                  </>
                )}
                <button
                  type="button"
                  aria-expanded={expanded}
                  aria-label={
                    expanded
                      ? `Hide details for ${destination.city}`
                      : `Show details for ${destination.city}`
                  }
                  onClick={() => toggleCard(index)}
                  className="absolute right-2 bottom-2 rounded-md p-1 text-muted-foreground outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  {expanded ? (
                    <ChevronUp className="size-4" />
                  ) : (
                    <ChevronDown className="size-4" />
                  )}
                </button>
              </CardContent>
            </Card>
          );
        })}
      </div>
      {hasMore && (
        <div className="mt-6 text-center">
          <Button onClick={() => setVisibleCount((count) => count + CARDS_PER_PAGE)}>
            Show More
          </Button>
        </div>
      )}
    </main>
  );
}
