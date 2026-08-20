/**
 * Field-level merchant menu ADD/EDIT/DELETE review workflow.
 * Live merchant_menu_items is untouched until an agent approves.
 */
import { ulid } from "ulid";
import { getSql } from "../../db/client.js";
import { getMerchantParentIdForStore } from "./categoryRules.js";
import {
  buildFoodLegacyAttributesFromItemRow,
  resolveStoreType,
  upsertItemAttributes,
  type UnifiedAttributes,
} from "./unifiedCatalogAttributes.js";
export type ReviewRequestType = "ADD" | "EDIT" | "DELETE";
export type ReviewRequestStatus = "PENDING" | "APPROVED" | "REJECTED";
export type ReviewSource = "MERCHANT_APP" | "PARTNER_SITE" | "DASHBOARD" | "OTHER";

export type ReviewSubmitOpts = {
  submitted_by: string;
  submitted_by_role?: string;
  source?: ReviewSource;
  client_ip?: string | null;
  device_info?: string | null;
  reason?: string | null;
};

/** Scalar columns that may appear in EDIT diffs / allowlisted approve applies. */
export const REVIEW_EDITABLE_SCALAR_FIELDS = [
  "item_name",
  "item_description",
  "item_image_url",
  "category_id",
  "food_type",
  "spice_level",
  "cuisine_type",
  "base_price",
  "selling_price",
  "discount_percentage",
  "tax_percentage",
  "preparation_time_minutes",
  "packaging_charges",
  "serves",
  "serves_label",
  "short_name",
  "display_order",
  "is_active",
  "allergens",
  "item_size_value",
  "item_size_unit",
  "available_for_delivery",
  "weight_per_serving",
  "weight_per_serving_unit",
  "calories_kcal",
  "protein",
  "protein_unit",
  "carbohydrates",
  "carbohydrates_unit",
  "fat",
  "fat_unit",
  "fibre",
  "fibre_unit",
  "item_tags",
] as const;

export type ReviewEditableField = (typeof REVIEW_EDITABLE_SCALAR_FIELDS)[number];

const EDITABLE_SET = new Set<string>(REVIEW_EDITABLE_SCALAR_FIELDS);

/** Nested JSON fields stored as a single change row when the subtree differs. */
const NESTED_JSON_FIELDS = ["variants", "customizations", "images", "attributes"] as const;

function toJsonb(value: unknown): string {
  return JSON.stringify(value === undefined ? null : value);
}

function normalizeComparable(value: unknown): string {
  if (value === undefined || value === null) return "null";
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "boolean") return value ? "true" : "false";
  if (Array.isArray(value) || (typeof value === "object" && value !== null)) {
    try {
      return JSON.stringify(value, Object.keys(value as object).sort());
    } catch {
      return String(value);
    }
  }
  return String(value);
}

function valuesEqual(a: unknown, b: unknown): boolean {
  return normalizeComparable(a) === normalizeComparable(b);
}

async function resolveMerchantId(storeIdNum: number): Promise<number | null> {
  return getMerchantParentIdForStore(storeIdNum);
}

async function loadItemSnapshot(
  menuItemId: number,
  storeIdNum: number
): Promise<Record<string, unknown> | null> {
  const sql = getSql();
  const [row] = await sql`
    SELECT id, item_id, item_name, item_description, item_image_url, category_id, food_type, spice_level, cuisine_type,
           base_price, selling_price, discount_percentage, tax_percentage,
           preparation_time_minutes, packaging_charges, serves, serves_label, short_name,
           display_order, is_active, allergens,
           item_size_value, item_size_unit, available_for_delivery,
           weight_per_serving, weight_per_serving_unit, calories_kcal,
           protein, protein_unit, carbohydrates, carbohydrates_unit,
           fat, fat_unit, fibre, fibre_unit, item_tags, approval_status::text AS approval_status
    FROM merchant_menu_items
    WHERE id = ${menuItemId} AND store_id = ${storeIdNum}
      AND COALESCE(is_deleted, false) = false
  `;
  return row ? (row as Record<string, unknown>) : null;
}

function buildFieldDiffs(
  current: Record<string, unknown>,
  proposed: Record<string, unknown>
): Array<{ field_name: string; old_value: unknown; new_value: unknown }> {
  const diffs: Array<{ field_name: string; old_value: unknown; new_value: unknown }> = [];

  for (const field of REVIEW_EDITABLE_SCALAR_FIELDS) {
    if (!(field in proposed)) continue;
    const newVal = proposed[field];
    const oldVal = current[field] ?? null;
    if (valuesEqual(oldVal, newVal)) continue;
    diffs.push({ field_name: field, old_value: oldVal, new_value: newVal });
  }

  for (const field of NESTED_JSON_FIELDS) {
    if (!(field in proposed)) continue;
    const newVal = proposed[field];
    const oldVal = current[field] ?? null;
    if (valuesEqual(oldVal, newVal)) continue;
    diffs.push({ field_name: field, old_value: oldVal, new_value: newVal });
  }

  return diffs;
}

