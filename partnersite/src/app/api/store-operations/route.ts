/**
 * Store operations API (Partner Site).
 *
 * Operational status transitions (open/close/schedule) are owned by the backend
 * store-schedule-engine (30s tick) and merchant-partner status APIs. This route
 * reads/writes status on merchant action; it must not be the only path that
 * keeps schedule logic alive — merchants do not need this tab open.
 */
import { NextRequest, NextResponse } from 'next/server';
import { isValidPartnerStoreId } from '@/lib/partner-store-id-shared';
import { createClient } from '@supabase/supabase-js';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import {
  formatStoreStatusLabel,
  type LiveSchedulePhase,
} from '@gatimitra/store-status';
import {
  getNextOpenDayStartIso,
  getNextOpenIso,
  getNextOpenIsoAfterIstCalendarDay,
  isWithinOperatingHours,
  nowInStoreTz,
  utcInstantFromWallClock,
} from '@/lib/merchantStoreNextOpenIso';
import {
  computeNextScheduleTransitionIso,
  computeOpensAtIso,
  computeScheduleCountdown,
  evaluateStoreSchedule,
  isAutoOpenFromScheduleEnabled,
  isBeforeFirstSlotToday,
  schedulePhaseLabel,
} from '@/lib/storeScheduleEngine';
import { loadMerchantLicenseEvaluation } from '@/lib/syncMerchantLicenseCompliance';
import { fetchPartnerStoreStatusSnapshot } from '@/lib/fetchPartnerStoreStatusSnapshot';
import { resetPartnerNotificationsPanelCleared } from '@/lib/partner-notifications-panel';
import { syncOperationalStatusFromSchedule, type AvailabilityRow } from '@/lib/storeScheduleSync';
import { triggerStoreScheduleTick } from '@/lib/triggerStoreScheduleTick';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder.supabase.co";
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "placeholder-service-role-key";

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

