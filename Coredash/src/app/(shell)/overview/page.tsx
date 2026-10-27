"use client";

import {
  Activity,
  Bike,
  Heart,
  IndianRupee,
  Landmark,
  ReceiptIndianRupee,
  ShoppingCart,
  Store,
  Ticket,
  TrendingDown,
  TrendingUp,
  Undo2,
  UserCircle,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useCoreData } from "@/lib/hooks/useCoreData";
import { formatCount, formatInr, formatPct, prettyLabel } from "@/lib/format";
import { periodLabel, parsePeriod } from "@/lib/period";
import { DataTable, ErrorState, GmvHead, LoadingGrid, Panel } from "@/components/ui/Primitives";
import { RevenueArea, ServiceBars } from "@/components/charts/Charts";
import type { OverviewData } from "@/lib/data-types";

function deltaTone(delta: number | null | undefined) {
  if (delta == null || !Number.isFinite(delta)) return null;
  const up = delta >= 0;
  return {
    up,
    label: `${up ? "+" : ""}${formatPct(delta, 1)}`,
    className: up ? "text-[#2BB673]" : "text-[#E11D48]",
    Icon: up ? TrendingUp : TrendingDown,
  };
}

function HeroMetric({
  label,
  value,
  hint,
  delta,
  icon: Icon,
  accent = "#98BDFF",
}: {
  label: string;
  value: string;
  hint?: string;
  delta?: number | null;
  icon: LucideIcon;
  accent?: string;
}) {
  const d = deltaTone(delta);
  return (
    <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-white/[0.07] p-4 backdrop-blur-sm">
      <div
        className="pointer-events-none absolute -right-6 -top-6 h-24 w-24 rounded-full opacity-30 blur-2xl"
        style={{ background: accent }}
      />
      <div className="relative flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-white/55">{label}</p>
          <p className="mt-1.5 truncate text-[22px] font-semibold tracking-tight text-white sm:text-[24px]">
            {value}
          </p>
          {hint ? <p className="mt-1 text-[11px] text-white/50">{hint}</p> : null}
        </div>
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/10 text-white">
          <Icon className="h-5 w-5" strokeWidth={1.75} />
        </div>
      </div>
      {d ? (
        <div className={`relative mt-3 inline-flex items-center gap-1 text-[12px] font-semibold ${d.className}`}>
          <d.Icon className="h-3.5 w-3.5" />
          {d.label}
          <span className="font-medium text-white/45"> vs prior</span>
        </div>
      ) : null}
    </div>
  );
}

