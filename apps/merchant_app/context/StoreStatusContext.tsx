/** Store status display + manual actions. Backend owns schedule / operational truth. */
import { createContext, useContext, useState, useCallback, useEffect, useMemo, useRef, type ReactNode } from "react";
import { Alert, AppState, type AppStateStatus } from "react-native";
import { useRouter } from "expo-router";
import { isAppForeground } from "@/lib/appForeground";
import * as SecureStore from "expo-secure-store";
import { useAuth } from "@/context/AuthContext";
import { useSelectedStore } from "@/context/SelectedStoreContext";
import {
  getStoreStatus,
  updateStoreStatus,
  updateAutoOpenFromSchedule,
  updateManualActivationLock,
  respondScheduleEndPrompt,
  type ScheduledClosure,
  type ActiveRushWindow,
} from "@/services/storeStatusApi";
import {
  MERCHANT_DELIST_SUPPORT_HREF,
  showStoreDelistedAlert,
  needsManualOpenAfterRelist,
} from "@/lib/storeDelist";
import {
  getMerchantStoreDelistSnapshot,
  subscribeMerchantStoreDelist,
} from "@/lib/merchantStoreDelistBus";
const STATUS_CACHE_KEY_PREFIX = "merchant_store_status_";

/** Poll interval for status (schedule / auto open-close). Realtime + resume cover the rest. */
const STATUS_POLL_INTERVAL_MS = 60_000;

export type CloseStoreOptions = {
  manual_close_until?: string | null;
  manual_close_reason?: string | null;
};

type StoreStatusContextValue = {
  isOnline: boolean;
  loading: boolean;
  toggle: (closeOptions?: CloseStoreOptions) => Promise<void>;
  /** Set store closed with options (e.g. "closed for today"). Use when store may already be offline. */
  closeStore: (closeOptions: CloseStoreOptions) => Promise<void>;
  refresh: () => Promise<void>;
  /** Timestamp of last successful GET /status refresh (for UI / diagnostics). */
  lastRefreshedAt: number | null;
  autoOpenFromSchedule: boolean;
  manualActivationLock: boolean;
  toggleAutoOpenFromSchedule: () => void;
  toggleManualActivationLock: () => void;
  manualCloseUntil: string | null;
  manualCloseReason: string | null;
  manualCloseStartAt: string | null;
  closedBy: string | null;
  closedById: string | null;
  restrictionType: string | null;
  /** When store is in scheduled closure, from/to/reason from API. */
  scheduledClosure: ScheduledClosure | null;
  /** Upcoming scheduled closure (not active yet). */
  upcomingScheduledClosure: ScheduledClosure | null;
  activeRush: ActiveRushWindow | null;
  /** Offline reason: manual_lock | manual_close | schedule_closed | outside_operating_hours */
  statusReason: string | null;
  /** Backend unavailable_reason (manual_close, schedule_closed, manual_indefinite, etc.) */
  unavailableReason: string | null;
  nextOpenTime: string | null;
  nextCloseTime: string | null;
  /** Auto reopen instant from backend (`merchant_store_availability.auto_available_at`). */
  autoAvailableAt: string | null;
  /** Next reopen time (ISO) for countdown when closed by schedule or manual temp close */
  reopenAtIso: string | null;
  /** Next open time from schedule (API next_open_iso); use as fallback for "Reopen at" when closed */
  nextOpenIso: string | null;
  /** Inside operating hours but store held closed (manual lock / temp) — hide slot countdown like dashboard. */
  withinHoursButRestricted: boolean;
  /** Last status toggle (for "Last: Opened by ..." line). */
  lastToggleType: string | null;
  lastToggledAt: string | null;
  lastToggledByName: string | null;
  lastToggledById: string | null;
  lastToggledByEmail: string | null;
  scheduleEndPromptActive: boolean;
  scheduleEndPromptExpiresAt: string | null;
  isDelisted: boolean;
  licenseBlocked: boolean;
  needsManualOpenAfterRelist: boolean;
};

