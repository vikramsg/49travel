import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { originCities } from "@/lib/cities";

export default function HomePage() {
  return (
    <main className="mx-auto mt-6 grid max-w-7xl gap-6 px-4 md:grid-cols-2">
      {originCities.map((city) => (
        <Link key={city.slug} href={`/origin/${city.slug}`}>
          <Card className="h-full transition-shadow hover:shadow-md">
            <CardHeader className="border-b bg-muted/50">
              <CardTitle className="text-xl">
                <h2>{city.name}</h2>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p>
                Find out all destinations you can reach from {city.name} using
                only your 49 Euro ticket.
              </p>
            </CardContent>
          </Card>
        </Link>
      ))}
    </main>
  );
}
