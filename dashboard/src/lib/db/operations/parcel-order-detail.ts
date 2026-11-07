/**
 * Parcel extension fields for dashboard order detail (orders_parcel).
 */

import { eq, sql } from "drizzle-orm";
import { getDb } from "../client";
import { ordersCore, ordersParcel } from "../schema";
import type { ParcelOrderDetail } from "@/lib/orders/parcel-order-types";
import { resolveAttachmentProxyUrl } from "@/lib/attachments/resolve-attachment-proxy-url";
import { listR2KeysByPrefix } from "@/lib/services/r2";

export type { ParcelOrderDetail } from "@/lib/orders/parcel-order-types";

function parseNum(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function toIso(v: Date | string | null | undefined): string | null {
  if (v == null) return null;
  if (v instanceof Date) return Number.isFinite(v.getTime()) ? v.toISOString() : null;
  const d = new Date(String(v));
  return Number.isFinite(d.getTime()) ? d.toISOString() : null;
}

function resolveProofUrl(
  imageUrl: string | null | undefined,
  legacyUrl: string | null | undefined,
  r2Key: string | null | undefined
): string | null {
  const modern = (imageUrl ?? "").trim();
  const legacy = (legacyUrl ?? "").trim();
  const key = (r2Key ?? "").trim();
  const raw = modern || legacy || key;
  if (!raw) return null;
  const resolved = resolveAttachmentProxyUrl(raw);
  return resolved.trim() || null;
}

function sanitizeOrderRefForR2(ref: string): string {
  return ref.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 80) || "order";
}

async function fetchOrderRefsForProof(orderCoreId: number): Promise<string[]> {
  const db = getDb();
  try {
    const rows = await db.execute(sql`
      SELECT order_id, formatted_order_id
      FROM orders_core
      WHERE id = ${orderCoreId}
      LIMIT 1
    `);
    const row = (rows as unknown as Record<string, unknown>[])[0];
    const refs = new Set<string>();
    for (const key of ["order_id", "formatted_order_id"] as const) {
      const val = row?.[key];
      if (typeof val === "string" && val.trim()) refs.add(val.trim());
    }
    return [...refs];
  } catch {
    return [];
  }
}

async function fetchParcelProofFromR2(
  orderCoreId: number,
  kind: "pickup" | "delivery"
): Promise<string | null> {
  try {
    const refs = await fetchOrderRefsForProof(orderCoreId);
    if (refs.length === 0) return null;

    const folder = kind === "pickup" ? "pickup-proof" : "delivery-proof";
    const prefixes = new Set<string>();
    for (const ref of refs) {
      prefixes.add(`orders/${ref}/${folder}/`);
      prefixes.add(`orders/${sanitizeOrderRefForR2(ref)}/${folder}/`);
    }

    let bestKey: string | null = null;
    for (const prefix of prefixes) {
      const keys = await listR2KeysByPrefix(prefix, 20);
      for (const key of keys) {
        if (!/\.(jpg|jpeg|png|webp)$/i.test(key)) continue;
        if (!bestKey || key.localeCompare(bestKey) > 0) bestKey = key;
      }
    }
    if (!bestKey) return null;
    return `/api/attachments/proxy?key=${encodeURIComponent(bestKey)}`;
  } catch {
    return null;
  }
}

/** Fallback when denormalized columns are empty — read order_delivery_images. */
async function fetchParcelProofFromImages(
  orderCoreId: number,
  imageType: "pickup" | "delivery"
): Promise<{ url: string | null; at: string | null }> {
  const db = getDb();
  const queries =
    imageType === "pickup"
      ? [
          sql`
            SELECT image_url, url, r2_key, taken_at
            FROM order_delivery_images
            WHERE order_id = ${orderCoreId}
              AND image_type = 'pickup'
            ORDER BY taken_at DESC NULLS LAST, id DESC
            LIMIT 1
          `,
          sql`
            SELECT image_url, url, r2_key, taken_at
            FROM order_delivery_images
            WHERE order_id = ${orderCoreId}
            ORDER BY taken_at DESC NULLS LAST, id DESC
            LIMIT 1
          `,
        ]
      : [
          sql`
            SELECT image_url, url, r2_key, taken_at
            FROM order_delivery_images
            WHERE order_id = ${orderCoreId}
              AND image_type IN ('delivery', 'delivery_proof')
            ORDER BY taken_at DESC NULLS LAST, id DESC
            LIMIT 1
          `,
          sql`
            SELECT image_url, url, r2_key, taken_at
            FROM order_delivery_images
            WHERE order_id = ${orderCoreId}
            ORDER BY taken_at DESC NULLS LAST, id DESC
            LIMIT 1
          `,
        ];

  for (const query of queries) {
    try {
      const rows = await db.execute(query);
      const row = (rows as unknown as Array<Record<string, unknown>>)[0];
      if (!row) continue;
      const url = resolveProofUrl(
        row.image_url != null ? String(row.image_url) : null,
        row.url != null ? String(row.url) : null,
        row.r2_key != null ? String(row.r2_key) : null
      );
      if (url) {
        return { url, at: toIso(row.taken_at as Date | string | null) };
      }
    } catch {
      // column mismatch — try next query shape
    }
  }

  const r2Url = await fetchParcelProofFromR2(orderCoreId, imageType);
  return { url: r2Url, at: null };
}