export async function submitAddReviewRequest(
  storeIdNum: number,
  addPayload: Record<string, unknown>,
  opts: ReviewSubmitOpts
): Promise<{ review_request_id: number }> {
  if (!addPayload?.item_name || addPayload.base_price == null || addPayload.selling_price == null) {
    throw new Error("add_payload_incomplete");
  }
  const sql = getSql();
  const merchantId = await resolveMerchantId(storeIdNum);
  const source = opts.source ?? "OTHER";

  const [inserted] = await sql`
    INSERT INTO merchant_menu_item_review_requests (
      merchant_id, store_id, menu_item_id, request_type, status,
      submitted_by, submitted_by_role, source, client_ip, device_info, add_payload, updated_at
    ) VALUES (
      ${merchantId}, ${storeIdNum}, NULL,
      'ADD'::merchant_menu_item_review_request_type,
      'PENDING'::merchant_menu_item_review_request_status,
      ${opts.submitted_by}, ${opts.submitted_by_role ?? "merchant"},
      ${source}::merchant_menu_item_review_source,
      ${opts.client_ip ?? null}, ${opts.device_info ?? null},
      ${toJsonb(addPayload)}::text::jsonb, NOW()
    )
    RETURNING id
  `;
  const reviewRequestId = Number((inserted as { id: number }).id);

  await sql`
    INSERT INTO merchant_menu_item_review_action_log (
      review_request_id, action, actor, actor_role, source, client_ip, device_info, details
    ) VALUES (
      ${reviewRequestId}, 'SUBMIT'::merchant_menu_item_review_action,
      ${opts.submitted_by}, ${opts.submitted_by_role ?? "merchant"},
      ${source}::merchant_menu_item_review_source,
      ${opts.client_ip ?? null}, ${opts.device_info ?? null},
      ${toJsonb({ request_type: "ADD", reason: opts.reason ?? null })}::text::jsonb
    )
  `;

  return { review_request_id: reviewRequestId };
}

export async function updatePendingAddPayload(
  reviewRequestId: number,
  storeIdNum: number,
  addPayload: Record<string, unknown>,
  opts: ReviewSubmitOpts
): Promise<boolean> {
  const sql = getSql();
  const result = await sql`
    UPDATE merchant_menu_item_review_requests
    SET add_payload = ${toJsonb(addPayload)}::text::jsonb,
        updated_at = NOW(),
        submitted_by = ${opts.submitted_by},
        submitted_by_role = ${opts.submitted_by_role ?? "merchant"}
    WHERE id = ${reviewRequestId}
      AND store_id = ${storeIdNum}
      AND request_type = 'ADD'::merchant_menu_item_review_request_type
      AND status = 'PENDING'::merchant_menu_item_review_request_status
  `;
  return (result.count ?? 0) > 0;
}

