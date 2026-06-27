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
import { resetPartnerNotificationsPanelCleared } from '@/lib/partner-notifications-panel';

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

    const trace = (step: string, payload: Record<string, unknown>) => {
      if (!storeOpsDebugEnabled()) return;
      const row = { step, storeId, internalId: storeInternalId, ...payload };
      debugTrace.push(row);
      storeOpsDebugLog(`GET:${step}`, row);
    };

    const [{ data: store }, { data: avail }, { data: oh }] = await Promise.all([
      db
        .from('merchant_stores')
        .select(
          'operational_status, is_active, is_accepting_orders, is_available, approval_status, deleted_at, delisted_at, timezone'
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

    const storeTz = (store as { timezone?: string } | null)?.timezone || 'Asia/Kolkata';
    const ohRecord = (oh ?? null) as Record<string, unknown> | null;
    const schedule = evaluateStoreSchedule(ohRecord, storeTz);
    const withinHours = schedule.withinOperatingHours;
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

    // Auto open/close is owned by backend store-schedule-engine (30s tick). GET is read-only.
    const manualCloseUntil = parseManualCloseUntilDate(
      avail?.manual_close_until as string | null | undefined
    );
    const availFinal = avail;
    const licenseStatus = await loadMerchantLicenseEvaluation(db, storeInternalId);

    let storeGated = store;
    let displayOperational = effectiveOpenFromMerchantStoreRow(storeGated as MerchantStoreGateRow);

    const rawAvail: typeof availFinal | typeof avail | null | undefined = availFinal ?? avail ?? null;

    const blockAutoOpen = rawAvail?.block_auto_open === true;
    const unavailNorm =
      rawAvail?.unavailable_reason != null ? String(rawAvail.unavailable_reason).trim().toLowerCase() : '';

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

    const responseBody: Record<string, unknown> = {
      operational_status: displayOperational,
      license_blocked: licenseStatus.blocked,
      license_can_manual_open: licenseStatus.can_manual_open,
      license_expired_documents: licenseStatus.expired,
      license_pending_verification: licenseStatus.pending_verification,
      approval_status: (storeGated as MerchantStoreGateRow | null)?.approval_status ?? null,
      is_active: (storeGated as MerchantStoreGateRow | null)?.is_active ?? null,
      is_accepting_orders: displayOperational === 'OPEN',
      is_available: (storeGated as MerchantStoreGateRow | null)?.is_available ?? null,
      manual_close_until: manualCloseUntil ? manualCloseUntil.toISOString() : null,
      close_reason: (rawAvail?.close_reason as string | null | undefined) ?? null,
      opens_at,
      auto_open_from_schedule: isAutoOpenFromScheduleEnabled(
        rawAvail?.auto_open_from_schedule ?? avail?.auto_open_from_schedule
      ),
      block_auto_open: blockAutoOpen,
      unavailable_reason: (rawAvail?.unavailable_reason as string | null | undefined) ?? null,
      restriction_type: displayRestriction,
      today_date: schedule.todayDate,
      today_slots: schedule.todaySlots,
      configured_today_slots: schedule.configuredTodaySlots,
      active_slot: displaySlot,
      schedule_phase: schedule.schedulePhase,
      schedule_status_label: schedulePhaseLabel(schedule.schedulePhase),
      is_today_scheduled_closed: isTodayScheduledClosed,
      /** True when current time in the store's timezone falls inside a configured slot (or 24h). */
      within_operating_hours: withinHours,
      last_toggled_by_email: rawAvail?.last_toggled_by_email ?? null,
      last_toggled_by_name: rawAvail?.last_toggled_by_name ?? null,
      last_toggled_by_id: rawAvail?.last_toggled_by_id ?? null,
      last_toggle_type: rawAvail?.last_toggle_type ?? null,
      last_toggled_at: rawAvail?.last_toggled_at ?? null,
      within_hours_but_restricted: withinHoursButRestricted,
      is_manual_override: (availFinal?.is_manual_override ?? rawAvail?.is_manual_override) === true,
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
       * Scheduled OFF days are the only hard block on manual open: the schedule sync engine
       * always force-closes a scheduled-off day (manual override cannot keep it online), so
       * succeeding here would only result in an immediate AUTO_CLOSE on the next poll.
       *
       * For other "outside hours" states (BREAK, after last slot — not before today's first slot)
       * we accept the manual open: the merchant overrides the schedule and the sync engine
       * respects `is_manual_override = true` to keep the store online until they close or the
       * next schedule boundary closes it.
       */
      let manualOpenBeforeFirstSlot = false;
      if (ohOpen) {
        const ohRec = ohOpen as Record<string, unknown>;
        const openSchedule = evaluateStoreSchedule(ohRec, openStoreTz, now);
        manualOpenBeforeFirstSlot = isBeforeFirstSlotToday(
          openSchedule,
          openSchedule.minutesSinceMidnight
        );
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
      const ohRecOpen = ohOpen ? (ohOpen as Record<string, unknown>) : null;
      const { dayOfWeek: openDow, minutesSinceMidnight: openMin } = nowInStoreTz(openStoreTz);
      const manualOverrideOutsideSchedule =
        !!ohRecOpen &&
        !isWithinOperatingHours(ohRecOpen, openDow, openMin) &&
        !manualOpenBeforeFirstSlot;

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
          is_manual_override: manualOverrideOutsideSchedule,
          manual_override_at: manualOverrideOutsideSchedule ? nowIso : null,
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
        .update(merchantOperationalRowFields(false, lastCloseToggledAt))
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
