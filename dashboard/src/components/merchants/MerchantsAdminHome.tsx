"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Ban,
  CheckCircle,
  ChevronDown,
  Clock,
  Download,
  Filter,
  Info,
  Pencil,
  Plus,
  Search,
  Store,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";

export type AdminStoreRow = {
  id: number;
  store_id: string;
  name: string;
  city: string | null;
  store_type?: string | null;
  approval_status: string;
  created_at?: string | null;
};

export type AdminStats = {
  total: number;
  verified: number;
  pending: number;
  rejected: number;
  drafted: number;
  new: number;
  resubmitted: number;
};

type CategoryKey = "total" | "verified" | "pending" | "rejected" | "drafted" | "new" | "resubmitted";

const TREND_PRESETS = [
  { value: "7", label: "Last 7 days" },
  { value: "14", label: "Last 14 days" },
  { value: "30", label: "Last 30 days" },
  { value: "90", label: "Last 90 days" },
  { value: "custom", label: "Custom range" },
] as const;

type TrendPresetValue = (typeof TREND_PRESETS)[number]["value"];

function storeTypeLabel(storeType: string | null | undefined): string {
  const t = (storeType ?? "").trim().toUpperCase();
  const map: Record<string, string> = {
    RESTAURANT: "Restaurant",
    CAFE: "Cafe",
    BAKERY: "Bakery",
    CLOUD_KITCHEN: "Cloud Kitchen",
    GROCERY: "Grocery",
    PHARMA: "Pharma",
  };
  return map[t] ?? (t ? t.replace(/_/g, " ") : "Restaurant");
}

function storeTypeBadgeClass(storeType: string | null | undefined): string {
  const t = (storeType ?? "").toUpperCase();
  if (t === "CLOUD_KITCHEN") return "bg-orange-50 text-orange-700 ring-1 ring-orange-200/60";
  if (t === "PHARMA") return "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200/60";
  return "bg-[#121212]/08 text-[#121212] ring-1 ring-[#121212]/10";
}

function StatusPill({ status }: { status: string }) {
  const s = (status || "").toUpperCase();
  if (s === "APPROVED") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-700 ring-1 ring-emerald-200/60">
        <CheckCircle className="h-3 w-3" /> Verified
      </span>
    );
  }
  if (s === "DRAFT") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-sky-50 px-2.5 py-0.5 text-[11px] font-semibold text-sky-700 ring-1 ring-sky-200/60">
        <Pencil className="h-3 w-3" /> Drafted
      </span>
    );
  }
  if (s === "REJECTED" || s === "BLOCKED" || s === "SUSPENDED") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2.5 py-0.5 text-[11px] font-semibold text-red-700 ring-1 ring-red-200/60">
        <Ban className="h-3 w-3" /> Rejected
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-0.5 text-[11px] font-semibold text-amber-700 ring-1 ring-amber-200/60">
      <Clock className="h-3 w-3" /> Pending
    </span>
  );
}

function formatChartDay(date: string): string {
  try {
    const d = new Date(date + "T12:00:00");
    return d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
  } catch {
    return date;
  }
}

function formatDisplayDate(iso: string): string {
  try {
    const d = new Date(iso + "T12:00:00");
    return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  } catch {
    return iso;
  }
}

function TrendPeriodSelect({
  value,
  onChange,
  className = "",
}: {
  value: TrendPresetValue;
  onChange: (v: TrendPresetValue) => void;
  className?: string;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as TrendPresetValue)}
      className={`h-8 rounded-[10px] border border-[#121212]/10 bg-white pl-2.5 pr-7 text-xs font-medium text-[#121212] shadow-sm focus:border-[#121212]/25 focus:outline-none focus:ring-1 focus:ring-[#121212]/15 ${className}`}
      aria-label="Trend period"
    >
      {TREND_PRESETS.map((p) => (
        <option key={p.value} value={p.value}>
          {p.label}
        </option>
      ))}
    </select>
  );
}

