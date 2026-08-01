"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Ban,
  Building2,
  CheckCircle,
  ChevronDown,
  Clock,
  Download,
  Filter,
  Pencil,
  Search,
  Store,
  TrendingUp,
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
  partners?: number;
};

type CategoryKey =
  | "total"
  | "verified"
  | "pending"
  | "rejected"
  | "drafted"
  | "new"
  | "resubmitted"
  | "partners";

const TREND_PRESETS = [
  { value: "7", label: "Last 7 days" },
  { value: "14", label: "Last 14 days" },
  { value: "30", label: "Last 30 days" },
  { value: "90", label: "Last 90 days" },
  { value: "custom", label: "Custom range" },
] as const;

type TrendPresetValue = (typeof TREND_PRESETS)[number]["value"];

const STATUS_MIX_COLORS: Record<string, string> = {
  Verified: "#059669",
  Pending: "#D97706",
  Drafted: "#0284C7",
  Rejected: "#DC2626",
};

const STORE_TYPE_BAR_COLOR = "#121212";

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
    return d.toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
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
      className={`h-8 rounded-lg border border-[#121212]/10 bg-white pl-2.5 pr-7 text-xs font-medium text-[#121212] shadow-sm focus:border-[#121212]/25 focus:outline-none focus:ring-1 focus:ring-[#121212]/15 ${className}`}
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
            className="h-8 rounded-lg border border-[#121212]/10 bg-white px-2 text-xs text-[#121212] shadow-sm focus:border-[#121212]/25 focus:outline-none"
            aria-label="Trend from date"
          />
          <span className="text-xs text-[#121212]/30">–</span>
          <input
            type="date"
            value={trendToInput}
            onChange={(e) => onTrendToChange(e.target.value)}
            className="h-8 rounded-lg border border-[#121212]/10 bg-white px-2 text-xs text-[#121212] shadow-sm focus:border-[#121212]/25 focus:outline-none"
            aria-label="Trend to date"
          />
        </>
      ) : null}
    </div>
  );
}

function ChartEmpty({ message }: { message: string }) {
  return (
    <div className="flex h-full min-h-[200px] flex-col items-center justify-center rounded-xl bg-[#F8FAFC] px-4 text-center">
      <TrendingUp className="mb-2 h-8 w-8 text-[#121212]/20" aria-hidden />
      <p className="text-sm font-medium text-[#121212]/55">{message}</p>
    </div>
  );
}

