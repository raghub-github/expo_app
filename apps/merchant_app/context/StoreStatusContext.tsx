import { createContext, useContext, useState, useCallback, useEffect, useRef, type ReactNode } from "react";
import { Alert } from "react-native";
import * as SecureStore from "expo-secure-store";
import { useAuth } from "@/context/AuthContext";
import { useSelectedStore } from "@/context/SelectedStoreContext";
import {
  getStoreStatus,
  updateStoreStatus,
  updateAutoOpenFromSchedule,
  updateManualActivationLock,
  type ScheduledClosure,
} from "@/services/storeStatusApi";

const STATUS_CACHE_KEY_PREFIX = "merchant_store_status_";

/** Poll interval for real-time status (schedule changes, auto open/close). */
const STATUS_POLL_INTERVAL_MS = 8_000;

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
  /** Offline reason: manual_lock | manual_close | schedule_closed | outside_operating_hours */
  statusReason: string | null;
  /** Backend unavailable_reason (manual_close, schedule_closed, manual_indefinite, etc.) */
  unavailableReason: string | null;
  nextOpenTime: string | null;
  nextCloseTime: string | null;
  /** Next reopen time (ISO) for countdown when closed by schedule or manual temp close */
  reopenAtIso: string | null;
  /** Next open time from schedule (API next_open_iso); use as fallback for "Reopen at" when closed */
  nextOpenIso: string | null;
};

const StoreStatusContext = createContext<StoreStatusContextValue | null>(null);