const StoreStatusContext = createContext<StoreStatusContextValue | null>(null);

export function StoreStatusProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { token } = useAuth();
  const { selectedStore } = useSelectedStore();
  const [isOnline, setIsOnline] = useState(false);
  const [loading, setLoading] = useState(false);
  const [autoOpenFromSchedule, setAutoOpenFromSchedule] = useState(true);
  const [manualActivationLock, setManualActivationLock] = useState(false);
  const [manualCloseUntil, setManualCloseUntil] = useState<string | null>(null);
  const [manualCloseReason, setManualCloseReason] = useState<string | null>(null);
  const [manualCloseStartAt, setManualCloseStartAt] = useState<string | null>(null);
  const [closedBy, setClosedBy] = useState<string | null>(null);
  const [closedById, setClosedById] = useState<string | null>(null);
  const [restrictionType, setRestrictionType] = useState<string | null>(null);
  const [scheduledClosure, setScheduledClosure] = useState<ScheduledClosure | null>(null);
  const [upcomingScheduledClosure, setUpcomingScheduledClosure] = useState<ScheduledClosure | null>(null);
  const [activeRush, setActiveRush] = useState<ActiveRushWindow | null>(null);
  const [statusReason, setStatusReason] = useState<string | null>(null);
  const [unavailableReason, setUnavailableReason] = useState<string | null>(null);
  const [nextOpenTime, setNextOpenTime] = useState<string | null>(null);
  const [nextCloseTime, setNextCloseTime] = useState<string | null>(null);
  const [nextOpenIso, setNextOpenIso] = useState<string | null>(null);
  const [autoAvailableAt, setAutoAvailableAt] = useState<string | null>(null);
  const [withinHoursButRestricted, setWithinHoursButRestricted] = useState(false);
  const [lastToggleType, setLastToggleType] = useState<string | null>(null);
  const [lastToggledAt, setLastToggledAt] = useState<string | null>(null);
  const [lastToggledByName, setLastToggledByName] = useState<string | null>(null);
  const [lastToggledById, setLastToggledById] = useState<string | null>(null);
  const [lastToggledByEmail, setLastToggledByEmail] = useState<string | null>(null);
  const [scheduleEndPromptExpiresAt, setScheduleEndPromptExpiresAt] = useState<string | null>(null);
  const [isDelisted, setIsDelisted] = useState(false);
  const [licenseBlocked, setLicenseBlocked] = useState(false);
  const scheduleEndPromptShownRef = useRef<string | null>(null);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<number | null>(null);

  const storeId = selectedStore?.id ?? null;
  const goToDelistSupport = useCallback(() => {
    router.push(MERCHANT_DELIST_SUPPORT_HREF as never);
  }, [router]);
  const refreshIdRef = useRef(0);
  const lastRefreshAtRef = useRef(0);
  const initialLoadDoneRef = useRef(false);
  /** Refs so we can preserve temp close when a stale GET returns null for manual_close_until. */
  const manualCloseUntilRef = useRef<string | null>(null);
  const manualCloseReasonRef = useRef<string | null>(null);

  // Restore cached status so Store Status card shows instantly on app open.
  useEffect(() => {
    if (!storeId) return;
    let cancelled = false;
    const key = `${STATUS_CACHE_KEY_PREFIX}${storeId}`;
    SecureStore.getItemAsync(key)
      .then((raw) => {
        if (cancelled || !raw) return;
        try {
          const c = JSON.parse(raw) as Record<string, unknown>;
          if (c && typeof c.is_open === "boolean") {
            setIsOnline(c.is_open);
            if (c.auto_open_from_schedule != null) setAutoOpenFromSchedule(!!c.auto_open_from_schedule);
            if (c.manual_close_until != null) setManualCloseUntil(c.manual_close_until as string | null);
            if (c.manual_close_reason != null) setManualCloseReason(c.manual_close_reason as string | null);
            if (c.unavailable_reason != null) setUnavailableReason(c.unavailable_reason as string | null);
            if (c.status_reason != null) setStatusReason(c.status_reason as string | null);
            if (c.next_open_iso != null) setNextOpenIso(c.next_open_iso as string | null);
            if (c.auto_available_at != null) setAutoAvailableAt(c.auto_available_at as string | null);
            if (c.within_hours_but_restricted != null) setWithinHoursButRestricted(!!c.within_hours_but_restricted);
            if (c.last_toggle_type != null) setLastToggleType(c.last_toggle_type as string | null);
            if (c.last_toggled_at != null) setLastToggledAt(c.last_toggled_at as string | null);
            if (c.last_toggled_by_name != null) setLastToggledByName(c.last_toggled_by_name as string | null);
            if (c.last_toggled_by_id != null) setLastToggledById(c.last_toggled_by_id as string | null);
            if (c.last_toggled_by_email != null) setLastToggledByEmail(c.last_toggled_by_email as string | null);
            if (c.closed_by != null) setClosedBy(c.closed_by as string | null);
            if (c.closed_by_id != null) setClosedById(c.closed_by_id as string | null);
            if (c.scheduled_closure != null) setScheduledClosure(c.scheduled_closure as ScheduledClosure | null);
            if (c.scheduled_closure_upcoming != null) setUpcomingScheduledClosure(c.scheduled_closure_upcoming as ScheduledClosure | null);
            if (c.is_delisted === true) {
              setIsDelisted(true);
              setIsOnline(false);
            }
          }
        } catch {
          // ignore parse error
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [storeId]);

  const refresh = useCallback(async () => {
    if (!token || !storeId) {
      setIsOnline(false);
      setIsDelisted(false);
      setLicenseBlocked(false);
      setAutoOpenFromSchedule(true);
      setManualActivationLock(false);
      setManualCloseUntil(null);
      setManualCloseReason(null);
      manualCloseUntilRef.current = null;
      manualCloseReasonRef.current = null;
      setManualCloseStartAt(null);
      setClosedBy(null);
      setClosedById(null);
      setRestrictionType(null);
      setScheduledClosure(null);
      setUpcomingScheduledClosure(null);
      setActiveRush(null);
      setStatusReason(null);
      setUnavailableReason(null);
      setNextOpenTime(null);
      setNextCloseTime(null);
      setNextOpenIso(null);
      setAutoAvailableAt(null);
      setWithinHoursButRestricted(false);
      setLastToggleType(null);
      setLastToggledAt(null);
      setLastToggledByName(null);
      setLastToggledById(null);
      setLastToggledByEmail(null);
      return;
    }
    const myRefreshId = ++refreshIdRef.current;
    // Don't show loading on first load so status card appears instantly.
    if (initialLoadDoneRef.current) setLoading(true);
    try {
      const status = await getStoreStatus(storeId, token);
      if (myRefreshId !== refreshIdRef.current) {
        setLoading(false);
        return;
      }
      const fromApiUntil =
        status.manual_close_until != null && String(status.manual_close_until).trim() !== ""
          ? String(status.manual_close_until).trim()
          : null;
      const fromApiReason = status.manual_close_reason ?? null;
      const unavailNorm =
        (status as { unavailable_reason?: string | null }).unavailable_reason != null
          ? String((status as { unavailable_reason?: string | null }).unavailable_reason).trim().toLowerCase()
          : "";
      const statusNorm = status.status_reason != null ? String(status.status_reason).trim().toLowerCase() : "";

      // Guard: avoid dropping a future manual_close_until due to transient API nulls.
      // If we are in a manual closure state and the previous until is still in the future, keep it.
      const prevUntil = manualCloseUntilRef.current;
      const prevUntilMs = prevUntil ? new Date(prevUntil).getTime() : NaN;
      const prevStillFuture = Number.isFinite(prevUntilMs) && prevUntilMs > Date.now();
      const apiSaysManual =
        unavailNorm === "manual_close" ||
        unavailNorm === "manual_indefinite" ||
        statusNorm === "manual_close" ||
        statusNorm === "manual_indefinite";
      const effectiveUntil = fromApiUntil == null && prevStillFuture && apiSaysManual ? prevUntil : fromApiUntil;
      const effectiveReason =
        fromApiReason == null &&
        manualCloseReasonRef.current != null &&
        String(manualCloseReasonRef.current).trim() !== "" &&
        apiSaysManual
          ? manualCloseReasonRef.current
          : fromApiReason;

      const delisted = status.is_delisted === true;
      setIsDelisted(delisted);
      setLicenseBlocked(status.license_blocked === true);
      setIsOnline(delisted || status.license_blocked === true ? false : status.is_open);
      setAutoOpenFromSchedule(status.auto_open_from_schedule);
      setManualActivationLock(status.block_auto_open);
      setManualCloseUntil(effectiveUntil);
      setManualCloseReason(effectiveReason);
      manualCloseUntilRef.current = effectiveUntil;
      manualCloseReasonRef.current = effectiveReason;
      setManualCloseStartAt(
        status.manual_close_start_at != null && String(status.manual_close_start_at).trim() !== ""
          ? String(status.manual_close_start_at).trim()
          : null
      );
      setClosedBy(status.closed_by ?? null);
      setClosedById((status as { closed_by_id?: string | null }).closed_by_id ?? null);
      setRestrictionType(status.restriction_type ?? null);
      setScheduledClosure(status.scheduled_closure ?? null);
      setUpcomingScheduledClosure(status.scheduled_closure_upcoming ?? null);
      setActiveRush(status.active_rush ?? null);
      setStatusReason(status.status_reason ?? null);
      setUnavailableReason((status as { unavailable_reason?: string | null }).unavailable_reason ?? null);
      setNextOpenTime(status.next_open_time ?? null);
      setNextCloseTime(status.next_close_time ?? null);
      setNextOpenIso(status.next_open_iso ?? null);
      setAutoAvailableAt((status as any).auto_available_at ?? null);
      setWithinHoursButRestricted(status.within_hours_but_restricted === true);
      setLastToggleType(status.last_toggle_type ?? null);
      setLastToggledAt(status.last_toggled_at ?? null);
      setLastToggledByName(status.last_toggled_by_name ?? null);
      setLastToggledById(status.last_toggled_by_id ?? null);
      setLastToggledByEmail(status.last_toggled_by_email ?? null);
      setScheduleEndPromptExpiresAt((status as any).schedule_end_prompt_expires_at ?? null);
      setLastRefreshedAt(Date.now());
      lastRefreshAtRef.current = Date.now();
      initialLoadDoneRef.current = true;
      // Cache so next app open shows status instantly.
      const key = `${STATUS_CACHE_KEY_PREFIX}${storeId}`;
      SecureStore.setItemAsync(
        key,
        JSON.stringify({
          is_open: delisted ? false : status.is_open,
          is_delisted: delisted,
          auto_open_from_schedule: status.auto_open_from_schedule,
          manual_close_until: effectiveUntil,
          manual_close_reason: effectiveReason,
          manual_close_start_at: status.manual_close_start_at,
          unavailable_reason: (status as { unavailable_reason?: string | null }).unavailable_reason,
          status_reason: status.status_reason,
          next_open_iso: status.next_open_iso,
          auto_available_at: (status as any).auto_available_at ?? null,
          within_hours_but_restricted: status.within_hours_but_restricted === true,
          last_toggle_type: status.last_toggle_type ?? null,
          last_toggled_at: status.last_toggled_at ?? null,
          last_toggled_by_name: status.last_toggled_by_name ?? null,
          last_toggled_by_id: status.last_toggled_by_id ?? null,
          last_toggled_by_email: status.last_toggled_by_email ?? null,
          schedule_end_prompt_expires_at: (status as any).schedule_end_prompt_expires_at ?? null,
          closed_by: status.closed_by,
          closed_by_id: (status as { closed_by_id?: string | null }).closed_by_id,
          scheduled_closure: status.scheduled_closure,
          scheduled_closure_upcoming: status.scheduled_closure_upcoming,
          active_rush: status.active_rush,
        })
      ).catch(() => {});

      const promptExp = (status as any).schedule_end_prompt_expires_at as string | null | undefined;
      const promptActive = (status as any).schedule_end_prompt_active === true;
      if (promptActive && promptExp && scheduleEndPromptShownRef.current !== promptExp) {
        scheduleEndPromptShownRef.current = promptExp;
        Alert.alert(
          "Scheduled time ended",
          "Your scheduled time has ended. Do you want to stay online?",
          [
            {
              text: "Go Offline",
              style: "destructive",
              onPress: () => {
                respondScheduleEndPrompt(storeId, token, "go_offline").then(() => refresh()).catch(() => {});
              },
            },
            {
              text: "Stay Online",
              onPress: () => {
                respondScheduleEndPrompt(storeId, token, "stay_online").then(() => refresh()).catch(() => {});
              },
            },
          ]
        );
      }
    } catch {
      // keep existing state on failure
    } finally {
      setLoading(false);
    }
  }, [token, storeId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Real-time status: poll so schedule changes, manual toggles, and auto open/close reflect immediately.
  useEffect(() => {
    if (!token || !storeId) return;
    const id = setInterval(() => {
      if (!isAppForeground()) return;
      void refresh();
    }, STATUS_POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [token, storeId, refresh]);

  // Read-only freshness sync when app returns to foreground.
  useEffect(() => {
    if (!token || !storeId) return;
    const onAppState = (state: AppStateStatus) => {
      if (state !== "active") return;
      if (Date.now() - lastRefreshAtRef.current < 10_000) return;
      void refresh();
    };
    const sub = AppState.addEventListener("change", onAppState);
    return () => sub.remove();
  }, [token, storeId, refresh]);

  useEffect(() => {
    const snap = getMerchantStoreDelistSnapshot(storeId);
    if (snap) {
      setIsDelisted(snap.isDelisted);
      if (snap.isDelisted) setIsOnline(false);
    }
    return subscribeMerchantStoreDelist((next) => {
      if (storeId == null || next.storeId !== storeId) return;
      setIsDelisted(next.isDelisted);
      if (next.isDelisted) setIsOnline(false);
      else void refresh();
    });
  }, [storeId, refresh]);

  /**
   * Countdown target:
   * - temp close: `merchant_store_availability.manual_close_until`
   * - schedule auto reopen: `merchant_store_availability.auto_available_at`
   * Fallback: backend `next_open_iso` when present.
   */
  const reopenAtIso = useMemo(() => {
    if (isOnline) return null;
    if (manualActivationLock) return null;

    const inFuture = (iso: string | null | undefined): string | null => {
      if (iso == null) return null;
      const s = String(iso).trim();
      if (!s) return null;
      const ms = new Date(s).getTime();
      if (!Number.isFinite(ms) || ms <= Date.now()) return null;
      return s;
    };

    // 1) Temp close / holiday window (server-derived): manual_close_until is authoritative.
    const temp = inFuture(manualCloseUntil);
    if (temp) return temp;

    // 2) Schedule-closed: use schedule engine's computed auto_available_at (single source, no client recompute).
    // Avoid countdown for manual_indefinite cases where backend intentionally omits a reopen time.
    const scheduleSignal = (statusReason ?? unavailableReason) ?? null;
    const isScheduleish =
      autoOpenFromSchedule &&
      !withinHoursButRestricted &&
      (scheduleSignal === "schedule_closed" || scheduleSignal === "outside_operating_hours");
    if (isScheduleish) {
      const auto = inFuture(autoAvailableAt);
      if (auto) return auto;
    }

    // 3) Last-resort: backend next_open_iso (already normalized in API).
    return inFuture(nextOpenIso);
  }, [isOnline, manualActivationLock, manualCloseUntil, autoAvailableAt, autoOpenFromSchedule, withinHoursButRestricted, statusReason, unavailableReason, nextOpenIso]);

  // When countdown reaches zero (temp close or schedule reopen): do NOT force OPEN.
  // Backend is source of truth: GET runs schedule evaluation (and temp-close expiry logic).
  // We only trigger a refresh so UI updates from backend store_status; no preemptive toggle.
  const reopenExpiredTriggeredRef = useRef(false);
  useEffect(() => {
    if (!token || !storeId || !reopenAtIso) {
      reopenExpiredTriggeredRef.current = false;
      return;
    }
    const reopenAt = new Date(reopenAtIso).getTime();
    if (!Number.isFinite(reopenAt)) return;

    const delayMs = Math.max(0, reopenAt - Date.now());
    if (delayMs === 0) {
      if (!reopenExpiredTriggeredRef.current) {
        reopenExpiredTriggeredRef.current = true;
        void refresh();
      }
      return;
    }

    reopenExpiredTriggeredRef.current = false;
    const timer = setTimeout(() => {
      if (reopenExpiredTriggeredRef.current) return;
      reopenExpiredTriggeredRef.current = true;
      void refresh();
    }, Math.min(delayMs, 86_400_000));

    return () => clearTimeout(timer);
  }, [token, storeId, reopenAtIso, refresh]);

  const toggle = useCallback(async (closeOptions?: CloseStoreOptions) => {
    if (!token || !storeId) return;
    const next = !isOnline;
    if (next && isDelisted) {
      showStoreDelistedAlert(goToDelistSupport);
      return;
    }
    if (next && licenseBlocked) {
      const e = new Error(
        "You cannot go online until expired documents are uploaded and verified by GatiMitra."
      ) as Error & { code?: string };
      e.code = "LICENSE_BLOCKED";
      throw e;
    }
    setIsOnline(next);
    try {
      const status = await updateStoreStatus(storeId, next, token, next ? undefined : closeOptions);
      if (!next && status) {
        const until =
          status.manual_close_until != null
            ? typeof status.manual_close_until === "string"
              ? status.manual_close_until
              : (status.manual_close_until as Date).toISOString()
            : null;
        const reason = status.manual_close_reason ?? null;
        setManualCloseUntil(until);
        setManualCloseReason(reason);
        manualCloseUntilRef.current = until;
        manualCloseReasonRef.current = reason;
        setManualCloseStartAt(
          status.manual_close_start_at != null
            ? typeof status.manual_close_start_at === "string"
              ? status.manual_close_start_at
              : new Date(status.manual_close_start_at as string | Date).toISOString()
            : null
        );
      }
      await refresh();
    } catch (e: unknown) {
      const code = e != null && typeof e === "object" ? String((e as { code?: string }).code ?? "") : "";
      if (code === "STORE_DELISTED") {
        setIsDelisted(true);
        setIsOnline(false);
        showStoreDelistedAlert(goToDelistSupport);
        throw e;
      }
      if (code === "LICENSE_BLOCKED") {
        setLicenseBlocked(true);
        setIsOnline(false);
        throw e;
      }
      let msg = "Something went wrong. Please try again.";
      if (e instanceof Error && e.message?.trim()) {
        const m = e.message.trim();
        if (m !== "TypeError" && m !== e.name) msg = m;
      } else if (typeof e === "string" && e.trim() && e.trim() !== "TypeError") {
        msg = e.trim();
      }
      setIsOnline((prev) => !prev);
      Alert.alert("Could not change status", msg);
      throw e;
    }
  }, [token, storeId, isOnline, isDelisted, licenseBlocked, refresh, goToDelistSupport]);

  const closeStore = useCallback(
    async (closeOptions: CloseStoreOptions) => {
      const id = storeId != null && Number.isFinite(Number(storeId)) ? Number(storeId) : null;
      if (!token || !id || id < 1) {
        Alert.alert("Cannot update status", "Please select a store first.");
        return;
      }
      setIsOnline(false);
      try {
        const status = await updateStoreStatus(id, false, token, closeOptions);
        const until =
          status.manual_close_until != null
            ? typeof status.manual_close_until === "string"
              ? status.manual_close_until
              : (status.manual_close_until as Date).toISOString()
            : null;
        const reason = status.manual_close_reason ?? null;
        setManualCloseUntil(until);
        setManualCloseReason(reason);
        manualCloseUntilRef.current = until;
        manualCloseReasonRef.current = reason;
        setManualCloseStartAt(
          status.manual_close_start_at != null
            ? typeof status.manual_close_start_at === "string"
              ? status.manual_close_start_at
              : new Date(status.manual_close_start_at as string | Date).toISOString()
            : null
        );
        await refresh();
      } catch (e: unknown) {
        let msg = "Something went wrong. Please try again.";
        if (e instanceof Error && e.message?.trim()) {
          const m = e.message.trim();
          if (m !== "TypeError" && m !== e.name) msg = m;
        } else if (typeof e === "string" && e.trim() && e.trim() !== "TypeError") {
          msg = e.trim();
        }
        await refresh();
        Alert.alert("Could not change status", msg);
        throw e;
      }
    },
    [token, storeId, refresh]
  );

  const toggleAutoOpenFromSchedule = useCallback(() => {
    if (!token || !storeId) return;
    const next = !autoOpenFromSchedule;
    setAutoOpenFromSchedule(next);
    updateAutoOpenFromSchedule(storeId, next, token)
      .then(() => {
        // Sync with backend state so value survives refresh/navigation.
        void refresh();
      })
      .catch((e) => {
        const msg =
          e instanceof Error ? e.message : "Failed to update auto-open setting";
        setAutoOpenFromSchedule((prev) => !prev);
        Alert.alert("Could not update setting", msg);
      });
  }, [token, storeId, autoOpenFromSchedule, refresh]);

  const toggleManualActivationLock = useCallback(() => {
    if (!token || !storeId) return;
    const next = !manualActivationLock;
    setManualActivationLock(next);
    updateManualActivationLock(storeId, next, token)
      .then(() => {
        // Sync with backend state so value survives refresh/navigation.
        void refresh();
      })
      .catch((e) => {
        const msg =
          e instanceof Error
            ? e.message
            : "Failed to update manual activation lock";
        setManualActivationLock((prev) => !prev);
        Alert.alert("Could not update setting", msg);
      });
  }, [token, storeId, manualActivationLock, refresh]);

  return (
    <StoreStatusContext.Provider
      value={{
        isOnline,
        loading,
        toggle,
        closeStore,
        refresh,
        lastRefreshedAt,
        autoOpenFromSchedule,
        manualActivationLock,
        toggleAutoOpenFromSchedule,
        toggleManualActivationLock,
        manualCloseUntil,
        manualCloseReason,
        manualCloseStartAt,
        closedBy,
        closedById,
        restrictionType,
        scheduledClosure,
        upcomingScheduledClosure,
        activeRush,
        statusReason,
        unavailableReason,
        nextOpenTime,
        nextCloseTime,
        autoAvailableAt,
        reopenAtIso,
        nextOpenIso,
        withinHoursButRestricted,
        lastToggleType,
        lastToggledAt,
        lastToggledByName,
        lastToggledById,
        lastToggledByEmail,
        scheduleEndPromptActive:
          scheduleEndPromptExpiresAt != null && new Date(scheduleEndPromptExpiresAt).getTime() > Date.now(),
        scheduleEndPromptExpiresAt,
        isDelisted,
        licenseBlocked,
        needsManualOpenAfterRelist: needsManualOpenAfterRelist({
          isDelisted,
          isOpen: isOnline,
          lastToggleType,
          closeReason: manualCloseReason ?? statusReason,
          unavailableReason,
        }),
      }}
    >
      {children}
    </StoreStatusContext.Provider>
  );
}

export function useStoreStatus(): StoreStatusContextValue {
  const ctx = useContext(StoreStatusContext);
  if (!ctx) throw new Error("useStoreStatus must be used within StoreStatusProvider");
  return ctx;
}
