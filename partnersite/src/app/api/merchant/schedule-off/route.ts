import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { assertStoreAccess } from '@/lib/auth/assert-store-access';
import { clearStaleScheduledClosureVacationOnAvailability } from '@/lib/storeScheduleSync';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function getDb() {
  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/** Recreate future `scheduled_off` holiday rows from all active/upcoming closures (drops stale slices first). */
async function rebuildScheduledOffHolidaysFromClosures(
  db: ReturnType<typeof getDb>,
  storeIdNum: number
): Promise<void> {
  const todayUtc = new Date().toISOString().slice(0, 10);
  await db
    .from('merchant_store_holidays')
    .delete()
    .eq('store_id', storeIdNum)
    .eq('holiday_type', 'scheduled_off')
    .gte('holiday_date', todayUtc);

  const nowIso = new Date().toISOString();
  const { data: closures } = await db
    .from('merchant_store_scheduled_closures')
    .select('reason, starts_at, ends_at')
    .eq('store_id', storeIdNum)
    .in('status', ['scheduled', 'active'])
    .gt('ends_at', nowIso)
    .order('starts_at', { ascending: true });

  const istDateFormatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });

  for (const c of closures ?? []) {
    const startsAt = new Date(String(c.starts_at));
    const endsAt = new Date(String(c.ends_at));
    if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime())) continue;
    if (endsAt.getTime() <= startsAt.getTime()) continue;
    const reason = typeof c.reason === 'string' && c.reason.trim() !== '' ? c.reason.trim() : 'Scheduled time-off';
    const startDateStr = istDateFormatter.format(startsAt);
    const startTimeStr = startsAt.toISOString().slice(11, 19);
    const endTimeStr = endsAt.toISOString().slice(11, 19);
    const isFullDay = startTimeStr === '00:00:00' && endTimeStr >= '23:59:00';

    await db.from('merchant_store_holidays').insert({
      store_id: storeIdNum,
      holiday_name: 'Scheduled off',
      holiday_type: 'scheduled_off',
      holiday_date: startDateStr,
      is_full_day: isFullDay,
      closed_from: startTimeStr,
      closed_till: endTimeStr,
      closure_reason: reason,
    });
  }
}

async function loadAuditContext(db: ReturnType<typeof getDb>, storeInternalId: number) {
  const { data: storeRow } = await db
    .from('merchant_stores')
    .select('parent_id')
    .eq('id', storeInternalId)
    .single();
  const parentId = storeRow?.parent_id as number | undefined;
  if (parentId == null) return null;
  const { data: parentRow } = await db
    .from('merchant_parents')
    .select('owner_name, owner_email, parent_name')
    .eq('id', parentId)
    .single();
  return {
    parentId,
    performed_by_id: String(parentId),
    performed_by_email: (parentRow?.owner_email as string) ?? null,
    performed_by_name:
      (parentRow?.owner_name as string) ?? (parentRow?.parent_name as string) ?? null,
  };
}

/**
 * GET /api/merchant/schedule-off?store_id=GMMC…
 * Upcoming / active scheduled closures for the store.
 */