function MiniSparkline({ data, color = "#121212" }: { data: number[]; color?: string }) {
  const series = data.length >= 2 ? data : [0, 0];
  // Flat baseline when empty so every KPI still shows a graph line.
  const chartData = series.every((n) => n === 0)
    ? series.map((_, i) => ({ i, v: 1 }))
    : series.map((v, i) => ({ i, v }));
  const gradId = `spark-${color.replace("#", "")}`;
  return (
    <div className="mt-1 h-4 w-full">
      <ResponsiveContainer width="100%" height={16}>
        <AreaChart data={chartData} margin={{ top: 1, right: 0, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.35} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <Area
            type="monotone"
            dataKey="v"
            stroke={color}
            fill={`url(#${gradId})`}
            strokeWidth={1.5}
            dot={false}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

const CHART_HEIGHT = 260;

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
  portalQuery: _portalQuery,
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

  const verificationTotals = useMemo(() => {
    let verified = 0;
    let rejected = 0;
    for (const p of verificationData) {
      verified += Number(p.verified) || 0;
      rejected += Number(p.rejected) || 0;
    }
    return { verified, rejected };
  }, [verificationData]);

  const growthEmpty = growthData.length === 0 || growthData.every((d) => !d.count);
  const verificationEmpty =
    verificationData.length === 0 ||
    verificationData.every((d) => !(d.verified || d.rejected));

  const sparkGrowth = useMemo(() => growthData.map((d) => d.count), [growthData]);
  const sparkVerified = useMemo(() => {
    let cum = 0;
    return verificationData.map((d) => {
      cum += Number(d.verified) || 0;
      return cum;
    });
  }, [verificationData]);
  const sparkRejected = useMemo(() => {
    let cum = 0;
    return verificationData.map((d) => {
      cum += Number(d.rejected) || 0;
      return cum;
    });
  }, [verificationData]);
  /** Pending queue proxy: net new stores minus verified/rejected in the trend window. */
  const sparkPending = useMemo(() => {
    if (growthData.length === 0) return sparkGrowth;
    let open = 0;
    return growthData.map((g, i) => {
      const v = verificationData[i];
      open += g.count - (Number(v?.verified) || 0) - (Number(v?.rejected) || 0);
      return Math.max(0, open);
    });
  }, [growthData, verificationData, sparkGrowth]);
  /** Drafted activity proxy from growth shape (same axis as store card). */
  const sparkDrafted = useMemo(() => {
    if (growthData.length < 2) return sparkGrowth;
    return growthData.map((d, i) => {
      const prev = growthData[i - 1]?.count ?? d.count;
      return Math.max(0, Math.round((d.count + prev) / 2));
    });
  }, [growthData, sparkGrowth]);
  /** Partners: slow cumulative growth curve. */
  const sparkPartners = useMemo(() => {
    let cum = 0;
    return growthData.map((d) => {
      cum += d.count > 0 ? 1 : 0;
      return cum;
    });
  }, [growthData]);

  const stores = overviewQuery.data?.stores ?? [];
  const total = stats?.total ?? stores.length;
  const verifiedPct =
    stats && stats.total > 0 ? Math.round((stats.verified / stats.total) * 100) : 0;

  const statusMixData = useMemo(() => {
    const rows = [
      { name: "Verified", value: stats?.verified ?? 0 },
      { name: "Pending", value: stats?.pending ?? 0 },
      { name: "Drafted", value: stats?.drafted ?? 0 },
      { name: "Rejected", value: stats?.rejected ?? 0 },
    ].filter((r) => r.value > 0);
    return rows;
  }, [stats]);

  const statusMixEmpty = statusMixData.length === 0;

  const storeTypeBars = useMemo(() => {
    const map = new Map<string, number>();
    for (const s of stores) {
      const label = storeTypeLabel(s.store_type);
      map.set(label, (map.get(label) ?? 0) + 1);
    }
    return [...map.entries()]
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [stores]);

  const storeTypeEmpty = storeTypeBars.length === 0;

  const statCards = [
    {
      key: "partners" as const,
      label: "Partners",
      count: stats?.partners ?? 0,
      hint: "Parent merchant accounts",
      icon: Building2,
      iconBg: "bg-violet-100 text-violet-700",
      spark: sparkPartners,
      sparkColor: "#7C3AED",
      attention: false,
    },
    {
      key: "total" as const,
      label: "Total Stores",
      count: stats?.total ?? 0,
      hint: growthTotal > 0 ? `+ ${growthTotal} in ${trendLabel.toLowerCase()}` : "All child stores",
      icon: Store,
      iconBg: "bg-[#121212] text-white",
      spark: sparkGrowth,
      sparkColor: "#121212",
      attention: false,
    },
    {
      key: "verified" as const,
      label: "Verified",
      count: stats?.verified ?? 0,
      hint: stats?.total ? `${verifiedPct}% of total stores` : "Approved stores",
      icon: CheckCircle,
      iconBg: "bg-emerald-100 text-emerald-700",
      spark: sparkVerified,
      sparkColor: "#059669",
      attention: false,
    },
    {
      key: "pending" as const,
      label: "Pending Verification",
      count: stats?.pending ?? 0,
      hint: stats?.pending ? "Requires attention" : "Queue clear",
      icon: Clock,
      iconBg: "bg-amber-100 text-amber-700",
      spark: sparkPending,
      sparkColor: "#D97706",
      attention: (stats?.pending ?? 0) > 0,
    },
    {
      key: "drafted" as const,
      label: "Drafted Store",
      count: stats?.drafted ?? 0,
      hint: stats?.drafted ? "Action needed" : "No open drafts",
      icon: Pencil,
      iconBg: "bg-sky-100 text-sky-700",
      spark: sparkDrafted,
      sparkColor: "#0284C7",
      attention: (stats?.drafted ?? 0) > 0,
    },
    {
      key: "rejected" as const,
      label: "Rejected",
      count: stats?.rejected ?? 0,
      hint: stats?.rejected === 0 ? "Good job!" : "Needs follow-up",
      icon: Ban,
      iconBg: "bg-red-100 text-red-700",
      spark: sparkRejected,
      sparkColor: "#DC2626",
      attention: false,
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
    const csv = [header, ...rows]
      .map((row) => row.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `merchants-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6 overflow-hidden rounded-2xl border border-[#121212]/06 bg-[linear-gradient(180deg,#E8EEF3_0%,#F3F7FA_40%,#F3F7FA_100%)] p-3 pb-10 sm:rounded-3xl sm:p-5">
      {/* Toolbar only — page title stays in the dashboard header */}
      <div className="flex flex-wrap items-center justify-end gap-2">
        <div className="flex w-full flex-wrap items-center gap-2 rounded-2xl border border-white/80 bg-white/90 p-2 shadow-[0_8px_30px_rgba(18,18,18,0.06)] backdrop-blur-sm lg:w-auto">
          <div className="relative min-w-[180px] flex-1 sm:min-w-[220px]">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#121212]/40" />
            <input
              type="search"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search store by name, ID or phone"
              className="h-9 w-full rounded-xl border border-[#121212]/08 bg-[#F8FAFC] pl-8 pr-3 text-xs text-[#121212] placeholder:text-[#121212]/40 focus:border-[#121212]/2 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#121212]/08"
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSearch();
              }}
            />
          </div>
          <select
            value={storeTypeFilter}
            onChange={(e) => onStoreTypeChange(e.target.value)}
            className="h-9 rounded-xl border border-[#121212]/08 bg-[#F8FAFC] px-3 text-xs font-medium text-[#121212] focus:border-[#121212]/2 focus:outline-none focus:ring-2 focus:ring-[#121212]/08"
            aria-label="Store type"
          >
            <option value="">All types</option>
            <option value="RESTAURANT">Restaurant</option>
            <option value="CLOUD_KITCHEN">Cloud Kitchen</option>
            <option value="CAFE">Cafe</option>
            <option value="PHARMA">Pharma</option>
            <option value="GROCERY">Grocery</option>
          </select>
          <div className="flex items-center gap-1 rounded-xl border border-[#121212]/08 bg-[#F8FAFC] px-2 py-1">
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
            className="h-9 rounded-xl border border-[#121212]/10 bg-white px-3 text-xs font-semibold text-[#121212] transition-colors hover:bg-[#F3F7FA]"
          >
            {fromDate || toDate ? "Clear" : "Apply"}
          </button>
        </div>
      </div>

      {/* Hero KPI strip */}
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
        {(statsLoading ? Array.from({ length: 6 }) : statCards).map((card, i) => {
          if (statsLoading) {
            return (
              <div
                key={i}
                className="h-[88px] animate-pulse rounded-xl border border-[#121212]/06 bg-white/80 shadow-[0_4px_20px_rgba(18,18,18,0.04)]"
              />
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
              className={`group relative flex flex-col overflow-hidden rounded-xl border bg-white px-3 py-2.5 text-left shadow-[0_4px_20px_rgba(18,18,18,0.04)] transition hover:-translate-y-0.5 hover:shadow-[0_10px_28px_rgba(18,18,18,0.08)] ${
                c.attention
                  ? "border-amber-200/80 ring-1 ring-amber-100"
                  : "border-[#121212]/06"
              } ${active ? "ring-2 ring-[#121212] ring-offset-2 ring-offset-[#F3F7FA]" : ""}`}
            >
              {c.attention ? (
                <span className="absolute right-2.5 top-2.5 h-1.5 w-1.5 rounded-full bg-amber-500 shadow-[0_0_0_3px_rgba(245,158,11,0.25)]" />
              ) : null}
              <div className="flex items-center gap-2.5">
                <span
                  className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${c.iconBg}`}
                >
                  <Icon className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2">
                    <span className="text-xl font-bold leading-none tracking-tight text-[#121212]">
                      {c.count}
                    </span>
                    <span className="truncate text-[11px] font-semibold text-[#121212]/70">
                      {c.label}
                    </span>
                  </div>
                  <span className="mt-0.5 block truncate text-[10px] font-medium leading-snug text-[#121212]/40">
                    {c.hint}
                  </span>
                </div>
              </div>
              <MiniSparkline data={c.spark} color={c.sparkColor} />
            </button>
          );
        })}
      </div>

      {/* Shared analytics toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-bold text-[#121212]">Analytics</h2>
          <p className="text-[11px] text-[#121212]/45">
            Trends for <span className="font-semibold text-[#121212]/65">{trendLabel}</span>
          </p>
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

      {/* Analytics grid */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        {/* Status mix donut */}
        <div className="rounded-2xl border border-[#121212]/06 bg-white p-4 shadow-[0_4px_20px_rgba(18,18,18,0.04)] sm:p-5 xl:col-span-4">
          <div className="mb-3 flex items-start justify-between gap-2">
            <div>
              <h3 className="text-sm font-bold text-[#121212]">Status mix</h3>
              <p className="text-[11px] text-[#121212]/45">Current store portfolio</p>
            </div>
          </div>
          <div style={{ height: CHART_HEIGHT }}>
            {statsLoading ? (
              <div className="h-full animate-pulse rounded-xl bg-[#F3F7FA]" />
            ) : statusMixEmpty ? (
              <ChartEmpty message="No status data yet" />
            ) : (
              <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
                <PieChart>
                  <Pie
                    data={statusMixData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="48%"
                    innerRadius={58}
                    outerRadius={86}
                    paddingAngle={3}
                    stroke="#fff"
                    strokeWidth={2}
                  >
                    {statusMixData.map((entry) => (
                      <Cell
                        key={entry.name}
                        fill={STATUS_MIX_COLORS[entry.name] ?? "#94A3B8"}
                      />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      fontSize: 12,
                      borderRadius: 12,
                      border: "1px solid rgba(18,18,18,0.1)",
                    }}
                    formatter={(value, name) => [value, String(name)]}
                  />
                  <Legend
                    verticalAlign="bottom"
                    height={36}
                    iconType="circle"
                    wrapperStyle={{ fontSize: 11 }}
                  />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Merchant Growth */}
        <div className="rounded-2xl border border-[#121212]/06 bg-white p-4 shadow-[0_4px_20px_rgba(18,18,18,0.04)] sm:p-5 xl:col-span-8">
          <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
            <div>
              <h3 className="text-sm font-bold text-[#121212]">Merchant growth</h3>
              <p className="text-[11px] text-[#121212]/45">New stores over time</p>
            </div>
            <span className="inline-flex items-center rounded-full bg-[#121212]/06 px-2.5 py-1 text-[11px] font-semibold text-[#121212]">
              {growthTotal} new in period
            </span>
          </div>
          <div style={{ height: CHART_HEIGHT }}>
            {overviewQuery.isLoading ? (
              <div className="h-full animate-pulse rounded-xl bg-[#F3F7FA]" />
            ) : growthEmpty ? (
              <ChartEmpty message="No new stores in this range" />
            ) : (
              <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
                <AreaChart data={growthData} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                  <defs>
                    <linearGradient id="growthFillPremium" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#121212" stopOpacity={0.22} />
                      <stop offset="100%" stopColor="#121212" stopOpacity={0.01} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E8EEF2" vertical={false} />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 10, fill: "#6b7280" }}
                    interval="preserveStartEnd"
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 10, fill: "#6b7280" }}
                    allowDecimals={false}
                    width={28}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    contentStyle={{
                      fontSize: 12,
                      borderRadius: 12,
                      border: "1px solid rgba(18,18,18,0.1)",
                    }}
                    formatter={(value) => [value, "New stores"]}
                  />
                  <Area
                    type="monotone"
                    dataKey="count"
                    stroke="#121212"
                    fill="url(#growthFillPremium)"
                    strokeWidth={2.5}
                    dot={false}
                    activeDot={{ r: 4, fill: "#121212" }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Verification stacked bars */}
        <div className="rounded-2xl border border-[#121212]/06 bg-white p-4 shadow-[0_4px_20px_rgba(18,18,18,0.04)] sm:p-5 xl:col-span-7">
          <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
            <div>
              <h3 className="text-sm font-bold text-[#121212]">Verification outcome</h3>
              <p className="text-[11px] text-[#121212]/45">Daily verified vs rejected</p>
            </div>
            <div className="flex items-center gap-2 text-[11px] font-semibold">
              <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-emerald-700">
                {verificationTotals.verified} verified
              </span>
              <span className="rounded-full bg-red-50 px-2 py-0.5 text-red-700">
                {verificationTotals.rejected} rejected
              </span>
            </div>
          </div>
          <div style={{ height: CHART_HEIGHT }}>
            {overviewQuery.isLoading ? (
              <div className="h-full animate-pulse rounded-xl bg-[#F3F7FA]" />
            ) : verificationEmpty ? (
              <ChartEmpty message="No verification activity in this range" />
            ) : (
              <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
                <BarChart
                  data={verificationData}
                  margin={{ top: 8, right: 8, left: -12, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#E8EEF2" vertical={false} />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 10, fill: "#6b7280" }}
                    interval="preserveStartEnd"
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 10, fill: "#6b7280" }}
                    allowDecimals={false}
                    width={28}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    contentStyle={{
                      fontSize: 12,
                      borderRadius: 12,
                      border: "1px solid rgba(18,18,18,0.1)",
                      backgroundColor: "#ffffff",
                    }}
                  />
                  <Legend
                    wrapperStyle={{ fontSize: 11 }}
                    iconType="circle"
                    formatter={(value) =>
                      value === "verified" ? "Verified" : "Rejected"
                    }
                  />
                  <Bar
                    dataKey="verified"
                    name="verified"
                    stackId="v"
                    fill="#059669"
                    radius={[0, 0, 0, 0]}
                    maxBarSize={28}
                  />
                  <Bar
                    dataKey="rejected"
                    name="rejected"
                    stackId="v"
                    fill="#DC2626"
                    radius={[4, 4, 0, 0]}
                    maxBarSize={28}
                  />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Store type mix */}
        <div className="rounded-2xl border border-[#121212]/06 bg-white p-4 shadow-[0_4px_20px_rgba(18,18,18,0.04)] sm:p-5 xl:col-span-5">
          <div className="mb-3">
            <h3 className="text-sm font-bold text-[#121212]">Store type mix</h3>
            <p className="text-[11px] text-[#121212]/45">Based on recent stores</p>
          </div>
          <div style={{ height: CHART_HEIGHT }}>
            {overviewQuery.isLoading ? (
              <div className="h-full animate-pulse rounded-xl bg-[#F3F7FA]" />
            ) : storeTypeEmpty ? (
              <ChartEmpty message="No recent stores to classify" />
            ) : (
              <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
                <BarChart
                  data={storeTypeBars}
                  layout="vertical"
                  margin={{ top: 4, right: 16, left: 8, bottom: 4 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#E8EEF2" horizontal={false} />
                  <XAxis
                    type="number"
                    allowDecimals={false}
                    tick={{ fontSize: 10, fill: "#6b7280" }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    type="category"
                    dataKey="name"
                    width={96}
                    tick={{ fontSize: 10, fill: "#374151" }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    contentStyle={{
                      fontSize: 12,
                      borderRadius: 12,
                      border: "1px solid rgba(18,18,18,0.1)",
                    }}
                    formatter={(value) => [value, "Stores"]}
                  />
                  <Bar
                    dataKey="value"
                    fill={STORE_TYPE_BAR_COLOR}
                    radius={[0, 6, 6, 0]}
                    maxBarSize={18}
                  />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-2xl border border-[#121212]/06 bg-white shadow-[0_4px_24px_rgba(18,18,18,0.05)]">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#121212]/06 bg-[#F8FAFC]/80 px-4 py-4 sm:px-5">
          <div>
            <span className="text-sm font-bold text-[#121212]">All Merchants</span>
            <p className="text-[11px] text-[#121212]/45">Recent child stores in scope</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={exportCsv}
              disabled={stores.length === 0}
              className="inline-flex h-8 items-center gap-1.5 rounded-xl border border-[#121212]/10 bg-white px-3 text-[11px] font-semibold text-[#121212]/75 shadow-sm transition-colors hover:bg-white disabled:opacity-40"
            >
              <Download className="h-3.5 w-3.5" />
              Export CSV
            </button>
            <button
              type="button"
              onClick={() => onCategoryClick("total")}
              className="inline-flex h-8 items-center gap-1.5 rounded-xl border border-[#121212]/10 bg-white px-3 text-[11px] font-semibold text-[#121212]/75 shadow-sm transition-colors hover:bg-white"
            >
              <Filter className="h-3.5 w-3.5" />
              View all
            </button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="sticky top-0 z-[1] bg-[#F3F7FA] text-[11px] font-semibold uppercase tracking-wide text-[#121212]/50">
              <tr>
                <th className="px-4 py-3 sm:px-5">Store Name</th>
                <th className="px-4 py-3">Store ID</th>
                <th className="px-4 py-3">Store Type</th>
                <th className="px-4 py-3">City</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right sm:px-5">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#121212]/06">
              {overviewQuery.isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i}>
                    <td colSpan={6} className="px-4 py-3">
                      <div className="h-9 animate-pulse rounded-xl bg-[#F3F7FA]" />
                    </td>
                  </tr>
                ))
              ) : stores.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-4 py-12 text-center text-sm text-[#121212]/55"
                  >
                    No merchants found.
                  </td>
                </tr>
              ) : (
                stores.map((store, idx) => {
                  const status = (store.approval_status || "").toUpperCase();
                  const isVerified = status === "APPROVED";
                  return (
                    <tr
                      key={store.id}
                      className={`transition hover:bg-[#F3F7FA]/90 ${
                        idx % 2 === 1 ? "bg-[#FAFBFC]" : "bg-white"
                      }`}
                    >
                      <td className="px-4 py-3.5 sm:px-5">
                        <div className="flex items-center gap-3">
                          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#121212]/08 text-xs font-bold text-[#121212]">
                            {(store.name || "S").charAt(0).toUpperCase()}
                          </span>
                          <span className="font-medium text-[#121212] line-clamp-2">
                            {store.name}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3.5 font-mono text-xs text-[#121212]/55">
                        {store.store_id}
                      </td>
                      <td className="px-4 py-3.5">
                        <span
                          className={`rounded-full px-2.5 py-0.5 text-[10px] font-semibold ${storeTypeBadgeClass(store.store_type)}`}
                        >
                          {storeTypeLabel(store.store_type)}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 text-[#121212]/70">
                        {store.city ?? "—"}
                      </td>
                      <td className="px-4 py-3.5">
                        <StatusPill status={store.approval_status} />
                      </td>
                      <td className="px-4 py-3.5 text-right sm:px-5">
                        <button
                          type="button"
                          onClick={() => router.push(buildStoreUrl(store))}
                          className={`inline-flex items-center gap-0.5 rounded-xl px-3 py-1.5 text-[11px] font-semibold text-white transition-colors ${
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
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#121212]/06 bg-[#F8FAFC]/60 px-4 py-3 text-xs text-[#121212]/55 sm:px-5">
          <span>
            Showing 1 to {stores.length} of {total} entries
          </span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              className="rounded-lg bg-[#121212] px-2.5 py-1 text-[10px] font-semibold text-white"
            >
              1
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
