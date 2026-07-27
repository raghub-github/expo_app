/**
 * Partnersite helpers for field-level menu review requests (Supabase service role).
 */
import type { SupabaseClient } from '@supabase/supabase-js'

const EDITABLE = new Set([
  'item_name',
  'item_description',
  'item_image_url',
  'category_id',
  'food_type',
  'spice_level',
  'cuisine_type',
  'base_price',
  'selling_price',
  'discount_percentage',
  'tax_percentage',
  'preparation_time_minutes',
  'packaging_charges',
  'serves',
  'serves_label',
  'short_name',
  'display_order',
  'is_active',
  'allergens',
  'item_size_value',
  'item_size_unit',
  'available_for_delivery',
  'weight_per_serving',
  'weight_per_serving_unit',
  'calories_kcal',
  'protein',
  'protein_unit',
  'carbohydrates',
  'carbohydrates_unit',
  'fat',
  'fat_unit',
  'fibre',
  'fibre_unit',
  'item_tags',
  'variants',
  'customizations',
  'images',
  'has_customizations',
  'has_addons',
  'has_variants',
])

const NUMERIC_FIELDS = new Set([
  'base_price',
  'selling_price',
  'discount_percentage',
  'tax_percentage',
  'preparation_time_minutes',
  'packaging_charges',
  'serves',
  'display_order',
  'category_id',
  'item_size_value',
  'weight_per_serving',
  'calories_kcal',
  'protein',
  'carbohydrates',
  'fat',
  'fibre',
])

/** Stable shape for nested options so form vs DB compares cleanly. */
function canonicalizeCustomizations(val: unknown): unknown {
  if (!Array.isArray(val)) return val ?? null
  return val.map((c: any) => ({
    customization_title: String(c?.customization_title ?? c?.title ?? ''),
    customization_type: c?.customization_type ?? null,
    is_required: Boolean(c?.is_required),
    min_selection: Number(c?.min_selection ?? 0),
    max_selection: c?.max_selection != null ? Number(c.max_selection) : null,
    display_order: Number(c?.display_order ?? 0),
    addons: Array.isArray(c?.addons)
      ? c.addons.map((a: any, j: number) => ({
          addon_name: String(a?.addon_name ?? a?.name ?? ''),
          addon_price: Number(a?.addon_price ?? a?.price ?? 0),
          in_stock: a?.in_stock !== false,
          display_order: Number(a?.display_order ?? j),
        }))
      : [],
  }))
}

function canonicalizeVariants(val: unknown): unknown {
  if (!Array.isArray(val)) return val ?? null
  return val.map((v: any, i: number) => ({
    variant_name: String(v?.variant_name ?? v?.name ?? ''),
    variant_type: v?.variant_type ?? null,
    variant_price: Number(v?.variant_price ?? v?.price ?? 0),
    display_order: Number(v?.display_order ?? i),
  }))
}

function normField(field: string, v: unknown): string {
  if (v === undefined || v === null) return 'null'
  if (NUMERIC_FIELDS.has(field)) {
    const n = Number(v)
    return Number.isFinite(n) ? String(n) : 'null'
  }
  if (field === 'customizations') return JSON.stringify(canonicalizeCustomizations(v))
  if (field === 'variants') return JSON.stringify(canonicalizeVariants(v))
  if (field === 'has_customizations' || field === 'has_addons' || field === 'has_variants' || field === 'is_active' || field === 'available_for_delivery') {
    return v ? 'true' : 'false'
  }
  if (typeof v === 'boolean') return v ? 'true' : 'false'
  if (typeof v === 'object') {
    try {
      return JSON.stringify(v)
    } catch {
      return String(v)
    }
  }
  return String(v)
}

export function buildPartnerFieldDiffs(
  current: Record<string, unknown>,
  proposed: Record<string, unknown>
): Array<{ field_name: string; old_value: unknown; new_value: unknown }> {
  const diffs: Array<{ field_name: string; old_value: unknown; new_value: unknown }> = []
  for (const [field, newVal] of Object.entries(proposed)) {
    if (!EDITABLE.has(field)) continue
    const oldVal = current[field] ?? null
    if (normField(field, oldVal) === normField(field, newVal)) continue
    // Store canonical nested shapes in the review row for cleaner admin UI / approve apply.
    const storedNew =
      field === 'customizations'
        ? canonicalizeCustomizations(newVal)
        : field === 'variants'
          ? canonicalizeVariants(newVal)
          : NUMERIC_FIELDS.has(field) && newVal != null && newVal !== ''
            ? Number(newVal)
            : newVal
    const storedOld =
      field === 'customizations'
        ? canonicalizeCustomizations(oldVal)
        : field === 'variants'
          ? canonicalizeVariants(oldVal)
          : NUMERIC_FIELDS.has(field) && oldVal != null && oldVal !== ''
            ? Number(oldVal)
            : oldVal
    diffs.push({ field_name: field, old_value: storedOld, new_value: storedNew })
  }
  return diffs
}

export async function submitPartnerAddReview(
  supabase: SupabaseClient,
  opts: {
    storeIdNum: number
    merchantId: number
    submittedBy: string
    addPayload: Record<string, unknown>
  }
): Promise<{ review_request_id: number }> {
  const { data, error } = await supabase
    .from('merchant_menu_item_review_requests')
    .insert([
      {
        merchant_id: opts.merchantId,
        store_id: opts.storeIdNum,
        menu_item_id: null,
        request_type: 'ADD',
        status: 'PENDING',
        submitted_by: opts.submittedBy,
        submitted_by_role: 'merchant',
        source: 'PARTNER_SITE',
        add_payload: opts.addPayload,
      },
    ])
    .select('id')
    .single()

  if (error || !data?.id) {
    throw new Error(error?.message || 'Failed to create ADD review request')
  }

  const reviewRequestId = Number(data.id)
  await supabase.from('merchant_menu_item_review_action_log').insert([
    {
      review_request_id: reviewRequestId,
      action: 'SUBMIT',
      actor: opts.submittedBy,
      actor_role: 'merchant',
      source: 'PARTNER_SITE',
      details: { request_type: 'ADD' },
    },
  ])

  return { review_request_id: reviewRequestId }
}

