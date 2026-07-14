/**
 * PATCH /api/merchant/offers/[offerId] - Update offer (audit + updated_by_name)
 * DELETE /api/merchant/offers/[offerId] - Delete offer (audit)
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { validateMerchantFromSession } from '@/lib/auth/validate-merchant';
import { getAuditActor, logMerchantAudit } from '@/lib/audit-merchant';
import { logStoreActivity } from '@/lib/store-activity-feed';
import { deleteFromR2, extractR2KeyFromUrl } from '@/lib/r2';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder.supabase.co";
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "placeholder-service-role-key";

function getDb() {
  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

type OfferRow = {
  id: number;
  store_id: number;
  offer_title: string;
  offer_type?: string;
  offer_image_url?: string | null;
  valid_from?: string | null;
  valid_till?: string | null;
  offer_metadata?: Record<string, unknown> | null;
  offer_sub_type?: string | null;
};

type StoreRow = { parent_id: number | null };

async function getOfferAndValidate(
  db: ReturnType<typeof getDb>,
  offerId: string,
  merchantParentId: number
): Promise<{ offer: OfferRow; storeParentId: number } | null> {
  const { data, error: offerErr } = await db
    .from('merchant_offers')
    .select(
      'id, store_id, offer_title, offer_type, offer_image_url, valid_from, valid_till, offer_metadata, offer_sub_type'
    )
    .eq('offer_id', offerId)
    .single();
  if (offerErr || !data) return null;
  const offer = data as OfferRow;
  const { data: storeData } = await db
    .from('merchant_stores')
    .select('parent_id')
    .eq('id', offer.store_id)
    .single();
  if (!storeData) return null;
  const store = storeData as StoreRow;
  if (store.parent_id === null || store.parent_id !== merchantParentId) return null;
  return { offer, storeParentId: store.parent_id };
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ offerId: string }> }
) {
  try {
    const { offerId } = await params;
    if (!offerId) return NextResponse.json({ error: 'offerId required' }, { status: 400 });

    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const validation = await validateMerchantFromSession({
      id: user.id,
      email: user.email ?? null,
      phone: user.phone ?? null,
    });
    if (!validation.isValid || validation.merchantParentId == null) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const db = getDb();
    const resolved = await getOfferAndValidate(db, offerId, validation.merchantParentId);
    if (!resolved) {
      return NextResponse.json({ error: 'Offer not found or not accessible' }, { status: 404 });
    }

    const body = await req.json();
    const actor = await getAuditActor();

    // Direct deactivate — soft off, never hard delete
    if (body.action === 'deactivate') {
      const nowIso = new Date().toISOString();
      const deactivatePayload: Record<string, unknown> = {
        is_active: false,
        lifecycle_status: 'DISABLED',
        disabled_at: nowIso,
        disabled_reason: typeof body.reason === 'string' ? body.reason : 'Deactivated by merchant',
        updated_by_name: actor.performed_by_name,
        updated_by_at: nowIso,
        updated_source_platform: 'MERCHANT_PORTAL',
        updated_by_role: 'MERCHANT',
        updated_by_user_id: actor.performed_by_id ?? null,
      };

      const { data, error } = await db
        .from('merchant_offers')
        .update(deactivatePayload)
        .eq('offer_id', offerId)
        .select()
        .single();

      if (error) {
        // Fallback if lifecycle_status column not migrated yet
        if (error.message?.includes('lifecycle_status') || error.code === '42703') {
          const { data: fallback, error: fbErr } = await db
            .from('merchant_offers')
            .update({
              is_active: false,
              updated_by_name: actor.performed_by_name,
              updated_by_at: nowIso,
              updated_source_platform: 'MERCHANT_PORTAL',
            })
            .eq('offer_id', offerId)
            .select()
            .single();
          if (fbErr) {
            console.error('[merchant/offers] deactivate fallback failed:', fbErr);
            return NextResponse.json({ error: fbErr.message || 'Deactivate failed' }, { status: 500 });
          }
          const meta = (fallback.offer_metadata as Record<string, unknown>) || {};
          await logMerchantAudit(db, {
            entity_type: 'OFFER',
            entity_id: resolved.offer.id,
            action: 'DEACTIVATE',
            action_field: null,
            old_value: { offer_id: offerId, is_active: true },
            new_value: { offer_id: offerId, is_active: false },
            performed_by: actor.performed_by,
            performed_by_id: actor.performed_by_id,
            performed_by_name: actor.performed_by_name,
            performed_by_email: actor.performed_by_email,
            audit_metadata: { description: `Offer deactivated: ${resolved.offer.offer_title}` },
          });
          void fetch(
            `${process.env.GATIMITRA_BACKEND_API_URL?.replace(/\/$/, '') || 'http://127.0.0.1:3000'}/v1/internal/offers/invalidate`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'X-Internal-Secret': process.env.BACKEND_SCHEDULE_TICK_SECRET || '',
              },
              body: JSON.stringify({
                storeId: resolved.offer.store_id,
                offerId: resolved.offer.id,
                event: 'offer_disabled',
              }),
            }
          ).catch(() => {});
          return NextResponse.json({ ...fallback, menu_item_ids: (meta.menu_item_ids as string[]) ?? null });
        }
        console.error('[merchant/offers] deactivate failed:', error);
        return NextResponse.json({ error: error.message || 'Deactivate failed' }, { status: 500 });
      }

      const meta = (data.offer_metadata as Record<string, unknown>) || {};
      const response = { ...data, menu_item_ids: (meta.menu_item_ids as string[]) ?? null };

      await logMerchantAudit(db, {
        entity_type: 'OFFER',
        entity_id: resolved.offer.id,
        action: 'DEACTIVATE',
        action_field: null,
        old_value: { offer_id: offerId, is_active: true },
        new_value: { offer_id: offerId, is_active: false, lifecycle_status: 'DISABLED' },
        performed_by: actor.performed_by,
        performed_by_id: actor.performed_by_id,
        performed_by_name: actor.performed_by_name,
        performed_by_email: actor.performed_by_email,
        audit_metadata: { description: `Offer deactivated: ${data.offer_title}` },
      });

      await logStoreActivity({
        storeId: resolved.offer.store_id,
        section: 'offer',
        action: 'deactivate',
        entityId: resolved.offer.id,
        entityName: data.offer_title,
        summary: `Merchant deactivated offer "${data.offer_title}"`,
        actorName: actor.performed_by_name,
        actorEmail: actor.performed_by_email,
      });

      void fetch(
        `${process.env.GATIMITRA_BACKEND_API_URL?.replace(/\/$/, '') || 'http://127.0.0.1:3000'}/v1/internal/offers/invalidate`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Internal-Secret': process.env.BACKEND_SCHEDULE_TICK_SECRET || '',
          },
          body: JSON.stringify({
            storeId: resolved.offer.store_id,
            offerId: resolved.offer.id,
            event: 'offer_disabled',
          }),
        }
      ).catch(() => {});

      return NextResponse.json(response);
    }

    // Reactivate a deactivated offer (only if campaign window has not ended)
    if (body.action === 'activate') {
      const now = new Date();
      const nowIso = now.toISOString();
      const validTillRaw = resolved.offer.valid_till
        ? new Date(resolved.offer.valid_till as string)
        : null;
      if (validTillRaw && !Number.isNaN(validTillRaw.getTime())) {
        const endOfTill = new Date(
          validTillRaw.getFullYear(),
          validTillRaw.getMonth(),
          validTillRaw.getDate(),
          23,
          59,
          59,
          999
        );
        if (now.getTime() > endOfTill.getTime()) {
          return NextResponse.json(
            { error: 'Cannot activate an expired offer. Create a new offer instead.' },
            { status: 400 }
          );
        }
      }

      const validFromRaw = resolved.offer.valid_from
        ? new Date(resolved.offer.valid_from as string)
        : null;
      const startsInFuture =
        validFromRaw &&
        !Number.isNaN(validFromRaw.getTime()) &&
        now.getTime() <
          new Date(
            validFromRaw.getFullYear(),
            validFromRaw.getMonth(),
            validFromRaw.getDate(),
            0,
            0,
            0,
            0
          ).getTime();

      const activatePayload: Record<string, unknown> = {
        is_active: true,
        lifecycle_status: startsInFuture ? 'SCHEDULED' : 'ACTIVE',
        disabled_at: null,
        disabled_reason: null,
        published_at: nowIso,
        updated_by_name: actor.performed_by_name,
        updated_by_at: nowIso,
        updated_source_platform: 'MERCHANT_PORTAL',
        updated_by_role: 'MERCHANT',
        updated_by_user_id: actor.performed_by_id ?? null,
      };

      const { data, error } = await db
        .from('merchant_offers')
        .update(activatePayload)
        .eq('offer_id', offerId)
        .select()
        .single();

      if (error) {
        if (error.message?.includes('lifecycle_status') || error.code === '42703') {
          const { data: fallback, error: fbErr } = await db
            .from('merchant_offers')
            .update({
              is_active: true,
              updated_by_name: actor.performed_by_name,
              updated_by_at: nowIso,
              updated_source_platform: 'MERCHANT_PORTAL',
            })
            .eq('offer_id', offerId)
            .select()
            .single();
          if (fbErr) {
            console.error('[merchant/offers] activate fallback failed:', fbErr);
            return NextResponse.json({ error: fbErr.message || 'Activate failed' }, { status: 500 });
          }
          const meta = (fallback.offer_metadata as Record<string, unknown>) || {};
          await logMerchantAudit(db, {
            entity_type: 'OFFER',
            entity_id: resolved.offer.id,
            action: 'ACTIVATE',
            action_field: null,
            old_value: { offer_id: offerId, is_active: false },
            new_value: { offer_id: offerId, is_active: true },
            performed_by: actor.performed_by,
            performed_by_id: actor.performed_by_id,
            performed_by_name: actor.performed_by_name,
            performed_by_email: actor.performed_by_email,
            audit_metadata: { description: `Offer activated: ${resolved.offer.offer_title}` },
          });
          void fetch(
            `${process.env.GATIMITRA_BACKEND_API_URL?.replace(/\/$/, '') || 'http://127.0.0.1:3000'}/v1/internal/offers/invalidate`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'X-Internal-Secret': process.env.BACKEND_SCHEDULE_TICK_SECRET || '',
              },
              body: JSON.stringify({
                storeId: resolved.offer.store_id,
                offerId: resolved.offer.id,
                event: 'offer_updated',
              }),
            }
          ).catch(() => {});
          return NextResponse.json({ ...fallback, menu_item_ids: (meta.menu_item_ids as string[]) ?? null });
        }
        console.error('[merchant/offers] activate failed:', error);
        return NextResponse.json({ error: error.message || 'Activate failed' }, { status: 500 });
      }

      const meta = (data.offer_metadata as Record<string, unknown>) || {};
      const response = { ...data, menu_item_ids: (meta.menu_item_ids as string[]) ?? null };

      await logMerchantAudit(db, {
        entity_type: 'OFFER',
        entity_id: resolved.offer.id,
        action: 'ACTIVATE',
        action_field: null,
        old_value: { offer_id: offerId, is_active: false },
        new_value: {
          offer_id: offerId,
          is_active: true,
          lifecycle_status: activatePayload.lifecycle_status,
        },
        performed_by: actor.performed_by,
        performed_by_id: actor.performed_by_id,
        performed_by_name: actor.performed_by_name,
        performed_by_email: actor.performed_by_email,
        audit_metadata: { description: `Offer activated: ${data.offer_title}` },
      });

      await logStoreActivity({
        storeId: resolved.offer.store_id,
        section: 'offer',
        action: 'activate',
        entityId: resolved.offer.id,
        entityName: data.offer_title,
        summary: `Merchant activated offer "${data.offer_title}"`,
        actorName: actor.performed_by_name,
        actorEmail: actor.performed_by_email,
      });

      void fetch(
        `${process.env.GATIMITRA_BACKEND_API_URL?.replace(/\/$/, '') || 'http://127.0.0.1:3000'}/v1/internal/offers/invalidate`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Internal-Secret': process.env.BACKEND_SCHEDULE_TICK_SECRET || '',
          },
          body: JSON.stringify({
            storeId: resolved.offer.store_id,
            offerId: resolved.offer.id,
            event: 'offer_updated',
          }),
        }
      ).catch(() => {});

      return NextResponse.json(response);
    }

    const updatePayload: Record<string, unknown> = { ...body };
    delete updatePayload.action;
    delete updatePayload.publish_mode;
    delete updatePayload.applicability_type;
    delete updatePayload.category_ids;
    delete updatePayload.storeId;
    delete updatePayload.image_url;
    updatePayload.updated_by_name = actor.performed_by_name;
    updatePayload.updated_by_at = new Date().toISOString();
    updatePayload.updated_source_platform = 'MERCHANT_PORTAL';
    updatePayload.updated_by_role = 'MERCHANT';
    updatePayload.updated_by_user_id = actor.performed_by_id ?? null;
    delete (updatePayload as any).id;
    delete (updatePayload as any).offer_id;
    delete (updatePayload as any).store_id;
    delete (updatePayload as any).created_at;
    delete (updatePayload as any).created_by_name;
    delete (updatePayload as any).created_source_platform;
    delete (updatePayload as any).created_by_role;
    delete (updatePayload as any).created_by_user_id;
    delete (updatePayload as any).created_by_org_id;
    delete (updatePayload as any).approval_status;

    // Publish / draft lifecycle from sidesheet
    const publishMode = String(body.publish_mode ?? '').toLowerCase();
    if (publishMode === 'draft') {
      updatePayload.lifecycle_status = 'DRAFT';
      updatePayload.is_active = false;
      updatePayload.published_at = null;
    } else if (publishMode === 'publish') {
      const now = new Date();
      const validFrom = body.valid_from ? new Date(body.valid_from) : now;
      const validTill = body.valid_till ? new Date(body.valid_till) : now;
      if (validTill < now) {
        updatePayload.lifecycle_status = 'EXPIRED';
        updatePayload.is_active = false;
      } else if (validFrom > now) {
        updatePayload.lifecycle_status = 'SCHEDULED';
        updatePayload.is_active = true;
      } else {
        updatePayload.lifecycle_status = 'ACTIVE';
        updatePayload.is_active = true;
      }
      if (!updatePayload.published_at) {
        updatePayload.published_at = now.toISOString();
      }
    }

    // Coerce numeric fields that may arrive as strings from the sidesheet
    for (const key of [
      'discount_value',
      'discount_percentage',
      'max_discount_amount',
      'min_order_amount',
      'max_order_amount',
      'max_discount_per_order',
      'priority',
      'buy_quantity',
      'get_quantity',
      'max_uses_total',
      'max_uses_per_user',
      'per_order_limit',
    ] as const) {
      if (updatePayload[key] === '' || updatePayload[key] === undefined) continue;
      if (updatePayload[key] === null) continue;
      const n = Number(updatePayload[key]);
      if (Number.isFinite(n)) updatePayload[key] = n;
    }

    // If clearing offer image, delete from R2
    if ((updatePayload.offer_image_url === null || updatePayload.offer_image_url === '') && resolved.offer.offer_image_url) {
      const key = extractR2KeyFromUrl(resolved.offer.offer_image_url);
      if (key) {
        try {
          await deleteFromR2(key);
        } catch (e) {
          console.warn('[merchant/offers] PATCH delete R2 image failed', key, e);
        }
      }
    }

    // merchant_offers has no menu_item_ids column; store in offer_metadata.
    // Merge onto existing DB metadata so conditions_mode updates don't wipe menu_item_ids / extras.
    const menuItemIds = (updatePayload as any).menu_item_ids;
    delete (updatePayload as any).menu_item_ids;
    const bodyMeta =
      typeof updatePayload.offer_metadata === 'object' && updatePayload.offer_metadata != null
        ? { ...(updatePayload.offer_metadata as Record<string, unknown>) }
        : null;
    const dbMeta =
      resolved.offer.offer_metadata && typeof resolved.offer.offer_metadata === 'object'
        ? { ...(resolved.offer.offer_metadata as Record<string, unknown>) }
        : {};
    const mergedMeta: Record<string, unknown> = { ...dbMeta, ...(bodyMeta ?? {}) };

    const offerTypeUpper = String(
      updatePayload.offer_type ?? resolved.offer.offer_type ?? ''
    ).toUpperCase();
    const isBogoType =
      offerTypeUpper === 'BOGO' ||
      offerTypeUpper === 'BUY_X_GET_Y' ||
      offerTypeUpper === 'BUY_N_GET_M';

    // BOGO is labeled from offer_type — never stamp conditions_mode as boost.
    if (isBogoType) {
      delete mergedMeta.conditions_mode;
    }

    const modeRaw = String(mergedMeta.conditions_mode ?? '').toLowerCase().trim();
    if (!isBogoType && (modeRaw === 'boost' || modeRaw === 'precision')) {
      mergedMeta.conditions_mode = modeRaw;
    }

    const subType = String(
      updatePayload.offer_sub_type ?? resolved.offer.offer_sub_type ?? ''
    ).toUpperCase();

    if (modeRaw === 'precision' && !isBogoType) {
      mergedMeta.menu_item_ids = [];
      updatePayload.offer_sub_type = 'ALL_ORDERS';
    } else if (Array.isArray(menuItemIds)) {
      mergedMeta.menu_item_ids = menuItemIds;
    } else if (menuItemIds === null) {
      // null means "all items" only when sub-type is ALL; never wipe specific mappings by accident.
      if (subType === 'ALL_ORDERS' || subType === 'ALL' || subType === '') {
        if (bodyMeta && 'menu_item_ids' in bodyMeta) {
          mergedMeta.menu_item_ids = Array.isArray(bodyMeta.menu_item_ids)
            ? bodyMeta.menu_item_ids
            : [];
        } else {
          mergedMeta.menu_item_ids = [];
        }
      } else if (Array.isArray(dbMeta.menu_item_ids) && (dbMeta.menu_item_ids as unknown[]).length > 0) {
        mergedMeta.menu_item_ids = dbMeta.menu_item_ids;
      }
    } else if (
      bodyMeta &&
      'menu_item_ids' in bodyMeta &&
      Array.isArray(bodyMeta.menu_item_ids)
    ) {
      mergedMeta.menu_item_ids = bodyMeta.menu_item_ids;
    }

    // If body metadata omitted menu_item_ids but DB had them, keep them (unless precision cleared).
    if (
      modeRaw !== 'precision' &&
      !isBogoType &&
      !('menu_item_ids' in (bodyMeta ?? {})) &&
      menuItemIds === undefined &&
      Array.isArray(dbMeta.menu_item_ids)
    ) {
      mergedMeta.menu_item_ids = dbMeta.menu_item_ids;
    }

    if (bodyMeta != null || menuItemIds !== undefined || modeRaw === 'precision' || isBogoType) {
      updatePayload.offer_metadata = mergedMeta;
    }

    const { data, error } = await db
      .from('merchant_offers')
      .update(updatePayload)
      .eq('offer_id', offerId)
      .select()
      .single();

    if (error) {
      console.error('[merchant/offers] PATCH failed:', error);
      return NextResponse.json({ error: error.message || 'Update failed' }, { status: 500 });
    }

    // Keep applicability table in sync with metadata (best-effort).
    try {
      await db.rpc('sync_offer_applicability_from_metadata', { p_offer_id: data.id });
    } catch (syncErr) {
      console.warn('[merchant/offers] PATCH sync applicability failed', syncErr);
    }

    // Shape response so frontend gets menu_item_ids from offer_metadata
    const meta = (data.offer_metadata as Record<string, unknown>) || {};
    const response = { ...data, menu_item_ids: (meta.menu_item_ids as string[]) ?? null };

    await logMerchantAudit(db, {
      entity_type: 'OFFER',
      entity_id: resolved.offer.id,
      action: 'UPDATE',
      action_field: null,
      old_value: { offer_id: offerId, offer_title: resolved.offer.offer_title },
      new_value: { offer_id: offerId, offer_title: data.offer_title, offer_type: data.offer_type },
      performed_by: actor.performed_by,
      performed_by_id: actor.performed_by_id,
      performed_by_name: actor.performed_by_name,
      performed_by_email: actor.performed_by_email,
      audit_metadata: { description: `Offer updated: ${data.offer_title}` },
    });

    await logStoreActivity({
      storeId: resolved.offer.store_id, section: 'offer', action: 'update',
      entityId: resolved.offer.id, entityName: data.offer_title,
      summary: `Merchant updated offer "${data.offer_title}"`,
      actorName: actor.performed_by_name, actorEmail: actor.performed_by_email,
    });

    if (publishMode === 'publish' || data.is_active === true) {
      void fetch(
        `${process.env.GATIMITRA_BACKEND_API_URL?.replace(/\/$/, '') || 'http://127.0.0.1:3000'}/v1/internal/offers/invalidate`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Internal-Secret': process.env.BACKEND_SCHEDULE_TICK_SECRET || '',
          },
          body: JSON.stringify({
            storeId: resolved.offer.store_id,
            offerId: resolved.offer.id,
            event: 'offer_updated',
          }),
        }
      ).catch(() => {});
    }

    return NextResponse.json(response);
  } catch (e) {
    console.error('[merchant/offers] PATCH', e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ offerId: string }> }
) {
  return NextResponse.json(
    {
      error: 'offer_delete_disabled',
      message: 'Offers cannot be deleted. Use PATCH with action "deactivate" instead.',
    },
    { status: 405 }
  );
}
