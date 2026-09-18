"use client";

import { useMemo, useState, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import {
  Area,
  AreaChart,
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  ArrowUpRight,
  Bike,
  CheckCircle2,
  Clock3,
  Download,
  ExternalLink,
  IndianRupee,
  MoreVertical,
  Radio,
  Search,
  ShoppingBag,
  Store,
  Timer,
  TrendingUp,
  Users,
  Wallet,
  X,
  XCircle,
} from "lucide-react";
import { parseOrdersTab } from "@/components/layout/Topbar";
import { useCoreData } from "@/lib/hooks/useCoreData";
import { formatCount, formatDateTime, formatInr, formatPct, prettyLabel } from "@/lib/format";
import { orderDetailHref } from "@/lib/order-links";
import { chartColors, palette } from "@/lib/theme";
import { ErrorState, LoadingGrid } from "@/components/ui/Primitives";
import type { OrdersData } from "@/lib/data-types";

type OrderRow = OrdersData["recent"][number];

const LIVE_STATUSES = new Set([
  "assigned",
  "accepted",
  "reached_store",
  "picked_up",
  "in_transit",
  "created",
  "dispatch_ready",
  "dispatched",
  "bill_ready",
  "payment_done",
  "pymt_assign_rx",
]);

const CATEGORY_COLORS: Record<string, string> = {
  food: "#4B49AC",
  grocery: "#F5A524",
  mart: "#F5A524",
  pharmacy: "#7DA0FA",
  ride: "#98BDFF",
  person_ride: "#98BDFF",
  parcel: "#7978E9",
  courier: "#7978E9",
};

const STATUS_PILL: Record<string, string> = {
  delivered: "bg-[#E8F8EF] text-[#1F9D57]",
  cancelled: "bg-[#FDECEC] text-[#D64545]",
  created: "bg-[#EEF0FF] text-[#4B49AC]",
  assigned: "bg-[#EEF0FF] text-[#4B49AC]",
  accepted: "bg-[#FFF4E5] text-[#C77D12]",
  reached_store: "bg-[#EAF3FF] text-[#2F6FED]",
  picked_up: "bg-[#EAF3FF] text-[#2F6FED]",
  in_transit: "bg-[#EAF3FF] text-[#2F6FED]",
};

function categoryColor(type: string) {
  return CATEGORY_COLORS[type.toLowerCase()] || palette.lavender;
}

function statusPillClass(status: string) {
  return STATUS_PILL[status.toLowerCase()] || "bg-[#F4F6FF] text-[#6B6894]";
}

function deltaLabel(delta: number | null | undefined) {
  if (delta == null || !Number.isFinite(delta)) return null;
  const up = delta >= 0;
  return (
    <span className={`inline-flex items-center gap-0.5 text-[12px] font-semibold ${up ? "text-[#1F9D57]" : "text-[#D64545]"}`}>
      {up ? "↑" : "↓"} {Math.abs(delta).toFixed(0)}% vs prior
    </span>
  );
}

const tooltipStyle = {
  background: "#1E1C4A",
  border: "none",
  borderRadius: 12,
  fontSize: 12,
  color: "#fff",
  boxShadow: "0 12px 32px rgba(30,28,74,0.28)",
};

const PAGE_SIZE = 10;

export function OrdersAnalyticsPage() {
  const searchParams = useSearchParams();
  const tab = parseOrdersTab(searchParams.get("tab"));
  const { data, loading, error, reload } = useCoreData<OrdersData>("/api/orders");

  if (loading) return <LoadingGrid count={8} />;
  if (error || !data) return <ErrorState message={error || "Failed"} onRetry={reload} />;

  return (
    <div className="space-y-5 pb-2">
      {tab === "analytics" ? <AnalyticsView data={data} /> : <HistoryView data={data} />}
    </div>
  );
}

function AnalyticsView({ data }: { data: OrdersData }) {
  const k = data.kpis;
  const c = data.customers;
  const d = data.delivery;
  const totalType = data.byType.reduce((a, r) => a + r.orders, 0) || 1;
  const totalStatus = data.byStatus.reduce((a, r) => a + r.orders, 0) || 1;

  const statusBuckets = useMemo(() => {
    let delivered = 0;
    let cancelled = 0;
    let preparing = 0;
    let out = 0;
    let other = 0;
    for (const s of data.byStatus) {
      const st = s.status.toLowerCase();
      if (st === "delivered") delivered += s.orders;
      else if (st === "cancelled") cancelled += s.orders;
      else if (["created", "accepted", "bill_ready", "payment_done", "dispatch_ready"].includes(st))
        preparing += s.orders;
      else if (["assigned", "reached_store", "picked_up", "in_transit", "dispatched"].includes(st))
        out += s.orders;
      else other += s.orders;
    }
    return [
      { name: "Delivered", value: delivered, color: "#2BB673" },
      { name: "Preparing", value: preparing, color: "#F5A524" },
      { name: "Out for Delivery", value: out, color: "#7DA0FA" },
      { name: "Cancelled", value: cancelled, color: "#F3797E" },
      ...(other ? [{ name: "Other", value: other, color: "#6B6894" }] : []),
    ].filter((x) => x.value > 0);
  }, [data.byStatus]);

  const mid = Math.floor(data.trend.length / 2);
  const firstHalf = data.trend.slice(0, mid);
  const secondHalf = data.trend.slice(mid);
  const sumOrders = (rows: typeof data.trend) => rows.reduce((a, r) => a + r.orders, 0);
  const firstVol = sumOrders(firstHalf);
  const secondVol = sumOrders(secondHalf);
  const volTrend =
    firstVol > 0 ? ((secondVol - firstVol) / firstVol) * 100 : secondVol > 0 ? 100 : 0;

  const peakHour = data.hourly.reduce(
    (best, cur) => (cur.orders > best.orders ? cur : best),
    { hour: 0, orders: 0 }
  );

  return (
    <div className="space-y-5">
      {/* Hero KPI band */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <HeroKpi
          label="Total Orders"
          value={formatCount(k.orders)}
          sub={`${formatCount(k.live)} live now`}
          delta={k.ordersDelta}
          icon={ShoppingBag}
          accent="#4B49AC"
          wash="from-[#4B49AC]/12 to-transparent"
        />
        <HeroKpi
          label="Total Revenue"
          value={formatInr(k.gmv, true)}
          sub={`Tips ${formatInr(k.tips)}`}
          delta={k.gmvDelta}
          icon={IndianRupee}
          accent="#C77D12"
          wash="from-[#F5A524]/16 to-transparent"
        />
        <HeroKpi
          label="Average Order Value"
          value={formatInr(k.aov)}
          sub={`Completion ${formatPct(k.completionRate, 0)}`}
          delta={k.aovDelta}
          icon={Wallet}
          accent="#2F6FED"
          wash="from-[#7DA0FA]/18 to-transparent"
        />
        <HeroKpi
          label="New Customers"
          value={formatCount(k.newCustomers)}
          sub={`${formatCount(c.total)} total`}
          delta={k.newCustomersDelta}
          icon={Users}
          accent="#7978E9"
          wash="from-[#7978E9]/16 to-transparent"
        />
      </div>

      {/* Main chart + category */}
      <div className="grid gap-4 xl:grid-cols-[1.6fr_1fr]">
        <Panel
          title="Orders & Revenue Trend"
          subtitle="Daily volume with delivered GMV overlay"
          right={
            <span
              className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                volTrend >= 0 ? "bg-[#E8F8EF] text-[#1F9D57]" : "bg-[#FDECEC] text-[#D64545]"
              }`}
            >
              <TrendingUp className={`h-3 w-3 ${volTrend >= 0 ? "" : "rotate-180"}`} />
              {Math.abs(volTrend).toFixed(0)}% second-half
            </span>
          }
        >
          <div className="mb-3 flex flex-wrap gap-4 text-[11px] font-medium text-[#6B6894]">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm bg-gradient-to-b from-[#4B49AC] to-[#7DA0FA]" />
              Orders
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-[#2BB673]" />
              Revenue
            </span>
          </div>
          <div className="h-[300px]">
            {data.trend.length === 0 ? (
              <EmptyChart label="No trend in this period" />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={data.trend} margin={{ top: 10, right: 8, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="ordBarFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#4B49AC" stopOpacity={1} />
                      <stop offset="100%" stopColor="#98BDFF" stopOpacity={0.85} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="#E4E7F7" strokeDasharray="4 6" vertical={false} />
                  <XAxis
                    dataKey="day"
                    tick={{ fill: "#8B89B3", fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v) => shortDay(v)}
                  />
                  <YAxis
                    yAxisId="l"
                    tick={{ fill: "#8B89B3", fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                    width={34}
                    allowDecimals={false}
                  />
                  <YAxis
                    yAxisId="r"
                    orientation="right"
                    tick={{ fill: "#8B89B3", fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                    width={48}
                    tickFormatter={(v) => formatInr(Number(v), true)}
                  />
                  <Tooltip
                    contentStyle={tooltipStyle}
                    formatter={(value, name) => [
                      name === "gmv" ? formatInr(Number(value)) : formatCount(Number(value)),
                      name === "gmv" ? "Revenue" : "Orders",
                    ]}
                    labelFormatter={(l) => formatDateTime(String(l))}
                  />
                  <Bar
                    yAxisId="l"
                    dataKey="orders"
                    name="orders"
                    fill="url(#ordBarFill)"
                    radius={[10, 10, 4, 4]}
                    barSize={26}
                  />
                  <Line
                    yAxisId="r"
                    type="monotone"
                    dataKey="gmv"
                    name="gmv"
                    stroke="#2BB673"
                    strokeWidth={2.75}
                    dot={{ r: 4, fill: "#2BB673", stroke: "#fff", strokeWidth: 2 }}
                    activeDot={{ r: 6 }}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            )}
          </div>
        </Panel>

        <Panel title="Orders by Category" subtitle="Share of placed orders">
          <div className="flex h-[300px] flex-col">
            <div className="relative min-h-0 flex-1">
              {data.byType.length === 0 ? (
                <EmptyChart label="No categories" />
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={data.byType.map((r) => ({
                        name: prettyLabel(r.type),
                        value: r.orders,
                        type: r.type,
                      }))}
                      dataKey="value"
                      nameKey="name"
                      innerRadius={68}
                      outerRadius={98}
                      paddingAngle={3}
                      stroke="#fff"
                      strokeWidth={3}
                    >
                      {data.byType.map((r, i) => (
                        <Cell
                          key={r.type}
                          fill={categoryColor(r.type) || chartColors[i % chartColors.length]}
                        />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={tooltipStyle}
                      formatter={(value) => formatCount(Number(value))}
                    />
                  </PieChart>
                </ResponsiveContainer>
              )}
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                <p className="text-[24px] font-semibold tabular-nums text-[#1E1C4A]">
                  {formatCount(k.orders)}
                </p>
                <p className="text-[11px] font-medium text-[#8B89B3]">Total Orders</p>
              </div>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {data.byType.slice(0, 4).map((r, i) => (
                <div
                  key={r.type}
                  className="flex items-center gap-2 rounded-xl bg-[#F8F9FF] px-2.5 py-2"
                >
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{
                      background: categoryColor(r.type) || chartColors[i % chartColors.length],
                    }}
                  />
                  <div className="min-w-0">
                    <p className="truncate text-[11px] font-semibold text-[#1E1C4A]">
                      {prettyLabel(r.type)}
                    </p>
                    <p className="text-[10px] tabular-nums text-[#8B89B3]">
                      {((r.orders / totalType) * 100).toFixed(0)}% · {formatCount(r.orders)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </Panel>
      </div>

      {/* Stores + status + hourly */}
      <div className="grid gap-4 xl:grid-cols-[1.1fr_0.95fr_0.95fr]">
        <Panel
          title="Top Performing Stores"
          subtitle="By delivered revenue"
          right={
            <span className="inline-flex items-center gap-0.5 text-[12px] font-semibold text-[#4B49AC]">
              View all <ArrowUpRight className="h-3.5 w-3.5" />
            </span>
          }
        >
          <div className="space-y-3">
            {data.topStores.length === 0 ? (
              <EmptyChart label="No store volume" />
            ) : (
              data.topStores.slice(0, 5).map((s, i) => {
                const max = data.topStores[0]?.gmv || 1;
                const pct = (s.gmv / max) * 100;
                return (
                  <div key={s.name} className="group">
                    <div className="mb-1.5 flex items-center gap-3">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#4B49AC] to-[#7DA0FA] text-[11px] font-bold text-white">
                        {i + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline justify-between gap-2">
                          <p className="truncate text-[13px] font-semibold text-[#1E1C4A]">{s.name}</p>
                          <p className="shrink-0 font-mono text-[12px] font-semibold tabular-nums text-[#1E1C4A]">
                            {formatInr(s.gmv)}
                          </p>
                        </div>
                        <p className="text-[11px] text-[#8B89B3]">{formatCount(s.orders)} orders</p>
                      </div>
                    </div>
                    <div className="ml-11 h-1.5 overflow-hidden rounded-full bg-[#EEF0FF]">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-[#4B49AC] to-[#98BDFF]"
                        style={{ width: `${Math.max(pct, 6)}%` }}
                      />
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </Panel>

        <Panel title="Order Status" subtitle="Outcome mix this period">
          <div className="relative h-[200px]">
            {statusBuckets.length === 0 ? (
              <EmptyChart label="No status data" />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={statusBuckets}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={55}
                    outerRadius={78}
                    paddingAngle={3}
                    stroke="#fff"
                    strokeWidth={3}
                  >
                    {statusBuckets.map((s) => (
                      <Cell key={s.name} fill={s.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={tooltipStyle}
                    formatter={(value) => formatCount(Number(value))}
                  />
                </PieChart>
              </ResponsiveContainer>
            )}
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <p className="text-[20px] font-semibold tabular-nums text-[#1E1C4A]">
                {formatCount(k.orders)}
              </p>
              <p className="text-[10px] text-[#8B89B3]">Orders</p>
            </div>
          </div>
          <div className="mt-2 space-y-2">
            {statusBuckets.map((s) => (
              <div key={s.name} className="flex items-center justify-between text-[12px]">
                <span className="inline-flex items-center gap-2 font-medium text-[#1E1C4A]">
                  <span className="h-2 w-2 rounded-full" style={{ background: s.color }} />
                  {s.name}
                </span>
                <span className="tabular-nums text-[#6B6894]">
                  {formatCount(s.value)} · {((s.value / totalStatus) * 100).toFixed(0)}%
                </span>
              </div>
            ))}
          </div>
        </Panel>

        <Panel
          title="Hourly Pulse"
          subtitle="Orders by hour (IST)"
          right={
            peakHour.orders > 0 ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-[#EEF0FF] px-2 py-0.5 text-[10px] font-semibold text-[#4B49AC]">
                <Radio className="h-3 w-3" />
                Peak {String(peakHour.hour).padStart(2, "0")}:00
              </span>
            ) : null
          }
        >
          <div className="h-[260px]">
            {data.hourly.every((h) => !h.orders) ? (
              <EmptyChart label="Quiet hours" />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={data.hourly.map((h) => ({
                    ...h,
                    label: String(h.hour).padStart(2, "0"),
                  }))}
                  margin={{ top: 8, right: 4, left: 0, bottom: 0 }}
                >
                  <defs>
                    <linearGradient id="hourFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#7978E9" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="#7978E9" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="#E4E7F7" strokeDasharray="4 6" vertical={false} />
                  <XAxis
                    dataKey="label"
                    tick={{ fill: "#8B89B3", fontSize: 9 }}
                    axisLine={false}
                    tickLine={false}
                    interval={3}
                  />
                  <YAxis
                    tick={{ fill: "#8B89B3", fontSize: 10 }}
                    axisLine={false}
                    tickLine={false}
                    width={28}
                    allowDecimals={false}
                  />
                  <Tooltip
                    contentStyle={tooltipStyle}
                    formatter={(value) => [formatCount(Number(value)), "Orders"]}
                    labelFormatter={(l) => `${l}:00 IST`}
                  />
                  <Area
                    type="monotone"
                    dataKey="orders"
                    stroke="#7978E9"
                    strokeWidth={2.5}
                    fill="url(#hourFill)"
                    dot={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </Panel>
      </div>

      {/* Customer + delivery */}
      <div className="grid gap-4 xl:grid-cols-2">
        <Panel title="Customer Metrics" subtitle="Acquisition & loyalty signals">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <MetricTile icon={Users} label="Total Customers" value={formatCount(c.total)} />
            <MetricTile
              icon={Store}
              label="Repeat Rate"
              value={formatPct(c.repeatRate, 0)}
            />
            <MetricTile
              icon={Users}
              label="New Customers"
              value={formatCount(c.newInPeriod)}
              delta={c.newDelta}
            />
            <MetricTile
              icon={CheckCircle2}
              label="Retention"
              value={formatPct(Math.max(c.retentionRate, 0), 0)}
            />
          </div>
        </Panel>

        <Panel
          title="Delivery Partner Performance"
          subtitle="Fleet health this period"
          right={
            <span className="inline-flex items-center gap-0.5 text-[12px] font-semibold text-[#4B49AC]">
              View all <ArrowUpRight className="h-3.5 w-3.5" />
            </span>
          }
        >
          <div className="grid grid-cols-2 gap-3">
            <MetricTile
              icon={Bike}
              label="Active Partners"
              value={`${formatCount(d.ridersOnline)} / ${formatCount(d.riders)}`}
            />
            <MetricTile
              icon={Timer}
              label="Avg. Delivery Time"
              value={d.avgMinutes ? `${Math.round(d.avgMinutes)} mins` : "—"}
            />
            <MetricTile
              icon={CheckCircle2}
              label="On-Time Delivery"
              value={formatPct(d.onTimeRate, 0)}
            />
            <MetricTile
              icon={IndianRupee}
              label="Partner Earnings"
              value={formatInr(d.partnerEarnings, true)}
            />
          </div>
        </Panel>
      </div>
    </div>
  );
}

function HistoryView({ data }: { data: OrdersData }) {
  const k = data.kpis;
  const [q, setQ] = useState("");
  const [category, setCategory] = useState("ALL");
  const [status, setStatus] = useState("ALL");
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const types = useMemo(
    () => Array.from(new Set(data.recent.map((r) => r.type))).sort(),
    [data.recent]
  );

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return data.recent.filter((r) => {
      if (category !== "ALL" && r.type !== category) return false;
      if (status === "DELIVERED" && r.status.toLowerCase() !== "delivered") return false;
      if (status === "CANCELLED" && r.status.toLowerCase() !== "cancelled") return false;
      if (status === "ONGOING" && !LIVE_STATUSES.has(r.status.toLowerCase())) return false;
      if (!needle) return true;
      return [r.orderId, r.customer, r.customerPhone, r.store, r.rider, r.type, r.status]
        .join(" ")
        .toLowerCase()
        .includes(needle);
    });
  }, [data.recent, q, category, status]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const pageRows = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  const selected = filtered.find((r) => r.id === selectedId) ?? null;
  const ongoing = Math.max(k.orders - k.delivered - k.cancelled, 0);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[13px] text-[#6B6894]">
            Search, view and manage all orders across Food, Grocery, Ride and Parcel.
          </p>
        </div>
        <button
          type="button"
          className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-[#4B49AC] px-4 py-2.5 text-[13px] font-semibold text-white shadow-sm hover:bg-[#3A3894]"
          onClick={() => exportCsv(filtered)}
        >
          <Download className="h-4 w-4" />
          Export
        </button>
      </div>

      <div className="rounded-2xl border border-[#E4E7F7] bg-white p-4 shadow-[0_8px_30px_rgba(75,73,172,0.06)]">
        <div className="flex items-center gap-2 rounded-xl border border-[#E4E7F7] bg-[#F8F9FF] px-3.5 py-3">
          <Search className="h-4 w-4 shrink-0 text-[#8B89B3]" />
          <input
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(1);
            }}
            placeholder="Search by Order ID, Customer Name, Phone…"
            className="w-full bg-transparent text-[14px] text-[#1E1C4A] outline-none placeholder:text-[#8B89B3]"
          />
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <SelectChip
            value={category}
            onChange={(v) => {
              setCategory(v);
              setPage(1);
            }}
            options={[
              { value: "ALL", label: "All Categories" },
              ...types.map((t) => ({ value: t, label: prettyLabel(t) })),
            ]}
          />
          <SelectChip
            value={status}
            onChange={(v) => {
              setStatus(v);
              setPage(1);
            }}
            options={[
              { value: "ALL", label: "All Status" },
              { value: "DELIVERED", label: "Delivered" },
              { value: "ONGOING", label: "Ongoing" },
              { value: "CANCELLED", label: "Cancelled" },
            ]}
          />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <HistStat icon={Store} label="Total Orders" value={formatCount(k.orders)} tone="indigo" />
        <HistStat
          icon={CheckCircle2}
          label="Delivered"
          value={formatCount(k.delivered)}
          sub={`(${formatPct(k.completionRate, 0)})`}
          tone="green"
        />
        <HistStat
          icon={XCircle}
          label="Cancelled"
          value={formatCount(k.cancelled)}
          sub={`(${k.orders ? formatPct((k.cancelled / k.orders) * 100, 0) : "0%"})`}
          tone="coral"
        />
        <HistStat
          icon={Clock3}
          label="Ongoing"
          value={formatCount(ongoing || k.live)}
          sub={`(${k.orders ? formatPct(((ongoing || k.live) / k.orders) * 100, 0) : "0%"})`}
          tone="amber"
        />
      </div>

      <div className="overflow-hidden rounded-2xl border border-[#E4E7F7] bg-white shadow-[0_8px_30px_rgba(75,73,172,0.06)]">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1000px] border-collapse text-left text-[13px]">
            <thead>
              <tr className="border-b border-[#E4E7F7] bg-[#F8F9FF] text-[11px] font-semibold uppercase tracking-[0.08em] text-[#8B89B3]">
                <th className="px-5 py-3.5">Order ID</th>
                <th className="px-3 py-3.5">Date & Time</th>
                <th className="px-3 py-3.5">Customer</th>
                <th className="px-3 py-3.5">Category</th>
                <th className="px-3 py-3.5">Store / Partner</th>
                <th className="px-3 py-3.5 text-right">Amount</th>
                <th className="px-3 py-3.5">Status</th>
                <th className="px-5 py-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {pageRows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-5 py-14 text-center text-[#8B89B3]">
                    No orders match this filter.
                  </td>
                </tr>
              ) : (
                pageRows.map((r) => {
                  const active = selectedId === r.id;
                  return (
                    <tr
                      key={r.id}
                      onClick={() => setSelectedId(active ? null : r.id)}
                      className={`cursor-pointer border-b border-[#F0F2FA] transition hover:bg-[#F8F9FF] ${
                        active ? "bg-[#EEF0FF]/80" : ""
                      }`}
                    >
                      <td className="px-5 py-4">
                        <a
                          href={orderDetailHref(r.orderId)}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="font-mono text-[13px] font-semibold text-[#4B49AC] hover:underline"
                        >
                          {r.orderId}
                        </a>
                      </td>
                      <td className="px-3 py-4 text-[#6B6894]">
                        <DateTimeStack iso={r.createdAt} />
                      </td>
                      <td className="px-3 py-4">
                        <p className="font-semibold text-[#1E1C4A]">{r.customer}</p>
                        <p className="text-[12px] text-[#8B89B3]">{r.customerPhone || "—"}</p>
                      </td>
                      <td className="px-3 py-4">
                        <span className="inline-flex items-center gap-2">
                          <span
                            className="flex h-8 w-8 items-center justify-center rounded-full text-white shadow-sm"
                            style={{ background: categoryColor(r.type) }}
                          >
                            <ShoppingBag className="h-3.5 w-3.5" />
                          </span>
                          <span className="font-medium text-[#1E1C4A]">{prettyLabel(r.type)}</span>
                        </span>
                      </td>
                      <td className="max-w-[170px] truncate px-3 py-4 text-[#6B6894]">{r.store}</td>
                      <td className="px-3 py-4 text-right font-semibold tabular-nums text-[#1E1C4A]">
                        {formatInr(r.amount)}
                      </td>
                      <td className="px-3 py-4">
                        <span
                          className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold capitalize ${statusPillClass(
                            r.status
                          )}`}
                        >
                          {r.status.replace(/_/g, " ")}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-right">
                        <button
                          type="button"
                          className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-full text-[#8B89B3] hover:bg-[#F4F6FF] hover:text-[#4B49AC]"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedId(active ? null : r.id);
                          }}
                        >
                          <MoreVertical className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#E4E7F7] px-5 py-3.5">
          <p className="text-[12px] text-[#6B6894]">
            Showing {(safePage - 1) * PAGE_SIZE + (pageRows.length ? 1 : 0)}–
            {Math.min(safePage * PAGE_SIZE, filtered.length)} of {formatCount(filtered.length)}{" "}
            orders
          </p>
          <Pagination page={safePage} pageCount={pageCount} onChange={setPage} />
        </div>
      </div>

      {selected ? <OrderDetailsPanel order={selected} onClose={() => setSelectedId(null)} /> : null}
    </div>
  );
}

