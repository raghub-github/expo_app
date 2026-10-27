"use client";

import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Gauge,
  ShoppingCart,
  Timer,
  TrendingUp,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useCoreData } from "@/lib/hooks/useCoreData";
import { formatCount, formatInr, formatPct, prettyLabel } from "@/lib/format";
import { periodLabel, parsePeriod } from "@/lib/period";
import { DataTable, ErrorState, GmvHead, LoadingGrid, Panel } from "@/components/ui/Primitives";
import { CompletionTrend, PerfBars, SharePie } from "@/components/charts/Charts";
import type { PerformanceData as Data } from "@/lib/data-types";

function HeroStat({
  label,
  value,
  hint,
  icon: Icon,
}: {
  label: string;
  value: string;
  hint?: string;
  icon: LucideIcon;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.08] p-4 backdrop-blur-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-white/55">{label}</p>
          <p className="mt-1.5 truncate text-[22px] font-semibold tracking-tight text-white">{value}</p>
          {hint ? <p className="mt-1 text-[11px] text-white/50">{hint}</p> : null}
        </div>
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/10 text-white">
          <Icon className="h-5 w-5" strokeWidth={1.75} />
        </div>
      </div>
    </div>
  );
}

function ScoreCard({
  label,
  value,
  hint,
  tone,
  icon: Icon,
}: {
  label: string;
  value: string;
  hint: string;
  tone: "good" | "warn" | "bad" | "neutral";
  icon: LucideIcon;
}) {
  const styles = {
    good: { bg: "#E8F8F0", fg: "#1F8A56", ring: "#C8EED9" },
    warn: { bg: "#FFF7E8", fg: "#B45309", ring: "#FDE68A" },
    bad: { bg: "#FDECEC", fg: "#C24B52", ring: "#F8D0D2" },
    neutral: { bg: "#EEF0FF", fg: "#4B49AC", ring: "#D9DCFF" },
  }[tone];
  return (
    <div className="rounded-2xl border border-[#E4E7F7] bg-white p-4 shadow-[0_8px_24px_rgba(30,28,74,0.04)]">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[12px] font-medium text-[#6B6894]">{label}</p>
          <p className="mt-1 text-[22px] font-semibold tracking-tight text-[#1E1C4A]">{value}</p>
          <p className="mt-1 text-[11px] text-[#8B89B3]">{hint}</p>
        </div>
        <div
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ring-1"
          style={{ background: styles.bg, color: styles.fg, boxShadow: `inset 0 0 0 1px ${styles.ring}` }}
        >
          <Icon className="h-4 w-4" strokeWidth={1.8} />
        </div>
      </div>
    </div>
  );
}

function RankRow({
  rank,
  title,
  primary,
  secondary,
  tone = "neutral",
}: {
  rank: number;
  title: string;
  primary: string;
  secondary: string;
  tone?: "good" | "bad" | "neutral";
}) {
  const bar =
    tone === "good" ? "bg-[#2BB673]" : tone === "bad" ? "bg-[#F3797E]" : "bg-[#4B49AC]";
  return (
    <div className="flex items-center gap-3 rounded-xl border border-[#EEF0F8] bg-[#FBFBFF] px-3 py-2.5">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white text-[11px] font-semibold text-[#4B49AC] ring-1 ring-[#E4E7F7]">
        {rank}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-semibold text-[#1E1C4A]">{title}</p>
        <p className="truncate text-[11px] text-[#6B6894]">{secondary}</p>
      </div>
      <span className={`rounded-full px-2.5 py-1 text-[12px] font-semibold text-white ${bar}`}>{primary}</span>
    </div>
  );
}

export default function PerformancePage() {
  const { data, loading, error, reload } = useCoreData<Data>("/api/performance");
  const searchParams = useSearchParams();
  const period = parsePeriod(searchParams.get("period"));

  if (loading) return <LoadingGrid count={8} />;
  if (error || !data) return <ErrorState message={error || "Failed to load performance"} onRetry={reload} />;

  const s = data.summary;
  const statusPie = data.byStatus.map((r) => ({ name: prettyLabel(r.status), value: r.orders }));
  const storePie = data.storeTypes.map((r) => ({ name: prettyLabel(r.storeType), value: r.orders }));
  const rateBars = data.byType.slice(0, 8).map((r) => ({
    type: prettyLabel(r.type),
    completionRate: Number(r.completionRate.toFixed(1)),
    cancelRate: Number(r.cancelRate.toFixed(1)),
    avgMinutes: Number(r.avgMinutes.toFixed(1)),
  }));
  const slowest = [...data.byType]
    .filter((r) => r.delivered > 0)
    .sort((a, b) => b.avgMinutes - a.avgMinutes)
    .slice(0, 5);
  const riskiest = [...data.byType]
    .filter((r) => r.orders > 0)
    .sort((a, b) => b.cancelRate + b.failRate - (a.cancelRate + a.failRate))
    .slice(0, 5);
  const best = [...data.byType]
    .filter((r) => r.orders >= 3)
    .sort((a, b) => b.completionRate - a.completionRate)
    .slice(0, 5);

  const healthTone =
    s.completionRate >= 85 ? "good" : s.completionRate >= 70 ? "warn" : "bad";

  return (
    <div className="space-y-5">
      <section className="relative overflow-hidden rounded-[28px] bg-[linear-gradient(135deg,#1F2A5A_0%,#4B49AC_52%,#6B7FE8_100%)] p-5 text-white shadow-[0_24px_60px_rgba(31,42,90,0.28)] sm:p-6">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_90%_10%,rgba(152,189,255,0.35),transparent_40%)]" />
        <div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[11px] font-semibold tracking-wide text-white/85">
              <span className="h-2 w-2 rounded-full bg-[#98BDFF]" />
              SLA monitor · {periodLabel(period)}
            </div>
            <h2 className="mt-3 text-[26px] font-semibold tracking-tight sm:text-[32px]">
              Delivery performance center
            </h2>
            <p className="mt-2 text-[13px] leading-relaxed text-white/65 sm:text-[14px]">
              Completion, cancels, failures, ETA breaches, and speed by service — so ops can spot SLA risk before it compounds.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <div className="rounded-2xl border border-white/15 bg-white/10 px-3.5 py-2.5">
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-white/50">Health</p>
              <p className="mt-0.5 text-[18px] font-semibold">
                {healthTone === "good" ? "Strong" : healthTone === "warn" ? "Watch" : "At risk"}
              </p>
            </div>
            <div className="rounded-2xl border border-white/15 bg-white/10 px-3.5 py-2.5">
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-white/50">Live</p>
              <p className="mt-0.5 text-[18px] font-semibold tabular-nums">{formatCount(s.live)}</p>
            </div>
          </div>
        </div>

        <div className="relative mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <HeroStat
            label="Completion"
            value={formatPct(s.completionRate)}
            hint={`${formatCount(s.delivered)} / ${formatCount(s.orders)}`}
            icon={Gauge}
          />
          <HeroStat
            label="On-time"
            value={formatPct(s.etaOnTimeRate)}
            hint={`${formatCount(data.eta.onTime)} delivered on ETA`}
            icon={CheckCircle2}
          />
          <HeroStat
            label="Avg delivery"
            value={`${s.avgMinutes.toFixed(0)} min`}
            hint="Delivered orders only"
            icon={Timer}
          />
          <HeroStat
            label="Delivered GMV"
            value={formatInr(s.gmv, true)}
            hint={`${formatCount(s.orders)} orders in period`}
            icon={ShoppingCart}
          />
        </div>
      </section>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <ScoreCard
          label="Cancel rate"
          value={formatPct(s.cancelRate)}
          hint={`${formatCount(s.cancelled)} cancelled`}
          tone={s.cancelRate <= 8 ? "good" : s.cancelRate <= 15 ? "warn" : "bad"}
          icon={XCircle}
        />
        <ScoreCard
          label="Fail / reject"
          value={formatPct(s.failRate)}
          hint={`${formatCount(s.failed)} failed or rejected`}
          tone={s.failRate <= 3 ? "good" : s.failRate <= 8 ? "warn" : "bad"}
          icon={AlertTriangle}
        />
        <ScoreCard
          label="ETA breach"
          value={formatPct(s.etaBreachRate)}
          hint={`${formatCount(data.eta.breached)} breaches`}
          tone={s.etaBreachRate <= 10 ? "good" : s.etaBreachRate <= 20 ? "warn" : "bad"}
          icon={Clock3}
        />
        <ScoreCard
          label="Orders volume"
          value={formatCount(s.orders)}
          hint={`${formatCount(s.live)} still live`}
          tone="neutral"
          icon={TrendingUp}
        />
      </div>

      <div className="grid min-w-0 gap-4 xl:grid-cols-5">
        <Panel title="Daily delivery flow" className="xl:col-span-3">
          <p className="-mt-2 mb-3 text-[12px] text-[#6B6894]">
            Orders vs delivered / cancelled / failed by day (IST)
          </p>
          <CompletionTrend data={data.daily} />
        </Panel>
        <Panel title="Completion vs cancel %" className="xl:col-span-2">
          <p className="-mt-2 mb-3 text-[12px] text-[#6B6894]">Top services by volume</p>
          <PerfBars data={rateBars} />
        </Panel>
      </div>

      <div className="grid min-w-0 gap-4 xl:grid-cols-3">
        <Panel title="Best completion">
          <div className="space-y-2">
            {best.length === 0 ? (
              <p className="py-6 text-center text-[13px] text-[#6B6894]">Not enough volume yet.</p>
            ) : (
              best.map((r, i) => (
                <RankRow
                  key={r.type}
                  rank={i + 1}
                  title={prettyLabel(r.type)}
                  primary={formatPct(r.completionRate)}
                  secondary={`${formatCount(r.delivered)} delivered · ${formatCount(r.orders)} orders`}
                  tone="good"
                />
              ))
            )}
          </div>
        </Panel>
        <Panel title="Slowest services">
          <div className="space-y-2">
            {slowest.length === 0 ? (
              <p className="py-6 text-center text-[13px] text-[#6B6894]">No delivered timing yet.</p>
            ) : (
              slowest.map((r, i) => (
                <RankRow
                  key={r.type}
                  rank={i + 1}
                  title={prettyLabel(r.type)}
                  primary={`${r.avgMinutes.toFixed(0)}m`}
                  secondary={`${formatCount(r.delivered)} delivered`}
                  tone="neutral"
                />
              ))
            )}
          </div>
        </Panel>
        <Panel title="Highest risk">
          <div className="space-y-2">
            {riskiest.length === 0 ? (
              <p className="py-6 text-center text-[13px] text-[#6B6894]">No risk signals.</p>
            ) : (
              riskiest.map((r, i) => (
                <RankRow
                  key={r.type}
                  rank={i + 1}
                  title={prettyLabel(r.type)}
                  primary={formatPct(r.cancelRate + r.failRate)}
                  secondary={`Cancel ${formatPct(r.cancelRate)} · Fail ${formatPct(r.failRate)}`}
                  tone="bad"
                />
              ))
            )}
          </div>
        </Panel>
      </div>

      <div className="grid min-w-0 gap-4 xl:grid-cols-2">
        <Panel title="Status mix">
          <SharePie data={statusPie} />
        </Panel>
        <Panel title="Food / grocery store types">
          <SharePie data={storePie} />
        </Panel>
      </div>

      <Panel title="Service performance">
        <p className="-mt-2 mb-3 text-[12px] text-[#6B6894]">
          Full breakdown — completion, cancels, failures, ETA breaches, speed, and GMV
        </p>
        <DataTable
          pageSize={10}
          columns={[
            "Service",
            "Orders",
            "Delivered",
            "Cancelled",
            "Failed",
            "Completion",
            "Cancel",
            "Fail",
            "ETA breach",
            "Avg min",
            <GmvHead key="gmv" />,
          ]}
          rows={data.byType.map((r) => [
            prettyLabel(r.type),
            formatCount(r.orders),
            formatCount(r.delivered),
            formatCount(r.cancelled),
            formatCount(r.failed),
            formatPct(r.completionRate),
            formatPct(r.cancelRate),
            formatPct(r.failRate),
            formatCount(r.etaBreached),
            r.avgMinutes.toFixed(1),
            formatInr(r.gmv),
          ])}
        />
      </Panel>

      <Panel title="Store type performance">
        <p className="-mt-2 mb-3 text-[12px] text-[#6B6894]">Food / grocery / mart / pharmacy only</p>
        <DataTable
          pageSize={10}
          columns={["Store type", "Orders", "Delivered", <GmvHead key="gmv" />]}
          rows={
            data.storeTypes.length
              ? data.storeTypes.map((r) => [
                  prettyLabel(r.storeType),
                  formatCount(r.orders),
                  formatCount(r.delivered),
                  formatInr(r.gmv),
                ])
              : [["No store-type volume", "—", "—", "—"]]
          }
        />
      </Panel>
    </div>
  );
}