function TrendChartControls({
  trendPreset,
  onTrendPresetChange,
  trendFromInput,
  trendToInput,
  onTrendFromChange,
  onTrendToChange,
}: {
  trendPreset: TrendPresetValue;
  onTrendPresetChange: (v: TrendPresetValue) => void;
  trendFromInput: string;
  trendToInput: string;
  onTrendFromChange: (v: string) => void;
  onTrendToChange: (v: string) => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      <TrendPeriodSelect value={trendPreset} onChange={onTrendPresetChange} />
      {trendPreset === "custom" ? (
        <>
          <input
            type="date"
            value={trendFromInput}
            onChange={(e) => onTrendFromChange(e.target.value)}
            className="h-8 rounded-[10px] border border-[#121212]/10 bg-white px-2 text-xs text-[#121212] shadow-sm focus:border-[#121212]/25 focus:outline-none"
            aria-label="Trend from date"
          />
          <span className="text-xs text-[#121212]/30">–</span>
          <input
            type="date"
            value={trendToInput}
            onChange={(e) => onTrendToChange(e.target.value)}
            className="h-8 rounded-[10px] border border-[#121212]/10 bg-white px-2 text-xs text-[#121212] shadow-sm focus:border-[#121212]/25 focus:outline-none"
            aria-label="Trend to date"
          />
        </>
      ) : null}
    </div>
  );
}

const CHART_HEIGHT = 240;

interface MerchantsAdminHomeProps {
  stats: AdminStats | null;
  statsLoading: boolean;
  category: CategoryKey | null;
  onCategoryClick: (key: CategoryKey) => void;
  fromDate?: string;
  toDate?: string;
  storeType?: string;
  dateFromInput: string;
  dateToInput: string;
  storeTypeFilter: string;
  onDateFromChange: (v: string) => void;
  onDateToChange: (v: string) => void;
  onStoreTypeChange: (v: string) => void;
  onApplyFilters: () => void;
  onClearFilters: () => void;
  portalQuery: string;
  buildStoreUrl: (store: AdminStoreRow) => string;
}

