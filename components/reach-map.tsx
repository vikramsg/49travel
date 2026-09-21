"use client";

// Leaflet touches `window` at import time, so this module is loaded with
// `ssr: false` by `map-view.tsx` and never imported directly by a page.
import { useEffect, useMemo } from "react";
import L from "leaflet";
import { MapContainer, Marker, Popup, TileLayer, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import type { ReachableCity } from "@/lib/trains";

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
  cities: ReachableCity[];
  originCityId: string;
  originColor: string;
  cityColor: string;
};

export function ReachMap({
  cities,
  originCityId,
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

  const positions = useMemo(
    () => cities.map((city) => [city.latitude, city.longitude] as [number, number]),
    [cities],
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
      {cities.map((city) => {
        const isOrigin = city.cityId === originCityId;
        return (
          <Marker
            key={city.cityId}
            position={[city.latitude, city.longitude]}
            icon={isOrigin ? icons.origin : icons.city}
            // Leaflet orders markers by latitude, so a dense cluster can bury
            // the origin. The offset keeps the origin marker on top of it.
            zIndexOffset={isOrigin ? 1000 : 0}
          >
            <Popup>
              <strong>{city.name}</strong>
              <br />
              {isOrigin ? "Origin" : formatMinutes(city.minutes)}
            </Popup>
          </Marker>
        );
      })}
    </MapContainer>
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
