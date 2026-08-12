"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { partnerSurfaceOnlineFromStoreOperationsBody } from "@/lib/partnerStoreSurfaceOnline";
import { useLocalStoreStatusEngineStore, UI_STRINGS } from "@/lib/localStoreStatusEngineStore";
import {
  useInvalidateMerchantStoreQueries,
  useStoreOperationsQuery,
} from "@/hooks/queries/useMerchantStoreQueries";
import { merchantPortalCloseReasonWithSuffix } from "@/lib/merchantPortalCloseReasons";

export type StoreOperationsData = {
  operational_status?: string;
  within_operating_hours?: boolean;
  opens_at?: string | null;
  close_reason?: string | null;
  manual_close_until?: string | null;
  block_auto_open?: boolean;
  is_today_scheduled_closed?: boolean;
  schedule_end_prompt_active?: boolean;
  last_toggled_by_email?: string | null;
  last_toggle_type?: string | null;
  last_toggled_by_name?: string | null;
  last_toggled_by_id?: string | null;
  restriction_type?: string | null;
  within_hours_but_restricted?: boolean;
  last_toggled_at?: string | null;
  schedule_phase?: string | null;
  schedule_status_label?: string | null;
  today_date?: string;
  today_slots?: { start: string; end: string }[];
  configured_today_slots?: { start: string; end: string }[];
  active_slot?: { start: string; end: string } | null;
  next_schedule_transition_at?: string | null;
  countdown_at?: string | null;
  countdown_kind?: string | null;
  countdown_wall_label?: string | null;
  scheduled_time_offs?: unknown;
};

type Options = {
  storeId: string;
  /** Poll like Partner Site mx dashboard when true */
  poll?: boolean;
  /** Hydrate local engine + schedule-end modal */
  syncEngine?: boolean;
};

