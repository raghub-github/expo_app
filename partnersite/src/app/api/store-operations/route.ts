import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import {
  getNextOpenDayStartIso,
  getNextOpenIso,
  getNextOpenIsoAfterIstCalendarDay,
  isLikelyLegacyEndOfDayIstClose,
  nowInStoreTz,
  utcInstantFromWallClock,
} from '@/lib/merchantStoreNextOpenIso';
import { normalizeWallTimeToHHMM } from '@/lib/wallTimeHHMM';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

/** Set `STORE_OPERATIONS_DEBUG=1` in `.env.local` to print decision traces (server terminal). */
function storeOpsDebugEnabled(): boolean {
  const v = process.env.STORE_OPERATIONS_DEBUG;
  return v === '1' || v === 'true' || v === 'yes';
}

function storeOpsDebugLog(phase: string, payload: Record<string, unknown>): void {
  if (!storeOpsDebugEnabled()) return;
  try {
    console.log(`[store-operations] ${phase}`, JSON.stringify(payload));
  } catch {
    console.log(`[store-operations] ${phase}`, payload);
  }
}

function getSupabase() {
  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/** Align merchant_stores booleans when store goes online vs offline (same rule as Fastify merchant-partner API). */
function merchantStoresOnlineFlags(online: boolean): {
  is_active: boolean;
  is_available: boolean;
  is_accepting_orders: boolean;
} {
  return { is_active: online, is_available: online, is_accepting_orders: online };
}

type MerchantStoreGateRow = {
  operational_status?: string | null;
  is_active?: boolean | null;
  is_accepting_orders?: boolean | null;
  is_available?: boolean | null;
  approval_status?: string | null;
  deleted_at?: string | null;
  delisted_at?: string | null;
};

/** Dashboard parity: a store is only OPEN when approval + triple flags + operational OPEN, and not deleted/delisted. */
function effectiveOpenFromMerchantStoreRow(storeRow: MerchantStoreGateRow | null | undefined): 'OPEN' | 'CLOSED' {
  if (!storeRow) return 'CLOSED';
  const approval = String(storeRow.approval_status || '').toUpperCase();
  const rawOperational = String(storeRow.operational_status || 'CLOSED').toUpperCase();
  const isDelisted = approval === 'DELISTED';
  const ok =
    !isDelisted &&
    approval === 'APPROVED' &&
    storeRow.is_active === true &&
    storeRow.is_accepting_orders === true &&
    storeRow.is_available === true &&
    rawOperational === 'OPEN' &&
    !storeRow.deleted_at &&
    !storeRow.delisted_at;
  return ok ? 'OPEN' : 'CLOSED';
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

  const closedDays = oh?.closed_days as string[] | null;
  if (
    closedDays &&
    Array.isArray(closedDays) &&
    closedDays.some((d) => String(d).trim().toLowerCase() === dayStr)
  ) {
    return { today_date, today_slots: slots };
  }

  if (!oh || oh[`${dayStr}_open`] !== true) {
    return { today_date, today_slots: slots };
  }
  if (oh.is_24_hours === true) {
    return { today_date, today_slots: [{ start: '00:00', end: '23:59' }] };
  }
  const s1Start = normalizeWallTimeToHHMM(oh[`${dayStr}_slot1_start`]);
  const s1End = normalizeWallTimeToHHMM(oh[`${dayStr}_slot1_end`]);
  const s2Start = normalizeWallTimeToHHMM(oh[`${dayStr}_slot2_start`]);
  const s2End = normalizeWallTimeToHHMM(oh[`${dayStr}_slot2_end`]);
  const validPair = (a: string | null, b: string | null) =>
    a != null &&
    b != null &&
    !(a === '00:00' && b === '00:00') &&
    (() => {
      const [ha, ma] = a.split(':').map(Number);
      const [hb, mb] = b.split(':').map(Number);
      return hb * 60 + mb > ha * 60 + ma;
    })();
  if (validPair(s1Start, s1End) && s1Start != null && s1End != null) slots.push({ start: s1Start, end: s1End });
  if (validPair(s2Start, s2End) && s2Start != null && s2End != null) slots.push({ start: s2Start, end: s2End });
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

function wallClockMinutes(hhmm: string | null): number | null {
  if (!hhmm) return null;
  const [h, m] = hhmm.split(':').map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  return (h ?? 0) * 60 + (m ?? 0);
}

/** True when the day is configured to actually run (24h, or at least one valid non-placeholder slot). */
function hasValidOperatingSlotsForDay(oh: Record<string, unknown>, day: string): boolean {
  if (oh.is_24_hours === true) return oh[`${day}_open`] === true;
  const closedDays = (oh.closed_days as string[] | null) ?? [];
  if (closedDays.some((d) => String(d).trim().toLowerCase() === day)) return false;
  if (oh[`${day}_open`] !== true) return false;
  const g = (k: string) => normalizeWallTimeToHHMM(oh[k]);
  const s1s = g(`${day}_slot1_start`);
  const s1e = g(`${day}_slot1_end`);
  const s2s = g(`${day}_slot2_start`);
  const s2e = g(`${day}_slot2_end`);
  const pairOk = (a: string | null, b: string | null) => {
    if (a == null || b == null) return false;
    if (a === '00:00' && b === '00:00') return false;
    const sa = wallClockMinutes(a);
    const eb = wallClockMinutes(b);
    return sa != null && eb != null && eb > sa;
  };
  const slot1 = pairOk(s1s, s1e);
  const slot2 = pairOk(s2s, s2e);
  if (!slot1 && !slot2) return false;
  if (slot1 && slot2 && s1e && s2s) {
    const e1 = wallClockMinutes(s1e);
    const s2 = wallClockMinutes(s2s);
    if (e1 != null && s2 != null && s2 <= e1) return false;
  }
  return true;
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
  if (closedDays && Array.isArray(closedDays) && closedDays.some((d) => String(d).trim().toLowerCase() === day)) {
    return false;
  }

  const isOpen = oh[`${day}_open`] === true;
  if (!isOpen) return false;
  if (oh.is_24_hours === true) return true;

  const slot1Start = normalizeWallTimeToHHMM(oh[`${day}_slot1_start`]);
  const slot1End = normalizeWallTimeToHHMM(oh[`${day}_slot1_end`]);
  const slot2Start = normalizeWallTimeToHHMM(oh[`${day}_slot2_start`]);
  const slot2End = normalizeWallTimeToHHMM(oh[`${day}_slot2_end`]);

  const timeToMinutes = (t: string) => {
    const [h, m] = t.split(':').map(Number);
    return (h ?? 0) * 60 + (m ?? 0);
  };
  const inSlot = (start: string, end: string) => {
    const s = timeToMinutes(start);
    let e = timeToMinutes(end);
    if (e <= s) {
      e += 24 * 60;
      const nm = nowMinutes < s ? nowMinutes + 24 * 60 : nowMinutes;
      return nm >= s && nm <= e;
    }
    return nowMinutes >= s && nowMinutes <= e;
  };

  if (slot1Start && slot1End && inSlot(slot1Start, slot1End)) return true;
  if (slot2Start && slot2End && inSlot(slot2Start, slot2End)) return true;
  return false;
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

/** Same as merchant app MerchantHeader “Close for today” — end of calendar day in Asia/Kolkata. */
function endOfTodayIst(): Date {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const parts = formatter.formatToParts(new Date());
  const y = parts.find((p) => p.type === 'year')?.value ?? '';
  const m = parts.find((p) => p.type === 'month')?.value ?? '';
  const d = parts.find((p) => p.type === 'day')?.value ?? '';
  const end = new Date(`${y}-${m}-${d}T23:59:59+05:30`);
  return Number.isNaN(end.getTime()) ? new Date() : end;
}

/** End of the store’s local calendar day as UTC (for “close for today” when no next slot exists). */
function endOfCalendarDayInStoreTimeZone(now: Date, timeZone: string): string {
  const tz = timeZone || 'Asia/Kolkata';
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const y = parts.find((p) => p.type === 'year')?.value ?? '';
  const mo = (parts.find((p) => p.type === 'month')?.value ?? '1').padStart(2, '0');
  const da = (parts.find((p) => p.type === 'day')?.value ?? '1').padStart(2, '0');
  const ymd = `${y}-${mo}-${da}`;
  const inst = utcInstantFromWallClock(ymd, '23:59:59', tz);
  return (inst ?? endOfTodayIst()).toISOString();
}

/**
 * Backend PATCH stores restriction_type `manual` + unavailable_reason; partner UI still expects
 * TEMPORARY | CLOSED_TODAY | MANUAL_HOLD for labels — derive from until + IST end-of-day.
 */
function deriveDisplayRestrictionType(args: {
  restriction_type: string | null | undefined;
  unavailable_reason: string | null | undefined;
  manual_close_until: string | null | undefined;
}): string | null {
  const raw = args.restriction_type ?? null;
  const unavail = args.unavailable_reason ?? null;
  const isManualClose =
    raw === 'manual' || unavail === 'manual_close' || unavail === 'manual_indefinite';
  if (!isManualClose) return raw;

  const untilRaw = args.manual_close_until;
  if (!untilRaw) return 'MANUAL_HOLD';

  const until = new Date(String(untilRaw).trim().replace(' ', 'T'));
  if (Number.isNaN(until.getTime())) return 'TEMPORARY';

  const endToday = endOfTodayIst();
  if (Math.abs(until.getTime() - endToday.getTime()) <= 120_000) return 'CLOSED_TODAY';
  return 'TEMPORARY';
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

    const includeDebugBody = storeOpsDebugEnabled() && searchParams.get('debug') === '1';
    const debugTrace: Record<string, unknown>[] = [];

    const db = getSupabase();
    const storeInternalId = await resolveStoreId(db, storeId);
    if (!storeInternalId) return NextResponse.json({ error: 'Store not found' }, { status: 404 });

    const trace = (step: string, payload: Record<string, unknown>) => {
      if (!storeOpsDebugEnabled()) return;
      const row = { step, storeId, internalId: storeInternalId, ...payload };
      debugTrace.push(row);
      storeOpsDebugLog(`GET:${step}`, row);
    };

    const { data: store } = await db
      .from('merchant_stores')
      .select(
        'operational_status, is_active, is_accepting_orders, is_available, approval_status, deleted_at, delisted_at, timezone'
      )
      .eq('id', storeInternalId)
      .single();

    const { data: avail } = await db
      .from('merchant_store_availability')
      .select(
        'manual_close_until, close_reason, auto_open_from_schedule, block_auto_open, restriction_type, unavailable_reason, last_toggled_by_email, last_toggled_by_name, last_toggled_by_id, last_toggle_type, last_toggled_at'
      )
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

    // If today's schedule marks the outlet closed, it must not be treated as online.
    // This covers both `closed_days` and per-day `<day>_open = false`.
    const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const { dayIndex: currentDayIndex } = getStoreLocalTime(now, storeTz);
    const currentDay = dayNames[currentDayIndex];
    const closedDaysRaw = (oh?.closed_days as string[] | null) ?? null;
    const closedDaysNorm = Array.isArray(closedDaysRaw)
      ? closedDaysRaw.map((d) => String(d).trim().toLowerCase()).filter(Boolean)
      : [];
    const dayOpenFlag = !!oh && (oh as any)[`${currentDay}_open`] === true;
    const isTodayScheduledClosed =
      !!oh &&
      (closedDaysNorm.includes(String(currentDay).toLowerCase()) ||
        !dayOpenFlag ||
        (dayOpenFlag && !hasValidOperatingSlotsForDay(oh as Record<string, unknown>, currentDay)));

    trace('initial_read', {
      db_operational_status: store?.operational_status ?? null,
      db_is_accepting_orders: store?.is_accepting_orders ?? null,
      manual_close_until: manualCloseUntil ? manualCloseUntil.toISOString() : null,
      block_auto_open: blockAutoOpen,
      auto_open_from_schedule: avail?.auto_open_from_schedule ?? null,
      last_toggle_type: avail?.last_toggle_type ?? null,
      last_toggled_at: avail?.last_toggled_at ?? null,
      within_hours: withinHours,
      has_operating_hours_row: !!oh,
      store_timezone: storeTz,
      is_today_scheduled_closed: isTodayScheduledClosed,
    });

    // Strict: do NOT auto-open when block_auto_open (Until I manually turn it ON)
    // Also check if today is a closed day - if so, don't auto-open
    const isTodayClosed = isTodayScheduledClosed;
    
    // Re-fetch store status to avoid overwriting a concurrent manual open (which would show "Auto on" instead of "Opened by X")
    const scheduleAutoOpenBranchEntered =
      !blockAutoOpen &&
      !manualCloseUntil &&
      !isTodayClosed &&
      effectiveStatus === 'CLOSED' &&
      (avail?.auto_open_from_schedule !== false) &&
      withinHours;
    let availFinal = avail;
    if (scheduleAutoOpenBranchEntered) {
      const { data: storeRecheck } = await db.from('merchant_stores').select('operational_status').eq('id', storeInternalId).single();
      if ((storeRecheck?.operational_status as string) === 'OPEN') {
        effectiveStatus = 'OPEN';
        const { data: availRecheck } = await db
          .from('merchant_store_availability')
          .select(
            'manual_close_until, close_reason, auto_open_from_schedule, block_auto_open, restriction_type, unavailable_reason, last_toggled_by_email, last_toggled_by_name, last_toggled_by_id, last_toggle_type, last_toggled_at'
          )
          .eq('store_id', storeInternalId)
          .single();
        if (availRecheck) availFinal = availRecheck;
      } else {
        await db.from('merchant_stores').update({
          operational_status: 'OPEN',
          ...merchantStoresOnlineFlags(true),
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

    trace('after_schedule_auto_open_branch', {
      effective_status: effectiveStatus,
      schedule_auto_open_branch_entered: scheduleAutoOpenBranchEntered,
      is_today_closed_day: !!isTodayClosed,
    });

    if (manualCloseUntil && now >= manualCloseUntil) {
      const autoOpen = !blockAutoOpen && (avail?.auto_open_from_schedule !== false);
      if (autoOpen) {
        if (oh && isWithinOperatingHours(oh as Record<string, unknown>, now, storeTz)) {
          await db.from('merchant_stores').update({
            operational_status: 'OPEN',
            ...merchantStoresOnlineFlags(true),
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
          const { data: storeAfterExpiry } = await db
            .from('merchant_stores')
            .select(
              'operational_status, is_active, is_accepting_orders, is_available, approval_status, deleted_at, delisted_at'
            )
            .eq('id', storeInternalId)
            .single();
          effectiveStatus = effectiveOpenFromMerchantStoreRow(storeAfterExpiry as MerchantStoreGateRow);
        }
      } else {
        await db.from('merchant_store_availability').update({ manual_close_until: null }).eq('store_id', storeInternalId);
        manualCloseUntil = null;
      }
    }

    trace('after_manual_close_until_expiry_branch', {
      effective_status: effectiveStatus,
      manual_close_until: manualCloseUntil ? manualCloseUntil.toISOString() : null,
    });

    const availForSchedule = availFinal ?? avail;

    // Auto-close when store is OPEN but outside operating hours (respects schedule).
    // No "recent manual open" bypass — manual open is rejected unless already within hours.
    let outsideHoursAutoCloseApplied = false;
    if (
      !manualCloseUntil &&
      effectiveStatus === 'OPEN' &&
      (availForSchedule?.auto_open_from_schedule !== false) &&
      oh &&
      !withinHours
    ) {
      await db
        .from('merchant_stores')
        .update({ operational_status: 'CLOSED', ...merchantStoresOnlineFlags(false) })
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
      outsideHoursAutoCloseApplied = true;
    }

    trace('after_outside_hours_auto_close', {
      applied: outsideHoursAutoCloseApplied,
      effective_status: effectiveStatus,
    });

    // Hard rule: if today is scheduled closed, force store CLOSED (even if DB still says OPEN).
    // This prevents "Online" while the schedule says closed.
    if (isTodayScheduledClosed && effectiveStatus === 'OPEN' && !manualCloseUntil) {
      await db
        .from('merchant_stores')
        .update({ operational_status: 'CLOSED', ...merchantStoresOnlineFlags(false) })
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
      trace('after_scheduled_closed_force', { applied: true, effective_status: effectiveStatus });
    } else {
      trace('after_scheduled_closed_force', { applied: false, effective_status: effectiveStatus });
    }

    const { today_date, today_slots } = getTodaySlots(oh as Record<string, unknown> | null, storeTz);
    const isTodayClosedBySchedule = isTodayScheduledClosed;

    const nowAfterLogic = new Date();
    const ohRecord = (oh ?? null) as Record<string, unknown> | null;
    const { dayOfWeek, minutesSinceMidnight } = nowInStoreTz(storeTz);
    const nextOpenIso =
      ohRecord && Object.keys(ohRecord).length > 0
        ? getNextOpenIso(ohRecord, dayOfWeek, minutesSinceMidnight, nowAfterLogic, storeTz) ??
          getNextOpenDayStartIso(ohRecord, dayOfWeek, nowAfterLogic, storeTz)
        : null;
    const nextOpenIsoAfterToday =
      ohRecord && Object.keys(ohRecord).length > 0
        ? getNextOpenIsoAfterIstCalendarDay(ohRecord, dayOfWeek, nowAfterLogic, storeTz) ??
          getNextOpenDayStartIso(ohRecord, dayOfWeek, nowAfterLogic, storeTz)
        : null;

    const { data: storeGated } = await db
      .from('merchant_stores')
      .select(
        'operational_status, is_active, is_accepting_orders, is_available, approval_status, deleted_at, delisted_at'
      )
      .eq('id', storeInternalId)
      .single();
    const displayOperational = effectiveOpenFromMerchantStoreRow(storeGated as MerchantStoreGateRow);

    const rawAvail = availFinal ?? avail;
    const unavailNorm =
      rawAvail?.unavailable_reason != null ? String(rawAvail.unavailable_reason).trim().toLowerCase() : '';

    const manualIso = manualCloseUntil ? manualCloseUntil.toISOString() : null;
    let opens_at: string | null =
      displayOperational === 'CLOSED'
        ? manualIso
          ? isLikelyLegacyEndOfDayIstClose(manualIso, nowAfterLogic, storeTz)
            ? (nextOpenIsoAfterToday ?? nextOpenIso ?? manualIso)
            : manualIso
          : nextOpenIso
        : null;

    if (displayOperational === 'CLOSED') {
      if (blockAutoOpen) {
        opens_at = null;
      } else if (!manualIso && unavailNorm === 'manual_indefinite') {
        opens_at = null;
      }
    }

    // UI flag: within-hours but held OFF without a countdown target (manual lock / manual indefinite).
    // TEMP close (manual_close_until future) must still show countdown.
    const withinHoursButRestricted =
      withinHours && displayOperational === 'CLOSED' && (blockAutoOpen || unavailNorm === 'manual_indefinite');
    const displayRestriction = deriveDisplayRestrictionType({
      restriction_type: rawAvail?.restriction_type as string | null | undefined,
      unavailable_reason: rawAvail?.unavailable_reason as string | null | undefined,
      manual_close_until: manualCloseUntil ? manualCloseUntil.toISOString() : null,
    });

    const responseBody: Record<string, unknown> = {
      operational_status: displayOperational,
      approval_status: (storeGated as MerchantStoreGateRow | null)?.approval_status ?? null,
      is_active: (storeGated as MerchantStoreGateRow | null)?.is_active ?? null,
      is_accepting_orders: displayOperational === 'OPEN',
      is_available: (storeGated as MerchantStoreGateRow | null)?.is_available ?? null,
      manual_close_until: manualCloseUntil ? manualCloseUntil.toISOString() : null,
      close_reason: (rawAvail?.close_reason as string | null | undefined) ?? null,
      opens_at,
      auto_open_from_schedule: availFinal?.auto_open_from_schedule ?? avail?.auto_open_from_schedule ?? true,
      block_auto_open: blockAutoOpen,
      restriction_type: displayRestriction,
      today_date,
      today_slots,
      is_today_scheduled_closed: isTodayClosedBySchedule,
      /** True when current time in the store's timezone falls inside a configured slot (or 24h). */
      within_operating_hours: withinHours,
      last_toggled_by_email: availFinal?.last_toggled_by_email ?? null,
      last_toggled_by_name: availFinal?.last_toggled_by_name ?? null,
      last_toggled_by_id: availFinal?.last_toggled_by_id ?? null,
      last_toggle_type: availFinal?.last_toggle_type ?? null,
      last_toggled_at: availFinal?.last_toggled_at ?? null,
      within_hours_but_restricted: withinHoursButRestricted,
    };

    if (includeDebugBody) {
      responseBody._store_ops_debug = {
        hint: 'Server: STORE_OPERATIONS_DEBUG=1 in .env.local; add &debug=1 to this URL.',
        trace: debugTrace,
      };
    }

    return NextResponse.json(responseBody);
  } catch (err) {
    console.error('[store-operations GET]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * POST /api/store-operations
 * Body: { store_id, action, closure_type?, duration_minutes?, manual_close_until?, close_reason? }
 * - manual_open: same as mobile PATCH /merchant-partner/stores/:id/status (is_open true): holidays from today, scheduled closures completed, availability + notification.
 * - manual_close: same as mobile — unavailable_reason manual_close | manual_indefinite, restriction_type `manual`, optional manual_close_until ISO; `today` = next scheduled open (IST), aligned with backend schedule engine.
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

    const nowIso = now.toISOString();

    if (action === 'update_auto_open_schedule') {
      const autoOpen = body.auto_open_from_schedule !== false;
      await db.from('merchant_store_availability').update({
        auto_open_from_schedule: autoOpen,
        ...activityPayload,
      }).eq('store_id', storeInternalId);
      await insertStatusLog(
        autoOpen ? 'AUTO_OPEN_FROM_SCHEDULE_ENABLED' : 'AUTO_OPEN_FROM_SCHEDULE_DISABLED',
        null
      );
      return NextResponse.json({
        success: true,
        auto_open_from_schedule: autoOpen,
      });
    }

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
      const { data: storeForOpen } = await db
        .from('merchant_stores')
        .select('timezone')
        .eq('id', storeInternalId)
        .single();
      const openStoreTz = (storeForOpen as { timezone?: string } | null)?.timezone || 'Asia/Kolkata';
      const { data: ohOpen } = await db
        .from('merchant_store_operating_hours')
        .select('*')
        .eq('store_id', storeInternalId)
        .maybeSingle();
      if (ohOpen) {
        const withinForOpen = isWithinOperatingHours(ohOpen as Record<string, unknown>, now, openStoreTz);
        if (!withinForOpen) {
          return NextResponse.json(
            {
              error:
                'Cannot open: you are outside today’s operating slots, or today is scheduled closed. Adjust Outlet Timings or wait until an active slot.',
              code: 'OUTSIDE_OPERATING_HOURS',
            },
            { status: 400 }
          );
        }
      }

      const hadScheduledClosure =
        avail?.manual_close_until != null && String(avail.manual_close_until).trim() !== '';

      storeOpsDebugLog('POST:manual_open:start', {
        storeId,
        storeInternalId,
        hadScheduledClosure,
        prior_restriction_type: avail?.restriction_type ?? null,
        toggledById,
      });

      if (hadScheduledClosure) {
        const todayStr = new Date().toISOString().slice(0, 10);
        const { error: holErr } = await db
          .from('merchant_store_holidays')
          .delete()
          .eq('store_id', storeInternalId)
          .gte('holiday_date', todayStr);
        if (holErr) {
          console.error('[store-operations] manual_open holidays delete', holErr);
          storeOpsDebugLog('POST:manual_open:holidays_delete_error', { message: holErr.message, code: holErr.code });
        }
      }

      const { error: schedErr } = await db
        .from('merchant_store_scheduled_closures')
        .update({ status: 'completed', updated_at: nowIso })
        .eq('store_id', storeInternalId)
        .in('status', ['scheduled', 'active']);
      if (schedErr) {
        console.error('[store-operations] manual_open scheduled_closures update', schedErr);
        storeOpsDebugLog('POST:manual_open:scheduled_closures_error', { message: schedErr.message, code: schedErr.code });
      }

      const { error: storeUpErr } = await db
        .from('merchant_stores')
        .update({
          operational_status: 'OPEN',
          ...merchantStoresOnlineFlags(true),
        })
        .eq('id', storeInternalId);
      if (storeUpErr) {
        console.error('[store-operations] manual_open merchant_stores update failed', storeUpErr);
        storeOpsDebugLog('POST:manual_open:merchant_stores_error', { message: storeUpErr.message, code: storeUpErr.code });
        return NextResponse.json(
          {
            error: 'Could not open store (merchant_stores)',
            details: storeOpsDebugEnabled() ? storeUpErr.message : undefined,
          },
          { status: 500 }
        );
      }

      const logRestrictionBefore = (avail?.restriction_type as string | null) ?? null;
      const { error: availUpErr } = await db
        .from('merchant_store_availability')
        .update({
          is_available: true,
          is_accepting_orders: true,
          unavailable_reason: null,
          close_reason: null,
          auto_unavailable_at: null,
          auto_available_at: nowIso,
          manual_close_until: null,
          // When opening manually, always clear manual activation lock so merchant isn't stuck.
          block_auto_open: false,
          last_toggle_type: 'MANUAL_OPEN',
          restriction_type: null,
          updated_by: toggledByEmail ?? 'Store owner',
          last_toggled_by_email: toggledByEmail,
          last_toggled_by_name: toggledByName,
          last_toggled_by_id: toggledById,
          last_toggled_at: nowIso,
        })
        .eq('store_id', storeInternalId);
      if (availUpErr) {
        console.error('[store-operations] manual_open merchant_store_availability update failed', availUpErr);
        storeOpsDebugLog('POST:manual_open:availability_error', { message: availUpErr.message, code: availUpErr.code });
        return NextResponse.json(
          {
            error: 'Could not open store (availability)',
            details: storeOpsDebugEnabled() ? availUpErr.message : undefined,
          },
          { status: 500 }
        );
      }

      if (hadScheduledClosure) {
        const { error: notifErr } = await db.from('merchant_store_notifications').insert({
          store_id: storeInternalId,
          type: 'store',
          title: 'Store opened',
          body: 'Scheduled off cleared. Store is now open and accepting orders.',
          read: false,
        });
        if (notifErr) {
          console.error('[store-operations] manual_open notification insert', notifErr);
          storeOpsDebugLog('POST:manual_open:notification_error', { message: notifErr.message, code: notifErr.code });
        }
      }

      const { error: logErr } = await db.from('merchant_store_status_log').insert({
        store_id: storeInternalId,
        action: 'manual_open',
        restriction_type: logRestrictionBefore,
        close_reason: null,
        performed_by_id: toggledById,
        performed_by_email: toggledByEmail,
        performed_by_name: toggledByName,
      });
      if (logErr) {
        console.error('[store-operations] manual_open status_log insert failed', logErr);
        storeOpsDebugLog('POST:manual_open:status_log_error', { message: logErr.message, code: logErr.code });
        /** GET outside-hours guard uses this row; failure would allow immediate AUTO_CLOSE on next GET. */
      }

      storeOpsDebugLog('POST:manual_open:done', { storeId, storeInternalId, status_log_ok: !logErr });

      return NextResponse.json({
        success: true,
        operational_status: 'OPEN',
        manual_close_until: null,
        restriction_type: null,
      });
    }

    if (action === 'manual_close') {
      const type = closureType === 'manual_hold' ? 'manual_hold' : closureType === 'today' ? 'today' : 'temporary';

      const bodyManualUntil =
        typeof body.manual_close_until === 'string' && body.manual_close_until.trim() !== ''
          ? body.manual_close_until.trim()
          : null;

      let mergedManualCloseUntil: string | null = null;
      if (bodyManualUntil) {
        const d = new Date(bodyManualUntil.replace(' ', 'T'));
        mergedManualCloseUntil = Number.isNaN(d.getTime()) ? null : d.toISOString();
      } else if (type === 'manual_hold') {
        mergedManualCloseUntil = null;
      } else if (type === 'today') {
        const { data: storeCloseTzRow } = await db
          .from('merchant_stores')
          .select('timezone')
          .eq('id', storeInternalId)
          .single();
        const closeTz = (storeCloseTzRow as { timezone?: string } | null)?.timezone || 'Asia/Kolkata';
        const { data: ohToday } = await db
          .from('merchant_store_operating_hours')
          .select('*')
          .eq('store_id', storeInternalId)
          .single();
        const ohRec = (ohToday ?? null) as Record<string, unknown> | null;
        const { dayOfWeek } = nowInStoreTz(closeTz);
        const next =
          ohRec && Object.keys(ohRec).length > 0
            ? getNextOpenIsoAfterIstCalendarDay(ohRec, dayOfWeek, now, closeTz) ??
              getNextOpenDayStartIso(ohRec, dayOfWeek, now, closeTz)
            : null;
        mergedManualCloseUntil = next ?? endOfCalendarDayInStoreTimeZone(now, closeTz);
      } else {
        const mins = typeof durationMinutes === 'number' ? durationMinutes : parseInt(String(durationMinutes || 30), 10);
        if (mins < 1 || mins > 10080) {
          return NextResponse.json({ error: 'duration_minutes must be between 1 and 10080' }, { status: 400 });
        }
        mergedManualCloseUntil = new Date(now.getTime() + mins * 60 * 1000).toISOString();
      }

      const mergedCloseReason =
        closeReason && closeReason.trim() !== ''
          ? closeReason.trim()
          : avail?.close_reason != null && String(avail.close_reason).trim() !== ''
            ? String(avail.close_reason).trim()
            : null;

      const closeReasonText = mergedManualCloseUntil
        ? mergedCloseReason || 'Temporarily closed'
        : 'Closed until manually reopened';
      const unavailReason = mergedManualCloseUntil ? 'manual_close' : 'manual_indefinite';
      const logRestrictionBefore = (avail?.restriction_type as string | null) ?? null;
      const lastCloseToggledAt = nowIso;

      await db
        .from('merchant_stores')
        .update({
          operational_status: 'CLOSED',
          ...merchantStoresOnlineFlags(false),
        })
        .eq('id', storeInternalId);

      await db
        .from('merchant_store_availability')
        .update({
          is_available: false,
          is_accepting_orders: false,
          unavailable_reason: unavailReason,
          close_reason: closeReasonText,
          auto_unavailable_at: nowIso,
          auto_available_at: null,
          manual_close_until: mergedManualCloseUntil,
          block_auto_open: type === 'manual_hold',
          last_toggle_type: 'MANUAL_CLOSE',
          restriction_type: 'manual',
          updated_by: toggledByEmail ?? 'Store owner',
          last_toggled_by_email: toggledByEmail,
          last_toggled_by_name: toggledByName,
          last_toggled_by_id: toggledById,
          last_toggled_at: lastCloseToggledAt,
        })
        .eq('store_id', storeInternalId);

      await insertStatusLog('manual_close', logRestrictionBefore, mergedCloseReason);

      const displayRestriction = deriveDisplayRestrictionType({
        restriction_type: 'manual',
        unavailable_reason: unavailReason,
        manual_close_until: mergedManualCloseUntil,
      });

      return NextResponse.json({
        success: true,
        operational_status: 'CLOSED',
        manual_close_until: mergedManualCloseUntil,
        restriction_type: displayRestriction,
        block_auto_open: avail?.block_auto_open === true,
        reopens_at: mergedManualCloseUntil,
      });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (err) {
    console.error('[store-operations POST]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
