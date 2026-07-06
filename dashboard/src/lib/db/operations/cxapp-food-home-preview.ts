import { getSql } from "@/lib/db/client";
import { listUserAppCategories } from "@/lib/db/operations/user-app-categories";
import { getUserAppCategoryAllTab } from "@/lib/db/operations/user-app-category-meta";
import { resolveAttachmentProxyUrl } from "@/lib/attachments/resolve-attachment-proxy-url";
import type {
  FoodHomePreviewCategory,
  FoodHomePreviewMerchant,
  FoodHomePreviewOffer,
} from "@/lib/cxapp-home/food-home-preview-types";

export const GRID_FIRST_SKY_TOP = "#7DD3FC";

export type StatePreviewAnchor = {
  stateName: string;
  lat: number | null;
  lng: number | null;
  city: string | null;
  pincode: string | null;
  areaLabel: string;
};

function normalizePreviewMediaUrl(value: string | null | undefined): string | null {
  if (!value?.trim()) return null;
  let raw = value.trim();
  const backendUrl = (process.env.BACKEND_URL ?? process.env.NEXT_PUBLIC_BACKEND_URL ?? "").replace(
    /\/$/,
    ""
  );
  if (backendUrl && raw.startsWith(backendUrl)) {
    raw = raw.slice(backendUrl.length);
  }
  if (raw.startsWith("/v1/attachments/proxy")) {
    raw = raw.replace("/v1/attachments/proxy", "/api/attachments/proxy");
  }
  const resolved = resolveAttachmentProxyUrl(raw);
  return resolved || null;
}

type AnchorRow = {
  lat: number;
  lng: number;
  city: string | null;
  pincode: string | null;
};