/** Full operational row: status + accepting triple + audit stamp on intentional online/offline writes. */
function merchantOperationalRowFields(online: boolean, timestampIso: string): Record<string, unknown> {
  return {
    operational_status: online ? 'OPEN' : 'CLOSED',
    ...merchantStoresOnlineFlags(online),
    last_activity_at: timestampIso,
  };
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

async function resolveStoreId(db: ReturnType<typeof getSupabase>, storeIdParam: string): Promise<number | null> {
  const { data, error } = await db
    .from('merchant_stores')
    .select('id')
    .eq('store_id', storeIdParam)
    .single();
  if (error || !data) return null;
  return data.id as number;
}

async function ensureAvailabilityRow(db: ReturnType<typeof getSupabase>, storeInternalId: number) {
  const { data } = await db.from('merchant_store_availability').select('id').eq('store_id', storeInternalId).single();
  if (data) return;

  const { data: storeRow } = await db
    .from('merchant_stores')
    .select(
      'operational_status, is_active, is_accepting_orders, is_available, approval_status, deleted_at, delisted_at'
    )
    .eq('id', storeInternalId)
    .single();

  const online = effectiveOpenFromMerchantStoreRow(storeRow as MerchantStoreGateRow) === 'OPEN';

  await db.from('merchant_store_availability').insert({
    store_id: storeInternalId,
    is_available: online,
    is_accepting_orders: online,
    auto_open_from_schedule: true,
    block_auto_open: false,
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

function parseManualCloseUntilDate(raw: string | null | undefined): Date | null {
  if (!raw || String(raw).trim() === '') return null;
  const d = new Date(String(raw).trim().replace(' ', 'T'));
  return Number.isNaN(d.getTime()) ? null : d;
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
    if (!isValidPartnerStoreId(storeId)) {
      return NextResponse.json({ error: 'Invalid store_id' }, { status: 400 });
    }

    const includeDebugBody = storeOpsDebugEnabled() && searchParams.get('debug') === '1';
    const debugTrace: Record<string, unknown>[] = [];

    const db = getSupabase();
    const storeInternalId = await resolveStoreId(db, storeId);
    if (!storeInternalId) return NextResponse.json({ error: 'Store not found' }, { status: 404 });

    await ensureAvailabilityRow(db, storeInternalId);
    let authoritative = await fetchPartnerStoreStatusSnapshot(storeInternalId);

    // Backend unreachable → local schedule sync that RESPECTS manual close/lock.
    // Never call syncStoreStatusAfterOperatingHoursChange here — that clears manual holds
    // (intended only after outlet-timings edits) and was reopening stores right after close.
    if (!authoritative) {
      try {
        const { data: storeForSync } = await db
          .from('merchant_stores')
          .select('operational_status')
          .eq('id', storeInternalId)
          .single();
        const { data: availForSync } = await db
          .from('merchant_store_availability')
          .select(
            'manual_close_until, close_reason, auto_open_from_schedule, block_auto_open, restriction_type, unavailable_reason, is_available, is_accepting_orders, is_manual_override, schedule_end_prompt_expires_at, schedule_end_prompted_at, last_toggled_by_email, last_toggled_by_name, last_toggled_by_id, last_toggle_type, last_toggled_at'
          )
          .eq('store_id', storeInternalId)
          .single();
        const { data: ohForSync } = await db
          .from('merchant_store_operating_hours')
          .select('*')
          .eq('store_id', storeInternalId)
          .maybeSingle();
        const ohRec = (ohForSync ?? null) as Record<string, unknown> | null;
        const sched = evaluateStoreSchedule(ohRec, 'Asia/Kolkata');
        await syncOperationalStatusFromSchedule({
          db,
          storeInternalId,
          storeTimezone: 'Asia/Kolkata',
          oh: ohRec,
          initialOperationalStatus: String(storeForSync?.operational_status || 'CLOSED'),
          avail: (availForSync as AvailabilityRow | null) ?? null,
          schedule: sched,
        });
      } catch (e) {
        console.warn('[store-operations] local schedule sync failed', e);
      }
      void triggerStoreScheduleTick(storeInternalId);
      authoritative = await fetchPartnerStoreStatusSnapshot(storeInternalId);
    }

    const trace = (step: string, payload: Record<string, unknown>) => {
      if (!storeOpsDebugEnabled()) return;
      const row = { step, storeId, internalId: storeInternalId, ...payload };
      debugTrace.push(row);
      storeOpsDebugLog(`GET:${step}`, row);
    };

    const [{ data: storeRowInitial }, { data: availRowInitial }, { data: oh }] = await Promise.all([
      db
        .from('merchant_stores')
        .select(
          // Tail of the SELECT contains the 5 columns written by the
          // backend store-schedule-engine tick (migration 0381). The
          // client uses formatStoreStatusLabel() from
          // @gatimitra/store-status to render a consistent label without
          // re-running the schedule math here.
          // No timezone column on merchant_stores; engine assumes Asia/Kolkata.
          'operational_status, is_active, is_accepting_orders, is_available, approval_status, deleted_at, delisted_at, live_schedule_phase, next_open_at, next_close_at, manual_override_active, live_status_updated_at'
        )
        .eq('id', storeInternalId)
        .single(),
      db
        .from('merchant_store_availability')
        .select(
          'manual_close_until, close_reason, auto_open_from_schedule, block_auto_open, restriction_type, unavailable_reason, is_available, is_accepting_orders, is_manual_override, schedule_end_prompt_expires_at, schedule_end_prompted_at, last_toggled_by_email, last_toggled_by_name, last_toggled_by_id, last_toggle_type, last_toggled_at'
        )
        .eq('store_id', storeInternalId)
        .single(),
      db.from('merchant_store_operating_hours').select('*').eq('store_id', storeInternalId).single(),
    ]);

    let store = storeRowInitial;
    let avail = availRowInitial;

    const storeTz = (store as { timezone?: string } | null)?.timezone || 'Asia/Kolkata';
    const ohRecord = (oh ?? null) as Record<string, unknown> | null;
    const schedule = evaluateStoreSchedule(ohRecord, storeTz);
    // Prefer local wall-clock schedule (same hours shown on the card). Backend snapshot can lag
    // a tick and wrongly report outside-hours, which blocked auto-open heal at countdown 0.
    const withinHoursLocal = schedule.withinOperatingHours;
    let withinHours = withinHoursLocal;
    const isTodayScheduledClosed = schedule.isTodayScheduledClosed;

    trace('initial_read', {
      db_operational_status: store?.operational_status ?? null,
      db_is_accepting_orders: store?.is_accepting_orders ?? null,
      manual_close_until: avail?.manual_close_until ?? null,
      block_auto_open: avail?.block_auto_open === true,
      auto_open_from_schedule: avail?.auto_open_from_schedule ?? null,
      last_toggle_type: avail?.last_toggle_type ?? null,
      last_toggled_at: avail?.last_toggled_at ?? null,
      within_hours: withinHours,
      schedule_phase: schedule.schedulePhase,
      has_operating_hours_row: schedule.hasOperatingHoursRow,
      store_timezone: storeTz,
      is_today_scheduled_closed: isTodayScheduledClosed,
    });

    // Auto open/close is owned by backend store-schedule-engine; GET triggers a tick so reads match merchant app.
    const licenseStatus = await loadMerchantLicenseEvaluation(db, storeInternalId);

    let storeGated = store;
    let displayOperational: 'OPEN' | 'CLOSED' = authoritative?.operational_status
      ?? effectiveOpenFromMerchantStoreRow(storeGated as MerchantStoreGateRow);

    const rawAvailEarly = avail ?? null;
    const localBlockAutoOpen = rawAvailEarly?.block_auto_open === true;
    const localUnavailNorm =
      rawAvailEarly?.unavailable_reason != null
        ? String(rawAvailEarly.unavailable_reason).trim().toLowerCase()
        : '';
    const localManualUntil = parseManualCloseUntilDate(
      rawAvailEarly?.manual_close_until as string | null | undefined
    );
    const localManualHoldActive =
      localBlockAutoOpen ||
      localUnavailNorm === 'manual_indefinite' ||
      localUnavailNorm === 'forced_lock' ||
      (localUnavailNorm === 'manual_close' &&
        (!localManualUntil || localManualUntil.getTime() > Date.now())) ||
      (!!localManualUntil && localManualUntil.getTime() > Date.now());

    // Prefer DB manual-hold over a stale/racey backend snapshot that still says OPEN.
    if (localManualHoldActive) {
      displayOperational = 'CLOSED';
    }

    const blockAutoOpenEarly =
      authoritative?.block_auto_open === true || localBlockAutoOpen;
    const unavailNormEarly = localManualHoldActive
      ? localUnavailNorm ||
        (authoritative?.unavailable_reason
          ? String(authoritative.unavailable_reason).trim().toLowerCase()
          : '')
      : authoritative?.unavailable_reason
        ? String(authoritative.unavailable_reason).trim().toLowerCase()
        : localUnavailNorm;
    let manualCloseUntil = localManualUntil
      ? localManualUntil
      : parseManualCloseUntilDate(
          (authoritative?.manual_close_until ?? avail?.manual_close_until) as string | null | undefined
        );
    // Expired temp-close timestamps stay in DB until the schedule tick clears them.
    // Treat only a *future* until as blocking heal (truthy past Date was wrongly skipping auto-open).
    const manualCloseStillActive =
      !!manualCloseUntil && manualCloseUntil.getTime() > Date.now();

    // Stuck CLOSED while wall-clock is inside today's slot → ask backend tick only.
    // Do NOT clear active manual closes (syncStoreStatusAfterOperatingHoursChange does that).
    // Allow heal when unavailable_reason is still "manual_close" but until has elapsed —
    // otherwise partnersite stays on Reopens in 00:00:00 until a full page refresh.
    if (
      withinHoursLocal &&
      displayOperational === 'CLOSED' &&
      !localManualHoldActive &&
      !blockAutoOpenEarly &&
      !manualCloseStillActive &&
      unavailNormEarly !== 'manual_indefinite' &&
      unavailNormEarly !== 'forced_lock'
    ) {
      try {
        await triggerStoreScheduleTick(storeInternalId);
        const healed = await fetchPartnerStoreStatusSnapshot(storeInternalId);
        if (healed) {
          authoritative = healed;
          if (!localManualHoldActive) {
            displayOperational = healed.operational_status;
          }
          withinHours = withinHoursLocal || healed.within_operating_hours;
          if (!localManualHoldActive) {
            manualCloseUntil = parseManualCloseUntilDate(healed.manual_close_until);
          }
        } else {
          // Backend snapshot unavailable — local schedule sync so countdown 0 still flips OPEN.
          try {
            await syncOperationalStatusFromSchedule({
              db,
              storeInternalId,
              storeTimezone: storeTz,
              oh: ohRecord,
              initialOperationalStatus: String(store?.operational_status || 'CLOSED'),
              avail: (avail as AvailabilityRow | null) ?? null,
              schedule,
            });
          } catch (syncErr) {
            console.warn('[store-operations] local heal sync failed', syncErr);
          }
          const { data: storeAfterHeal } = await db
            .from('merchant_stores')
            .select(
              'operational_status, is_active, is_accepting_orders, is_available, approval_status, deleted_at, delisted_at, live_schedule_phase, next_open_at, next_close_at, manual_override_active, live_status_updated_at'
            )
            .eq('id', storeInternalId)
            .single();
          if (storeAfterHeal) {
            storeGated = storeAfterHeal;
            store = storeAfterHeal;
          }
          if (!localManualHoldActive) {
            displayOperational = effectiveOpenFromMerchantStoreRow(
              storeGated as MerchantStoreGateRow
            );
          }
          withinHours = withinHoursLocal;
        }
        const { data: availAfter } = await db
          .from('merchant_store_availability')
          .select(
            'manual_close_until, close_reason, auto_open_from_schedule, block_auto_open, restriction_type, unavailable_reason, is_available, is_accepting_orders, is_manual_override, schedule_end_prompt_expires_at, schedule_end_prompted_at, last_toggled_by_email, last_toggled_by_name, last_toggled_by_id, last_toggle_type, last_toggled_at'
          )
          .eq('store_id', storeInternalId)
          .single();
        if (availAfter) avail = availAfter;
      } catch (e) {
        console.warn('[store-operations] stuck-closed heal failed', e);
      }
    }

    trace('authoritative_status', {
      from_backend: authoritative != null,
      operational_status: displayOperational,
      surface_online: authoritative?.surface_online ?? null,
      within_operating_hours: withinHours,
      db_operational_status: store?.operational_status ?? null,
      db_is_available: store?.is_available ?? null,
      db_is_accepting_orders: store?.is_accepting_orders ?? null,
    });

    const rawAvail = avail ?? null;

    const blockAutoOpen =
      localBlockAutoOpen || authoritative?.block_auto_open === true;
    const unavailNorm = localManualHoldActive
      ? localUnavailNorm ||
        (authoritative?.unavailable_reason
          ? String(authoritative.unavailable_reason).trim().toLowerCase()
          : '')
      : authoritative?.unavailable_reason
        ? String(authoritative.unavailable_reason).trim().toLowerCase()
        : rawAvail?.unavailable_reason != null
          ? String(rawAvail.unavailable_reason).trim().toLowerCase()
          : '';

    const nowAfterLogic = new Date();
    const opens_at = computeOpensAtIso({
      oh: ohRecord,
      storeTimezone: storeTz,
      displayOperational,
      manualCloseUntil,
      blockAutoOpen,
      unavailableReason: unavailNorm || null,
      schedule,
      refNow: nowAfterLogic,
    });

    const displaySlot =
      schedule.activeSlot ??
      schedule.nextSlotToday ??
      schedule.todaySlots[0] ??
      schedule.configuredTodaySlots[0] ??
      null;
    const nextScheduleTransitionAt = computeNextScheduleTransitionIso(ohRecord, storeTz, schedule, nowAfterLogic);
    const scheduleCountdown = computeScheduleCountdown({
      oh: ohRecord,
      storeTimezone: storeTz,
      schedule,
      displayOperational,
      opensAtIso: opens_at,
      manualTempClose: !!(manualCloseUntil && manualCloseUntil.getTime() > Date.now()),
      refNow: nowAfterLogic,
    });

    // UI flag: within-hours but held OFF without a countdown target (manual lock / manual indefinite).
    // TEMP close (manual_close_until future) must still show countdown.
    const withinHoursButRestricted =
      withinHours && displayOperational === 'CLOSED' && (blockAutoOpen || unavailNorm === 'manual_indefinite');
    const displayRestriction = deriveDisplayRestrictionType({
      restriction_type: rawAvail?.restriction_type as string | null | undefined,
      unavailable_reason: rawAvail?.unavailable_reason as string | null | undefined,
      manual_close_until: manualCloseUntil ? manualCloseUntil.toISOString() : null,
    });

    /** Active/upcoming Partner "Schedule time-off" rows (`merchant_store_scheduled_closures`). */
    const closureNowIso = new Date().toISOString();
    const [{ data: schedClosureRows }, { data: rushRows }] = await Promise.all([
      db
        .from('merchant_store_scheduled_closures')
        .select('id, reason, starts_at, ends_at, status, marked_from')
        .eq('store_id', storeInternalId)
        .in('status', ['scheduled', 'active'])
        .gt('ends_at', closureNowIso)
        .order('starts_at', { ascending: true }),
      db
        .from('merchant_store_rush_windows')
        .select('duration_minutes, started_at, ends_at, marked_from')
        .eq('store_id', storeInternalId)
        .eq('is_active', true)
        .gt('ends_at', closureNowIso)
        .order('started_at', { ascending: false })
        .limit(1),
    ]);

    const scheduledTimeOffs: Array<{
      id: number;
      reason: string | null;
      starts_at: string;
      ends_at: string;
      status: string;
      phase: 'active' | 'upcoming';
      marked_from: string | null;
    }> = [];
    const closureNowMs = Date.now();
    for (const raw of schedClosureRows ?? []) {
      const row = raw as Record<string, unknown>;
      const id = Number(row.id);
      const startsAt = row.starts_at != null ? String(row.starts_at) : '';
      const endsAt = row.ends_at != null ? String(row.ends_at) : '';
      if (!Number.isFinite(id) || !startsAt || !endsAt) continue;
      const startMs = new Date(startsAt).getTime();
      const endMs = new Date(endsAt).getTime();
      if (Number.isNaN(startMs) || Number.isNaN(endMs) || startMs >= endMs) continue;
      let phase: 'active' | 'upcoming';
      if (closureNowMs >= startMs && closureNowMs < endMs) phase = 'active';
      else if (closureNowMs < startMs) phase = 'upcoming';
      else continue;

      scheduledTimeOffs.push({
        id,
        reason: typeof row.reason === 'string' && row.reason.trim() !== '' ? row.reason.trim() : null,
        starts_at: startsAt,
        ends_at: endsAt,
        status: row.status != null ? String(row.status) : '',
        phase,
        marked_from:
          row.marked_from != null && String(row.marked_from).trim() !== ''
            ? String(row.marked_from).trim()
            : null,
      });
    }

    const rushRow = rushRows?.[0];
    let activeRush: Record<string, unknown> | null = null;
    if (rushRow) {
      const endsAtMs = new Date(String(rushRow.ends_at)).getTime();
      const remainingMinutes = Math.max(0, Math.floor((endsAtMs - Date.now()) / 60000));
      activeRush = {
        is_active: true,
        duration_minutes: Number(rushRow.duration_minutes),
        started_at: new Date(String(rushRow.started_at)).toISOString(),
        ends_at: new Date(String(rushRow.ends_at)).toISOString(),
        remaining_minutes: remainingMinutes,
        marked_from:
          rushRow.marked_from != null && String(rushRow.marked_from).trim() !== ''
            ? String(rushRow.marked_from).trim()
            : null,
      };
    }

    const scheduleEndPromptExpiresAt = parseManualCloseUntilDate(
      rawAvail?.schedule_end_prompt_expires_at as string | null | undefined
    );
    const scheduleEndPromptActive =
      !!scheduleEndPromptExpiresAt && Date.now() < scheduleEndPromptExpiresAt.getTime();

    const surfaceOnline = localManualHoldActive
      ? false
      : (authoritative?.surface_online ??
        (displayOperational === 'OPEN' && withinHours));

    // Stale close_reason from last auto-close must not contradict "Within operating hours".
    const closeReasonRaw = rawAvail?.close_reason as string | null | undefined;
    const rawCloseReason = closeReasonRaw != null ? String(closeReasonRaw).trim() : '';
    const suppressStaleCloseReason =
      withinHours &&
      displayOperational === 'CLOSED' &&
      !localManualHoldActive &&
      !blockAutoOpen &&
      !manualCloseUntil &&
      unavailNorm !== 'manual_indefinite' &&
      unavailNorm !== 'manual_close' &&
      unavailNorm !== 'forced_lock' &&
      (rawCloseReason === '' ||
        /outside operating hours/i.test(rawCloseReason) ||
        /schedule/i.test(rawCloseReason));
    const closeReasonForClient =
      displayOperational === 'OPEN' || suppressStaleCloseReason
        ? null
        : rawCloseReason !== ''
          ? rawCloseReason
          : null;

    const liveStoreRow = store as {
      live_schedule_phase?: string | null;
      next_open_at?: string | null;
      next_close_at?: string | null;
      manual_override_active?: boolean | null;
      live_status_updated_at?: string | null;
    } | null;
    const livePhase = (liveStoreRow?.live_schedule_phase ?? null) as LiveSchedulePhase | null;
    const liveLabel = formatStoreStatusLabel({
      phase: livePhase,
      nextOpenAt: liveStoreRow?.next_open_at ?? null,
      nextCloseAt: liveStoreRow?.next_close_at ?? null,
      manualOverrideActive: liveStoreRow?.manual_override_active === true,
      isOpenNow: surfaceOnline,
      timezone: storeTz,
    });

    const responseBody: Record<string, unknown> = {
      operational_status: displayOperational,
      surface_online: surfaceOnline,
      is_open: surfaceOnline,
      live_schedule_phase: livePhase,
      live_next_open_at: liveStoreRow?.next_open_at ?? null,
      live_next_close_at: liveStoreRow?.next_close_at ?? null,
      live_manual_override_active: liveStoreRow?.manual_override_active === true,
      live_status_updated_at: liveStoreRow?.live_status_updated_at ?? null,
      live_label: liveLabel.primary,
      live_label_chip: liveLabel.chip,
      live_label_secondary: liveLabel.secondary ?? null,
      live_label_countdown: liveLabel.countdown ?? null,
      license_blocked: licenseStatus.blocked,
      license_can_manual_open: licenseStatus.can_manual_open,
      license_expired_documents: licenseStatus.expired,
      license_pending_verification: licenseStatus.pending_verification,
      approval_status: authoritative?.approval_status ?? (storeGated as MerchantStoreGateRow | null)?.approval_status ?? null,
      is_active: authoritative?.is_active ?? (storeGated as MerchantStoreGateRow | null)?.is_active ?? null,
      is_accepting_orders: displayOperational === 'OPEN',
      is_available: authoritative?.is_available ?? (storeGated as MerchantStoreGateRow | null)?.is_available ?? null,
      manual_close_until: manualCloseUntil ? manualCloseUntil.toISOString() : null,
      close_reason: closeReasonForClient,
      opens_at,
      auto_open_from_schedule: authoritative?.auto_open_from_schedule
        ?? isAutoOpenFromScheduleEnabled(rawAvail?.auto_open_from_schedule ?? avail?.auto_open_from_schedule),
      block_auto_open: blockAutoOpen,
      unavailable_reason: authoritative?.unavailable_reason ?? (rawAvail?.unavailable_reason as string | null | undefined) ?? null,
      restriction_type: authoritative?.restriction_type ?? displayRestriction,
      today_date: schedule.todayDate,
      today_slots: schedule.todaySlots,
      configured_today_slots: schedule.configuredTodaySlots,
      active_slot: displaySlot,
      schedule_phase: schedule.schedulePhase,
      schedule_status_label: schedulePhaseLabel(schedule.schedulePhase),
      is_today_scheduled_closed: isTodayScheduledClosed,
      /** True when current time in the store's timezone falls inside a configured slot (or 24h). */
      within_operating_hours: withinHours,
      last_toggled_by_email: authoritative?.last_toggled_by_email ?? rawAvail?.last_toggled_by_email ?? null,
      last_toggled_by_name: authoritative?.last_toggled_by_name ?? rawAvail?.last_toggled_by_name ?? null,
      last_toggled_by_id: authoritative?.last_toggled_by_id ?? rawAvail?.last_toggled_by_id ?? null,
      last_toggle_type: authoritative?.last_toggle_type ?? rawAvail?.last_toggle_type ?? null,
      last_toggled_at: authoritative?.last_toggled_at ?? rawAvail?.last_toggled_at ?? null,
      within_hours_but_restricted: withinHoursButRestricted,
      is_manual_override: rawAvail?.is_manual_override === true,
      schedule_end_prompt_active: scheduleEndPromptActive,
      schedule_end_prompt_expires_at: scheduleEndPromptExpiresAt
        ? scheduleEndPromptExpiresAt.toISOString()
        : null,
      next_schedule_transition_at: nextScheduleTransitionAt,
      countdown_at: scheduleCountdown.at,
      countdown_kind: scheduleCountdown.kind,
      countdown_wall_label: scheduleCountdown.wallLabel,
      scheduled_time_offs: scheduledTimeOffs,
      active_rush: activeRush,
    };

    if (includeDebugBody) {
      responseBody._store_ops_debug = {
        hint: 'Server: STORE_OPERATIONS_DEBUG=1 in .env.local; add &debug=1 to this URL.',
        trace: debugTrace,
      };
    }

    return NextResponse.json(responseBody, {
      headers: {
        'Cache-Control': 'private, no-store, max-age=0, must-revalidate',
      },
    });
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

    if (action === 'schedule_end_stay_online') {
      await db
        .from('merchant_stores')
        .update(merchantOperationalRowFields(true, nowIso))
        .eq('id', storeInternalId);
      await db
        .from('merchant_store_availability')
        .update({
          ...activityPayload,
          is_available: true,
          is_accepting_orders: true,
          is_manual_override: true,
          manual_override_at: nowIso,
          schedule_end_prompted_at: null,
          schedule_end_prompt_expires_at: null,
          unavailable_reason: null,
          close_reason: null,
          last_toggle_type: 'MANUAL_OPEN',
        })
        .eq('store_id', storeInternalId);
      await insertStatusLog('schedule_end_stay_online', null);
      return NextResponse.json({ success: true, operational_status: 'OPEN' });
    }

    if (action === 'schedule_end_go_offline') {
      await db
        .from('merchant_stores')
        .update(merchantOperationalRowFields(false, nowIso))
        .eq('id', storeInternalId);
      await db
        .from('merchant_store_availability')
        .update({
          ...activityPayload,
          is_available: false,
          is_accepting_orders: false,
          is_manual_override: false,
          manual_override_at: null,
          schedule_end_prompted_at: null,
          schedule_end_prompt_expires_at: null,
          unavailable_reason: 'schedule_closed',
          close_reason: 'Closed after scheduled hours',
          restriction_type: 'schedule',
          last_toggle_type: 'MANUAL_CLOSE',
        })
        .eq('store_id', storeInternalId);
      await insertStatusLog('schedule_end_go_offline', 'schedule');
      return NextResponse.json({ success: true, operational_status: 'CLOSED' });
    }

    if (action === 'update_manual_lock') {
      const licenseStatus = await loadMerchantLicenseEvaluation(db, storeInternalId);
      if (licenseStatus.blocked) {
        return NextResponse.json(
          {
            success: false,
            error:
              'Manual activation lock cannot be changed while the store is closed due to an expired licence. Upload and verify your licence first.',
            code: 'LICENSE_BLOCKED',
          },
          { status: 403 }
        );
      }

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
      const licenseStatus = await loadMerchantLicenseEvaluation(db, storeInternalId);
      if (licenseStatus.blocked) {
        const pending = licenseStatus.pending_verification.length > 0;
        return NextResponse.json(
          {
            success: false,
            error: pending
              ? 'Your renewed licence is under review by the Gatimitra team. The store will stay closed until verification is complete.'
              : "Can't go online until your new licence is verified by Gatimitra.",
            code: pending ? 'LICENSE_PENDING_VERIFICATION' : 'LICENSE_EXPIRED',
            license_status: licenseStatus,
          },
          { status: 403 }
        );
      }

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
      /**
       * Manual open is only allowed inside a configured operating slot (or 24h).
       * Scheduled OFF days and all other outside-hours states are rejected — merchants
       * must update Outlet Timings / wait for the next slot.
       */
      if (ohOpen) {
        const ohRec = ohOpen as Record<string, unknown>;
        const openSchedule = evaluateStoreSchedule(ohRec, openStoreTz, now);
        if (openSchedule.isTodayScheduledClosed) {
          return NextResponse.json(
            {
              error:
                'Cannot open: today is marked as a scheduled off day in Outlet Timings. Update Outlet Timings to mark today as open.',
              code: 'SCHEDULED_OFF_DAY',
            },
            { status: 400 }
          );
        }
        const { dayOfWeek: openDow, minutesSinceMidnight: openMin } = nowInStoreTz(openStoreTz);
        if (!isWithinOperatingHours(ohRec, openDow, openMin)) {
          return NextResponse.json(
            {
              error:
                'Your store cannot be turned ON because it is currently outside its scheduled operating hours. To open your store now, please update your Store Schedule first.',
              code: 'OUTSIDE_OPERATING_HOURS',
            },
            { status: 400 }
          );
        }
      } else {
        return NextResponse.json(
          {
            error:
              'Your store cannot be turned ON because operating hours are not configured. To open your store now, please update your Store Schedule first.',
            code: 'OUTSIDE_OPERATING_HOURS',
          },
          { status: 400 }
        );
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
        .update(merchantOperationalRowFields(true, nowIso))
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
          block_auto_open: false,
          is_manual_override: false,
          manual_override_at: null,
          schedule_end_prompted_at: null,
          schedule_end_prompt_expires_at: null,
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

      await resetPartnerNotificationsPanelCleared(db, storeInternalId);
      await fetchPartnerStoreStatusSnapshot(storeInternalId);

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
        const normalized = bodyManualUntil.replace(' ', 'T');
        // Bare datetimes are IST wall time (parity with dashboard portal + merchant app).
        const d =
          !/[zZ]$/.test(normalized) &&
          !/[+-]\d{2}:?\d{2}$/.test(normalized) &&
          /^\d{4}-\d{2}-\d{2}T/.test(normalized)
            ? new Date(`${normalized}+05:30`)
            : new Date(normalized);
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
        const { dayOfWeek, minutesSinceMidnight } = nowInStoreTz(closeTz);
        let next: string | null = null;
        if (ohRec && Object.keys(ohRec).length > 0) {
          // "Close for today" is meant to skip the REST of today's operating slots. If it's
          // triggered before today's first slot has even started (e.g. a close fired just
          // after midnight), today hasn't happened yet — don't skip it, reopen at today's
          // own next slot instead of jumping to a future calendar day.
          const todaySchedule = evaluateStoreSchedule(ohRec, closeTz, now);
          const beforeFirstSlotToday = isBeforeFirstSlotToday(todaySchedule, minutesSinceMidnight);
          next = beforeFirstSlotToday
            ? getNextOpenIso(ohRec, dayOfWeek, minutesSinceMidnight, now, closeTz)
            : getNextOpenIsoAfterIstCalendarDay(ohRec, dayOfWeek, now, closeTz);
          next = next ?? getNextOpenDayStartIso(ohRec, dayOfWeek, now, closeTz);
        }
        mergedManualCloseUntil = next ?? endOfCalendarDayInStoreTimeZone(now, closeTz);
      } else {
        const mins = typeof durationMinutes === 'number' ? durationMinutes : parseInt(String(durationMinutes || 30), 10);
        if (mins < 1 || mins > 10080) {
          return NextResponse.json({ error: 'duration_minutes must be between 1 and 10080' }, { status: 400 });
        }
        mergedManualCloseUntil = new Date(now.getTime() + mins * 60 * 1000).toISOString();
      }

      if (type === 'temporary' && mergedManualCloseUntil) {
        const untilMs = new Date(mergedManualCloseUntil).getTime();
        if (!Number.isFinite(untilMs) || untilMs <= Date.now()) {
          return NextResponse.json(
            { error: 'Reopening date and time must be in the future' },
            { status: 400 }
          );
        }
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

      const { error: storeCloseErr } = await db
        .from('merchant_stores')
        .update(merchantOperationalRowFields(false, lastCloseToggledAt))
        .eq('id', storeInternalId);
      if (storeCloseErr) {
        console.error('[store-operations POST] merchant_stores close failed', storeCloseErr);
        return NextResponse.json({ error: 'Failed to close store' }, { status: 500 });
      }

      const blockAutoOpenOnClose = type === 'manual_hold';
      const { error: availCloseErr } = await db
        .from('merchant_store_availability')
        .update({
          is_available: false,
          is_accepting_orders: false,
          unavailable_reason: unavailReason,
          close_reason: closeReasonText,
          auto_unavailable_at: nowIso,
          auto_available_at: null,
          manual_close_until: mergedManualCloseUntil,
          block_auto_open: blockAutoOpenOnClose,
          is_manual_override: false,
          manual_override_at: null,
          schedule_end_prompted_at: null,
          schedule_end_prompt_expires_at: null,
          last_toggle_type: 'MANUAL_CLOSE',
          restriction_type: 'manual',
          updated_by: toggledByEmail ?? 'Store owner',
          last_toggled_by_email: toggledByEmail,
          last_toggled_by_name: toggledByName,
          last_toggled_by_id: toggledById,
          last_toggled_at: lastCloseToggledAt,
        })
        .eq('store_id', storeInternalId);
      if (availCloseErr) {
        console.error('[store-operations POST] availability close failed', availCloseErr);
        return NextResponse.json({ error: 'Failed to close store' }, { status: 500 });
      }

      await insertStatusLog('manual_close', logRestrictionBefore, mergedCloseReason);

      const displayRestriction = deriveDisplayRestrictionType({
        restriction_type: 'manual',
        unavailable_reason: unavailReason,
        manual_close_until: mergedManualCloseUntil,
      });

      // Tick syncs live columns; engine must not reopen (manual hold guards).
      await triggerStoreScheduleTick(storeInternalId);
      await fetchPartnerStoreStatusSnapshot(storeInternalId);

      return NextResponse.json({
        success: true,
        operational_status: 'CLOSED',
        surface_online: false,
        is_open: false,
        manual_close_until: mergedManualCloseUntil,
        restriction_type: displayRestriction,
        block_auto_open: blockAutoOpenOnClose,
        reopens_at: mergedManualCloseUntil,
      });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (err) {
    console.error('[store-operations POST]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
