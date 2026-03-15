import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerSupabaseClient } from '@/lib/supabase/server';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function getSupabase() {
  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/** Build today's date and slots for the store's timezone from operating_hours */
function getTodaySlots(
  oh: Record<string, unknown> | null,
  storeTimezone: string
): { today_date: string; today_slots: { start: string; end: string }[] } {
  const now = new Date();
  const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const { dayIndex } = getStoreLocalTime(now, storeTimezone);
  const dayStr = dayNames[dayIndex];
  const dateFormatter = new Intl.DateTimeFormat('en-CA', { timeZone: storeTimezone, year: 'numeric', month: '2-digit', day: '2-digit' });
  const today_date = dateFormatter.format(now);

  const slots: { start: string; end: string }[] = [];
  
  // Check if day is in closed_days array
  const closedDays = oh?.closed_days as string[] | null;
  if (closedDays && Array.isArray(closedDays) && closedDays.includes(dayStr)) {
    return { today_date, today_slots: slots }; // Day is explicitly closed
  }
  
  if (!oh || oh[`${dayStr}_open`] !== true) {
    return { today_date, today_slots: slots };
  }
  if (oh.is_24_hours === true) {
    return { today_date, today_slots: [{ start: '00:00', end: '23:59' }] };
  }
  const s1Start = oh[`${dayStr}_slot1_start`] as string | null;
  const s1End = oh[`${dayStr}_slot1_end`] as string | null;
  const s2Start = oh[`${dayStr}_slot2_start`] as string | null;
  const s2End = oh[`${dayStr}_slot2_end`] as string | null;
  if (s1Start && s1End) slots.push({ start: s1Start, end: s1End });
  if (s2Start && s2End) slots.push({ start: s2Start, end: s2End });
  return { today_date, today_slots: slots };
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

/** Get local day (0=Sun..6=Sat) and time-in-minutes in the store's timezone */
function getStoreLocalTime(now: Date, timezone: string): { dayIndex: number; nowMinutes: number } {
  const tz = timezone || 'Asia/Kolkata';
  const dayFormatter = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'long' });
  const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const dayStr = dayFormatter.format(now).toLowerCase();
  const dayIndex = dayNames.indexOf(dayStr);
  const timeFormatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const timeStr = timeFormatter.format(now);
  const [h, m] = timeStr.split(':').map(Number);
  const nowMinutes = (h ?? 0) * 60 + (m ?? 0);
  return { dayIndex, nowMinutes };
}

function isWithinOperatingHours(
  oh: Record<string, unknown>,
  now: Date,
  storeTimezone?: string | null
): boolean {
  const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const { dayIndex, nowMinutes } = storeTimezone
    ? getStoreLocalTime(now, storeTimezone)
    : { dayIndex: now.getDay(), nowMinutes: now.getHours() * 60 + now.getMinutes() };
  const day = dayNames[dayIndex];
  
  // Check if day is in closed_days array
  const closedDays = oh.closed_days as string[] | null;
  if (closedDays && Array.isArray(closedDays) && closedDays.includes(day)) {
    return false; // Day is explicitly closed
  }
  
  const isOpen = oh[`${day}_open`] === true;
  if (!isOpen) return false;
  if (oh.is_24_hours === true) return true;

  const slot1Start = oh[`${day}_slot1_start`] as string | null;
  const slot1End = oh[`${day}_slot1_end`] as string | null;
  const slot2Start = oh[`${day}_slot2_start`] as string | null;
  const slot2End = oh[`${day}_slot2_end`] as string | null;

  const timeToMinutes = (t: string) => {
    const [h, m] = t.split(':').map(Number);
    return (h ?? 0) * 60 + (m ?? 0);
  };
  const inSlot = (start: string, end: string) => {
    let s = timeToMinutes(start);
    let e = timeToMinutes(end);
    if (e <= s) e += 24 * 60;
    return nowMinutes >= s && nowMinutes < e;
  };

  if (slot1Start && slot1End && inSlot(slot1Start, slot1End)) return true;
  if (slot2Start && slot2End && inSlot(slot2Start, slot2End)) return true;
  return false;
}

