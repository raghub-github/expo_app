"use client";

import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
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
  Clock,
  Package,
  TrendingUp,
  Users,
  ArrowRight,
  CheckCircle2,
  XCircle,
  Loader2,
  Calendar,
  SlidersHorizontal,
  ChevronUp,
  Wallet,
  BarChart3,
} from "lucide-react";
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  ComposedChart,
  Legend,
} from "recharts";
import { useToast } from "@/context/ToastContext";

function formatTimeHMS(t: string): string {
  if (!t) return "00:00:00";
  const parts = t.split(":");
  if (parts.length === 2) return `${t}:00`;
  if (parts.length === 1) return `${t.padStart(2, "0")}:00:00`;
  return t;
}

function ChartCardHeader({
  title,
  dateRange,
  onFilterClick,
  filterOpen,
  hideFilterButton = false,
  children,
}: {
  title: string;
  dateRange: string;
  onFilterClick: () => void;
  filterOpen: boolean;
  hideFilterButton?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-2 mb-3 min-h-[28px]">
      <h3 className="text-sm font-bold text-gray-900 truncate">{title}</h3>
      <div className="flex items-center gap-1.5 shrink-0">
        <span className="text-[10px] text-gray-500 tabular-nums">{dateRange}</span>
        {!hideFilterButton && (
          <button
            type="button"
            onClick={onFilterClick}
            className={`p-1.5 rounded-lg transition-colors ${filterOpen ? "bg-orange-100 text-orange-600" : "hover:bg-gray-100 text-gray-500"}`}
            aria-label="Filter chart"
          >
            <SlidersHorizontal size={14} />
          </button>
        )}
      </div>
      {children}
    </div>
  );
}

function ChartFilterPopover({
  open,
  onClose,
  dateFrom,
  dateTo,
  onDateFromChange,
  onDateToChange,
  orderType,
  onOrderTypeChange,
  onApply,
}: {
  open: boolean;
  onClose: () => void;
  dateFrom: string;
  dateTo: string;
  onDateFromChange: (v: string) => void;
  onDateToChange: (v: string) => void;
  orderType: string;
  onOrderTypeChange: (v: string) => void;
  onApply: () => void;
}) {
  if (!open) return null;
  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} aria-hidden="true" />
      <div
        className="absolute right-0 top-full mt-1 z-50 w-56 rounded-lg border border-gray-200 bg-white p-3 shadow-lg"
        style={{ minWidth: "200px" }}
      >
        <p className="text-xs font-semibold text-gray-700 mb-2">Filter</p>
        <div className="space-y-2">
          <div>
            <label className="text-[10px] text-gray-500 block mb-0.5">Date range</label>
            <div className="grid grid-cols-2 gap-1">
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => onDateFromChange(e.target.value)}
                className="text-xs border border-gray-300 rounded px-2 py-1.5"
              />
              <input
                type="date"
                value={dateTo}
                onChange={(e) => onDateToChange(e.target.value)}
                className="text-xs border border-gray-300 rounded px-2 py-1.5"
              />
            </div>
          </div>
          <div>
            <label className="text-[10px] text-gray-500 block mb-0.5">Order type</label>
            <select
              value={orderType}
              onChange={(e) => onOrderTypeChange(e.target.value)}
              className="w-full text-xs border border-gray-300 rounded px-2 py-1.5"
            >
              <option value="all">All</option>
              <option value="veg">Veg</option>
              <option value="non_veg">Non-Veg</option>
              <option value="mixed">Mixed</option>
            </select>
          </div>
        </div>
        <div className="flex gap-2 mt-3">
          <button type="button" onClick={onClose} className="flex-1 text-xs py-1.5 border border-gray-300 rounded text-gray-700">
            Cancel
          </button>
          <button type="button" onClick={() => { onApply(); onClose(); }} className="flex-1 text-xs py-1.5 bg-orange-600 text-white rounded font-medium">
            Apply
          </button>
        </div>
      </div>
    </>
  );
}

function StatCard({
  title,
  value,
  icon,
  color,
}: {
  title: string;
  value: string | number;
  icon: React.ReactNode;
  color: "orange" | "blue" | "emerald" | "purple";
}) {
  const colorClasses = {
    orange: "bg-orange-500/10 border-orange-200",
    blue: "bg-blue-500/10 border-blue-200",
    emerald: "bg-emerald-500/10 border-emerald-200",
    purple: "bg-purple-500/10 border-purple-200",
  };
  const textColors = {
    orange: "text-orange-700",
    blue: "text-blue-700",
    emerald: "text-emerald-700",
    purple: "text-purple-700",
  };
  return (
    <div className={`bg-white rounded-xl border ${colorClasses[color]} p-3 shadow-sm hover:shadow-md transition-all hover:scale-[1.01]`}>
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[10px] sm:text-xs text-gray-600 font-medium truncate">{title}</p>
          <p className="text-lg sm:text-xl font-bold text-gray-900 truncate">{value}</p>
        </div>
        <div className={`p-1.5 rounded-lg flex-shrink-0 ${textColors[color]}`}>{icon}</div>
      </div>
    </div>
  );
}

