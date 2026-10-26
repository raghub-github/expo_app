"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  ChevronDown,
  Leaf,
  MapPin,
  MessageCircle,
  Phone,
  Search,
  Star,
  Store,
  TrendingUp,
  Wallet,
  X,
} from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useCoreData } from "@/lib/hooks/useCoreData";
import { formatCount, formatDateTime, formatInr } from "@/lib/format";
import { parsePeriod, type Period } from "@/lib/period";
import { useDashboardIdentity } from "@/components/auth/DashboardIdentity";
import { ErrorState, LoadingGrid } from "@/components/ui/Primitives";
import type { MerchantDetailData, MerchantsData } from "@/lib/data-types";
import { orderDetailHref } from "@/lib/order-links";

type StoreRow = MerchantsData["recent"][number];
type OrderRow = MerchantDetailData["orderHistory"][number];
type Segment = "ALL" | "LIVE" | "ACCEPTING" | "NEW";
type StatsRange = "W" | "M" | "6M" | "Y";

const RANGE_TO_PERIOD: Record<StatsRange, Period> = {
  W: "7d",
  M: "30d",
  "6M": "90d",
  Y: "90d",
};

function periodToRange(period: Period): StatsRange {
  if (period === "30d") return "M";
  if (period === "90d") return "6M";
  return "W";
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "S";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
}

function prettyType(type: string) {
  return type.replace(/_/g, " ") || "Store";
}

function shortAddress(value: string) {
  if (!value || value === "—") return "—";
  return value.length > 48 ? `${value.slice(0, 46)}…` : value;
}

function statusColor(status: string) {
  const s = status.toLowerCase();
  if (s === "delivered") return "#7C3AED";
  if (s === "cancelled" || s === "failed") return "#F472B6";
  if (s.includes("prepar") || s.includes("ready")) return "#F59E0B";
  if (s.includes("picked") || s.includes("way")) return "#22C55E";
  return "#94A3B8";
}

function SlidingPillToggle<T extends string>({
  options,
  value,
  onChange,
  className = "",
}: {
  options: readonly T[];
  value: T;
  onChange: (v: T) => void;
  className?: string;
}) {
  return (
    <div className={`inline-flex rounded-full bg-[#F3F4F6] p-1 ${className}`}>
      {options.map((opt) => (
        <button
          key={opt}
          type="button"
          onClick={() => onChange(opt)}
          className={`cursor-pointer rounded-full px-3 py-1.5 text-[12px] font-semibold transition ${
            value === opt ? "bg-[#111827] text-white shadow-sm" : "text-[#6B7280] hover:text-[#111827]"
          }`}
        >
          {opt}
        </button>
      ))}
    </div>
  );
}

function StoreAvatar({ name, src, size = 40 }: { name: string; src?: string | null; size?: number }) {
  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={name}
        width={size}
        height={size}
        className="rounded-xl object-cover"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <div
      className="flex items-center justify-center rounded-xl bg-[#EDE9FE] text-[13px] font-semibold text-[#7C3AED]"
      style={{ width: size, height: size }}
    >
      {initials(name)}
    </div>
  );
}

function StoreAvatarWithStatus({
  name,
  src,
  size = 44,
  live,
  accepting,
}: {
  name: string;
  src?: string | null;
  size?: number;
  live: boolean;
  accepting: boolean;
}) {
  return (
    <div className="relative shrink-0 overflow-hidden rounded-xl" style={{ width: size, height: size }}>
      <StoreAvatar name={name} src={src} size={size} />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center bg-gradient-to-t from-black/75 via-black/35 to-transparent pb-[3px] pt-5">
        <LiveBadge live={live} accepting={accepting} overlay />
      </div>
    </div>
  );
}

function LiveBadge({
  live,
  accepting,
  overlay = false,
}: {
  live: boolean;
  accepting: boolean;
  overlay?: boolean;
}) {
  const base = overlay
    ? "inline-flex items-center gap-1 rounded-full px-1.5 py-px text-[8px] font-semibold tracking-wide shadow-sm"
    : "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold tracking-wide";
  if (live && accepting) {
    return (
      <span className={`${base} ${overlay ? "bg-white/95 text-[#15803D]" : "bg-[#DCFCE7] text-[#15803D]"}`}>
        <span className="h-1.5 w-1.5 rounded-full bg-[#22C55E]" /> LIVE
      </span>
    );
  }
  if (live) {
    return (
      <span className={`${base} ${overlay ? "bg-white/95 text-[#1D4ED8]" : "bg-[#DBEAFE] text-[#1D4ED8]"}`}>
        OPEN
      </span>
    );
  }
  return (
    <span className={`${base} ${overlay ? "bg-white/95 text-[#4B5563]" : "bg-[#F3F4F6] text-[#6B7280]"}`}>
      OFFLINE
    </span>
  );
}

