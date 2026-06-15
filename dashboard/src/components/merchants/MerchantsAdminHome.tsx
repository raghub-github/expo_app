"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
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
  return "bg-indigo-50 text-indigo-700 ring-1 ring-indigo-200/60";
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
      className={`h-8 rounded-lg border border-gray-200 bg-white pl-2.5 pr-7 text-xs font-medium text-gray-700 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 ${className}`}
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
            className="h-8 rounded-lg border border-gray-200 bg-white px-2 text-xs shadow-sm focus:border-indigo-500 focus:outline-none"
            aria-label="Trend from date"
          />
          <span className="text-xs text-gray-300">–</span>
          <input
            type="date"
            value={trendToInput}
            onChange={(e) => onTrendToChange(e.target.value)}
            className="h-8 rounded-lg border border-gray-200 bg-white px-2 text-xs shadow-sm focus:border-indigo-500 focus:outline-none"
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
      iconBg: "bg-violet-100 text-violet-600",
      accent: "border-violet-100",
    },
    {
      key: "verified" as const,
      label: "Verified",
      count: stats?.verified ?? 0,
      hint: stats?.total ? `${verifiedPct}% of total stores` : null,
      icon: CheckCircle,
      iconBg: "bg-emerald-100 text-emerald-600",
      accent: "border-emerald-100",
    },
    {
      key: "pending" as const,
      label: "Pending Verification",
      count: stats?.pending ?? 0,
      hint: stats?.pending ? "Requires attention" : null,
      icon: Clock,
      iconBg: "bg-amber-100 text-amber-600",
      accent: "border-amber-100",
    },
    {
      key: "drafted" as const,
      label: "Drafted Store",
      count: stats?.drafted ?? 0,
      hint: stats?.drafted ? "Action needed" : null,
      icon: Pencil,
      iconBg: "bg-sky-100 text-sky-600",
      accent: "border-sky-100",
    },
    {
      key: "rejected" as const,
      label: "Rejected",
      count: stats?.rejected ?? 0,
      hint: stats?.rejected === 0 ? "Good job!" : null,
      icon: Ban,
      iconBg: "bg-red-100 text-red-600",
      accent: "border-red-100",
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
    <div className="space-y-6 pb-8 -m-3 sm:-m-4 p-3 sm:p-5 bg-[#f4f6fa]">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-xl font-bold tracking-tight text-gray-900">Merchants</h1>
          <p className="mt-1 text-sm text-gray-500">Manage merchants, verifications and store operations.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
            <input
              type="search"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search store by name, ID or phone"
              className="h-9 w-52 rounded-xl border border-gray-200 bg-white pl-8 pr-3 text-xs text-gray-900 shadow-sm placeholder:text-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 sm:w-60"
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSearch();
              }}
            />
          </div>
          <select
            value={storeTypeFilter}
            onChange={(e) => onStoreTypeChange(e.target.value)}
            className="h-9 rounded-xl border border-gray-200 bg-white px-3 text-xs font-medium text-gray-700 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
            aria-label="Store type"
          >
            <option value="">All types</option>
            <option value="RESTAURANT">Restaurant</option>
            <option value="CLOUD_KITCHEN">Cloud Kitchen</option>
            <option value="CAFE">Cafe</option>
            <option value="PHARMA">Pharma</option>
            <option value="GROCERY">Grocery</option>
          </select>
          <div className="flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-2 py-1 shadow-sm">
            <input
              type="date"
              value={dateFromInput}
              onChange={(e) => onDateFromChange(e.target.value)}
              className="h-7 border-0 bg-transparent px-1 text-xs text-gray-700 focus:outline-none focus:ring-0"
              aria-label="From date"
            />
            <span className="text-xs text-gray-300">–</span>
            <input
              type="date"
              value={dateToInput}
              onChange={(e) => onDateToChange(e.target.value)}
              className="h-7 border-0 bg-transparent px-1 text-xs text-gray-700 focus:outline-none focus:ring-0"
              aria-label="To date"
            />
          </div>
          <button
            type="button"
            onClick={fromDate || toDate ? onClearFilters : onApplyFilters}
            className="h-9 rounded-xl border border-gray-200 bg-white px-3 text-xs font-semibold text-gray-700 shadow-sm hover:bg-gray-50"
          >
            {fromDate || toDate ? "Clear" : "Apply"}
          </button>
          <button
            type="button"
            onClick={() => router.push(`/dashboard/merchants/verifications?${portalQuery}`)}
            className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 px-4 text-xs font-semibold text-white shadow-md shadow-indigo-200/50 hover:from-indigo-700 hover:to-violet-700"
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
              <div key={i} className="h-[108px] animate-pulse rounded-2xl border border-gray-100 bg-white shadow-sm" />
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
              className={`flex flex-col rounded-2xl border bg-white p-4 text-left shadow-sm transition hover:shadow-md ${c.accent} ${
                active ? "ring-2 ring-indigo-500 ring-offset-2" : ""
              }`}
            >
              <div className="flex items-center gap-3">
                <span className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${c.iconBg}`}>
                  <Icon className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <span className="text-2xl font-bold leading-none text-gray-900">{c.count}</span>
                  <span className="mt-1 block text-xs font-medium text-gray-500">{c.label}</span>
                </div>
              </div>
              {c.hint ? (
                <span className="mt-3 text-[11px] font-medium leading-snug text-gray-400">{c.hint}</span>
              ) : (
                <span className="mt-3 block h-[15px]" aria-hidden />
              )}
            </button>
          );
        })}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm sm:p-5">
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-center gap-1.5">
              <span className="text-sm font-semibold text-gray-800">Merchant Growth</span>
              <Info className="h-3.5 w-3.5 text-gray-300" aria-hidden />
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
              <div className="h-full animate-pulse rounded-lg bg-gray-100" />
            ) : (
              <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
                <AreaChart data={growthData} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                  <defs>
                    <linearGradient id="growthFillAdmin" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#6366f1" stopOpacity={0.4} />
                      <stop offset="100%" stopColor="#6366f1" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#9ca3af" }} interval="preserveStartEnd" />
                  <YAxis tick={{ fontSize: 10, fill: "#9ca3af" }} allowDecimals={false} width={28} />
                  <Tooltip
                    contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e5e7eb" }}
                    formatter={(value) => [value, "New stores"]}
                  />
                  <Area
                    type="monotone"
                    dataKey="count"
                    stroke="#6366f1"
                    fill="url(#growthFillAdmin)"
                    strokeWidth={2.5}
                    dot={false}
                    activeDot={{ r: 4, fill: "#6366f1" }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm sm:p-5">
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-center gap-1.5">
              <span className="text-sm font-semibold text-gray-800">Verification Trend</span>
              <Info className="h-3.5 w-3.5 text-gray-300" aria-hidden />
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
              <div className="h-full animate-pulse rounded-lg bg-gray-100" />
            ) : (
              <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
                <BarChart data={verificationData} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#9ca3af" }} interval="preserveStartEnd" />
                  <YAxis tick={{ fontSize: 10, fill: "#9ca3af" }} allowDecimals={false} width={28} />
                  <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e5e7eb" }} />
                  <Legend
                    wrapperStyle={{ fontSize: 10 }}
                    iconType="circle"
                    formatter={(value) => (value === "verified" ? "Verified" : "Rejected")}
                  />
                  <Bar dataKey="verified" name="verified" fill="#10b981" radius={[3, 3, 0, 0]} maxBarSize={10} />
                  <Bar dataKey="rejected" name="rejected" fill="#ef4444" radius={[3, 3, 0, 0]} maxBarSize={10} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 px-4 py-4 sm:px-5">
          <span className="text-sm font-semibold text-gray-900">All Merchants</span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={exportCsv}
              disabled={stores.length === 0}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 text-[11px] font-semibold text-gray-600 shadow-sm hover:bg-gray-50 disabled:opacity-40"
            >
              <Download className="h-3.5 w-3.5" />
              Export CSV
            </button>
            <button
              type="button"
              onClick={() => onCategoryClick("total")}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 text-[11px] font-semibold text-gray-600 shadow-sm hover:bg-gray-50"
            >
              <Filter className="h-3.5 w-3.5" />
              View all
            </button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="bg-gray-50 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-4 py-3 sm:px-5">Store Name</th>
                <th className="px-4 py-3">Store ID</th>
                <th className="px-4 py-3">Store Type</th>
                <th className="px-4 py-3">City</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right sm:px-5">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {overviewQuery.isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i}>
                    <td colSpan={6} className="px-4 py-3">
                      <div className="h-9 animate-pulse rounded-lg bg-gray-100" />
                    </td>
                  </tr>
                ))
              ) : stores.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-sm text-gray-500">
                    No merchants found.
                  </td>
                </tr>
              ) : (
                stores.map((store) => {
                  const status = (store.approval_status || "").toUpperCase();
                  const isVerified = status === "APPROVED";
                  return (
                    <tr key={store.id} className="transition hover:bg-indigo-50/30">
                      <td className="px-4 py-3.5 sm:px-5">
                        <div className="flex items-center gap-3">
                          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-indigo-100 to-violet-100 text-xs font-bold text-indigo-700">
                            {(store.name || "S").charAt(0).toUpperCase()}
                          </span>
                          <span className="font-medium text-gray-900 line-clamp-2">{store.name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3.5 font-mono text-xs text-gray-500">{store.store_id}</td>
                      <td className="px-4 py-3.5">
                        <span
                          className={`rounded-full px-2.5 py-0.5 text-[10px] font-semibold ${storeTypeBadgeClass(store.store_type)}`}
                        >
                          {storeTypeLabel(store.store_type)}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 text-gray-600">{store.city ?? "—"}</td>
                      <td className="px-4 py-3.5">
                        <StatusPill status={store.approval_status} />
                      </td>
                      <td className="px-4 py-3.5 text-right sm:px-5">
                        <button
                          type="button"
                          onClick={() => router.push(buildStoreUrl(store))}
                          className={`inline-flex items-center gap-0.5 rounded-lg px-3 py-1.5 text-[11px] font-semibold text-white shadow-sm ${
                            isVerified
                              ? "bg-indigo-600 hover:bg-indigo-700"
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
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-gray-100 px-4 py-3 text-xs text-gray-500 sm:px-5">
          <span>
            Showing 1 to {stores.length} of {total} entries
          </span>
          <div className="flex items-center gap-1">
            <button type="button" className="rounded-md bg-indigo-600 px-2.5 py-1 text-[10px] font-semibold text-white">
              1
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
