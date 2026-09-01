"use client";

import { CheckCircle2, Headphones, Ticket } from "lucide-react";
import { useCoreData } from "@/lib/hooks/useCoreData";
import { formatCount, formatDateTime, prettyLabel } from "@/lib/format";
import { DataTable, ErrorState, KpiCard, LoadingGrid, Panel, StatusPill } from "@/components/ui/Primitives";
import { SharePie } from "@/components/charts/Charts";
import type { SupportData as Data } from "@/lib/data-types";

export default function SupportPage() {
  const { data, loading, error, reload } = useCoreData<Data>("/api/support");
  if (loading) return <LoadingGrid />;
  if (error || !data) return <ErrorState message={error || "Failed"} onRetry={reload} />;

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-3">
        <KpiCard label="Tickets in period" value={formatCount(data.stats.total)} icon={Ticket} />
        <KpiCard label="Open now" value={formatCount(data.stats.open)} icon={Headphones} tone="coral" />
        <KpiCard label="Resolved in period" value={formatCount(data.stats.resolved)} icon={CheckCircle2} tone="green" />
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <Panel title="By status">
          <SharePie data={data.byStatus.map((r) => ({ name: prettyLabel(r.status), value: r.count }))} />
        </Panel>
        <Panel title="By source">
          <SharePie data={data.bySource.map((r) => ({ name: prettyLabel(r.source), value: r.count }))} />
        </Panel>
      </div>
      <Panel title="Latest tickets">
        <DataTable
          pageSize={10}
          columns={["Ticket", "Subject", "Source", "Priority", "Status", "Created"]}
          rows={data.recent.map((r) => [
            r.id,
            r.subject,
            prettyLabel(r.source),
            prettyLabel(r.priority),
            <StatusPill key={r.id} value={r.status} />,
            formatDateTime(r.createdAt),
          ])}
        />
      </Panel>
    </div>
  );
}