export async function submitEditReviewRequest(
  storeIdNum: number,
  menuItemId: number,
  proposed: Record<string, unknown>,
  opts: ReviewSubmitOpts
): Promise<{ review_request_id: number; merged?: boolean } | { error: string }> {
  const current = await loadItemSnapshot(menuItemId, storeIdNum);
  if (!current) return { error: "item_not_found" };
  if (String(current.approval_status) !== "APPROVED") {
    return { error: "edit_review_only_for_approved" };
  }

  const sql = getSql();
  const diffs = buildFieldDiffs(current, proposed);
  if (diffs.length === 0) return { error: "no_changes" };

  const [pending] = await sql`
    SELECT id FROM merchant_menu_item_review_requests
    WHERE menu_item_id = ${menuItemId}
      AND store_id = ${storeIdNum}
      AND status = 'PENDING'::merchant_menu_item_review_request_status
      AND request_type = 'EDIT'::merchant_menu_item_review_request_type
    LIMIT 1
  `;

  const source = opts.source ?? "OTHER";

  // Merge into existing pending EDIT: keep original old_value, update new_value.
  if (pending) {
    const reviewRequestId = Number((pending as { id: number }).id);
    await sql.begin(async (trx) => {
      const existing = await trx`
        SELECT id, field_name, old_value, new_value
        FROM merchant_menu_item_review_changes
        WHERE review_request_id = ${reviewRequestId}
      `;
      const byField = new Map<string, { id: number; old_value: unknown }>();
      for (const c of existing as any[]) {
        byField.set(String(c.field_name), { id: Number(c.id), old_value: c.old_value });
      }

      for (const d of diffs) {
        const ex = byField.get(d.field_name);
        if (ex) {
          if (valuesEqual(ex.old_value, d.new_value)) {
            await trx`DELETE FROM merchant_menu_item_review_changes WHERE id = ${ex.id}`;
          } else {
            await trx`
              UPDATE merchant_menu_item_review_changes
              SET new_value = ${toJsonb(d.new_value)}::text::jsonb
              WHERE id = ${ex.id}
            `;
          }
        } else {
          await trx`
            INSERT INTO merchant_menu_item_review_changes (
              review_request_id, field_name, old_value, new_value
            ) VALUES (
              ${reviewRequestId}, ${d.field_name},
              ${toJsonb(d.old_value)}::text::jsonb,
              ${toJsonb(d.new_value)}::text::jsonb
            )
          `;
        }
      }

      await trx`
        UPDATE merchant_menu_item_review_requests
        SET submitted_by = ${opts.submitted_by},
            submitted_by_role = ${opts.submitted_by_role ?? "merchant"},
            updated_at = NOW()
        WHERE id = ${reviewRequestId}
      `;

      await trx`
        INSERT INTO merchant_menu_item_review_action_log (
          review_request_id, action, actor, actor_role, source, client_ip, device_info, details
        ) VALUES (
          ${reviewRequestId}, 'SUBMIT'::merchant_menu_item_review_action,
          ${opts.submitted_by}, ${opts.submitted_by_role ?? "merchant"},
          ${source}::merchant_menu_item_review_source,
          ${opts.client_ip ?? null}, ${opts.device_info ?? null},
          ${toJsonb({ request_type: "EDIT", merged: true, fields: diffs.map((x) => x.field_name), reason: opts.reason ?? null })}::text::jsonb
        )
      `;
    });
    return { review_request_id: reviewRequestId, merged: true };
  }

  const merchantId = await resolveMerchantId(storeIdNum);

  const reviewRequestId = await sql.begin(async (trx) => {
    const [inserted] = await trx`
      INSERT INTO merchant_menu_item_review_requests (
        merchant_id, store_id, menu_item_id, request_type, status,
        submitted_by, submitted_by_role, source, client_ip, device_info, updated_at
      ) VALUES (
        ${merchantId}, ${storeIdNum}, ${menuItemId},
        'EDIT'::merchant_menu_item_review_request_type,
        'PENDING'::merchant_menu_item_review_request_status,
        ${opts.submitted_by}, ${opts.submitted_by_role ?? "merchant"},
        ${source}::merchant_menu_item_review_source,
        ${opts.client_ip ?? null}, ${opts.device_info ?? null}, NOW()
      )
      RETURNING id
    `;
    const id = Number((inserted as { id: number }).id);

    for (const d of diffs) {
      await trx`
        INSERT INTO merchant_menu_item_review_changes (
          review_request_id, field_name, old_value, new_value
        ) VALUES (
          ${id}, ${d.field_name},
          ${toJsonb(d.old_value)}::text::jsonb,
          ${toJsonb(d.new_value)}::text::jsonb
        )
      `;
    }

    await trx`
      INSERT INTO merchant_menu_item_review_action_log (
        review_request_id, action, actor, actor_role, source, client_ip, device_info, details
      ) VALUES (
        ${id}, 'SUBMIT'::merchant_menu_item_review_action,
        ${opts.submitted_by}, ${opts.submitted_by_role ?? "merchant"},
        ${source}::merchant_menu_item_review_source,
        ${opts.client_ip ?? null}, ${opts.device_info ?? null},
        ${toJsonb({ request_type: "EDIT", fields: diffs.map((x) => x.field_name), reason: opts.reason ?? null })}::text::jsonb
      )
    `;
    return id;
  });

  return { review_request_id: reviewRequestId };
}

