"use client";

// Leaflet touches `window` at import time, so this module is loaded with
// `ssr: false` by `map-view.tsx` and never imported directly by a page.
import { useEffect, useMemo } from "react";
import L from "leaflet";
import { MapContainer, Marker, Popup, TileLayer, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import type { Destination, Origin } from "@/lib/trains";

/** Formats a duration in minutes as hours and minutes: "2 h 14 min", "45 min", "2 h". */
function formatMinutes(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest} min`;
  if (rest === 0) return `${hours} h`;
  return `${hours} h ${rest} min`;
}

function circleIcon(diameter: number, color: string) {
  return L.divIcon({
    className: "",
    html:
      `<span style="display:block;width:${diameter}px;height:${diameter}px;` +
      `border-radius:9999px;background:${color};` +
      `border:3px solid #ffffff;box-shadow:0 0 0 1px ${color}"></span>`,
    iconSize: [diameter, diameter],
    iconAnchor: [diameter / 2, diameter / 2],
    popupAnchor: [0, -diameter / 2],
  });
}

type ReachMapProps = {
  destinations: Destination[];
  origin: Origin;
  originColor: string;
  cityColor: string;
};

export function ReachMap({
  destinations,
  origin,
  originColor,
  cityColor,
}: ReachMapProps) {
  const icons = useMemo(
    () => ({
      origin: circleIcon(18, originColor),
      city: circleIcon(12, cityColor),
    }),
    [originColor, cityColor],
  );

  // The origin is framed with the destinations so it is never off-screen, and so
  // that a range with nothing in it still frames the origin instead of an empty
  // view.
  const positions = useMemo(
    () => [
      [origin.latitude, origin.longitude] as [number, number],
      ...destinations.map(
        (destination) =>
          [destination.latitude, destination.longitude] as [number, number],
      ),
    ],
    [origin, destinations],
  );

  return (
    <MapContainer
      center={[51, 10]}
      zoom={5}
      scrollWheelZoom
      className="size-full"
    >
      <TileLayer
        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
      />
      <FitToPositions positions={positions} />
      {/* Drawn before the destinations and with a raised z-index: Leaflet orders
          markers by latitude, so a dense cluster can bury the origin. */}
      <Marker
        position={[origin.latitude, origin.longitude]}
        icon={icons.origin}
        zIndexOffset={1000}
      >
        <Popup>
          <strong>{origin.name}</strong>
          <br />
          Origin
        </Popup>
      </Marker>
      {destinations.map((destination) => (
        <Marker
          key={destination.cityId}
          position={[destination.latitude, destination.longitude]}
          icon={icons.city}
        >
          <Popup>
            <strong>{destination.name}</strong>
            <br />
            {formatMinutes(destination.minutes)}
            <DestinationLinks destination={destination} />
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}

/**
 * The destination's articles, as far as the pipeline could resolve them. A city
 * with neither gets no row: the popup says less rather than linking to a page
 * about somewhere else. Opened in a new tab so the map keeps its origin, range
 * and position.
 */
function DestinationLinks({ destination }: { destination: Destination }) {
  const links = [
    { label: "Wikipedia", href: destination.wikipediaUrl },
    { label: "Wikivoyage", href: destination.wikivoyageUrl },
  ].flatMap((link) => (link.href ? [{ ...link, href: link.href }] : []));

  if (links.length === 0) return null;

  return (
    <span className="mt-1 flex gap-2">
      {links.map((link) => (
        <a
          key={link.label}
          href={link.href}
          target="_blank"
          rel="noreferrer"
          className="text-primary underline"
        >
          {link.label}
        </a>
      ))}
    </span>
  );
}

/** Frame every marker after a result set arrives, so no city sits off-screen. */
function FitToPositions({
  positions,
}: {
  positions: [number, number][];
}) {
  const map = useMap();

  useEffect(() => {
    if (positions.length === 0) return;
    if (positions.length === 1) {
      map.setView(positions[0], 6);
      return;
    }
    map.fitBounds(L.latLngBounds(positions), { padding: [40, 40] });
  }, [map, positions]);

  return null;
}