export function StoreStatusProvider({ children }: { children: ReactNode }) {
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
  const [statusReason, setStatusReason] = useState<string | null>(null);
  const [unavailableReason, setUnavailableReason] = useState<string | null>(null);
  const [nextOpenTime, setNextOpenTime] = useState<string | null>(null);
  const [nextCloseTime, setNextCloseTime] = useState<string | null>(null);
  const [nextOpenIso, setNextOpenIso] = useState<string | null>(null);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<number | null>(null);

  const storeId = selectedStore?.id ?? null;
  const refreshIdRef = useRef(0);
  const initialLoadDoneRef = useRef(false);
  /** Refs so we can preserve temp close when a stale GET returns null for manual_close_until. */
  const manualCloseUntilRef = useRef<string | null>(null);
  const manualCloseReasonRef = useRef<string | null>(null);

  // Restore cached status so Store Status card shows instantly on app open.
  useEffect(() => {
    if (!storeId) return;
    const key = `${STATUS_CACHE_KEY_PREFIX}${storeId}`;
    SecureStore.getItemAsync(key)
      .then((raw) => {
        if (!raw) return;
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
            if (c.closed_by != null) setClosedBy(c.closed_by as string | null);
            if (c.closed_by_id != null) setClosedById(c.closed_by_id as string | null);
            if (c.scheduled_closure != null) setScheduledClosure(c.scheduled_closure as ScheduledClosure | null);
            if (c.scheduled_closure_upcoming != null) setUpcomingScheduledClosure(c.scheduled_closure_upcoming as ScheduledClosure | null);
          }
        } catch {
          // ignore parse error
        }
      })
      .catch(() => {});
  }, [storeId]);

  const refresh = useCallback(async () => {
    if (!token || !storeId) {
      setIsOnline(false);
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
      setStatusReason(null);
      setUnavailableReason(null);
      setNextOpenTime(null);
      setNextCloseTime(null);
      setNextOpenIso(null);
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
        status.manual_close_until != null
          ? typeof status.manual_close_until === "string"
            ? status.manual_close_until.trim()
            : status.manual_close_until instanceof Date
              ? status.manual_close_until.toISOString()
              : String(status.manual_close_until).trim()
          : null;
      const fromApiReason = status.manual_close_reason ?? null;
      const apiUntilMs = fromApiUntil ? new Date(fromApiUntil).getTime() : 0;
      const apiIsFutureTempClose = Number.isFinite(apiUntilMs) && apiUntilMs > Date.now();
      const prevUntil = manualCloseUntilRef.current;
      const prevUntilMs = prevUntil ? new Date(prevUntil).getTime() : 0;
      const prevIsFutureTempClose = Number.isFinite(prevUntilMs) && prevUntilMs > Date.now();
      const keepTempCloseFromPrev = !apiIsFutureTempClose && prevIsFutureTempClose;

      setIsOnline(status.is_open);
      setAutoOpenFromSchedule(status.auto_open_from_schedule);
      setManualActivationLock(status.block_auto_open);
      if (apiIsFutureTempClose) {
        setManualCloseUntil(fromApiUntil);
        setManualCloseReason(fromApiReason);
        manualCloseUntilRef.current = fromApiUntil;
        manualCloseReasonRef.current = fromApiReason;
      } else if (keepTempCloseFromPrev) {
        setManualCloseUntil(prevUntil);
        setManualCloseReason(manualCloseReasonRef.current);
      } else {
        setManualCloseUntil(fromApiUntil);
        setManualCloseReason(fromApiReason);
        manualCloseUntilRef.current = fromApiUntil;
        manualCloseReasonRef.current = fromApiReason;
      }
      setManualCloseStartAt(
        status.manual_close_start_at != null
          ? typeof status.manual_close_start_at === "string"
            ? status.manual_close_start_at
            : status.manual_close_start_at instanceof Date
              ? status.manual_close_start_at.toISOString()
              : String(status.manual_close_start_at)
          : null
      );
      setClosedBy(status.closed_by ?? null);
      setClosedById((status as { closed_by_id?: string | null }).closed_by_id ?? null);
      setRestrictionType(status.restriction_type ?? null);
      setScheduledClosure(status.scheduled_closure ?? null);
      setUpcomingScheduledClosure(status.scheduled_closure_upcoming ?? null);
      setStatusReason(status.status_reason ?? null);
      setUnavailableReason((status as { unavailable_reason?: string | null }).unavailable_reason ?? null);
      setNextOpenTime(status.next_open_time ?? null);
      setNextCloseTime(status.next_close_time ?? null);
      setNextOpenIso(status.next_open_iso ?? null);
      setLastRefreshedAt(Date.now());
      initialLoadDoneRef.current = true;
      // Cache so next app open shows status instantly.
      const key = `${STATUS_CACHE_KEY_PREFIX}${storeId}`;
      SecureStore.setItemAsync(
        key,
        JSON.stringify({
          is_open: status.is_open,
          auto_open_from_schedule: status.auto_open_from_schedule,
          manual_close_until: status.manual_close_until,
          manual_close_reason: status.manual_close_reason,
          manual_close_start_at: status.manual_close_start_at,
          unavailable_reason: (status as { unavailable_reason?: string | null }).unavailable_reason,
          status_reason: status.status_reason,
          next_open_iso: status.next_open_iso,
          closed_by: status.closed_by,
          closed_by_id: (status as { closed_by_id?: string | null }).closed_by_id,
          scheduled_closure: status.scheduled_closure,
          scheduled_closure_upcoming: status.scheduled_closure_upcoming,
        })
      ).catch(() => {});
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
      void refresh();
    }, STATUS_POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [token, storeId, refresh]);

  // Next reopening time for countdown and auto-open. Prefer user-set temp close time (manualCloseUntil) so
  // "Reopen at" shows the exact countdown the user set when marking temp closed.
  const reopenAtIsoRaw =
    (manualCloseUntil && String(manualCloseUntil).trim() ? manualCloseUntil : null) ??
    scheduledClosure?.to ??
    (nextOpenIso && String(nextOpenIso).trim() ? nextOpenIso : null) ??
    upcomingScheduledClosure?.from ??
    null;
  const reopenAtIso =
    reopenAtIsoRaw == null
      ? null
      : (() => {
          const s = typeof reopenAtIsoRaw === "string"
            ? reopenAtIsoRaw.trim()
            : reopenAtIsoRaw instanceof Date
              ? reopenAtIsoRaw.toISOString()
              : String(reopenAtIsoRaw).trim();
          return s.length > 0 ? s : null;
        })();

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

    const id = setInterval(() => {
      if (Date.now() < reopenAt) return;
      if (reopenExpiredTriggeredRef.current) return;
      reopenExpiredTriggeredRef.current = true;
      void refresh();
    }, 1000);
    return () => clearInterval(id);
  }, [token, storeId, reopenAtIso, refresh]);

  const toggle = useCallback(async (closeOptions?: CloseStoreOptions) => {
    if (!token || !storeId) return;
    const next = !isOnline;
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
  }, [token, storeId, isOnline, refresh]);

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
        statusReason,
        unavailableReason,
        nextOpenTime,
        nextCloseTime,
        reopenAtIso,
        nextOpenIso,
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
