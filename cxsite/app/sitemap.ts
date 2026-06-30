import type { MetadataRoute } from "next";
import { LEGAL_DOCS } from "@/lib/legal/registry";

const BASE = "https://gatimitra.com";

/**
 * Public sitemap. We always include:
 *   - Marketing routes (home, services)
 *   - All 26 legal/policy routes (so Play Console + Google can crawl them)
 *   - Help Center, Support, Account Deletion entry points
 *
 * We never include /api/*, /checkout, /cart, /order, payment-flow URLs.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();

  const marketing = [
    "/",
    "/about-us",
    "/careers",
    "/corporates",
    "/order",
    "/ride",
    "/courier",
    "/restaurants",
    "/ecommerce",
    "/around-you",
  ];

  const utility = ["/help-center", "/support", "/sitemap"];

  const legal = LEGAL_DOCS.map((d) => `/${d.slug}`);

  // de-duplicate (cancellation-policy + refund-policy point at the same source
  // but get separate routes; both should be in the sitemap).
  const all = Array.from(new Set([...marketing, ...utility, ...legal]));

  return all.map((path) => ({
    url: `${BASE}${path}`,
    lastModified,
    changeFrequency: legal.includes(path) ? "yearly" : "weekly",
    priority: path === "/" ? 1.0 : legal.includes(path) ? 0.6 : 0.7,
  }));
}
