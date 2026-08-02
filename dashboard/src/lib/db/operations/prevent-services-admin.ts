/**
 * Prevent Services admin CRUD (shared SQL used by Fastify admin routes).
 */

import { getSql } from "../client";
import {
  invalidatePreventServicesCache,
  PREVENT_SERVICE_CODES,
  type PreventServiceCode,
} from "./prevent-services-shared";

export type PreventSearchType = "flat_search" | "lat_lng";
export type PreventRuleStatus = "active" | "paused" | "expired" | "deleted";

export type PreventRuleListItem = {
  id: string;
  locationId: string;
  searchType: PreventSearchType;
  placeId: string | null;
  locationName: string;
  address: string | null;
  latitude: number;
  longitude: number;
  radiusMeters: number;
  status: PreventRuleStatus;
  reason: string | null;
  reasonCustom: string | null;
  blockedServices: PreventServiceCode[];
  startsAt: string | null;
  endsAt: string | null;
  createdBy: string | null;
  createdByName: string | null;
  updatedBy: string | null;
  updatedByName: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PreventUpsertInput = {
  searchType: PreventSearchType;
  placeId?: string | null;
  locationName: string;
  address?: string | null;
  latitude: number;
  longitude: number;
  radiusMeters: number;
  blockedServices: PreventServiceCode[];
  reason?: string | null;
  reasonCustom?: string | null;
  startsAt?: string | null;
  endsAt?: string | null;
  status?: "active" | "paused";
  adminId?: string | null;
  adminName?: string | null;
};

type FlatRow = {
  id: string;
  location_id: string;
  search_type: PreventSearchType;
  place_id: string | null;
  location_name: string;
  address: string | null;
  latitude: number;
  longitude: number;
  radius_meters: number;
  status: PreventRuleStatus;
  reason: string | null;
  reason_custom: string | null;
  blocked_services: string[] | null;
  starts_at: string | null;
  ends_at: string | null;
  created_by: string | null;
  created_by_name: string | null;
  updated_by: string | null;
  updated_by_name: string | null;
  created_at: string;
  updated_at: string;
};

function mapItem(r: FlatRow): PreventRuleListItem {
  return {
    id: r.id,
    locationId: r.location_id,
    searchType: r.search_type,
    placeId: r.place_id,
    locationName: r.location_name,
    address: r.address,
    latitude: Number(r.latitude),
    longitude: Number(r.longitude),
    radiusMeters: Number(r.radius_meters),
    status: r.status,
    reason: r.reason,
    reasonCustom: r.reason_custom,
    blockedServices: (r.blocked_services ?? []).filter((s): s is PreventServiceCode =>
      (PREVENT_SERVICE_CODES as readonly string[]).includes(s)
    ),
    startsAt: r.starts_at,
    endsAt: r.ends_at,
    createdBy: r.created_by,
    createdByName: r.created_by_name,
    updatedBy: r.updated_by,
    updatedByName: r.updated_by_name,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

async function writeLog(args: {
  ruleId: string;
  action:
    | "created"
    | "updated"
    | "paused"
    | "resumed"
    | "deleted"
    | "expired"
    | "enabled"
    | "disabled"
    | "trigger_fired";
  adminId?: string | null;
  adminName?: string | null;
  reason?: string | null;
  snapshot?: unknown;
}) {
  const sql = getSql();
  await sql`
    INSERT INTO public.prevent_service_logs (
      rule_id, action, admin_id, admin_name, reason, snapshot
    ) VALUES (
      ${args.ruleId}::uuid,
      ${args.action},
      ${args.adminId ?? null}::uuid,
      ${args.adminName ?? null},
      ${args.reason ?? null},
      ${args.snapshot != null ? JSON.stringify(args.snapshot) : null}::jsonb
    )
  `;
}

async function replaceServices(ruleId: string, services: PreventServiceCode[]) {
  const sql = getSql();
  await sql`DELETE FROM public.prevent_service_services WHERE rule_id = ${ruleId}::uuid`;
  for (const code of services) {
    await sql`
      INSERT INTO public.prevent_service_services (rule_id, service_code)
      VALUES (${ruleId}::uuid, ${code})
      ON CONFLICT (rule_id, service_code) DO NOTHING
    `;
  }
}

export async function listPreventServiceRules(opts?: {
  status?: PreventRuleStatus | "all";
}): Promise<PreventRuleListItem[]> {
  const sql = getSql();
  await sql`SELECT public.prevent_services_expire_due()`.catch(() => undefined);
  const status = opts?.status ?? "all";
  const rows =
    status === "all"
      ? await sql<FlatRow[]>`
          SELECT
            r.id,
            r.location_id,
            l.search_type,
            l.place_id,
            l.location_name,
            l.address,
            l.latitude,
            l.longitude,
            l.radius_meters,
            r.status,
            r.reason,
            r.reason_custom,
            ARRAY(
              SELECT s.service_code
              FROM public.prevent_service_services s
              WHERE s.rule_id = r.id
              ORDER BY s.service_code
            ) AS blocked_services,
            r.starts_at,
            r.ends_at,
            r.created_by::text,
            r.created_by_name,
            r.updated_by::text,
            r.updated_by_name,
            r.created_at,
            r.updated_at
          FROM public.prevent_service_rules r
          JOIN public.prevent_service_locations l ON l.id = r.location_id
          WHERE r.deleted_at IS NULL
            AND r.status <> 'deleted'
          ORDER BY r.updated_at DESC, r.created_at DESC
        `
      : await sql<FlatRow[]>`
          SELECT
            r.id,
            r.location_id,
            l.search_type,
            l.place_id,
            l.location_name,
            l.address,
            l.latitude,
            l.longitude,
            l.radius_meters,
            r.status,
            r.reason,
            r.reason_custom,
            ARRAY(
              SELECT s.service_code
              FROM public.prevent_service_services s
              WHERE s.rule_id = r.id
              ORDER BY s.service_code
            ) AS blocked_services,
            r.starts_at,
            r.ends_at,
            r.created_by::text,
            r.created_by_name,
            r.updated_by::text,
            r.updated_by_name,
            r.created_at,
            r.updated_at
          FROM public.prevent_service_rules r
          JOIN public.prevent_service_locations l ON l.id = r.location_id
          WHERE r.deleted_at IS NULL
            AND r.status = ${status}
          ORDER BY r.updated_at DESC, r.created_at DESC
        `;
  return (rows ?? []).map(mapItem);
}

export async function getPreventServiceRule(id: string): Promise<PreventRuleListItem | null> {
  const sql = getSql();
  const rows = await sql<FlatRow[]>`
    SELECT
      r.id,
      r.location_id,
      l.search_type,
      l.place_id,
      l.location_name,
      l.address,
      l.latitude,
      l.longitude,
      l.radius_meters,
      r.status,
      r.reason,
      r.reason_custom,
      ARRAY(
        SELECT s.service_code
        FROM public.prevent_service_services s
        WHERE s.rule_id = r.id
        ORDER BY s.service_code
      ) AS blocked_services,
      r.starts_at,
      r.ends_at,
      r.created_by::text,
      r.created_by_name,
      r.updated_by::text,
      r.updated_by_name,
      r.created_at,
      r.updated_at
    FROM public.prevent_service_rules r
    JOIN public.prevent_service_locations l ON l.id = r.location_id
    WHERE r.id = ${id}::uuid
      AND r.deleted_at IS NULL
    LIMIT 1
  `;
  return rows[0] ? mapItem(rows[0]) : null;
}

export async function createPreventServiceRule(
  input: PreventUpsertInput
): Promise<PreventRuleListItem> {
  if (!input.blockedServices.length) {
    throw Object.assign(new Error("Select at least one service to block"), { statusCode: 400 });
  }
  const sql = getSql();
  const [loc] = await sql<Array<{ id: string }>>`
    INSERT INTO public.prevent_service_locations (
      search_type, place_id, location_name, address,
      latitude, longitude, radius_meters
    ) VALUES (
      ${input.searchType},
      ${input.placeId ?? null},
      ${input.locationName.trim()},
      ${input.address?.trim() || null},
      ${input.latitude},
      ${input.longitude},
      ${input.radiusMeters}
    )
    RETURNING id
  `;
  const status = input.status ?? "active";
  const [rule] = await sql<Array<{ id: string }>>`
    INSERT INTO public.prevent_service_rules (
      location_id, status, reason, reason_custom,
      starts_at, ends_at,
      created_by, created_by_name, updated_by, updated_by_name
    ) VALUES (
      ${loc.id}::uuid,
      ${status},
      ${input.reason ?? null},
      ${input.reasonCustom ?? null},
      ${input.startsAt ?? null}::timestamptz,
      ${input.endsAt ?? null}::timestamptz,
      ${input.adminId ?? null}::uuid,
      ${input.adminName ?? null},
      ${input.adminId ?? null}::uuid,
      ${input.adminName ?? null}
    )
    RETURNING id
  `;
  await replaceServices(rule.id, input.blockedServices);
  const created = await getPreventServiceRule(rule.id);
  if (!created) throw new Error("Failed to load created rule");
  await writeLog({
    ruleId: rule.id,
    action: "created",
    adminId: input.adminId,
    adminName: input.adminName,
    reason: input.reason ?? input.reasonCustom,
    snapshot: created,
  });
  if (created.status === "active") {
    await writeLog({
      ruleId: rule.id,
      action: "trigger_fired",
      adminId: input.adminId,
      adminName: input.adminName,
      reason: "Rule activated on create",
      snapshot: { status: "active", blockedServices: created.blockedServices },
    });
  }
  await invalidatePreventServicesCache();
  return created;
}

export async function updatePreventServiceRule(
  id: string,
  input: PreventUpsertInput
): Promise<PreventRuleListItem> {
  if (!input.blockedServices.length) {
    throw Object.assign(new Error("Select at least one service to block"), { statusCode: 400 });
  }
  const existing = await getPreventServiceRule(id);
  if (!existing) {
    throw Object.assign(new Error("Rule not found"), { statusCode: 404 });
  }
  const sql = getSql();
  await sql`
    UPDATE public.prevent_service_locations
    SET
      search_type = ${input.searchType},
      place_id = ${input.placeId ?? null},
      location_name = ${input.locationName.trim()},
      address = ${input.address?.trim() || null},
      latitude = ${input.latitude},
      longitude = ${input.longitude},
      radius_meters = ${input.radiusMeters},
      updated_at = NOW()
    WHERE id = ${existing.locationId}::uuid
  `;
  const nextStatus = input.status ?? (existing.status === "paused" ? "paused" : "active");
  await sql`
    UPDATE public.prevent_service_rules
    SET
      status = ${nextStatus},
      reason = ${input.reason ?? null},
      reason_custom = ${input.reasonCustom ?? null},
      starts_at = ${input.startsAt ?? null}::timestamptz,
      ends_at = ${input.endsAt ?? null}::timestamptz,
      updated_by = ${input.adminId ?? null}::uuid,
      updated_by_name = ${input.adminName ?? null},
      updated_at = NOW()
    WHERE id = ${id}::uuid
  `;
  await replaceServices(id, input.blockedServices);
  const updated = await getPreventServiceRule(id);
  if (!updated) throw new Error("Failed to load updated rule");
  await writeLog({
    ruleId: id,
    action: "updated",
    adminId: input.adminId,
    adminName: input.adminName,
    reason: input.reason ?? input.reasonCustom,
    snapshot: updated,
  });
  await invalidatePreventServicesCache();
  return updated;
}

export async function pausePreventServiceRule(args: {
  id: string;
  adminId?: string | null;
  adminName?: string | null;
  reason?: string | null;
}): Promise<PreventRuleListItem> {
  const existing = await getPreventServiceRule(args.id);
  if (!existing) throw Object.assign(new Error("Rule not found"), { statusCode: 404 });
  const sql = getSql();
  await sql`
    UPDATE public.prevent_service_rules
    SET
      status = 'paused',
      updated_by = ${args.adminId ?? null}::uuid,
      updated_by_name = ${args.adminName ?? null},
      updated_at = NOW()
    WHERE id = ${args.id}::uuid
  `;
  const updated = await getPreventServiceRule(args.id);
  if (!updated) throw new Error("Failed to load paused rule");
  await writeLog({
    ruleId: args.id,
    action: "paused",
    adminId: args.adminId,
    adminName: args.adminName,
    reason: args.reason,
    snapshot: updated,
  });
  await writeLog({
    ruleId: args.id,
    action: "disabled",
    adminId: args.adminId,
    adminName: args.adminName,
    reason: args.reason ?? "Rule disabled (paused)",
    snapshot: { status: "paused" },
  });
  await invalidatePreventServicesCache();
  return updated;
}

export async function resumePreventServiceRule(args: {
  id: string;
  adminId?: string | null;
  adminName?: string | null;
  reason?: string | null;
}): Promise<PreventRuleListItem> {
  const existing = await getPreventServiceRule(args.id);
  if (!existing) throw Object.assign(new Error("Rule not found"), { statusCode: 404 });
  const sql = getSql();
  await sql`
    UPDATE public.prevent_service_rules
    SET
      status = CASE
        WHEN ends_at IS NOT NULL AND ends_at <= NOW() THEN 'expired'
        ELSE 'active'
      END,
      updated_by = ${args.adminId ?? null}::uuid,
      updated_by_name = ${args.adminName ?? null},
      updated_at = NOW()
    WHERE id = ${args.id}::uuid
  `;
  const updated = await getPreventServiceRule(args.id);
  if (!updated) throw new Error("Failed to load resumed rule");
  await writeLog({
    ruleId: args.id,
    action: "resumed",
    adminId: args.adminId,
    adminName: args.adminName,
    reason: args.reason,
    snapshot: updated,
  });
  await writeLog({
    ruleId: args.id,
    action: "enabled",
    adminId: args.adminId,
    adminName: args.adminName,
    reason: args.reason ?? "Rule enabled (resumed)",
    snapshot: { status: "active" },
  });
  if (updated.status === "active") {
    await writeLog({
      ruleId: args.id,
      action: "trigger_fired",
      adminId: args.adminId,
      adminName: args.adminName,
      reason: args.reason ?? "Rule re-activated (resumed)",
      snapshot: { status: updated.status },
    });
  }
  await invalidatePreventServicesCache();
  return updated;
}

export async function deletePreventServiceRule(args: {
  id: string;
  adminId?: string | null;
  adminName?: string | null;
  reason?: string | null;
}): Promise<{ ok: true }> {
  const existing = await getPreventServiceRule(args.id);
  if (!existing) throw Object.assign(new Error("Rule not found"), { statusCode: 404 });
  const sql = getSql();
  await sql`
    UPDATE public.prevent_service_rules
    SET
      status = 'deleted',
      deleted_at = NOW(),
      updated_by = ${args.adminId ?? null}::uuid,
      updated_by_name = ${args.adminName ?? null},
      updated_at = NOW()
    WHERE id = ${args.id}::uuid
  `;
  await writeLog({
    ruleId: args.id,
    action: "deleted",
    adminId: args.adminId,
    adminName: args.adminName,
    reason: args.reason,
    snapshot: existing,
  });
  await invalidatePreventServicesCache();
  return { ok: true };
}
