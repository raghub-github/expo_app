/**
 * PATCH /api/merchant/offers/[offerId] - Update offer (audit + updated_by_name)
 * DELETE /api/merchant/offers/[offerId] - Delete offer (audit)
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { validateMerchantFromSession } from '@/lib/auth/validate-merchant';
import { getAuditActor, logMerchantAudit } from '@/lib/audit-merchant';
import { deleteFromR2, extractR2KeyFromUrl } from '@/lib/r2';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function getDb() {
  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

type OfferRow = { id: number; store_id: number; offer_title: string; offer_type?: string; offer_image_url?: string | null };
type StoreRow = { parent_id: number | null };

async function getOfferAndValidate(
  db: ReturnType<typeof getDb>,
  offerId: string,
  merchantParentId: number
): Promise<{ offer: OfferRow; storeParentId: number } | null> {
  const { data, error: offerErr } = await db
    .from('merchant_offers')
    .select('id, store_id, offer_title, offer_type, offer_image_url')
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

    const updatePayload: Record<string, unknown> = { ...body };
    updatePayload.updated_by_name = actor.performed_by_name;
    updatePayload.updated_by_at = new Date().toISOString();
    delete (updatePayload as any).id;
    delete (updatePayload as any).offer_id;
    delete (updatePayload as any).store_id;
    delete (updatePayload as any).created_at;
    delete (updatePayload as any).created_by_name;

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

    // merchant_offers has no menu_item_ids column; store in offer_metadata
    const menuItemIds = (updatePayload as any).menu_item_ids;
    delete (updatePayload as any).menu_item_ids;
    if (menuItemIds !== undefined) {
      const existingMeta = (typeof updatePayload.offer_metadata === 'object' && updatePayload.offer_metadata != null)
        ? { ...(updatePayload.offer_metadata as object) }
        : {};
      (existingMeta as Record<string, unknown>).menu_item_ids = Array.isArray(menuItemIds) ? menuItemIds : null;
      updatePayload.offer_metadata = existingMeta;
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

    const offerInternalId = resolved.offer.id;
    const offerTitle = resolved.offer.offer_title;

    // Delete offer banner image from R2 before deleting the row
    if (resolved.offer.offer_image_url) {
      const key = extractR2KeyFromUrl(resolved.offer.offer_image_url);
      if (key) {
        try {
          await deleteFromR2(key);
        } catch (e) {
          console.warn('[merchant/offers] DELETE R2 image failed', key, e);
        }
      }
    }

    const { error } = await db.from('merchant_offers').delete().eq('offer_id', offerId);
    if (error) {
      console.error('[merchant/offers] DELETE failed:', error);
      return NextResponse.json({ error: error.message || 'Delete failed' }, { status: 500 });
    }

    const actor = await getAuditActor();
    await logMerchantAudit(db, {
      entity_type: 'OFFER',
      entity_id: offerInternalId,
      action: 'DELETE',
      action_field: null,
      old_value: { offer_id: offerId, offer_title: offerTitle },
      new_value: null,
      performed_by: actor.performed_by,
      performed_by_id: actor.performed_by_id,
      performed_by_name: actor.performed_by_name,
      performed_by_email: actor.performed_by_email,
      audit_metadata: { description: `Offer deleted: ${offerTitle}` },
    });

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error('[merchant/offers] DELETE', e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
