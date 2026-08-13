/**
 * Applies schedule-driven OPEN/CLOSE mutations to merchant_stores + merchant_store_availability.
 * Mirrors backend `store-schedule-engine.ts`.
 * Schedule mutations run on the backend 30s tick — Partner Site GET is read-only.
 *
 * Priority (highest wins):
 * 1. Active vacation / scheduled closure
 * 2. Scheduled off day — force CLOSED (ignores manual override)
 * 3. Manual activation lock while OPEN
 * 4. Active temp close / manual indefinite
 * 5. Expired manual_close_until — clear; auto-open when within hours
 * 6. Within operating hours + auto_open + CLOSED → AUTO_OPEN
 * 7. Outside hours + OPEN — immediate close (manual_override bypass omitted before first slot today)
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  evaluateStoreSchedule,
  getOutsideHoursClosePolicy,
  isAutoOpenFromScheduleEnabled,
  isBeforeFirstSlotToday,
  isInBreakBetweenSlots,
  type ScheduleEvaluation,
} from '@/lib/storeScheduleEngine';
import { syncMerchantLicenseCompliance } from '@/lib/syncMerchantLicenseCompliance';
import type { MerchantLicenseEvaluation } from '@/lib/merchantLicenseExpiry';

/**
 * Legacy constant kept for back-compat with any external importers. The 5-minute
 * end-of-day prompt has been removed: the store now closes IMMEDIATELY at slot end
 * (matches partner expectation "at exactly 11:00 PM → automatically OFFLINE").
 */
export const SCHEDULE_END_PROMPT_MS = 5 * 60 * 1000;

export type AvailabilityRow = {
  manual_close_until?: string | null;
  auto_open_from_schedule?: boolean | null;
  block_auto_open?: boolean | null;
  unavailable_reason?: string | null;
  restriction_type?: string | null;
  is_available?: boolean | null;
  is_accepting_orders?: boolean | null;
  last_toggle_type?: string | null;
  last_toggled_at?: string | null;
  last_toggled_by_email?: string | null;
  last_toggled_by_name?: string | null;
  last_toggled_by_id?: string | null;
  is_manual_override?: boolean | null;
  schedule_end_prompt_expires_at?: string | null;
  schedule_end_prompted_at?: string | null;
  close_reason?: string | null;
};

export type SyncScheduleResult = {
  effectiveStatus: 'OPEN' | 'CLOSED';
  manualCloseUntil: Date | null;
  availFinal: AvailabilityRow | null;
  mutations: string[];
  scheduleEndPromptActive: boolean;
  scheduleEndPromptExpiresAt: string | null;
  licenseEvaluation: MerchantLicenseEvaluation;
};

function merchantStoresOnlineFlags(online: boolean) {
  return { is_active: online, is_available: online, is_accepting_orders: online };
}

function parseIsoDate(raw: string | null | undefined): Date | null {
  if (!raw || String(raw).trim() === '') return null;
  const d = new Date(String(raw).trim().replace(' ', 'T'));
  return Number.isNaN(d.getTime()) ? null : d;
}

function parseManualCloseUntil(raw: string | null | undefined): Date | null {
  return parseIsoDate(raw);
}

function isManualIndefinite(unavailableReason: string | null | undefined): boolean {
  return (
    String(unavailableReason ?? '')
      .trim()
      .toLowerCase() === 'manual_indefinite'
  );
}

async function loadAvailability(
  db: SupabaseClient,
  storeInternalId: number
): Promise<AvailabilityRow | null> {
  const { data } = await db
    .from('merchant_store_availability')
    .select(
      'manual_close_until, close_reason, auto_open_from_schedule, block_auto_open, restriction_type, unavailable_reason, is_available, is_accepting_orders, is_manual_override, schedule_end_prompt_expires_at, schedule_end_prompted_at, last_toggled_by_email, last_toggled_by_name, last_toggled_by_id, last_toggle_type, last_toggled_at'
    )
    .eq('store_id', storeInternalId)
    .single();
  return (data as AvailabilityRow | null) ?? null;
}