export async function submitDeleteReviewRequest(
  storeIdNum: number,
  menuItemId: number,
  opts: ReviewSubmitOpts
): Promise<{ review_request_id: number } | { error: string }> {
  const current = await loadItemSnapshot(menuItemId, storeIdNum);
  if (!current) return { error: "item_not_found" };
  if (String(current.approval_status) !== "APPROVED") {
    return { error: "delete_review_only_for_approved" };
  }

  const sql = getSql();
  const [pending] = await sql`
    SELECT id FROM merchant_menu_item_review_requests
    WHERE menu_item_id = ${menuItemId}
      AND store_id = ${storeIdNum}
      AND status = 'PENDING'::merchant_menu_item_review_request_status
      AND request_type = 'DELETE'::merchant_menu_item_review_request_type
    LIMIT 1
  `;
  if (pending) return { error: "pending_delete_exists" };

  const merchantId = await resolveMerchantId(storeIdNum);
  const source = opts.source ?? "OTHER";

  const [inserted] = await sql`
    INSERT INTO merchant_menu_item_review_requests (
      merchant_id, store_id, menu_item_id, request_type, status,
      submitted_by, submitted_by_role, source, client_ip, device_info, updated_at
    ) VALUES (
      ${merchantId}, ${storeIdNum}, ${menuItemId},
      'DELETE'::merchant_menu_item_review_request_type,
      'PENDING'::merchant_menu_item_review_request_status,
      ${opts.submitted_by}, ${opts.submitted_by_role ?? "merchant"},
      ${source}::merchant_menu_item_review_source,
      ${opts.client_ip ?? null}, ${opts.device_info ?? null}, NOW()
    )
    RETURNING id
  `;
  const reviewRequestId = Number((inserted as { id: number }).id);

  await sql`
    INSERT INTO merchant_menu_item_review_action_log (
      review_request_id, action, actor, actor_role, source, client_ip, device_info, details
    ) VALUES (
      ${reviewRequestId}, 'SUBMIT'::merchant_menu_item_review_action,
      ${opts.submitted_by}, ${opts.submitted_by_role ?? "merchant"},
      ${source}::merchant_menu_item_review_source,
      ${opts.client_ip ?? null}, ${opts.device_info ?? null},
      ${toJsonb({ request_type: "DELETE", reason: opts.reason ?? null })}::text::jsonb
    )
  `;

  return { review_request_id: reviewRequestId };
}

export async function listReviewRequests(filters: {
  storeIdNum?: number | null;
  status?: ReviewRequestStatus | null;
  request_type?: ReviewRequestType | null;
  limit: number;
  offset: number;
}): Promise<{ requests: any[]; total: number }> {
  const sql = getSql();
  const storeCond = filters.storeIdNum != null ? sql`AND r.store_id = ${filters.storeIdNum}` : sql``;
  const statusCond =
    filters.status != null
      ? sql`AND r.status = ${filters.status}::merchant_menu_item_review_request_status`
      : sql``;
  const typeCond =
    filters.request_type != null
      ? sql`AND r.request_type = ${filters.request_type}::merchant_menu_item_review_request_type`
      : sql``;

  const countResult = await sql`
    SELECT COUNT(*)::int AS c FROM merchant_menu_item_review_requests r
    WHERE 1=1 ${storeCond} ${statusCond} ${typeCond}
  `;
  const total = Number((countResult[0] as { c: number })?.c ?? 0);

  const rows = await sql`
    SELECT r.id, r.merchant_id, r.store_id, r.menu_item_id,
           r.request_type::text, r.status::text,
           r.submitted_by, r.submitted_by_role, r.submitted_at,
           r.reviewed_by, r.reviewed_by_role, r.reviewed_at, r.rejection_reason,
           r.source::text, r.client_ip, r.device_info, r.add_payload,
           r.created_at, r.updated_at,
           i.item_name, i.item_id AS menu_item_public_id,
           COALESCE(
             (SELECT jsonb_agg(jsonb_build_object(
               'id', c.id,
               'field_name', c.field_name,
               'old_value', c.old_value,
               'new_value', c.new_value,
               'created_at', c.created_at
             ) ORDER BY c.id)
              FROM merchant_menu_item_review_changes c
              WHERE c.review_request_id = r.id),
             '[]'::jsonb
           ) AS changes
    FROM merchant_menu_item_review_requests r
    LEFT JOIN merchant_menu_items i ON i.id = r.menu_item_id AND i.store_id = r.store_id
    WHERE 1=1 ${storeCond} ${statusCond} ${typeCond}
    ORDER BY r.submitted_at DESC
    LIMIT ${filters.limit} OFFSET ${filters.offset}
  `;

  return { requests: rows as any[], total };
}

export async function listReviewRequestsForItem(
  menuItemId: number,
  storeIdNum: number
): Promise<
  Array<{
    id: number;
    request_type: string;
    status: string;
    created_at: Date;
    reviewed_at: Date | null;
    rejection_reason: string | null;
  }>
> {
  const sql = getSql();
  const rows = await sql`
    SELECT id, request_type::text, status::text, created_at, reviewed_at, rejection_reason
    FROM merchant_menu_item_review_requests
    WHERE menu_item_id = ${menuItemId} AND store_id = ${storeIdNum}
    ORDER BY created_at DESC
    LIMIT 20
  `;
  return rows as any;
}

