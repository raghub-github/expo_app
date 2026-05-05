"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useStore } from "@/hooks/useStore";
import {
  useStoreStatsQuery,
  useStoreWalletQuery,
  useStoreOperationsQuery,
  useInvalidateMerchantStoreQueries,
} from "@/hooks/queries/useMerchantStoreQueries";
import { StoreDashboardSkeleton } from "./StoreDashboardSkeleton";
import {
  Power,
  Truck,
  TrendingUp,
  TrendingDown,
  ArrowRight,
  Loader2,
  Wallet,
  BarChart3,
  Store,
  Star,
  Info,
  Table2,
  LineChart as LucideLineChart,
  Download,
} from "lucide-react";
import { useToast } from "@/context/ToastContext";
import {
  MERCHANT_PORTAL_CLOSE_REASONS,
  formatCloseReasonForCard,
  merchantPortalCloseReasonWithSuffix,
} from "@/lib/merchantPortalCloseReasons";
import { supabase } from "@/lib/supabase/client";

function formatTimeHMS(t: string | null): string {
  if (!t) return "--";
  const parts = t.split(":");
  if (parts.length === 2) return `${t}:00`;
  if (parts.length === 1) return `${t.padStart(2, "0")}:00:00`;
  return t;
}

function MiniSparkline({ values, className = "" }: { values: readonly number[]; className?: string }) {
  const gid = React.useId().replace(/:/g, "");
  const w = 128;
  const h = 32;
  const pad = 3;
  const nums = values.length ? [...values] : [0];
  const min = Math.min(...nums);
  const max = Math.max(...nums);
  const range = max - min || 1;
  const innerW = w - pad * 2;
  const innerH = h - pad * 2;
  const points = nums.map((v, i) => {
    const x = pad + (nums.length <= 1 ? innerW / 2 : (i / (nums.length - 1)) * innerW);
    const y = pad + innerH - ((v - min) / range) * innerH;
    return { x, y };
  });
  const d = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(" ");
  const last = points[points.length - 1];
  const first = points[0];
  const areaD = last && first ? `${d} L ${last.x.toFixed(2)} ${h - pad} L ${first.x.toFixed(2)} ${h - pad} Z` : "";

  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className={`shrink-0 ${className}`} aria-hidden>
      <defs>
        <linearGradient id={`sf-${gid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgb(59 130 246)" stopOpacity={0.22} />
          <stop offset="100%" stopColor="rgb(59 130 246)" stopOpacity={0} />
        </linearGradient>
      </defs>
      {areaD ? <path d={areaD} fill={`url(#sf-${gid})`} /> : null}
      <path
        d={d}
        fill="none"
        stroke="rgb(37 99 235)"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {points.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r={2} fill="rgb(37 99 235)" />
      ))}
    </svg>
  );
}

function DeltaBadge({ pct }: { pct: number }) {
  const neg = pct < 0;
  return (
    <span
      className={`inline-flex items-center gap-0.5 text-[11px] font-semibold tabular-nums px-2 py-0.5 rounded-full ${
        neg ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700"
      }`}
    >
      {neg ? <TrendingDown size={12} strokeWidth={2.5} aria-hidden /> : <TrendingUp size={12} strokeWidth={2.5} aria-hidden />}
      {pct > 0 ? "+" : ""}
      {pct}%
    </span>
  );
}

