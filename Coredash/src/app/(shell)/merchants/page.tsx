"use client";

import { useMemo, useState } from "react";
import { Store } from "lucide-react";
import { useCoreData } from "@/lib/hooks/useCoreData";
import { formatCount, formatDateTime, formatInr, prettyLabel } from "@/lib/format";
import { DataTable, ErrorState, KpiCard, LoadingGrid, Panel, RecordSearch, StatusPill } from "@/components/ui/Primitives";
import { CtmBars, SharePie } from "@/components/charts/Charts";
import type { MerchantsData as Data } from "@/lib/data-types";

export default function MerchantsPage() {
  const { data, loading, error, reload } = useCoreData<Data>("/api/merchants");
  const [q, setQ] = useState("");
  const rows = useMemo(() => {
    if (!data) return [];
    const needle = q.trim().toLowerCase();
    if (!needle) return data.recent;
    return data.recent.filter((r) =>
      [r.name, r.storeId, r.city, r.type, r.status].join(" ").toLowerCase().includes(needle)
    );
  }, [data, q]);

  if (loading) return <LoadingGrid />;
  if (error || !data) return <ErrorState message={error || "Failed"} onRetry={reload} />;

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Stores" value={formatCount(data.stats.total)} icon={Store} />
        <KpiCard label="Live" value={formatCount(data.stats.live)} icon={Store} tone="green" />
        <KpiCard label="Accepting orders" value={formatCount(data.stats.accepting)} icon={Store} tone="sky" />
        <KpiCard label="New in period" value={formatCount(data.stats.newInPeriod)} icon={Store} tone="lavender" />
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <Panel title="Store types">
          <SharePie data={data.types.map((r) => ({ name: prettyLabel(r.type), value: r.count }))} />
        </Panel>
        <Panel title="Customer total by store">
          <CtmBars data={data.byCtm ?? []} />
        </Panel>
      </div>
      <Panel title="Merchant records">
        <RecordSearch value={q} onChange={setQ} placeholder="Search store, city, type, ID…" count={rows.length} />
        <DataTable
          pageSize={10}
          columns={["Store", "ID", "City", "Type", "Status", "Live", "Orders", "CTM total", "Packaging", "Commission", "Created"]}
          rows={rows.map((r) => [
            r.name,
            r.storeId,
            r.city,
            prettyLabel(r.type),
            <StatusPill key={r.storeId} value={r.status} />,
            r.live ? "Yes" : "No",
            formatCount(r.orders),
            formatInr(r.gmv),
            formatInr(r.packaging ?? 0),
            formatInr(r.commission),
            formatDateTime(r.createdAt),
          ])}
        />
        <p className="mt-3 text-[12px] text-[#6B6894]">
          CTM total is the frozen merchant total (items + packaging after store offers), not the GST-inclusive customer item price.
        </p>
      </Panel>
    </div>
  );
}