export async function getReviewRequestById(
  id: number,
  storeIdNum?: number | null
): Promise<any | null> {
  const sql = getSql();
  const storeCond = storeIdNum != null ? sql`AND r.store_id = ${storeIdNum}` : sql``;
  const [row] = await sql`
    SELECT r.id, r.merchant_id, r.store_id, r.menu_item_id,
           r.request_type::text, r.status::text,
           r.submitted_by, r.submitted_by_role, r.submitted_at,
           r.reviewed_by, r.reviewed_by_role, r.reviewed_at, r.rejection_reason,
           r.source::text, r.client_ip, r.device_info, r.add_payload,
           r.created_at, r.updated_at,
           i.item_name, i.item_id AS menu_item_public_id,
           COALESCE(
             (SELECT jsonb_agg(jsonb_build_object(
               'id', c.id,
               'field_name', c.field_name,
               'old_value', c.old_value,
               'new_value', c.new_value,
               'created_at', c.created_at
             ) ORDER BY c.id)
              FROM merchant_menu_item_review_changes c
              WHERE c.review_request_id = r.id),
             '[]'::jsonb
           ) AS changes
    FROM merchant_menu_item_review_requests r
    LEFT JOIN merchant_menu_items i ON i.id = r.menu_item_id AND i.store_id = r.store_id
    WHERE r.id = ${id} ${storeCond}
  `;
  return row ?? null;
}

export async function hasPendingReviewRequest(
  menuItemId: number,
  storeIdNum: number
): Promise<boolean> {
  const sql = getSql();
  const [r] = await sql`
    SELECT 1 FROM merchant_menu_item_review_requests
    WHERE menu_item_id = ${menuItemId}
      AND store_id = ${storeIdNum}
      AND status = 'PENDING'::merchant_menu_item_review_request_status
    LIMIT 1
  `;
  return !!r;
}

async function applyNestedFromPayload(
  menuItemId: number,
  storeIdNum: number,
  payload: Record<string, unknown>,
  trx: any
): Promise<void> {
  const images = Array.isArray(payload.images) ? payload.images : null;
  if (images) {
    for (let i = 0; i < images.length; i++) {
      const img = images[i] as Record<string, unknown>;
      const url = typeof img.image_url === "string" ? img.image_url : typeof img.url === "string" ? img.url : null;
      if (!url) continue;
      const r2Key = typeof img.r2_key === "string" ? img.r2_key : null;
      const isPrimary = Boolean(img.is_primary) || i === 0;
      await trx`
        INSERT INTO merchant_menu_item_images (
          menu_item_id, image_url, r2_key, is_primary, moderation_status, display_order
        ) VALUES (
          ${menuItemId}, ${url}, ${r2Key}, ${isPrimary}, 'APPROVED', ${i}
        )
      `;
    }
    const primaryUrl =
      images
        .map((img: any) => img?.image_url ?? img?.url)
        .find((u: unknown) => typeof u === "string" && u) ?? null;
    if (primaryUrl) {
      await trx`
        UPDATE merchant_menu_items
        SET item_image_url = ${primaryUrl}, updated_at = NOW()
        WHERE id = ${menuItemId} AND store_id = ${storeIdNum}
      `;
    }
  }

  const variants = Array.isArray(payload.variants) ? payload.variants : null;
  if (variants) {
    for (let i = 0; i < variants.length; i++) {
      const v = variants[i] as Record<string, unknown>;
      const name = String(v.variant_name ?? v.name ?? "").trim();
      if (!name) continue;
      const price = Number(v.variant_price ?? v.price ?? 0);
      await trx`
        INSERT INTO merchant_menu_item_variants (
          menu_item_id, variant_name, variant_type, variant_price, display_order, is_default, in_stock
        ) VALUES (
          ${menuItemId}, ${name}, ${String(v.variant_type ?? "SIZE")},
          ${price}, ${Number(v.display_order ?? i)}, ${Boolean(v.is_default)}, true
        )
      `;
    }
  }

  const customizations = Array.isArray(payload.customizations) ? payload.customizations : null;
  if (customizations) {
    for (let i = 0; i < customizations.length; i++) {
      const g = customizations[i] as Record<string, unknown>;
      const title = String(g.customization_title ?? g.title ?? "").trim();
      if (!title) continue;
      const [group] = await trx`
        INSERT INTO merchant_menu_item_customizations (
          menu_item_id, customization_title, is_required, min_selection, max_selection, display_order
        ) VALUES (
          ${menuItemId}, ${title}, ${Boolean(g.is_required)},
          ${Number(g.min_selection ?? 0)}, ${g.max_selection != null ? Number(g.max_selection) : null},
          ${Number(g.display_order ?? i)}
        )
        RETURNING id
      `;
      const groupId = Number((group as { id: number }).id);
      const addons = Array.isArray(g.addons) ? g.addons : Array.isArray(g.options) ? g.options : [];
      for (let j = 0; j < addons.length; j++) {
        const a = addons[j] as Record<string, unknown>;
        const addonName = String(a.addon_name ?? a.name ?? "").trim();
        if (!addonName) continue;
        await trx`
          INSERT INTO merchant_menu_item_addons (
            customization_id, addon_name, addon_price, display_order, in_stock
          ) VALUES (
            ${groupId}, ${addonName}, ${Number(a.addon_price ?? a.price ?? 0)}, ${j}, true
          )
        `;
      }
    }
  }
}

