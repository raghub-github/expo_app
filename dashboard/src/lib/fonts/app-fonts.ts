import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import localFont from "next/font/local";

/** Root app sans — local Geist (no Google Fonts fetch at build). */
export const geistSans = GeistSans;

/** Root app mono — local Geist Mono. */
export const geistMono = GeistMono;

/** Rider dashboard sans (Inter), self-hosted. */
export const riderSans = localFont({
  src: [
    { path: "../../fonts/inter/inter-latin-400-normal.woff2", weight: "400", style: "normal" },
    { path: "../../fonts/inter/inter-latin-500-normal.woff2", weight: "500", style: "normal" },
    { path: "../../fonts/inter/inter-latin-600-normal.woff2", weight: "600", style: "normal" },
    { path: "../../fonts/inter/inter-latin-700-normal.woff2", weight: "700", style: "normal" },
  ],
  variable: "--font-geist-sans",
  display: "swap",
});

/** Rider dashboard mono (Roboto Mono), self-hosted. */
export const riderMono = localFont({
  src: [
    {
      path: "../../fonts/roboto-mono/roboto-mono-latin-400-normal.woff2",
      weight: "400",
      style: "normal",
    },
    {
      path: "../../fonts/roboto-mono/roboto-mono-latin-500-normal.woff2",
      weight: "500",
      style: "normal",
    },
    {
      path: "../../fonts/roboto-mono/roboto-mono-latin-600-normal.woff2",
      weight: "600",
      style: "normal",
    },
    {
      path: "../../fonts/roboto-mono/roboto-mono-latin-700-normal.woff2",
      weight: "700",
      style: "normal",
    },
  ],
  variable: "--font-geist-mono",
  display: "swap",
});
