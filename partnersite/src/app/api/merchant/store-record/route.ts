import { NextRequest, NextResponse } from 'next/server';
import { assertStoreAccess } from '@/lib/auth/assert-store-access';
import { normalizeMerchantStoreMediaUrl } from '@/lib/r2';
import { client as sql } from '@/lib/drizzle';
import { ensureStorePublicSlug } from '@/lib/ensureStorePublicSlug';
import {
  backfillStoreBannerUrlIfMissing,
  resolveStoreProfileMediaForDisplay,
} from '@/lib/resolve-store-profile-media';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function coerceNumeric(raw: unknown): number | null {
  if (raw == null || raw === '') return null;
  const n = typeof raw === 'number' ? raw : Number(String(raw).trim());
  return Number.isFinite(n) ? n : null;
}

function normalizeStoreRecordRow(row: Record<string, unknown>): Record<string, unknown> {
  const bannerUrl =
    normalizeMerchantStoreMediaUrl(row.banner_url as string | null | undefined) ??
    row.banner_url;
  const galleryImages = Array.isArray(row.gallery_images)
    ? row.gallery_images
        .map((u) => normalizeMerchantStoreMediaUrl(String(u)) ?? String(u).trim())
        .filter((u): u is string => typeof u === 'string' && u.length > 0)
    : row.gallery_images;
  const deliveryRadiusKm = coerceNumeric(row.delivery_radius_km);
  const minOrder = coerceNumeric(row.min_order_amount);
  const prep = coerceNumeric(row.avg_preparation_time_minutes);
  return {
    ...row,
    banner_url: bannerUrl ?? row.banner_url,
    gallery_images: galleryImages ?? row.gallery_images,
    ...(deliveryRadiusKm != null ? { delivery_radius_km: deliveryRadiusKm } : {}),
    ...(minOrder != null ? { min_order_amount: minOrder } : {}),
    ...(prep != null ? { avg_preparation_time_minutes: prep } : {}),
  };
}

/** GET /api/merchant/store-record?storeId=GMMC1015 — direct Postgres (avoids PostgREST PGRST002). */
export async function GET(req: NextRequest) {
  try {
    const storeId =
      req.nextUrl.searchParams.get('storeId') ??
      req.nextUrl.searchParams.get('store_id');
    if (!storeId?.trim()) {
      return NextResponse.json({ error: 'storeId is required' }, { status: 400 });
    }

    const trimmed = storeId.trim();
    const gate = await assertStoreAccess(trimmed);
    if (!gate.ok) {
      return NextResponse.json({ error: gate.error }, { status: gate.status });
    }

    let rows = await sql`
      SELECT *
      FROM merchant_stores
      WHERE store_id = ${trimmed}
      LIMIT 1
    `;

    if (!rows[0] && /^\d+$/.test(trimmed)) {
      rows = await sql`
        SELECT *
        FROM merchant_stores
        WHERE id = ${parseInt(trimmed, 10)}
        LIMIT 1
      `;
    }

    const row = rows[0];
    if (!row) {
      return NextResponse.json({ error: 'Store not found' }, { status: 404 });
    }

    const slug = await ensureStorePublicSlug(row as Parameters<typeof ensureStorePublicSlug>[0]);
    const withSlug =
      slug && !(row as { public_slug?: string }).public_slug
        ? { ...row, public_slug: slug }
        : row;

    const base = normalizeStoreRecordRow(withSlug as Record<string, unknown>);
    const storePkRaw = base.id;
    const storePk =
      typeof storePkRaw === 'number'
        ? storePkRaw
        : typeof storePkRaw === 'string'
          ? parseInt(storePkRaw, 10)
          : NaN;

    const resolved = await resolveStoreProfileMediaForDisplay({
      id: Number.isFinite(storePk) ? storePk : String(storePkRaw ?? ''),
      parent_id: (base.parent_id as number | string | null | undefined) ?? null,
      banner_url: (base.banner_url as string | null | undefined) ?? null,
      gallery_images: base.gallery_images,
      store_banner_url: (base.store_banner_url as string | null | undefined) ?? null,
    });

    if (Number.isFinite(storePk) && resolved.banner_url) {
      void backfillStoreBannerUrlIfMissing(
        storePk,
        resolved.banner_url,
        (base.banner_url as string | null | undefined) ?? null
      );
    }

    return NextResponse.json({
      ...base,
      banner_url: resolved.banner_url ?? base.banner_url ?? null,
      gallery_images:
        resolved.gallery_images.length > 0 ? resolved.gallery_images : base.gallery_images,
    });
  } catch (e) {
    console.error('[store-record]', e);
    return NextResponse.json({ error: 'Store lookup failed' }, { status: 500 });
  }
}
