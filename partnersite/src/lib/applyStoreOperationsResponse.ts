import { partnerSurfaceOnlineFromStoreOperationsBody } from '@/lib/partnerStoreSurfaceOnline';
import { useLocalStoreStatusEngineStore } from '@/lib/localStoreStatusEngineStore';
import { isStoreDelisted } from '@/lib/store-delist';

export type ScheduledTimeOffRow = {
  id: number;
  reason: string | null;
  starts_at: string;
  ends_at: string;
  status: string;
  phase: 'active' | 'upcoming';
  marked_from: string | null;
};

export type ActiveRushRow = {
  is_active: true;
  remaining_minutes: number;
  marked_from: string | null;
};

export type StoreOperationsUiPatch = {
  isStoreOpen: boolean;
  opensAt: string | null;
  todaySlots: { start: string; end: string }[];
  openingTime: string | null;
  closingTime: string | null;
  schedulePhase: string | null;
  withinOperatingHours: boolean | null;
  scheduleStatusLabel: string | null;
  isTodayScheduledClosed: boolean;
  configuredTodaySlots: { start: string; end: string }[];
  lastToggleBy: string | null;
  lastToggleType: string | null;
  lastToggledByName: string | null;
  lastToggledById: string | null;
  restrictionType: string | null;
  withinHoursButRestricted: boolean;
  lastToggledAt: string | null;
  manualActivationLock: boolean;
  licenseBlockedForOps: boolean;
  closeReasonFromOps: string | null;
  nextScheduleTransitionAt: string | null;
  countdownAt: string | null;
  countdownKind: string | null;
  countdownWallLabel: string | null;
  scheduledTimeOffs: ScheduledTimeOffRow[];
  activeRush: ActiveRushRow | null;
  scheduleEndPromptActive: boolean;
};

function parseScheduledTimeOffsFromApi(raw: unknown): ScheduledTimeOffRow[] {
  if (!Array.isArray(raw)) return [];
  const out: ScheduledTimeOffRow[] = [];
  for (const item of raw) {
    if (item == null || typeof item !== 'object') continue;
    const o = item as Record<string, unknown>;
    const id = Number(o.id);
    const starts_at = o.starts_at != null ? String(o.starts_at) : '';
    const ends_at = o.ends_at != null ? String(o.ends_at) : '';
    const status = o.status != null ? String(o.status) : '';
    const phase = o.phase === 'active' || o.phase === 'upcoming' ? o.phase : null;
    const reason =
      typeof o.reason === 'string' && o.reason.trim() !== '' ? o.reason.trim() : null;
    const marked_from =
      o.marked_from != null && String(o.marked_from).trim() !== '' ? String(o.marked_from).trim() : null;
    if (!Number.isFinite(id) || !starts_at || !ends_at || !phase) continue;
    out.push({ id, reason, starts_at, ends_at, status, phase, marked_from });
  }
  return out;
}

function parseActiveRushFromApi(raw: unknown): ActiveRushRow | null {
  if (raw == null || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  if (o.is_active !== true) return null;
  const remaining = Number(o.remaining_minutes);
  return {
    is_active: true,
    remaining_minutes: Number.isFinite(remaining) ? remaining : 0,
    marked_from:
      o.marked_from != null && String(o.marked_from).trim() !== '' ? String(o.marked_from).trim() : null,
  };
}

/** Map GET /api/store-operations JSON into dashboard store-status card state. */
export function deriveStoreOperationsUiPatch(raw: unknown): StoreOperationsUiPatch {
  const data = raw as Record<string, unknown>;
  const surfaceOnline = partnerSurfaceOnlineFromStoreOperationsBody(data);
  const delisted = isStoreDelisted(data);
  const openForPartnerUi = delisted ? false : (surfaceOnline ?? false);
  const slots = (data.today_slots || []) as { start: string; end: string }[];
  const activeSlot = (data.active_slot ?? null) as { start: string; end: string } | null;
  const displaySlot = activeSlot ?? slots[0] ?? null;
  const configured = (data.configured_today_slots || []) as { start: string; end: string }[];
  const rt = data.restriction_type != null ? String(data.restriction_type).toLowerCase() : '';
  const manualUntil =
    typeof data.manual_close_until === 'string' && data.manual_close_until.trim() !== ''
      ? data.manual_close_until.trim()
      : null;
  const closeReason =
    typeof data.close_reason === 'string' && data.close_reason.trim() !== ''
      ? data.close_reason.trim()
      : null;

  useLocalStoreStatusEngineStore.getState().syncFromStoreOperations({
    operationalOpen: openForPartnerUi,
    manualCloseUntil: manualUntil,
    manualCloseReason: closeReason,
  });

  if (!delisted && data.schedule_end_prompt_active === true) {
    useLocalStoreStatusEngineStore.getState().openScheduleEndModal();
  }

  return {
    isStoreOpen: openForPartnerUi,
    opensAt: delisted ? null : ((data.opens_at as string | null | undefined) ?? null),
    todaySlots: slots,
    openingTime: displaySlot?.start ?? null,
    closingTime: displaySlot?.end ?? null,
    schedulePhase: typeof data.schedule_phase === 'string' ? data.schedule_phase : null,
    withinOperatingHours:
      typeof data.within_operating_hours === 'boolean' ? data.within_operating_hours : null,
    scheduleStatusLabel:
      typeof data.schedule_status_label === 'string' ? data.schedule_status_label : null,
    isTodayScheduledClosed: data.is_today_scheduled_closed === true,
    configuredTodaySlots: configured,
    lastToggleBy: (data.last_toggled_by_email as string | null | undefined) ?? null,
    lastToggleType: (data.last_toggle_type as string | null | undefined) ?? null,
    lastToggledByName: (data.last_toggled_by_name as string | null | undefined) ?? null,
    lastToggledById:
      data.last_toggled_by_id != null ? String(data.last_toggled_by_id) : null,
    restrictionType: rt === 'manual_hold' ? 'MANUAL_HOLD' : ((data.restriction_type as string | null | undefined) ?? null),
    withinHoursButRestricted: delisted ? false : data.within_hours_but_restricted === true,
    lastToggledAt: (data.last_toggled_at as string | null | undefined) ?? null,
    manualActivationLock: data.block_auto_open === true,
    licenseBlockedForOps: data.license_blocked === true,
    closeReasonFromOps: closeReason,
    nextScheduleTransitionAt: delisted
      ? null
      : typeof data.next_schedule_transition_at === 'string'
        ? data.next_schedule_transition_at
        : null,
    countdownAt: delisted ? null : typeof data.countdown_at === 'string' ? data.countdown_at : null,
    countdownKind: delisted ? null : typeof data.countdown_kind === 'string' ? data.countdown_kind : null,
    countdownWallLabel: delisted
      ? null
      : typeof data.countdown_wall_label === 'string'
        ? data.countdown_wall_label
        : null,
    scheduledTimeOffs: parseScheduledTimeOffsFromApi(data.scheduled_time_offs),
    activeRush: parseActiveRushFromApi(data.active_rush),
    scheduleEndPromptActive: data.schedule_end_prompt_active === true,
  };
}

/** Read last-known open/closed from localStorage engine (instant paint before network). */
export function readCachedStoreOpenFromEngine(storeId: string): boolean | null {
  if (typeof window === 'undefined' || !storeId) return null;
  try {
    const raw = localStorage.getItem(`gm_local_store_status_engine_${storeId}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { store_status?: string };
    if (parsed.store_status === 'ONLINE') return true;
    if (parsed.store_status === 'OFFLINE') return false;
    return null;
  } catch {
    return null;
  }
}