function MetricTile({
  label,
  value,
  hint,
  icon: Icon,
  tone = "indigo",
}: {
  label: string;
  value: string;
  hint?: string;
  icon: LucideIcon;
  tone?: "indigo" | "sky" | "green" | "coral" | "lavender";
}) {
  const tones = {
    indigo: { bg: "#EEF0FF", fg: "#4B49AC", ring: "#D9DCFF" },
    sky: { bg: "#EAF1FF", fg: "#4A7FE8", ring: "#D6E4FF" },
    green: { bg: "#E8F8F0", fg: "#2BB673", ring: "#C8EED9" },
    coral: { bg: "#FDECEC", fg: "#E25B61", ring: "#F8D0D2" },
    lavender: { bg: "#EEEDFF", fg: "#6B6AD4", ring: "#D9D8FF" },
  }[tone];

  return (
    <div className="group rounded-2xl border border-[#E4E7F7] bg-white p-4 shadow-[0_8px_24px_rgba(30,28,74,0.04)] transition hover:-translate-y-0.5 hover:shadow-[0_14px_32px_rgba(30,28,74,0.08)]">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[12px] font-medium text-[#6B6894]">{label}</p>
          <p className="mt-1 truncate text-[20px] font-semibold tracking-tight text-[#1E1C4A]">{value}</p>
        </div>
        <div
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ring-1"
          style={{ background: tones.bg, color: tones.fg, boxShadow: `inset 0 0 0 1px ${tones.ring}` }}
        >
          <Icon className="h-4 w-4" strokeWidth={1.8} />
        </div>
      </div>
      {hint ? <p className="mt-2 text-[11px] leading-snug text-[#8B89B3]">{hint}</p> : null}
    </div>
  );
}

function PulseStat({
  label,
  value,
  sub,
  icon: Icon,
}: {
  label: string;
  value: string;
  sub?: string;
  icon: LucideIcon;
}) {
  return (
    <div className="flex min-w-0 items-center gap-3 rounded-2xl border border-[#E4E7F7] bg-[#FAFBFF] px-3.5 py-3">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-[#4B49AC] shadow-sm ring-1 ring-[#E4E7F7]">
        <Icon className="h-4 w-4" strokeWidth={1.8} />
      </div>
      <div className="min-w-0">
        <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[#8B89B3]">{label}</p>
        <p className="truncate text-[15px] font-semibold text-[#1E1C4A]">{value}</p>
        {sub ? <p className="truncate text-[11px] text-[#6B6894]">{sub}</p> : null}
      </div>
    </div>
  );
}

function ServiceMixRow({
  type,
  orders,
  delivered,
  gmv,
  maxOrders,
}: {
  type: string;
  orders: number;
  delivered: number;
  gmv: number;
  maxOrders: number;
}) {
  const pct = maxOrders > 0 ? Math.round((orders / maxOrders) * 100) : 0;
  const rate = orders > 0 ? Math.round((delivered / orders) * 100) : 0;
  return (
    <div className="rounded-xl border border-[#EEF0F8] bg-[#FBFBFF] px-3 py-3">
      <div className="flex items-center justify-between gap-3">
        <p className="truncate text-[13px] font-semibold text-[#1E1C4A]">{prettyLabel(type)}</p>
        <p className="shrink-0 text-[12px] font-semibold tabular-nums text-[#4B49AC]">{formatInr(gmv, true)}</p>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#E8EAF8]">
        <div
          className="h-full rounded-full bg-gradient-to-r from-[#4B49AC] to-[#7DA0FA]"
          style={{ width: `${Math.max(pct, 4)}%` }}
        />
      </div>
      <div className="mt-2 flex items-center justify-between text-[11px] text-[#6B6894]">
        <span>{formatCount(orders)} orders</span>
        <span>{rate}% delivered</span>
      </div>
    </div>
  );
}

export default function OverviewPage() {
  const { data, loading, error, reload } = useCoreData<OverviewData>("/api/overview");
  const searchParams = useSearchParams();
  const period = parsePeriod(searchParams.get("period"));

  if (loading) return <LoadingGrid count={8} />;
  if (error || !data) return <ErrorState message={error || "Failed"} onRetry={reload} />;

  const k = data.kpis;
  const maxServiceOrders = Math.max(1, ...data.byType.map((r) => r.orders));
  const topServices = [...data.byType].sort((a, b) => b.orders - a.orders).slice(0, 5);

  return (
    <div className="space-y-5">
      {/* Command hero */}
      <section className="relative overflow-hidden rounded-[28px] bg-[linear-gradient(135deg,#2C2A78_0%,#4B49AC_48%,#5B6FDB_100%)] p-5 text-white shadow-[0_24px_60px_rgba(44,42,120,0.28)] sm:p-6">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_85%_15%,rgba(152,189,255,0.35),transparent_42%)]" />
        <div className="pointer-events-none absolute -bottom-16 -left-10 h-48 w-48 rounded-full bg-[#7DA0FA]/20 blur-3xl" />

        <div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0 max-w-2xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[11px] font-semibold tracking-wide text-white/85">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#98BDFF] opacity-60" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-[#98BDFF]" />
              </span>
              Live operations · {periodLabel(period)}
            </div>
            <h2 className="mt-3 text-[26px] font-semibold tracking-tight sm:text-[32px]">
              Business command center
            </h2>
            <p className="mt-2 max-w-xl text-[13px] leading-relaxed text-white/65 sm:text-[14px]">
              Platform revenue, marketplace GMV, fleet pulse, and service mix — one view of how GatiMitra is performing right now.
            </p>
          </div>

          <div className="flex flex-wrap gap-2 lg:justify-end">
            <div className="rounded-2xl border border-white/15 bg-white/10 px-3.5 py-2.5 backdrop-blur-sm">
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-white/50">Live orders</p>
              <p className="mt-0.5 text-[20px] font-semibold tabular-nums">{formatCount(k.live)}</p>
            </div>
            <div className="rounded-2xl border border-white/15 bg-white/10 px-3.5 py-2.5 backdrop-blur-sm">
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-white/50">Completion</p>
              <p className="mt-0.5 text-[20px] font-semibold tabular-nums">{formatPct(k.completionRate)}</p>
            </div>
            <div className="rounded-2xl border border-white/15 bg-white/10 px-3.5 py-2.5 backdrop-blur-sm">
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-white/50">Riders online</p>
              <p className="mt-0.5 text-[20px] font-semibold tabular-nums">
                {formatCount(k.ridersOnline)}
                <span className="text-[13px] font-medium text-white/45"> / {formatCount(k.riders)}</span>
              </p>
            </div>
          </div>
        </div>

        <div className="relative mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <HeroMetric
            label="Platform revenue"
            value={formatInr(k.platformRevenue ?? 0, true)}
            delta={k.platformRevenueDelta}
            hint={`Services ${formatInr(k.platformRevenueCharges ?? 0, true)}`}
            icon={Landmark}
            accent="#98BDFF"
          />
          <HeroMetric
            label="GMV"
            value={formatInr(k.gmv, true)}
            delta={k.gmvDelta}
            hint="Delivered merchandise value"
            icon={IndianRupee}
            accent="#F5A524"
          />
          <HeroMetric
            label="Orders"
            value={formatCount(k.orders)}
            delta={k.ordersDelta}
            hint={`${formatCount(k.delivered)} delivered`}
            icon={ShoppingCart}
            accent="#7DA0FA"
          />
          <HeroMetric
            label="Platform fee"
            value={formatInr(k.platformFee ?? 0, true)}
            hint="Booking + platform + GMitra Plus"
            icon={Activity}
            accent="#7978E9"
          />
        </div>
      </section>

      {/* Network pulse */}
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <PulseStat
          label="Customers"
          value={formatCount(k.customers)}
          sub={`${formatCount(k.newCustomers)} new this period`}
          icon={UserCircle}
        />
        <PulseStat
          label="Riders"
          value={`${formatCount(k.ridersOnline)} online`}
          sub={`${formatCount(k.riders)} total fleet`}
          icon={Bike}
        />
        <PulseStat
          label="Stores"
          value={`${formatCount(k.storesLive)} live`}
          sub={`${formatCount(k.stores)} onboarded`}
          icon={Store}
        />
        <PulseStat label="Refunds" value={formatInr(k.refunds, true)} sub="Period refunds" icon={Undo2} />
        <PulseStat
          label="Support"
          value={formatCount(k.openTickets)}
          sub="Open tickets"
          icon={Ticket}
        />
      </section>

      {/* Finance + impact */}
      <section>
        <div className="mb-3 flex items-end justify-between gap-3">
          <div>
            <h3 className="text-[15px] font-semibold text-[#1E1C4A]">Money & impact</h3>
            <p className="mt-0.5 text-[12px] text-[#6B6894]">Tax, payouts, wallet, and social contributions</p>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <MetricTile
            label="GST to remit"
            value={formatInr(k.gstCollected, true)}
            hint={`On bills ${formatInr(k.gstOnBills ?? 0, true)} · item GST with merchants`}
            icon={ReceiptIndianRupee}
            tone="indigo"
          />
          <MetricTile
            label="Rider earnings"
            value={formatInr(k.riderEarning ?? 0, true)}
            hint="Waiting charges excluded"
            icon={Bike}
            tone="green"
          />
          <MetricTile
            label="GatiCash outstanding"
            value={formatInr(k.wallet, true)}
            hint={`${formatInr(k.walletUsed ?? 0, true)} used this period`}
            icon={Wallet}
            tone="sky"
          />
          <MetricTile
            label="Rider tips"
            value={formatInr(k.riderTips, true)}
            hint="Collected tips to riders"
            icon={IndianRupee}
            tone="green"
          />
          <MetricTile
            label="Feeding India"
            value={formatInr(k.feedingIndia, true)}
            hint="Customer donations"
            icon={Heart}
            tone="coral"
          />
          <MetricTile
            label="Completion rate"
            value={formatPct(k.completionRate)}
            hint={`${formatCount(k.delivered)} delivered · ${formatCount(k.cancelled)} cancelled`}
            icon={Store}
            tone="lavender"
          />
          <MetricTile
            label="Live orders"
            value={formatCount(k.live)}
            hint="In flight right now"
            icon={ShoppingCart}
            tone="sky"
          />
          <MetricTile
            label="Open tickets"
            value={formatCount(k.openTickets)}
            hint="Needs attention"
            icon={Ticket}
            tone="coral"
          />
        </div>
      </section>

      {/* Charts + service mix */}
      <section className="grid gap-4 xl:grid-cols-5">
        <Panel title="Revenue trend" className="xl:col-span-3">
          <p className="-mt-2 mb-3 text-[12px] text-[#6B6894]">Daily GMV across the selected period</p>
          <RevenueArea data={data.trend} />
        </Panel>
        <div className="flex flex-col gap-4 xl:col-span-2">
          <Panel title="By service">
            <p className="-mt-2 mb-3 text-[12px] text-[#6B6894]">Orders vs GMV mix</p>
            <ServiceBars data={data.byType.map((r) => ({ type: prettyLabel(r.type), orders: r.orders, gmv: r.gmv }))} />
          </Panel>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-5">
        <Panel title="Top services" className="xl:col-span-2">
          <p className="-mt-2 mb-3 text-[12px] text-[#6B6894]">Share of order volume this period</p>
          <div className="space-y-2.5">
            {topServices.length === 0 ? (
              <p className="py-8 text-center text-[13px] text-[#6B6894]">No service volume yet.</p>
            ) : (
              topServices.map((r) => (
                <ServiceMixRow
                  key={r.type}
                  type={r.type}
                  orders={r.orders}
                  delivered={r.delivered}
                  gmv={r.gmv}
                  maxOrders={maxServiceOrders}
                />
              ))
            )}
          </div>
        </Panel>
        <Panel title="Service mix detail" className="xl:col-span-3">
          <p className="-mt-2 mb-3 text-[12px] text-[#6B6894]">Full breakdown by service type</p>
          <DataTable
            columns={["Service", "Orders", "Delivered", <GmvHead key="gmv" />]}
            rows={data.byType.map((r) => [
              prettyLabel(r.type),
              formatCount(r.orders),
              formatCount(r.delivered),
              formatInr(r.gmv),
            ])}
          />
        </Panel>
      </section>
    </div>
  );
}
