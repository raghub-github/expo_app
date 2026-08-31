"use client";

import { useMemo, useState } from "react";
import { UserCircle, UserPlus, Wallet } from "lucide-react";
import { useCoreData } from "@/lib/hooks/useCoreData";
import { formatCount, formatDateTime, formatInr } from "@/lib/format";
import { DataTable, ErrorState, GmvHead, KpiCard, LoadingGrid, Panel, RecordSearch, StatusPill } from "@/components/ui/Primitives";
import { SharePie } from "@/components/charts/Charts";
import type { CustomersData as Data } from "@/lib/data-types";

export default function CustomersPage() {
  const { data, loading, error, reload } = useCoreData<Data>("/api/customers");
  const [q, setQ] = useState("");
  const rows = useMemo(() => {
    if (!data) return [];
    const needle = q.trim().toLowerCase();
    if (!needle) return data.recent;
    return data.recent.filter((r) =>
      [r.name, r.email, r.mobile, r.city, r.status, r.id].join(" ").toLowerCase().includes(needle)
    );
  }, [data, q]);

  if (loading) return <LoadingGrid />;
  if (error || !data) return <ErrorState message={error || "Failed"} onRetry={reload} />;

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-3">
        <KpiCard label="Customers" value={formatCount(data.stats.total)} icon={UserCircle} />
        <KpiCard label="New in period" value={formatCount(data.stats.newInPeriod)} icon={UserPlus} tone="sky" />
        <KpiCard label="Wallet balance" value={formatInr(data.stats.wallet, true)} icon={Wallet} tone="lavender" />
      </div>
      <div className="grid gap-4 xl:grid-cols-3">
        <Panel title="By state">
          <SharePie data={data.states.map((r) => ({ name: r.state, value: r.count }))} />
        </Panel>
        <Panel title="Customer records" className="xl:col-span-2">
          <RecordSearch value={q} onChange={setQ} placeholder="Search name, mobile, email, city…" count={rows.length} />
          <DataTable
            pageSize={10}
            columns={["Name", "Mobile", "Email", "City", "Orders", <GmvHead key="gmv" />, "Wallet", "Status", "Joined"]}
            rows={rows.map((r) => [
              r.name,
              r.mobile,
              r.email,
              r.city,
              formatCount(r.orders),
              formatInr(r.gmv),
              formatInr(r.wallet),
              <StatusPill key={r.id} value={r.status} />,
              formatDateTime(r.createdAt),
            ])}
          />
        </Panel>
      </div>
    </div>
  );
}