/** Next open time (ISO) when store is closed: from manual_close_until or next slot from schedule. */
function getNextOpenAt(
  oh: Record<string, unknown> | null,
  storeTz: string,
  now: Date
): string | null {
  if (!oh) return null;
  const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const { dayIndex, nowMinutes } = getStoreLocalTime(now, storeTz);
  const timeToMinutes = (t: string) => {
    const [h, m] = t.split(':').map(Number);
    return (h ?? 0) * 60 + (m ?? 0);
  };
  
  // Get closed_days array
  const closedDays = oh.closed_days as string[] | null;
  
  for (let offset = 0; offset < 8; offset++) {
    const dayIdx = (dayIndex + offset) % 7;
    const day = dayNames[dayIdx];
    
    // Skip if day is explicitly closed
    if (closedDays && Array.isArray(closedDays) && closedDays.includes(day)) {
      continue;
    }
    
    // Skip if day is not open
    if (oh[`${day}_open`] !== true) continue;
    const s1 = oh[`${day}_slot1_start`] as string | null;
    const s2 = oh[`${day}_slot2_start`] as string | null;
    for (const startStr of [s1, s2]) {
      if (!startStr) continue;
      const startMins = timeToMinutes(startStr);
      const isToday = offset === 0;
      if (isToday && startMins <= nowMinutes) continue;
      const addDays = offset === 0 ? 0 : offset;
      const d = new Date(now);
      d.setDate(d.getDate() + addDays);
      const h = Math.floor(startMins / 60) % 24;
      const m = startMins % 60;
      d.setHours(h, m, 0, 0);
      return d.toISOString();
    }
  }
  return null;
}

async function ensureAvailabilityRow(db: ReturnType<typeof getSupabase>, storeInternalId: number) {
  const { data } = await db.from('merchant_store_availability').select('id').eq('store_id', storeInternalId).single();
  if (data) return;
  await db.from('merchant_store_availability').insert({
    store_id: storeInternalId,
    is_available: true,
    is_accepting_orders: true,
  });
}

