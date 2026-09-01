"use client";

import { useMemo, useState } from "react";
import { useCoreData } from "@/lib/hooks/useCoreData";
import { formatDateTime, formatInr, prettyLabel } from "@/lib/format";
import { DataTable, ErrorState, LoadingGrid, Panel, RecordSearch, StatusPill } from "@/components/ui/Primitives";
import type { OrdersData as Data } from "@/lib/data-types";

export default function OrdersPage() {
  const { data, loading, error, reload } = useCoreData<Data>("/api/orders");
  const [q, setQ] = useState("");
  const rows = useMemo(() => {
    if (!data) return [];
    const needle = q.trim().toLowerCase();
    if (!needle) return data.recent;
    return data.recent.filter((r) =>
      [r.orderId, r.type, r.status, r.paymentMethod, r.customer, r.store, r.rider].join(" ").toLowerCase().includes(needle)
    );
  }, [data, q]);

  if (loading) return <LoadingGrid />;
  if (error || !data) return <ErrorState message={error || "Failed"} onRetry={reload} />;

  return (
    <div className="space-y-5">
      <Panel title="Status by service">
        <DataTable
          columns={["Service", "Status", "Orders"]}
          rows={data.summary.map((r) => [prettyLabel(r.type), <StatusPill key={`${r.type}-${r.status}`} value={r.status} />, String(r.orders)])}
        />
      </Panel>
      <Panel title="Order ledger">
        <RecordSearch value={q} onChange={setQ} placeholder="Search order, customer, store, rider…" count={rows.length} />
        <DataTable
          pageSize={10}
          columns={["Order", "Customer", "Store", "Rider", "Service", "Status", "Pay", "Amount", "GST", "Tip", "Donate", "Placed"]}
          rows={rows.map((r) => [
            r.orderId,
            r.customer,
            r.store,
            r.rider,
            prettyLabel(r.type),
            <StatusPill key={r.id} value={r.status} />,
            prettyLabel(r.paymentMethod || r.paymentStatus),
            formatInr(r.amount),
            formatInr(r.gst),
            formatInr(r.tip),
            formatInr(r.donation),
            formatDateTime(r.createdAt),
          ])}
        />
      </Panel>
    </div>
  );
}