/**
 * Create or merge into a pending EDIT review.
 * Subsequent saves update new_value while preserving the original live old_value.
 * If nothing differs from live but a pending EDIT already exists, returns that request (soft success).
 */
export async function submitPartnerEditReview(
  supabase: SupabaseClient,
  opts: {
    storeIdNum: number
    merchantId: number
    menuItemId: number
    submittedBy: string
    current: Record<string, unknown>
    proposed: Record<string, unknown>
  }
): Promise<
  | { review_request_id: number; merged?: boolean; unchanged?: boolean }
  | { error: string }
> {
  const diffs = buildPartnerFieldDiffs(opts.current, opts.proposed)

  const { data: pending } = await supabase
    .from('merchant_menu_item_review_requests')
    .select('id')
    .eq('menu_item_id', opts.menuItemId)
    .eq('store_id', opts.storeIdNum)
    .eq('status', 'PENDING')
    .eq('request_type', 'EDIT')
    .limit(1)
    .maybeSingle()

  // Soft success: already under review / nothing new vs live
  if (diffs.length === 0) {
    if (pending?.id) {
      return { review_request_id: Number(pending.id), unchanged: true }
    }
    return { error: 'no_changes' }
  }

  if (pending?.id) {
    const reviewRequestId = Number(pending.id)
    const { data: existingChanges } = await supabase
      .from('merchant_menu_item_review_changes')
      .select('id, field_name, old_value, new_value')
      .eq('review_request_id', reviewRequestId)

    const byField = new Map<string, { id: number; old_value: unknown; new_value: unknown }>()
    for (const c of existingChanges ?? []) {
      byField.set(String(c.field_name), {
        id: Number(c.id),
        old_value: c.old_value,
        new_value: c.new_value,
      })
    }

    for (const d of diffs) {
      const existing = byField.get(d.field_name)
      if (existing) {
        // Keep original live old_value; update proposed new_value.
        if (normField(d.field_name, existing.old_value) === normField(d.field_name, d.new_value)) {
          await supabase.from('merchant_menu_item_review_changes').delete().eq('id', existing.id)
          byField.delete(d.field_name)
        } else {
          await supabase
            .from('merchant_menu_item_review_changes')
            .update({ new_value: d.new_value })
            .eq('id', existing.id)
          byField.set(d.field_name, { ...existing, new_value: d.new_value })
        }
      } else {
        const { data: inserted } = await supabase
          .from('merchant_menu_item_review_changes')
          .insert([
            {
              review_request_id: reviewRequestId,
              field_name: d.field_name,
              old_value: d.old_value,
              new_value: d.new_value,
            },
          ])
          .select('id')
          .single()
        if (inserted?.id) {
          byField.set(d.field_name, {
            id: Number(inserted.id),
            old_value: d.old_value,
            new_value: d.new_value,
          })
        }
      }
    }

    await supabase
      .from('merchant_menu_item_review_requests')
      .update({
        submitted_by: opts.submittedBy,
        submitted_by_role: 'merchant',
        updated_at: new Date().toISOString(),
      })
      .eq('id', reviewRequestId)

    await supabase.from('merchant_menu_item_review_action_log').insert([
      {
        review_request_id: reviewRequestId,
        action: 'SUBMIT',
        actor: opts.submittedBy,
        actor_role: 'merchant',
        source: 'PARTNER_SITE',
        details: {
          request_type: 'EDIT',
          merged: true,
          fields: diffs.map((d) => d.field_name),
        },
      },
    ])

    return { review_request_id: reviewRequestId, merged: true }
  }

  const { data, error } = await supabase
    .from('merchant_menu_item_review_requests')
    .insert([
      {
        merchant_id: opts.merchantId,
        store_id: opts.storeIdNum,
        menu_item_id: opts.menuItemId,
        request_type: 'EDIT',
        status: 'PENDING',
        submitted_by: opts.submittedBy,
        submitted_by_role: 'merchant',
        source: 'PARTNER_SITE',
      },
    ])
    .select('id')
    .single()

  if (error || !data?.id) {
    throw new Error(error?.message || 'Failed to create EDIT review request')
  }

  const reviewRequestId = Number(data.id)
  const changeRows = diffs.map((d) => ({
    review_request_id: reviewRequestId,
    field_name: d.field_name,
    old_value: d.old_value,
    new_value: d.new_value,
  }))
  const { error: chErr } = await supabase.from('merchant_menu_item_review_changes').insert(changeRows)
  if (chErr) {
    await supabase.from('merchant_menu_item_review_requests').delete().eq('id', reviewRequestId)
    throw new Error(chErr.message || 'Failed to insert review changes')
  }

  await supabase.from('merchant_menu_item_review_action_log').insert([
    {
      review_request_id: reviewRequestId,
      action: 'SUBMIT',
      actor: opts.submittedBy,
      actor_role: 'merchant',
      source: 'PARTNER_SITE',
      details: { request_type: 'EDIT', fields: diffs.map((d) => d.field_name) },
    },
  ])

  return { review_request_id: reviewRequestId }
}
