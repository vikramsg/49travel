import { MapView } from "@/components/map-view";
import { supportedOrigins } from "@/lib/trains";

// Hamburg is the pipeline's own sanity example, so it is the default origin.
// `2911298` is its GeoNames id, one of the 96 ids `supportedOrigins()` returns
// and stable across GeoNames dumps. There is deliberately no fallback: an id
// that is absent would mean the committed dataset changed, which should surface
// rather than be papered over.
const DEFAULT_ORIGIN_CITY_ID = "2911298";
// A band that starts at 0 contains the origin and every destination the map
// showed before it had a lower bound, so the default view is unchanged by it.
const DEFAULT_MIN_HOURS = 0;
const DEFAULT_MAX_HOURS = 6;

export default async function MapPage() {
  const origins = await supportedOrigins();
  return (
    <main className="mx-auto mt-6 max-w-7xl px-4 pb-10">
      <MapView
        origins={origins}
        defaultOriginCityId={DEFAULT_ORIGIN_CITY_ID}
        defaultMinHours={DEFAULT_MIN_HOURS}
        defaultMaxHours={DEFAULT_MAX_HOURS}
      />
    </main>
  );
}