export async function getParcelOrderDetail(orderCoreId: number): Promise<ParcelOrderDetail | null> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(ordersParcel)
    .where(eq(ordersParcel.orderId, orderCoreId))
    .limit(1);

  if (!row) return null;

  let pickupProofImageUrl = resolveProofUrl(
    row.pickupProofImageUrl,
    null,
    row.pickupProofR2Key
  );
  let pickupProofAt = toIso(row.pickupProofAt);
  let deliveryProofImageUrl = resolveProofUrl(
    row.deliveryProofImageUrl,
    null,
    row.deliveryProofR2Key
  );
  let deliveryProofAt = toIso(row.deliveryProofAt);

  if (!pickupProofImageUrl || !deliveryProofImageUrl) {
    const [pickupImg, deliveryImg] = await Promise.all([
      pickupProofImageUrl
        ? Promise.resolve({ url: null as string | null, at: null as string | null })
        : fetchParcelProofFromImages(orderCoreId, "pickup"),
      deliveryProofImageUrl
        ? Promise.resolve({ url: null as string | null, at: null as string | null })
        : fetchParcelProofFromImages(orderCoreId, "delivery"),
    ]);
    if (!pickupProofImageUrl) {
      pickupProofImageUrl = pickupImg.url;
      pickupProofAt = pickupProofAt ?? pickupImg.at;
    }
    if (!deliveryProofImageUrl) {
      deliveryProofImageUrl = deliveryImg.url;
      deliveryProofAt = deliveryProofAt ?? deliveryImg.at;
    }
  }

  return {
    receiverName: row.receiverName?.trim() || null,
    receiverMobile: row.receiverMobile?.trim() || null,
    senderName: row.senderName?.trim() || null,
    senderMobile: row.senderMobile?.trim() || null,
    parcelType: row.parcelType?.trim() || null,
    vehicleCategory: row.vehicleCategory?.trim() || row.parcelType?.trim() || null,
    vehicleTypeRequired: row.vehicleTypeRequired?.trim() || null,
    weightKg: parseNum(row.weightKg),
    lengthCm: parseNum(row.lengthCm),
    widthCm: parseNum(row.widthCm),
    heightCm: parseNum(row.heightCm),
    pickupLabel: row.pickupLabel?.trim() || null,
    pickupAddress: row.pickupAddress?.trim() || null,
    pickupLat: parseNum(row.pickupLat),
    pickupLon: parseNum(row.pickupLon),
    dropLabel: row.dropLabel?.trim() || null,
    dropAddress: row.dropAddress?.trim() || null,
    dropLat: parseNum(row.dropLat),
    dropLon: parseNum(row.dropLon),
    pickupOtp: row.pickupOtp?.trim() || null,
    deliveryOtp: row.deliveryOtp?.trim() || null,
    paymentMethod: row.paymentMethod?.trim() || null,
    payAt: row.payAt?.trim() || null,
    isCod: row.isCod ?? null,
    codAmount: parseNum(row.codAmount),
    estimatedFare: parseNum(row.estimatedFare),
    finalFare: parseNum(row.finalFare),
    tripDistanceKm: parseNum(row.tripDistanceKm),
    couponCode: row.couponCode?.trim() || null,
    appliedOfferDiscount: parseNum(row.appliedOfferDiscount),
    requiresOtpVerification: row.requiresOtpVerification ?? null,
    cancellationReasonCode: row.cancellationReasonCode?.trim() || null,
    cancellationReasonText: row.cancellationReasonText?.trim() || null,
    instructions: row.instructions?.trim() || null,
    pickupProofImageUrl,
    pickupProofAt,
    deliveryProofImageUrl,
    deliveryProofAt,
    cashCollectedAt: toIso(row.cashCollectedAt),
  };
}

/** Billing snapshot + live payment status from orders_core (parcel fare card). */
export async function getParcelBillingContext(orderCoreId: number): Promise<{
  billingSnapshot: Record<string, unknown> | null;
  paymentStatus: string | null;
  paymentMethod: string | null;
  fareAmount: number | null;
  itemTotal: number | null;
  grandTotal: number | null;
  tipAmount: number | null;
}> {
  const db = getDb();
  const [row] = await db
    .select({
      billingSnapshot: ordersCore.billingSnapshot,
      paymentStatus: ordersCore.paymentStatus,
      paymentMethod: ordersCore.paymentMethod,
      fareAmount: ordersCore.fareAmount,
      itemTotal: ordersCore.itemTotal,
      grandTotal: ordersCore.grandTotal,
      tipAmount: ordersCore.tipAmount,
    })
    .from(ordersCore)
    .where(eq(ordersCore.id, orderCoreId))
    .limit(1);

  const snap =
    row?.billingSnapshot != null && typeof row.billingSnapshot === "object"
      ? (row.billingSnapshot as Record<string, unknown>)
      : null;

  const num = (v: unknown): number | null => {
    if (v == null) return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };

  return {
    billingSnapshot: snap,
    paymentStatus: row?.paymentStatus != null ? String(row.paymentStatus) : null,
    paymentMethod: row?.paymentMethod != null ? String(row.paymentMethod) : null,
    fareAmount: num(row?.fareAmount),
    itemTotal: num(row?.itemTotal),
    grandTotal: num(row?.grandTotal),
    tipAmount: num(row?.tipAmount),
  };
}
