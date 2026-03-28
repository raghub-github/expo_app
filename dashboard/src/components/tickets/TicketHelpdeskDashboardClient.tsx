"use client";

import { useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { CalendarDays, Plus } from "lucide-react";
import { useTicketsReferenceDataQuery } from "@/hooks/tickets/useTicketsReferenceDataQuery";

const TICKETS_LIST_PATH = "/dashboard/tickets";

/** Same active pipeline as helpdesk Unresolved card (excludes resolved/closed/cancelled/rejected). */
const UNRESOLVED_STATUS_PARAM =
  "open,in_progress,waiting_for_user,waiting_for_merchant,waiting_for_rider,escalated,reopened,pending,provisionally_resolved";

const ON_HOLD_STATUS_PARAM = "waiting_for_user,waiting_for_merchant,waiting_for_rider";

function ticketsFilteredHref(query: Record<string, string>, groupId: string): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v) p.set(k, v);
  }
  if (groupId && groupId !== "all") p.set("groupIds", groupId);
  const qs = p.toString();
  return qs ? `${TICKETS_LIST_PATH}?${qs}` : TICKETS_LIST_PATH;
}

interface HelpdeskDashboardData {
  unresolved: number;
  open: number;
  onHold: number;
  unassigned: number;
  undeliveredByGroup: { groupName: string; count: number }[];
  unresolvedByGroup: { groupName: string; count: number }[];
  groupIdFilter: number | null;
}

async function fetchHelpdeskDashboard(groupId: string): Promise<HelpdeskDashboardData> {
  const q = groupId && groupId !== "all" ? `?groupId=${encodeURIComponent(groupId)}` : "";
  const r = await fetch(`/api/tickets/helpdesk-dashboard${q}`, { credentials: "include" });
  const d = r.ok ? await r.json().catch(() => ({ success: false })) : { success: false };
  if (!d.success || !d.data) {
    throw new Error(d.error || "Failed to load dashboard");
  }
  return d.data as HelpdeskDashboardData;
}

function fmt(n: number) {
  return Number.isFinite(n) ? n.toLocaleString("en-IN") : "0";
}

function SummaryCardLink({
  label,
  value,
  href,
  ariaLabel,
}: {
  label: string;
  value: number;
  href: string;
  ariaLabel: string;
}) {
  return (
    <Link
      href={href}
      aria-label={ariaLabel}
      className="block rounded-lg border border-gray-200/80 bg-white p-5 shadow-sm transition-all hover:border-blue-300 hover:bg-blue-50/50 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
    >
      <p className="text-xs font-medium text-gray-500">{label}</p>
      <p className="mt-2 text-3xl font-bold tabular-nums tracking-tight text-gray-900">{fmt(value)}</p>
    </Link>
  );
}

