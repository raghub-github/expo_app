"use client";

import { useCoreData } from "@/lib/hooks/useCoreData";
import { formatCount, formatInr, prettyLabel } from "@/lib/format";
import { DataTable, ErrorState, GmvHead, LoadingGrid, Panel } from "@/components/ui/Primitives";
import { HourlyLine, SharePie } from "@/components/charts/Charts";
import type { AnalyticsData as Data } from "@/lib/data-types";

export default function AnalyticsPage() {
  const { data, loading, error, reload } = useCoreData<Data>("/api/analytics");
  if (loading) return <LoadingGrid />;
  if (error || !data) return <ErrorState message={error || "Failed"} onRetry={reload} />;

  return (
    <div className="space-y-5">
      <div className="grid gap-4 xl:grid-cols-2">
        <Panel title="Orders by hour (IST)">
          <HourlyLine data={data.hourly} />
        </Panel>
        <Panel title="Payment mix">
          <SharePie data={data.paymentMix.map((r) => ({ name: prettyLabel(r.method), value: r.amount }))} />
        </Panel>
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <Panel title="Top stores by GMV">
          <p className="-mt-2 mb-3 text-[11px] text-[#8B89B3]">Gross Merchandise Value</p>
          <DataTable
            columns={["Store", "Orders", <GmvHead key="gmv" />]}
            rows={data.topStores.map((r) => [r.name, formatCount(r.orders), formatInr(r.gmv)])}
          />
        </Panel>
        <Panel title="Rider cities">
          <DataTable
            columns={["City", "Riders"]}
            rows={data.riderCities.map((r) => [r.city, formatCount(r.riders)])}
          />
        </Panel>
      </div>
    </div>
  );
}