function OrderJourneyRail({
  total,
  delivered,
  cancelled,
}: {
  total: number;
  delivered: number;
  cancelled: number;
}) {
  const other = Math.max(total - delivered - cancelled, 0);
  const stages = [
    { key: "all", label: "Placed", count: Math.max(total, 0), color: "#1C1917" },
    { key: "delivered", label: "Delivered", count: Math.max(delivered, 0), color: "#0F766E" },
    { key: "cancelled", label: "Cancelled", count: Math.max(cancelled, 0), color: "#BE123C" },
    { key: "other", label: "Open", count: other, color: "#C2410C" },
  ];
  const base = stages[0].count || 1;

  return (
    <div className="space-y-4">
      {/* Soft stacked rail — no hard grey bevel blocks */}
      <div className="relative overflow-hidden rounded-2xl bg-[#1C1917] p-4">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-40"
          style={{
            background:
              "radial-gradient(ellipse at 20% 0%, rgba(245,158,11,0.25), transparent 55%), radial-gradient(ellipse at 90% 100%, rgba(15,118,110,0.2), transparent 50%)",
          }}
        />
        <div className="relative flex h-14 overflow-hidden rounded-xl ring-1 ring-white/10">
          {stages.slice(1).map((s, i) => {
            if (s.count === 0 && i > 0) return null;
            return (
              <div
                key={s.key}
                className="relative flex min-w-0 flex-col justify-center px-3 transition-[flex-grow]"
                style={{
                  flexGrow: Math.max(s.count, 0.01),
                  flexBasis: 0,
                  background: s.color,
                }}
                title={`${s.label}: ${s.count}`}
              >
                <span className="truncate text-[11px] font-semibold text-white/90">{s.label}</span>
                <span className="text-[15px] font-bold tabular-nums text-white">{formatCount(s.count)}</span>
              </div>
            );
          })}
          {delivered + cancelled + other === 0 ? (
            <div className="flex flex-1 items-center justify-center bg-[#292524] text-[12px] text-[#A8A29E]">
              No order volume yet
            </div>
          ) : null}
        </div>
        <p className="relative mt-3 text-[11px] text-[#A8A29E]">
          Of {formatCount(total)} lifetime orders · deliver {(base ? (delivered / base) * 100 : 0).toFixed(0)}% ·
          cancel {(base ? (cancelled / base) * 100 : 0).toFixed(0)}%
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {stages.map((s) => (
          <div key={s.key} className="rounded-xl border border-[#E7E5E4] bg-[#FAFAF9] px-3 py-2.5">
            <div className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full" style={{ background: s.color }} />
              <p className="text-[10px] font-semibold uppercase tracking-wide text-[#78716C]">{s.label}</p>
            </div>
            <p className="mt-1 text-[18px] font-semibold tabular-nums text-[#1C1917]">{formatCount(s.count)}</p>
            <p className="text-[11px] tabular-nums text-[#A8A29E]">
              {Math.round((s.count / base) * 100)}% of placed
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

function OrderJourneyTrendChart({
  series,
  deliverRate,
  periodCtm,
  lifetimeCtm,
}: {
  series: MerchantDetailData["spendSeries"];
  deliverRate: number;
  periodCtm: number;
  lifetimeCtm: number;
}) {
  const chartData = series.map((r) => ({
    day: r.day,
    ctm: r.ctm,
    orders: r.orders,
  }));

  const mid = Math.floor(chartData.length / 2);
  const firstHalf = chartData.slice(0, mid);
  const secondHalf = chartData.slice(mid);
  const sum = (rows: typeof chartData, key: "ctm" | "orders") =>
    rows.reduce((acc, row) => acc + Number(row[key] || 0), 0);
  const firstCtm = sum(firstHalf, "ctm");
  const secondCtm = sum(secondHalf, "ctm");
  const trendPct =
    firstCtm > 0 ? ((secondCtm - firstCtm) / firstCtm) * 100 : secondCtm > 0 ? 100 : 0;
  const trendUp = trendPct >= 0;

  return (
    <div className="flex h-full min-h-[260px] flex-col rounded-2xl border border-[#E7E5E4] bg-white p-4">
      <div>
        <h4 className="text-[16px] font-semibold tracking-tight text-[#111827]">Sales overview</h4>
        <p className="mt-1 flex items-center gap-1 text-[12px] font-medium text-[#16A34A]">
          <TrendingUp className={`h-3.5 w-3.5 ${trendUp ? "" : "rotate-180 text-[#DC2626]"}`} />
          <span className={trendUp ? "text-[#16A34A]" : "text-[#DC2626]"}>
            {Math.abs(trendPct).toFixed(0)}% {trendUp ? "more" : "less"} in period
          </span>
          <span className="font-normal text-[#9CA3AF]">
            · deliver {deliverRate.toFixed(0)}% · CTM {formatInr(periodCtm || lifetimeCtm)}
          </span>
        </p>
      </div>
      <div className="mt-3 min-h-0 flex-1">
        {chartData.length === 0 ? (
          <div className="flex h-[200px] items-center justify-center text-[13px] text-[#A8A29E]">
            No period volume to chart yet.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="journeyCtmFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#EC4899" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="#EC4899" stopOpacity={0.02} />
                </linearGradient>
                <linearGradient id="journeyOrdersFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#374151" stopOpacity={0.22} />
                  <stop offset="100%" stopColor="#374151" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="#E5E7EB" strokeDasharray="4 6" vertical={false} />
              <XAxis
                dataKey="day"
                tick={{ fill: "#9CA3AF", fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v) => {
                  const d = new Date(String(v));
                  if (Number.isNaN(d.getTime())) return String(v).slice(5);
                  return d.toLocaleString("en-US", { month: "short" });
                }}
              />
              <YAxis
                tick={{ fill: "#9CA3AF", fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                width={36}
              />
              <Tooltip
                contentStyle={{
                  background: "#111827",
                  border: "none",
                  borderRadius: 10,
                  fontSize: 12,
                  color: "#F9FAFB",
                }}
                formatter={(value, name) => [
                  name === "ctm" ? formatInr(Number(value)) : formatCount(Number(value)),
                  name === "ctm" ? "CTM" : "Orders",
                ]}
                labelFormatter={(label) => {
                  const d = new Date(String(label));
                  return Number.isNaN(d.getTime()) ? String(label) : formatDateTime(d.toISOString());
                }}
              />
              <Area
                type="monotone"
                dataKey="orders"
                name="orders"
                stroke="#374151"
                strokeWidth={2.5}
                fill="url(#journeyOrdersFill)"
                dot={false}
                activeDot={{ r: 4 }}
              />
              <Area
                type="monotone"
                dataKey="ctm"
                name="ctm"
                stroke="#EC4899"
                strokeWidth={2.5}
                fill="url(#journeyCtmFill)"
                dot={false}
                activeDot={{ r: 4 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}

export function FleetMerchantsPage() {
  const { data, loading, error, reload, period } = useCoreData<MerchantsData>("/api/merchants");
  const searchParams = useSearchParams();
  const router = useRouter();
  const { userId } = useDashboardIdentity();
  const [q, setQ] = useState("");
  const [segment, setSegment] = useState<Segment>("ALL");
  const urlStore = searchParams.get("store");
  const [selectedId, setSelectedId] = useState<string | null>(urlStore);
  const [detail, setDetail] = useState<MerchantDetailData | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [historyOpen, setHistoryOpen] = useState(false);
  const [ratingsOpen, setRatingsOpen] = useState(false);
  const [payoutsOpen, setPayoutsOpen] = useState(false);
  const [pulseOrderId, setPulseOrderId] = useState<number | null>(null);
  const statsRange = periodToRange(period);

  function setStatsRange(next: StatsRange) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("period", RANGE_TO_PERIOD[next]);
    router.replace(`/merchants?${params.toString()}`);
  }

  function selectStore(id: string) {
    setSelectedId(id);
    const params = new URLSearchParams(searchParams.toString());
    if (params.get("store") === id) return;
    params.set("store", id);
    router.replace(`/merchants?${params.toString()}`, { scroll: false });
  }

  const stores = useMemo(() => {
    if (!data) return [];
    let list = [...data.recent];
    if (segment === "LIVE") list = list.filter((s) => s.live);
    if (segment === "ACCEPTING") list = list.filter((s) => s.accepting);
    if (segment === "NEW") {
      const from = Date.now() - 30 * 24 * 60 * 60 * 1000;
      list = list
        .filter((s) => new Date(s.createdAt).getTime() >= from)
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    }
    const needle = q.trim().toLowerCase();
    if (!needle) return list;
    return list.filter((s) =>
      [s.name, s.storeId, s.city, s.state, s.type, s.ownerName, s.phone, s.status]
        .join(" ")
        .toLowerCase()
        .includes(needle)
    );
  }, [data, q, segment]);

  const allStores = data?.recent ?? [];
  const allStoreIdsKey = useMemo(() => allStores.map((s) => s.storeId).join("|"), [allStores]);

  const firstStoreId = useMemo(() => {
    if (!allStores.length) return null;
    return allStores[0]?.storeId ?? null;
  }, [allStores]);

  useEffect(() => {
    if (!allStores.length) {
      setSelectedId(null);
      return;
    }
    if (urlStore && allStores.some((s) => s.storeId === urlStore)) {
      setSelectedId(urlStore);
      return;
    }
    const fallback = firstStoreId || allStores[0].storeId;
    setSelectedId(fallback);
    const params = new URLSearchParams(searchParams.toString());
    if (params.get("store") !== fallback) {
      params.set("store", fallback);
      router.replace(`/merchants?${params.toString()}`, { scroll: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allStoreIdsKey, urlStore, firstStoreId]);

  useEffect(() => {
    setHistoryOpen(false);
    setRatingsOpen(false);
    setPayoutsOpen(false);
  }, [selectedId]);

  useEffect(() => {
    if (selectedId == null) {
      setDetail(null);
      return;
    }
    let cancelled = false;
    setDetailError(null);
    (async () => {
      try {
        const params = new URLSearchParams(searchParams.toString());
        if (!params.get("period")) params.set("period", period);
        const res = await fetch(`/api/merchants/${encodeURIComponent(selectedId)}?${params}`, {
          credentials: "include",
          cache: "no-store",
          headers: userId ? { "x-coredash-user": userId } : undefined,
        });
        const json = (await res.json()) as {
          success?: boolean;
          data?: MerchantDetailData;
          error?: string;
        };
        if (!res.ok || !json.success || !json.data) {
          throw new Error(json.error || "Failed to load store");
        }
        if (!cancelled) setDetail(json.data);
      } catch (err) {
        if (!cancelled) {
          setDetail(null);
          setDetailError(err instanceof Error ? err.message : "Failed to load store");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedId, searchParams, userId, period]);

  const groups = useMemo(() => {
    const selectedStore =
      (selectedId ? stores.find((s) => s.storeId === selectedId) : null) ||
      (selectedId ? allStores.find((s) => s.storeId === selectedId) : null) ||
      null;
    const rest = selectedId ? stores.filter((s) => s.storeId !== selectedId) : stores;
    const map = new Map<string, StoreRow[]>();
    for (const s of rest) {
      const typeKey = prettyType(s.type).toUpperCase();
      if (!map.has(typeKey)) map.set(typeKey, []);
      map.get(typeKey)!.push(s);
    }
    const keys = Array.from(map.keys()).sort((a, b) => a.localeCompare(b));
    const result: Array<{ key: string; items: StoreRow[] }> = [];
    if (selectedStore) result.push({ key: "OPEN", items: [selectedStore] });
    for (const k of keys) result.push({ key: k, items: map.get(k)! });
    return result;
  }, [allStores, stores, selectedId]);

  const allOrders = detail?.orderHistory ?? [];

  if (loading) return <LoadingGrid />;
  if (error || !data) return <ErrorState message={error || "Failed"} onRetry={reload} />;

  const selected =
    stores.find((s) => s.storeId === selectedId) ??
    allStores.find((s) => s.storeId === selectedId) ??
    null;
  const store = detail?.store;
  const active = detail?.activeOrder ?? null;
  const previewOrders = allOrders.slice(0, 8);
  const deliverRate =
    store && store.lifetimeOrders > 0 ? (store.lifetimeDelivered / store.lifetimeOrders) * 100 : 0;
  const cancelRate =
    store && store.lifetimeOrders > 0 ? (store.lifetimeCancelled / store.lifetimeOrders) * 100 : 0;

  return (
    <div className="flex h-dvh min-h-[640px] overflow-hidden bg-[#F5F6F8]">
      <aside className="flex w-[340px] shrink-0 flex-col border-r border-[#E5E7EB] bg-white">
        <div className="border-b border-[#EEF0F4] p-4">
          <div className="flex items-center gap-2">
            <div className="flex min-w-0 flex-1 items-center gap-2 rounded-xl border border-[#E5E7EB] bg-[#F9FAFB] px-3 py-2.5">
              <Search className="h-4 w-4 shrink-0 text-[#9CA3AF]" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search store, city, type, ID…"
                className="min-w-0 w-full bg-transparent text-[13px] text-[#111827] outline-none placeholder:text-[#9CA3AF]"
              />
            </div>
            <span className="shrink-0 rounded-full bg-[#EEF2FF] px-2.5 py-1 text-[11px] font-semibold text-[#4F46E5]">
              TOTAL {formatCount(data.stats.total)}
            </span>
          </div>
          <div className="mt-3">
            <SlidingPillToggle
              options={["ALL", "LIVE", "ACCEPTING", "NEW"] as const}
              value={segment}
              onChange={setSegment}
              className="w-full justify-between"
            />
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2">
            <MiniStat label="Live" value={formatCount(data.stats.live)} />
            <MiniStat label="Accepting" value={formatCount(data.stats.accepting)} />
            <MiniStat label="New" value={formatCount(data.stats.newInPeriod)} />
          </div>
        </div>

        <div className="cd-scroll min-h-0 flex-1 overflow-y-auto px-2 py-2">
          {groups.map((group) => {
            const isCollapsed = collapsed[group.key];
            return (
              <div key={group.key} className="mb-1">
                <button
                  type="button"
                  onClick={() => setCollapsed((p) => ({ ...p, [group.key]: !p[group.key] }))}
                  className="flex w-full cursor-pointer items-center justify-between rounded-lg px-2.5 py-2 text-left hover:bg-[#F9FAFB]"
                >
                  <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold tracking-[0.08em] text-[#6B7280]">
                    {group.key === "OPEN" ? (
                      <Star className="h-3 w-3 fill-[#4F46E5] text-[#4F46E5]" />
                    ) : null}
                    {group.key === "OPEN" ? "SELECTED" : group.key}
                  </span>
                  <ChevronDown className={`h-3.5 w-3.5 transition ${isCollapsed ? "-rotate-90" : ""}`} />
                </button>
                {!isCollapsed
                  ? group.items.map((s) => {
                      const activeRow = s.storeId === selectedId;
                      return (
                        <button
                          key={`${group.key}-${s.storeId}`}
                          type="button"
                          onClick={() => selectStore(s.storeId)}
                          className={`relative mb-0.5 flex w-full cursor-pointer items-center gap-3 rounded-xl px-2.5 py-2.5 text-left transition ${
                            activeRow ? "bg-[#EEF2FF]" : "hover:bg-[#F9FAFB]"
                          }`}
                        >
                          {activeRow ? (
                            <span className="absolute bottom-2 left-0 top-2 w-[3px] rounded-r-full bg-[#4F46E5]" />
                          ) : null}
                          <StoreAvatar name={s.name} src={s.bannerUrl} size={40} />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-[13px] font-semibold text-[#111827]">{s.name}</p>
                            <p className="truncate text-[11px] text-[#6B7280]">
                              {prettyType(s.type)} · {s.city}
                              {s.orders ? ` · ${formatCount(s.orders)} orders` : ""}
                            </p>
                          </div>
                          <LiveBadge live={s.live} accepting={s.accepting} />
                        </button>
                      );
                    })
                  : null}
              </div>
            );
          })}
          {stores.length === 0 ? (
            <p className="px-3 py-8 text-center text-[13px] text-[#9CA3AF]">No stores match.</p>
          ) : null}
        </div>
      </aside>

      <section className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {!selected ? (
          <div className="flex flex-1 items-center justify-center text-[14px] text-[#6B6894]">
            Select a store
          </div>
        ) : (
          <>
            {/* Light sticky identity header — metrics live in scroll body */}
            <header className="z-10 shrink-0 border-b border-[#E5E7EB] bg-white">
              <div className="flex h-[64px] items-center justify-between gap-3 px-5">
                <div className="flex min-w-0 items-center gap-3">
                  <StoreAvatarWithStatus
                    name={store?.displayName || selected.name}
                    src={store?.bannerUrl || selected.bannerUrl}
                    size={44}
                    live={store?.live ?? selected.live}
                    accepting={store?.accepting ?? selected.accepting}
                  />
                  <div className="min-w-0">
                    <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
                      <h2 className="truncate text-[17px] font-semibold tracking-tight text-[#111827]">
                        {store?.displayName || selected.name}
                      </h2>
                      {(store?.pureVeg || selected.pureVeg) ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-[#DCFCE7] px-2 py-0.5 text-[10px] font-semibold text-[#15803D]">
                          <Leaf className="h-2.5 w-2.5" /> Pure veg
                        </span>
                      ) : null}
                    </div>
                    <p className="truncate text-[12px] font-medium text-[#6B7280]">
                      <span className="font-mono text-[#0F766E]">{store?.storeId || selected.storeId}</span>
                      {" · "}
                      {prettyType(store?.type || selected.type)}
                      {" · "}
                      {store?.ownerName || selected.ownerName}
                      {(store?.phone || selected.phone) && (store?.phone || selected.phone) !== "—"
                        ? ` · ${store?.phone || selected.phone}`
                        : ""}
                    </p>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setRatingsOpen(true)}
                    className="inline-flex cursor-pointer items-center gap-1 rounded-full bg-[#FEF3C7] px-2.5 py-1 text-[11px] font-semibold text-[#B45309] hover:bg-[#FDE68A]"
                  >
                    <Star className="h-3 w-3 fill-current" />
                    {store?.ratingAvg != null ? store.ratingAvg.toFixed(1) : "—"}
                    {store?.ratingCount ? ` (${store.ratingCount})` : ""}
                  </button>
                  <button
                    type="button"
                    onClick={() => setPayoutsOpen(true)}
                    className={`inline-flex cursor-pointer items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                      Number(store?.wallet ?? selected.wallet) < -0.005
                        ? "bg-[#FEF2F2] text-[#B91C1C] hover:bg-[#FEE2E2] ring-1 ring-[#FECACA]"
                        : "bg-[#F3F4F6] text-[#111827] hover:bg-[#E5E7EB]"
                    }`}
                  >
                    <Wallet className="h-3 w-3" />
                    {formatInr(store?.wallet ?? selected.wallet)}
                  </button>
                  <SlidingPillToggle
                    options={["W", "M", "6M", "Y"] as const}
                    value={statsRange}
                    onChange={setStatsRange}
                  />
                  {(store?.phone || selected.phone) && (store?.phone || selected.phone) !== "—" ? (
                    <>
                      <a
                        href={`sms:${store?.phone || selected.phone}`}
                        className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-full bg-[#F3F4F6] text-[#111827] hover:bg-[#E5E7EB]"
                        title="Message"
                      >
                        <MessageCircle className="h-4 w-4" strokeWidth={1.75} />
                      </a>
                      <a
                        href={`tel:${store?.phone || selected.phone}`}
                        className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-full bg-[#F3F4F6] text-[#111827] hover:bg-[#E5E7EB]"
                        title="Call"
                      >
                        <Phone className="h-4 w-4" strokeWidth={1.75} />
                      </a>
                    </>
                  ) : null}
                </div>
              </div>
            </header>

            <div className="cd-scroll min-h-0 flex-1 overflow-y-auto bg-[#F5F5F4]">
              {detailError ? (
                <div className="p-5">
                  <ErrorState message={detailError} onRetry={() => selectStore(selected.storeId)} />
                </div>
              ) : null}

              {/* Stats strip scrolls with main under sticky header */}
              <div className="grid grid-cols-2 gap-px border-b border-[#E7E5E4] bg-[#E7E5E4] sm:grid-cols-4">
                {[
                  {
                    label: "Lifetime orders",
                    value: formatCount(store?.lifetimeOrders ?? selected.orders),
                    sub: `${formatCount(store?.lifetimeDelivered ?? selected.delivered)} ok`,
                    negative: false,
                  },
                  {
                    label: "Current balance",
                    value: formatInr(store?.wallet ?? selected.wallet),
                    sub:
                      Number(store?.wallet ?? selected.wallet) < -0.005
                        ? "Outstanding dues · same as app"
                        : `Available · same as app / partner`,
                    negative: Number(store?.wallet ?? selected.wallet) < -0.005,
                  },
                  {
                    label: "Commission",
                    value: formatInr(store?.lifetimeCommission ?? selected.commission),
                    sub: `${cancelRate.toFixed(0)}% cancel`,
                    negative: false,
                  },
                  {
                    label: "Deliver rate",
                    value: `${deliverRate.toFixed(0)}%`,
                    sub: store?.lastActivityAt
                      ? `Active ${formatDateTime(store.lastActivityAt)}`
                      : "No activity",
                    negative: false,
                  },
                ].map((m) => (
                  <div
                    key={m.label}
                    className={`px-4 py-3 ${m.negative ? "bg-[#FEF2F2]" : "bg-white"}`}
                  >
                    <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#9CA3AF]">
                      {m.label}
                    </p>
                    <p
                      className={`mt-0.5 font-mono text-[18px] font-semibold tabular-nums ${
                        m.negative ? "text-[#B91C1C]" : "text-[#111827]"
                      }`}
                    >
                      {m.value}
                    </p>
                    <p className={`truncate text-[11px] ${m.negative ? "text-[#DC2626]" : "text-[#6B7280]"}`}>
                      {m.sub}
                    </p>
                  </div>
                ))}
              </div>

              {/* Asymmetric ops + feed */}
              <div className="grid min-h-0 gap-0 xl:grid-cols-[1.15fr_0.85fr]">
                <div className="border-r border-[#E7E5E4] bg-[#FAFAF9] px-5 pb-5 pt-10 lg:px-6 lg:pb-6 lg:pt-11">
                  <div className="flex items-end justify-between gap-3">
                    <div>
                      <h3 className="text-[20px] font-semibold tracking-tight text-[#1C1917]">Order pulse</h3>
                      <p className="mt-0.5 text-[12px] text-[#78716C]">Live feed · gross vs net CTM</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setHistoryOpen(true)}
                      className="cursor-pointer text-[12px] font-semibold text-[#0F766E] hover:underline"
                    >
                      Full ledger →
                    </button>
                  </div>

                  {active ? (
                    <button
                      type="button"
                      onClick={() => setPulseOrderId(active.id)}
                      className="mt-5 w-full cursor-pointer border-l-4 border-[#F59E0B] bg-[#FFFBEB] px-4 py-3.5 text-left hover:bg-[#FEF3C7]"
                    >
                      <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#B45309]">
                        Active ticket
                      </p>
                      <p className="mt-1 text-[14px] font-medium text-[#1C1917]">
                        <span className="font-mono font-semibold text-[#0F766E]">{active.code}</span>
                        {" · "}
                        {prettyType(active.type)} · {active.status.replace(/_/g, " ")} ·{" "}
                        {formatInr(active.payable)}
                      </p>
                    </button>
                  ) : null}

                  <div className="mt-5 space-y-3">
                    {previewOrders.length === 0 ? (
                      <p className="py-10 text-center text-[13px] text-[#A8A29E]">No orders yet for this store.</p>
                    ) : (
                      previewOrders.map((o) => (
                        <button
                          type="button"
                          key={o.id}
                          onClick={() => setPulseOrderId(o.id)}
                          className={`grid w-full cursor-pointer grid-cols-[auto_1fr_auto] gap-4 rounded-xl border px-4 py-4 text-left transition-colors hover:border-[#99F6E4] ${
                            o.status.toLowerCase() === "cancelled"
                              ? "border-[#FECACA] bg-[#FEF2F2] hover:bg-[#FEE2E2]"
                              : "border-[#E7E5E4] bg-white hover:bg-[#FAFAF9]"
                          }`}
                        >
                          <div
                            className="mt-1 h-10 w-1.5 rounded-full"
                            style={{ background: statusColor(o.status) }}
                          />
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                              <span className="font-mono text-[13px] font-semibold text-[#0F766E]">
                                {o.code}
                              </span>
                              <span className="text-[11px] capitalize text-[#78716C]">
                                {prettyType(o.type)} · {o.status.replace(/_/g, " ")}
                              </span>
                            </div>
                            <p className="mt-1 truncate text-[12px] leading-relaxed text-[#57534E]">
                              {shortAddress(o.pickup)} → {shortAddress(o.dropoff)}
                            </p>
                          </div>
                          <OrderCtcCell order={o} />
                        </button>
                      ))
                    )}
                  </div>
                </div>

                <aside className="space-y-4 bg-[#E7E5E4]/40 p-5 lg:p-6">
                  <div className="rounded-2xl border border-[#D6D3D1] bg-white p-5">
                    <h4 className="text-[15px] font-semibold text-[#1C1917]">Store dossier</h4>
                    <div className="mt-4 space-y-4 text-[13px]">
                      <div className="flex items-start gap-2 text-[#44403C]">
                        <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-[#0F766E]" />
                        <p className="leading-snug">
                          {store?.address && store.address !== "—"
                            ? store.address
                            : `${store?.city || selected.city}, ${store?.state || selected.state}`}
                        </p>
                      </div>
                      <dl className="grid grid-cols-2 gap-x-3 gap-y-3 border-t border-[#E7E5E4] pt-4">
                        <div>
                          <dt className="text-[10px] uppercase tracking-wide text-[#A8A29E]">City</dt>
                          <dd className="mt-0.5 font-medium text-[#1C1917]">{store?.city || selected.city}</dd>
                        </div>
                        <div>
                          <dt className="text-[10px] uppercase tracking-wide text-[#A8A29E]">Approval</dt>
                          <dd className="mt-0.5 font-medium capitalize text-[#1C1917]">
                            {store?.approval || selected.approval}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-[10px] uppercase tracking-wide text-[#A8A29E]">Prep</dt>
                          <dd className="mt-0.5 font-medium text-[#1C1917]">
                            {store?.prepMinutes != null ? `${store.prepMinutes} min` : "—"}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-[10px] uppercase tracking-wide text-[#A8A29E]">Min order</dt>
                          <dd className="mt-0.5 font-medium text-[#1C1917]">
                            {store?.minOrder != null ? formatInr(store.minOrder) : "—"}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-[10px] uppercase tracking-wide text-[#A8A29E]">Radius</dt>
                          <dd className="mt-0.5 font-medium text-[#1C1917]">
                            {store?.deliveryRadiusKm != null
                              ? `${store.deliveryRadiusKm.toFixed(1)} km`
                              : "—"}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-[10px] uppercase tracking-wide text-[#A8A29E]">Parent</dt>
                          <dd className="mt-0.5 truncate font-medium text-[#1C1917]">{store?.parentName || "—"}</dd>
                        </div>
                      </dl>
                      {store?.cuisines?.length ? (
                        <div className="flex flex-wrap gap-1.5 border-t border-[#E7E5E4] pt-4">
                          {store.cuisines.slice(0, 10).map((c) => (
                            <span
                              key={c}
                              className="rounded-md bg-[#F5F5F4] px-2 py-0.5 text-[11px] font-medium text-[#57534E]"
                            >
                              {c}
                            </span>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  </div>

                  <div className="rounded-2xl border border-[#D6D3D1] bg-white p-5">
                    <h4 className="text-[15px] font-semibold text-[#1C1917]">Period throughput</h4>
                    <p className="mt-0.5 text-[12px] text-[#78716C]">CTM vs commission by day</p>
                    <div className="mt-4 h-[220px] w-full">
                      {(detail?.spendSeries?.length ?? 0) === 0 ? (
                        <div className="flex h-full items-center justify-center rounded-xl border border-[#E7E5E4] bg-[#FAFAF9] text-[13px] text-[#A8A29E]">
                          Quiet period — no delivered volume.
                        </div>
                      ) : (
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={detail?.spendSeries ?? []} barGap={2}>
                            <CartesianGrid stroke="#F5F5F4" vertical={false} />
                            <XAxis
                              dataKey="day"
                              tick={{ fill: "#A8A29E", fontSize: 10 }}
                              axisLine={false}
                              tickLine={false}
                              tickFormatter={(v) => {
                                const d = new Date(String(v));
                                return Number.isNaN(d.getTime())
                                  ? String(v).slice(5)
                                  : `${d.getMonth() + 1}/${d.getDate()}`;
                              }}
                            />
                            <YAxis
                              tick={{ fill: "#A8A29E", fontSize: 10 }}
                              axisLine={false}
                              tickLine={false}
                              tickFormatter={(v) => `₹${v}`}
                            />
                            <Tooltip
                              contentStyle={{
                                background: "#1C1917",
                                border: "none",
                                borderRadius: 10,
                                fontSize: 12,
                                color: "#FAFAF9",
                              }}
                              formatter={(value, name) => [
                                formatInr(Number(value)),
                                name === "ctm" ? "CTM" : "Commission",
                              ]}
                            />
                            <Bar dataKey="ctm" name="ctm" fill="#0F766E" radius={[3, 3, 0, 0]} barSize={12} />
                            <Bar
                              dataKey="commission"
                              name="commission"
                              fill="#F59E0B"
                              radius={[3, 3, 0, 0]}
                              barSize={8}
                            />
                          </BarChart>
                        </ResponsiveContainer>
                      )}
                    </div>
                  </div>

                  {(detail?.statusMix?.length ?? 0) > 0 ? (
                    <div className="rounded-2xl border border-[#D6D3D1] bg-white p-5">
                      <h4 className="text-[15px] font-semibold text-[#1C1917]">Status mix</h4>
                      <div className="mt-4 space-y-3">
                        {(detail?.statusMix ?? []).slice(0, 6).map((m) => {
                          const total = store?.lifetimeOrders || 1;
                          const pct = (m.orders / total) * 100;
                          return (
                            <div key={m.status}>
                              <div className="mb-1.5 flex justify-between text-[12px]">
                                <span className="capitalize text-[#57534E]">{m.status.replace(/_/g, " ")}</span>
                                <span className="font-mono tabular-nums text-[#78716C]">
                                  {formatCount(m.orders)} · {pct.toFixed(0)}%
                                </span>
                              </div>
                              <div className="h-1.5 overflow-hidden rounded-full bg-[#F5F5F4]">
                                <div
                                  className="h-full rounded-full"
                                  style={{
                                    width: `${Math.max(pct, m.orders ? 3 : 0)}%`,
                                    background: statusColor(m.status),
                                  }}
                                />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ) : null}
                </aside>
              </div>

              {/* Full-width Order journey — rail left + Sales Overview–style chart right */}
              <div className="border-t border-[#E7E5E4] bg-white p-5 lg:p-6">
                <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
                  <div>
                    <h3 className="text-[20px] font-semibold tracking-tight text-[#1C1917]">Order journey</h3>
                    <p className="mt-0.5 text-[12px] text-[#78716C]">Volume split · period trend</p>
                  </div>
                </div>
                <div className="grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
                  <OrderJourneyRail
                    total={store?.lifetimeOrders ?? selected.orders}
                    delivered={store?.lifetimeDelivered ?? selected.delivered}
                    cancelled={store?.lifetimeCancelled ?? selected.cancelled}
                  />
                  <OrderJourneyTrendChart
                    series={detail?.spendSeries ?? []}
                    deliverRate={deliverRate}
                    periodCtm={store?.periodCtm ?? 0}
                    lifetimeCtm={store?.lifetimeCtm ?? selected.gmv}
                  />
                </div>
              </div>
            </div>
          </>
        )}
      </section>

      {historyOpen && selected ? (
        <MerchantWalletLedgerSheet
          storeKey={selected.storeId}
          storeName={selected.name}
          onClose={() => setHistoryOpen(false)}
        />
      ) : null}

      {ratingsOpen ? (
        <SideSheet
          title="Ratings & reviews"
          subtitle={`${selected?.name} · ${formatCount(detail?.ratings?.length ?? 0)}`}
          onClose={() => setRatingsOpen(false)}
        >
          <RatingsList items={detail?.ratings ?? []} />
        </SideSheet>
      ) : null}

      {pulseOrderId != null ? (
        <OrderPulseSheet orderId={pulseOrderId} userId={userId} onClose={() => setPulseOrderId(null)} />
      ) : null}

      {payoutsOpen ? (
        <SideSheet
          title="Wallet & payouts"
          subtitle={`${selected?.name} · available ${formatInr(store?.wallet ?? 0)}`}
          onClose={() => setPayoutsOpen(false)}
        >
          <div className="mb-4 grid grid-cols-2 gap-2">
            <MiniStat
              label="Available"
              value={formatInr(store?.wallet ?? 0)}
              negative={Number(store?.wallet ?? 0) < -0.005}
            />
            <MiniStat label="Pending" value={formatInr(store?.walletPending ?? 0)} />
            <MiniStat label="Earned" value={formatInr(store?.totalEarned ?? 0)} />
            <MiniStat label="Withdrawn" value={formatInr(store?.totalWithdrawn ?? 0)} />
          </div>
          <PayoutsList items={detail?.payouts ?? []} />
        </SideSheet>
      ) : null}
    </div>
  );
}

type PulseDetail = {
  id: number;
  code: string;
  status: string;
  type: string;
  createdAt: string;
  pickup: string;
  dropoff: string;
  customerName: string;
  customerPhone: string;
  customerAddress: string;
  items: Array<{
    name: string;
    variant: string;
    qty: number;
    unit: number;
    total: number;
    addons: string;
  }>;
  itemCount: number;
  bill: {
    items: number;
    packaging: number;
    delivery: number;
    gst: number;
    discount: number;
    tip: number;
    donation: number;
    gatiCash: number;
    ctc: number;
    ctm: number;
    netCtm: number;
    commission: number;
  };
};

function BillLine({ label, value, strong, muted }: { label: string; value: number; strong?: boolean; muted?: boolean }) {
  if (!strong && Math.abs(value) < 0.005) return null;
  return (
    <div className={`flex justify-between gap-3 ${strong ? "text-[14px] font-semibold text-[#1C1917]" : "text-[13px] text-[#57534E]"} ${muted ? "text-[#A8A29E]" : ""}`}>
      <span>{label}</span>
      <span className="tabular-nums">{formatInr(value)}</span>
    </div>
  );
}

function OrderPulseSheet({
  orderId,
  userId,
  onClose,
}: {
  orderId: number;
  userId: string;
  onClose: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [detail, setDetail] = useState<PulseDetail | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const res = await fetch(`/api/orders/${encodeURIComponent(String(orderId))}`, {
          credentials: "include",
          cache: "no-store",
          headers: userId ? { "x-coredash-user": userId } : undefined,
        });
        const json = (await res.json()) as { success?: boolean; data?: PulseDetail; error?: string };
        if (!res.ok || !json.success || !json.data) {
          throw new Error(json.error || "Failed to load order");
        }
        if (!cancelled) setDetail(json.data);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load order");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [orderId, userId]);

  return (
    <SideSheet
      title={detail?.code || "Order"}
      subtitle={
        detail
          ? `${prettyType(detail.type)} · ${detail.status.replace(/_/g, " ")} · ${formatDateTime(detail.createdAt)}`
          : "Loading details…"
      }
      onClose={onClose}
    >
      {loading ? (
        <div className="space-y-3">
          <div className="h-20 animate-pulse rounded-xl bg-[#F5F5F4]" />
          <div className="h-40 animate-pulse rounded-xl bg-[#F5F5F4]" />
          <div className="h-32 animate-pulse rounded-xl bg-[#F5F5F4]" />
        </div>
      ) : error || !detail ? (
        <p className="text-[13px] text-[#B91C1C]">{error || "Order not found"}</p>
      ) : (
        <div className="space-y-5">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-[#A8A29E]">Customer</p>
            <p className="mt-1 text-[16px] font-semibold text-[#1C1917]">{detail.customerName}</p>
            <p className="mt-0.5 text-[13px] text-[#57534E]">{detail.customerPhone}</p>
            <p className="mt-2 text-[13px] leading-snug text-[#44403C]">{detail.customerAddress}</p>
          </div>

          <div>
            <div className="mb-2 flex items-baseline justify-between">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-[#A8A29E]">Items</p>
              <p className="text-[12px] text-[#78716C]">{formatCount(detail.itemCount)} total</p>
            </div>
            {detail.items.length === 0 ? (
              <p className="rounded-xl border border-[#E7E5E4] bg-[#FAFAF9] px-3 py-4 text-[13px] text-[#A8A29E]">
                No line items on this order.
              </p>
            ) : (
              <ul className="divide-y divide-[#F5F5F4] overflow-hidden rounded-xl border border-[#E7E5E4]">
                {detail.items.map((it, i) => (
                  <li key={`${it.name}-${i}`} className="flex items-start justify-between gap-3 px-3 py-2.5">
                    <div className="min-w-0">
                      <p className="text-[13px] font-medium text-[#1C1917]">
                        <span className="tabular-nums text-[#0F766E]">{it.qty}×</span> {it.name}
                      </p>
                      {it.variant ? (
                        <p className="text-[11px] text-[#78716C]">{it.variant}</p>
                      ) : null}
                      {it.addons ? (
                        <p className="text-[11px] text-[#A8A29E]">{it.addons}</p>
                      ) : null}
                    </div>
                    <p className="shrink-0 tabular-nums text-[13px] font-medium text-[#1C1917]">
                      {formatInr(it.total || it.unit * it.qty)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="rounded-xl border border-[#E7E5E4] bg-[#FAFAF9] p-4">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-[#A8A29E]">Bill</p>
            <div className="mt-3 space-y-2">
              <BillLine label="Items" value={detail.bill.items} />
              <BillLine label="Packaging" value={detail.bill.packaging} />
              <BillLine label="Delivery" value={detail.bill.delivery} />
              <BillLine label="GST" value={detail.bill.gst} />
              <BillLine label="Discount" value={-Math.abs(detail.bill.discount)} />
              <BillLine label="Tip" value={detail.bill.tip} />
              <BillLine label="Donation" value={detail.bill.donation} />
              <BillLine label="GatiCash" value={detail.bill.gatiCash} />
              <div className="border-t border-[#E7E5E4] pt-2">
                <BillLine label="CTC paid" value={detail.bill.ctc} strong />
              </div>
              <BillLine label="CTM net" value={detail.bill.netCtm || detail.bill.ctm} />
              <BillLine label="Commission" value={detail.bill.commission} muted />
            </div>
          </div>

          <a
            href={orderDetailHref(detail.code)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex text-[13px] font-semibold text-[#0F766E] hover:underline"
          >
            Open in Ops →
          </a>
        </div>
      )}
    </SideSheet>
  );
}

function SideSheet({
  title,
  subtitle,
  onClose,
  children,
}: {
  title: string;
  subtitle: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-[70] flex justify-end bg-black/35" onClick={onClose}>
      <aside
        className="flex h-full w-full max-w-md flex-col bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="flex items-center justify-between border-b border-[#E5E7EB] px-5 py-4">
          <div>
            <h3 className="text-[17px] font-semibold text-[#111827]">{title}</h3>
            <p className="text-[12px] text-[#6B7280]">{subtitle}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-full bg-[#F3F4F6] text-[#111827] hover:bg-[#E5E7EB]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="cd-scroll min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
      </aside>
    </div>
  );
}

function MerchantWalletLedgerSheet({
  storeKey,
  storeName,
  onClose,
}: {
  storeKey: string;
  storeName: string;
  onClose: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [balance, setBalance] = useState(0);
  const [reloadKey, setReloadKey] = useState(0);
  const [query, setQuery] = useState("");
  const [entries, setEntries] = useState<
    Array<{
      id: string;
      title: string;
      amount: number;
      balanceAfter: number | null;
      createdAt: string;
      direction: string;
      formattedOrderId?: string | null;
    }>
  >([]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const res = await fetch(
          `/api/merchants/${encodeURIComponent(storeKey)}/wallet/ledger?limit=80`,
          { cache: "no-store" }
        );
        const json = (await res.json()) as {
          success?: boolean;
          error?: string;
          data?: {
            balance?: number;
            entries?: Array<{
              id: string;
              title: string;
              amount: number;
              balanceAfter: number | null;
              createdAt: string;
              direction: string;
              formattedOrderId?: string | null;
            }>;
          };
        };
        if (!res.ok || !json.success || !json.data) {
          throw new Error(json.error || "Failed to load ledger");
        }
        if (cancelled) return;
        setBalance(Number(json.data.balance ?? 0));
        setEntries(json.data.entries ?? []);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load ledger");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [storeKey, reloadKey]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return entries;
    return entries.filter((e) =>
      [e.title, e.formattedOrderId, e.direction, e.amount].join(" ").toLowerCase().includes(needle)
    );
  }, [entries, query]);

  const balanceNeg = balance < -0.005;

  return (
    <div className="fixed inset-0 z-[70] flex justify-end bg-black/35" onClick={onClose}>
      <aside
        className="flex h-full w-full max-w-md flex-col bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="flex items-center justify-between border-b border-[#E5E7EB] px-5 py-4">
          <div>
            <h3 className="text-[17px] font-semibold text-[#111827]">Full ledger</h3>
            <p className="text-[12px] text-[#6B7280]">
              {storeName} ·{" "}
              <span className={balanceNeg ? "font-semibold text-[#B91C1C]" : undefined}>
                {formatInr(balance)}
              </span>
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-full bg-[#F3F4F6] text-[#111827] hover:bg-[#E5E7EB]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="cd-scroll min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <div className="mb-3 flex items-center gap-2 rounded-xl border border-[#E5E7EB] bg-[#F9FAFB] px-3 py-2.5">
            <Search className="h-4 w-4 text-[#9CA3AF]" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search description, order, type…"
              className="w-full bg-transparent text-[13px] text-[#111827] outline-none placeholder:text-[#9CA3AF]"
            />
          </div>
          {loading ? (
            <p className="py-10 text-center text-[13px] text-[#9CA3AF]">Loading ledger…</p>
          ) : error ? (
            <div className="space-y-3">
              <p className="rounded-xl bg-[#FEF2F2] px-3 py-2 text-[12px] text-[#B91C1C]">{error}</p>
              <button
                type="button"
                onClick={() => setReloadKey((n) => n + 1)}
                className="cursor-pointer rounded-xl bg-[#F3F4F6] px-3 py-2 text-[12px] font-semibold text-[#111827] hover:bg-[#E5E7EB]"
              >
                Retry
              </button>
            </div>
          ) : filtered.length === 0 ? (
            <p className="py-10 text-center text-[13px] text-[#9CA3AF]">No ledger entries yet.</p>
          ) : (
            <ul className="space-y-2">
              {filtered.map((tx) => {
                const credit = tx.amount >= 0;
                return (
                  <li
                    key={tx.id}
                    className="flex items-start gap-3 rounded-xl border border-[#EEF0F4] bg-[#F9FAFB] px-3 py-3"
                  >
                    <span
                      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
                        credit ? "bg-[#DCFCE7] text-[#16A34A]" : "bg-[#FEE2E2] text-[#DC2626]"
                      }`}
                    >
                      <Wallet className="h-4 w-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-semibold text-[#111827]">{tx.title}</p>
                      {tx.formattedOrderId ? (
                        <p className="mt-0.5 truncate text-[11px] font-semibold tracking-wide text-[#4B5563]">
                          {tx.formattedOrderId}
                        </p>
                      ) : null}
                      <p className="mt-0.5 text-[11px] text-[#9CA3AF]">{formatDateTime(tx.createdAt)}</p>
                      {tx.balanceAfter != null ? (
                        <p
                          className={`mt-0.5 text-[11px] ${
                            Number(tx.balanceAfter) < -0.005 ? "text-[#B91C1C]" : "text-[#6B7280]"
                          }`}
                        >
                          Balance {formatInr(tx.balanceAfter)}
                        </p>
                      ) : null}
                    </div>
                    <p
                      className={`shrink-0 text-[13px] font-semibold ${
                        credit ? "text-[#16A34A]" : "text-[#DC2626]"
                      }`}
                    >
                      {credit ? "+" : "−"} {formatInr(Math.abs(tx.amount))}
                    </p>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </aside>
    </div>
  );
}

function OrderCtcCell({ order, compact = false }: { order: OrderRow; compact?: boolean }) {
  const paid = Number(order.payable) || 0;
  const gross = Number(order.grossCtm ?? order.ctm) || 0;
  const commission = Number(order.commission) || 0;
  const netRaw = Number(order.netCtm) || 0;
  const net = netRaw > 0.005 ? netRaw : Math.max(0, gross - commission);
  const compensation = Number(order.compensation) || 0;
  const penalty = Number(order.penalty) || 0;
  const headline = paid > 0.005 ? paid : gross;

  return (
    <div className={`shrink-0 text-right ${compact ? "min-w-[88px]" : "min-w-[104px]"}`}>
      {headline > 0.005 ? (
        <p className="font-mono text-[13px] font-semibold tabular-nums text-[#1C1917]">
          {formatInr(headline)}
        </p>
      ) : null}
      {net > 0.005 ? (
        <p className="text-[10px] font-semibold uppercase tracking-wide text-[#0F766E]">
          CTM net {formatInr(net)}
        </p>
      ) : null}
      {gross > 0.005 && Math.abs(gross - headline) > 0.005 ? (
        <p className="text-[10px] tabular-nums text-[#A8A29E]">gross {formatInr(gross)}</p>
      ) : null}
      {compensation > 0.005 ? (
        <p className="text-[10px] tabular-nums text-[#15803D]">+comp {formatInr(compensation)}</p>
      ) : null}
      {penalty > 0.005 ? (
        <p className="text-[10px] tabular-nums text-[#B91C1C]">−pen {formatInr(penalty)}</p>
      ) : null}
    </div>
  );
}

function OrderHistoryList({ items }: { items: OrderRow[] }) {
  if (items.length === 0) return <p className="text-[13px] text-[#9CA3AF]">No orders yet.</p>;
  return (
    <div className="space-y-3">
      {items.map((o) => (
        <div
          key={o.id}
          className={`flex gap-3 rounded-xl px-2 py-2 ${
            o.status.toLowerCase() === "cancelled" ? "bg-[#FEF2F2]" : ""
          }`}
        >
          <div className="mt-1.5 h-2 w-2 shrink-0 rounded-full" style={{ background: statusColor(o.status) }} />
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <a
                href={orderDetailHref(o.code)}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[13px] font-semibold text-[#7C3AED] hover:underline"
              >
                {o.code}
              </a>
              <OrderCtcCell order={o} compact />
            </div>
            <p className="truncate text-[13px] font-medium text-[#111827]">
              {shortAddress(o.pickup)} → {shortAddress(o.dropoff)}
            </p>
            <p className="mt-0.5 text-[11px] capitalize text-[#9CA3AF]">
              {o.status.replace(/_/g, " ")} · {formatDateTime(o.createdAt)}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}

function RatingsList({ items }: { items: MerchantDetailData["ratings"] }) {
  if (items.length === 0) return <p className="text-[13px] text-[#9CA3AF]">No ratings yet.</p>;
  return (
    <div className="space-y-3">
      {items.map((r) => (
        <div key={r.id} className="rounded-xl border border-[#EEF0F4] bg-[#F9FAFB] px-3.5 py-3">
          <div className="flex items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1 text-[13px] font-semibold text-[#B45309]">
              <Star className="h-3.5 w-3.5 fill-current" />
              {r.rating.toFixed(1)}
            </span>
            <span className="text-[11px] text-[#9CA3AF]">{formatDateTime(r.createdAt)}</span>
          </div>
          {r.title ? <p className="mt-1 text-[13px] font-medium text-[#111827]">{r.title}</p> : null}
          {r.text ? <p className="mt-1 text-[13px] leading-snug text-[#374151]">{r.text}</p> : null}
          <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-[#6B7280]">
            {r.food != null ? <span>Food {r.food.toFixed(1)}</span> : null}
            {r.service != null ? <span>Service {r.service.toFixed(1)}</span> : null}
            {r.packaging != null ? <span>Packaging {r.packaging.toFixed(1)}</span> : null}
          </div>
        </div>
      ))}
    </div>
  );
}

function PayoutsList({ items }: { items: MerchantDetailData["payouts"] }) {
  if (items.length === 0) return <p className="text-[13px] text-[#9CA3AF]">No payout requests yet.</p>;
  return (
    <div className="space-y-3">
      {items.map((p) => (
        <div
          key={p.id}
          className="flex items-center justify-between gap-3 rounded-xl border border-[#EEF0F4] bg-[#F9FAFB] px-3.5 py-3"
        >
          <div>
            <p className="text-[13px] font-semibold text-[#111827]">{formatInr(p.net)}</p>
            <p className="text-[11px] capitalize text-[#6B7280]">
              {p.status.replace(/_/g, " ")} · {formatDateTime(p.createdAt)}
            </p>
          </div>
          <span className="text-[12px] tabular-nums text-[#9CA3AF]">{formatInr(p.amount)}</span>
        </div>
      ))}
    </div>
  );
}

function MiniStat({
  label,
  value,
  negative = false,
}: {
  label: string;
  value: string;
  negative?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border px-2.5 py-2 ${
        negative ? "border-[#FECACA] bg-[#FEF2F2]" : "border-[#EEF0F4] bg-[#F9FAFB]"
      }`}
    >
      <p className="text-[10px] uppercase tracking-wide text-[#9CA3AF]">{label}</p>
      <p
        className={`mt-0.5 truncate text-[12px] font-semibold ${
          negative ? "text-[#B91C1C]" : "text-[#111827]"
        }`}
      >
        {value}
      </p>
    </div>
  );
}