function OrderDetailsPanel({ order, onClose }: { order: OrderRow; onClose: () => void }) {
  return (
    <section className="overflow-hidden rounded-2xl border border-[#E4E7F7] bg-white shadow-[0_12px_40px_rgba(75,73,172,0.1)]">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#E4E7F7] bg-gradient-to-r from-[#EEF0FF] to-white px-5 py-4">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-[17px] font-semibold text-[#1E1C4A]">Order Details</h3>
          <span
            className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold capitalize ${statusPillClass(
              order.status
            )}`}
          >
            {order.status.replace(/_/g, " ")}
          </span>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-full bg-white text-[#6B6894] shadow-sm hover:text-[#4B49AC]"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="grid gap-6 p-5 lg:grid-cols-3">
        <div className="space-y-3.5 text-[13px]">
          <DetailRow label="Order ID" value={order.orderId} mono />
          <DetailRow label="Date" value={formatDateTime(order.createdAt)} />
          <DetailRow label="Category" value={prettyLabel(order.type)} />
          <DetailRow label="Store" value={order.store} />
          <DetailRow label="Customer" value={`${order.customer} · ${order.customerPhone || "—"}`} />
        </div>

        <div className="rounded-2xl bg-[#F8F9FF] p-4 text-[13px]">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[#8B89B3]">Bill</p>
          <div className="mt-3 space-y-2.5">
            <div className="flex justify-between text-[#6B6894]">
              <span>Amount</span>
              <span className="tabular-nums">{formatInr(order.amount)}</span>
            </div>
            <div className="flex justify-between text-[#6B6894]">
              <span>GST</span>
              <span className="tabular-nums">{formatInr(order.gst)}</span>
            </div>
            <div className="flex justify-between text-[#6B6894]">
              <span>Tip</span>
              <span className="tabular-nums">{formatInr(order.tip)}</span>
            </div>
            <div className="flex justify-between border-t border-[#E4E7F7] pt-2.5 text-[15px] font-semibold text-[#1E1C4A]">
              <span>Total Paid</span>
              <span className="tabular-nums">{formatInr(order.amount)}</span>
            </div>
          </div>
        </div>

        <div className="space-y-3.5 text-[13px]">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[#8B89B3]">
            Delivery Details
          </p>
          <DetailRow label="Partner" value={order.rider} />
          <DetailRow label="Payment" value={prettyLabel(order.paymentMethod || order.paymentStatus)} />
          <DetailRow label="Donation" value={formatInr(order.donation)} />
        </div>
      </div>

      <div className="flex flex-wrap justify-end gap-2 border-t border-[#E4E7F7] px-5 py-4">
        <a
          href={orderDetailHref(order.orderId)}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 rounded-xl border border-[#4B49AC] px-4 py-2.5 text-[13px] font-semibold text-[#4B49AC] hover:bg-[#EEF0FF]"
        >
          <ExternalLink className="h-4 w-4" />
          Open in Ops
        </a>
      </div>
    </section>
  );
}

function HeroKpi({
  label,
  value,
  sub,
  delta,
  icon: Icon,
  accent,
  wash,
}: {
  label: string;
  value: string;
  sub: string;
  delta?: number | null;
  icon: typeof ShoppingBag;
  accent: string;
  wash: string;
}) {
  return (
    <div
      className={`relative overflow-hidden rounded-2xl border border-[#E4E7F7] bg-white p-4 shadow-[0_8px_28px_rgba(75,73,172,0.06)]`}
    >
      <div
        aria-hidden
        className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${wash}`}
      />
      <div className="relative flex items-start justify-between gap-2">
        <p className="text-[12px] font-medium text-[#6B6894]">{label}</p>
        <span
          className="flex h-10 w-10 items-center justify-center rounded-2xl"
          style={{ background: `${accent}18`, color: accent }}
        >
          <Icon className="h-5 w-5" strokeWidth={1.75} />
        </span>
      </div>
      <p className="relative mt-3 text-[28px] font-semibold tracking-tight text-[#1E1C4A]">{value}</p>
      <div className="relative mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="text-[12px] text-[#8B89B3]">{sub}</span>
        {deltaLabel(delta)}
      </div>
    </div>
  );
}

function HistStat({
  icon: Icon,
  label,
  value,
  sub,
  tone,
}: {
  icon: typeof Store;
  label: string;
  value: string;
  sub?: string;
  tone: "indigo" | "green" | "coral" | "amber";
}) {
  const tones = {
    indigo: "bg-[#EEF0FF] text-[#4B49AC]",
    green: "bg-[#E8F8EF] text-[#1F9D57]",
    coral: "bg-[#FDECEC] text-[#D64545]",
    amber: "bg-[#FFF4E5] text-[#C77D12]",
  }[tone];
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-[#E4E7F7] bg-white px-4 py-4 shadow-[0_8px_28px_rgba(75,73,172,0.05)]">
      <span className={`flex h-11 w-11 items-center justify-center rounded-2xl ${tones}`}>
        <Icon className="h-5 w-5" strokeWidth={1.75} />
      </span>
      <div>
        <p className="text-[12px] text-[#6B6894]">{label}</p>
        <p className="text-[20px] font-semibold text-[#1E1C4A]">
          {value}{" "}
          {sub ? <span className="text-[13px] font-medium text-[#8B89B3]">{sub}</span> : null}
        </p>
      </div>
    </div>
  );
}

function MetricTile({
  icon: Icon,
  label,
  value,
  delta,
}: {
  icon: typeof Users;
  label: string;
  value: string;
  delta?: number | null;
}) {
  return (
    <div className="rounded-2xl bg-[#F8F9FF] px-3 py-4 text-center ring-1 ring-[#E4E7F7]/80">
      <span className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-white text-[#4B49AC] shadow-sm">
        <Icon className="h-4 w-4" />
      </span>
      <p className="mt-2.5 text-[11px] font-medium text-[#6B6894]">{label}</p>
      <p className="mt-1 text-[18px] font-semibold tabular-nums text-[#1E1C4A]">{value}</p>
      {delta != null ? <div className="mt-1">{deltaLabel(delta)}</div> : null}
    </div>
  );
}

function Panel({
  title,
  subtitle,
  right,
  children,
}: {
  title: string;
  subtitle?: string;
  right?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-[#E4E7F7] bg-white p-5 shadow-[0_8px_28px_rgba(75,73,172,0.05)]">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h3 className="text-[15px] font-semibold text-[#1E1C4A]">{title}</h3>
          {subtitle ? <p className="mt-0.5 text-[12px] text-[#8B89B3]">{subtitle}</p> : null}
        </div>
        {right}
      </div>
      {children}
    </section>
  );
}

function EmptyChart({ label }: { label: string }) {
  return (
    <div className="flex h-full min-h-[120px] items-center justify-center text-[13px] text-[#8B89B3]">
      {label}
    </div>
  );
}

function DetailRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <p className="text-[11px] text-[#8B89B3]">{label}</p>
      <p className={`mt-0.5 text-[#1E1C4A] ${mono ? "font-mono font-semibold" : "font-medium"}`}>
        {value}
      </p>
    </div>
  );
}

function DateTimeStack({ iso }: { iso: string }) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return <span>{iso}</span>;
  return (
    <div>
      <p className="font-medium text-[#1E1C4A]">
        {d.toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
      </p>
      <p className="text-[12px]">
        {d.toLocaleString("en-US", { hour: "numeric", minute: "2-digit", hour12: true })}
      </p>
    </div>
  );
}

function SelectChip({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="cursor-pointer rounded-xl border border-[#E4E7F7] bg-white px-3 py-2 text-[13px] font-medium text-[#1E1C4A] outline-none"
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

function Pagination({
  page,
  pageCount,
  onChange,
}: {
  page: number;
  pageCount: number;
  onChange: (p: number) => void;
}) {
  const windowPages = useMemo(() => {
    const pages: number[] = [];
    const start = Math.max(1, page - 1);
    const end = Math.min(pageCount, start + 2);
    for (let i = Math.max(1, end - 2); i <= end; i++) pages.push(i);
    return pages;
  }, [page, pageCount]);

  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        disabled={page <= 1}
        onClick={() => onChange(page - 1)}
        className="cursor-pointer rounded-lg px-2 py-1 text-[13px] text-[#6B6894] disabled:opacity-40"
      >
        ‹
      </button>
      {windowPages[0] > 1 ? (
        <>
          <PageBtn n={1} active={page === 1} onClick={() => onChange(1)} />
          {windowPages[0] > 2 ? <span className="px-1 text-[#8B89B3]">…</span> : null}
        </>
      ) : null}
      {windowPages.map((n) => (
        <PageBtn key={n} n={n} active={page === n} onClick={() => onChange(n)} />
      ))}
      {windowPages[windowPages.length - 1] < pageCount ? (
        <>
          {windowPages[windowPages.length - 1] < pageCount - 1 ? (
            <span className="px-1 text-[#8B89B3]">…</span>
          ) : null}
          <PageBtn n={pageCount} active={page === pageCount} onClick={() => onChange(pageCount)} />
        </>
      ) : null}
      <button
        type="button"
        disabled={page >= pageCount}
        onClick={() => onChange(page + 1)}
        className="cursor-pointer rounded-lg px-2 py-1 text-[13px] text-[#6B6894] disabled:opacity-40"
      >
        ›
      </button>
    </div>
  );
}

function PageBtn({ n, active, onClick }: { n: number; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`h-8 min-w-8 cursor-pointer rounded-lg px-2 text-[13px] font-semibold ${
        active ? "bg-[#4B49AC] text-white" : "text-[#6B6894] hover:bg-[#F4F6FF]"
      }`}
    >
      {n}
    </button>
  );
}

function shortDay(v: string) {
  const d = new Date(String(v));
  return Number.isNaN(d.getTime())
    ? String(v).slice(5)
    : d.toLocaleString("en-GB", { day: "numeric", month: "short" });
}

function exportCsv(rows: OrderRow[]) {
  const header = [
    "Order ID",
    "Created",
    "Customer",
    "Phone",
    "Type",
    "Store",
    "Rider",
    "Status",
    "Amount",
    "GST",
    "Tip",
  ];
  const lines = rows.map((r) =>
    [
      r.orderId,
      r.createdAt,
      r.customer,
      r.customerPhone,
      r.type,
      r.store,
      r.rider,
      r.status,
      r.amount,
      r.gst,
      r.tip,
    ]
      .map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`)
      .join(",")
  );
  const blob = new Blob([[header.join(","), ...lines].join("\n")], {
    type: "text/csv;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "gatimitra-orders.csv";
  a.click();
  URL.revokeObjectURL(url);
}
