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
    <div className="flex h-full min-h-[200px] flex-col items-center justify-center rounded-xl bg-[#F4F6F8] px-4 text-center">
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
    <div className="space-y-5 pb-8">
      {/* Single filter composition */}
      <div className="rounded-2xl border border-[#121212]/08 bg-white p-3 shadow-[0_1px_0_rgba(18,18,18,0.04)] sm:p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#121212]/35" />
            <input
              type="search"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search store by name, ID or place"
              className="h-11 w-full rounded-xl border border-[#121212]/10 bg-[#FAFBFC] pl-10 pr-3 text-sm text-[#121212] placeholder:text-[#121212]/40 focus:border-[#121212]/25 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#121212]/08"
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSearch();
              }}
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={storeTypeFilter}
              onChange={(e) => onStoreTypeChange(e.target.value)}
              className="h-11 min-w-[140px] rounded-xl border border-[#121212]/10 bg-[#FAFBFC] px-3 text-sm font-medium text-[#121212] focus:border-[#121212]/25 focus:outline-none focus:ring-2 focus:ring-[#121212]/08"
              aria-label="Store type"
            >
              <option value="">All types</option>
              <option value="RESTAURANT">Restaurant</option>
              <option value="CLOUD_KITCHEN">Cloud Kitchen</option>
              <option value="CAFE">Cafe</option>
              <option value="PHARMA">Pharma</option>
              <option value="GROCERY">Grocery</option>
            </select>
            <div className="flex h-11 items-center gap-1.5 rounded-xl border border-[#121212]/10 bg-[#FAFBFC] px-2.5">
              <input
                type="date"
                value={dateFromInput}
                onChange={(e) => onDateFromChange(e.target.value)}
                className="h-8 border-0 bg-transparent px-1 text-sm text-[#121212] focus:outline-none focus:ring-0"
                aria-label="From date"
              />
              <span className="text-xs text-[#121212]/30">–</span>
              <input
                type="date"
                value={dateToInput}
                onChange={(e) => onDateToChange(e.target.value)}
                className="h-8 border-0 bg-transparent px-1 text-sm text-[#121212] focus:outline-none focus:ring-0"
                aria-label="To date"
              />
            </div>
            <button
              type="button"
              onClick={fromDate || toDate ? onClearFilters : onApplyFilters}
              className="h-11 rounded-xl bg-[#121212] px-5 text-sm font-semibold text-white transition hover:bg-black"
            >
              {fromDate || toDate ? "Clear" : "Apply"}
            </button>
          </div>
        </div>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        {(statsLoading ? Array.from({ length: 6 }) : statCards).map((card, i) => {
          if (statsLoading) {
            return (
              <div
                key={i}
                className="h-[104px] animate-pulse rounded-2xl border border-[#121212]/06 bg-white"
              />
            );
          }
          const c = card as (typeof statCards)[number];
          const Icon = c.icon;
          const active = category === c.key;
          const attentionRing =
            c.key === "pending" && c.count > 0
              ? "border-rose-400 ring-2 ring-rose-200/70"
              : c.key === "drafted" && c.count > 0
                ? "border-sky-300 ring-1 ring-sky-100"
                : "border-[#121212]/08";
          return (
            <button
              key={c.key}
              type="button"
              onClick={() => onCategoryClick(c.key)}
              className={`group relative flex flex-col overflow-hidden rounded-2xl border bg-white px-3.5 py-3 text-left shadow-[0_1px_0_rgba(18,18,18,0.04)] transition hover:-translate-y-0.5 hover:shadow-[0_12px_28px_rgba(18,18,18,0.08)] ${attentionRing} ${
                active ? "ring-2 ring-[#121212] ring-offset-2" : ""
              }`}
            >
              {c.attention ? (
                <span className="absolute right-3 top-3 h-2 w-2 rounded-full bg-rose-500 shadow-[0_0_0_3px_rgba(244,63,94,0.2)]" />
              ) : null}
              <div className="flex items-start gap-2.5">
                <span
                  className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${c.iconBg}`}
                >
                  <Icon className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1 pt-0.5">
                  <p className="truncate text-[11px] font-semibold uppercase tracking-[0.06em] text-[#121212]/45">
                    {c.label}
                  </p>
                  <p className="mt-1 text-2xl font-bold leading-none tracking-tight text-[#121212]">
                    {c.count}
                  </p>
                  <p className="mt-1 truncate text-[11px] font-medium text-[#121212]/45">
                    {c.hint}
                  </p>
                </div>
              </div>
              <MiniSparkline data={c.spark} color={c.sparkColor} />
            </button>
          );
        })}
      </div>

      {/* Analytics header */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-base font-bold tracking-tight text-[#121212]">Analytics</h2>
          <p className="mt-0.5 text-xs text-[#121212]/50">
            Trends for <span className="font-semibold text-[#121212]/75">{trendLabel}</span>
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

      {/* Primary analytics: Status mix + Growth */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        <div className="rounded-2xl border border-[#121212]/08 bg-white p-4 sm:p-5 xl:col-span-4">
          <div className="mb-4">
            <h3 className="text-sm font-bold text-[#121212]">Status mix</h3>
            <p className="text-xs text-[#121212]/45">Current store portfolio</p>
          </div>
          <div style={{ height: CHART_HEIGHT }}>
            {statsLoading ? (
              <div className="h-full animate-pulse rounded-xl bg-[#F4F6F8]" />
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
                    innerRadius={62}
                    outerRadius={90}
                    paddingAngle={2}
                    stroke="#fff"
                    strokeWidth={3}
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

        <div className="rounded-2xl border border-[#121212]/08 bg-white p-4 sm:p-5 xl:col-span-8">
          <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
            <div>
              <h3 className="text-sm font-bold text-[#121212]">Merchant growth</h3>
              <p className="text-xs text-[#121212]/45">New stores over time</p>
            </div>
            <span className="inline-flex items-center rounded-full bg-[#121212] px-3 py-1 text-[11px] font-semibold text-white">
              {growthTotal} new in period
            </span>
          </div>
          <div style={{ height: CHART_HEIGHT }}>
            {overviewQuery.isLoading ? (
              <div className="h-full animate-pulse rounded-xl bg-[#F4F6F8]" />
            ) : growthEmpty ? (
              <ChartEmpty message="No new stores in this range" />
            ) : (
              <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
                <AreaChart data={growthData} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                  <defs>
                    <linearGradient id="growthFillPremium" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#121212" stopOpacity={0.2} />
                      <stop offset="100%" stopColor="#121212" stopOpacity={0.01} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#EEF1F4" vertical={false} />
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

        {/* Secondary analytics */}
        <div className="rounded-2xl border border-[#121212]/08 bg-white p-4 sm:p-5 xl:col-span-7">
          <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
            <div>
              <h3 className="text-sm font-bold text-[#121212]">Verification outcome</h3>
              <p className="text-xs text-[#121212]/45">Daily verified vs rejected</p>
            </div>
            <div className="flex items-center gap-2 text-[11px] font-semibold">
              <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-emerald-700 ring-1 ring-emerald-100">
                {verificationTotals.verified} verified
              </span>
              <span className="rounded-full bg-rose-50 px-2.5 py-1 text-rose-700 ring-1 ring-rose-100">
                {verificationTotals.rejected} rejected
              </span>
            </div>
          </div>
          <div style={{ height: CHART_HEIGHT }}>
            {overviewQuery.isLoading ? (
              <div className="h-full animate-pulse rounded-xl bg-[#F4F6F8]" />
            ) : verificationEmpty ? (
              <ChartEmpty message="No verification activity in this range" />
            ) : (
              <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
                <BarChart
                  data={verificationData}
                  margin={{ top: 8, right: 8, left: -12, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#EEF1F4" vertical={false} />
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

        <div className="rounded-2xl border border-[#121212]/08 bg-white p-4 sm:p-5 xl:col-span-5">
          <div className="mb-4">
            <h3 className="text-sm font-bold text-[#121212]">Store type mix</h3>
            <p className="text-xs text-[#121212]/45">Based on recent stores</p>
          </div>
          <div style={{ height: CHART_HEIGHT }}>
            {overviewQuery.isLoading ? (
              <div className="h-full animate-pulse rounded-xl bg-[#F4F6F8]" />
            ) : storeTypeEmpty ? (
              <ChartEmpty message="No recent stores to classify" />
            ) : (
              <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
                <BarChart
                  data={storeTypeBars}
                  layout="vertical"
                  margin={{ top: 4, right: 16, left: 8, bottom: 4 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#EEF1F4" horizontal={false} />
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
                    width={100}
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

      {/* Merchants table */}
      <div className="overflow-hidden rounded-2xl border border-[#121212]/08 bg-white shadow-[0_1px_0_rgba(18,18,18,0.04)]">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#121212]/06 px-4 py-4 sm:px-5">
          <div>
            <h2 className="text-base font-bold tracking-tight text-[#121212]">All Merchants</h2>
            <p className="mt-0.5 text-xs text-[#121212]/50">Recent child stores in scope</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={exportCsv}
              disabled={stores.length === 0}
              className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-[#121212]/12 bg-white px-3.5 text-xs font-semibold text-[#121212] transition hover:bg-[#FAFBFC] disabled:opacity-40"
            >
              <Download className="h-3.5 w-3.5" />
              Export CSV
            </button>
            <button
              type="button"
              onClick={() => onCategoryClick("total")}
              className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-[#121212] px-3.5 text-xs font-semibold text-white transition hover:bg-black"
            >
              <Filter className="h-3.5 w-3.5" />
              View all
            </button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="bg-[#FAFBFC] text-[11px] font-semibold uppercase tracking-[0.08em] text-[#121212]/45">
              <tr>
                <th className="px-4 py-3 sm:px-5">Store name</th>
                <th className="px-4 py-3">Store ID</th>
                <th className="px-4 py-3">Store type</th>
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
                      <div className="h-10 animate-pulse rounded-xl bg-[#F4F6F8]" />
                    </td>
                  </tr>
                ))
              ) : stores.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-4 py-14 text-center text-sm text-[#121212]/50"
                  >
                    No merchants found.
                  </td>
                </tr>
              ) : (
                stores.map((store) => {
                  const status = (store.approval_status || "").toUpperCase();
                  const isVerified = status === "APPROVED";
                  const needsAttention =
                    !isVerified && status !== "REJECTED" && status !== "BLOCKED";
                  return (
                    <tr
                      key={store.id}
                      className={`transition hover:bg-[#FAFBFC] ${
                        needsAttention ? "bg-rose-50/40" : "bg-white"
                      }`}
                    >
                      <td className="px-4 py-3 sm:px-5">
                        <div className="flex items-center gap-3">
                          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#121212] text-xs font-bold text-white">
                            {(store.name || "S").charAt(0).toUpperCase()}
                          </span>
                          <span className="font-semibold text-[#121212] line-clamp-2">
                            {store.name}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-[#121212]/55">
                        {store.store_id}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`rounded-full px-2.5 py-0.5 text-[10px] font-semibold ${storeTypeBadgeClass(store.store_type)}`}
                        >
                          {storeTypeLabel(store.store_type)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-[#121212]/70">{store.city ?? "—"}</td>
                      <td className="px-4 py-3">
                        <StatusPill status={store.approval_status} />
                      </td>
                      <td className="px-4 py-3 text-right sm:px-5">
                        <button
                          type="button"
                          onClick={() => router.push(buildStoreUrl(store))}
                          className={`inline-flex items-center gap-0.5 rounded-xl px-3.5 py-2 text-xs font-semibold text-white transition ${
                            isVerified
                              ? "bg-[#121212] hover:bg-black"
                              : "bg-rose-600 hover:bg-rose-700"
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
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#121212]/06 bg-[#FAFBFC] px-4 py-3 text-xs text-[#121212]/55 sm:px-5">
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