export async function approveReviewRequest(
  requestId: number,
  opts: {
    reviewed_by: string;
    reviewed_by_role?: string;
    client_ip?: string | null;
    device_info?: string | null;
  }
): Promise<{ ok: boolean; error?: string; storeId?: number; menu_item_id?: number | null }> {
  const sql = getSql();
  const [req] = await sql`
    SELECT id, merchant_id, store_id, menu_item_id, request_type::text, status::text,
           add_payload, source::text, submitted_by, submitted_by_role
    FROM merchant_menu_item_review_requests WHERE id = ${requestId}
  `;
  if (!req) return { ok: false, error: "request_not_found" };
  const r = req as any;
  if (r.status !== "PENDING") return { ok: false, error: "request_not_pending" };

  const storeIdNum = Number(r.store_id);
  let menuItemId = r.menu_item_id != null ? Number(r.menu_item_id) : null;

  try {
    await sql.begin(async (trx) => {
      if (r.request_type === "EDIT" && menuItemId != null) {
        const changes = await trx`
          SELECT field_name, old_value, new_value
          FROM merchant_menu_item_review_changes
          WHERE review_request_id = ${requestId}
          ORDER BY id
        `;
        const scalarChanges = (changes as any[]).filter((c) => EDITABLE_SET.has(c.field_name));
        const nestedChanges = (changes as any[]).filter((c) =>
          (NESTED_JSON_FIELDS as readonly string[]).includes(c.field_name)
        );

        // Apply scalars via updateItem outside nested image loops — still inside this tx for deletes.
        // postgres.js begin: nested helpers using getSql() won't share the trx.
        // Apply scalars with dynamic SQL inside trx for transactional integrity.
        if (scalarChanges.length > 0) {
          const patch: Record<string, unknown> = {};
          for (const c of scalarChanges) {
            patch[c.field_name] = c.new_value;
          }
          // Use column-safe updates one field at a time inside trx
          for (const [field, rawVal] of Object.entries(patch)) {
            if (!EDITABLE_SET.has(field)) continue;
            const val = rawVal;
            // Dynamic column update via unsafe with validated field name
            await (trx as any).unsafe(
              `UPDATE merchant_menu_items SET ${field} = $1, updated_at = NOW() WHERE id = $2 AND store_id = $3`,
              [val as any, menuItemId, storeIdNum]
            );
          }
          await trx`
            UPDATE merchant_menu_items
            SET approval_status = 'APPROVED'::merchant_menu_item_approval_status,
                approved_at = NOW(),
                approved_by = ${opts.reviewed_by},
                updated_at = NOW()
            WHERE id = ${menuItemId} AND store_id = ${storeIdNum}
          `;
        }

        for (const c of nestedChanges) {
          if (c.field_name === "images" && Array.isArray(c.new_value)) {
            await trx`DELETE FROM merchant_menu_item_images WHERE menu_item_id = ${menuItemId}`;
            await applyNestedFromPayload(menuItemId, storeIdNum, { images: c.new_value }, trx);
          } else if (c.field_name === "variants" && Array.isArray(c.new_value)) {
            await trx`DELETE FROM merchant_menu_item_variants WHERE menu_item_id = ${menuItemId}`;
            await applyNestedFromPayload(menuItemId, storeIdNum, { variants: c.new_value }, trx);
          } else if (c.field_name === "customizations" && Array.isArray(c.new_value)) {
            const oldGroups = await trx`
              SELECT id FROM merchant_menu_item_customizations WHERE menu_item_id = ${menuItemId}
            `;
            for (const g of oldGroups as any[]) {
              await trx`DELETE FROM merchant_menu_item_addons WHERE customization_id = ${Number(g.id)}`;
            }
            await trx`DELETE FROM merchant_menu_item_customizations WHERE menu_item_id = ${menuItemId}`;
            await applyNestedFromPayload(menuItemId, storeIdNum, { customizations: c.new_value }, trx);
          }
        }
      } else if (r.request_type === "ADD") {
        const payload = (r.add_payload ?? {}) as Record<string, unknown>;
        const itemId = `mi_${ulid().toLowerCase()}`;
        const [created] = await trx`
          INSERT INTO merchant_menu_items (
            store_id, category_id, item_id, item_name, item_description, item_image_url,
            food_type, spice_level, cuisine_type,
            base_price, selling_price, preparation_time_minutes, packaging_charges,
            serves, serves_label, short_name, display_order,
            item_size_value, item_size_unit, available_for_delivery,
            weight_per_serving, weight_per_serving_unit, calories_kcal,
            protein, protein_unit, carbohydrates, carbohydrates_unit,
            fat, fat_unit, fibre, fibre_unit, allergens, item_tags,
            approval_status, approved_at, approved_by, is_active
          ) VALUES (
            ${storeIdNum},
            ${payload.category_id != null ? Number(payload.category_id) : null},
            ${itemId},
            ${String(payload.item_name)},
            ${payload.item_description != null ? String(payload.item_description) : null},
            ${payload.item_image_url != null ? String(payload.item_image_url) : null},
            ${payload.food_type != null ? String(payload.food_type) : null},
            ${payload.spice_level != null ? String(payload.spice_level) : null},
            ${payload.cuisine_type != null ? String(payload.cuisine_type) : null},
            ${Number(payload.base_price)},
            ${Number(payload.selling_price)},
            ${payload.preparation_time_minutes != null ? Number(payload.preparation_time_minutes) : null},
            ${payload.packaging_charges != null ? Number(payload.packaging_charges) : null},
            ${payload.serves != null ? Number(payload.serves) : null},
            ${payload.serves_label != null ? String(payload.serves_label) : null},
            ${payload.short_name != null ? String(payload.short_name) : null},
            ${payload.display_order != null ? Number(payload.display_order) : 0},
            ${payload.item_size_value != null ? Number(payload.item_size_value) : null},
            ${payload.item_size_unit != null ? String(payload.item_size_unit) : null},
            ${payload.available_for_delivery !== false},
            ${payload.weight_per_serving != null ? Number(payload.weight_per_serving) : null},
            ${payload.weight_per_serving_unit != null ? String(payload.weight_per_serving_unit) : null},
            ${payload.calories_kcal != null ? Number(payload.calories_kcal) : null},
            ${payload.protein != null ? Number(payload.protein) : null},
            ${payload.protein_unit != null ? String(payload.protein_unit) : null},
            ${payload.carbohydrates != null ? Number(payload.carbohydrates) : null},
            ${payload.carbohydrates_unit != null ? String(payload.carbohydrates_unit) : null},
            ${payload.fat != null ? Number(payload.fat) : null},
            ${payload.fat_unit != null ? String(payload.fat_unit) : null},
            ${payload.fibre != null ? Number(payload.fibre) : null},
            ${payload.fibre_unit != null ? String(payload.fibre_unit) : null},
            ${payload.allergens != null ? (payload.allergens as any) : null},
            ${payload.item_tags != null ? (payload.item_tags as any) : null},
            'APPROVED'::merchant_menu_item_approval_status,
            NOW(),
            ${opts.reviewed_by},
            ${payload.is_active !== false}
          )
          RETURNING id
        `;
        menuItemId = Number((created as { id: number }).id);
        await applyNestedFromPayload(menuItemId, storeIdNum, payload, trx);
      } else if (r.request_type === "DELETE" && menuItemId != null) {
        await trx`
          UPDATE merchant_menu_items
          SET is_deleted = true, updated_at = NOW()
          WHERE id = ${menuItemId} AND store_id = ${storeIdNum}
        `;
      } else {
        throw new Error("unsupported_request_type");
      }

      await trx`
        INSERT INTO merchant_menu_item_review_action_log (
          review_request_id, action, actor, actor_role, source, client_ip, device_info, details
        ) VALUES (
          ${requestId}, 'APPROVE'::merchant_menu_item_review_action,
          ${opts.reviewed_by}, ${opts.reviewed_by_role ?? "agent"},
          ${(r.source ?? "OTHER")}::merchant_menu_item_review_source,
          ${opts.client_ip ?? null}, ${opts.device_info ?? null},
          ${toJsonb({ menu_item_id: menuItemId, request_type: r.request_type })}::text::jsonb
        )
      `;

      await trx`DELETE FROM merchant_menu_item_review_changes WHERE review_request_id = ${requestId}`;
      await trx`DELETE FROM merchant_menu_item_review_requests WHERE id = ${requestId}`;
    });
  } catch (e: any) {
    const msg = e?.message ?? "approve_failed";
    if (msg === "unsupported_request_type") return { ok: false, error: msg };
    console.error("[approveReviewRequest]", e);
    return { ok: false, error: "approve_failed" };
  }

  // Persist unified attributes after commit for ADD (best-effort; item already APPROVED)
  if (r.request_type === "ADD" && menuItemId != null) {
    try {
      const payload = (r.add_payload ?? {}) as Record<string, unknown>;
      const storeType = (await resolveStoreType(storeIdNum)) ?? "FOOD";
      const legacyAttrs = buildFoodLegacyAttributesFromItemRow(payload as any);
      const attrsToPersist: UnifiedAttributes =
        (payload.attributes as UnifiedAttributes) ?? (storeType === "FOOD" ? legacyAttrs : {});
      await upsertItemAttributes(menuItemId, storeType, attrsToPersist);
    } catch (e) {
      console.error("[approveReviewRequest] attributes", e);
    }
  }

  return { ok: true, storeId: storeIdNum, menu_item_id: menuItemId };
}