const EMPTY_TREND = [
  { day: "Mon", orders: 0 },
  { day: "Tue", orders: 0 },
  { day: "Wed", orders: 0 },
  { day: "Thu", orders: 0 },
  { day: "Fri", orders: 0 },
  { day: "Sat", orders: 0 },
  { day: "Sun", orders: 0 },
];
const EMPTY_REVENUE = EMPTY_TREND.map(({ day }) => ({ d: day, rev: 0 }));
const EMPTY_STACKED = EMPTY_TREND.map((d) => ({ ...d, revenue: 0, cancellations: 0 }));
const EMPTY_FUNNEL = [
  { stage: "Placed", value: 0, fill: "#f97316" },
  { stage: "Accepted", value: 0, fill: "#3b82f6" },
  { stage: "Preparing", value: 0, fill: "#8b5cf6" },
  { stage: "Out for Delivery", value: 0, fill: "#06b6d4" },
  { stage: "Delivered", value: 0, fill: "#10b981" },
];

export function StoreFullDashboard({ storeId }: { storeId: string }) {
  const router = useRouter();
  const { toast } = useToast();
  const { store: storeFromHook, isLoading: storeLoading } = useStore(storeId);
  const [store, setStore] = useState<{ store_id: string; name: string; approval_status?: string; approval_reason?: string } | null>(null);
  const [storeIdStr, setStoreIdStr] = useState<string | null>(null);
  const [statsDate, setStatsDate] = useState("");
  const invalidateStoreQueries = useInvalidateMerchantStoreQueries();
  const operationsQuery = useStoreOperationsQuery(storeId);
  const walletQuery = useStoreWalletQuery(storeId);
  const statsQuery = useStoreStatsQuery(storeId, statsDate || undefined, { refetchInterval: 60000 });

  const [isStoreOpen, setIsStoreOpen] = useState(true);
  const [mxDeliveryEnabled, setMxDeliveryEnabled] = useState(false);
  const [openingTime, setOpeningTime] = useState("09:00");
  const [closingTime, setClosingTime] = useState("23:00");
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
  const [manualActivationLock, setManualActivationLock] = useState(false);
  const [isTodayScheduledClosed, setIsTodayScheduledClosed] = useState(false);

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

  const [pendingOrders, setPendingOrders] = useState(0);
  const [acceptedCount, setAcceptedCount] = useState(0);
  const [preparingOrders, setPreparingOrders] = useState(0);
  const [outForDelivery, setOutForDelivery] = useState(0);
  const [deliveredToday, setDeliveredToday] = useState(0);
  const [cancelledOrders, setCancelledOrders] = useState(0);
  const [revenueToday, setRevenueToday] = useState(0);
  const [avgPrepTime, setAvgPrepTime] = useState(0);
  const [acceptanceRate, setAcceptanceRate] = useState(0);

  const [ordersTrend, setOrdersTrend] = useState<{ day: string; orders: number }[]>(EMPTY_TREND);
  const [revenueByDay, setRevenueByDay] = useState<{ d: string; rev: number }[]>(EMPTY_REVENUE);
  const [categoryDistribution, setCategoryDistribution] = useState<{ name: string; value: number; color: string }[]>([]);
  const [hourlyHeatmap, setHourlyHeatmap] = useState<{ hour: number; count: number; pct: number }[]>([]);
  const [weeklyPerformance, setWeeklyPerformance] = useState<{ w: string; orders: number }[]>([]);
  const [deliverySuccessRate, setDeliverySuccessRate] = useState<{ d: string; rate: number }[]>([]);
  const [stackedTrend, setStackedTrend] = useState<{ day: string; orders: number; revenue: number; cancellations: number }[]>(EMPTY_STACKED);
  const [funnelData, setFunnelData] = useState<{ stage: string; value: number; fill: string }[]>(EMPTY_FUNNEL);
  const [donutVegNonVeg, setDonutVegNonVeg] = useState<{ name: string; value: number; color: string; pct?: number }[]>([]);
  const [dateRangeLabel, setDateRangeLabel] = useState("");
  const [salesTotal, setSalesTotal] = useState(0);
  const [salesGrowth, setSalesGrowth] = useState(0);
  const [viewsTotal, setViewsTotal] = useState(0);
  const [viewsGrowth, setViewsGrowth] = useState(0);
  const [chartFilterOpen, setChartFilterOpen] = useState<string | null>(null);
  const [chartDateFrom, setChartDateFrom] = useState("");
  const [chartDateTo, setChartDateTo] = useState("");
  const [chartOrderType, setChartOrderType] = useState("all");
  const [statusLog, setStatusLog] = useState<{ id: string | number; action: string; restriction_type?: string | null; close_reason?: string | null; performed_by_name: string | null; performed_by_id: string | number | null; performed_by_email: string | null; created_at: string }[]>([]);

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

  useEffect(() => {
    if (typeof window !== "undefined" && chartDateFrom === "" && chartDateTo === "") {
      const end = new Date();
      const start = new Date();
      start.setDate(start.getDate() - 29);
      setChartDateFrom(start.toISOString().slice(0, 10));
      setChartDateTo(end.toISOString().slice(0, 10));
    }
  }, [chartDateFrom, chartDateTo]);

  // Sync store from React Query (primed by layout or fetched by hook) for modal and display
  useEffect(() => {
    if (!storeFromHook) return;
    setStore(storeFromHook);
    setStoreIdStr(storeFromHook.store_id ?? null);
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
    setRestrictionType(d.restriction_type ?? null);
    setWithinHoursButRestricted(d.within_hours_but_restricted === true);
    setLastToggledAt(d.last_toggled_at ?? null);
    setManualActivationLock(d.block_auto_open === true);
    setIsTodayScheduledClosed(d.is_today_scheduled_closed === true);
    const todaySlots = d.today_slots ?? [];
    if (todaySlots.length > 0) {
      const first = todaySlots[0];
      setOpeningTime(first.start || "09:00");
      setClosingTime(first.end || "23:00");    }
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

  // Sync stats from shared React Query cache
  useEffect(() => {
    const data = statsQuery.data;
    if (!data) return;
    const d = data as {
      pendingCount?: number;
      acceptedTodayCount?: number;
      preparingCount?: number;
      outForDeliveryCount?: number;
      deliveredTodayCount?: number;
      cancelledTodayCount?: number;
      totalRevenueToday?: number;
      avgPreparationTimeMinutes?: number;
      acceptanceRatePercent?: number;
    };
    setPendingOrders(d.pendingCount ?? 0);
    setAcceptedCount(d.acceptedTodayCount ?? 0);
    setPreparingOrders(d.preparingCount ?? 0);
    setOutForDelivery(d.outForDeliveryCount ?? 0);
    setDeliveredToday(d.deliveredTodayCount ?? 0);
    setCancelledOrders(d.cancelledTodayCount ?? 0);
    setRevenueToday(d.totalRevenueToday ?? 0);
    setAvgPrepTime(d.avgPreparationTimeMinutes ?? 0);
    setAcceptanceRate(d.acceptanceRatePercent ?? 0);
  }, [statsQuery.data]);

  const fetchCharts = useCallback(async () => {
    try {
      const params = new URLSearchParams({ store_id: storeId });
      if (chartDateFrom) params.set("date_from", chartDateFrom);
      if (chartDateTo) params.set("date_to", chartDateTo);
      const res = await fetch(`/api/merchant/stores/${storeId}/stats?${params.toString()}`);
      const data = await res.json().catch(() => null);
      if (res.ok && data) {
        setDateRangeLabel(data.dateRangeLabel || "");
        setSalesTotal(data.salesTotal ?? 0);
        setSalesGrowth(data.salesGrowth ?? 0);
        setViewsTotal(data.viewsTotal ?? 0);
        setViewsGrowth(data.viewsGrowth ?? 0);
      }
    } catch (_e) {
      // Network error – avoid unhandled rejection
    }
  }, [storeId, chartDateFrom, chartDateTo]);

  const fetchAuditLogs = useCallback(async () => {
    // TODO: when /api/merchant/stores/[id]/audit-logs exists, fetch and setStatusLog(data.logs)
    setStatusLog([]);
  }, [storeId]);

  // Audit logs (TODO: when API exists)
  useEffect(() => {
    if (!storeId) return;
    fetchAuditLogs();
  }, [storeId, fetchAuditLogs]);

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
    if (!toggleClosureType || !closeReason?.trim()) {
      toast("Please select closure type and reason");
      return;
    }
    if (toggleClosureType === "temporary" && (!closureDate || !closureTime)) {
      toast("Please select date and time for reopening");
      return;
    }
    void handleFinalCloseConfirm();
  };

  const handleFinalCloseConfirm = async () => {
    if (!toggleClosureType) return;
    setCloseConfirmLoading(true);
    const reasonText = closeReason === "Other" ? (closeReasonOther?.trim() || "Other") : closeReason;
    try {
      const res = await fetch(`/api/merchant/stores/${storeId}/store-operations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "manual_close",
          closure_type: toggleClosureType,
          close_reason: reasonText,
          ...(toggleClosureType === "temporary" && closureDate && closureTime && { closure_date: closureDate, closure_time: closureTime }),
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

  const categoryDist = useMemo(
    () => (categoryDistribution.length ? categoryDistribution : [{ name: "No data", value: 1, color: "#e2e8f0" }]),
    [categoryDistribution]
  );
  const donutData = useMemo(
    () => (donutVegNonVeg.length ? donutVegNonVeg : [{ name: "No data", value: 1, color: "#e2e8f0" }]),
    [donutVegNonVeg]
  );

  const isLoading = storeLoading;

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
                <div><p className="text-sm font-semibold">Close for Today</p><p className="text-xs text-gray-600">Reopen tomorrow at {formatTimeHMS(openingTime)}</p></div>
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
                <option value="Staff shortage">Staff shortage</option>
                <option value="Holiday / Off">Holiday / Off</option>
                <option value="Other">Other</option>
              </select>
              {closeReason === "Other" && <input type="text" value={closeReasonOther} onChange={(e) => setCloseReasonOther(e.target.value)} placeholder="Enter reason" className="w-full mt-2 px-3 py-2 border rounded-lg text-sm" />}
            </div>
            <div className="flex gap-3 mt-5">
              <button type="button" onClick={handleCancelClosePopup} disabled={closeConfirmLoading} className="flex-1 px-4 py-2.5 border rounded-xl text-gray-700 font-medium">Cancel</button>
              <button type="button" onClick={handleClosePopupConfirm} disabled={!toggleClosureType || !closeReason?.trim() || closeConfirmLoading} className="flex-1 px-4 py-2.5 bg-red-600 text-white rounded-xl font-medium disabled:opacity-50">
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
            {/* Wallet | Store Status | Delivery */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-gradient-to-br from-emerald-50/90 to-green-50/70 rounded-xl border border-emerald-200/80 shadow-sm p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Wallet size={16} className="text-emerald-700" />
                  <p className="text-[10px] font-semibold text-gray-600 uppercase">Wallet &amp; Earnings</p>
                </div>
                {walletLoading ? (
                  <div className="grid grid-cols-2 gap-2"><div className="h-10 bg-gray-100 rounded animate-pulse" /><div className="h-10 bg-gray-100 rounded animate-pulse" /></div>
                ) : (
                  <div className="grid grid-cols-2 gap-x-3 gap-y-2">
                    <div><p className="text-[9px] font-medium text-gray-500 uppercase">Available</p><p className="text-sm font-bold text-emerald-800">₹{walletAvailableBalance != null ? Number(walletAvailableBalance).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "0.00"}</p></div>
                    <div><p className="text-[9px] font-medium text-gray-500 uppercase">Today</p><p className="text-sm font-bold text-orange-700">₹{Number(walletTodayEarning).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p></div>
                    <div><p className="text-[9px] font-medium text-gray-500 uppercase">Yesterday</p><p className="text-sm font-bold text-slate-700">₹{Number(walletYesterdayEarning).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p></div>
                    <div><p className="text-[9px] font-medium text-gray-500 uppercase">Pending</p><p className="text-sm font-bold text-violet-700">₹{Number(walletPendingBalance).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p></div>
                  </div>
                )}
              </div>

              <div className={`rounded-xl border-2 shadow-sm p-4 ${isStoreOpen ? "bg-gradient-to-br from-emerald-50/90 to-green-50/70 border-emerald-200" : restrictionType === "MANUAL_HOLD" ? "bg-amber-50/90 border-amber-300" : "bg-red-50/90 border-red-200"}`}>
                <div className="flex items-center justify-between gap-2">
                  <div><p className="text-[10px] font-semibold text-gray-500 uppercase">Store Status</p><p className="text-xs font-bold text-gray-900">{formatTimeHMS(openingTime)} – {formatTimeHMS(closingTime)}</p></div>
                  <button onClick={handleStoreToggle} className={`p-2 rounded-xl shadow-md ${isStoreOpen ? "bg-emerald-500 text-white" : restrictionType === "MANUAL_HOLD" ? "bg-amber-500 text-white" : "bg-red-500 text-white"}`}><Power size={18} /></button>
                </div>
                <div className={`flex items-center gap-1.5 mt-2 p-2 rounded-lg border ${isStoreOpen ? "bg-emerald-100/40 border-emerald-300" : "bg-red-100/40 border-red-300"}`}>
                  <div className={`w-2 h-2 rounded-full ${isStoreOpen ? "bg-emerald-500 animate-pulse" : "bg-red-500"}`} />
                  <span className={`text-xs font-bold ${isStoreOpen ? "text-emerald-700" : "text-red-700"}`}>{isStoreOpen ? "Open" : "Closed"}</span>
                </div>
                <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-200/60">
                  <div><p className="text-[10px] font-semibold text-gray-700">Manual Activation Lock</p><p className="text-[9px] text-gray-500">Prevent automatic store opening</p></div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input type="checkbox" checked={manualActivationLock} onChange={(e) => { setManualActivationLock(e.target.checked); saveManualActivationLock(e.target.checked); }} className="sr-only peer" />
                    <div className="w-9 h-5 bg-gray-200 rounded-full peer peer-checked:bg-red-600 peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all" />
                  </label>
                </div>
              </div>

              <div className="bg-white rounded-xl border border-gray-200/80 shadow-sm p-4">
                <p className="text-[10px] font-semibold text-gray-500 uppercase mb-2">Delivery mode</p>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-violet-700">GatiMitra</span>
                  <span className="text-[10px] text-gray-500">Platform riders</span>
                </div>
              </div>
            </div>

            {/* Date + Order flow */}
            <div className="flex flex-wrap items-stretch gap-4 mb-2">
              <div className="flex items-center gap-2 shrink-0">
                <Calendar size={16} className="text-gray-500" />
                <span className="text-xs font-medium text-gray-700">Date:</span>
                <input type="date" value={statsDate} onChange={(e) => setStatsDate(e.target.value)} className="text-xs border border-gray-300 rounded-lg px-2 py-1.5 text-gray-900" />
                <button type="button" onClick={() => setStatsDate(new Date().toISOString().slice(0, 10))} className="text-xs font-medium text-orange-600 hover:text-orange-700">Today</button>
              </div>
              <div className="flex-1 min-w-[280px] bg-gradient-to-r from-white to-slate-50/80 rounded-xl border border-orange-200/60 shadow-md px-4 py-3">
                <h3 className="text-sm font-bold text-gray-900 mb-2 flex items-center gap-1.5"><span className="w-1.5 h-4 rounded-full bg-orange-500" />Order flow {statsDate ? `(${statsDate})` : ""}</h3>
                <div className="flex flex-wrap items-center gap-3 py-1">
                  {["Placed", "Accepted", "Preparing", "Delivered"].map((step, i) => (
                    <React.Fragment key={step}>
                      <div className="flex items-center gap-2">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shadow-sm ${i === 0 ? "bg-orange-500 text-white ring-2 ring-orange-200" : i === 3 ? "bg-emerald-500 text-white ring-2 ring-emerald-200" : "bg-slate-100 text-slate-700 border border-slate-200"}`}>
                          {[pendingOrders, acceptedCount, preparingOrders, deliveredToday][i]}
                        </div>
                        <span className="text-xs font-semibold text-gray-800">{step}</span>
                      </div>
                      {i < 3 && <ArrowRight size={14} className="text-orange-300 flex-shrink-0" />}
                    </React.Fragment>
                  ))}
                </div>
              </div>
            </div>

            {/* 8 KPI cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
              <StatCard title="Pending" value={pendingOrders} icon={<Package size={18} />} color="orange" />
              <StatCard title="Preparing" value={preparingOrders} icon={<Users size={18} />} color="blue" />
              <StatCard title="Out for Delivery" value={outForDelivery} icon={<Truck size={18} />} color="purple" />
              <StatCard title="Delivered Today" value={deliveredToday} icon={<TrendingUp size={18} />} color="emerald" />
              <StatCard title="Cancelled" value={cancelledOrders} icon={<XCircle size={18} />} color="orange" />
              <StatCard title="Today's Revenue" value={`₹${(revenueToday / 1000).toFixed(0)}k`} icon={<BarChart3 size={18} />} color="purple" />
              <StatCard title="Avg Prep (min)" value={avgPrepTime} icon={<Clock size={18} />} color="blue" />
              <StatCard title="Acceptance %" value={`${acceptanceRate}%`} icon={<CheckCircle2 size={18} />} color="emerald" />
            </div>

            {/* Sales & Views */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-white rounded-xl border border-gray-200/80 shadow-sm p-4">
                <ChartCardHeader title="Sales" dateRange={dateRangeLabel || "—"} onFilterClick={() => setChartFilterOpen((p) => (p === "sales" ? null : "sales"))} filterOpen={chartFilterOpen === "sales"} />
                <p className="text-2xl font-bold text-gray-900">₹{salesTotal.toLocaleString("en-IN")}</p>
                <p className={`text-xs font-medium mt-0.5 ${salesGrowth >= 0 ? "text-emerald-600" : "text-red-600"}`}><ChevronUp size={12} className={salesGrowth < 0 ? "rotate-180" : ""} /> {salesGrowth >= 0 ? "+" : ""}{salesGrowth}% Growth</p>
                <div className="h-[140px] mt-3">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={revenueByDay.length ? revenueByDay : [{ d: "—", rev: 0 }]} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
                      <XAxis dataKey="d" tick={{ fontSize: 10 }} />
                      <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `${v}k`} />
                      <Tooltip contentStyle={{ fontSize: 11 }} formatter={(v: unknown) => [`₹${Number(v) * 1000}`, "Revenue"]} />
                      <Bar dataKey="rev" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
              <div className="bg-white rounded-xl border border-gray-200/80 shadow-sm p-4">
                <ChartCardHeader title="Views" dateRange={dateRangeLabel || "—"} onFilterClick={() => setChartFilterOpen((p) => (p === "views" ? null : "views"))} filterOpen={chartFilterOpen === "views"} />
                <p className="text-2xl font-bold text-gray-900">{viewsTotal.toLocaleString("en-IN")}</p>
                <p className={`text-xs font-medium mt-0.5 ${viewsGrowth >= 0 ? "text-emerald-600" : "text-red-600"}`}><ChevronUp size={12} className={viewsGrowth < 0 ? "rotate-180" : ""} /> {viewsGrowth >= 0 ? "+" : ""}{viewsGrowth}% Growth</p>
                <div className="h-[140px] mt-3">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={ordersTrend.length ? ordersTrend : [{ day: "—", orders: 0 }]} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
                      <XAxis dataKey="day" tick={{ fontSize: 10 }} />
                      <YAxis tick={{ fontSize: 10 }} />
                      <Tooltip contentStyle={{ fontSize: 11 }} />
                      <Area type="monotone" dataKey="orders" stroke="#8b5cf6" fill="rgba(139,92,246,0.4)" strokeWidth={2} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            {/* Orders trend + Revenue */}
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              <div className="bg-white rounded-xl border border-gray-200/80 shadow-sm p-4">
                <ChartCardHeader title="Orders trend" dateRange={dateRangeLabel || "—"} onFilterClick={() => setChartFilterOpen((p) => (p === "orders" ? null : "orders"))} filterOpen={chartFilterOpen === "orders"} />
                <div className="h-[180px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={ordersTrend.length ? ordersTrend : EMPTY_TREND} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis dataKey="day" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                      <Line type="monotone" dataKey="orders" stroke="#f97316" strokeWidth={2} dot={{ fill: "#f97316", r: 3 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
              <div className="bg-white rounded-xl border border-gray-200/80 shadow-sm p-4">
                <ChartCardHeader title="Revenue analytics" dateRange={dateRangeLabel || "—"} onFilterClick={() => setChartFilterOpen((p) => (p === "revenue" ? null : "revenue"))} filterOpen={chartFilterOpen === "revenue"} />
                <div className="h-[180px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={revenueByDay.length ? revenueByDay : EMPTY_REVENUE} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
                      <defs><linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#8b5cf6" stopOpacity={0.4} /><stop offset="100%" stopColor="#8b5cf6" stopOpacity={0} /></linearGradient></defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis dataKey="d" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                      <Area type="monotone" dataKey="rev" stroke="#8b5cf6" fill="url(#revGrad)" strokeWidth={2} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            {/* Category + Heatmap + Weekly */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-white rounded-xl border border-gray-200/80 shadow-sm p-4">
                <ChartCardHeader title="Order category (Veg/Non-Veg)" dateRange={dateRangeLabel || "—"} onFilterClick={() => setChartFilterOpen((p) => (p === "category" ? null : "category"))} filterOpen={chartFilterOpen === "category"} />
                <div className="h-[160px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={categoryDist} cx="50%" cy="50%" innerRadius={40} outerRadius={60} paddingAngle={2} dataKey="value">{(categoryDist).map((entry, i) => <Cell key={i} fill={entry.color} />)}</Pie>
                      <Tooltip contentStyle={{ fontSize: 11, borderRadius: 6 }} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>
              <div className="bg-white rounded-xl border border-gray-200/80 shadow-sm p-4">
                <ChartCardHeader title="Hourly order heatmap" dateRange={dateRangeLabel || "—"} onFilterClick={() => setChartFilterOpen((p) => (p === "heatmap" ? null : "heatmap"))} filterOpen={chartFilterOpen === "heatmap"} />
                <div className="flex items-end gap-1 h-[100px]">
                  {(hourlyHeatmap.length ? hourlyHeatmap : [10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21].map((hour) => ({ hour, count: 0, pct: 0 }))).map((item, i) => (
                    <div key={i} className="flex-1 flex flex-col items-center justify-end gap-1 h-full">
                      <div className="w-full rounded-t bg-orange-400 min-h-[6px]" style={{ height: `${item.pct || 0}%` }} />
                      <span className="text-[9px] text-gray-500">{item.hour}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="bg-white rounded-xl border border-gray-200/80 shadow-sm p-4">
                <ChartCardHeader title="Weekly performance" dateRange={dateRangeLabel || "—"} onFilterClick={() => setChartFilterOpen((p) => (p === "weekly" ? null : "weekly"))} filterOpen={chartFilterOpen === "weekly"} />
                <div className="h-[120px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={weeklyPerformance.length ? weeklyPerformance : [{ w: "W1", orders: 0 }, { w: "W2", orders: 0 }, { w: "W3", orders: 0 }, { w: "W4", orders: 0 }]} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
                      <XAxis dataKey="w" tick={{ fontSize: 10 }} />
                      <YAxis tick={{ fontSize: 10 }} />
                      <Tooltip contentStyle={{ fontSize: 11 }} />
                      <Bar dataKey="orders" fill="#f97316" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            {/* Delivery success + Multi-metric + Order type */}
            <div className="bg-white rounded-xl border border-gray-200/80 shadow-sm p-4">
              <ChartCardHeader title="Delivery success rate" dateRange={dateRangeLabel || "—"} onFilterClick={() => setChartFilterOpen((p) => (p === "delivery" ? null : "delivery"))} filterOpen={chartFilterOpen === "delivery"} />
              <div className="h-[140px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={deliverySuccessRate.length ? deliverySuccessRate : [{ d: "Mon", rate: 100 }, { d: "Tue", rate: 100 }, { d: "Wed", rate: 100 }, { d: "Thu", rate: 100 }, { d: "Fri", rate: 100 }, { d: "Sat", rate: 100 }, { d: "Sun", rate: 100 }]} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="d" tick={{ fontSize: 11 }} />
                    <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
                    <Tooltip contentStyle={{ fontSize: 12 }} formatter={(v: unknown) => [String(v) + "%", "Success rate"]} />
                    <Line type="monotone" dataKey="rate" stroke="#10b981" strokeWidth={2} dot={{ fill: "#10b981", r: 3 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Multi-metric + Order type distribution */}
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              <div className="bg-white rounded-xl border border-gray-200/80 shadow-sm p-4">
                <ChartCardHeader title="Multi-metric trends" dateRange={dateRangeLabel || "—"} onFilterClick={() => setChartFilterOpen((p) => (p === "multi" ? null : "multi"))} filterOpen={chartFilterOpen === "multi"} />
                <div className="h-[200px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={stackedTrend.length ? stackedTrend : EMPTY_STACKED} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis dataKey="day" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Area type="monotone" dataKey="orders" stroke="#f97316" fill="rgba(249,115,22,0.3)" strokeWidth={2} name="Orders" />
                      <Area type="monotone" dataKey="revenue" stroke="#8b5cf6" fill="rgba(139,92,246,0.3)" strokeWidth={2} name="Revenue (₹k)" />
                      <Area type="monotone" dataKey="cancellations" stroke="#ef4444" fill="rgba(239,68,68,0.3)" strokeWidth={2} name="Cancellations" />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              </div>
              <div className="bg-white rounded-xl border border-gray-200/80 shadow-sm p-4">
                <ChartCardHeader title="Order type distribution" dateRange={dateRangeLabel || "—"} onFilterClick={() => setChartFilterOpen((p) => (p === "orderType" ? null : "orderType"))} filterOpen={chartFilterOpen === "orderType"} hideFilterButton />
                <div className="h-[200px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={categoryDist} cx="50%" cy="50%" outerRadius={70} paddingAngle={4} dataKey="value">{(categoryDist).map((entry, i) => <Cell key={i} fill={entry.color} stroke="#fff" strokeWidth={2} />)}</Pie>
                      <Tooltip contentStyle={{ fontSize: 11, borderRadius: 6 }} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            {/* Veg/Non-Veg donut + Funnel */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-white rounded-xl border border-gray-200/80 shadow-sm p-4">
                <ChartCardHeader title="Veg / Non-Veg breakdown" dateRange={dateRangeLabel || "—"} onFilterClick={() => setChartFilterOpen((p) => (p === "donut" ? null : "donut"))} filterOpen={chartFilterOpen === "donut"} hideFilterButton />
                <div className="h-[180px] flex items-center">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={donutData} cx="50%" cy="50%" innerRadius={45} outerRadius={65} paddingAngle={2} dataKey="value">{(donutData).map((entry, i) => <Cell key={i} fill={entry.color} />)}</Pie>
                      <Tooltip contentStyle={{ fontSize: 11, borderRadius: 6 }} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>
              <div className="bg-white rounded-xl border border-gray-200/80 shadow-sm p-4">
                <ChartCardHeader title="Order lifecycle funnel" dateRange={dateRangeLabel || "—"} onFilterClick={() => setChartFilterOpen((p) => (p === "funnel" ? null : "funnel"))} filterOpen={chartFilterOpen === "funnel"} />
                <div className="h-[180px] flex flex-col justify-center gap-1">
                  {(funnelData.length ? funnelData : EMPTY_FUNNEL).map((item) => {
                    const topVal = (funnelData.length ? funnelData : EMPTY_FUNNEL)[0]?.value ?? 1;
                    const pct = topVal > 0 ? (item.value / topVal) * 100 : 0;
                    return (
                      <div key={item.stage} className="flex items-center gap-2">
                        <span className="text-xs font-medium text-gray-700 w-24 shrink-0">{item.stage}</span>
                        <div className="flex-1 h-6 rounded bg-gray-100 overflow-hidden">
                          <div className="h-full rounded flex items-center justify-end pr-1" style={{ width: `${Math.max(pct, 4)}%`, backgroundColor: item.fill }}>
                            <span className="text-[10px] font-bold text-white">{item.value}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Recent activities + Audit log */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="bg-white rounded-xl border border-gray-200/80 shadow-sm p-4">
                <h3 className="text-sm font-bold text-gray-900 mb-3">Recent activities</h3>
                <div className="overflow-x-auto max-h-[260px] overflow-y-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="sticky top-0 bg-gray-50 border-b border-gray-200">
                      <tr><th className="py-2 px-2 font-semibold text-gray-600 w-16">Time</th><th className="py-2 px-2 font-semibold text-gray-600">Action</th><th className="py-2 px-2 font-semibold text-gray-600">By</th></tr>
                    </thead>
                    <tbody>
                      {statusLog.length === 0 ? (
                        <tr><td colSpan={3} className="py-4 px-2 text-gray-500 text-center">No activity yet.</td></tr>
                      ) : (
                        [...statusLog].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).map((log, index) => (
                          <tr key={`${log.id}-${index}`} className="border-b border-gray-100">
                            <td className="py-2 px-2 text-gray-500 whitespace-nowrap">{new Date(log.created_at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true })}</td>
                            <td className="py-2 px-2 font-medium">{log.action}{log.restriction_type ? ` (${log.restriction_type})` : ""}{log.close_reason ? ` · ${log.close_reason}` : ""}</td>
                            <td className="py-2 px-2 text-gray-700">{log.performed_by_name || log.performed_by_email || "—"}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
              <div className="bg-white rounded-xl border border-gray-200/80 shadow-sm p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-bold text-gray-900">Audit log snapshot</h3>
                  <Link href={`/dashboard/merchants/stores/${storeId}/store-settings`} className="text-xs font-semibold text-orange-600 hover:text-orange-700">View full audit logs</Link>
                </div>
                <div className="overflow-x-auto max-h-[260px] overflow-y-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="sticky top-0 bg-gray-50 border-b border-gray-200">
                      <tr><th className="py-2 px-2 font-semibold text-gray-600">Who</th><th className="py-2 px-2 font-semibold text-gray-600">Action</th><th className="py-2 px-2 font-semibold text-gray-600">When</th></tr>
                    </thead>
                    <tbody>
                      {statusLog.length === 0 ? (
                        <tr><td colSpan={3} className="py-4 px-2 text-gray-500 text-center">No audit entries yet.</td></tr>
                      ) : (
                        [...statusLog].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).slice(0, 15).map((log, index) => (
                          <tr key={`${log.id}-${index}`} className="border-b border-gray-100">
                            <td className="py-2 px-2 font-medium text-gray-900">{log.performed_by_name || log.performed_by_email || "System"}</td>
                            <td className="py-2 px-2 text-gray-700">{log.action}</td>
                            <td className="py-2 px-2 text-gray-500">{new Date(log.created_at).toLocaleString("en-IN", { dateStyle: "short", timeStyle: "short" })}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* Performance insights */}
            <div className="bg-white rounded-xl border border-gray-200/80 shadow-sm p-4">
              <h3 className="text-sm font-bold text-gray-900 mb-3">Performance insights</h3>
              <table className="w-full text-xs">
                <thead><tr className="border-b border-gray-200"><th className="py-2 px-2 text-left font-semibold text-gray-600">Metric</th><th className="py-2 px-2 text-right font-semibold text-gray-600">Today</th></tr></thead>
                <tbody>
                  <tr className="border-b border-gray-100"><td className="py-2 px-2 text-gray-700">Pending orders</td><td className="py-2 px-2 text-right font-medium">{pendingOrders}</td></tr>
                  <tr className="border-b border-gray-100"><td className="py-2 px-2 text-gray-700">Preparing</td><td className="py-2 px-2 text-right font-medium">{preparingOrders}</td></tr>
                  <tr className="border-b border-gray-100"><td className="py-2 px-2 text-gray-700">Delivered today</td><td className="py-2 px-2 text-right font-medium text-emerald-600">{deliveredToday}</td></tr>
                  <tr className="border-b border-gray-100"><td className="py-2 px-2 text-gray-700">Cancelled today</td><td className="py-2 px-2 text-right font-medium text-red-600">{cancelledOrders}</td></tr>
                  <tr className="border-b border-gray-100"><td className="py-2 px-2 text-gray-700">Revenue today</td><td className="py-2 px-2 text-right font-medium">₹{revenueToday.toLocaleString()}</td></tr>
                  <tr><td className="py-2 px-2 text-gray-700">Acceptance rate</td><td className="py-2 px-2 text-right font-medium text-emerald-600">{acceptanceRate}%</td></tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
