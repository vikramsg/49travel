import Link from "next/link";
import { GithubIcon } from "@/components/github-icon";

export function TopBar() {
  return (
    <header className="flex h-14 items-center justify-between bg-primary px-6 text-primary-foreground">
      <Link href="/" className="font-bold">
        Home
      </Link>
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