export async function rejectReviewRequest(
  requestId: number,
  opts: {
    reviewed_by: string;
    reviewed_by_role?: string;
    rejection_reason?: string | null;
    client_ip?: string | null;
    device_info?: string | null;
  }
): Promise<{ ok: boolean; error?: string }> {
  const sql = getSql();
  const [req] = await sql`
    SELECT id, merchant_id, store_id, menu_item_id, request_type::text, status::text,
           submitted_by, submitted_by_role, submitted_at, source::text,
           client_ip, device_info, add_payload
    FROM merchant_menu_item_review_requests WHERE id = ${requestId}
  `;
  if (!req) return { ok: false, error: "request_not_found" };
  const r = req as any;
  if (r.status !== "PENDING") return { ok: false, error: "request_not_pending" };

  try {
    await sql.begin(async (trx) => {
      const changes = await trx`
        SELECT field_name, old_value, new_value, created_at
        FROM merchant_menu_item_review_changes
        WHERE review_request_id = ${requestId}
        ORDER BY id
      `;

      await trx`
        INSERT INTO merchant_menu_item_review_rejection_history (
          original_request_id, merchant_id, store_id, menu_item_id, request_type,
          submitted_by, submitted_by_role, submitted_at,
          reviewed_by, reviewed_by_role, reviewed_at, rejection_reason,
          source, client_ip, device_info, add_payload, changes_snapshot
        ) VALUES (
          ${requestId},
          ${r.merchant_id != null ? Number(r.merchant_id) : null},
          ${Number(r.store_id)},
          ${r.menu_item_id != null ? Number(r.menu_item_id) : null},
          ${r.request_type}::merchant_menu_item_review_request_type,
          ${r.submitted_by}, ${r.submitted_by_role}, ${r.submitted_at},
          ${opts.reviewed_by}, ${opts.reviewed_by_role ?? "agent"}, NOW(),
          ${opts.rejection_reason ?? null},
          ${(r.source ?? "OTHER")}::merchant_menu_item_review_source,
          ${r.client_ip ?? opts.client_ip ?? null},
          ${r.device_info ?? opts.device_info ?? null},
          ${r.add_payload != null ? toJsonb(r.add_payload) : null}::text::jsonb,
          ${toJsonb(changes)}::text::jsonb
        )
      `;

      await trx`
        INSERT INTO merchant_menu_item_review_action_log (
          review_request_id, action, actor, actor_role, source, client_ip, device_info, details
        ) VALUES (
          ${requestId}, 'REJECT'::merchant_menu_item_review_action,
          ${opts.reviewed_by}, ${opts.reviewed_by_role ?? "agent"},
          ${(r.source ?? "OTHER")}::merchant_menu_item_review_source,
          ${opts.client_ip ?? null}, ${opts.device_info ?? null},
          ${toJsonb({ rejection_reason: opts.rejection_reason ?? null })}::text::jsonb
        )
      `;

      await trx`DELETE FROM merchant_menu_item_review_changes WHERE review_request_id = ${requestId}`;
      await trx`DELETE FROM merchant_menu_item_review_requests WHERE id = ${requestId}`;
    });
  } catch (e) {
    console.error("[rejectReviewRequest]", e);
    return { ok: false, error: "reject_failed" };
  }

  return { ok: true };
}

/** Map legacy API filters CREATE/UPDATE → ADD/EDIT */
export function mapLegacyRequestType(
  t: string | null | undefined
): ReviewRequestType | null {
  if (!t) return null;
  if (t === "CREATE" || t === "ADD") return "ADD";
  if (t === "UPDATE" || t === "EDIT") return "EDIT";
  if (t === "DELETE") return "DELETE";
  return null;
}
