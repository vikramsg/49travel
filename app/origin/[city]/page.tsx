import { notFound } from "next/navigation";
import { CityPage } from "@/components/city-page";
import { getOriginCity, originCities } from "@/lib/cities";

export function generateStaticParams() {
  return originCities.map((city) => ({ city: city.slug }));
}

export default async function OriginPage({
  params,
}: PageProps<"/origin/[city]">) {
  const { city } = await params;
  const origin = getOriginCity(city);
  if (!origin) {
    notFound();
  }
  const destinations = await origin.loadDestinations();
  return (
    <CityPage
      originStopId={origin.originStopId}
      destinations={destinations}
    />
  );
}