function WidgetShell({
  title,
  subtitle,
  action,
  children,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-[220px] flex-col rounded-lg border border-gray-200/80 bg-white shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-2 border-b border-gray-100 px-5 py-4">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-gray-900">{title}</h2>
          {subtitle ? <p className="mt-0.5 text-xs text-gray-500">{subtitle}</p> : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      <div className="min-h-0 flex-1 px-5 py-4">{children}</div>
    </div>
  );
}

function GroupCountTable({
  rows,
  valueHeader,
}: {
  rows: { groupName: string; count: number }[];
  valueHeader: string;
}) {
  if (rows.length === 0) {
    return <p className="text-sm text-gray-500">No data for this filter.</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-100 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
            <th className="pb-2 pr-3 font-medium">Group</th>
            <th className="pb-2 text-right font-medium">{valueHeader}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, idx) => (
            <tr key={`${row.groupName}-${idx}`} className="border-b border-gray-50 last:border-b-0">
              <td className="py-2.5 pr-3 text-gray-700">{row.groupName}</td>
              <td className="py-2.5 text-right font-semibold tabular-nums text-gray-900">{fmt(row.count)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function TicketHelpdeskDashboardClient() {
  const [groupId, setGroupId] = useState<string>("all");
  const { data: refData } = useTicketsReferenceDataQuery();

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ["tickets", "helpdesk-dashboard", groupId],
    queryFn: () => fetchHelpdeskDashboard(groupId),
    staleTime: 30_000,
  });

  const groups = refData?.groups ?? [];

  const hrefUnresolved = useMemo(
    () => ticketsFilteredHref({ status: UNRESOLVED_STATUS_PARAM }, groupId),
    [groupId]
  );
  const hrefOpen = useMemo(() => ticketsFilteredHref({ status: "open" }, groupId), [groupId]);
  const hrefOnHold = useMemo(
    () => ticketsFilteredHref({ status: ON_HOLD_STATUS_PARAM }, groupId),
    [groupId]
  );
  const hrefUnassigned = useMemo(
    () => ticketsFilteredHref({ assignedToIds: "unassigned" }, groupId),
    [groupId]
  );

  return (
    <div className="mx-auto w-full max-w-[1200px] space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <label className="sr-only" htmlFor="helpdesk-group-filter">
          All groups
        </label>
        <select
          id="helpdesk-group-filter"
          value={groupId}
          onChange={(e) => setGroupId(e.target.value)}
          className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        >
          <option value="all">All groups</option>
          {groups.map((g) => (
            <option key={g.id} value={String(g.id)}>
              {g.groupName}
            </option>
          ))}
        </select>
        {isFetching && !isLoading ? (
          <span className="text-xs text-gray-400">Updating…</span>
        ) : null}
      </div>

      {isError ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error instanceof Error ? error.message : "Could not load metrics."}
          <button type="button" className="ml-3 font-semibold text-red-900 underline" onClick={() => refetch()}>
            Retry
          </button>
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {isLoading || !data ? (
          <>
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-28 animate-pulse rounded-lg border border-gray-200 bg-white shadow-sm" />
            ))}
          </>
        ) : (
          <>
            <SummaryCardLink
              label="Unresolved"
              value={data.unresolved}
              href={hrefUnresolved}
              ariaLabel={`Unresolved tickets, ${fmt(data.unresolved)}. Open filtered list.`}
            />
            <SummaryCardLink
              label="Open"
              value={data.open}
              href={hrefOpen}
              ariaLabel={`Open tickets, ${fmt(data.open)}. Open filtered list.`}
            />
            <SummaryCardLink
              label="On hold"
              value={data.onHold}
              href={hrefOnHold}
              ariaLabel={`On hold tickets, ${fmt(data.onHold)}. Open filtered list.`}
            />
            <SummaryCardLink
              label="Unassigned"
              value={data.unassigned}
              href={hrefUnassigned}
              ariaLabel={`Unassigned tickets, ${fmt(data.unassigned)}. Open filtered list.`}
            />
          </>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <WidgetShell
          title="Undelivered emails"
          subtitle="Across helpdesk"
          action={
            <Link href="/dashboard/tickets/unified" className="text-xs font-medium text-blue-600 hover:underline">
              View details
            </Link>
          }
        >
          {isLoading || !data ? (
            <div className="h-32 animate-pulse rounded-md bg-gray-100" />
          ) : (
            <GroupCountTable rows={data.undeliveredByGroup} valueHeader="Count" />
          )}
        </WidgetShell>

        <WidgetShell
          title="To-do"
          action={
            <button
              type="button"
              className="inline-flex items-center gap-1 rounded-md border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-700 shadow-sm hover:bg-gray-50"
            >
              <Plus className="h-3.5 w-3.5" aria-hidden />
              Add a to-do
            </button>
          }
        >
          <div className="flex flex-col items-center justify-center py-10 text-center">
            <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-gray-100 text-gray-400">
              <CalendarDays className="h-7 w-7" aria-hidden />
            </div>
            <p className="text-sm font-medium text-gray-600">You have no tasks to do!</p>
          </div>
        </WidgetShell>

        <WidgetShell
          title="Unresolved tickets"
          subtitle="Across helpdesk"
          action={
            <Link href={hrefUnresolved} className="text-xs font-medium text-blue-600 hover:underline">
              View details
            </Link>
          }
        >
          {isLoading || !data ? (
            <div className="h-32 animate-pulse rounded-md bg-gray-100" />
          ) : (
            <GroupCountTable rows={data.unresolvedByGroup} valueHeader="Open" />
          )}
        </WidgetShell>
      </div>
    </div>
  );
}
