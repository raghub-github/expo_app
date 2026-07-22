import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAuditActor, logMerchantAudit } from '@/lib/audit-merchant';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder.supabase.co";
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "placeholder-service-role-key";

function getSupabase() {
  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function asBool(v: unknown, fallback: boolean) {
  return typeof v === 'boolean' ? v : fallback;
}

function asNum(v: unknown, fallback: number) {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
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
 * Returns store settings from merchant_store_settings.
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
      db
        .from('merchant_store_settings')
        .select(
          [
            'order_notification_enabled',
            'order_notification_sound',
            'auto_accept_orders',
            'auto_accept_time_seconds',
            'preparation_buffer_minutes',
            'self_delivery',
            'platform_delivery',
            'delivery_charge_type',
            'delivery_charge_amount',
            'max_concurrent_orders',
            'max_preparation_time_minutes',
            'cash_handling_enabled',
            'online_payment_enabled',
            'settings_metadata',
            'delivery_priority',
            'show_floating_orders',
            'thermal_printer_width_mm',
          ].join(',')
        )
        .eq('store_id', internalId)
        .maybeSingle(),
      db
        .from('merchant_stores')
        .select(
          'delivery_radius_km, store_phones, full_address, landmark, city, state, postal_code, latitude, longitude, packaging_charge_amount, packaging_charge_last_updated_at, delivery_charge_per_km, delivery_charge_per_km_last_updated_at, avg_preparation_time_minutes'
        )
        .eq('store_id', storeId)
        .maybeSingle(),
    ]);

    const { data: settingsData, error: settingsError } = settingsResult;
    const { data: storeData } = storeResult;

    if (settingsError && settingsError.code !== 'PGRST116') {
      return NextResponse.json({ error: settingsError.message }, { status: 500 });
    }

    const deliveryRadiusKm = storeData?.delivery_radius_km != null && !Number.isNaN(Number(storeData.delivery_radius_km))
      ? Number(storeData.delivery_radius_km)
      : undefined;

    const phonesRaw = (storeData as { store_phones?: unknown } | null)?.store_phones;
    const store_phones: string[] = Array.isArray(phonesRaw)
      ? phonesRaw.map((x) => String(x).trim()).filter((s) => s.length > 0)
      : typeof phonesRaw === 'string' && phonesRaw.trim()
        ? [phonesRaw.trim()]
        : [];
    const primary_phone = store_phones[0] ?? null;

    const settingsRow = settingsData as {
      settings_metadata?: unknown;
      preparation_buffer_minutes?: number | null;
    } | null;
    const metadata = settingsRow?.settings_metadata as Record<string, unknown> | null | undefined;
    const preparationBufferFromColumn =
      settingsRow?.preparation_buffer_minutes != null &&
      !Number.isNaN(Number(settingsRow.preparation_buffer_minutes))
        ? Number(settingsRow.preparation_buffer_minutes)
        : undefined;
    const preparationBufferMinutes =
      preparationBufferFromColumn !== undefined
        ? preparationBufferFromColumn
        : typeof metadata?.preparation_buffer_minutes === 'number' && !Number.isNaN(metadata.preparation_buffer_minutes)
          ? Number(metadata.preparation_buffer_minutes)
          : undefined;

    const avgPreparationTimeMinutes =
      storeData?.avg_preparation_time_minutes != null &&
      !Number.isNaN(Number(storeData.avg_preparation_time_minutes))
        ? Number(storeData.avg_preparation_time_minutes)
        : 30;

    // Manage communications (merchant app parity) — stored under settings_metadata
    const comm = (metadata?.communication_settings as Record<string, unknown> | undefined) ?? undefined;
    const reports = (comm?.reports as Record<string, unknown> | undefined) ?? undefined;
    const orderNotifs = (comm?.order_notifications as Record<string, unknown> | undefined) ?? undefined;

    const communication_settings = {
      whatsapp_notifications: asBool(comm?.whatsapp_notifications, false),
      reports: {
        daily_whatsapp: asBool(reports?.daily_whatsapp, false),
        daily_email: asBool(reports?.daily_email, false),
        weekly_whatsapp: asBool(reports?.weekly_whatsapp, false),
        weekly_email: asBool(reports?.weekly_email, false),
      },
      order_notifications: {
        enabled: asBool(orderNotifs?.enabled, true),
        ring_volume: Math.min(1, Math.max(0, asNum(orderNotifs?.ring_volume, 0.6))),
        ring_in_silent: asBool(orderNotifs?.ring_in_silent, true),
      },
      live_complaint_notifications: asBool(comm?.live_complaint_notifications, false),
      rider_notifications: asBool(comm?.rider_notifications, false),
    };

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
      // New store settings table fields (with sane defaults)
      order_notification_enabled: (settingsData as any)?.order_notification_enabled ?? true,
      order_notification_sound: (settingsData as any)?.order_notification_sound ?? true,
      auto_accept_orders: (settingsData as any)?.auto_accept_orders ?? false,
      auto_accept_time_seconds: (settingsData as any)?.auto_accept_time_seconds ?? 30,
      self_delivery: (settingsData as any)?.self_delivery ?? false,
      platform_delivery: (settingsData as any)?.platform_delivery ?? true,
      delivery_charge_type: (settingsData as any)?.delivery_charge_type ?? 'PLATFORM',
      delivery_charge_amount: (settingsData as any)?.delivery_charge_amount ?? null,
      max_concurrent_orders: (settingsData as any)?.max_concurrent_orders ?? 20,
      max_preparation_time_minutes: (settingsData as any)?.max_preparation_time_minutes ?? 60,
      cash_handling_enabled: (settingsData as any)?.cash_handling_enabled ?? true,
      online_payment_enabled: (settingsData as any)?.online_payment_enabled ?? true,
      delivery_priority: (settingsData as any)?.delivery_priority ?? 'GATIMITRA',
      // Backward-compatible default: floating orders UI is ON unless explicitly disabled.
      show_floating_orders: (settingsData as any)?.show_floating_orders ?? true,
      thermal_printer_width_mm:
        (settingsData as any)?.thermal_printer_width_mm === 58 ? 58 : 80,

      ...(preparationBufferMinutes !== undefined && { preparation_buffer_minutes: preparationBufferMinutes }),
      avg_preparation_time_minutes: avgPreparationTimeMinutes,
      store_phones,
      primary_phone,
      communication_settings,
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
 * Body: { storeId, ..., auto_accept_orders?, preparation_buffer_minutes?, avg_preparation_time_minutes? }
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
    const order_notification_enabled =
      typeof body.order_notification_enabled === 'boolean' ? body.order_notification_enabled : undefined;
    const order_notification_sound =
      typeof body.order_notification_sound === 'boolean' ? body.order_notification_sound : undefined;
    const auto_accept_orders = typeof body.auto_accept_orders === 'boolean' ? body.auto_accept_orders : undefined;
    const auto_accept_time_seconds =
      typeof body.auto_accept_time_seconds === 'number' &&
      Number.isFinite(body.auto_accept_time_seconds) &&
      body.auto_accept_time_seconds >= 0 &&
      body.auto_accept_time_seconds <= 600
        ? Math.floor(body.auto_accept_time_seconds)
        : undefined;
    const cash_handling_enabled = typeof body.cash_handling_enabled === 'boolean' ? body.cash_handling_enabled : undefined;
    const online_payment_enabled = typeof body.online_payment_enabled === 'boolean' ? body.online_payment_enabled : undefined;
    const max_concurrent_orders =
      typeof body.max_concurrent_orders === 'number' && Number.isFinite(body.max_concurrent_orders) && body.max_concurrent_orders >= 1 && body.max_concurrent_orders <= 500
        ? Math.floor(body.max_concurrent_orders)
        : undefined;
    const max_preparation_time_minutes =
      typeof body.max_preparation_time_minutes === 'number' && Number.isFinite(body.max_preparation_time_minutes) && body.max_preparation_time_minutes >= 1 && body.max_preparation_time_minutes <= 300
        ? Math.floor(body.max_preparation_time_minutes)
        : undefined;
    const delivery_charge_type =
      typeof body.delivery_charge_type === 'string' && body.delivery_charge_type.trim()
        ? String(body.delivery_charge_type).trim().toUpperCase()
        : undefined;
    const rawDeliveryChargeAmount = body.delivery_charge_amount;
    const delivery_charge_amount =
      rawDeliveryChargeAmount !== undefined && rawDeliveryChargeAmount !== null
        ? (typeof rawDeliveryChargeAmount === 'number' ? rawDeliveryChargeAmount : Number(rawDeliveryChargeAmount))
        : undefined;
    const delivery_priority =
      typeof body.delivery_priority === 'string' && body.delivery_priority.trim()
        ? String(body.delivery_priority).trim().toUpperCase()
        : undefined;
    const show_floating_orders = typeof body.show_floating_orders === 'boolean' ? body.show_floating_orders : undefined;
    const thermal_printer_width_mm =
      body.thermal_printer_width_mm === 58 || body.thermal_printer_width_mm === 80
        ? body.thermal_printer_width_mm
        : undefined;
    const preparation_buffer_minutes =
      typeof body.preparation_buffer_minutes === 'number' && !Number.isNaN(body.preparation_buffer_minutes) && body.preparation_buffer_minutes >= 0 && body.preparation_buffer_minutes <= 120
        ? body.preparation_buffer_minutes
        : undefined;
    const avg_preparation_time_minutes =
      typeof body.avg_preparation_time_minutes === 'number' &&
      Number.isFinite(body.avg_preparation_time_minutes) &&
      body.avg_preparation_time_minutes >= 5 &&
      body.avg_preparation_time_minutes <= 180
        ? Math.floor(body.avg_preparation_time_minutes)
        : undefined;

    const commRaw = body?.communication_settings;
    const communication_settings =
      commRaw && typeof commRaw === 'object'
        ? (commRaw as {
            whatsapp_notifications?: boolean;
            reports?: { daily_whatsapp?: boolean; daily_email?: boolean; weekly_whatsapp?: boolean; weekly_email?: boolean };
            order_notifications?: { enabled?: boolean; ring_volume?: number; ring_in_silent?: boolean };
            live_complaint_notifications?: boolean;
            rider_notifications?: boolean;
          })
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
    const hasOperationsPayload =
      order_notification_enabled !== undefined ||
      order_notification_sound !== undefined ||
      auto_accept_orders !== undefined ||
      auto_accept_time_seconds !== undefined ||
      cash_handling_enabled !== undefined ||
      online_payment_enabled !== undefined ||
      max_concurrent_orders !== undefined ||
      max_preparation_time_minutes !== undefined ||
      delivery_charge_type !== undefined ||
      delivery_charge_amount !== undefined ||
      delivery_priority !== undefined ||
      show_floating_orders !== undefined ||
      thermal_printer_width_mm !== undefined ||
      preparation_buffer_minutes !== undefined ||
      communication_settings !== undefined;

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

    if (!hasDeliveryPayload && !hasAddressPayload && !hasOperationsPayload && !hasPackagingPayload && !hasDeliveryChargePerKmPayload && avg_preparation_time_minutes === undefined) {
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
          'delivery_radius_km, packaging_charge_amount, delivery_charge_per_km, full_address, landmark, city, state, postal_code, latitude, longitude, avg_preparation_time_minutes'
        )
        .eq('id', internalId)
        .maybeSingle();
      if (storeRow) storeBefore = storeRow as Record<string, unknown>;
    }

    let settingsBefore: {
      id?: number;
      self_delivery?: boolean;
      platform_delivery?: boolean;
      auto_accept_orders?: boolean;
      preparation_buffer_minutes?: number | null;
      settings_metadata?: unknown;
    } | null = null;
    if (hasDeliveryPayload || hasOperationsPayload) {
      const { data: existing } = await db
        .from('merchant_store_settings')
        .select('id, self_delivery, platform_delivery, auto_accept_orders, auto_accept_time_seconds, preparation_buffer_minutes, settings_metadata')
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
      if (auto_accept_time_seconds !== undefined) payload.auto_accept_time_seconds = auto_accept_time_seconds;
      if (order_notification_enabled !== undefined) payload.order_notification_enabled = order_notification_enabled;
      if (order_notification_sound !== undefined) payload.order_notification_sound = order_notification_sound;
      if (cash_handling_enabled !== undefined) payload.cash_handling_enabled = cash_handling_enabled;
      if (online_payment_enabled !== undefined) payload.online_payment_enabled = online_payment_enabled;
      if (max_concurrent_orders !== undefined) payload.max_concurrent_orders = max_concurrent_orders;
      if (max_preparation_time_minutes !== undefined) payload.max_preparation_time_minutes = max_preparation_time_minutes;
      if (delivery_charge_type !== undefined) payload.delivery_charge_type = delivery_charge_type;
      if (delivery_charge_amount !== undefined) payload.delivery_charge_amount = delivery_charge_amount;
      if (delivery_priority !== undefined) payload.delivery_priority = delivery_priority;
      if (show_floating_orders !== undefined) payload.show_floating_orders = show_floating_orders;
      if (thermal_printer_width_mm !== undefined) {
        payload.thermal_printer_width_mm = thermal_printer_width_mm;
      }
      if (preparation_buffer_minutes !== undefined) {
        payload.preparation_buffer_minutes = preparation_buffer_minutes;
        const currentMeta = (settingsBefore?.settings_metadata as Record<string, unknown>) || {};
        payload.settings_metadata = { ...currentMeta, preparation_buffer_minutes };
      }
      if (communication_settings !== undefined) {
        const currentMeta = (payload.settings_metadata as Record<string, unknown>) || (settingsBefore?.settings_metadata as Record<string, unknown>) || {};
        const prevComm =
          (currentMeta.communication_settings && typeof currentMeta.communication_settings === 'object'
            ? (currentMeta.communication_settings as Record<string, unknown>)
            : {}) ?? {};
        const nextComm = {
          ...prevComm,
          whatsapp_notifications:
            typeof communication_settings.whatsapp_notifications === 'boolean'
              ? communication_settings.whatsapp_notifications
              : (prevComm as any).whatsapp_notifications,
          live_complaint_notifications:
            typeof communication_settings.live_complaint_notifications === 'boolean'
              ? communication_settings.live_complaint_notifications
              : (prevComm as any).live_complaint_notifications,
          rider_notifications:
            typeof communication_settings.rider_notifications === 'boolean'
              ? communication_settings.rider_notifications
              : (prevComm as any).rider_notifications,
          reports: {
            ...(((prevComm as any).reports && typeof (prevComm as any).reports === 'object' ? (prevComm as any).reports : {}) as Record<string, unknown>),
            ...(communication_settings.reports ?? {}),
          },
          order_notifications: {
            ...(((prevComm as any).order_notifications && typeof (prevComm as any).order_notifications === 'object'
              ? (prevComm as any).order_notifications
              : {}) as Record<string, unknown>),
            ...(communication_settings.order_notifications ?? {}),
          },
        };
        // Clamp ring_volume to [0,1] if provided
        if (communication_settings.order_notifications && communication_settings.order_notifications.ring_volume != null) {
          const rv = communication_settings.order_notifications.ring_volume;
          const n = typeof rv === 'number' ? rv : Number(rv);
          (nextComm as any).order_notifications = {
            ...(nextComm as any).order_notifications,
            ring_volume: Math.min(1, Math.max(0, Number.isFinite(n) ? n : 0.6)),
          };
        }
        payload.settings_metadata = { ...currentMeta, communication_settings: nextComm };
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
    if (avg_preparation_time_minutes !== undefined) {
      storeUpdates.avg_preparation_time_minutes = avg_preparation_time_minutes;
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
      await logMerchantAudit(db, {
        ...auditBase,
        action_field: 'PREPARATION_BUFFER_MINUTES',
        old_value:
          settingsBefore?.preparation_buffer_minutes != null
            ? { preparation_buffer_minutes: settingsBefore.preparation_buffer_minutes }
            : null,
        new_value: { preparation_buffer_minutes },
        audit_metadata: { description: 'Preparation buffer (minutes) updated' },
      });
    }
    if (avg_preparation_time_minutes !== undefined) {
      await logMerchantAudit(db, {
        ...auditBase,
        action_field: 'AVG_PREPARATION_TIME_MINUTES',
        old_value: storeBefore ? { avg_preparation_time_minutes: storeBefore.avg_preparation_time_minutes } : null,
        new_value: { avg_preparation_time_minutes },
        audit_metadata: { description: 'Default preparation time (minutes) updated' },
      });
    }

    return NextResponse.json(responseJson);
  } catch (err) {
    console.error('[store-settings PATCH]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
