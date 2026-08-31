"use client";

import { useMemo, useState } from "react";
import { Bike, ShieldCheck, Wallet } from "lucide-react";
import { useCoreData } from "@/lib/hooks/useCoreData";
import { formatCount, formatDateTime, formatInr } from "@/lib/format";
import { DataTable, ErrorState, KpiCard, LoadingGrid, Panel, RecordSearch, StatusPill } from "@/components/ui/Primitives";
import { SharePie } from "@/components/charts/Charts";
import type { RidersData as Data } from "@/lib/data-types";

export default function RidersPage() {
  const { data, loading, error, reload } = useCoreData<Data>("/api/riders");
  const [q, setQ] = useState("");
  const rows = useMemo(() => {
    if (!data) return [];
    const needle = q.trim().toLowerCase();
    if (!needle) return data.recent;
    return data.recent.filter((r) =>
      [r.name, r.mobile, r.city, r.status, r.availability, r.kyc, r.vehicle, String(r.id)].join(" ").toLowerCase().includes(needle)
    );
  }, [data, q]);

  if (loading) return <LoadingGrid />;
  if (error || !data) return <ErrorState message={error || "Failed"} onRetry={reload} />;

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Riders" value={formatCount(data.stats.total)} icon={Bike} />
        <KpiCard label="Online now" value={formatCount(data.stats.online)} icon={Bike} tone="green" />
        <KpiCard label="KYC verified" value={formatCount(data.stats.kyc)} icon={ShieldCheck} tone="sky" />
        <KpiCard label="Wallet float" value={formatInr(data.stats.wallet, true)} icon={Wallet} tone="lavender" />
      </div>
      <div className="grid gap-4 xl:grid-cols-3">
        <Panel title="By city">
          <SharePie data={data.cities.map((r) => ({ name: r.city, value: r.count }))} />
        </Panel>
        <Panel title="Rider records" className="xl:col-span-2">
          <RecordSearch value={q} onChange={setQ} placeholder="Search name, mobile, city, KYC…" count={rows.length} />
          <DataTable
            pageSize={10}
            columns={["Name", "Mobile", "City", "Vehicle", "KYC", "Status", "Duty", "Deliveries", "Earnings", "Wallet", "Joined"]}
            rows={rows.map((r) => [
              r.name,
              r.mobile,
              r.city,
              r.vehicle,
              <StatusPill key={`${r.id}-k`} value={r.kyc} />,
              <StatusPill key={`${r.id}-s`} value={r.status} />,
              <StatusPill key={`${r.id}-a`} value={r.availability} />,
              formatCount(r.deliveries),
              formatInr(r.earnings),
              formatInr(r.wallet),
              formatDateTime(r.createdAt),
            ])}
          />
        </Panel>
      </div>
    </div>
  );
}