export function useMerchantStoreOperations({ storeId, poll = false, syncEngine = false }: Options) {
  const operationsQuery = useStoreOperationsQuery(storeId);
  const invalidateStoreQueries = useInvalidateMerchantStoreQueries();
  const engine = useLocalStoreStatusEngineStore();

  const [isStoreOpen, setIsStoreOpen] = useState(false);
  const [manualActivationLock, setManualActivationLock] = useState(false);
  const [isTodayScheduledClosed, setIsTodayScheduledClosed] = useState(false);
  const [closeReasonFromOps, setCloseReasonFromOps] = useState<string | null>(null);

  const [showClosePopup, setShowClosePopup] = useState(false);
  const [closeConfirmLoading, setCloseConfirmLoading] = useState(false);
  const [toggleClosureType, setToggleClosureType] = useState<"temporary" | "today" | "manual_hold" | null>(null);
  const [closureDate, setClosureDate] = useState("");
  const [closureTime, setClosureTime] = useState("12:00");
  const [closeReason, setCloseReason] = useState("");
  const [closeReasonOther, setCloseReasonOther] = useState("");
  const [showToggleOnWarning, setShowToggleOnWarning] = useState(false);
  const [toggleOnLoading, setToggleOnLoading] = useState(false);

  const applyOperationsData = useCallback(
    (data: StoreOperationsData | undefined) => {
      if (!data || data.operational_status === undefined) return;
      const surface = partnerSurfaceOnlineFromStoreOperationsBody(data as Record<string, unknown>);
      const nextOpen = surface ?? data.operational_status === "OPEN";
      const nextLock = data.block_auto_open === true;
      const nextScheduledClosed = data.is_today_scheduled_closed === true;
      const nextCloseReason =
        typeof data.close_reason === "string" && data.close_reason.trim() !== ""
          ? data.close_reason.trim()
          : null;

      setIsStoreOpen((prev) => (prev === nextOpen ? prev : nextOpen));
      setManualActivationLock((prev) => (prev === nextLock ? prev : nextLock));
      setIsTodayScheduledClosed((prev) => (prev === nextScheduledClosed ? prev : nextScheduledClosed));
      setCloseReasonFromOps((prev) => (prev === nextCloseReason ? prev : nextCloseReason));

      if (syncEngine) {
        const engineApi = useLocalStoreStatusEngineStore.getState();
        if (data.schedule_end_prompt_active === true && !engineApi.scheduleEndModalOpen) {
          engineApi.openScheduleEndModal();
        }
        const manualUntil =
          typeof data.manual_close_until === "string" && data.manual_close_until.trim() !== ""
            ? data.manual_close_until.trim()
            : null;
        const closeReason =
          typeof data.close_reason === "string" && data.close_reason.trim() !== ""
            ? data.close_reason.trim()
            : null;
        engineApi.syncFromStoreOperations({
          operationalOpen: surface ?? false,
          manualCloseUntil: manualUntil,
          manualCloseReason: closeReason,
        });
      }
    },
    [syncEngine]
  );

  const lastAppliedOpsKeyRef = useRef<string | null>(null);

  useEffect(() => {
    lastAppliedOpsKeyRef.current = null;
  }, [storeId]);

  useEffect(() => {
    const data = operationsQuery.data as StoreOperationsData | undefined;
    if (!data || data.operational_status === undefined) return;

    const opsKey = JSON.stringify({
      operational_status: data.operational_status,
      block_auto_open: data.block_auto_open,
      is_today_scheduled_closed: data.is_today_scheduled_closed,
      close_reason: data.close_reason ?? null,
      schedule_end_prompt_active: data.schedule_end_prompt_active,
      manual_close_until: data.manual_close_until ?? null,
    });
    if (lastAppliedOpsKeyRef.current === opsKey) return;
    lastAppliedOpsKeyRef.current = opsKey;

    applyOperationsData(data);
  }, [operationsQuery.data, applyOperationsData]);

  useEffect(() => {
    if (!poll || !storeId) return;
    const interval = setInterval(() => {
      void operationsQuery.refetch();
    }, 30_000);
    return () => clearInterval(interval);
  }, [poll, storeId, operationsQuery]);

  useEffect(() => {
    if (!showClosePopup) return;
    const now = new Date();
    setClosureDate(
      `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`
    );
    const in10 = new Date(now.getTime() + 10 * 60 * 1000);
    setClosureTime(
      `${String(in10.getHours()).padStart(2, "0")}:${String(in10.getMinutes()).padStart(2, "0")}`
    );
  }, [showClosePopup]);

  const refreshOperations = useCallback(async () => {
    invalidateStoreQueries(storeId);
    await operationsQuery.refetch();
  }, [invalidateStoreQueries, operationsQuery, storeId]);

  const handleStoreToggle = useCallback(
    (opts?: { isDelisted?: boolean }) => {
      if (opts?.isDelisted) {
        toast.error("This store is delisted. Relist the store before opening it.");
        return;
      }
      if (!isStoreOpen && isTodayScheduledClosed) {
        toast.error("Today is scheduled closed. Update Outlet Timings to open on this day.");
        return;
      }
      if (isStoreOpen) {
        setShowClosePopup(true);
        setToggleClosureType(null);
      } else {
        setShowToggleOnWarning(true);
      }
    },
    [isStoreOpen, isTodayScheduledClosed]
  );

  const handleConfirmToggleOn = useCallback(
    async (opts?: { isDelisted?: boolean }) => {
      if (opts?.isDelisted) {
        toast.error("This store is delisted. Relist the store before opening it.");
        setShowToggleOnWarning(false);
        return;
      }
      setToggleOnLoading(true);
      try {
        const res = await fetch(`/api/merchant/stores/${storeId}/store-operations`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "manual_open" }),
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok && data.success) {
          setShowToggleOnWarning(false);
          toast.success("Store is now OPEN. Orders are being accepted!");
          await refreshOperations();
        } else {
          toast.error(data.error || "Failed to open store");
          await refreshOperations();
        }
      } catch {
        toast.error("Failed to open store");
        await refreshOperations();
      } finally {
        setToggleOnLoading(false);
      }
    },
    [storeId, refreshOperations]
  );

  const handleFinalCloseConfirm = useCallback(async () => {
    if (!toggleClosureType) return;
    setCloseConfirmLoading(true);
    const baseReason = closeReason === "Other" ? (closeReasonOther?.trim() || "Other") : closeReason;
    const reasonText = merchantPortalCloseReasonWithSuffix(baseReason);
    const manualCloseUntilIso =
      toggleClosureType === "temporary" && closureDate && closureTime
        ? (() => {
            const d = new Date(`${closureDate}T${closureTime}:00+05:30`);
            return Number.isNaN(d.getTime()) ? null : d.toISOString();
          })()
        : null;
    try {
      const res = await fetch(`/api/merchant/stores/${storeId}/store-operations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "manual_close",
          closure_type: toggleClosureType,
          close_reason: reasonText,
          ...(manualCloseUntilIso ? { manual_close_until: manualCloseUntilIso } : {}),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        setShowClosePopup(false);
        setToggleClosureType(null);
        setCloseReason("");
        setCloseReasonOther("");
        toast.success("Store closed.");
        setIsStoreOpen(false);
        if (syncEngine) {
          useLocalStoreStatusEngineStore.getState().syncFromStoreOperations({
            operationalOpen: false,
            manualCloseUntil: manualCloseUntilIso,
            manualCloseReason: reasonText,
          });
        }
        await refreshOperations();
      } else {
        toast.error(data.error || "Failed to close store");
        await refreshOperations();
      }
    } catch {
      toast.error("Failed to close store");
      await refreshOperations();
    } finally {
      setCloseConfirmLoading(false);
    }
  }, [
    toggleClosureType,
    closureDate,
    closureTime,
    closeReason,
    closeReasonOther,
    storeId,
    refreshOperations,
    syncEngine,
  ]);

  const handleClosePopupConfirm = useCallback(() => {
    if (!toggleClosureType) {
      toast.error("Please select closure type");
      return;
    }
    if (toggleClosureType === "temporary") {
      if (!closureDate || !closureTime) {
        toast.error("Please select date and time for reopening");
        return;
      }
      const closedUntil = new Date(`${closureDate}T${closureTime}:00+05:30`);
      if (closedUntil.getTime() <= Date.now()) {
        toast.error("Reopening date and time must be in the future");
        return;
      }
    }
    if (!closeReason?.trim()) {
      toast.error("Please select a reason for closing");
      return;
    }
    if (closeReason === "Other" && !closeReasonOther?.trim()) {
      toast.error('Please enter the reason in "Other"');
      return;
    }
    void handleFinalCloseConfirm();
  }, [
    toggleClosureType,
    closureDate,
    closureTime,
    closeReason,
    closeReasonOther,
    handleFinalCloseConfirm,
  ]);

  const handleCancelClosePopup = useCallback(() => {
    if (closeConfirmLoading) return;
    setShowClosePopup(false);
    setToggleClosureType(null);
    setClosureDate("");
    setClosureTime("12:00");
    setCloseReason("");
    setCloseReasonOther("");
  }, [closeConfirmLoading]);

  const saveManualActivationLock = useCallback(
    async (enabled: boolean) => {
      try {
        const res = await fetch(`/api/merchant/stores/${storeId}/store-operations`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "update_manual_lock", block_auto_open: enabled }),
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok && data.success) {
          await refreshOperations();
          toast.success(enabled ? "Manual activation lock enabled" : "Manual activation lock disabled");
        } else {
          setManualActivationLock(!enabled);
          toast.error(data.error || "Failed to save");
        }
      } catch {
        setManualActivationLock(!enabled);
        toast.error("Failed to save");
      }
    },
    [storeId, refreshOperations]
  );

  return {
    operationsQuery,
    isStoreOpen,
    manualActivationLock,
    isTodayScheduledClosed,
    closeReasonFromOps,
    showClosePopup,
    closeConfirmLoading,
    toggleClosureType,
    setToggleClosureType,
    closureDate,
    setClosureDate,
    closureTime,
    setClosureTime,
    closeReason,
    setCloseReason,
    closeReasonOther,
    setCloseReasonOther,
    showToggleOnWarning,
    setShowToggleOnWarning,
    toggleOnLoading,
    handleStoreToggle,
    handleConfirmToggleOn,
    handleClosePopupConfirm,
    handleFinalCloseConfirm,
    handleCancelClosePopup,
    saveManualActivationLock,
    refreshOperations,
    engine,
    UI_STRINGS,
    syncEngine,
  };
}