export function StoreFullDashboard({ storeId }: { storeId: string }) {
  const router = useRouter();
  const { toast } = useToast();
  const { store: storeFromHook, isLoading: storeLoading } = useStore(storeId);
  const [store, setStore] = useState<{ store_id: string; name: string; approval_status?: string; approval_reason?: string } | null>(null);
  const [statsDate, setStatsDate] = useState("");
  const invalidateStoreQueries = useInvalidateMerchantStoreQueries();
  const operationsQuery = useStoreOperationsQuery(storeId);
  const walletQuery = useStoreWalletQuery(storeId);
  const statsQuery = useStoreStatsQuery(storeId, statsDate || undefined, { refetchInterval: 60000 });

  const [isStoreOpen, setIsStoreOpen] = useState(true);
  const [mxDeliveryEnabled, setMxDeliveryEnabled] = useState(false);
  const [openingTime, setOpeningTime] = useState<string | null>(null);
  const [closingTime, setClosingTime] = useState<string | null>(null);
  const [todayDate, setTodayDate] = useState("");
  const [todaySlots, setTodaySlots] = useState<{ start: string; end: string }[]>([]);
  const [lastToggleBy, setLastToggleBy] = useState<string | null>(null);
  const [lastToggleType, setLastToggleType] = useState<string | null>(null);
  const [lastToggledByName, setLastToggledByName] = useState<string | null>(null);
  const [lastToggledById, setLastToggledById] = useState<string | null>(null);
  const [restrictionType, setRestrictionType] = useState<string | null>(null);
  const [withinHoursButRestricted, setWithinHoursButRestricted] = useState(false);
  const [lastToggledAt, setLastToggledAt] = useState<string | null>(null);
  const [opensAt, setOpensAt] = useState<string | null>(null);
  /** Bumps every second while closed with a future `opensAt` so countdown text re-renders (same pattern as Partner Site mx dashboard). */
  const [countdownTick, setCountdownTick] = useState(0);
  const [manualActivationLock, setManualActivationLock] = useState(false);

  const [showClosePopup, setShowClosePopup] = useState(false);
  const [closeConfirmLoading, setCloseConfirmLoading] = useState(false);
  const [toggleClosureType, setToggleClosureType] = useState<"temporary" | "today" | "manual_hold" | null>(null);
  const [closureDate, setClosureDate] = useState("");
  const [closureTime, setClosureTime] = useState("12:00");
  const [closeReason, setCloseReason] = useState("");
  const [closeReasonOther, setCloseReasonOther] = useState("");
  const [showToggleOnWarning, setShowToggleOnWarning] = useState(false);
  const [toggleOnLoading, setToggleOnLoading] = useState(false);
  const [showStatusModal, setShowStatusModal] = useState(false);
  const [modalStatus, setModalStatus] = useState<{ status: string; reason?: string }>({ status: "", reason: "" });
  const [hasMounted, setHasMounted] = useState(false);

  const [deliveredToday, setDeliveredToday] = useState(0);
  const [revenueToday, setRevenueToday] = useState(0);
  const [insightsTab, setInsightsTab] = useState<"live" | "reports">("live");
  const [reportsSubview, setReportsSubview] = useState<"table" | "chart">("table");
  const [selfDeliveryRiders, setSelfDeliveryRiders] = useState<{ id: unknown; rider_name: string; rider_mobile: string }[]>([]);
  const [selfDeliveryRidersLoading, setSelfDeliveryRidersLoading] = useState(false);

  const [walletAvailableBalance, setWalletAvailableBalance] = useState<number | null>(null);
  const [walletTodayEarning, setWalletTodayEarning] = useState(0);
  const [walletYesterdayEarning, setWalletYesterdayEarning] = useState(0);
  const [walletPendingBalance, setWalletPendingBalance] = useState(0);
  const [walletLoading, setWalletLoading] = useState(true);

  useEffect(() => {
    if (statsDate === "" && typeof window !== "undefined") {
      setStatsDate(new Date().toISOString().slice(0, 10));
    }
  }, [statsDate]);

  // Sync store from React Query (primed by layout or fetched by hook) for modal and display
  useEffect(() => {
    if (!storeFromHook) return;
    setStore(storeFromHook);
    const statusUpper = (storeFromHook.approval_status || "").toUpperCase();
    if (statusUpper && statusUpper !== "APPROVED" && statusUpper !== "DELISTED") {
      setModalStatus({
        status: storeFromHook.approval_status ?? "",
        reason: (storeFromHook as { approval_reason?: string }).approval_reason ?? "",
      });
      setShowStatusModal(true);
    }
  }, [storeFromHook]);

  const isDelisted = ((storeFromHook?.approval_status ?? store?.approval_status) || "").toUpperCase() === "DELISTED";

  const closeReasonDisplay = useMemo(() => {
    const d = operationsQuery.data as { close_reason?: string | null } | undefined;
    const r = d?.close_reason;
    return formatCloseReasonForCard(r != null && String(r).trim() !== "" ? String(r).trim() : null);
  }, [operationsQuery.data]);

  // When app / Partner Site / another tab updates `merchant_stores` or `merchant_store_availability`, refetch ops + store profile.
  useEffect(() => {
    const internalId = storeFromHook?.id;
    if (!internalId || !storeId) return;
    const ch = supabase
      .channel(`merchant_portal_store_ops:${internalId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "merchant_stores", filter: `id=eq.${internalId}` },
        () => {
          invalidateStoreQueries(storeId);
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "merchant_store_availability", filter: `store_id=eq.${internalId}` },
        () => {
          invalidateStoreQueries(storeId);
        }
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [storeFromHook?.id, storeId, invalidateStoreQueries]);

  // Live countdown: tick every 1s; at zero refetch so status can flip to Open without refresh (parity with Partner Site / merchant app).
  useEffect(() => {
    if (!isStoreOpen && opensAt && !withinHoursButRestricted) {
      const t = setInterval(() => {
        const ms = new Date(opensAt).getTime() - Date.now();
        if (ms <= 0) {
          invalidateStoreQueries(storeId);
          return;
        }
        setCountdownTick((n) => n + 1);
      }, 1000);
      return () => clearInterval(t);
    }
  }, [isStoreOpen, opensAt, withinHoursButRestricted, storeId, invalidateStoreQueries]);

  // Sync operations from shared React Query cache
  useEffect(() => {
    const data = operationsQuery.data;
    if (!data || (data as { operational_status?: string }).operational_status === undefined) return;
    const d = data as {
      operational_status?: string;
      opens_at?: string | null;
      today_date?: string;
      today_slots?: { start: string; end: string }[];
      last_toggled_by_email?: string | null;
      last_toggle_type?: string | null;
      last_toggled_by_name?: string | null;
      last_toggled_by_id?: string | null;
      restriction_type?: string | null;
      within_hours_but_restricted?: boolean;
      last_toggled_at?: string | null;
      block_auto_open?: boolean;
      is_today_scheduled_closed?: boolean;
    };
    setIsStoreOpen(d.operational_status === "OPEN");
    setOpensAt(d.opens_at ?? null);
    setTodayDate(d.today_date || "");
    setTodaySlots(d.today_slots || []);
    setLastToggleBy(d.last_toggled_by_email ?? null);
    setLastToggleType(d.last_toggle_type ?? null);
    setLastToggledByName(d.last_toggled_by_name ?? null);
    setLastToggledById(d.last_toggled_by_id ?? null);
    const rt = d.restriction_type != null ? String(d.restriction_type).toLowerCase() : "";
    setRestrictionType(rt === "manual_hold" ? "MANUAL_HOLD" : d.restriction_type ?? null);
    setWithinHoursButRestricted(d.within_hours_but_restricted === true);
    setLastToggledAt(d.last_toggled_at ?? null);
    setManualActivationLock(d.block_auto_open === true);
    const todaySlots = d.today_slots ?? [];
    if (todaySlots.length > 0) {
      const first = todaySlots[0];
      setOpeningTime(first.start ?? null);
      setClosingTime(first.end ?? null);
    } else {
      setOpeningTime(null);
      setClosingTime(null);
    }
  }, [operationsQuery.data]);

  // Sync wallet from shared React Query cache
  useEffect(() => {
    const data = walletQuery.data;
    if (!data) return;
    const d = data as { available_balance?: number; today_earning?: number; yesterday_earning?: number; pending_balance?: number };
    setWalletAvailableBalance(d.available_balance ?? null);
    setWalletTodayEarning(d.today_earning ?? 0);
    setWalletYesterdayEarning(d.yesterday_earning ?? 0);
    setWalletPendingBalance(d.pending_balance ?? 0);
  }, [walletQuery.data]);
  useEffect(() => {
    setWalletLoading(walletQuery.isLoading);
  }, [walletQuery.isLoading]);

  // Sync stats from shared React Query cache (for Live preview figures)
  useEffect(() => {
    const data = statsQuery.data;
    if (!data) return;
    const d = data as {
      deliveredTodayCount?: number;
      totalRevenueToday?: number;
    };
    setDeliveredToday(d.deliveredTodayCount ?? 0);
    setRevenueToday(d.totalRevenueToday ?? 0);
  }, [statsQuery.data]);

  useEffect(() => {
    if (showClosePopup) {
      const now = new Date();
      setClosureDate(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`);
      const in10 = new Date(now.getTime() + 10 * 60 * 1000);
      setClosureTime(`${String(in10.getHours()).padStart(2, "0")}:${String(in10.getMinutes()).padStart(2, "0")}`);
    }
  }, [showClosePopup]);

  const handleStoreToggle = () => {
    if (isDelisted) {
      toast("Store is delisted. Please relist it before opening.");
      return;
    }
    if (isStoreOpen) {
      setShowClosePopup(true);
      setToggleClosureType(null);
    } else {
      setShowToggleOnWarning(true);
    }
  };

  const handleConfirmToggleOn = async () => {
    if (isDelisted) {
      toast("Store is delisted. Please relist it before opening.");
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
        invalidateStoreQueries(storeId);
        setShowToggleOnWarning(false);
        toast("Store is now OPEN. Orders are being accepted!");
      } else {
        toast(data.error || "Failed to open store");
      }
    } catch {
      toast("Failed to open store");
    } finally {
      setToggleOnLoading(false);
    }
  };

  const handleClosePopupConfirm = () => {
    if (!toggleClosureType) {
      toast("Please select closure type");
      return;
    }
    if (toggleClosureType === "temporary") {
      if (!closureDate || !closureTime) {
        toast("Please select date and time for reopening");
        return;
      }
      // Treat picker inputs as IST wall time (parity with backend + mobile/partner clients).
      const closedUntil = new Date(`${closureDate}T${closureTime}:00+05:30`);
      if (closedUntil.getTime() <= Date.now()) {
        toast("Reopening date and time must be in the future");
        return;
      }
    }
    if (!closeReason?.trim()) {
      toast("Please select a reason for closing");
      return;
    }
    if (closeReason === "Other" && !closeReasonOther?.trim()) {
      toast('Please enter the reason in "Other"');
      return;
    }
    void handleFinalCloseConfirm();
  };

  const handleFinalCloseConfirm = async () => {
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
          ...(manualCloseUntilIso ? { manual_close_until: manualCloseUntilIso } : null),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        invalidateStoreQueries(storeId);
        setShowClosePopup(false);
        setToggleClosureType(null);
        setCloseReason("");
        setCloseReasonOther("");
        toast("Store closed.");
      } else {
        toast(data.error || "Failed to close store");
      }
    } catch {
      toast("Failed to close store");
    } finally {
      setCloseConfirmLoading(false);
    }
  };

  const handleCancelClosePopup = () => {
    if (closeConfirmLoading) return;
    setShowClosePopup(false);
    setToggleClosureType(null);
    setCloseReason("");
    setCloseReasonOther("");
  };

  const saveManualActivationLock = useCallback(async (enabled: boolean) => {
    try {
      const res = await fetch(`/api/merchant/stores/${storeId}/store-operations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "update_manual_lock", block_auto_open: enabled }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        invalidateStoreQueries(storeId);
        toast(enabled ? "Manual activation lock enabled" : "Manual activation lock disabled");
      } else {
        setManualActivationLock(!enabled);
        toast("Failed to save");
      }
    } catch {
      setManualActivationLock(!enabled);
      toast("Failed to save");
    }
  }, [storeId, invalidateStoreQueries, toast]);

  const isLoading = storeLoading;

  useEffect(() => {
    if (!storeId) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/merchant/stores/${storeId}/store-settings`, { credentials: "include" });
        const data = (await res.json().catch(() => null)) as { success?: boolean; self_delivery?: boolean } | null;
        if (!cancelled && data?.success && typeof data.self_delivery === "boolean") {
          setMxDeliveryEnabled(data.self_delivery);
        }
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [storeId]);

  useEffect(() => {
    if (!storeId || !mxDeliveryEnabled) {
      setSelfDeliveryRiders([]);
      return;
    }
    let cancelled = false;
    setSelfDeliveryRidersLoading(true);
    (async () => {
      try {
        const res = await fetch(`/api/merchant/stores/${storeId}/self-delivery-riders`, { credentials: "include" });
        const data = (await res.json().catch(() => null)) as { success?: boolean; riders?: { id: unknown; rider_name: string; rider_mobile: string }[] } | null;
        if (!cancelled && data?.success && Array.isArray(data.riders)) {
          setSelfDeliveryRiders(data.riders);
        }
      } catch {
        if (!cancelled) setSelfDeliveryRiders([]);
      } finally {
        if (!cancelled) setSelfDeliveryRidersLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [storeId, mxDeliveryEnabled]);

  const handleMXDeliveryToggle = useCallback(async () => {
    if (!mxDeliveryEnabled) {
      toast("Self delivery cannot be turned on from the dashboard. Contact support if you need it enabled.");
      return;
    }
    setMxDeliveryEnabled(false);
    try {
      const res = await fetch(`/api/merchant/stores/${storeId}/store-settings`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ platform_delivery: true, self_delivery: false }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || (data as { success?: boolean }).success === false) {
        throw new Error("Failed");
      }
      invalidateStoreQueries(storeId);
      toast("Switched to GatiMitra platform riders");
    } catch {
      setMxDeliveryEnabled(true);
      toast("Failed to update delivery mode");
    }
  }, [storeId, mxDeliveryEnabled, invalidateStoreQueries, toast]);

  const aovDisplay = useMemo(() => {
    if (deliveredToday > 0 && revenueToday > 0) {
      return Math.round(revenueToday / deliveredToday);
    }
    return 318;
  }, [deliveredToday, revenueToday]);

  // Avoid hydration mismatch: server and first client render have no query cache,
  // so server renders skeleton. Defer showing real content until after client mount.
  useEffect(() => {
    setHasMounted(true);
  }, []);

  if (!hasMounted || isLoading) {
    return <StoreDashboardSkeleton />;
  }
  if (!storeFromHook) {
    return (
      <div className="flex min-h-[200px] items-center justify-center rounded-xl border border-gray-200 bg-white p-8">
        <p className="text-gray-500">Store not found.</p>
        <button
          type="button"
          onClick={() => router.push("/dashboard/merchants")}
          className="mt-4 text-sm font-medium text-indigo-600 hover:text-indigo-700"
        >
          Go to Merchants
        </button>
      </div>
    );
  }

  return (
    <>
      {/* Status modal (non-APPROVED store) */}
      {showStatusModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" role="dialog">
          <div className="mx-auto max-w-md rounded-2xl bg-white p-8 shadow-xl border border-gray-200">
            <h2 className="text-2xl font-bold mb-4 text-gray-900">Store Status</h2>
            <p className="text-sm text-gray-600 mb-6">{modalStatus.reason || modalStatus.status}</p>
            <button
              onClick={() => { setShowStatusModal(false); router.push("/dashboard/merchants"); }}
              className="w-full px-4 py-3 bg-indigo-600 text-white rounded-xl font-semibold hover:bg-indigo-700"
            >
              Back to Merchants
            </button>
          </div>
        </div>
      )}

      {/* Close store popup */}
      {showClosePopup && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4" role="dialog">
          <div className="mx-auto max-w-md rounded-2xl bg-white p-6 shadow-xl border border-gray-200">
            <h2 className="text-lg font-bold text-gray-900 mb-4">How would you like to close your store?</h2>
            <div className="space-y-3">
              <label className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer border-2 ${toggleClosureType === "temporary" ? "bg-orange-50 border-orange-400" : "border-gray-200"}`}>
                <input type="radio" name="closureType" checked={toggleClosureType === "temporary"} onChange={() => setToggleClosureType("temporary")} className="w-4 h-4" />
                <div><p className="text-sm font-semibold">Temporary Closed</p><p className="text-xs text-gray-600">Reopens at date & time or turn ON manually.</p></div>
              </label>
              {toggleClosureType === "temporary" && (
                <div className="ml-7 grid grid-cols-2 gap-3">
                  <div><label className="text-[10px] text-gray-500 block mb-1">Date</label><input type="date" value={closureDate} onChange={(e) => setClosureDate(e.target.value)} className="w-full px-3 py-2 border rounded-lg text-sm" /></div>
                  <div><label className="text-[10px] text-gray-500 block mb-1">Time</label><input type="time" value={closureTime} onChange={(e) => setClosureTime(e.target.value)} className="w-full px-3 py-2 border rounded-lg text-sm" /></div>
                </div>
              )}
              <label className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer border-2 ${toggleClosureType === "today" ? "bg-red-50 border-red-400" : "border-gray-200"}`}>
                <input type="radio" name="closureType" checked={toggleClosureType === "today"} onChange={() => setToggleClosureType("today")} className="w-4 h-4" />
                <div><p className="text-sm font-semibold">Close for Today</p><p className="text-xs text-gray-600">Reopen tomorrow at {openingTime ? formatTimeHMS(openingTime) : "scheduled opening time"}</p></div>
              </label>
              <label className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer border-2 ${toggleClosureType === "manual_hold" ? "bg-amber-50 border-amber-400" : "border-gray-200"}`}>
                <input type="radio" name="closureType" checked={toggleClosureType === "manual_hold"} onChange={() => setToggleClosureType("manual_hold")} className="w-4 h-4" />
                <div><p className="text-sm font-semibold">Until I manually turn it ON</p></div>
              </label>
            </div>
            <div className="mt-4">
              <label className="text-xs font-semibold text-gray-700 block mb-2">Reason for closing *</label>
              <select value={closeReason} onChange={(e) => setCloseReason(e.target.value)} className="w-full px-3 py-2 border rounded-lg text-sm">
                <option value="">Select reason</option>
                {MERCHANT_PORTAL_CLOSE_REASONS.map((r) => (
                  <option key={r} value={r}>
                    {merchantPortalCloseReasonWithSuffix(r)}
                  </option>
                ))}
              </select>
              {closeReason === "Other" && <input type="text" value={closeReasonOther} onChange={(e) => setCloseReasonOther(e.target.value)} placeholder="Enter reason" className="w-full mt-2 px-3 py-2 border rounded-lg text-sm" />}
            </div>
            <div className="flex gap-3 mt-5">
              <button type="button" onClick={handleCancelClosePopup} disabled={closeConfirmLoading} className="flex-1 px-4 py-2.5 border rounded-xl text-gray-700 font-medium">Cancel</button>
              <button
                type="button"
                onClick={handleClosePopupConfirm}
                disabled={
                  !toggleClosureType ||
                  !closeReason?.trim() ||
                  (closeReason === "Other" && !closeReasonOther?.trim()) ||
                  (toggleClosureType === "temporary" && (!closureDate || !closureTime)) ||
                  closeConfirmLoading
                }
                className="flex-1 px-4 py-2.5 bg-red-600 text-white rounded-xl font-medium disabled:opacity-50"
              >
                {closeConfirmLoading ? <><Loader2 className="inline h-4 w-4 animate-spin mr-1" />Confirming...</> : "Confirm"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Turn store ON warning */}
      {showToggleOnWarning && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4">
          <div className="max-w-sm w-full rounded-2xl bg-white p-6 border-2 border-emerald-200">
            <h3 className="text-lg font-bold text-gray-900 text-center mb-4">Turn Store ON?</h3>
            <p className="text-sm text-gray-600 text-center mb-6">Your store will be OPEN and customers can place orders.</p>
            <div className="flex gap-3">
              <button onClick={() => !toggleOnLoading && setShowToggleOnWarning(false)} disabled={toggleOnLoading} className="flex-1 px-4 py-2.5 border-2 border-gray-300 rounded-lg font-semibold">Cancel</button>
              <button onClick={handleConfirmToggleOn} disabled={toggleOnLoading} className="flex-1 px-4 py-2.5 bg-emerald-600 text-white rounded-lg font-semibold inline-flex items-center justify-center gap-2">
                {toggleOnLoading ? <><Loader2 className="h-4 w-4 animate-spin" /> Turning ON...</> : "Yes, Turn ON"}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex-1 flex flex-col min-h-0 bg-[#f8fafc] overflow-hidden w-full">
        <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden px-4 sm:px-6 lg:px-8 py-5">
          <div className="max-w-[1600px] mx-auto space-y-5">
            {/* Wallet | Store | Delivery — partnersite-style */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-stretch pb-1">
              <section className="min-w-0 flex flex-col h-full">
                <div className="flex flex-1 flex-col min-h-[240px] sm:min-h-[252px] rounded-xl border-2 border-teal-500 bg-white/40 p-3 sm:p-3.5">
                  <div className="flex items-start gap-2 mb-3 shrink-0">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-emerald-500/[0.08] text-emerald-600 ring-1 ring-emerald-500/15">
                      <Wallet className="h-4 w-4" strokeWidth={2} />
                    </span>
                    <div className="min-w-0 pt-0.5">
                      <h2 className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">Wallet &amp; earnings</h2>
                      <p className="text-[11px] text-slate-400 mt-0.5 leading-snug">Balances at a glance</p>
                    </div>
                  </div>
                  <div className="flex-1 flex flex-col justify-center min-h-0">
                    {walletLoading ? (
                      <div className="grid grid-cols-2 gap-2.5">
                        {[1, 2, 3, 4].map((i) => (
                          <div key={i} className="h-9 rounded-md bg-slate-200/50 animate-pulse" />
                        ))}
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                        <div className="min-w-0">
                          <p className="text-[9px] font-medium uppercase tracking-wide text-slate-500">Available</p>
                          <p className="mt-0.5 text-base sm:text-lg font-semibold tabular-nums tracking-tight text-emerald-700">
                            ₹{walletAvailableBalance != null ? Number(walletAvailableBalance).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "0.00"}
                          </p>
                        </div>
                        <div className="min-w-0">
                          <p className="text-[9px] font-medium uppercase tracking-wide text-slate-500">Today</p>
                          <p className="mt-0.5 text-base sm:text-lg font-semibold tabular-nums tracking-tight text-orange-600">
                            ₹{Number(walletTodayEarning).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </p>
                        </div>
                        <div className="min-w-0">
                          <p className="text-[9px] font-medium uppercase tracking-wide text-slate-500">Yesterday</p>
                          <p className="mt-0.5 text-sm font-semibold tabular-nums text-slate-800">
                            ₹{Number(walletYesterdayEarning).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </p>
                        </div>
                        <div className="min-w-0">
                          <p className="text-[9px] font-medium uppercase tracking-wide text-slate-500">Pending</p>
                          <p className="mt-0.5 text-sm font-semibold tabular-nums text-violet-600">
                            ₹{Number(walletPendingBalance).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </section>

              <section className="min-w-0 flex flex-col h-full">
                <div
                  className={`flex flex-1 flex-col min-h-[240px] sm:min-h-[252px] rounded-xl border-2 bg-white/40 p-3 sm:p-3.5 ${
                    isStoreOpen ? "border-teal-500" : restrictionType === "MANUAL_HOLD" ? "border-amber-500" : "border-red-500"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2 shrink-0">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-800/[0.06] text-slate-700 ring-1 ring-slate-900/10">
                          <Store className="h-[15px] w-[15px]" strokeWidth={2} />
                        </span>
                        <h2 className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">Store status</h2>
                      </div>
                      <p className="text-sm font-semibold text-slate-900 tabular-nums leading-tight">
                        {openingTime && closingTime ? `${formatTimeHMS(openingTime)} – ${formatTimeHMS(closingTime)}` : todaySlots.length ? todaySlots.map((s) => `${s.start}–${s.end}`).join(", ") : "—"}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={handleStoreToggle}
                      className={`shrink-0 flex h-10 w-10 items-center justify-center rounded-full text-white shadow-sm transition-transform hover:scale-105 active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 ${
                        isStoreOpen
                          ? "bg-emerald-500 hover:bg-emerald-600 focus-visible:ring-emerald-500"
                          : restrictionType === "MANUAL_HOLD"
                            ? "bg-amber-500 hover:bg-amber-600 focus-visible:ring-amber-500"
                            : "bg-red-500 hover:bg-red-600 focus-visible:ring-red-500"
                      }`}
                      aria-label={isStoreOpen ? "Close store" : "Open store"}
                    >
                      <Power size={18} strokeWidth={2.25} />
                    </button>
                  </div>
                  <div className="flex-1 min-h-0 flex flex-col gap-1.5 mt-2">
                    <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                      <span
                        className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                          isStoreOpen
                            ? "bg-emerald-500/10 text-emerald-800 ring-1 ring-emerald-500/20"
                            : restrictionType === "MANUAL_HOLD"
                              ? "bg-amber-500/10 text-amber-900 ring-1 ring-amber-500/25"
                              : "bg-red-500/10 text-red-800 ring-1 ring-red-500/20"
                        }`}
                      >
                        <span
                          className={`h-1.5 w-1.5 rounded-full ${isStoreOpen ? "bg-emerald-500 animate-pulse" : restrictionType === "MANUAL_HOLD" ? "bg-amber-500" : "bg-red-500"}`}
                        />
                        {isStoreOpen ? "Open" : restrictionType === "MANUAL_HOLD" ? "Waiting manual activation" : "Closed"}
                      </span>
                    </div>
                    {!isStoreOpen && opensAt && !withinHoursButRestricted && (() => {
                      void countdownTick;
                      const ms = new Date(opensAt).getTime() - Date.now();
                      if (ms <= 0) {
                        return <p className="text-[11px] font-medium text-red-600">Opens now</p>;
                      }
                      const h = Math.floor(ms / 3600000);
                      const m = Math.floor((ms % 3600000) / 60000);
                      const s = Math.floor((ms % 60000) / 1000);
                      if (h === 0 && m === 0 && s === 0) {
                        return <p className="text-[11px] font-medium text-red-600">Opens now</p>;
                      }
                      return (
                        <p
                          className="text-[11px] font-medium text-red-700"
                          title="Updates every second. Store will open automatically at zero."
                        >
                          Opens in {h}h {m}m {s}s
                        </p>
                      );
                    })()}
                    {!isStoreOpen && closeReasonDisplay && (
                      <p className="text-[11px] text-slate-600 leading-snug line-clamp-3" title={closeReasonDisplay}>
                        <span className="font-semibold text-slate-700">Close reason: </span>
                        {closeReasonDisplay}
                      </p>
                    )}
                    {(lastToggledByName || lastToggleBy || lastToggleType) && lastToggledAt && (
                      <p className="text-[11px] text-slate-500 leading-snug">
                        Last:{" "}
                        {(() => {
                          const typeUp = String(lastToggleType || "").toUpperCase();
                          const timeStr = new Date(lastToggledAt).toLocaleTimeString("en-IN", {
                            hour: "2-digit",
                            minute: "2-digit",
                            second: "2-digit",
                            hour12: true,
                          });
                          const email = lastToggleBy || "";
                          const emailNorm = String(email).toLowerCase();
                          const isGatiMitraAgent =
                            emailNorm.includes("gatimitra") || emailNorm.endsWith("@gatimitra.in") || emailNorm.endsWith("@gatimitra.com");
                          if (typeUp.startsWith("AUTO")) {
                            return `${isStoreOpen ? "Auto on" : "Auto closed"} · ${timeStr}`;
                          }
                          if (isGatiMitraAgent) {
                            return `${isStoreOpen ? "Opened" : "Closed"} by GatiMitra (agent: ${email || "unknown"}) · ${timeStr}`;
                          }
                          const who = lastToggledByName || lastToggleBy || "User";
                          const storeIdText = storeFromHook?.store_id ? ` (ID: ${storeFromHook.store_id})` : "";
                          return `${isStoreOpen ? "Opened" : "Closed"} by ${who}${storeIdText} · ${timeStr}`;
                        })()}
                      </p>
                    )}
                  </div>
                  <div className="mt-auto flex items-center justify-between gap-2 pt-2.5 border-t border-slate-200/80 shrink-0">
                    <div className="min-w-0">
                      <p className="text-[11px] font-semibold text-slate-800">Manual activation lock</p>
                      <p className="text-[10px] text-slate-500 mt-0.5 leading-snug">Prevents automatic opening</p>
                    </div>
                    <label className="relative inline-flex shrink-0 cursor-pointer items-center">
                      <input
                        type="checkbox"
                        checked={manualActivationLock}
                        onChange={(e) => {
                          setManualActivationLock(e.target.checked);
                          saveManualActivationLock(e.target.checked);
                        }}
                        className="peer sr-only"
                      />
                      <div className="relative h-6 w-11 rounded-full bg-slate-200 transition-colors after:absolute after:left-[3px] after:top-[3px] after:h-[18px] after:w-[18px] after:rounded-full after:border after:border-slate-200/80 after:bg-white after:shadow-sm after:transition-transform after:content-[''] peer-focus-visible:ring-2 peer-focus-visible:ring-orange-400 peer-focus-visible:ring-offset-2 peer-checked:bg-red-600 peer-checked:after:translate-x-[22px]" />
                    </label>
                  </div>
                </div>
              </section>

              <section className="min-w-0 flex flex-col h-full">
                <div className="flex flex-1 flex-col min-h-[240px] sm:min-h-[252px] rounded-xl border-2 border-teal-500 bg-white/40 p-3 sm:p-3.5">
                  <div className="flex items-start gap-2 mb-2 shrink-0">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-orange-500/[0.08] text-orange-600 ring-1 ring-orange-500/15">
                      <Truck className="h-4 w-4" strokeWidth={2} />
                    </span>
                    <div className="min-w-0 pt-0.5">
                      <h2 className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">Delivery mode</h2>
                      <p className="text-[11px] text-slate-400 mt-0.5">{mxDeliveryEnabled ? "Your riders" : "Platform riders"}</p>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <span className={`text-xs font-semibold transition-colors ${!mxDeliveryEnabled ? "text-violet-700" : "text-slate-400"}`}>GatiMitra</span>
                    <button
                      type="button"
                      disabled={!mxDeliveryEnabled}
                      title={
                        mxDeliveryEnabled
                          ? "Switch to GatiMitra platform riders"
                          : "Self delivery cannot be turned on here. Contact support."
                      }
                      onClick={() => void handleMXDeliveryToggle()}
                      className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-400 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 ${mxDeliveryEnabled ? "bg-orange-500" : "bg-slate-300"}`}
                      aria-label={mxDeliveryEnabled ? "Switch to GatiMitra delivery" : "Self delivery cannot be enabled from here"}
                    >
                      <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow-sm transition-transform ${mxDeliveryEnabled ? "translate-x-[18px]" : "translate-x-[3px]"}`} />
                    </button>
                    <span className={`text-xs font-semibold transition-colors ${mxDeliveryEnabled ? "text-orange-600" : "text-slate-400"}`}>Self</span>
                  </div>
                  <div className="mt-3 flex min-h-[120px] flex-1 flex-col border-t border-slate-200/80 pt-2.5">
                    {mxDeliveryEnabled ? (
                      <>
                        {selfDeliveryRidersLoading ? (
                          <p className="text-[11px] text-slate-500">Loading riders…</p>
                        ) : selfDeliveryRiders.length === 0 ? (
                          <div className="flex flex-1 flex-col gap-2 justify-center">
                            <p className="text-xs text-amber-800 leading-snug">No self-delivery riders yet. Add riders in store settings.</p>
                            <Link
                              href={`/dashboard/merchants/stores/${storeId}/store-settings`}
                              className="text-xs font-semibold text-orange-600 hover:text-orange-700"
                            >
                              Add riders in Settings →
                            </Link>
                          </div>
                        ) : (
                          <div className="flex flex-1 min-h-0 flex-col gap-2">
                            <ul className="space-y-2 max-h-44 overflow-y-auto pr-1">
                              {selfDeliveryRiders.map((r) => (
                                <li
                                  key={String(r.id)}
                                  className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 rounded-lg bg-slate-50/90 px-2 py-1.5 text-xs text-slate-800 border border-slate-100"
                                >
                                  <span className="font-mono text-[10px] font-medium text-slate-400 tabular-nums">#{String(r.id)}</span>
                                  <span className="font-semibold text-slate-900">{r.rider_name}</span>
                                  <span className="text-slate-500 tabular-nums">{r.rider_mobile}</span>
                                </li>
                              ))}
                            </ul>
                            <Link
                              href={`/dashboard/merchants/stores/${storeId}/store-settings`}
                              className="inline-flex items-center text-xs font-semibold text-orange-600 hover:text-orange-700 shrink-0 pt-1"
                            >
                              Manage all riders →
                            </Link>
                          </div>
                        )}
                      </>
                    ) : (
                      <div className="flex flex-1 flex-col justify-center">
                        <p className="text-[11px] text-slate-500 leading-snug">
                          Delivery is handled by <span className="font-semibold text-violet-700">GatiMitra</span> platform riders. If Self Delivery is enabled for the {" "}
                          <span className="font-semibold text-slate-700">Merchant</span> their own riders list will be visible here for assignment..
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </section>
            </div>

            {/* Partner site copy — directly under the three summary cards */}
            <div className="mt-6 sm:mt-8 max-w-3xl">
              <p className="text-[11px] sm:text-sm text-slate-600 leading-relaxed">
                See how your store is performing today and how it stacks up against recent periods—so you can spot trends early and act quickly.
              </p>
            </div>

            {/* Insights — Live preview / Business reports (partnersite) */}
            <div className="mt-8 pt-6 border-t border-slate-200/90">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between lg:gap-6">
                <div className="flex flex-col gap-3 min-w-0">
                  <div className="inline-flex rounded-lg border border-slate-200/90 p-0.5 bg-slate-100/40 w-fit" role="tablist" aria-label="Dashboard view">
                    <button
                      type="button"
                      role="tab"
                      aria-selected={insightsTab === "live"}
                      onClick={() => setInsightsTab("live")}
                      className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                        insightsTab === "live" ? "bg-white text-blue-700 shadow-sm ring-1 ring-slate-200/80" : "text-slate-600 hover:text-slate-900"
                      }`}
                    >
                      Live preview
                    </button>
                    <button
                      type="button"
                      role="tab"
                      aria-selected={insightsTab === "reports"}
                      onClick={() => setInsightsTab("reports")}
                      className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                        insightsTab === "reports" ? "bg-white text-blue-700 shadow-sm ring-1 ring-slate-200/80" : "text-slate-600 hover:text-slate-900"
                      }`}
                    >
                      Business reports
                    </button>
                  </div>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end shrink-0 min-w-0">
                  <div
                    className="min-w-0 max-w-[min(100%,320px)] text-xs font-medium text-slate-800 border border-slate-200/90 rounded-lg px-3 py-2 bg-white/80 truncate"
                    title={storeFromHook?.name ?? "Store"}
                  >
                    {storeFromHook?.name ?? "Store"}
                  </div>
                </div>
              </div>

              {insightsTab === "reports" && (
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mt-6 sm:mt-8 mb-4 pb-3 border-b border-slate-200/70">
                  <div className="inline-flex rounded-lg border border-slate-200/90 p-0.5 bg-slate-100/40 w-fit" role="tablist" aria-label="Report layout">
                    <button
                      type="button"
                      aria-selected={reportsSubview === "table"}
                      onClick={() => setReportsSubview("table")}
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                        reportsSubview === "table" ? "bg-white text-blue-700 shadow-sm ring-1 ring-slate-200/80" : "text-slate-600 hover:text-slate-900"
                      }`}
                    >
                      <Table2 size={14} aria-hidden />
                      Table
                    </button>
                    <button
                      type="button"
                      aria-selected={reportsSubview === "chart"}
                      onClick={() => setReportsSubview("chart")}
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                        reportsSubview === "chart" ? "bg-white text-blue-700 shadow-sm ring-1 ring-slate-200/80" : "text-slate-600 hover:text-slate-900"
                      }`}
                    >
                      <LucideLineChart size={14} aria-hidden />
                      Charts
                    </button>
                  </div>
                  <button
                    type="button"
                    disabled
                    title="Export coming soon"
                    className="inline-flex items-center gap-2 text-xs font-semibold text-slate-500 border border-dashed border-slate-200 rounded-lg px-3 py-2 cursor-not-allowed opacity-80"
                  >
                    <Download size={14} aria-hidden />
                    Generate report
                  </button>
                </div>
              )}

              {insightsTab === "live" && (
                <>
                  <div className="mt-6 sm:mt-8 mb-10">
                    <div className="flex flex-wrap items-center gap-2 gap-y-1 pb-3 border-b border-slate-200/80">
                      <BarChart3 className="text-emerald-600 shrink-0" size={18} strokeWidth={2} aria-hidden />
                      <h2 className="text-sm font-bold text-slate-900 tracking-tight">Sales overview</h2>
                      <span className="text-slate-400" title="Info">
                        <Info size={15} strokeWidth={2} aria-hidden />
                      </span>
                      <Link
                        href={`/dashboard/merchants/stores/${storeId}/payments`}
                        className="ml-auto inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-700"
                      >
                        View details
                        <ArrowRight size={14} aria-hidden />
                      </Link>
                    </div>
                    <div className="divide-y divide-slate-200/70">
                      <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 sm:gap-3 items-center py-3.5">
                        <div className="sm:col-span-3 text-sm text-slate-700 font-medium">Sales</div>
                        <div className="sm:col-span-5 flex justify-start sm:justify-center">
                          <MiniSparkline values={[42, 55, 48, 62, 58, 45, 38, 33, 28, 25]} />
                        </div>
                        <div className="sm:col-span-4 flex flex-wrap items-center justify-start sm:justify-end gap-2">
                          <span className="text-sm font-semibold tabular-nums text-slate-900">
                            {walletLoading ? "…" : `₹${Number(walletTodayEarning).toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`}
                          </span>
                          <DeltaBadge pct={-12} />
                        </div>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 sm:gap-3 items-center py-3.5">
                        <div className="sm:col-span-3 text-sm text-slate-700 font-medium">Delivered orders</div>
                        <div className="sm:col-span-5 flex justify-start sm:justify-center">
                          <MiniSparkline values={[18, 22, 20, 24, 21, 19, 16, 14, 12, 11]} />
                        </div>
                        <div className="sm:col-span-4 flex flex-wrap items-center justify-start sm:justify-end gap-2">
                          <span className="text-sm font-semibold tabular-nums text-slate-900">{deliveredToday}</span>
                          <DeltaBadge pct={-8} />
                        </div>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 sm:gap-3 items-center py-3.5">
                        <div className="sm:col-span-3 text-sm text-slate-700 font-medium">AOV</div>
                        <div className="sm:col-span-5 flex justify-start sm:justify-center">
                          <MiniSparkline values={[280, 295, 288, 310, 305, 298, 292, 285, 278, 272]} />
                        </div>
                        <div className="sm:col-span-4 flex flex-wrap items-center justify-start sm:justify-end gap-2">
                          <span className="text-sm font-semibold tabular-nums text-slate-900">₹{aovDisplay}</span>
                          <DeltaBadge pct={-5} />
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="mb-10">
                    <div className="flex flex-wrap items-center gap-2 gap-y-1 pb-3 border-b border-slate-200/80">
                      <Star className="text-amber-500 shrink-0" size={18} strokeWidth={2} aria-hidden />
                      <h2 className="text-sm font-bold text-slate-900 tracking-tight">Customer experience</h2>
                      <span className="text-slate-400">
                        <Info size={15} strokeWidth={2} aria-hidden />
                      </span>
                    </div>
                    <div className="divide-y divide-slate-200/70">
                      <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 sm:gap-3 items-center py-3.5">
                        <div className="sm:col-span-3 text-sm text-slate-700 font-medium">Ratings</div>
                        <div className="sm:col-span-5 flex justify-start sm:justify-center">
                          <MiniSparkline values={[4.1, 4.0, 4.05, 3.95, 3.9, 3.88, 3.85, 3.82, 3.8, 3.78]} />
                        </div>
                        <div className="sm:col-span-4 flex justify-start sm:justify-end">
                          <Link href={`/dashboard/merchants/stores/${storeId}/user-insights`} className="text-xs font-semibold text-blue-600 hover:text-blue-700">
                            View business reports
                          </Link>
                        </div>
                      </div>
                    </div>
                  </div>
                </>
              )}

              {insightsTab === "reports" && reportsSubview === "table" && (
                <div className="mt-2 pb-8">
                  <div className="overflow-x-auto rounded-lg border border-slate-200/80 bg-white/70">
                    <table className="min-w-full text-xs text-slate-800">
                      <thead>
                        <tr className="border-b border-slate-200 bg-slate-100/80 text-left text-[10px] uppercase tracking-wide text-slate-500">
                          <th className="px-3 py-2.5 font-semibold">Metric</th>
                          <th className="px-3 py-2.5 font-semibold">Trend</th>
                          <th className="px-3 py-2.5 font-semibold tabular-nums">This week</th>
                          <th className="px-3 py-2.5 font-semibold tabular-nums">Last week</th>
                          <th className="px-3 py-2.5 font-semibold">vs prior</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {[
                          { m: "Gross sales", tw: revenueToday || 0, lw: Math.max(0, revenueToday * 0.92), spark: [42, 55, 48, 62, 58, 45, 38, 33, 28, 25] as const },
                          { m: "Orders", tw: deliveredToday, lw: Math.max(0, Math.floor(deliveredToday * 0.95)), spark: [18, 22, 20, 24, 21, 19, 16, 14, 12, 11] as const },
                          { m: "AOV", tw: aovDisplay, lw: aovDisplay, spark: [280, 295, 288, 310, 305, 298, 292, 285, 278, 272] as const },
                        ].map((row) => {
                          const pct = row.lw ? Math.round(((row.tw - row.lw) / (row.lw || 1)) * 100) : 0;
                          return (
                            <tr key={row.m}>
                              <td className="px-3 py-2.5 font-medium text-slate-900">{row.m}</td>
                              <td className="px-3 py-2.5">
                                <MiniSparkline values={[...row.spark]} />
                              </td>
                              <td className="px-3 py-2.5 tabular-nums font-semibold">
                                {row.m === "Gross sales" ? `₹${row.tw.toLocaleString("en-IN")}` : row.tw}
                              </td>
                              <td className="px-3 py-2.5 tabular-nums text-slate-600">
                                {row.m === "Gross sales" ? `₹${Math.round(row.lw).toLocaleString("en-IN")}` : row.lw}
                              </td>
                              <td className="px-3 py-2.5">
                                <DeltaBadge pct={pct} />
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-3 leading-relaxed">Figures use today&apos;s snapshot where available; full analytics on the dedicated reports page.</p>
                </div>
              )}

              {insightsTab === "reports" && reportsSubview === "chart" && (
                <div className="mt-2 pb-8 grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {[
                    { title: "Gross sales", bars: [42, 55, 48, 62, 58, 45, 38] as const },
                    { title: "Orders", bars: [18, 22, 20, 24, 21, 19, 16] as const },
                    { title: "AOV", bars: [72, 78, 75, 82, 80, 76, 70] as const },
                    { title: "Repeat rate", bars: [55, 58, 56, 60, 59, 57, 54] as const },
                  ].map((block) => (
                    <div key={block.title} className="rounded-lg border border-slate-200/80 bg-white/70 p-4">
                      <p className="text-xs font-semibold text-slate-900 mb-3">{block.title}</p>
                      <div className="flex items-end gap-1.5 h-28">
                        {block.bars.map((h, i) => (
                          <div key={i} className="flex-1 min-w-[6px] rounded-t-md bg-blue-600/85" style={{ height: `${Math.max(12, h)}%` }} />
                        ))}
                      </div>
                    </div>
                  ))}
                  <p className="sm:col-span-2 text-[11px] text-slate-500 leading-relaxed">Chart preview layout; connect reporting endpoints for live series.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