function toAnchorRow(row: Record<string, unknown> | null | undefined): AnchorRow | null {
  if (!row) return null;
  const lat = Number(row.lat);
  const lng = Number(row.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return {
    lat,
    lng,
    city: row.city != null ? String(row.city).trim() || null : null,
    pincode: row.pincode != null ? String(row.pincode).trim() || null : null,
  };
}

async function anchorFromStoresByStateName(
  sql: ReturnType<typeof getSql>,
  stateName: string
): Promise<AnchorRow | null> {
  const rows = await sql`
    SELECT
      AVG(latitude::numeric)::float8 AS lat,
      AVG(longitude::numeric)::float8 AS lng,
      (array_agg(city ORDER BY last_activity_at DESC NULLS LAST, id DESC))[1] AS city,
      (array_agg(postal_code ORDER BY last_activity_at DESC NULLS LAST, id DESC))[1] AS pincode
    FROM merchant_stores
    WHERE deleted_at IS NULL
      AND status::text = 'ACTIVE'
      AND latitude IS NOT NULL
      AND longitude IS NOT NULL
      AND LOWER(TRIM(state)) = LOWER(TRIM(${stateName}))
    HAVING COUNT(*) > 0
  `;
  return toAnchorRow((Array.isArray(rows) ? rows[0] : null) as Record<string, unknown> | undefined);
}

async function anchorFromStoresByGeoState(
  sql: ReturnType<typeof getSql>,
  stateId: string
): Promise<AnchorRow | null> {
  const rows = await sql`
    SELECT
      AVG(ms.latitude::numeric)::float8 AS lat,
      AVG(ms.longitude::numeric)::float8 AS lng,
      (array_agg(ms.city ORDER BY ms.last_activity_at DESC NULLS LAST, ms.id DESC))[1] AS city,
      (array_agg(ms.postal_code ORDER BY ms.last_activity_at DESC NULLS LAST, ms.id DESC))[1] AS pincode
    FROM merchant_stores ms
    JOIN pincodes p ON TRIM(p.pincode::text) = TRIM(ms.postal_code)
    JOIN pincode_post_offices ppo ON ppo.pincode_id = p.id
    JOIN post_offices po ON po.id = ppo.post_office_id
    JOIN divisions dv ON dv.id = po.division_id
    JOIN districts d ON d.id = dv.district_id
    JOIN regions r ON r.id = d.region_id
    WHERE r.state_id = ${stateId}::uuid
      AND ms.deleted_at IS NULL
      AND ms.status::text = 'ACTIVE'
      AND ms.latitude IS NOT NULL
      AND ms.longitude IS NOT NULL
    HAVING COUNT(*) > 0
  `;
  return toAnchorRow((Array.isArray(rows) ? rows[0] : null) as Record<string, unknown> | undefined);
}

async function anchorFromGeoPostOffice(
  sql: ReturnType<typeof getSql>,
  stateId: string
): Promise<AnchorRow | null> {
  const rows = await sql`
    SELECT
      po.latitude::float8 AS lat,
      po.longitude::float8 AS lng,
      d.name AS city,
      p.pincode::text AS pincode
    FROM post_offices po
    JOIN divisions dv ON dv.id = po.division_id
    JOIN districts d ON d.id = dv.district_id
    JOIN regions r ON r.id = d.region_id
    LEFT JOIN pincode_post_offices ppo ON ppo.post_office_id = po.id
    LEFT JOIN pincodes p ON p.id = ppo.pincode_id
    WHERE r.state_id = ${stateId}::uuid
      AND po.latitude IS NOT NULL
      AND po.longitude IS NOT NULL
    ORDER BY po.is_food_enabled DESC, po.name
    LIMIT 1
  `;
  return toAnchorRow((Array.isArray(rows) ? rows[0] : null) as Record<string, unknown> | undefined);
}

export async function resolveStatePreviewAnchor(stateId: string): Promise<StatePreviewAnchor | null> {
  const sql = getSql();
  const stateRows = await sql`
    SELECT id, name FROM states WHERE id = ${stateId}::uuid LIMIT 1
  `;
  const stateRow = Array.isArray(stateRows) ? stateRows[0] : null;
  if (!stateRow) return null;

  const stateName = String((stateRow as { name: string }).name);

  let anchor: AnchorRow | null = null;
  try {
    anchor = await anchorFromStoresByStateName(sql, stateName);
  } catch {
    /* best-effort */
  }
  if (!anchor) {
    try {
      anchor = await anchorFromStoresByGeoState(sql, stateId);
    } catch {
      /* geo tables may differ by env */
    }
  }
  if (!anchor) {
    try {
      anchor = await anchorFromGeoPostOffice(sql, stateId);
    } catch {
      /* best-effort */
    }
  }

  if (anchor) {
    const areaLabel = anchor.city ? `${anchor.city}, ${stateName}` : stateName;
    return {
      stateName,
      lat: anchor.lat,
      lng: anchor.lng,
      city: anchor.city,
      pincode: anchor.pincode,
      areaLabel,
    };
  }

  return {
    stateName,
    lat: null,
    lng: null,
    city: null,
    pincode: null,
    areaLabel: stateName,
  };
}

export async function listFoodHomePreviewCategories(): Promise<FoodHomePreviewCategory[]> {
  const rows = await listUserAppCategories({ storeType: "FOOD", includeInactive: false });
  return rows.map((r) => ({
    id: String(r.id),
    name: r.name,
    imageUrl: r.image_url ? normalizePreviewMediaUrl(r.image_url) : null,
  }));
}

export async function fetchFeaturedCustomerSubscriptionPlanName(): Promise<string | null> {
  const sql = getSql();
  const rows = await sql`
    SELECT name
    FROM subscription_plans
    WHERE plan_audience = 'CUSTOMER'
      AND is_active = true
    ORDER BY is_featured DESC, display_order ASC, id ASC
    LIMIT 1
  `;
  const row = Array.isArray(rows) ? rows[0] : null;
  if (!row) return null;
  const name = String((row as { name: string }).name ?? "").trim();
  return name || null;
}

type RawMerchant = {
  id: string;
  name: string;
  displayImage?: string | null;
  banner_url?: string | null;
  deliveryTime?: string;
  offerText?: string | null;
  avgRating?: number | null;
  totalReviews?: number | null;
  completedOrderCount?: number;
  liveStatus?: "OPEN" | "CLOSED";
  distanceKm?: number;
  cuisines?: string[];
};

function mapMerchant(m: RawMerchant): FoodHomePreviewMerchant {
  const image = m.displayImage?.trim() || m.banner_url?.trim() || null;
  const cuisine = Array.isArray(m.cuisines) ? m.cuisines.find((c) => c?.trim())?.trim() : null;
  return {
    id: m.id,
    name: m.name,
    imageUrl: image ? normalizePreviewMediaUrl(image) : null,
    avgRating: m.avgRating ?? null,
    offerText: m.offerText?.trim() || null,
    deliveryTime: m.deliveryTime?.trim() || null,
    distanceKm: m.distanceKm ?? null,
    cuisine: cuisine ?? null,
    liveStatus: m.liveStatus === "OPEN" ? "OPEN" : "CLOSED",
  };
}

function pickLovedMerchants(merchants: RawMerchant[]): FoodHomePreviewMerchant[] {
  return merchants
    .filter((m) => {
      const rating = m.avgRating;
      const reviews = m.totalReviews ?? 0;
      return rating != null && Number.isFinite(rating) && rating >= 4 && reviews > 0;
    })
    .sort((a, b) => {
      const ordersA = Math.max(0, Number(a.completedOrderCount ?? 0));
      const ordersB = Math.max(0, Number(b.completedOrderCount ?? 0));
      if (ordersB !== ordersA) return ordersB - ordersA;
      const ratingA = Number(a.avgRating ?? 0);
      const ratingB = Number(b.avgRating ?? 0);
      if (ratingB !== ratingA) return ratingB - ratingA;
      return (a.distanceKm ?? 999) - (b.distanceKm ?? 999);
    })
    .slice(0, 6)
    .map(mapMerchant);
}

function merchantOfferCta(offer: {
  kind?: string;
  title?: string;
  min_order_amount?: number | null;
  discount_percentage?: number | null;
  discount_value?: number | null;
  max_discount_amount?: number | null;
  offer_type?: string | null;
}): string | null {
  if (offer.kind !== "merchant") return null;

  const min = offer.min_order_amount;
  if (min != null && min > 0) return `Min ₹${Math.round(min)} OFF & more`;

  const pct = offer.discount_percentage;
  if (pct != null && pct > 0) return `Flat ${Math.round(pct)}% OFF & more`;

  const val = offer.discount_value;
  if (val != null && val > 0) return `Flat ₹${Math.round(val)} OFF & more`;

  const max = offer.max_discount_amount;
  if (max != null && max > 0) return `Up to ₹${Math.round(max)} OFF & more`;

  if (String(offer.offer_type ?? "").toUpperCase() === "FREE_DELIVERY") {
    return "Free delivery & more";
  }

  const title = offer.title?.trim();
  if (title) {
    const short = title.length > 28 ? `${title.slice(0, 25)}…` : title;
    return `${short} & more`;
  }

  return null;
}

export async function fetchBackendFoodHomePreview(opts: {
  anchor: StatePreviewAnchor;
  limit?: number;
}): Promise<{
  offers: FoodHomePreviewOffer[];
  lovedMerchants: FoodHomePreviewMerchant[];
  restaurants: FoodHomePreviewMerchant[];
  storeCountLabel: string;
}> {
  const backendUrl = process.env.BACKEND_URL ?? process.env.NEXT_PUBLIC_BACKEND_URL;
  if (!backendUrl) {
    return { offers: [], lovedMerchants: [], restaurants: [], storeCountLabel: "0 stores" };
  }

  const base = backendUrl.replace(/\/$/, "");
  const limit = opts.limit ?? 20;
  const { anchor } = opts;

  const offerQs = new URLSearchParams({
    serviceType: "FOOD",
    limit: "6",
    state: anchor.stateName,
  });
  if (anchor.pincode) offerQs.set("pincode", anchor.pincode);
  if (anchor.city) offerQs.set("city", anchor.city);
  if (anchor.lat != null && anchor.lng != null) {
    offerQs.set("lat", String(anchor.lat));
    offerQs.set("lng", String(anchor.lng));
  }

  let offers: FoodHomePreviewOffer[] = [];
  try {
    const offerRes = await fetch(`${base}/v1/offers/featured?${offerQs.toString()}`, {
      cache: "no-store",
    });
    if (offerRes.ok) {
      const offerJson = (await offerRes.json()) as {
        offers?: Array<{
          id: string;
          kind?: "merchant" | "platform";
          title: string;
          sub?: string;
          min_order_amount?: number | null;
          discount_percentage?: number | null;
          discount_value?: number | null;
          max_discount_amount?: number | null;
          offer_type?: string | null;
          offer_image_url?: string | null;
        }>;
      };
      offers = (offerJson.offers ?? []).map((o) => ({
        id: o.id,
        kind: o.kind,
        title: o.title?.trim() || "Special offers",
        sub: o.sub?.trim() || "",
        cta: merchantOfferCta(o) ?? "",
        imageUrl: o.offer_image_url ? normalizePreviewMediaUrl(o.offer_image_url) : null,
      }));
    }
  } catch {
    offers = [];
  }

  if (anchor.lat == null || anchor.lng == null) {
    return {
      offers,
      lovedMerchants: [],
      restaurants: [],
      storeCountLabel: "0 stores",
    };
  }

  const merchantQs = new URLSearchParams({
    limit: String(limit),
    lat: String(anchor.lat),
    lng: String(anchor.lng),
    distanceMode: "road",
  });

  let rawMerchants: RawMerchant[] = [];
  try {
    const merchantRes = await fetch(`${base}/v1/merchants?${merchantQs.toString()}`, {
      cache: "no-store",
    });
    if (merchantRes.ok) {
      const merchantJson = (await merchantRes.json()) as { items?: RawMerchant[] };
      rawMerchants = merchantJson.items ?? [];
    }
  } catch {
    rawMerchants = [];
  }

  const lovedMerchants = pickLovedMerchants(rawMerchants);
  const restaurants = rawMerchants.slice(0, 3).map(mapMerchant);
  const open = rawMerchants.filter((m) => m.liveStatus === "OPEN").length;
  const total = rawMerchants.length;
  const storeCountLabel =
    total === 0
      ? "0 stores"
      : open < total
        ? `${open} open · ${total - open} closed`
        : `${total} ${total === 1 ? "store" : "stores"}`;

  return { offers, lovedMerchants, restaurants, storeCountLabel };
}
