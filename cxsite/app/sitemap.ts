import type { MetadataRoute } from "next";
import { LEGAL_DOCS } from "@/lib/legal/registry";
import { getSupabaseServiceRole } from "@/lib/supabaseServiceRole";
import { supabase } from "@/lib/supabase";
import { restaurantPublicPath } from "@/lib/storePublicUrl";

const BASE = "https://gatimitra.com";

/**
 * Public sitemap. We always include:
 *   - Marketing routes (home, services)
 *   - All legal/policy routes
 *   - Approved active restaurant pages (public_slug URLs only)
 *
 * We never include /api/*, /checkout, /cart, /order, payment-flow URLs.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const lastModified = new Date();

  const marketing = [
    "/",
    "/about-us",
    "/careers",
    "/corporates",
    "/order",
    "/ride",
    "/restaurants",
    "/grocery",
    "/ecommerce",
    "/around-you",
  ];

  const utility = ["/help-center", "/support", "/sitemap"];

  const legal = LEGAL_DOCS.map((d) => `/${d.slug}`);

  const staticPaths = Array.from(new Set([...marketing, ...utility, ...legal]));

  const staticEntries: MetadataRoute.Sitemap = staticPaths.map((path) => ({
    url: `${BASE}${path}`,
    lastModified,
    changeFrequency: legal.includes(path) ? "yearly" : "weekly",
    priority: path === "/" ? 1.0 : legal.includes(path) ? 0.6 : 0.7,
  }));

  const db = getSupabaseServiceRole() ?? supabase;
  const { data: stores } = await db
    .from("merchant_stores")
    .select("public_slug, updated_at")
    .eq("approval_status", "APPROVED")
    .eq("status", "ACTIVE")
    .eq("is_active", true)
    .is("deleted_at", null)
    .not("public_slug", "is", null);

  const restaurantEntries: MetadataRoute.Sitemap = (stores ?? [])
    .map((row) => {
      const slug = String((row as { public_slug?: string }).public_slug ?? "").trim();
      if (!slug) return null;
      const updated = (row as { updated_at?: string }).updated_at;
      return {
        url: `${BASE}${restaurantPublicPath(slug)}`,
        lastModified: updated ? new Date(updated) : lastModified,
        changeFrequency: "weekly" as const,
        priority: 0.8,
      };
    })
    .filter((e): e is NonNullable<typeof e> => e != null);

  return [...staticEntries, ...restaurantEntries];
}
