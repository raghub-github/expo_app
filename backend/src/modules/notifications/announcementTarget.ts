/**
 * Validate CUSTOMER_ANNOUNCEMENT tap targets against DB (categories / stores / orders).
 */
import { getSql } from "../../db/client.js";
import {
  buildAnnouncementDeepLink,
  getCustomerHomeService,
  isAllowedGatimitraDeepLink,
  type AnnouncementTargetInput,
  type AnnouncementTargetResolved,
} from "../../lib/customer-home-services.js";

export type ValidateAnnouncementTargetResult =
  | { ok: true; resolved: AnnouncementTargetResolved }
  | { ok: false; error: string };

function parseTargetFromBody(body: Record<string, unknown> | null | undefined): AnnouncementTargetInput {
  const src = body ?? {};
  const typeRaw = String(src.targetType ?? src.target_type ?? "NONE")
    .trim()
    .toUpperCase();
  return {
    targetType: typeRaw,
    serviceId: (src.serviceId ?? src.target_service_id ?? null) as string | null,
    categoryId: (src.categoryId ?? src.target_category_id ?? null) as string | null,
    storeId: (src.storeId ?? src.target_store_id ?? null) as string | null,
    orderId: (src.orderId ?? src.target_order_id ?? (typeRaw === "ORDER" ? src.target_id : null)) as
      | string
      | null,
    customDeepLink: (src.customDeepLink ??
      src.custom_deep_link ??
      (typeRaw === "CUSTOM_DEEP_LINK" ? src.target_id : null)) as string | null,
    targetId: (src.targetId ?? src.target_id ?? null) as string | null,
  };
}

export async function validateAnnouncementTarget(
  body: Record<string, unknown> | null | undefined,
): Promise<ValidateAnnouncementTargetResult> {
  const input = parseTargetFromBody(body);
  let resolved: AnnouncementTargetResolved;
  try {
    resolved = buildAnnouncementDeepLink(input);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Invalid target" };
  }

  if (
    resolved.target_type === "NONE" ||
    resolved.target_type === "HOME" ||
    resolved.target_type === "SERVICE" ||
    resolved.target_type === "OFFER" ||
    resolved.target_type === "SUBSCRIPTION"
  ) {
    return { ok: true, resolved };
  }

  if (resolved.target_type === "CUSTOM_DEEP_LINK") {
    if (!isAllowedGatimitraDeepLink(resolved.deepLink)) {
      return { ok: false, error: "Custom deep link is not an allowed GatiMitra route" };
    }
    return { ok: true, resolved };
  }

  const sql = getSql();

  if (resolved.target_type === "ORDER") {
    const orderId = resolved.target_id;
    if (!orderId) return { ok: false, error: "Order target requires an order id" };
    const rows = await sql<
      Array<{ order_id: string | null; formatted_order_id: string | null }>
    >`
      SELECT order_id, formatted_order_id
      FROM orders_core
      WHERE order_id = ${orderId}
         OR formatted_order_id = ${orderId}
         OR id::text = ${orderId}
      LIMIT 1
    `;
    const row = rows[0];
    if (!row) return { ok: false, error: "Order not found" };
    const publicId = String(row.formatted_order_id || row.order_id || orderId).trim();
    resolved = {
      ...resolved,
      target_id: publicId,
      target_payload: { orderId: publicId },
      deepLink: `/orders/${encodeURIComponent(publicId)}`,
    };
    return { ok: true, resolved };
  }

  const service = getCustomerHomeService(resolved.target_service_id);
  if (!service) return { ok: false, error: "Unknown service" };

  if (resolved.target_type === "CATEGORY") {
    if (!service.storeType || !resolved.target_category_id) {
      return { ok: false, error: "Category target requires service + category" };
    }
    const catId = Number(resolved.target_category_id);
    if (!Number.isFinite(catId) || catId < 1) {
      return { ok: false, error: "Invalid category id" };
    }
    const rows = await sql<Array<{ id: number; store_type: string; status: string }>>`
      SELECT id, store_type::text AS store_type, status::text AS status
      FROM user_app_category
      WHERE id = ${catId}
      LIMIT 1
    `;
    const row = rows[0];
    if (!row) return { ok: false, error: "Category not found" };
    if (String(row.status).toLowerCase() !== "active") {
      return { ok: false, error: "Category is inactive" };
    }
    if (String(row.store_type).toUpperCase() !== service.storeType.toUpperCase()) {
      return {
        ok: false,
        error: `Category belongs to ${row.store_type}, not ${service.storeType}`,
      };
    }
    return { ok: true, resolved };
  }

  if (resolved.target_type === "STORE") {
    const storeId = resolved.target_store_id!;
    const allowed = service.storeTypesForStores ?? [];
    const isNumeric = /^\d+$/.test(storeId);
    const rows = isNumeric
      ? await sql<Array<{ id: number; store_id: string; store_type: string | null }>>`
          SELECT id, store_id, store_type::text AS store_type
          FROM merchant_stores
          WHERE deleted_at IS NULL
            AND (UPPER(TRIM(store_id)) = UPPER(${storeId}) OR id = ${Number(storeId)})
          LIMIT 1
        `
      : await sql<Array<{ id: number; store_id: string; store_type: string | null }>>`
          SELECT id, store_id, store_type::text AS store_type
          FROM merchant_stores
          WHERE deleted_at IS NULL
            AND UPPER(TRIM(store_id)) = UPPER(${storeId})
          LIMIT 1
        `;
    const row = rows[0];
    if (!row) return { ok: false, error: "Store not found" };
    const st = String(row.store_type ?? "").toUpperCase();
    if (allowed.length > 0 && st && !allowed.includes(st)) {
      return {
        ok: false,
        error: `Store type ${st} does not match service ${service.id}`,
      };
    }
    const publicId = String(row.store_id || storeId).trim();
    resolved = {
      ...resolved,
      target_id: publicId,
      target_store_id: publicId,
      deepLink: `/home/merchant/${encodeURIComponent(publicId)}`,
    };
    return { ok: true, resolved };
  }

  return { ok: true, resolved };
}

export function announcementTargetFromVariables(
  variables: Record<string, unknown> | null | undefined,
): AnnouncementTargetInput {
  return parseTargetFromBody(variables ?? {});
}