/**
 * GET /api/store-operations?store_id=GMMC1001
 * Returns current effective status, manual_close_until, and whether auto-open is enabled.
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const storeId = searchParams.get('store_id');
    if (!storeId) return NextResponse.json({ error: 'store_id is required' }, { status: 400 });

    const db = getSupabase();
    const storeInternalId = await resolveStoreId(db, storeId);
    if (!storeInternalId) return NextResponse.json({ error: 'Store not found' }, { status: 404 });

    const { data: store } = await db
      .from('merchant_stores')
      .select('operational_status, is_accepting_orders, timezone')
      .eq('id', storeInternalId)
      .single();

    const { data: avail } = await db
      .from('merchant_store_availability')
      .select('manual_close_until, auto_open_from_schedule, block_auto_open, restriction_type, last_toggled_by_email, last_toggled_by_name, last_toggled_by_id, last_toggle_type, last_toggled_at')
      .eq('store_id', storeInternalId)
      .single();

    const now = new Date();
    let effectiveStatus = (store?.operational_status as string) || 'CLOSED';
    let manualCloseUntil = avail?.manual_close_until ? new Date(avail.manual_close_until) : null;
    const blockAutoOpen = avail?.block_auto_open === true;

    const { data: oh } = await db
      .from('merchant_store_operating_hours')
      .select('*')
      .eq('store_id', storeInternalId)
      .single();

    const storeTz = (store as { timezone?: string } | null)?.timezone || 'Asia/Kolkata';
    const withinHours = oh
      ? isWithinOperatingHours(oh as Record<string, unknown>, now, storeTz)
      : false;

    // Strict: do NOT auto-open when block_auto_open (Until I manually turn it ON)
    // Also check if today is a closed day - if so, don't auto-open
    const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const { dayIndex: currentDayIndex } = getStoreLocalTime(now, storeTz);
    const currentDay = dayNames[currentDayIndex];
    const closedDays = oh?.closed_days as string[] | null;
    const isTodayClosed = closedDays && Array.isArray(closedDays) && closedDays.includes(currentDay);
    
    // Re-fetch store status to avoid overwriting a concurrent manual open (which would show "Auto on" instead of "Opened by X")
    let availFinal = avail;
    if (!blockAutoOpen && !manualCloseUntil && !isTodayClosed && effectiveStatus === 'CLOSED' && (avail?.auto_open_from_schedule !== false) && withinHours) {
      const { data: storeRecheck } = await db.from('merchant_stores').select('operational_status').eq('id', storeInternalId).single();
      if ((storeRecheck?.operational_status as string) === 'OPEN') {
        effectiveStatus = 'OPEN';
        const { data: availRecheck } = await db.from('merchant_store_availability').select('manual_close_until, auto_open_from_schedule, block_auto_open, restriction_type, last_toggled_by_email, last_toggled_by_name, last_toggled_by_id, last_toggle_type, last_toggled_at').eq('store_id', storeInternalId).single();
        if (availRecheck) availFinal = availRecheck;
      } else {
        await db.from('merchant_stores').update({
          operational_status: 'OPEN',
          is_accepting_orders: true,
        }).eq('id', storeInternalId);
        await db.from('merchant_store_availability').update({
          is_available: true,
          is_accepting_orders: true,
          last_toggle_type: 'AUTO_OPEN',
          last_toggled_at: now.toISOString(),
        }).eq('store_id', storeInternalId);
        effectiveStatus = 'OPEN';
      }
    }

    if (manualCloseUntil && now >= manualCloseUntil) {
      const autoOpen = !blockAutoOpen && (avail?.auto_open_from_schedule !== false);
      if (autoOpen) {
        if (oh && isWithinOperatingHours(oh as Record<string, unknown>, now, storeTz)) {
          await db.from('merchant_stores').update({
            operational_status: 'OPEN',
            is_accepting_orders: true,
          }).eq('id', storeInternalId);
          await db.from('merchant_store_availability').update({
            manual_close_until: null,
            restriction_type: null,
            is_available: true,
            is_accepting_orders: true,
            last_toggle_type: 'AUTO_OPEN',
            last_toggled_at: now.toISOString(),
          }).eq('store_id', storeInternalId);
          effectiveStatus = 'OPEN';
          manualCloseUntil = null;
        } else {
          await db.from('merchant_store_availability').update({ manual_close_until: null, restriction_type: null }).eq('store_id', storeInternalId);
          manualCloseUntil = null;
          effectiveStatus = (store?.operational_status as string) || 'CLOSED';
        }
      } else {
        await db.from('merchant_store_availability').update({ manual_close_until: null }).eq('store_id', storeInternalId);
        manualCloseUntil = null;
      }
    }

    // Auto-close when store is OPEN but outside operating hours (respects schedule)
    if (
      !manualCloseUntil &&
      effectiveStatus === 'OPEN' &&
      (avail?.auto_open_from_schedule !== false) &&
      oh &&
      !withinHours
    ) {
      await db
        .from('merchant_stores')
        .update({ operational_status: 'CLOSED', is_accepting_orders: false })
        .eq('id', storeInternalId);
      await db
        .from('merchant_store_availability')
        .update({
          is_available: false,
          is_accepting_orders: false,
          last_toggle_type: 'AUTO_CLOSE',
          last_toggled_at: now.toISOString(),
        })
        .eq('store_id', storeInternalId);
      effectiveStatus = 'CLOSED';
    }

    const { today_date, today_slots } = getTodaySlots(oh as Record<string, unknown> | null, storeTz);

    // Check if today is a scheduled closed day (reuse closedDays from above)
    const dayNamesCheck = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const { dayIndex: currentDayIndexCheck } = getStoreLocalTime(now, storeTz);
    const currentDayCheck = dayNamesCheck[currentDayIndexCheck];
    const closedDaysCheck = oh?.closed_days as string[] | null;
    const isTodayScheduledClosed = closedDaysCheck && Array.isArray(closedDaysCheck) && closedDaysCheck.includes(currentDayCheck);
    
    // Also check if today's _open flag is false
    const isTodayOpenFlagFalse = oh && oh[`${currentDayCheck}_open`] !== true;
    const isTodayClosedBySchedule = isTodayScheduledClosed || isTodayOpenFlagFalse;

    const nowAfterLogic = new Date();
    // If today is scheduled closed, don't show opens_at - show null to indicate scheduled closure
    const opens_at: string | null =
      effectiveStatus === 'CLOSED'
        ? (isTodayClosedBySchedule 
            ? null // Scheduled closed - no auto-open countdown
            : (manualCloseUntil 
                ? manualCloseUntil.toISOString() 
                : getNextOpenAt(oh as Record<string, unknown> | null, storeTz, nowAfterLogic)))
        : null;

    const withinHoursButRestricted = withinHours && effectiveStatus === 'CLOSED' && (blockAutoOpen || manualCloseUntil);

    return NextResponse.json({
      operational_status: effectiveStatus,
      is_accepting_orders: effectiveStatus === 'OPEN',
      manual_close_until: manualCloseUntil ? manualCloseUntil.toISOString() : null,
      opens_at,
      auto_open_from_schedule: availFinal?.auto_open_from_schedule ?? avail?.auto_open_from_schedule ?? true,
      block_auto_open: blockAutoOpen,
      restriction_type: availFinal?.restriction_type ?? avail?.restriction_type ?? null,
      today_date,
      today_slots,
      is_today_scheduled_closed: isTodayClosedBySchedule, // New field: indicates if today is a scheduled closed day
      last_toggled_by_email: availFinal?.last_toggled_by_email ?? null,
      last_toggled_by_name: availFinal?.last_toggled_by_name ?? null,
      last_toggled_by_id: availFinal?.last_toggled_by_id ?? null,
      last_toggle_type: availFinal?.last_toggle_type ?? null,
      last_toggled_at: availFinal?.last_toggled_at ?? null,
      within_hours_but_restricted: withinHoursButRestricted,
    });
  } catch (err) {
    console.error('[store-operations GET]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/** Get tomorrow's first slot start (Date) for store timezone from operating_hours */
