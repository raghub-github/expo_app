"use client";

import { useCoreData } from "@/lib/hooks/useCoreData";
import { formatCount, formatInr, formatPct, prettyLabel } from "@/lib/format";
import { DataTable, ErrorState, GmvHead, KpiCard, LoadingGrid, Panel } from "@/components/ui/Primitives";
import { SharePie } from "@/components/charts/Charts";
import { Gauge, Timer, XCircle } from "lucide-react";
import type { PerformanceData as Data } from "@/lib/data-types";

export default function PerformancePage() {
  const { data, loading, error, reload } = useCoreData<Data>("/api/performance");
  if (loading) return <LoadingGrid />;
  if (error || !data) return <ErrorState message={error || "Failed"} onRetry={reload} />;

  const total = data.byType.reduce((s, r) => s + r.orders, 0);
  const delivered = data.byType.reduce((s, r) => s + r.delivered, 0);
  const cancelled = data.byType.reduce((s, r) => s + r.cancelled, 0);
  const avgMin =
    data.byType.reduce((s, r) => s + r.avgMinutes * r.delivered, 0) / Math.max(delivered, 1);

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-3">
        <KpiCard label="Completion rate" value={formatPct(total ? (delivered / total) * 100 : 0)} icon={Gauge} />
        <KpiCard label="Cancel rate" value={formatPct(total ? (cancelled / total) * 100 : 0)} icon={XCircle} tone="coral" />
        <KpiCard label="Avg delivery time" value={`${avgMin.toFixed(0)} min`} icon={Timer} tone="sky" />
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <Panel title="Status mix">
          <SharePie data={data.byStatus.map((r) => ({ name: prettyLabel(r.status), value: r.orders }))} />
        </Panel>
        <Panel title="Food store types">
          <SharePie data={data.storeTypes.map((r) => ({ name: prettyLabel(r.storeType), value: r.orders }))} />
        </Panel>
      </div>
      <Panel title="Service performance">
        <DataTable
          columns={["Service", "Orders", "Delivered", "Cancelled", "Completion", "Cancel", "Avg min", <GmvHead key="gmv" />]}
          rows={data.byType.map((r) => [
            prettyLabel(r.type),
            formatCount(r.orders),
            formatCount(r.delivered),
            formatCount(r.cancelled),
            formatPct(r.completionRate),
            formatPct(r.cancelRate),
            r.avgMinutes.toFixed(1),
            formatInr(r.gmv),
          ])}
        />
      </Panel>
    </div>
  );
}
