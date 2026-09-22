import type { Metadata, Viewport } from "next";
import { Analytics } from "@vercel/analytics/next";
import Script from "next/script";
import { TopBar } from "@/components/top-bar";
import "./globals.css";

export const metadata: Metadata = {
  title: "Travel with the 49 Euro ticket",
  description: "Travel across Germany with the 49 Euro ticket",
  manifest: "/manifest.json",
  icons: {
    icon: "/favicon.ico",
    apple: "/logo192.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#000000",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body>
        <TopBar />
        {children}
        <Analytics />
        <Script
          src="https://analytics.umami.is/script.js"
          data-website-id="59eb34b7-ef67-48e8-a55c-9d387ab2661a"
          strategy="afterInteractive"
        />
      </body>
    </html>
  );
}
