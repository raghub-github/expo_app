/**
 * Dashboard-side merchant menu review helpers (field-level ADD/EDIT/DELETE).
 * Mirrors backend/src/modules/merchant-menu/merchant-menu-review.service.ts
 * against the shared Postgres DB.
 */
import { getSql } from "@/lib/db/client";
import { bodyTextArrayOrNull } from "@/lib/db/sql-json-body";
import { ulid } from "ulid";

export const REVIEW_EDITABLE_SCALAR_FIELDS = new Set([
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
]);

const NESTED_JSON_FIELDS = new Set(["variants", "customizations", "images", "attributes"]);

function toJsonb(value: unknown): string {
  return JSON.stringify(value === undefined ? null : value);
}

function normalizeComparable(value: unknown): string {
  if (value === undefined || value === null) return "null";
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "boolean") return value ? "true" : "false";
  if (Array.isArray(value) || (typeof value === "object" && value !== null)) {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return String(value);
}

export function valuesEqual(a: unknown, b: unknown): boolean {
  return normalizeComparable(a) === normalizeComparable(b);
}

export function mapLegacyRequestType(t: string | null | undefined): "ADD" | "EDIT" | "DELETE" | null {
  if (!t) return null;
  if (t === "CREATE" || t === "ADD") return "ADD";
  if (t === "UPDATE" || t === "EDIT") return "EDIT";
  if (t === "DELETE") return "DELETE";
  return null;
}

export function toLegacyRequestType(t: string): string {
  if (t === "ADD") return "CREATE";
  if (t === "EDIT") return "UPDATE";
  return t;
}

export type FieldDiff = { field_name: string; old_value: unknown; new_value: unknown };

