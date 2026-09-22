import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto mt-16 max-w-2xl px-4 text-center">
      <h1 className="text-2xl font-bold">Page not found</h1>
      <p className="mt-4">
        <Link href="/" className="text-primary underline">
          Back to the city list
        </Link>
      </p>
    </main>
  );
}
