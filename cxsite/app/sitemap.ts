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
    "/about",
    "/about-us",
    "/team",
    "/team/bhim-pratap",
    "/team/bhishm-pratap",
    "/team/raghu-bhunia",
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

  const staticEntries: MetadataRoute.Sitemap = staticPaths.map((path) => {
    const isTeam = path === "/team" || path.startsWith("/team/");
    const isAbout = path === "/about";
    return {
      url: `${BASE}${path}`,
      lastModified,
      changeFrequency: legal.includes(path)
        ? ("yearly" as const)
        : isTeam || isAbout
          ? ("monthly" as const)
          : ("weekly" as const),
      priority:
        path === "/"
          ? 1.0
          : isTeam || isAbout
            ? 0.9
            : legal.includes(path)
              ? 0.6
              : 0.7,
    };
  });

  const db = getSupabaseServiceRole() ?? supabase;
  // Include closed stores too — is_active is online/offline, not index eligibility.
  const { data: stores } = await db
    .from("merchant_stores")
    .select("id, public_slug, updated_at, store_name, store_display_name, city, landmark, approval_status, status, is_active, deleted_at")
    .eq("approval_status", "APPROVED")
    .eq("status", "ACTIVE")
    .is("deleted_at", null);

  const { ensureStorePublicSlug } = await import("@/lib/server/ensureStorePublicSlug");

  const restaurantEntries: MetadataRoute.Sitemap = [];
  for (const raw of stores ?? []) {
    const row = raw as {
      id: number;
      public_slug?: string | null;
      updated_at?: string;
      deleted_at?: string | null;
      approval_status?: string | null;
      status?: string | null;
      is_active?: boolean | null;
      store_name?: string | null;
      store_display_name?: string | null;
      city?: string | null;
      landmark?: string | null;
    };
    let slug = String(row.public_slug ?? "").trim();
    if (!slug) {
      slug = (await ensureStorePublicSlug(row as Parameters<typeof ensureStorePublicSlug>[0])) ?? "";
    }
    if (!slug) continue;
    restaurantEntries.push({
      url: `${BASE}${restaurantPublicPath(slug)}`,
      lastModified: row.updated_at ? new Date(row.updated_at) : lastModified,
      changeFrequency: "daily",
      priority: 0.85,
    });
  }

  return [...staticEntries, ...restaurantEntries];
}