export async function GET(req: NextRequest) {
  try {
    const storeId = new URL(req.url).searchParams.get('store_id');
    const gate = await assertStoreAccess(storeId);
    if (!gate.ok) {
      return NextResponse.json({ error: gate.error }, { status: gate.status });
    }
    const db = getDb();
    const nowIso = new Date().toISOString();
    const { data: rows, error } = await db
      .from('merchant_store_scheduled_closures')
      .select('id, reason, starts_at, ends_at, status, marked_from')
      .eq('store_id', gate.storeIdNum)
      .in('status', ['scheduled', 'active'])
      .gt('ends_at', nowIso)
      .order('starts_at', { ascending: true });
    if (error) {
      console.error('[merchant/schedule-off GET]', error);
      return NextResponse.json({ error: 'Failed to load schedule' }, { status: 500 });
    }
    return NextResponse.json({ closures: rows ?? [] });
  } catch (e) {
    console.error('[merchant/schedule-off GET]', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * POST /api/merchant/schedule-off
 * Mirrors mobile POST /v1/merchant-partner/stores/:id/schedule-off (DB + log + notifications; no Expo push from web).
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const storeIdParam = typeof body.store_id === 'string' ? body.store_id.trim() : '';
    const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
    const permanent = body.permanent === true;
    const startsAtRaw = typeof body.starts_at === 'string' ? body.starts_at : undefined;
    const endsAtRaw = typeof body.ends_at === 'string' ? body.ends_at : undefined;
    const closeUntilRaw = typeof body.close_until === 'string' ? body.close_until : undefined;

    const gate = await assertStoreAccess(storeIdParam || null);
    if (!gate.ok) {
      return NextResponse.json({ error: gate.error }, { status: gate.status });
    }
    const storeIdNum = gate.storeIdNum;
    const db = getDb();

    if (!reason) {
      return NextResponse.json({ error: 'reason is required' }, { status: 400 });
    }

    if (permanent) {
      const restrictionType = 'PERMANENT_SHUT';
      await db
        .from('merchant_store_availability')
        .update({
          is_available: false,
          is_accepting_orders: false,
          manual_close_until: null,
          restriction_type: restrictionType,
          updated_at: new Date().toISOString(),
        })
        .eq('store_id', storeIdNum);
      await db
        .from('merchant_stores')
        .update({
          is_accepting_orders: false,
          is_active: false,
          updated_at: new Date().toISOString(),
        })
        .eq('id', storeIdNum);
      await db.from('merchant_store_notifications').insert({
        store_id: storeIdNum,
        type: 'store',
        title: 'Store marked permanently closed',
        body: 'Your store has been marked as permanently closed.',
        read: false,
        action_url: '/(tabs)/profile/vacation',
      });
      return NextResponse.json({
        store_id: storeIdNum,
        manual_close_until: null,
        restriction_type: restrictionType,
        reason,
        permanent: true,
      });
    }

    const now = new Date();
    const startsAt = startsAtRaw ? new Date(startsAtRaw) : now;
    const endsAt = endsAtRaw
      ? new Date(endsAtRaw)
      : closeUntilRaw
        ? new Date(closeUntilRaw)
        : new Date(now.getTime() + 2 * 60 * 60 * 1000);

    if (
      Number.isNaN(startsAt.getTime()) ||
      Number.isNaN(endsAt.getTime()) ||
      endsAt.getTime() <= startsAt.getTime()
    ) {
      return NextResponse.json(
        { error: 'invalid_body', message: 'starts_at/ends_at are invalid' },
        { status: 400 }
      );
    }

    await db
      .from('merchant_store_scheduled_closures')
      .update({ status: 'cancelled', updated_at: new Date().toISOString() })
      .eq('store_id', storeIdNum)
      .in('status', ['scheduled', 'active']);

    const { data: schedIns, error: schedErr } = await db
      .from('merchant_store_scheduled_closures')
      .insert({
        store_id: storeIdNum,
        reason,
        starts_at: startsAt.toISOString(),
        ends_at: endsAt.toISOString(),
        status: 'scheduled',
        marked_from: 'partnersite',
      })
      .select('id')
      .single();

    if (schedErr) {
      console.error('[merchant/schedule-off POST] insert closure', schedErr);
      return NextResponse.json({ error: 'Failed to save schedule' }, { status: 500 });
    }

    await rebuildScheduledOffHolidaysFromClosures(db, storeIdNum);

    await db.from('merchant_store_notifications').insert({
      store_id: storeIdNum,
      type: 'store',
      title: 'Scheduled store closure set',
      body: 'Your store closure schedule has been set successfully.',
      read: false,
      action_url: '/(tabs)/profile/vacation',
    });

    const audit = await loadAuditContext(db, storeIdNum);
    if (audit) {
      await db.from('merchant_store_status_log').insert({
        store_id: storeIdNum,
        action: 'scheduled_close',
        restriction_type: 'SCHEDULED',
        performed_by_id: audit.performed_by_id,
        performed_by_email: audit.performed_by_email,
        performed_by_name: audit.performed_by_name,
        close_reason: reason,
      });
    }

    return NextResponse.json({
      store_id: storeIdNum,
      manual_close_until: null,
      restriction_type: 'SCHEDULED',
      reason,
      permanent: false,
      starts_at: startsAt.toISOString(),
      ends_at: endsAt.toISOString(),
      scheduled_closure_id: schedIns?.id ?? null,
    });
  } catch (e) {
    console.error('[merchant/schedule-off POST]', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * DELETE /api/merchant/schedule-off?store_id=GMMC…
 * Same as mobile DELETE schedule-off: remove scheduled/active closures + future scheduled_off holidays.
 */
export async function DELETE(req: NextRequest) {
  try {
    const storeId = new URL(req.url).searchParams.get('store_id');
    const closureIdRaw = new URL(req.url).searchParams.get('closure_id');
    const gate = await assertStoreAccess(storeId);
    if (!gate.ok) {
      return NextResponse.json({ error: gate.error }, { status: gate.status });
    }
    const db = getDb();
    const storeIdNum = gate.storeIdNum;

    if (closureIdRaw != null && closureIdRaw !== '') {
      const closureId = parseInt(closureIdRaw, 10);
      if (!Number.isFinite(closureId)) {
        return NextResponse.json({ error: 'invalid closure_id' }, { status: 400 });
      }
      const { data: row } = await db
        .from('merchant_store_scheduled_closures')
        .select('id')
        .eq('id', closureId)
        .eq('store_id', storeIdNum)
        .in('status', ['scheduled', 'active'])
        .maybeSingle();
      if (!row) {
        return NextResponse.json({ error: 'Closure not found' }, { status: 404 });
      }
      await db.from('merchant_store_scheduled_closures').delete().eq('id', closureId).eq('store_id', storeIdNum);
      await rebuildScheduledOffHolidaysFromClosures(db, storeIdNum);
      await clearStaleScheduledClosureVacationOnAvailability(db, storeIdNum);
      return NextResponse.json({ ok: true, partial: true });
    }

    await db
      .from('merchant_store_scheduled_closures')
      .delete()
      .eq('store_id', storeIdNum)
      .in('status', ['scheduled', 'active']);

    await db
      .from('merchant_store_holidays')
      .delete()
      .eq('store_id', storeIdNum)
      .eq('holiday_type', 'scheduled_off')
      .gte('holiday_date', new Date().toISOString().slice(0, 10));

    await clearStaleScheduledClosureVacationOnAvailability(db, storeIdNum);

    await db.from('merchant_store_notifications').insert({
      store_id: storeIdNum,
      type: 'store',
      title: 'Scheduled closure cancelled',
      body: 'Your scheduled store closure has been cancelled.',
      read: false,
      action_url: '/(tabs)/profile/vacation',
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('[merchant/schedule-off DELETE]', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * PATCH /api/merchant/schedule-off
 * Body: { store_id, closure_id, reason, starts_at, ends_at }
 */
export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const storeIdParam = typeof body.store_id === 'string' ? body.store_id.trim() : '';
    const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
    const closureId = Number(body.closure_id);
    const startsAtRaw = typeof body.starts_at === 'string' ? body.starts_at : '';
    const endsAtRaw = typeof body.ends_at === 'string' ? body.ends_at : '';

    const gate = await assertStoreAccess(storeIdParam || null);
    if (!gate.ok) {
      return NextResponse.json({ error: gate.error }, { status: gate.status });
    }
    const storeIdNum = gate.storeIdNum;
    const db = getDb();

    if (!Number.isFinite(closureId) || !reason || !startsAtRaw || !endsAtRaw) {
      return NextResponse.json({ error: 'closure_id, reason, starts_at, ends_at required' }, { status: 400 });
    }

    const startsAt = new Date(startsAtRaw);
    const endsAt = new Date(endsAtRaw);
    if (
      Number.isNaN(startsAt.getTime()) ||
      Number.isNaN(endsAt.getTime()) ||
      endsAt.getTime() <= startsAt.getTime()
    ) {
      return NextResponse.json({ error: 'invalid_body', message: 'starts_at/ends_at are invalid' }, { status: 400 });
    }

    const { data: existing } = await db
      .from('merchant_store_scheduled_closures')
      .select('id')
      .eq('id', closureId)
      .eq('store_id', storeIdNum)
      .in('status', ['scheduled', 'active'])
      .maybeSingle();
    if (!existing) {
      return NextResponse.json({ error: 'Closure not found' }, { status: 404 });
    }

    await db
      .from('merchant_store_scheduled_closures')
      .update({
        reason,
        starts_at: startsAt.toISOString(),
        ends_at: endsAt.toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', closureId)
      .eq('store_id', storeIdNum);

    await rebuildScheduledOffHolidaysFromClosures(db, storeIdNum);

    await db.from('merchant_store_notifications').insert({
      store_id: storeIdNum,
      type: 'store',
      title: 'Scheduled time-off updated',
      body: 'Your scheduled store closure was updated.',
      read: false,
      action_url: '/(tabs)/profile/vacation',
    });

    return NextResponse.json({
      store_id: storeIdNum,
      scheduled_closure_id: closureId,
      reason,
      starts_at: startsAt.toISOString(),
      ends_at: endsAt.toISOString(),
    });
  } catch (e) {
    console.error('[merchant/schedule-off PATCH]', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
