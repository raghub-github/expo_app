import { getSql } from "@/lib/db/client";
import type { AppStaticAssetApp } from "@/lib/app-static-assets/shared";

export type AppStaticAssetRow = {
  id: string;
  app: AppStaticAssetApp;
  section: string;
  label: string;
  description: string;
  r2_key: string | null;
  proxy_url: string | null;
  sort_order: number;
};

function mapRow(r: Record<string, unknown>): AppStaticAssetRow {
  return {
    id: String(r.id),
    app: String(r.app) as AppStaticAssetApp,
    section: String(r.section ?? ""),
    label: String(r.label ?? ""),
    description: String(r.description ?? ""),
    r2_key: r.r2_key != null ? String(r.r2_key) : null,
    proxy_url: r.proxy_url != null ? String(r.proxy_url) : null,
    sort_order: Number(r.sort_order ?? 0),
  };
}

export async function listAppStaticAssets(app: AppStaticAssetApp): Promise<AppStaticAssetRow[]> {
  const sql = getSql();
  // Ensure new Branding / App icon slots exist even before migration is applied.
  try {
    await sql`
      INSERT INTO app_static_assets (id, app, section, label, description, sort_order)
      VALUES
        (
          'customer.brand.app_icon',
          'customer',
          'Branding',
          'App icon',
          'In-app bootstrap / brand mark. Updates on next app open. Phone home-screen icon still needs a store rebuild.',
          10
        ),
        (
          'rider.brand.app_icon',
          'rider',
          'Branding',
          'App icon',
          'In-app brand mark / splash icon. Updates on next app open. Phone home-screen icon still needs a store rebuild.',
          10
        ),
        (
          'merchant.brand.app_icon',
          'merchant',
          'Branding',
          'App icon',
          'In-app brand mark (login / header). Updates on next app open. Phone home-screen icon still needs a store rebuild.',
          10
        ),
        (
          'merchant.offers.promo_banner',
          'merchant',
          'Offers',
          'Promo offer banner',
          'Hero image on Offers & Promotions → Create offers (GatiMitra Promos card).',
          10
        ),
        (
          'merchant.partner.manage_stores',
          'merchant',
          'Auth',
          'Manage stores art',
          'Partner home manage stores illustration; partnersite store settings empty state.',
          40
        ),
        (
          'merchant.orders.empty_new',
          'merchant',
          'Orders',
          'New orders empty',
          'Dashboard — New tab waiting for orders illustration.',
          10
        ),
        (
          'merchant.orders.empty_active',
          'merchant',
          'Orders',
          'Active orders empty',
          'Dashboard — Active tab no orders illustration.',
          20
        ),
        (
          'merchant.orders.empty_preparing',
          'merchant',
          'Orders',
          'Preparing empty',
          'Orders tab — Preparing stage empty illustration.',
          30
        ),
        (
          'merchant.orders.empty_ready',
          'merchant',
          'Orders',
          'Ready empty',
          'Orders tab — Ready stage empty illustration.',
          40
        ),
        (
          'merchant.orders.empty_picked_up',
          'merchant',
          'Orders',
          'Picked up empty',
          'Orders tab — Picked Up stage empty illustration.',
          50
        ),
        (
          'merchant.orders.empty_completed',
          'merchant',
          'Orders',
          'Completed empty',
          'Orders tab — Completed stage empty illustration.',
          60
        ),
        (
          'merchant.orders.empty_rto',
          'merchant',
          'Orders',
          'RTO empty',
          'Orders tab — RTO stage empty illustration.',
          70
        ),
        (
          'merchant.orders.empty_scheduled',
          'merchant',
          'Orders',
          'Scheduled empty',
          'Orders tab — Scheduled stage empty illustration.',
          80
        ),
        (
          'merchant.offers.empty_running',
          'merchant',
          'Offers',
          'No running offers',
          'Offers track — empty running offers illustration.',
          20
        ),
        (
          'merchant.onboarding.packaging_tips_video',
          'merchant',
          'Onboarding',
          'Packaging tips video',
          'Merchant onboarding — View packaging tips (MP4). Must play to the end to complete the task.',
          10
        ),
        (
          'customer.store.long_distance_sheet',
          'customer',
          'Store',
          'Long distance bottom sheet image',
          'Shown when a store is farther than the membership free-delivery distance. Extra distance charges may apply.',
          20
        )
      ON CONFLICT (id) DO NOTHING
    `;
  } catch {
    // Non-fatal — migration may not be applied yet / table missing in local envs.
  }

  const raw = await sql`
    SELECT id, app, section, label, description, r2_key, proxy_url, sort_order
    FROM app_static_assets
    WHERE app = ${app}
    ORDER BY section ASC, sort_order ASC, id ASC
  `;
  const arr = Array.isArray(raw) ? raw : [];
  return arr.map((x) => mapRow(x as Record<string, unknown>));
}

export async function getAppStaticAssetById(id: string): Promise<AppStaticAssetRow | null> {
  const sql = getSql();
  const raw = await sql`
    SELECT id, app, section, label, description, r2_key, proxy_url, sort_order
    FROM app_static_assets
    WHERE id = ${id}
    LIMIT 1
  `;
  const arr = Array.isArray(raw) ? raw : [];
  const row = arr[0] as Record<string, unknown> | undefined;
  return row ? mapRow(row) : null;
}

export async function setAppStaticAssetImage(
  id: string,
  r2Key: string,
  proxyUrl: string
): Promise<AppStaticAssetRow | null> {
  const sql = getSql();
  const raw = await sql`
    UPDATE app_static_assets
    SET r2_key = ${r2Key}, proxy_url = ${proxyUrl}, updated_at = now()
    WHERE id = ${id}
    RETURNING id, app, section, label, description, r2_key, proxy_url, sort_order
  `;
  const arr = Array.isArray(raw) ? raw : [];
  const row = arr[0] as Record<string, unknown> | undefined;
  return row ? mapRow(row) : null;
}

export async function clearAppStaticAssetImage(id: string): Promise<AppStaticAssetRow | null> {
  const sql = getSql();
  const raw = await sql`
    UPDATE app_static_assets
    SET r2_key = NULL, proxy_url = NULL, updated_at = now()
    WHERE id = ${id}
    RETURNING id, app, section, label, description, r2_key, proxy_url, sort_order
  `;
  const arr = Array.isArray(raw) ? raw : [];
  const row = arr[0] as Record<string, unknown> | undefined;
  return row ? mapRow(row) : null;
}
