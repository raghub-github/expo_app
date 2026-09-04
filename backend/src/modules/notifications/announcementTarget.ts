/**
 * Validate CUSTOMER_ANNOUNCEMENT tap targets against DB (categories / stores).
 */
import { getSql } from "../../db/client.js";
import {
  buildAnnouncementDeepLink,
  getCustomerHomeService,
  type AnnouncementTargetInput,
  type AnnouncementTargetResolved,
  type AnnouncementTargetType,
} from "../../lib/customer-home-services.js";

export type ValidateAnnouncementTargetResult =
  | { ok: true; resolved: AnnouncementTargetResolved }
  | { ok: false; error: string };

function parseTargetFromBody(body: Record<string, unknown> | null | undefined): AnnouncementTargetInput {
  const src = body ?? {};
  const typeRaw = String(src.targetType ?? src.target_type ?? "NONE")
    .trim()
    .toUpperCase();
  const targetType = (
    ["NONE", "SERVICE", "CATEGORY", "STORE"].includes(typeRaw) ? typeRaw : "NONE"
  ) as AnnouncementTargetType;
  return {
    targetType,
    serviceId: (src.serviceId ?? src.target_service_id ?? null) as string | null,
    categoryId: (src.categoryId ?? src.target_category_id ?? null) as string | null,
    storeId: (src.storeId ?? src.target_store_id ?? null) as string | null,
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

  if (resolved.target_type === "NONE" || resolved.target_type === "SERVICE") {
    return { ok: true, resolved };
  }

  const service = getCustomerHomeService(resolved.target_service_id);
  if (!service) return { ok: false, error: "Unknown service" };

  const sql = getSql();

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
