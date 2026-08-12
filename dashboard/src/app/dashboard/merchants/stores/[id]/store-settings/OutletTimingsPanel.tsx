"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  AlertCircle,
  AlertTriangle,
  ChevronDown,
  Clock,
  Copy,
  Plus,
  Save,
  X,
} from "lucide-react";
import { toast } from "sonner";
import {
  type DaySchedule,
  type DayType,
  type TimeSlot,
  WEEKDAY_KEYS,
  calculateOperationalTime,
  getCurrentDayKeyInTimeZone,
  initialSchedule,
  mapDbToSchedule,
  scheduleToPatchPayload,
  slotHasTimingData,
} from "./outlet-timings-model";

type Props = {
  apiBase: string;
  active: boolean;
  storeTimezone?: string | null;
  /** View-only / no store-manage: hide Edit/Save/Remove/toggles. */
  readOnly?: boolean;
};

export function OutletTimingsPanel({ apiBase, active, storeTimezone, readOnly = false }: Props) {
  const [applyMondayToAll, setApplyMondayToAll] = useState(false);
  const [showCopyMondayConfirm, setShowCopyMondayConfirm] = useState(false);
  const [copyMondayConfirmLoading, setCopyMondayConfirmLoading] = useState(false);
  const [force24Hours, setForce24Hours] = useState(false);
  const [closedDay, setClosedDay] = useState<DayType | null>(null);
  const [storeSchedule, setStoreSchedule] = useState<DaySchedule[]>(initialSchedule);
  const [manualTimeChanges, setManualTimeChanges] = useState<Set<DayType>>(new Set());
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(null);
  const [timingsLoading, setTimingsLoading] = useState(false);
  const [timingsLoaded, setTimingsLoaded] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [showMainToggleWarning, setShowMainToggleWarning] = useState(false);
  const [mainToggleAction, setMainToggleAction] = useState<boolean | null>(null);
  const [slotRemoveConfirm, setSlotRemoveConfirm] = useState<{
    day: DayType;
    kind: "morning" | "evening";
    slotId: string;
  } | null>(null);

  const timingsFetchGenRef = useRef(0);

  const fetchTimings = useCallback(
    async (fetchGen?: number) => {
      const gen = fetchGen ?? ++timingsFetchGenRef.current;
      setTimingsLoading(true);
      try {
        const res = await fetch(`${apiBase}/operating-hours`, { cache: "no-store" });
        if (gen !== timingsFetchGenRef.current) return;
        if (!res.ok) return;
        const data = await res.json().catch(() => null);
        if (gen !== timingsFetchGenRef.current) return;
        if (!data?.success) return;

        const mapped = mapDbToSchedule(data as Record<string, unknown>);
        setStoreSchedule(mapped.schedule);
        setApplyMondayToAll(mapped.sameForAll);
        setForce24Hours(mapped.force24Hours);
        setClosedDay(mapped.closedDay);
        if (data.updated_at) {
          setLastUpdatedAt(
            typeof data.updated_at === "string"
              ? data.updated_at
              : new Date(data.updated_at as string).toISOString()
          );
        }
        setTimingsLoaded(true);
      } catch (error) {
        console.error("[OutletTimingsPanel] load failed:", error);
      } finally {
        if (gen === timingsFetchGenRef.current) setTimingsLoading(false);
      }
    },
    [apiBase]
  );

  useEffect(() => {
    void fetchTimings();
  }, [fetchTimings]);

  useEffect(() => {
    if (active && !timingsLoaded && !timingsLoading) void fetchTimings();
  }, [active, timingsLoaded, timingsLoading, fetchTimings]);

  const patchTimings = useCallback(
    async (
      schedule: DaySchedule[],
      sameForAll: boolean,
      hours24: boolean
    ): Promise<boolean> => {
      const payload = scheduleToPatchPayload(schedule, sameForAll, hours24);
      const res = await fetch(`${apiBase}/operating-hours`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        toast.error(data.error || "Failed to save timings");
        return false;
      }
      return true;
    },
    [apiBase]
  );

  const saveCompleteTimings = useCallback(
    async (
      overrideSchedule?: DaySchedule[],
      overrideSameForAll?: boolean,
      override24Hours?: boolean,
      overrideClosedDay?: DayType | null
    ) => {
      const scheduleToUse = overrideSchedule ?? storeSchedule;
      const sameForAllToUse = overrideSameForAll !== undefined ? overrideSameForAll : applyMondayToAll;
      const force24HoursToUse = override24Hours !== undefined ? override24Hours : force24Hours;
      if (overrideClosedDay !== undefined) setClosedDay(overrideClosedDay);
      return patchTimings(scheduleToUse, sameForAllToUse, force24HoursToUse);
    },
    [applyMondayToAll, force24Hours, patchTimings, storeSchedule]
  );

  const saveSingleDayTimings = async (dayKey: DayType) => {
    const dayData = storeSchedule.find((d) => d.day === dayKey);
    if (!dayData) return;

    if (dayData.isOpen && !dayData.isOutletClosed && !dayData.is24Hours) {
      const toMin = (t: string) => {
        const [h, m] = t.split(":").map(Number);
        return h * 60 + m;
      };
      const s1o = dayData.slots[0]?.openingTime;
      const s1c = dayData.slots[0]?.closingTime;
      if (s1o && s1c && toMin(s1c) <= toMin(s1o)) {
        toast.error(`${dayData.label}: Slot 1 end time must be after start time`);
        return;
      }
      const s2o = dayData.slots[1]?.openingTime;
      const s2c = dayData.slots[1]?.closingTime;
      if (s2o && s2c && toMin(s2c) <= toMin(s2o)) {
        toast.error(`${dayData.label}: Slot 2 end time must be after start time`);
        return;
      }
      if (s1c && s2o && toMin(s2o) <= toMin(s1c)) {
        toast.error(`${dayData.label}: Slot 2 must start after Slot 1 ends (${s1c})`);
        return;
      }
    }

    setIsSaving(true);
    try {
      const saved = await saveCompleteTimings();
      if (saved) {
        toast.success(`✅ ${dayData.label} saved!`);
        setManualTimeChanges((prev) => {
          const next = new Set(prev);
          next.delete(dayKey);
          return next;
        });
        await fetchTimings();
      }
    } finally {
      setIsSaving(false);
    }
  };

  const handleMainToggle = (turnOn: boolean) => {
    setMainToggleAction(turnOn);
    setShowMainToggleWarning(true);
  };

  const confirmMainToggle = async () => {
    if (mainToggleAction === null) return;
    const turnOn = mainToggleAction;
    setShowMainToggleWarning(false);

    const newSchedule = storeSchedule.map((d) => {
      if (turnOn) {
        if (d.day === closedDay) return { ...d, isOpen: false };
        return { ...d, isOpen: true, isOutletClosed: false };
      }
      return { ...d, isOpen: false };
    });

    setStoreSchedule(newSchedule);
    setApplyMondayToAll(false);
    setForce24Hours(false);

    setIsSaving(true);
    try {
      const saved = await saveCompleteTimings(newSchedule, false, false, closedDay);
      if (saved) {
        await fetchTimings();
        toast.success(`Store hours ${turnOn ? "enabled" : "disabled"} successfully`);
      }
    } finally {
      setIsSaving(false);
      setMainToggleAction(null);
    }
  };

  const handleDayToggle = async (day: DayType) => {
    const daySchedule = storeSchedule.find((d) => d.day === day);
    if (!daySchedule) return;

    const newIsOpen = !daySchedule.isOpen;
    setManualTimeChanges((prev) => {
      const next = new Set(prev);
      next.delete(day);
      return next;
    });

    const newSchedule = storeSchedule.map((d) => {
      if (d.day !== day) return d;
      const { hours, minutes } = calculateOperationalTime(d.slots);
      return {
        ...d,
        isOpen: newIsOpen,
        isOutletClosed: false,
        duration: `${hours}.${minutes.toString().padStart(2, "0")} hrs`,
        operationalHours: hours,
        operationalMinutes: minutes,
      };
    });

    setStoreSchedule(newSchedule);
    if (applyMondayToAll) setApplyMondayToAll(false);
    if (force24Hours) setForce24Hours(false);
    const newClosedDay = newIsOpen && closedDay === day ? null : closedDay;
    if (newIsOpen && closedDay === day) setClosedDay(null);

    setIsSaving(true);
    try {
      const saved = await saveCompleteTimings(newSchedule, false, false, newClosedDay);
      if (saved) await fetchTimings();
      else toast.error("Failed to save toggle state");
    } finally {
      setIsSaving(false);
    }

    toast.success(`${day.charAt(0).toUpperCase() + day.slice(1)} ${newIsOpen ? "opened" : "closed"}`);
  };

  const addTimeSlot = (day: DayType, slotPosition: 0 | 1) => {
    const daySchedule = storeSchedule.find((d) => d.day === day);
    if (!daySchedule || daySchedule.slots.length >= 2) {
      toast.error("Maximum 2 slots allowed per day");
      return;
    }
    setManualTimeChanges((prev) => new Set(prev).add(day));
    if (applyMondayToAll) setApplyMondayToAll(false);
    if (force24Hours) setForce24Hours(false);

    const newSlot: TimeSlot = {
      id: Date.now().toString(),
      openingTime: slotPosition === 0 ? "09:00" : "14:00",
      closingTime: slotPosition === 0 ? "13:00" : "18:00",
    };

    setStoreSchedule((prev) =>
      prev.map((d) => {
        if (d.day !== day) return d;
        const newSlots = slotPosition === 0 ? [newSlot, ...d.slots] : [...d.slots, newSlot];
        const { hours, minutes } = calculateOperationalTime(newSlots);
        return {
          ...d,
          slots: newSlots,
          duration: `${hours}.${minutes.toString().padStart(2, "0")} hrs`,
          operationalHours: hours,
          operationalMinutes: minutes,
        };
      })
    );
    toast.success("New time slot added");
  };

  const removeTimeSlot = (day: DayType, slotId: string) => {
    const daySchedule = storeSchedule.find((d) => d.day === day);
    if (daySchedule?.slots.length === 1) {
      toast.error("At least one time slot is required");
      return;
    }
    setManualTimeChanges((prev) => new Set(prev).add(day));
    if (applyMondayToAll) setApplyMondayToAll(false);
    if (force24Hours) setForce24Hours(false);

    setStoreSchedule((prev) =>
      prev.map((d) => {
        if (d.day !== day) return d;
        const newSlots = d.slots.filter((s) => s.id !== slotId);
        const { hours, minutes } = calculateOperationalTime(newSlots);
        return {
          ...d,
          slots: newSlots,
          duration: `${hours}.${minutes.toString().padStart(2, "0")} hrs`,
          operationalHours: hours,
          operationalMinutes: minutes,
        };
      })
    );
    toast.success("Time slot removed");
  };

  const removeMorningSlot = (day: DayType) => {
    const daySchedule = storeSchedule.find((d) => d.day === day);
    if (!daySchedule || daySchedule.slots.length < 2) {
      toast.error("Add an evening slot first, or clear times in the morning fields.");
      return;
    }
    setManualTimeChanges((prev) => new Set(prev).add(day));
    if (applyMondayToAll) setApplyMondayToAll(false);
    if (force24Hours) setForce24Hours(false);
    setStoreSchedule((prev) =>
      prev.map((d) => {
        if (d.day !== day) return d;
        const newSlots = [d.slots[1]];
        const { hours, minutes } = calculateOperationalTime(newSlots);
        return {
          ...d,
          slots: newSlots,
          duration: `${hours}.${minutes.toString().padStart(2, "0")} hrs`,
          operationalHours: hours,
          operationalMinutes: minutes,
        };
      })
    );
    toast.success("Morning slot removed");
  };

  const confirmPendingSlotRemove = () => {
    if (!slotRemoveConfirm) return;
    if (slotRemoveConfirm.kind === "morning") {
      removeMorningSlot(slotRemoveConfirm.day);
    } else {
      removeTimeSlot(slotRemoveConfirm.day, slotRemoveConfirm.slotId);
    }
    setSlotRemoveConfirm(null);
  };

  const updateTimeSlot = (
    day: DayType,
    slotId: string,
    field: "openingTime" | "closingTime",
    value: string
  ) => {
    setManualTimeChanges((prev) => new Set(prev).add(day));
    if (applyMondayToAll) setApplyMondayToAll(false);
    if (force24Hours) setForce24Hours(false);

    setStoreSchedule((prev) =>
      prev.map((d) => {
        if (d.day !== day) return d;
        const newSlots = d.slots.map((slot) =>
          slot.id === slotId ? { ...slot, [field]: value } : slot
        );
        const { hours, minutes } = calculateOperationalTime(newSlots);
        return {
          ...d,
          slots: newSlots,
          duration: `${hours}.${minutes.toString().padStart(2, "0")} hrs`,
          operationalHours: hours,
          operationalMinutes: minutes,
        };
      })
    );
  };

  const confirmCopyMondayToAllDays = async () => {
    const mondaySchedule = storeSchedule.find((d) => d.day === "monday");
    if (!mondaySchedule) return;

    const previousSchedule = storeSchedule;
    const previousApplyMondayToAll = applyMondayToAll;
    const previousClosedDay = closedDay;
    const updatedSchedule = storeSchedule.map((day) => ({
      ...mondaySchedule,
      day: day.day,
      label: day.label,
      isOutletClosed: false,
    }));

    setCopyMondayConfirmLoading(true);
    setStoreSchedule(updatedSchedule);
    setApplyMondayToAll(true);
    setClosedDay(null);

    try {
      const saved = await saveCompleteTimings(updatedSchedule, true, force24Hours, null);
      if (saved) {
        toast.success("Timings copied to all days");
        setShowCopyMondayConfirm(false);
        await fetchTimings();
      } else {
        setStoreSchedule(previousSchedule);
        setApplyMondayToAll(previousApplyMondayToAll);
        setClosedDay(previousClosedDay);
      }
    } finally {
      setCopyMondayConfirmLoading(false);
    }
  };

  const storeIsOpen = storeSchedule.some((d) => d.isOpen && !d.isOutletClosed);

  const modals =
    typeof document !== "undefined" ? (
      <>
        {showMainToggleWarning &&
          createPortal(
            <div className="fixed inset-0 flex items-center justify-center p-4 pointer-events-none z-[120]">
              <div
                className="fixed inset-0 bg-black/50 pointer-events-auto backdrop-blur-sm"
                onClick={() => setShowMainToggleWarning(false)}
              />
              <div className="bg-white rounded-xl max-w-sm w-full pointer-events-auto relative z-[121] shadow-xl">
                <div className="flex items-center justify-between p-6 border-b border-gray-200">
                  <h2 className="text-lg font-bold text-gray-900">
                    {mainToggleAction ? "Enable Store Hours" : "Disable Store Hours"}
                  </h2>
                  <button
                    type="button"
                    onClick={() => setShowMainToggleWarning(false)}
                    className="text-gray-500 hover:text-gray-900"
                  >
                    <X size={20} />
                  </button>
                </div>
                <div className="p-6 space-y-4">
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm">
                    {mainToggleAction ? (
                      <>
                        <p className="font-semibold text-gray-900">You&apos;re about to enable store operating hours</p>
                        <ul className="mt-2 space-y-1 text-gray-700 list-disc list-inside text-xs">
                          <li>All days will open (except scheduled closed days)</li>
                          <li>Previously saved timings will be restored</li>
                          <li>Your store will be visible to customers</li>
                        </ul>
                      </>
                    ) : (
                      <>
                        <p className="font-semibold text-gray-900">You&apos;re about to disable store operating hours</p>
                        <ul className="mt-2 space-y-1 text-gray-700 list-disc list-inside text-xs">
                          <li>All days will close immediately</li>
                          <li>Timing data will be saved and restored later</li>
                          <li>Your store will NOT accept orders</li>
                        </ul>
                      </>
                    )}
                  </div>
                  <p className="text-xs text-gray-600 italic">
                    This action affects all days at once. Individual day toggles override this setting.
                  </p>
                </div>
                <div className="flex gap-3 p-6 border-t border-gray-200">
                  <button
                    type="button"
                    onClick={() => setShowMainToggleWarning(false)}
                    className="flex-1 px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-semibold"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => void confirmMainToggle()}
                    disabled={isSaving}
                    className={`flex-1 px-4 py-2.5 text-white rounded-lg font-semibold disabled:opacity-50 ${
                      mainToggleAction ? "bg-emerald-600 hover:bg-emerald-700" : "bg-red-600 hover:bg-red-700"
                    }`}
                  >
                    {mainToggleAction ? "Enable" : "Disable"}
                  </button>
                </div>
              </div>
            </div>,
            document.body
          )}

        {showCopyMondayConfirm &&
          createPortal(
            <>
              <div
                className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[120]"
                onClick={() => !copyMondayConfirmLoading && setShowCopyMondayConfirm(false)}
              />
              <div className="fixed inset-0 flex items-center justify-center p-4 pointer-events-none z-[121]">
                <div className="bg-white rounded-xl max-w-md w-full pointer-events-auto shadow-2xl">
                  <div className="flex items-center justify-between p-6 border-b border-gray-200">
                    <h2 className="text-lg font-bold text-gray-900">Copy Monday timing to all days?</h2>
                    <button
                      type="button"
                      onClick={() => setShowCopyMondayConfirm(false)}
                      disabled={copyMondayConfirmLoading}
                      className="text-gray-500 hover:text-gray-900 disabled:opacity-50"
                    >
                      <X size={20} />
                    </button>
                  </div>
                  <div className="p-6 space-y-4">
                    <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-lg">
                      <AlertCircle className="text-amber-600 flex-shrink-0 mt-0.5" size={20} />
                      <p className="text-sm text-gray-700">
                        This will replace all days with Monday&apos;s current timings and save the same update to the
                        database.
                      </p>
                    </div>
                    <div className="space-y-2">
                      <button
                        type="button"
                        onClick={() => void confirmCopyMondayToAllDays()}
                        disabled={copyMondayConfirmLoading}
                        className="w-full px-4 py-2.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 font-semibold disabled:opacity-50"
                      >
                        {copyMondayConfirmLoading ? "Saving..." : "OK, Copy"}
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowCopyMondayConfirm(false)}
                        disabled={copyMondayConfirmLoading}
                        className="w-full px-4 py-2.5 border border-gray-200 rounded-lg hover:bg-gray-50 font-semibold disabled:opacity-50"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </>,
            document.body
          )}

        {slotRemoveConfirm &&
          createPortal(
            <>
              <div
                className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[120]"
                onClick={() => setSlotRemoveConfirm(null)}
              />
              <div className="fixed inset-0 flex items-center justify-center p-4 pointer-events-none z-[121]">
                <div className="bg-white rounded-xl max-w-md w-full pointer-events-auto shadow-2xl">
                  <div className="flex items-center justify-between p-6 border-b border-gray-200">
                    <h2 className="text-lg font-bold text-gray-900">Remove time slot?</h2>
                    <button
                      type="button"
                      onClick={() => setSlotRemoveConfirm(null)}
                      className="text-gray-500 hover:text-gray-900"
                    >
                      <X size={20} />
                    </button>
                  </div>
                  <div className="p-6 space-y-4">
                    <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-lg">
                      <AlertTriangle className="text-amber-600 flex-shrink-0 mt-0.5" size={20} />
                      <p className="text-sm text-gray-700">
                        {slotRemoveConfirm.kind === "morning"
                          ? "The morning slot will be removed and the evening slot will become the primary hours for this day."
                          : "The evening slot will be removed. You can add it again later if needed."}
                      </p>
                    </div>
                    <p className="text-sm text-gray-600 capitalize">{slotRemoveConfirm.day}</p>
                    <div className="flex gap-3">
                      <button
                        type="button"
                        onClick={() => setSlotRemoveConfirm(null)}
                        className="flex-1 px-4 py-2.5 border border-gray-200 rounded-lg hover:bg-gray-50 font-semibold"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={confirmPendingSlotRemove}
                        className="flex-1 px-4 py-2.5 bg-red-600 text-white rounded-lg hover:bg-red-700 font-semibold"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </>,
            document.body
          )}
      </>
    ) : null;

  return (
    <>
      {modals}
      <div className="flex min-h-0 min-h-[280px] flex-1 flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm max-h-[min(680px,calc(100dvh-11rem))] lg:max-h-[min(720px,calc(100dvh-9.5rem))]">
        <div className="shrink-0 px-4 py-3.5 border-b border-gray-100">
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 mb-1">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <h2 className="text-lg font-bold text-gray-900">Store Operating Hours</h2>
              {!readOnly ? (
              <button
                type="button"
                onClick={() => setShowCopyMondayConfirm(true)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-violet-200 bg-violet-50 px-2.5 py-1 text-[11px] font-semibold text-violet-800 transition hover:bg-violet-100"
              >
                <Copy size={12} className="shrink-0" />
                <span className="whitespace-nowrap">Copy Monday to all days</span>
              </button>
              ) : null}
            </div>
            <button
              type="button"
              onClick={() => {
                if (readOnly) return;
                handleMainToggle(!storeIsOpen);
              }}
              disabled={isSaving || readOnly}
              className="inline-flex items-center gap-2 hover:opacity-80 transition disabled:opacity-50 disabled:cursor-not-allowed"
              title={readOnly ? "View-only access — store hours locked" : undefined}
            >
              <span className="text-xs font-semibold text-gray-700">Store is Open</span>
              <span
                className={`relative inline-flex h-5 w-9 items-center rounded-full transition ${
                  storeIsOpen ? "bg-emerald-500" : "bg-gray-200"
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition ${
                    storeIsOpen ? "translate-x-4" : "translate-x-0.5"
                  }`}
                />
              </span>
            </button>
          </div>
          <p className="text-sm text-gray-500 mb-2">Set your store operating hours for each day of the week</p>
          {lastUpdatedAt ? (
            <div className="flex items-center justify-between text-xs text-gray-500 pt-2 border-t border-gray-100">
              <span>Last updated:</span>
              <span className="font-medium text-gray-700">
                {new Date(lastUpdatedAt).toLocaleString("en-IN", {
                  dateStyle: "short",
                  timeStyle: "short",
                })}
              </span>
            </div>
          ) : null}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
          <div className="sticky top-0 z-10 grid grid-cols-[44px_minmax(64px,76px)_minmax(0,1fr)_minmax(0,1fr)_64px] items-center gap-x-2 gap-y-0 border-b border-gray-200 bg-gray-50 px-3 py-2 text-[11px] font-semibold shadow-[0_1px_0_rgba(0,0,0,0.04)] sm:grid-cols-[48px_minmax(72px,88px)_minmax(0,1fr)_minmax(0,1fr)_72px] sm:gap-x-3 sm:px-4">
            <span className="truncate text-gray-500">Day</span>
            <span />
            <span className="truncate text-orange-600">Morning</span>
            <span className="truncate text-violet-600">Evening</span>
            <span className="text-right text-gray-500">Save</span>
          </div>
          {timingsLoading && !timingsLoaded
            ? WEEKDAY_KEYS.map((day) => (
                <div
                  key={`timings-skel-${day}`}
                  className="grid grid-cols-[44px_minmax(64px,76px)_minmax(0,1fr)_minmax(0,1fr)_64px] items-center gap-x-2 border-b border-gray-100 px-3 py-3 animate-pulse sm:grid-cols-[48px_minmax(72px,88px)_minmax(0,1fr)_minmax(0,1fr)_72px] sm:gap-x-3 sm:px-4"
                >
                  <div className="h-4 w-8 rounded-full bg-gray-200 mx-auto" />
                  <div className="h-3 w-12 rounded bg-gray-200" />
                  <div className="h-8 rounded-md bg-gray-100" />
                  <div className="h-8 rounded-md bg-gray-100" />
                  <span />
                </div>
              ))
            : storeSchedule.map((daySchedule) => {
                const isCurrentDay =
                  daySchedule.day === getCurrentDayKeyInTimeZone(storeTimezone);
                const hasSlot2 = !!daySchedule.slots[1];
                const isClosed = daySchedule.isOutletClosed || !daySchedule.isOpen;
                const slotInputsLocked = readOnly || !daySchedule.isOpen;
                const slotFieldClassName = `h-8 w-full rounded-md border pl-6 pr-5 text-xs appearance-none focus:outline-none focus:ring-2 [&::-webkit-calendar-picker-indicator]:opacity-0 ${
                  !slotInputsLocked
                    ? "border-gray-200 bg-white text-gray-800 focus:border-emerald-400 focus:ring-emerald-100"
                    : "border-gray-200 bg-gray-100 text-gray-500 cursor-not-allowed opacity-60"
                }`;
                const timingsRowGrid =
                  "grid grid-cols-[44px_minmax(64px,76px)_minmax(0,1fr)_minmax(0,1fr)_64px] items-start gap-x-2 gap-y-0 px-3 py-2 sm:grid-cols-[48px_minmax(72px,88px)_minmax(0,1fr)_minmax(0,1fr)_72px] sm:gap-x-3 sm:px-4 sm:py-2.5";
                const slotActionEdit =
                  "inline-flex items-center rounded-md border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-800 hover:bg-emerald-100";
                const slotActionRemove =
                  "inline-flex items-center rounded-md border border-rose-200 bg-rose-50 px-2 py-0.5 text-[10px] font-semibold text-rose-700 hover:bg-rose-100";
                const canEditSlots =
                  !readOnly && !isClosed && !daySchedule.is24Hours && daySchedule.isOpen;

                return (
                  <div
                    key={daySchedule.day}
                    className="border-b border-gray-100 last:border-b-0 hover:bg-gray-50/40 transition-colors"
                  >
                    <div className={timingsRowGrid}>
                      <label
                        className={`relative inline-flex items-center justify-center pt-1 ${
                          readOnly ? "cursor-not-allowed opacity-60" : "cursor-pointer"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={daySchedule.isOpen && !daySchedule.isOutletClosed}
                          onChange={() => {
                            if (readOnly) return;
                            void handleDayToggle(daySchedule.day);
                          }}
                          disabled={isSaving || readOnly}
                          className="sr-only peer"
                        />
                        <span className="relative inline-flex h-4.5 w-8 items-center rounded-full bg-gray-200 transition peer-checked:bg-emerald-500 peer-disabled:opacity-50">
                          <span
                            className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition ${
                              daySchedule.isOpen && !daySchedule.isOutletClosed
                                ? "translate-x-[15px]"
                                : "translate-x-0.5"
                            }`}
                          />
                        </span>
                      </label>
                      <div className="flex items-center gap-1">
                        <span className="text-xs font-semibold capitalize text-gray-800 truncate">
                          {daySchedule.day}
                        </span>
                        {isCurrentDay ? (
                          <span className="text-[10px] font-semibold text-emerald-600 flex-shrink-0">•</span>
                        ) : null}
                      </div>

                      {daySchedule.slots[0] ? (
                        <div className="flex min-w-0 flex-col gap-1">
                          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                            <div className="relative">
                              <Clock
                                size={11}
                                className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-gray-400"
                              />
                              <input
                                type="time"
                                value={daySchedule.slots[0]?.openingTime || ""}
                                onChange={(e) =>
                                  daySchedule.slots[0] &&
                                  updateTimeSlot(daySchedule.day, daySchedule.slots[0].id, "openingTime", e.target.value)
                                }
                                disabled={slotInputsLocked}
                                readOnly={readOnly}
                                className={slotFieldClassName}
                              />
                              <ChevronDown
                                size={11}
                                className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 text-gray-400"
                              />
                            </div>
                            <span className="text-xs text-gray-400">-</span>
                            <div className="relative">
                              <Clock
                                size={11}
                                className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-gray-400"
                              />
                              <input
                                type="time"
                                value={daySchedule.slots[0]?.closingTime || ""}
                                onChange={(e) =>
                                  daySchedule.slots[0] &&
                                  updateTimeSlot(daySchedule.day, daySchedule.slots[0].id, "closingTime", e.target.value)
                                }
                                disabled={slotInputsLocked}
                                readOnly={readOnly}
                                className={slotFieldClassName}
                              />
                              <ChevronDown
                                size={11}
                                className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 text-gray-400"
                              />
                            </div>
                          </div>
                          {!readOnly && slotHasTimingData(daySchedule.slots[0]) && !daySchedule.isOutletClosed ? (
                            <div className="mt-1 flex flex-wrap items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() =>
                                  setManualTimeChanges((prev) => new Set(prev).add(daySchedule.day))
                                }
                                className={slotActionEdit}
                              >
                                Edit
                              </button>
                              {hasSlot2 ? (
                                <button
                                  type="button"
                                  onClick={() =>
                                    setSlotRemoveConfirm({
                                      day: daySchedule.day,
                                      kind: "morning",
                                      slotId: "",
                                    })
                                  }
                                  className={slotActionRemove}
                                >
                                  Remove
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() =>
                                    daySchedule.slots[0] &&
                                    setSlotRemoveConfirm({
                                      day: daySchedule.day,
                                      kind: "evening",
                                      slotId: daySchedule.slots[0].id,
                                    })
                                  }
                                  className={slotActionRemove}
                                >
                                  Remove
                                </button>
                              )}
                            </div>
                          ) : null}
                        </div>
                      ) : canEditSlots ? (
                        <button
                          type="button"
                          onClick={() => addTimeSlot(daySchedule.day, 0)}
                          className="inline-flex min-h-[40px] w-full flex-row items-center justify-center gap-1.5 whitespace-nowrap rounded-md border border-dashed border-orange-200 bg-orange-50/50 px-2 py-2 text-[11px] font-semibold text-orange-800 transition hover:bg-orange-50"
                        >
                          <Plus size={14} className="shrink-0" aria-hidden />
                          <span className="whitespace-nowrap">Add morning slot</span>
                        </button>
                      ) : (
                        <div className="flex h-8 items-center justify-center rounded-md border border-gray-200 bg-gray-50 text-xs text-gray-400">
                          —
                        </div>
                      )}

                      {hasSlot2 ? (
                        <div className="flex min-w-0 flex-col gap-1">
                          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                            <div className="relative">
                              <Clock
                                size={11}
                                className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-gray-400"
                              />
                              <input
                                type="time"
                                value={daySchedule.slots[1]?.openingTime || ""}
                                onChange={(e) =>
                                  daySchedule.slots[1] &&
                                  updateTimeSlot(daySchedule.day, daySchedule.slots[1].id, "openingTime", e.target.value)
                                }
                                disabled={slotInputsLocked}
                                readOnly={readOnly}
                                className={slotFieldClassName}
                              />
                              <ChevronDown
                                size={11}
                                className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 text-gray-400"
                              />
                            </div>
                            <span className="text-xs text-gray-400">-</span>
                            <div className="relative">
                              <Clock
                                size={11}
                                className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-gray-400"
                              />
                              <input
                                type="time"
                                value={daySchedule.slots[1]?.closingTime || ""}
                                onChange={(e) =>
                                  daySchedule.slots[1] &&
                                  updateTimeSlot(daySchedule.day, daySchedule.slots[1].id, "closingTime", e.target.value)
                                }
                                disabled={slotInputsLocked}
                                readOnly={readOnly}
                                className={slotFieldClassName}
                              />
                              <ChevronDown
                                size={11}
                                className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 text-gray-400"
                              />
                            </div>
                          </div>
                          {!readOnly && slotHasTimingData(daySchedule.slots[1]) && !daySchedule.isOutletClosed ? (
                            <div className="mt-1 flex flex-wrap items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() =>
                                  setManualTimeChanges((prev) => new Set(prev).add(daySchedule.day))
                                }
                                className={slotActionEdit}
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  setSlotRemoveConfirm({
                                    day: daySchedule.day,
                                    kind: "evening",
                                    slotId: daySchedule.slots[1].id,
                                  })
                                }
                                className={slotActionRemove}
                              >
                                Remove
                              </button>
                            </div>
                          ) : null}
                        </div>
                      ) : canEditSlots && daySchedule.slots[0] ? (
                        <button
                          type="button"
                          onClick={() => addTimeSlot(daySchedule.day, 1)}
                          className="inline-flex min-h-[40px] w-full flex-row items-center justify-center gap-1.5 whitespace-nowrap rounded-md border border-dashed border-violet-200 bg-violet-50/50 px-2 py-2 text-[11px] font-semibold text-violet-800 transition hover:bg-violet-50"
                        >
                          <Plus size={14} className="shrink-0" aria-hidden />
                          <span className="whitespace-nowrap">Add evening slot</span>
                        </button>
                      ) : (
                        <div className="flex h-8 items-center justify-center rounded-md border border-gray-200 bg-gray-50 text-xs text-gray-400">
                          —
                        </div>
                      )}

                      <div className="flex items-start justify-center pt-1">
                        {!readOnly && manualTimeChanges.has(daySchedule.day) ? (
                          <button
                            type="button"
                            onClick={() => void saveSingleDayTimings(daySchedule.day)}
                            disabled={isSaving}
                            className="inline-flex min-w-[60px] items-center justify-center gap-1 rounded-lg bg-emerald-500 px-2 py-1.5 text-[11px] font-semibold text-white shadow-sm transition hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            <Save size={12} />
                            {isSaving ? "…" : "Save"}
                          </button>
                        ) : null}
                      </div>
                    </div>
                  </div>
                );
              })}
        </div>
      </div>
    </>
  );
}
