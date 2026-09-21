"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { GithubIcon } from "@/components/github-icon";
import { cn } from "cn";

// The two tabs answer different questions: Home is the €49 regional pages, Map
// is the any-train reachability view. `/origin/[city]` belongs to Home because
// it is one of the €49 pages.
const tabs = [
  {
    href: "/",
    label: "Home",
    isActive: (pathname: string) =>
      pathname === "/" || pathname.startsWith("/origin/"),
  },
  {
    href: "/map",
    label: "Map",
    isActive: (pathname: string) => pathname === "/map",
  },
];

export function TopBar() {
  const pathname = usePathname();

  return (
    <header className="flex h-14 items-center justify-between bg-primary px-6 text-primary-foreground">
      <nav aria-label="Primary" className="flex items-center gap-6">
        {tabs.map((tab) => {
          const active = tab.isActive(pathname);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={active ? "page" : undefined}
              // Weight and underline carry the active state; colour alone would
              // not distinguish the two tabs on the blue bar.
              className={cn(
                active
                  ? "font-bold underline decoration-2 underline-offset-4"
                  : "font-medium opacity-90 hover:opacity-100",
              )}
            >
              {tab.label}
            </Link>
          );
        })}
      </nav>
      <div className="flex items-center gap-6">
        <a
          href="https://github.com/vikramsg/49travel"
          target="_blank"
          rel="noopener noreferrer"
          aria-label="GitHub repository"
        >
          <GithubIcon className="size-5" />
        </a>
        <Link href="/about" className="font-bold">
          About
        </Link>
      </div>
    </header>
  );
}
