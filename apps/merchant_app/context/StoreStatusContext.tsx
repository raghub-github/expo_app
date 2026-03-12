import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from "react";
import { Alert } from "react-native";
import { useAuth } from "@/context/AuthContext";
import { useSelectedStore } from "@/context/SelectedStoreContext";
import {
  getStoreStatus,
  updateStoreStatus,
  updateAutoOpenFromSchedule,
  updateManualActivationLock,
  type ScheduledClosure,
} from "@/services/storeStatusApi";

type StoreStatusContextValue = {
  isOnline: boolean;
  loading: boolean;
  toggle: () => Promise<void>;
  refresh: () => Promise<void>;
  autoOpenFromSchedule: boolean;
  manualActivationLock: boolean;
  toggleAutoOpenFromSchedule: () => void;
  toggleManualActivationLock: () => void;
  manualCloseUntil: string | null;
  restrictionType: string | null;
  /** When store is in scheduled closure, from/to/reason from API. */
  scheduledClosure: ScheduledClosure | null;
  /** Upcoming scheduled closure (not active yet). */
  upcomingScheduledClosure: ScheduledClosure | null;
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
  const [restrictionType, setRestrictionType] = useState<string | null>(null);
  const [scheduledClosure, setScheduledClosure] = useState<ScheduledClosure | null>(null);
  const [upcomingScheduledClosure, setUpcomingScheduledClosure] = useState<ScheduledClosure | null>(null);

  const storeId = selectedStore?.id ?? null;

  const refresh = useCallback(async () => {
    if (!token || !storeId) {
      setIsOnline(false);
      setAutoOpenFromSchedule(true);
      setManualActivationLock(false);
      setManualCloseUntil(null);
      setRestrictionType(null);
      setScheduledClosure(null);
      setUpcomingScheduledClosure(null);
      return;
    }
    setLoading(true);
    try {
      const status = await getStoreStatus(storeId, token);
      setIsOnline(status.is_open);
      setAutoOpenFromSchedule(status.auto_open_from_schedule);
      setManualActivationLock(status.block_auto_open);
      setManualCloseUntil(status.manual_close_until ?? null);
      setRestrictionType(status.restriction_type ?? null);
      setScheduledClosure(status.scheduled_closure ?? null);
      setUpcomingScheduledClosure(status.scheduled_closure_upcoming ?? null);
    } catch {
      // keep existing state on failure
    } finally {
      setLoading(false);
    }
  }, [token, storeId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Real-time status update so scheduled closure activates exactly at start time.
  useEffect(() => {
    if (!token || !storeId) return;
    const id = setInterval(() => {
      void refresh();
    }, 15_000);
    return () => clearInterval(id);
  }, [token, storeId, refresh]);

  const toggle = useCallback(async () => {
    if (!token || !storeId) return;
    const next = !isOnline;
    setIsOnline(next);
    try {
      await updateStoreStatus(storeId, next, token);
      await refresh();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to update store status";
      setIsOnline((prev) => !prev);
      Alert.alert("Could not change status", msg);
      throw e;
    }
  }, [token, storeId, isOnline, refresh]);

  const toggleAutoOpenFromSchedule = useCallback(() => {
    if (!token || !storeId) return;
    const next = !autoOpenFromSchedule;
    setAutoOpenFromSchedule(next);
    updateAutoOpenFromSchedule(storeId, next, token).catch((e) => {
      const msg =
        e instanceof Error ? e.message : "Failed to update auto-open setting";
      setAutoOpenFromSchedule((prev) => !prev);
      Alert.alert("Could not update setting", msg);
    });
  }, [token, storeId, autoOpenFromSchedule]);

  const toggleManualActivationLock = useCallback(() => {
    if (!token || !storeId) return;
    const next = !manualActivationLock;
    setManualActivationLock(next);
    updateManualActivationLock(storeId, next, token).catch((e) => {
      const msg =
        e instanceof Error
          ? e.message
          : "Failed to update manual activation lock";
      setManualActivationLock((prev) => !prev);
      Alert.alert("Could not update setting", msg);
    });
  }, [token, storeId, manualActivationLock]);

  return (
    <StoreStatusContext.Provider
      value={{
        isOnline,
        loading,
        toggle,
        refresh,
        autoOpenFromSchedule,
        manualActivationLock,
        toggleAutoOpenFromSchedule,
        toggleManualActivationLock,
        manualCloseUntil,
        restrictionType,
        scheduledClosure,
        upcomingScheduledClosure,
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