export function MerchantsAdminHome({
  stats,
  statsLoading,
  category,
  onCategoryClick,
  fromDate,
  toDate,
  storeType,
  dateFromInput,
  dateToInput,
  storeTypeFilter,
  onDateFromChange,
  onDateToChange,
  onStoreTypeChange,
  onApplyFilters,
  onClearFilters,
  portalQuery,
  buildStoreUrl,
}: MerchantsAdminHomeProps) {
  const router = useRouter();
  const [searchInput, setSearchInput] = useState("");
  const [trendPreset, setTrendPreset] = useState<TrendPresetValue>("7");
  const [trendFromInput, setTrendFromInput] = useState("");
  const [trendToInput, setTrendToInput] = useState("");

  const trendParams = useMemo(() => {
    if (trendPreset === "custom") {
      if (trendFromInput && trendToInput) {
        return { trendFrom: trendFromInput, trendTo: trendToInput };
      }
      return { trendDays: 7 };
    }
    return { trendDays: parseInt(trendPreset, 10) || 7 };
  }, [trendPreset, trendFromInput, trendToInput]);

  const trendLabel = useMemo(() => {
    if (trendPreset === "custom" && trendFromInput && trendToInput) {
      return `${formatDisplayDate(trendFromInput)} – ${formatDisplayDate(trendToInput)}`;
    }
    const preset = TREND_PRESETS.find((p) => p.value === trendPreset);
    return preset?.label ?? "Last 7 days";
  }, [trendPreset, trendFromInput, trendToInput]);

  const overviewQuery = useQuery({
    queryKey: ["merchant-admin-overview", fromDate, toDate, storeType, trendParams],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (fromDate) params.set("fromDate", fromDate);
      if (toDate) params.set("toDate", toDate);
      if (storeType) params.set("storeType", storeType);
      if ("trendFrom" in trendParams && trendParams.trendFrom) {
        params.set("trendFrom", trendParams.trendFrom);
        params.set("trendTo", trendParams.trendTo ?? "");
      } else {
        params.set("trendDays", String(trendParams.trendDays ?? 7));
      }
      const res = await fetch(`/api/merchant/stores/admin-overview?${params.toString()}`);
      const data = await res.json();
      if (!data?.success) throw new Error(data?.error ?? "Failed to load overview");
      return data as {
        growth: { date: string; count: number }[];
        verificationTrend: { date: string; verified: number; rejected: number }[];
        stores: AdminStoreRow[];
        totalListed: number;
      };
    },
    staleTime: 30_000,
  });

  const growthData = useMemo(
    () =>
      (overviewQuery.data?.growth ?? []).map((p) => ({
        ...p,
        label: formatChartDay(p.date),
      })),
    [overviewQuery.data?.growth]
  );

  const verificationData = useMemo(
    () =>
      (overviewQuery.data?.verificationTrend ?? []).map((p) => ({
        ...p,
        label: formatChartDay(p.date),
      })),
    [overviewQuery.data?.verificationTrend]
  );

  const growthTotal = useMemo(
    () => growthData.reduce((sum, p) => sum + p.count, 0),
    [growthData]
  );

  const stores = overviewQuery.data?.stores ?? [];
  const total = stats?.total ?? stores.length;
  const verifiedPct =
    stats && stats.total > 0 ? Math.round((stats.verified / stats.total) * 100) : 0;

  const statCards = [
    {
      key: "total" as const,
      label: "Total Stores",
      count: stats?.total ?? 0,
      hint: growthTotal > 0 ? `+ ${growthTotal} in ${trendLabel.toLowerCase()}` : null,
      icon: Store,
      iconBg: "bg-[#121212] text-white",
      accent: "border-[#121212]/08",
    },
    {
      key: "verified" as const,
      label: "Verified",
      count: stats?.verified ?? 0,
      hint: stats?.total ? `${verifiedPct}% of total stores` : null,
      icon: CheckCircle,
      iconBg: "bg-emerald-100 text-emerald-700",
      accent: "border-[#121212]/08",
    },
    {
      key: "pending" as const,
      label: "Pending Verification",
      count: stats?.pending ?? 0,
      hint: stats?.pending ? "Requires attention" : null,
      icon: Clock,
      iconBg: "bg-amber-100 text-amber-700",
      accent: "border-[#121212]/08",
    },
    {
      key: "drafted" as const,
      label: "Drafted Store",
      count: stats?.drafted ?? 0,
      hint: stats?.drafted ? "Action needed" : null,
      icon: Pencil,
      iconBg: "bg-[#121212]/08 text-[#121212]",
      accent: "border-[#121212]/08",
    },
    {
      key: "rejected" as const,
      label: "Rejected",
      count: stats?.rejected ?? 0,
      hint: stats?.rejected === 0 ? "Good job!" : null,
      icon: Ban,
      iconBg: "bg-red-100 text-red-700",
      accent: "border-[#121212]/08",
    },
  ];

  const handleSearch = () => {
    const v = searchInput.trim();
    if (!v) return;
    router.push(`/dashboard/merchants?portal=admin&search=${encodeURIComponent(v)}`);
  };

  const exportCsv = () => {
    if (stores.length === 0) return;
    const header = ["Store Name", "Store ID", "Store Type", "City", "Status"];
    const rows = stores.map((s) => [
      s.name,
      s.store_id,
      storeTypeLabel(s.store_type),
      s.city ?? "",
      s.approval_status,
    ]);
    const csv = [header, ...rows].map((row) => row.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `merchants-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6 pb-8 -m-3 sm:-m-4 p-3 sm:p-5 bg-[#F3F7FA]">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-xl font-bold tracking-tight text-[#121212]">Merchants</h1>
          <p className="mt-1 text-sm text-[#121212]/55">Manage merchants, verifications and store operations.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#121212]/40" />
            <input
              type="search"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search store by name, ID or phone"
              className="h-9 w-52 rounded-[10px] border border-[#121212]/10 bg-white pl-8 pr-3 text-xs text-[#121212] shadow-sm placeholder:text-[#121212]/40 focus:border-[#121212]/25 focus:outline-none focus:ring-2 focus:ring-[#121212]/10 sm:w-60"
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSearch();
              }}
            />
          </div>
          <select
            value={storeTypeFilter}
            onChange={(e) => onStoreTypeChange(e.target.value)}
            className="h-9 rounded-[10px] border border-[#121212]/10 bg-white px-3 text-xs font-medium text-[#121212] shadow-sm focus:border-[#121212]/25 focus:outline-none focus:ring-2 focus:ring-[#121212]/10"
            aria-label="Store type"
          >
            <option value="">All types</option>
            <option value="RESTAURANT">Restaurant</option>
            <option value="CLOUD_KITCHEN">Cloud Kitchen</option>
            <option value="CAFE">Cafe</option>
            <option value="PHARMA">Pharma</option>
            <option value="GROCERY">Grocery</option>
          </select>
          <div className="flex items-center gap-1.5 rounded-[10px] border border-[#121212]/10 bg-white px-2 py-1 shadow-sm">
            <input
              type="date"
              value={dateFromInput}
              onChange={(e) => onDateFromChange(e.target.value)}
              className="h-7 border-0 bg-transparent px-1 text-xs text-[#121212] focus:outline-none focus:ring-0"
              aria-label="From date"
            />
            <span className="text-xs text-[#121212]/30">–</span>
            <input
              type="date"
              value={dateToInput}
              onChange={(e) => onDateToChange(e.target.value)}
              className="h-7 border-0 bg-transparent px-1 text-xs text-[#121212] focus:outline-none focus:ring-0"
              aria-label="To date"
            />
          </div>
          <button
            type="button"
            onClick={fromDate || toDate ? onClearFilters : onApplyFilters}
            className="h-9 rounded-[10px] border border-[#121212]/10 bg-white px-3 text-xs font-semibold text-[#121212] shadow-sm transition-colors hover:bg-white/90"
          >
            {fromDate || toDate ? "Clear" : "Apply"}
          </button>
          <button
            type="button"
            onClick={() => router.push(`/dashboard/merchants/verifications?${portalQuery}`)}
            className="inline-flex h-9 items-center gap-1.5 rounded-[10px] bg-[#121212] px-4 text-xs font-semibold text-white transition-colors hover:bg-black"
          >
            <Plus className="h-3.5 w-3.5" />
            Add Merchant
          </button>
        </div>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {(statsLoading ? Array.from({ length: 5 }) : statCards).map((card, i) => {
          if (statsLoading) {
            return (
              <div key={i} className="h-[108px] animate-pulse rounded-[10px] border border-[#121212]/08 bg-white shadow-[0_2px_12px_rgba(18,18,18,0.04)]" />
            );
          }
          const c = card as (typeof statCards)[number];
          const Icon = c.icon;
          const active = category === c.key;
          return (
            <button
              key={c.key}
              type="button"
              onClick={() => onCategoryClick(c.key)}
              className={`flex flex-col rounded-[10px] border bg-white p-4 text-left shadow-[0_2px_12px_rgba(18,18,18,0.04)] transition hover:shadow-[0_4px_16px_rgba(18,18,18,0.06)] ${c.accent} ${
                active ? "ring-2 ring-[#121212] ring-offset-2 ring-offset-[#F3F7FA]" : ""
              }`}
            >
              <div className="flex items-center gap-3">
                <span className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] ${c.iconBg}`}>
                  <Icon className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <span className="text-2xl font-bold leading-none text-[#121212]">{c.count}</span>
                  <span className="mt-1 block text-xs font-medium text-[#121212]/55">{c.label}</span>
                </div>
              </div>
              {c.hint ? (
                <span className="mt-3 text-[11px] font-medium leading-snug text-[#121212]/40">{c.hint}</span>
              ) : (
                <span className="mt-3 block h-[15px]" aria-hidden />
              )}
            </button>
          );
        })}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <div className="rounded-[10px] border border-[#121212]/08 bg-white p-4 shadow-[0_2px_12px_rgba(18,18,18,0.04)] sm:p-5">
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-center gap-1.5">
              <span className="text-sm font-semibold text-[#121212]">Merchant Growth</span>
              <Info className="h-3.5 w-3.5 text-[#121212]/30" aria-hidden />
            </div>
            <TrendChartControls
              trendPreset={trendPreset}
              onTrendPresetChange={setTrendPreset}
              trendFromInput={trendFromInput}
              trendToInput={trendToInput}
              onTrendFromChange={setTrendFromInput}
              onTrendToChange={setTrendToInput}
            />
          </div>
          <div style={{ height: CHART_HEIGHT }}>
            {overviewQuery.isLoading ? (
              <div className="h-full animate-pulse rounded-[10px] bg-[#F3F7FA]" />
            ) : (
              <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
                <AreaChart data={growthData} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                  <defs>
                    <linearGradient id="growthFillAdmin" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#121212" stopOpacity={0.28} />
                      <stop offset="100%" stopColor="#121212" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e8eef2" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#6b7280" }} interval="preserveStartEnd" />
                  <YAxis tick={{ fontSize: 10, fill: "#6b7280" }} allowDecimals={false} width={28} />
                  <Tooltip
                    contentStyle={{ fontSize: 12, borderRadius: 10, border: "1px solid rgba(18,18,18,0.1)" }}
                    formatter={(value) => [value, "New stores"]}
                  />
                  <Area
                    type="monotone"
                    dataKey="count"
                    stroke="#121212"
                    fill="url(#growthFillAdmin)"
                    strokeWidth={2.5}
                    dot={false}
                    activeDot={{ r: 4, fill: "#121212" }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        <div className="rounded-[10px] border border-[#121212]/08 bg-white p-4 shadow-[0_2px_12px_rgba(18,18,18,0.04)] sm:p-5">
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-center gap-1.5">
              <span className="text-sm font-semibold text-[#121212]">Verification Trend</span>
              <Info className="h-3.5 w-3.5 text-[#121212]/30" aria-hidden />
            </div>
            <TrendChartControls
              trendPreset={trendPreset}
              onTrendPresetChange={setTrendPreset}
              trendFromInput={trendFromInput}
              trendToInput={trendToInput}
              onTrendFromChange={setTrendFromInput}
              onTrendToChange={setTrendToInput}
            />
          </div>
          <div className="bg-white" style={{ height: CHART_HEIGHT }}>
            {overviewQuery.isLoading ? (
              <div className="h-full animate-pulse rounded-[10px] bg-[#F3F7FA]" />
            ) : (
              <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
                <LineChart data={verificationData} margin={{ top: 12, right: 12, left: -8, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e8eef2" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#6b7280" }} interval="preserveStartEnd" />
                  <YAxis tick={{ fontSize: 10, fill: "#6b7280" }} allowDecimals={false} width={28} />
                  <Tooltip
                    contentStyle={{
                      fontSize: 12,
                      borderRadius: 10,
                      border: "1px solid rgba(18,18,18,0.1)",
                      backgroundColor: "#ffffff",
                    }}
                  />
                  <Legend
                    wrapperStyle={{ fontSize: 10 }}
                    iconType="circle"
                    formatter={(value) => (value === "verified" ? "Verified" : "Rejected")}
                  />
                  <Line
                    type="monotone"
                    dataKey="verified"
                    name="verified"
                    stroke="#8B5CF6"
                    strokeWidth={2.5}
                    dot={{
                      r: 5,
                      stroke: "#8B5CF6",
                      strokeWidth: 2,
                      fill: "#ffffff",
                    }}
                    activeDot={{
                      r: 6,
                      stroke: "#8B5CF6",
                      strokeWidth: 2,
                      fill: "#ffffff",
                    }}
                    connectNulls
                  />
                  <Line
                    type="monotone"
                    dataKey="rejected"
                    name="rejected"
                    stroke="#EF4444"
                    strokeWidth={2.5}
                    dot={{
                      r: 5,
                      stroke: "#EF4444",
                      strokeWidth: 2,
                      fill: "#ffffff",
                    }}
                    activeDot={{
                      r: 6,
                      stroke: "#EF4444",
                      strokeWidth: 2,
                      fill: "#ffffff",
                    }}
                    connectNulls
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-[10px] border border-[#121212]/08 bg-white shadow-[0_2px_12px_rgba(18,18,18,0.04)]">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#121212]/08 px-4 py-4 sm:px-5">
          <span className="text-sm font-semibold text-[#121212]">All Merchants</span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={exportCsv}
              disabled={stores.length === 0}
              className="inline-flex h-8 items-center gap-1.5 rounded-[10px] border border-[#121212]/10 bg-white px-3 text-[11px] font-semibold text-[#121212]/75 shadow-sm transition-colors hover:bg-[#F3F7FA] disabled:opacity-40"
            >
              <Download className="h-3.5 w-3.5" />
              Export CSV
            </button>
            <button
              type="button"
              onClick={() => onCategoryClick("total")}
              className="inline-flex h-8 items-center gap-1.5 rounded-[10px] border border-[#121212]/10 bg-white px-3 text-[11px] font-semibold text-[#121212]/75 shadow-sm transition-colors hover:bg-[#F3F7FA]"
            >
              <Filter className="h-3.5 w-3.5" />
              View all
            </button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="bg-[#F3F7FA] text-[11px] font-semibold uppercase tracking-wide text-[#121212]/55">
              <tr>
                <th className="px-4 py-3 sm:px-5">Store Name</th>
                <th className="px-4 py-3">Store ID</th>
                <th className="px-4 py-3">Store Type</th>
                <th className="px-4 py-3">City</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right sm:px-5">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#121212]/08">
              {overviewQuery.isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i}>
                    <td colSpan={6} className="px-4 py-3">
                      <div className="h-9 animate-pulse rounded-[10px] bg-[#F3F7FA]" />
                    </td>
                  </tr>
                ))
              ) : stores.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-sm text-[#121212]/55">
                    No merchants found.
                  </td>
                </tr>
              ) : (
                stores.map((store) => {
                  const status = (store.approval_status || "").toUpperCase();
                  const isVerified = status === "APPROVED";
                  return (
                    <tr key={store.id} className="transition hover:bg-[#F3F7FA]/80">
                      <td className="px-4 py-3.5 sm:px-5">
                        <div className="flex items-center gap-3">
                          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#121212]/08 text-xs font-bold text-[#121212]">
                            {(store.name || "S").charAt(0).toUpperCase()}
                          </span>
                          <span className="font-medium text-[#121212] line-clamp-2">{store.name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3.5 font-mono text-xs text-[#121212]/55">{store.store_id}</td>
                      <td className="px-4 py-3.5">
                        <span
                          className={`rounded-full px-2.5 py-0.5 text-[10px] font-semibold ${storeTypeBadgeClass(store.store_type)}`}
                        >
                          {storeTypeLabel(store.store_type)}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 text-[#121212]/70">{store.city ?? "—"}</td>
                      <td className="px-4 py-3.5">
                        <StatusPill status={store.approval_status} />
                      </td>
                      <td className="px-4 py-3.5 text-right sm:px-5">
                        <button
                          type="button"
                          onClick={() => router.push(buildStoreUrl(store))}
                          className={`inline-flex items-center gap-0.5 rounded-[10px] px-3 py-1.5 text-[11px] font-semibold text-white transition-colors ${
                            isVerified
                              ? "bg-[#121212] hover:bg-black"
                              : "bg-amber-500 hover:bg-amber-600"
                          }`}
                        >
                          {isVerified ? "View" : "Verify"}
                          <ChevronDown className="h-3 w-3 -rotate-90" />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#121212]/08 px-4 py-3 text-xs text-[#121212]/55 sm:px-5">
          <span>
            Showing 1 to {stores.length} of {total} entries
          </span>
          <div className="flex items-center gap-1">
            <button type="button" className="rounded-[10px] bg-[#121212] px-2.5 py-1 text-[10px] font-semibold text-white">
              1
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
