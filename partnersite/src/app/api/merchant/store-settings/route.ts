import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAuditActor, logMerchantAudit } from '@/lib/audit-merchant';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function getSupabase() {
  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function resolveStoreId(db: ReturnType<typeof getSupabase>, storeIdParam: string): Promise<number | null> {
  const { data, error } = await db
    .from('merchant_stores')
    .select('id')
    .eq('store_id', storeIdParam)
    .single();
  if (error || !data) return null;
  return data.id as number;
}

/**
 * GET /api/merchant/store-settings?storeId=GMMC1001
 * Returns delivery mode from merchant_store_settings (self_delivery, platform_delivery).
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const storeId = searchParams.get('storeId');
    if (!storeId) return NextResponse.json({ error: 'storeId is required' }, { status: 400 });

    const db = getSupabase();
    const internalId = await resolveStoreId(db, storeId);
    if (internalId === null) return NextResponse.json({ error: 'Store not found' }, { status: 404 });

    const [settingsResult, storeResult] = await Promise.all([
      db.from('merchant_store_settings').select('self_delivery, platform_delivery, delivery_priority, auto_accept_orders, settings_metadata').eq('store_id', internalId).maybeSingle(),
      db.from('merchant_stores').select('delivery_radius_km, full_address, landmark, city, state, postal_code, latitude, longitude, packaging_charge_amount, packaging_charge_last_updated_at, delivery_charge_per_km, delivery_charge_per_km_last_updated_at').eq('store_id', storeId).maybeSingle(),
    ]);

    const { data: settingsData, error: settingsError } = settingsResult;
    const { data: storeData } = storeResult;

    if (settingsError && settingsError.code !== 'PGRST116') {
      return NextResponse.json({ error: settingsError.message }, { status: 500 });
    }

    const deliveryRadiusKm = storeData?.delivery_radius_km != null && !Number.isNaN(Number(storeData.delivery_radius_km))
      ? Number(storeData.delivery_radius_km)
      : undefined;

    const metadata = settingsData?.settings_metadata as Record<string, unknown> | null | undefined;
    const preparationBufferMinutes =
      typeof metadata?.preparation_buffer_minutes === 'number' && !Number.isNaN(metadata.preparation_buffer_minutes)
        ? Number(metadata.preparation_buffer_minutes)
        : undefined;

    const address =
      storeData &&
      (storeData.full_address != null ||
        storeData.landmark != null ||
        storeData.city != null ||
        storeData.state != null ||
        storeData.postal_code != null ||
        storeData.latitude != null ||
        storeData.longitude != null)
        ? {
            full_address: storeData.full_address ?? undefined,
            landmark: storeData.landmark ?? undefined,
            city: storeData.city ?? undefined,
            state: storeData.state ?? undefined,
            postal_code: storeData.postal_code ?? undefined,
            latitude: storeData.latitude != null && !Number.isNaN(Number(storeData.latitude)) ? Number(storeData.latitude) : undefined,
            longitude: storeData.longitude != null && !Number.isNaN(Number(storeData.longitude)) ? Number(storeData.longitude) : undefined,
          }
        : undefined;

    const packagingLastUpdated = storeData?.packaging_charge_last_updated_at
      ? new Date(String(storeData.packaging_charge_last_updated_at)).getTime()
      : null;
    const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
    const canEditPackagingCharge = packagingLastUpdated === null || (Date.now() - packagingLastUpdated >= thirtyDaysMs);
    const nextPackagingEditableAt =
      packagingLastUpdated != null && !canEditPackagingCharge
        ? new Date(packagingLastUpdated + thirtyDaysMs).toISOString()
        : null;

    const deliveryPerKmLastUpdated = storeData?.delivery_charge_per_km_last_updated_at
      ? new Date(String(storeData.delivery_charge_per_km_last_updated_at)).getTime()
      : null;
    const canEditDeliveryChargePerKm = deliveryPerKmLastUpdated === null || (Date.now() - deliveryPerKmLastUpdated >= thirtyDaysMs);
    const nextDeliveryChargeEditableAt =
      deliveryPerKmLastUpdated != null && !canEditDeliveryChargePerKm
        ? new Date(deliveryPerKmLastUpdated + thirtyDaysMs).toISOString()
        : null;

    return NextResponse.json({
      self_delivery: settingsData?.self_delivery ?? false,
      platform_delivery: settingsData?.platform_delivery ?? true,
      delivery_priority: settingsData?.delivery_priority ?? (settingsData?.self_delivery ? 'SELF' : 'GATIMITRA'),
      auto_accept_orders: settingsData?.auto_accept_orders ?? false,
      ...(preparationBufferMinutes !== undefined && { preparation_buffer_minutes: preparationBufferMinutes }),
      ...(deliveryRadiusKm !== undefined && { delivery_radius_km: deliveryRadiusKm }),
      ...(address && { address }),
      packaging_charge_amount: storeData?.packaging_charge_amount != null ? Number(storeData.packaging_charge_amount) : null,
      packaging_charge_last_updated_at: storeData?.packaging_charge_last_updated_at ?? null,
      can_edit_packaging_charge: canEditPackagingCharge,
      next_packaging_editable_at: nextPackagingEditableAt,
      delivery_charge_per_km: storeData?.delivery_charge_per_km != null ? Number(storeData.delivery_charge_per_km) : null,
      delivery_charge_per_km_last_updated_at: storeData?.delivery_charge_per_km_last_updated_at ?? null,
      can_edit_delivery_charge_per_km: canEditDeliveryChargePerKm,
      next_delivery_charge_editable_at: nextDeliveryChargeEditableAt,
    });
  } catch (err) {
    console.error('[store-settings GET]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * PATCH /api/merchant/store-settings
 * Body: { storeId, self_delivery?, platform_delivery?, delivery_radius_km?, address?: {...}, auto_accept_orders?, preparation_buffer_minutes? }
 */
export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const storeId = body?.storeId;
    if (!storeId) return NextResponse.json({ error: 'storeId is required' }, { status: 400 });

    const db = getSupabase();
    const internalId = await resolveStoreId(db, storeId);
    if (internalId === null) return NextResponse.json({ error: 'Store not found' }, { status: 404 });

    const self_delivery = typeof body.self_delivery === 'boolean' ? body.self_delivery : undefined;
    const platform_delivery = typeof body.platform_delivery === 'boolean' ? body.platform_delivery : undefined;
    const delivery_radius_km = typeof body.delivery_radius_km === 'number' && !Number.isNaN(body.delivery_radius_km) && body.delivery_radius_km >= 0
      ? body.delivery_radius_km
      : undefined;
    const addressPayload = body?.address && typeof body.address === 'object' ? body.address : undefined;
    const auto_accept_orders = typeof body.auto_accept_orders === 'boolean' ? body.auto_accept_orders : undefined;
    const preparation_buffer_minutes =
      typeof body.preparation_buffer_minutes === 'number' && !Number.isNaN(body.preparation_buffer_minutes) && body.preparation_buffer_minutes >= 0 && body.preparation_buffer_minutes <= 120
        ? body.preparation_buffer_minutes
        : undefined;

    const DELIVERY_PER_KM_MIN = 10;
    const DELIVERY_PER_KM_MAX = 15;
    const rawDeliveryPerKm = body.delivery_charge_per_km;
    const delivery_charge_per_km =
      rawDeliveryPerKm !== undefined && rawDeliveryPerKm !== null
        ? (typeof rawDeliveryPerKm === 'number' ? rawDeliveryPerKm : Number(rawDeliveryPerKm))
        : undefined;
    const hasDeliveryChargePerKmPayload =
      delivery_charge_per_km !== undefined &&
      !Number.isNaN(delivery_charge_per_km) &&
      delivery_charge_per_km >= DELIVERY_PER_KM_MIN &&
      delivery_charge_per_km <= DELIVERY_PER_KM_MAX;

    const hasDeliveryPayload = self_delivery !== undefined || platform_delivery !== undefined || delivery_radius_km !== undefined;
    const hasAddressPayload =
      addressPayload &&
      (addressPayload.full_address !== undefined ||
        addressPayload.landmark !== undefined ||
        addressPayload.city !== undefined ||
        addressPayload.state !== undefined ||
        addressPayload.postal_code !== undefined ||
        addressPayload.latitude !== undefined ||
        addressPayload.longitude !== undefined);
    const hasOperationsPayload = auto_accept_orders !== undefined || preparation_buffer_minutes !== undefined;

    const PACKAGING_MIN = 5;
    const PACKAGING_MAX = 15;
    const rawPackaging = body.packaging_charge_amount;
    const packaging_charge_amount =
      rawPackaging !== undefined && rawPackaging !== null
        ? (typeof rawPackaging === 'number' ? rawPackaging : Number(rawPackaging))
        : undefined;
    const hasPackagingPayload =
      packaging_charge_amount !== undefined &&
      !Number.isNaN(packaging_charge_amount) &&
      packaging_charge_amount >= PACKAGING_MIN &&
      packaging_charge_amount <= PACKAGING_MAX;

    if (packaging_charge_amount !== undefined && !Number.isNaN(packaging_charge_amount) && (packaging_charge_amount < PACKAGING_MIN || packaging_charge_amount > PACKAGING_MAX)) {
      return NextResponse.json(
        { error: `Packaging charge must be between ₹${PACKAGING_MIN} and ₹${PACKAGING_MAX}.` },
        { status: 400 }
      );
    }
    if (delivery_charge_per_km !== undefined && !Number.isNaN(delivery_charge_per_km) && (delivery_charge_per_km < DELIVERY_PER_KM_MIN || delivery_charge_per_km > DELIVERY_PER_KM_MAX)) {
      return NextResponse.json(
        { error: `Delivery charge per km must be between ₹${DELIVERY_PER_KM_MIN} and ₹${DELIVERY_PER_KM_MAX}.` },
        { status: 400 }
      );
    }
    if (hasDeliveryChargePerKmPayload) {
      const { data: storeRow } = await db
        .from('merchant_stores')
        .select('delivery_charge_per_km_last_updated_at')
        .eq('id', internalId)
        .single();
      const lastUpdated = storeRow?.delivery_charge_per_km_last_updated_at
        ? new Date(String(storeRow.delivery_charge_per_km_last_updated_at)).getTime()
        : null;
      const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
      const canEdit = lastUpdated === null || Date.now() - lastUpdated >= thirtyDaysMs;
      if (!canEdit) {
        return NextResponse.json(
          {
            error: 'Delivery charge per km can only be updated once in 30 days. Please try again later.',
            next_editable_at: new Date(lastUpdated! + thirtyDaysMs).toISOString(),
          },
          { status: 400 }
        );
      }
    }
    if (hasPackagingPayload) {
      const { data: storeRow } = await db
        .from('merchant_stores')
        .select('packaging_charge_last_updated_at')
        .eq('id', internalId)
        .single();
      const lastUpdated = storeRow?.packaging_charge_last_updated_at
        ? new Date(String(storeRow.packaging_charge_last_updated_at)).getTime()
        : null;
      const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
      const canEdit = lastUpdated === null || Date.now() - lastUpdated >= thirtyDaysMs;
      if (!canEdit) {
        return NextResponse.json(
          {
            error: 'Packaging charge can only be updated once in 30 days. Please try again later.',
            next_editable_at: new Date(lastUpdated! + thirtyDaysMs).toISOString(),
          },
          { status: 400 }
        );
      }
    }

    if (!hasDeliveryPayload && !hasAddressPayload && !hasOperationsPayload && !hasPackagingPayload && !hasDeliveryChargePerKmPayload) {
      return NextResponse.json({ success: true });
    }

    const needsStoreBefore =
      delivery_radius_km !== undefined ||
      hasPackagingPayload ||
      hasDeliveryChargePerKmPayload ||
      hasAddressPayload;
    let storeBefore: Record<string, unknown> | null = null;
    if (needsStoreBefore) {
      const { data: storeRow } = await db
        .from('merchant_stores')
        .select(
          'delivery_radius_km, packaging_charge_amount, delivery_charge_per_km, full_address, landmark, city, state, postal_code, latitude, longitude'
        )
        .eq('id', internalId)
        .maybeSingle();
      if (storeRow) storeBefore = storeRow as Record<string, unknown>;
    }

    let settingsBefore: { id?: number; self_delivery?: boolean; platform_delivery?: boolean; auto_accept_orders?: boolean; settings_metadata?: unknown } | null = null;
    if (hasDeliveryPayload || hasOperationsPayload) {
      const { data: existing } = await db
        .from('merchant_store_settings')
        .select('id, self_delivery, platform_delivery, auto_accept_orders, settings_metadata')
        .eq('store_id', internalId)
        .maybeSingle();
      settingsBefore = existing ?? null;

      const payload: Record<string, unknown> = {
        store_id: internalId,
        updated_at: new Date().toISOString(),
      };
      if (self_delivery !== undefined) payload.self_delivery = self_delivery;
      if (platform_delivery !== undefined) payload.platform_delivery = platform_delivery;
      if (auto_accept_orders !== undefined) payload.auto_accept_orders = auto_accept_orders;
      if (preparation_buffer_minutes !== undefined) {
        const currentMeta = (settingsBefore?.settings_metadata as Record<string, unknown>) || {};
        payload.settings_metadata = { ...currentMeta, preparation_buffer_minutes };
      }

      if (settingsBefore?.id != null) {
        const { error: updateErr } = await db
          .from('merchant_store_settings')
          .update(payload)
          .eq('store_id', internalId);
        if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });
      } else {
        const { error: insertErr } = await db.from('merchant_store_settings').insert(payload);
        if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 500 });
      }
    }

    const storeUpdates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (delivery_radius_km !== undefined) storeUpdates.delivery_radius_km = delivery_radius_km;
    if (hasPackagingPayload) {
      storeUpdates.packaging_charge_amount = packaging_charge_amount;
      storeUpdates.packaging_charge_last_updated_at = new Date().toISOString();
    }
    if (hasDeliveryChargePerKmPayload) {
      storeUpdates.delivery_charge_per_km = delivery_charge_per_km;
      storeUpdates.delivery_charge_per_km_last_updated_at = new Date().toISOString();
    }
    if (hasAddressPayload && addressPayload) {
      if (addressPayload.full_address !== undefined) storeUpdates.full_address = addressPayload.full_address;
      if (addressPayload.landmark !== undefined) storeUpdates.landmark = addressPayload.landmark;
      if (addressPayload.city !== undefined) storeUpdates.city = addressPayload.city;
      if (addressPayload.state !== undefined) storeUpdates.state = addressPayload.state;
      if (addressPayload.postal_code !== undefined) storeUpdates.postal_code = addressPayload.postal_code;
      if (addressPayload.latitude !== undefined) storeUpdates.latitude = addressPayload.latitude;
      if (addressPayload.longitude !== undefined) storeUpdates.longitude = addressPayload.longitude;
    }
    if (Object.keys(storeUpdates).length > 1) {
      const { error: storeUpdateErr } = await db
        .from('merchant_stores')
        .update(storeUpdates)
        .eq('store_id', String(storeId).trim());
      if (storeUpdateErr) return NextResponse.json({ error: storeUpdateErr.message }, { status: 500 });
    }

    const responseJson: Record<string, unknown> = { success: true };
    if (hasDeliveryChargePerKmPayload) {
      const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
      responseJson.next_editable_at = new Date(Date.now() + thirtyDaysMs).toISOString();
    }

    const actor = await getAuditActor();
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || null;
    const ua = req.headers.get('user-agent') || null;
    const auditBase = { entity_type: 'STORE' as const, entity_id: internalId, action: 'UPDATE' as const, ...actor, ip_address: ip, user_agent: ua };

    if (hasDeliveryPayload) {
      const modeLabel = self_delivery === true ? 'Self delivery' : 'GatiMitra (platform) delivery';
      await logMerchantAudit(db, {
        ...auditBase,
        action_field: 'DELIVERY_MODE',
        old_value: { self_delivery: settingsBefore?.self_delivery ?? false, platform_delivery: settingsBefore?.platform_delivery ?? true },
        new_value: { self_delivery: !!self_delivery, platform_delivery: platform_delivery !== false },
        audit_metadata: { description: `Delivery mode changed to ${modeLabel}` },
      });
    }
    if (delivery_radius_km !== undefined) {
      await logMerchantAudit(db, {
        ...auditBase,
        action_field: 'DELIVERY_RADIUS_KM',
        old_value: storeBefore ? { delivery_radius_km: storeBefore.delivery_radius_km } : null,
        new_value: { delivery_radius_km },
        audit_metadata: { description: 'Delivery radius (km) updated' },
      });
    }
    if (hasPackagingPayload) {
      await logMerchantAudit(db, {
        ...auditBase,
        action_field: 'PACKAGING_CHARGE',
        old_value: storeBefore ? { packaging_charge_amount: storeBefore.packaging_charge_amount } : null,
        new_value: { packaging_charge_amount },
        audit_metadata: { description: 'Packaging charge amount (₹) updated' },
      });
    }
    if (hasDeliveryChargePerKmPayload) {
      await logMerchantAudit(db, {
        ...auditBase,
        action_field: 'DELIVERY_CHARGE_PER_KM',
        old_value: storeBefore ? { delivery_charge_per_km: storeBefore.delivery_charge_per_km } : null,
        new_value: { delivery_charge_per_km },
        audit_metadata: { description: 'Delivery charge per km (₹) updated' },
      });
    }
    if (hasAddressPayload && addressPayload) {
      const oldAddr = storeBefore
        ? {
            full_address: storeBefore.full_address,
            landmark: storeBefore.landmark,
            city: storeBefore.city,
            state: storeBefore.state,
            postal_code: storeBefore.postal_code,
            latitude: storeBefore.latitude,
            longitude: storeBefore.longitude,
          }
        : null;
      await logMerchantAudit(db, {
        ...auditBase,
        action_field: 'STORE_ADDRESS',
        old_value: oldAddr,
        new_value: addressPayload,
        audit_metadata: { description: 'Store address updated' },
      });
    }
    if (auto_accept_orders !== undefined) {
      await logMerchantAudit(db, {
        ...auditBase,
        action_field: 'AUTO_ACCEPT_ORDERS',
        old_value: settingsBefore ? { auto_accept_orders: settingsBefore.auto_accept_orders } : null,
        new_value: { auto_accept_orders },
        audit_metadata: { description: 'Auto-accept orders setting updated' },
      });
    }
    if (preparation_buffer_minutes !== undefined) {
      const oldMeta = settingsBefore?.settings_metadata as Record<string, unknown> | undefined;
      await logMerchantAudit(db, {
        ...auditBase,
        action_field: 'PREPARATION_BUFFER_MINUTES',
        old_value: oldMeta?.preparation_buffer_minutes != null ? { preparation_buffer_minutes: oldMeta.preparation_buffer_minutes } : null,
        new_value: { preparation_buffer_minutes },
        audit_metadata: { description: 'Preparation buffer (minutes) updated' },
      });
    }

    return NextResponse.json(responseJson);
  } catch (err) {
    console.error('[store-settings PATCH]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