export function buildFieldDiffs(
  current: Record<string, unknown>,
  proposed: Record<string, unknown>
): FieldDiff[] {
  const diffs: FieldDiff[] = [];
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

async function applyNestedFromPayload(
  trx: ReturnType<typeof getSql>,
  menuItemId: number,
  storeIdNum: number,
  payload: Record<string, unknown>
): Promise<void> {
  const images = Array.isArray(payload.images) ? payload.images : null;
  if (images) {
    for (let i = 0; i < images.length; i++) {
      const img = images[i] as Record<string, unknown>;
      const url =
        typeof img.image_url === "string" ? img.image_url : typeof img.url === "string" ? img.url : null;
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
        .map((img: unknown) => {
          const o = img as Record<string, unknown>;
          return o?.image_url ?? o?.url;
        })
        .find((u) => typeof u === "string" && u) ?? null;
    if (typeof primaryUrl === "string") {
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

export async function approveMenuReviewRequest(
  requestId: number,
  reviewedBy: string
): Promise<{ ok: boolean; error?: string; menu_item_id?: number | null }> {
  const sql = getSql();
  const [req] = await sql`
    SELECT id, store_id, menu_item_id, request_type::text, status::text, add_payload, source::text
    FROM merchant_menu_item_review_requests WHERE id = ${requestId}
  `;
  if (!req) return { ok: false, error: "request_not_found" };
  const r = req as {
    id: number;
    store_id: number;
    menu_item_id: number | null;
    request_type: string;
    status: string;
    add_payload: Record<string, unknown> | null;
    source: string;
  };
  if (r.status !== "PENDING") return { ok: false, error: "request_not_pending" };

  const storeIdNum = Number(r.store_id);
  let menuItemId = r.menu_item_id != null ? Number(r.menu_item_id) : null;

  try {
    await sql.begin(async (trx) => {
      if (r.request_type === "EDIT" && menuItemId != null) {
        const changes = (await trx`
          SELECT field_name, old_value, new_value
          FROM merchant_menu_item_review_changes
          WHERE review_request_id = ${requestId}
          ORDER BY id
        `) as Array<{ field_name: string; old_value: unknown; new_value: unknown }>;

        for (const c of changes) {
          if (REVIEW_EDITABLE_SCALAR_FIELDS.has(c.field_name)) {
            await (trx as { unsafe: (q: string, v: unknown[]) => Promise<unknown> }).unsafe(
              `UPDATE merchant_menu_items SET ${c.field_name} = $1, updated_at = NOW() WHERE id = $2 AND store_id = $3`,
              [c.new_value, menuItemId, storeIdNum]
            );
          }
        }
        await trx`
          UPDATE merchant_menu_items
          SET approval_status = 'APPROVED'::merchant_menu_item_approval_status,
              approved_at = NOW(), approved_by = ${reviewedBy}, updated_at = NOW()
          WHERE id = ${menuItemId} AND store_id = ${storeIdNum}
        `;

        for (const c of changes) {
          if (c.field_name === "images" && Array.isArray(c.new_value)) {
            await trx`DELETE FROM merchant_menu_item_images WHERE menu_item_id = ${menuItemId}`;
            await applyNestedFromPayload(trx as any, menuItemId, storeIdNum, { images: c.new_value });
          } else if (c.field_name === "variants" && Array.isArray(c.new_value)) {
            await trx`DELETE FROM merchant_menu_item_variants WHERE menu_item_id = ${menuItemId}`;
            await applyNestedFromPayload(trx as any, menuItemId, storeIdNum, { variants: c.new_value });
          } else if (c.field_name === "customizations" && Array.isArray(c.new_value)) {
            const oldGroups = await trx`
              SELECT id FROM merchant_menu_item_customizations WHERE menu_item_id = ${menuItemId}
            `;
            for (const g of oldGroups as unknown as Array<{ id: number }>) {
              await trx`DELETE FROM merchant_menu_item_addons WHERE customization_id = ${Number(g.id)}`;
            }
            await trx`DELETE FROM merchant_menu_item_customizations WHERE menu_item_id = ${menuItemId}`;
            await applyNestedFromPayload(trx as any, menuItemId, storeIdNum, {
              customizations: c.new_value,
            });
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
            ${bodyTextArrayOrNull(payload.allergens)},
            ${bodyTextArrayOrNull(payload.item_tags)},
            'APPROVED'::merchant_menu_item_approval_status,
            NOW(),
            ${reviewedBy},
            ${payload.is_active !== false}
          )
          RETURNING id
        `;
        menuItemId = Number((created as { id: number }).id);
        await applyNestedFromPayload(trx as any, menuItemId, storeIdNum, payload);
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
          review_request_id, action, actor, actor_role, source, details
        ) VALUES (
          ${requestId}, 'APPROVE'::merchant_menu_item_review_action,
          ${reviewedBy}, 'agent',
          ${(r.source ?? "OTHER")}::merchant_menu_item_review_source,
          ${toJsonb({ menu_item_id: menuItemId, request_type: r.request_type })}::jsonb
        )
      `;

      await trx`DELETE FROM merchant_menu_item_review_changes WHERE review_request_id = ${requestId}`;
      await trx`DELETE FROM merchant_menu_item_review_requests WHERE id = ${requestId}`;
    });
  } catch (e) {
    console.error("[approveMenuReviewRequest]", e);
    return { ok: false, error: "approve_failed" };
  }

  return { ok: true, menu_item_id: menuItemId };
}

export async function rejectMenuReviewRequest(
  requestId: number,
  reviewedBy: string,
  rejectionReason: string | null
): Promise<{ ok: boolean; error?: string }> {
  const sql = getSql();
  const [req] = await sql`
    SELECT id, merchant_id, store_id, menu_item_id, request_type::text, status::text,
           submitted_by, submitted_by_role, submitted_at, source::text,
           client_ip, device_info, add_payload
    FROM merchant_menu_item_review_requests WHERE id = ${requestId}
  `;
  if (!req) return { ok: false, error: "request_not_found" };
  const r = req as Record<string, unknown>;
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
          ${String(r.request_type)}::merchant_menu_item_review_request_type,
          ${String(r.submitted_by)}, ${r.submitted_by_role != null ? String(r.submitted_by_role) : null},
          ${r.submitted_at as Date},
          ${reviewedBy}, 'agent', NOW(),
          ${rejectionReason},
          ${String(r.source ?? "OTHER")}::merchant_menu_item_review_source,
          ${r.client_ip != null ? String(r.client_ip) : null},
          ${r.device_info != null ? String(r.device_info) : null},
          ${r.add_payload != null ? toJsonb(r.add_payload) : null}::jsonb,
          ${toJsonb(changes)}::jsonb
        )
      `;

      await trx`
        INSERT INTO merchant_menu_item_review_action_log (
          review_request_id, action, actor, actor_role, source, details
        ) VALUES (
          ${requestId}, 'REJECT'::merchant_menu_item_review_action,
          ${reviewedBy}, 'agent',
          ${String(r.source ?? "OTHER")}::merchant_menu_item_review_source,
          ${toJsonb({ rejection_reason: rejectionReason })}::jsonb
        )
      `;

      await trx`DELETE FROM merchant_menu_item_review_changes WHERE review_request_id = ${requestId}`;
      await trx`DELETE FROM merchant_menu_item_review_requests WHERE id = ${requestId}`;
    });
  } catch (e) {
    console.error("[rejectMenuReviewRequest]", e);
    return { ok: false, error: "reject_failed" };
  }

  return { ok: true };
}

export async function submitAddReviewFromPartner(
  storeIdNum: number,
  merchantId: number | null,
  addPayload: Record<string, unknown>,
  submittedBy: string
): Promise<{ review_request_id: number }> {
  const sql = getSql();
  const [inserted] = await sql`
    INSERT INTO merchant_menu_item_review_requests (
      merchant_id, store_id, menu_item_id, request_type, status,
      submitted_by, submitted_by_role, source, add_payload, updated_at
    ) VALUES (
      ${merchantId}, ${storeIdNum}, NULL,
      'ADD'::merchant_menu_item_review_request_type,
      'PENDING'::merchant_menu_item_review_request_status,
      ${submittedBy}, 'merchant',
      'PARTNER_SITE'::merchant_menu_item_review_source,
      ${toJsonb(addPayload)}::jsonb, NOW()
    )
    RETURNING id
  `;
  const id = Number((inserted as { id: number }).id);
  await sql`
    INSERT INTO merchant_menu_item_review_action_log (
      review_request_id, action, actor, actor_role, source, details
    ) VALUES (
      ${id}, 'SUBMIT'::merchant_menu_item_review_action,
      ${submittedBy}, 'merchant', 'PARTNER_SITE'::merchant_menu_item_review_source,
      ${toJsonb({ request_type: "ADD" })}::jsonb
    )
  `;
  return { review_request_id: id };
}

export async function submitEditReviewFromPartner(
  storeIdNum: number,
  merchantId: number | null,
  menuItemId: number,
  current: Record<string, unknown>,
  proposed: Record<string, unknown>,
  submittedBy: string
): Promise<{ review_request_id: number; merged?: boolean } | { error: string }> {
  const diffs = buildFieldDiffs(current, proposed);
  if (diffs.length === 0) return { error: "no_changes" };

  const sql = getSql();
  const [pending] = await sql`
    SELECT id FROM merchant_menu_item_review_requests
    WHERE menu_item_id = ${menuItemId} AND store_id = ${storeIdNum}
      AND status = 'PENDING'::merchant_menu_item_review_request_status
      AND request_type = 'EDIT'::merchant_menu_item_review_request_type
    LIMIT 1
  `;

  if (pending) {
    const reviewRequestId = Number((pending as { id: number }).id);
    await sql.begin(async (trx) => {
      const existing = await trx`
        SELECT id, field_name, old_value
        FROM merchant_menu_item_review_changes
        WHERE review_request_id = ${reviewRequestId}
      `;
      const byField = new Map<string, { id: number; old_value: unknown }>();
      for (const c of existing as unknown as Array<{
        id: number;
        field_name: string;
        old_value: unknown;
      }>) {
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
              SET new_value = ${toJsonb(d.new_value)}::jsonb
              WHERE id = ${ex.id}
            `;
          }
        } else {
          await trx`
            INSERT INTO merchant_menu_item_review_changes (
              review_request_id, field_name, old_value, new_value
            ) VALUES (
              ${reviewRequestId}, ${d.field_name},
              ${toJsonb(d.old_value)}::jsonb,
              ${toJsonb(d.new_value)}::jsonb
            )
          `;
        }
      }
      await trx`
        UPDATE merchant_menu_item_review_requests
        SET submitted_by = ${submittedBy}, updated_at = NOW()
        WHERE id = ${reviewRequestId}
      `;
      await trx`
        INSERT INTO merchant_menu_item_review_action_log (
          review_request_id, action, actor, actor_role, source, details
        ) VALUES (
          ${reviewRequestId}, 'SUBMIT'::merchant_menu_item_review_action,
          ${submittedBy}, 'merchant', 'PARTNER_SITE'::merchant_menu_item_review_source,
          ${toJsonb({ request_type: "EDIT", merged: true, fields: diffs.map((x) => x.field_name) })}::jsonb
        )
      `;
    });
    return { review_request_id: reviewRequestId, merged: true };
  }

  const reviewRequestId = await sql.begin(async (trx) => {
    const [inserted] = await trx`
      INSERT INTO merchant_menu_item_review_requests (
        merchant_id, store_id, menu_item_id, request_type, status,
        submitted_by, submitted_by_role, source, updated_at
      ) VALUES (
        ${merchantId}, ${storeIdNum}, ${menuItemId},
        'EDIT'::merchant_menu_item_review_request_type,
        'PENDING'::merchant_menu_item_review_request_status,
        ${submittedBy}, 'merchant',
        'PARTNER_SITE'::merchant_menu_item_review_source, NOW()
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
          ${toJsonb(d.old_value)}::jsonb,
          ${toJsonb(d.new_value)}::jsonb
        )
      `;
    }
    await trx`
      INSERT INTO merchant_menu_item_review_action_log (
        review_request_id, action, actor, actor_role, source, details
      ) VALUES (
        ${id}, 'SUBMIT'::merchant_menu_item_review_action,
        ${submittedBy}, 'merchant', 'PARTNER_SITE'::merchant_menu_item_review_source,
        ${toJsonb({ request_type: "EDIT", fields: diffs.map((x) => x.field_name) })}::jsonb
      )
    `;
    return id;
  });

  return { review_request_id: reviewRequestId };
}