function getTomorrowFirstSlotStart(oh: Record<string, unknown> | null, storeTz: string, from: Date): Date | null {
  if (!oh) return null;
  const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const { dayIndex } = getStoreLocalTime(from, storeTz);
  const nextDay = (dayIndex + 1) % 7;
  const day = dayNames[nextDay];
  if (oh[`${day}_open`] !== true) return null;
  const s1 = oh[`${day}_slot1_start`] as string | null;
  if (!s1) return null;
  const [h, m] = s1.split(':').map(Number);
  const d = new Date(from);
  d.setDate(d.getDate() + 1);
  d.setHours(h ?? 0, m ?? 0, 0, 0);
  return d;
}

/**
 * POST /api/store-operations
 * Body: { store_id, action: 'manual_close' | 'manual_open', closure_type?: 'temporary'|'today'|'manual_hold', duration_minutes?: number }
 * - manual_open: clears all restrictions and sets OPEN; logs to merchant_store_status_log.
 * - manual_close: closure_type 'temporary' (until time), 'today' (reopen tomorrow), 'manual_hold' (until I manually turn it ON).
 * Records who toggled and inserts into merchant_store_status_log.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const storeId = body.store_id;
    const action = body.action;
    const closureType = body.closure_type as string | undefined;
    const durationMinutes = body.duration_minutes;
    const closeReason = typeof body.close_reason === 'string' ? body.close_reason.trim() || null : null;

    if (!storeId || !action) {
      return NextResponse.json({ error: 'store_id and action are required' }, { status: 400 });
    }

    let toggledByEmail: string | null = null;
    let toggledByName: string | null = null;
    let toggledById: string | null = storeId;
    try {
      const supabaseServer = await createServerSupabaseClient();
      const { data: { user } } = await supabaseServer.auth.getUser();
      toggledByEmail = user?.email ?? user?.phone ?? null;
      toggledByName = (user?.user_metadata?.name as string) || (user?.user_metadata?.full_name as string) || toggledByEmail || 'Store Owner';
      toggledById = user?.id ?? toggledByEmail ?? storeId;
    } catch {
      toggledByName = 'Store Owner';
    }

    const db = getSupabase();
    const storeInternalId = await resolveStoreId(db, storeId);
    if (!storeInternalId) return NextResponse.json({ error: 'Store not found' }, { status: 404 });

    await ensureAvailabilityRow(db, storeInternalId);

    // Get current availability state for reference
    const { data: avail } = await db
      .from('merchant_store_availability')
      .select('*')
      .eq('store_id', storeInternalId)
      .single();

    const now = new Date();
    const activityPayload = {
      last_toggled_by_email: toggledByEmail,
      last_toggled_by_name: toggledByName,
      last_toggled_by_id: toggledById,
      last_toggle_type: 'MERCHANT',
      last_toggled_at: now.toISOString(),
    };

    const insertStatusLog = async (act: string, restriction: string | null, reason: string | null = null) => {
      await db.from('merchant_store_status_log').insert({
        store_id: storeInternalId,
        action: act,
        restriction_type: restriction,
        close_reason: reason,
        performed_by_id: toggledById,
        performed_by_email: toggledByEmail,
        performed_by_name: toggledByName,
      });
    };

    if (action === 'update_manual_lock') {
      // Update manual activation lock (block_auto_open)
      const blockAutoOpen = body.block_auto_open === true;
      
      await db.from('merchant_store_availability').update({
        block_auto_open: blockAutoOpen,
        restriction_type: blockAutoOpen ? 'MANUAL_HOLD' : (avail?.restriction_type === 'MANUAL_HOLD' ? null : avail?.restriction_type || null),
        ...activityPayload,
      }).eq('store_id', storeInternalId);
      
      // Log the action
      await insertStatusLog(blockAutoOpen ? 'MANUAL_LOCK_ENABLED' : 'MANUAL_LOCK_DISABLED', blockAutoOpen ? 'MANUAL_HOLD' : null);
      
      return NextResponse.json({
        success: true,
        block_auto_open: blockAutoOpen,
      });
    }

    if (action === 'manual_open') {
      await db.from('merchant_stores').update({
        operational_status: 'OPEN',
        is_accepting_orders: true,
      }).eq('id', storeInternalId);
      await db.from('merchant_store_availability').update({
        manual_close_until: null,
        block_auto_open: false,
        restriction_type: null,
        is_available: true,
        is_accepting_orders: true,
        ...activityPayload,
      }).eq('store_id', storeInternalId);
      await insertStatusLog('OPEN', null);
      return NextResponse.json({
        success: true,
        operational_status: 'OPEN',
        manual_close_until: null,
        restriction_type: null,
      });
    }

    if (action === 'manual_close') {
      const type = closureType === 'manual_hold' ? 'manual_hold' : closureType === 'today' ? 'today' : 'temporary';

      let manualCloseUntil: Date | null = null;
      let restrictionType: string | null = null;
      let blockAutoOpen = false;

      if (type === 'manual_hold') {
        blockAutoOpen = true;
        restrictionType = 'MANUAL_HOLD';
      } else if (type === 'today') {
        const { data: oh } = await db.from('merchant_store_operating_hours').select('*').eq('store_id', storeInternalId).single();
        const storeTz = 'Asia/Kolkata';
        manualCloseUntil = getTomorrowFirstSlotStart(oh as Record<string, unknown> | null, storeTz, now);
        if (!manualCloseUntil) manualCloseUntil = new Date(now.getTime() + 24 * 60 * 60 * 1000);
        restrictionType = 'CLOSED_TODAY';
      } else {
        const mins = typeof durationMinutes === 'number' ? durationMinutes : parseInt(String(durationMinutes || 30), 10);
        if (mins < 1 || mins > 1440) {
          return NextResponse.json({ error: 'duration_minutes must be between 1 and 1440' }, { status: 400 });
        }
        manualCloseUntil = new Date(now.getTime() + mins * 60 * 1000);
        restrictionType = 'TEMPORARY';
      }

      await db.from('merchant_stores').update({
        operational_status: 'CLOSED',
        is_accepting_orders: false,
      }).eq('id', storeInternalId);
      await db.from('merchant_store_availability').update({
        manual_close_until: manualCloseUntil ? manualCloseUntil.toISOString() : null,
        block_auto_open: blockAutoOpen,
        restriction_type: restrictionType,
        is_available: false,
        is_accepting_orders: false,
        ...activityPayload,
      }).eq('store_id', storeInternalId);
      await insertStatusLog('CLOSED', restrictionType, closeReason);

      return NextResponse.json({
        success: true,
        operational_status: 'CLOSED',
        manual_close_until: manualCloseUntil ? manualCloseUntil.toISOString() : null,
        restriction_type: restrictionType,
        block_auto_open: blockAutoOpen,
        reopens_at: manualCloseUntil ? manualCloseUntil.toISOString() : null,
      });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (err) {
    console.error('[store-operations POST]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