async function loadActiveVacationContext(
  db: SupabaseClient,
  storeInternalId: number
): Promise<{ endsAtIso: string; merchantReasonDetail: string | null } | null> {
  const { data } = await db
    .from('merchant_store_scheduled_closures')
    .select('ends_at, reason')
    .eq('store_id', storeInternalId)
    .in('status', ['scheduled', 'active'])
    .lte('starts_at', new Date().toISOString())
    .gt('ends_at', new Date().toISOString())
    .order('starts_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!data?.ends_at) return null;
  const d = parseIsoDate(String(data.ends_at));
  if (!d) return null;
  const mr =
    typeof (data as { reason?: unknown }).reason === 'string' &&
    String((data as { reason?: string }).reason).trim().length > 0
      ? String((data as { reason?: string }).reason).trim()
      : null;
  return { endsAtIso: d.toISOString(), merchantReasonDetail: mr };
}

/**
 * Scheduled time-off closes stamp `merchant_store_availability` with vacation-ish fields via
 * `syncOperationalStatusFromSchedule`. If closures are cancelled/removed server-side without
 * updating availability, leftover `manual_close_until` acts like a bogus temp close and blocks
 * auto-open. Clear leftovers when nothing in-window remains in `merchant_store_scheduled_closures`.
 */
export async function clearStaleScheduledClosureVacationOnAvailability(
  db: SupabaseClient,
  storeInternalId: number
): Promise<boolean> {
  const activeCtx = await loadActiveVacationContext(db, storeInternalId);
  if (activeCtx) return false;
  const avail = await loadAvailability(db, storeInternalId);
  if (!avail) return false;
  const unavail = String(avail.unavailable_reason ?? '').toLowerCase();
  const restriction = String(avail.restriction_type ?? '').toUpperCase();
  const cr = typeof avail.close_reason === 'string' ? avail.close_reason.trim() : '';
  const staleVacAvail =
    unavail === 'vacation' ||
    restriction === 'VACATION' ||
    /^vacation\b/i.test(cr);
  if (!staleVacAvail) return false;
  const nowIso = new Date().toISOString();
  await db
    .from('merchant_store_availability')
    .update({
      unavailable_reason: null,
      restriction_type: null,
      manual_close_until: null,
      close_reason: null,
      auto_off_reason: null,
      updated_at: nowIso,
    })
    .eq('store_id', storeInternalId);
  return true;
}

async function hasActiveRushWindow(db: SupabaseClient, storeInternalId: number): Promise<boolean> {
  const { data } = await db
    .from('merchant_store_rush_windows')
    .select('id')
    .eq('store_id', storeInternalId)
    .eq('is_active', true)
    .gt('ends_at', new Date().toISOString())
    .limit(1)
    .maybeSingle();
  return !!data;
}

/**
 * Stamps `merchant_store_availability` audit columns the backend cron also fills in
 * (`last_auto_action_at`, `auto_unavailable_at`, `auto_off_reason`) so the partner site and
 * backend writes are indistinguishable. All `merchant_store_availability` columns from the
 * schema (`is_manual_override`, `restriction_type`, `unavailable_reason`, `close_reason`,
 * `schedule_end_prompt_*`, etc.) are passed through via `availPatch`.
 */
async function closeStore(
  db: SupabaseClient,
  storeInternalId: number,
  availPatch: Record<string, unknown>,
  toggleType: string,
  autoOffReason?: string
): Promise<void> {
  const nowIso = new Date().toISOString();
  await db
    .from('merchant_stores')
    .update({
      operational_status: 'CLOSED',
      ...merchantStoresOnlineFlags(false),
      last_activity_at: nowIso,
    })
    .eq('id', storeInternalId);
  await db
    .from('merchant_store_availability')
    .update({
      ...availPatch,
      is_available: false,
      is_accepting_orders: false,
      last_auto_action_at: nowIso,
      auto_unavailable_at: nowIso,
      auto_available_at: null,
      auto_off_reason: autoOffReason ?? null,
      last_toggle_type: toggleType,
      last_toggled_at: nowIso,
    })
    .eq('store_id', storeInternalId);
}

async function openStore(
  db: SupabaseClient,
  storeInternalId: number,
  availPatch: Record<string, unknown>,
  toggleType: string
): Promise<void> {
  const nowIso = new Date().toISOString();
  await db
    .from('merchant_stores')
    .update({
      operational_status: 'OPEN',
      ...merchantStoresOnlineFlags(true),
      last_activity_at: nowIso,
    })
    .eq('id', storeInternalId);
  await db
    .from('merchant_store_availability')
    .update({
      ...availPatch,
      is_available: true,
      is_accepting_orders: true,
      last_auto_action_at: nowIso,
      auto_available_at: nowIso,
      auto_unavailable_at: null,
      auto_off_reason: null,
      last_toggle_type: toggleType,
      last_toggled_at: nowIso,
    })
    .eq('store_id', storeInternalId);
}

function closeReasonForOutsideHours(schedule: ScheduleEvaluation): string {
  if (schedule.schedulePhase === 'BREAK') return 'Break between operating slots';
  if (schedule.schedulePhase === 'OFF_DAY') return 'Today Closed (Scheduled Closed)';
  return 'Outside operating hours';
}

/**
 * Keeps merchant_store_availability online flags aligned when merchant_stores is already gated
 * CLOSED but availability still has stale TRUE defaults (ensureAvailabilityRow parity, partial
 * updates, imports). Optionally fills schedule metadata when absent.
 */
export async function clampAvailabilityAcceptingFlagsIfOffline(
  db: SupabaseClient,
  storeInternalId: number,
  args: {
    storeEffectivelyOpen: boolean;
    withinOperatingHours: boolean;
    isTodayScheduledClosed: boolean;
    schedule: ScheduleEvaluation;
  }
): Promise<boolean> {
  if (args.storeEffectivelyOpen) return false;

  const { data: row } = await db
    .from('merchant_store_availability')
    .select('is_available, is_accepting_orders, unavailable_reason, close_reason')
    .eq('store_id', storeInternalId)
    .maybeSingle();

  if (!row || (row.is_available !== true && row.is_accepting_orders !== true)) {
    return false;
  }

  const hasUnavail =
    row.unavailable_reason != null && String(row.unavailable_reason).trim().length > 0;
  const nowStamp = new Date().toISOString();
  const patch: Record<string, unknown> = {
    is_available: false,
    is_accepting_orders: false,
    last_toggle_type: 'AUTO_CLOSE',
    last_toggled_at: nowStamp,
    last_auto_action_at: nowStamp,
    auto_unavailable_at: nowStamp,
    auto_available_at: null,
    auto_off_reason: 'availability_clamp',
  };

  const scheduleLikelyCause = !args.withinOperatingHours || args.isTodayScheduledClosed;

  if (!hasUnavail && scheduleLikelyCause) {
    patch.unavailable_reason = 'schedule_closed';
    patch.close_reason = args.isTodayScheduledClosed
      ? 'Today Closed (Scheduled Closed)'
      : closeReasonForOutsideHours(args.schedule);
  }

  await db.from('merchant_store_availability').update(patch).eq('store_id', storeInternalId);
  return true;
}

/** Partner UI gates on merchant_stores; availability can become schedule_closed first (clamp/cron/import). Offline triple + schedule_closed ⇒ align CLOSED triple on merchant_stores. Skips explicit manual_schedule override. */
export async function alignMerchantStoresIfAvailabilityScheduleOffline(
  db: SupabaseClient,
  storeInternalId: number,
  args: {
    gateSaysOpen: boolean;
    unavailableReason: string | null | undefined;
    isAvailable: boolean | null | undefined;
    isAcceptingOrders: boolean | null | undefined;
    isManualOverride: boolean;
  }
): Promise<boolean> {
  if (!args.gateSaysOpen || args.isManualOverride) return false;

  const online =
    args.isAvailable === true && args.isAcceptingOrders === true;
  if (online) return false;

  const norm = String(args.unavailableReason ?? '').trim().toLowerCase();
  if (norm !== 'schedule_closed') return false;

  const nowIso = new Date().toISOString();
  await db
    .from('merchant_stores')
    .update({
      operational_status: 'CLOSED',
      ...merchantStoresOnlineFlags(false),
      last_activity_at: nowIso,
    })
    .eq('id', storeInternalId);
  return true;
}

/**
 * Persist a consistent merchant_stores operational pack (operational_status + is_active +
 * is_accepting_orders + is_available + last_activity_at) when legacy/partial rows disagree
 * with whether the store should be fully online or fully offline.
 */
export async function normalizeMerchantStoresOperationalPack(
  db: SupabaseClient,
  storeInternalId: number,
  desiredTripleOnline: boolean
): Promise<boolean> {
  const { data: row } = await db
    .from('merchant_stores')
    .select('operational_status, is_active, is_accepting_orders, is_available')
    .eq('id', storeInternalId)
    .maybeSingle();

  const op = String(row?.operational_status ?? '').trim().toUpperCase();
  const tripleOnlinePack =
    op === 'OPEN' &&
    row?.is_active === true &&
    row?.is_accepting_orders === true &&
    row?.is_available === true;

  const tripleOfflinePack =
    op === 'CLOSED' &&
    row?.is_active === false &&
    row?.is_accepting_orders === false &&
    row?.is_available === false;

  const matches = desiredTripleOnline ? tripleOnlinePack : tripleOfflinePack;
  if (matches) return false;

  const nowIso = new Date().toISOString();
  await db
    .from('merchant_stores')
    .update({
      operational_status: desiredTripleOnline ? 'OPEN' : 'CLOSED',
      ...merchantStoresOnlineFlags(desiredTripleOnline),
      last_activity_at: nowIso,
    })
    .eq('id', storeInternalId);
  return true;
}

/**
 * True when the current wall-clock time is past the end of the LAST configured slot for today
 * (so the close should be tagged `schedule_end` rather than the generic `schedule_closed`).
 * Slot times come from `merchant_store_operating_hours` via `evaluateStoreSchedule`.
 */
function isPastFinalSlotPhase(schedule: ScheduleEvaluation): boolean {
  if (schedule.schedulePhase !== 'OUTSIDE_HOURS') return false;
  if (schedule.todaySlots.length === 0) return false;
  const lastSlot = [...schedule.todaySlots]
    .sort((a, b) => {
      const sa = parseInt(a.start.split(':')[0] ?? '0', 10) * 60 + parseInt(a.start.split(':')[1] ?? '0', 10);
      const sb = parseInt(b.start.split(':')[0] ?? '0', 10) * 60 + parseInt(b.start.split(':')[1] ?? '0', 10);
      return sa - sb;
    })
    .at(-1);
  if (!lastSlot) return false;
  const [hStr, mStr] = lastSlot.end.split(':');
  const lastEnd = (parseInt(hStr ?? '0', 10) || 0) * 60 + (parseInt(mStr ?? '0', 10) || 0);
  return schedule.minutesSinceMidnight >= lastEnd;
}

/**
 * Align DB operational status with schedule + availability flags.
 * Call on every GET /api/store-operations so UI and DB stay in sync between backend ticks.
 */
export async function syncOperationalStatusFromSchedule(args: {
  db: SupabaseClient;
  storeInternalId: number;
  storeTimezone: string;
  oh: Record<string, unknown> | null;
  initialOperationalStatus: string;
  avail: AvailabilityRow | null;
  schedule: ScheduleEvaluation;
  trace?: (step: string, payload: Record<string, unknown>) => void;
}): Promise<SyncScheduleResult> {
  const { db, storeInternalId, schedule } = args;
  const trace = args.trace ?? (() => {});
  const now = new Date();
  const nowMs = now.getTime();
  const mutations: string[] = [];

  const licenseSync = await syncMerchantLicenseCompliance(db, storeInternalId, { trace });
  const licenseEvaluation = licenseSync.evaluation;
  if (licenseSync.evaluation.blocked) {
    mutations.push('license_compliance_force_close');
    const { data: storeAfterLicense } = await db
      .from('merchant_stores')
      .select('operational_status')
      .eq('id', storeInternalId)
      .single();
    const effectiveStatus: 'OPEN' | 'CLOSED' =
      String(storeAfterLicense?.operational_status || 'CLOSED').toUpperCase() === 'OPEN' ? 'OPEN' : 'CLOSED';
    const availRow = (await loadAvailability(db, storeInternalId)) ?? args.avail;
    const manualCloseUntil = parseManualCloseUntil(availRow?.manual_close_until ?? null);
    trace('license_blocked_skip_schedule', {
      effective_status: effectiveStatus,
      expired: licenseSync.evaluation.expired.map((d) => d.prefix),
      pending: licenseSync.evaluation.pending_verification.map((d) => d.prefix),
    });
    return buildResult(effectiveStatus, manualCloseUntil, availRow, mutations, false, null, licenseEvaluation);
  }

  let effectiveStatus: 'OPEN' | 'CLOSED' =
    String(args.initialOperationalStatus || 'CLOSED').toUpperCase() === 'OPEN' ? 'OPEN' : 'CLOSED';

  let availRow: AvailabilityRow | null = args.avail;
  let manualCloseUntil = parseManualCloseUntil(availRow?.manual_close_until ?? null);
  const clearedStaleScheduleVacAvail = await clearStaleScheduledClosureVacationOnAvailability(
    db,
    storeInternalId
  );
  if (clearedStaleScheduleVacAvail) {
    availRow = (await loadAvailability(db, storeInternalId)) ?? availRow;
    manualCloseUntil = parseManualCloseUntil(availRow?.manual_close_until ?? null);
    mutations.push('clear_stale_scheduled_closure_vacation_avail');
    trace('clear_stale_scheduled_closure_vacation_avail', {});
  }
  const blockAutoOpen = availRow?.block_auto_open === true;
  const autoOpenEnabled = isAutoOpenFromScheduleEnabled(availRow?.auto_open_from_schedule);
  const manualIndefinite = isManualIndefinite(availRow?.unavailable_reason);
  const isManualOverride = availRow?.is_manual_override === true;
  const { withinOperatingHours, isTodayScheduledClosed, schedulePhase } = schedule;

  let promptExpiresAt = parseIsoDate(availRow?.schedule_end_prompt_expires_at ?? null);
  let scheduleEndPromptActive = !!promptExpiresAt && nowMs < promptExpiresAt.getTime();

  const { data: storeLive } = await db
    .from('merchant_stores')
    .select('operational_status, is_active, is_accepting_orders, is_available')
    .eq('id', storeInternalId)
    .single();

  /** Single-table hint: CLOSED ops + orphaned `is_active`/triple must still trigger schedule close. */
  const storeRowShowsOnline =
    String(storeLive?.operational_status || '').toUpperCase() === 'OPEN' ||
    storeLive?.is_active === true ||
    storeLive?.is_accepting_orders === true ||
    storeLive?.is_available === true;

  const vacationCtx = await loadActiveVacationContext(db, storeInternalId);
  if (vacationCtx && (effectiveStatus === 'OPEN' || storeRowShowsOnline)) {
    const closeReasonLine = vacationCtx.merchantReasonDetail
      ? `Vacation · ${vacationCtx.merchantReasonDetail}`
      : 'Vacation mode active';
    await closeStore(db, storeInternalId, {
      unavailable_reason: 'vacation',
      close_reason: closeReasonLine,
      manual_close_until: vacationCtx.endsAtIso,
      restriction_type: 'VACATION',
      is_manual_override: false,
      schedule_end_prompted_at: null,
      schedule_end_prompt_expires_at: null,
    }, 'AUTO_CLOSE', 'vacation');
    effectiveStatus = 'CLOSED';
    availRow = (await loadAvailability(db, storeInternalId)) ?? availRow;
    manualCloseUntil = parseManualCloseUntil(availRow?.manual_close_until ?? null);
    mutations.push('vacation_force_close');
    trace('vacation_force_close', { effective_status: effectiveStatus, vacationEndsAt: vacationCtx.endsAtIso });
    return buildResult(effectiveStatus, manualCloseUntil, availRow, mutations, scheduleEndPromptActive, promptExpiresAt, licenseEvaluation);
  }

  // Scheduled off day: always CLOSED (manual override cannot keep store online)
  if (
    isTodayScheduledClosed &&
    (effectiveStatus === 'OPEN' ||
      storeRowShowsOnline ||
      availRow?.is_available === true ||
      availRow?.is_accepting_orders === true)
  ) {
    await closeStore(db, storeInternalId, {
      unavailable_reason: 'schedule_closed',
      close_reason: 'Today Closed (Scheduled Closed)',
      restriction_type: 'schedule',
      is_manual_override: false,
      schedule_end_prompted_at: null,
      schedule_end_prompt_expires_at: null,
    }, 'AUTO_CLOSE', 'scheduled_off_day');
    effectiveStatus = 'CLOSED';
    availRow = (await loadAvailability(db, storeInternalId)) ?? availRow;
    mutations.push('force_close_scheduled_off_day');
    trace('force_close_scheduled_off_day', { effective_status: effectiveStatus });
    return buildResult(effectiveStatus, manualCloseUntil, availRow, mutations, false, null, licenseEvaluation);
  }

  // Manual activation lock
  if (blockAutoOpen && (effectiveStatus === 'OPEN' || storeRowShowsOnline)) {
    await closeStore(db, storeInternalId, {
      unavailable_reason: 'forced_lock',
      close_reason: 'Store locked manually',
      restriction_type: 'lock',
      is_manual_override: false,
      schedule_end_prompted_at: null,
      schedule_end_prompt_expires_at: null,
    }, 'LOCK_APPLIED', 'forced_lock');
    effectiveStatus = 'CLOSED';
    availRow = (await loadAvailability(db, storeInternalId)) ?? availRow;
    mutations.push('forced_lock_close');
    trace('forced_lock_close', { effective_status: effectiveStatus });
    return buildResult(effectiveStatus, manualCloseUntil, availRow, mutations, false, null, licenseEvaluation);
  }

  const manualCloseActive = !!manualCloseUntil && nowMs < manualCloseUntil.getTime();
  const orphanManualClose =
    String(availRow?.unavailable_reason ?? '')
      .trim()
      .toLowerCase() === 'manual_close' && !manualCloseUntil;
  if (manualCloseActive || manualIndefinite || orphanManualClose) {
    trace('manual_hold_skip_auto', {
      manual_close_active: manualCloseActive,
      manual_indefinite: manualIndefinite,
      orphan_manual_close: orphanManualClose,
      effective_status: effectiveStatus,
    });
    return buildResult(effectiveStatus, manualCloseUntil, availRow, mutations, scheduleEndPromptActive, promptExpiresAt, licenseEvaluation);
  }

  // Expired temp close
  if (manualCloseUntil && nowMs >= manualCloseUntil.getTime()) {
    if (
      autoOpenEnabled &&
      !blockAutoOpen &&
      !manualIndefinite &&
      !isTodayScheduledClosed &&
      args.oh &&
      withinOperatingHours
    ) {
      await openStore(db, storeInternalId, {
        manual_close_until: null,
        unavailable_reason: null,
        close_reason: null,
        restriction_type: null,
        is_manual_override: false,
        schedule_end_prompted_at: null,
        schedule_end_prompt_expires_at: null,
      }, 'AUTO_REOPEN');
      effectiveStatus = 'OPEN';
      manualCloseUntil = null;
      availRow = (await loadAvailability(db, storeInternalId)) ?? availRow;
      mutations.push('manual_until_expired_auto_open');
    } else {
      await db
        .from('merchant_store_availability')
        .update({
          manual_close_until: null,
          restriction_type: null,
          unavailable_reason: null,
        })
        .eq('store_id', storeInternalId);
      manualCloseUntil = null;
      const { data: storeAfter } = await db
        .from('merchant_stores')
        .select('operational_status')
        .eq('id', storeInternalId)
        .single();
      effectiveStatus =
        String(storeAfter?.operational_status || 'CLOSED').toUpperCase() === 'OPEN' ? 'OPEN' : 'CLOSED';
      availRow = (await loadAvailability(db, storeInternalId)) ?? availRow;
      mutations.push('manual_until_expired_clear');
    }
    trace('after_manual_close_until_expiry', { effective_status: effectiveStatus, mutations });
  }

  // Mid-day break — force offline so the store auto-closes at slot 1 end (2:00 PM) and stays
  // closed until slot 2 starts (5:00 PM). Manual override (merchant explicitly turned ON
  // during break) bypasses this so the merchant can keep accepting orders mid-break.
  if (
    (effectiveStatus === 'OPEN' || storeRowShowsOnline) &&
    args.oh &&
    (schedulePhase === 'BREAK' ||
      isInBreakBetweenSlots(args.oh, schedule.dayName, schedule.minutesSinceMidnight))
  ) {
    if (isManualOverride) {
      trace('break_manual_override_skip', { schedule_phase: schedulePhase });
      return buildResult(
        effectiveStatus,
        manualCloseUntil,
        availRow,
        mutations,
        scheduleEndPromptActive,
        promptExpiresAt,
        licenseEvaluation
      );
    }
    await closeStore(
      db,
      storeInternalId,
      {
        unavailable_reason: 'schedule_closed',
        close_reason: 'Break between operating slots',
        restriction_type: 'schedule',
        is_manual_override: false,
        schedule_end_prompted_at: null,
        schedule_end_prompt_expires_at: null,
      },
      'AUTO_CLOSE',
      'schedule_break'
    );
    effectiveStatus = 'CLOSED';
    availRow = (await loadAvailability(db, storeInternalId)) ?? availRow;
    mutations.push('auto_close_break');
    trace('auto_close_break_priority', { schedule_phase: schedulePhase });
    return buildResult(effectiveStatus, manualCloseUntil, availRow, mutations, false, null, licenseEvaluation);
  }

  // OPEN while outside hours — always enforce schedule (even when auto-open is disabled).
  //
  // Priority order:
  //   1. Manual override (`is_manual_override = true`): merchant explicitly overrode the
  //      schedule. Skip auto-close so the override actually sticks. The merchant retains the
  //      manual ON state until they manually close.
  //   2. Active rush window (`merchant_store_rush_windows`): skip auto-close while a partner-
  //      configured rush is live.
  //   3. Otherwise (auto behaviour): close IMMEDIATELY at the slot boundary. No 5-minute
  //      end-of-day prompt — the merchant's stated expectation is "at exactly 11:00 PM →
  //      automatically OFFLINE". All slot times come from `merchant_store_operating_hours`.
  if (!withinOperatingHours && (effectiveStatus === 'OPEN' || storeRowShowsOnline)) {
    /** Manual open before today's first slot is not treated as schedule override — stay CLOSED until the slot starts (auto-open). */
    if (
      isManualOverride &&
      !isBeforeFirstSlotToday(schedule, schedule.minutesSinceMidnight)
    ) {
      trace('outside_hours_manual_override_skip', { schedule_phase: schedulePhase });
      return buildResult(
        effectiveStatus,
        manualCloseUntil,
        availRow,
        mutations,
        scheduleEndPromptActive,
        promptExpiresAt,
        licenseEvaluation
      );
    }

    if (await hasActiveRushWindow(db, storeInternalId)) {
      trace('outside_hours_rush_skip', { schedule_phase: schedulePhase });
      return buildResult(
        effectiveStatus,
        manualCloseUntil,
        availRow,
        mutations,
        scheduleEndPromptActive,
        promptExpiresAt,
        licenseEvaluation
      );
    }

    // Always immediate close. `getOutsideHoursClosePolicy` only returns 'immediate' now; the
    // call is kept so the trace records the schedule phase the auto-close ran under.
    const closePolicy = getOutsideHoursClosePolicy(schedule);
    const closeReason = closeReasonForOutsideHours(schedule);

    await closeStore(
      db,
      storeInternalId,
      {
        unavailable_reason: 'schedule_closed',
        close_reason: closeReason,
        restriction_type: 'schedule',
        is_manual_override: false,
        schedule_end_prompted_at: null,
        schedule_end_prompt_expires_at: null,
      },
      'AUTO_CLOSE',
      schedule.schedulePhase === 'BREAK'
        ? 'schedule_break'
        : isPastFinalSlotPhase(schedule)
          ? 'schedule_end'
          : 'schedule_closed'
    );
    effectiveStatus = 'CLOSED';
    availRow = (await loadAvailability(db, storeInternalId)) ?? availRow;
    mutations.push(
      schedule.schedulePhase === 'BREAK' ? 'auto_close_break' : 'auto_close_outside_hours'
    );
    trace('auto_close_outside_hours_immediate', {
      schedule_phase: schedulePhase,
      close_policy: closePolicy,
    });
    return buildResult(effectiveStatus, manualCloseUntil, availRow, mutations, false, null, licenseEvaluation);
  }

  if (!autoOpenEnabled || blockAutoOpen) {
    return buildResult(effectiveStatus, manualCloseUntil, availRow, mutations, scheduleEndPromptActive, promptExpiresAt, licenseEvaluation);
  }

  // Auto-open at slot start (never during break / pre-break alert window)
  if (
    args.oh &&
    withinOperatingHours &&
    !isTodayScheduledClosed &&
    schedulePhase !== 'BREAK' &&
    schedulePhase !== 'PRE_BREAK' &&
    !isInBreakBetweenSlots(args.oh, schedule.dayName, schedule.minutesSinceMidnight) &&
    effectiveStatus === 'CLOSED'
  ) {
    const { data: recheck } = await db
      .from('merchant_stores')
      .select('operational_status')
      .eq('id', storeInternalId)
      .single();
    if (String(recheck?.operational_status || '').toUpperCase() === 'OPEN') {
      effectiveStatus = 'OPEN';
      availRow = (await loadAvailability(db, storeInternalId)) ?? availRow;
      mutations.push('recheck_already_open');
    } else {
      await openStore(db, storeInternalId, {
        unavailable_reason: null,
        close_reason: null,
        restriction_type: 'schedule',
        is_manual_override: false,
        schedule_end_prompted_at: null,
        schedule_end_prompt_expires_at: null,
      }, 'AUTO_OPEN');
      effectiveStatus = 'OPEN';
      availRow = (await loadAvailability(db, storeInternalId)) ?? availRow;
      mutations.push('auto_open');
    }
    trace('auto_open_branch', { effective_status: effectiveStatus });
    return buildResult(effectiveStatus, manualCloseUntil, availRow, mutations, false, null, licenseEvaluation);
  }

  // Clear stale prompt when already closed outside hours
  if (effectiveStatus === 'CLOSED' && !withinOperatingHours && availRow?.schedule_end_prompt_expires_at) {
    await db
      .from('merchant_store_availability')
      .update({
        schedule_end_prompted_at: null,
        schedule_end_prompt_expires_at: null,
      })
      .eq('store_id', storeInternalId);
    availRow = (await loadAvailability(db, storeInternalId)) ?? availRow;
    mutations.push('clear_stale_schedule_end_prompt');
  }

  void args.storeTimezone;
  return buildResult(effectiveStatus, manualCloseUntil, availRow, mutations, scheduleEndPromptActive, promptExpiresAt, licenseEvaluation);
}

const AVAIL_SELECT =
  'manual_close_until, close_reason, auto_open_from_schedule, block_auto_open, restriction_type, unavailable_reason, is_available, is_accepting_orders, is_manual_override, schedule_end_prompt_expires_at, schedule_end_prompted_at, last_toggled_by_email, last_toggled_by_name, last_toggled_by_id, last_toggle_type, last_toggled_at';

/**
 * Re-run schedule sync immediately after outlet timings change (no stale slot cache).
 */
export async function syncStoreStatusAfterOperatingHoursChange(
  db: SupabaseClient,
  storeInternalId: number,
  storeTimezone: string
): Promise<SyncScheduleResult | null> {
  // Overwriting the schedule is an explicit re-intent: drop any lingering TRANSIENT
  // manual close (temp close / "closed until reopened") so the fresh hours take effect
  // immediately and the schedule sync below can auto-open when we are now within a slot.
  // Without this, syncOperationalStatusFromSchedule returns early at the
  // `manualCloseActive || manualIndefinite` guard and the store stays closed even though
  // the merchant just edited the hours to be open now. Deliberate controls are preserved:
  // the "Manual activation lock" (block_auto_open) and an active vacation are left alone.
  const { data: preAvail } = await db
    .from('merchant_store_availability')
    .select('block_auto_open, unavailable_reason')
    .eq('store_id', storeInternalId)
    .maybeSingle();
  const preUnavail = String(
    (preAvail as { unavailable_reason?: string | null } | null)?.unavailable_reason ?? ''
  )
    .trim()
    .toLowerCase();
  const preLocked =
    (preAvail as { block_auto_open?: boolean | null } | null)?.block_auto_open === true;
  const clearManual =
    !preLocked && (preUnavail === 'manual_indefinite' || preUnavail === 'manual_close');

  await db
    .from('merchant_store_availability')
    .update({
      schedule_end_prompted_at: null,
      schedule_end_prompt_expires_at: null,
      ...(clearManual
        ? {
            manual_close_until: null,
            unavailable_reason: null,
            close_reason: null,
            restriction_type: null,
            is_manual_override: false,
            manual_override_at: null,
          }
        : {}),
    })
    .eq('store_id', storeInternalId);

  const { data: store } = await db
    .from('merchant_stores')
    .select('operational_status')
    .eq('id', storeInternalId)
    .single();
  const { data: avail } = await db
    .from('merchant_store_availability')
    .select(AVAIL_SELECT)
    .eq('store_id', storeInternalId)
    .single();
  const { data: oh } = await db
    .from('merchant_store_operating_hours')
    .select('*')
    .eq('store_id', storeInternalId)
    .maybeSingle();

  const ohRecord = (oh ?? null) as Record<string, unknown> | null;
  const schedule = evaluateStoreSchedule(ohRecord, storeTimezone);

  return syncOperationalStatusFromSchedule({
    db,
    storeInternalId,
    storeTimezone,
    oh: ohRecord,
    initialOperationalStatus: (store?.operational_status as string) || 'CLOSED',
    avail: (avail as AvailabilityRow | null) ?? null,
    schedule,
    trace: (step, payload) => {
      if (process.env.STORE_OPERATIONS_DEBUG === '1') {
        console.log(`[store-ops:timings-sync] ${step}`, payload);
      }
    },
  });
}

function buildResult(
  effectiveStatus: 'OPEN' | 'CLOSED',
  manualCloseUntil: Date | null,
  availFinal: AvailabilityRow | null,
  mutations: string[],
  scheduleEndPromptActive: boolean,
  promptExpiresAt: Date | null,
  licenseEvaluation: MerchantLicenseEvaluation
): SyncScheduleResult {
  return {
    effectiveStatus,
    manualCloseUntil,
    availFinal,
    mutations,
    scheduleEndPromptActive,
    scheduleEndPromptExpiresAt: promptExpiresAt ? promptExpiresAt.toISOString() : null,
    licenseEvaluation,
  };
}
