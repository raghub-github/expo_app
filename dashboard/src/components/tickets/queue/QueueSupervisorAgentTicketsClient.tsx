"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAppPathname, useAppSearchParams } from "@/hooks/useAppSearchParams";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { RefreshCw, Copy } from "lucide-react";
import { fetchTickets } from "@/hooks/tickets/useTickets";
import { useTicketsAgentsQuery } from "@/hooks/tickets/useTicketsAgentsQuery";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { InlineSearchableSelect } from "@/components/tickets/InlineSearchableSelect";

const KOLKATA_TZ = "Asia/Kolkata";

/** Single-select status filter; API uses uppercase enums; OPEN_FRT is handled in GET /api/tickets. */
type SupervisorTicketStatusFilter =
  | "all"
  | "OPEN"
  | "OPEN_FRT"
  | "IN_PROGRESS"
  | "RESOLVED"
  | "CLOSED"
  | "REJECTED"
  | "REOPENED"
  | "PENDING"
  | "WAITING_FOR_USER"
  | "PROVISIONALLY_RESOLVED";

const STATUS_OPTIONS: { id: SupervisorTicketStatusFilter; label: string; apiStatuses?: string[] }[] = [
  { id: "all", label: "All" },
  { id: "OPEN", label: "Open", apiStatuses: ["OPEN"] },
  { id: "OPEN_FRT", label: "Open FRT", apiStatuses: ["OPEN_FRT"] },
  { id: "IN_PROGRESS", label: "In Progress", apiStatuses: ["IN_PROGRESS"] },
  { id: "RESOLVED", label: "Resolved", apiStatuses: ["RESOLVED"] },
  { id: "CLOSED", label: "Closed", apiStatuses: ["CLOSED"] },
  { id: "REJECTED", label: "Rejected", apiStatuses: ["REJECTED"] },
  { id: "REOPENED", label: "Reopened", apiStatuses: ["REOPENED"] },
  { id: "PENDING", label: "Pending", apiStatuses: ["PENDING"] },
  { id: "WAITING_FOR_USER", label: "Waiting for User", apiStatuses: ["WAITING_FOR_USER"] },
  { id: "PROVISIONALLY_RESOLVED", label: "Provisionally Resolved", apiStatuses: ["PROVISIONALLY_RESOLVED"] },
];

function formatAssignedAt(raw: string | null | undefined): string {
  if (!raw || String(raw).trim() === "") return "—";
  let n = String(raw).trim();
  if (/^\d{4}-\d{2}-\d{2} /.test(n)) n = n.replace(" ", "T");
  n = n.replace(/([+-])(\d{2})$/, "$1$2:00");
  const d = new Date(n);
  if (!Number.isFinite(d.getTime())) return "—";
  if (d.getFullYear() < 2000) return "—";
  try {
    return new Intl.DateTimeFormat("en-IN", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: KOLKATA_TZ,
    }).format(d);
  } catch {
    return "—";
  }
}

function ticketTitle(t: { title: string | null; subject: string }): string {
  const a = (t.title ?? "").trim();
  if (a) return a;
  return (t.subject ?? "").trim() || "—";
}

function statusLabel(raw: string): string {
  const u = raw.toUpperCase();
  const pretty: Record<string, string> = {
    OPEN_FRT: "Open FRT",
    IN_PROGRESS: "In Progress",
    WAITING_FOR_USER: "Waiting for User",
    PROVISIONALLY_RESOLVED: "Provisionally Resolved",
  };
  if (pretty[u]) return pretty[u];
  const s = raw.replace(/_/g, " ").toLowerCase();
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}

export function QueueSupervisorAgentTicketsClient() {
  const queryClient = useQueryClient();
  const router = useRouter();
  const pathname = useAppPathname();
  const searchParams = useAppSearchParams();
  const agentIdFromUrl = (searchParams.get("agentId") ?? "").trim();

  const { data: agentsData, isLoading: agentsLoading } = useTicketsAgentsQuery({ includePresence: false });
  const agents = agentsData?.agents ?? [];
  const [selectedAgentId, setSelectedAgentId] = useState("");
  const [statusFilter, setStatusFilter] = useState<SupervisorTicketStatusFilter>("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const syncAgentIdToUrl = useCallback(
    (id: string) => {
      const p = new URLSearchParams(searchParams.toString());
      const t = id.trim();
      if (t) p.set("agentId", t);
      else p.delete("agentId");
      const qs = p.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [router, pathname, searchParams]
  );

  useEffect(() => {
    if (agents.length === 0) return;
    if (agentIdFromUrl && agents.some((a) => String(a.id) === agentIdFromUrl)) {
      setSelectedAgentId(agentIdFromUrl);
      return;
    }
    setSelectedAgentId("");
  }, [agents, agentIdFromUrl]);

  const agentOptions = useMemo(
    () => agents.map((a) => ({ value: String(a.id), label: a.name?.trim() ? a.name : a.email })),
    [agents]
  );

  const statusSelectOptions = useMemo(
    () => STATUS_OPTIONS.map((p) => ({ value: p.id, label: p.label })),
    []
  );

  const statusesFilter = useMemo(() => {
    if (statusFilter === "all") return undefined;
    const row = STATUS_OPTIONS.find((x) => x.id === statusFilter);
    return row?.apiStatuses;
  }, [statusFilter]);

  const { data, isPending: ticketsPending, isFetching, refetch } = useQuery({
    queryKey: [
      "queue-supervisor",
      "agent-tickets",
      selectedAgentId,
      statusFilter,
      dateFrom,
      dateTo,
    ],
    queryFn: () =>
      fetchTickets({
        assignedToIds: selectedAgentId ? [selectedAgentId] : [],
        statuses: statusesFilter,
        dateFrom: dateFrom.trim() || undefined,
        dateTo: dateTo.trim() || undefined,
        limit: 80,
        offset: 0,
      }),
    enabled: Boolean(selectedAgentId),
    staleTime: 60_000,
  });

  const tickets = data?.tickets ?? [];

  const totalRowsLabel =
    !selectedAgentId || agentsLoading
      ? "—"
      : ticketsPending
        ? "…"
        : String(tickets.length);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-gray-50/80">
      <div className="relative z-20 w-full min-w-0 shrink-0 border-b border-gray-200 bg-white px-4 py-2.5">
        <div className="flex w-full min-w-0 flex-nowrap items-center justify-between gap-8 overflow-x-auto overflow-y-visible [scrollbar-width:thin]">
          <div
            className="flex shrink-0 items-center gap-3"
            title="Rows currently shown in the table for the selected filters"
          >
            <span className="whitespace-nowrap text-[11px] font-semibold uppercase tracking-wide text-gray-500">
              Total
            </span>
            <span className="min-w-[1.75rem] text-2xl font-semibold tabular-nums leading-none text-slate-900">
              {totalRowsLabel}
            </span>
          </div>
          <div className="flex min-w-0 flex-nowrap items-center justify-end gap-4 pl-2">
            <div className="flex shrink-0 items-center gap-2">
              <span className="whitespace-nowrap text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                Agent
              </span>
              <div className="h-9 w-[148px] rounded-lg border border-gray-200 bg-white px-2 shadow-sm shadow-gray-200/30">
                <InlineSearchableSelect
                  value={selectedAgentId}
                  options={agentOptions}
                  onChange={(id) => {
                    setSelectedAgentId(id);
                    syncAgentIdToUrl(id);
                  }}
                  placeholder="Choose an agent"
                  allowUnset
                  unsetLabel="Choose an agent"
                  fullWidth
                  dropdownMatchTriggerWidth
                  className="border-0 bg-transparent p-0 shadow-none ring-0 [&_button]:h-9 [&_button]:min-h-0 [&_button]:py-0 [&_button]:text-sm"
                />
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <span className="whitespace-nowrap text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                Status
              </span>
              <div className="h-9 w-[124px] rounded-lg border border-gray-200 bg-white px-2 shadow-sm shadow-gray-200/30">
                <InlineSearchableSelect
                  value={statusFilter}
                  options={statusSelectOptions}
                  onChange={(v) => setStatusFilter(v as SupervisorTicketStatusFilter)}
                  placeholder="Status"
                  fullWidth
                  dropdownMatchTriggerWidth
                  showSearch={false}
                  className="border-0 bg-transparent p-0 shadow-none ring-0 [&_button]:h-9 [&_button]:min-h-0 [&_button]:py-0 [&_button]:text-sm"
                />
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <label
                htmlFor="supervisor-tkt-date-from"
                className="whitespace-nowrap text-[11px] font-semibold uppercase tracking-wide text-gray-500"
              >
                From
              </label>
              <div className="flex h-9 w-[132px] items-center rounded-lg border border-gray-200 bg-white px-2 shadow-sm shadow-gray-200/30">
                <input
                  id="supervisor-tkt-date-from"
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  title="Filter by ticket created date (start)"
                  className="w-full min-w-0 border-0 bg-transparent p-0 text-sm text-gray-900 outline-none focus:ring-0"
                />
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <label
                htmlFor="supervisor-tkt-date-to"
                className="whitespace-nowrap text-[11px] font-semibold uppercase tracking-wide text-gray-500"
              >
                To
              </label>
              <div className="flex h-9 w-[132px] items-center rounded-lg border border-gray-200 bg-white px-2 shadow-sm shadow-gray-200/30">
                <input
                  id="supervisor-tkt-date-to"
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  title="Filter by ticket created date (end)"
                  className="w-full min-w-0 border-0 bg-transparent p-0 text-sm text-gray-900 outline-none focus:ring-0"
                />
              </div>
            </div>
            <button
              type="button"
              disabled={!selectedAgentId}
              onClick={() => {
                void queryClient.invalidateQueries({ queryKey: ["queue-supervisor", "agent-tickets"] });
                void refetch();
              }}
              className="inline-flex h-9 shrink-0 items-center gap-2 whitespace-nowrap rounded-lg border border-gray-200 bg-white px-3 text-sm font-medium text-gray-800 shadow-sm shadow-gray-200/30 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <RefreshCw className={`h-4 w-4 shrink-0 ${isFetching ? "animate-spin text-gray-700" : ""}`} aria-hidden />
              Reload tickets
            </button>
          </div>
        </div>
      </div>

      <div className="min-h-0 w-full min-w-0 flex-1 overflow-auto px-4 py-4">
        <div className="w-full min-w-0">
          {agentsLoading ? (
            <div className="flex justify-center py-20">
              <LoadingSpinner size="lg" />
            </div>
          ) : agents.length === 0 ? (
            <p className="rounded-xl border border-dashed border-gray-300 bg-white/80 px-4 py-10 text-center text-sm text-gray-600">
              No agents found.
            </p>
          ) : !selectedAgentId ? (
            <p className="text-sm text-gray-500">Select an agent.</p>
          ) : ticketsPending ? (
            <div className="flex justify-center py-20">
              <LoadingSpinner size="md" />
            </div>
          ) : (
            <div className="overflow-x-auto bg-transparent">
              <table className="w-max min-w-full border-collapse border border-gray-200 text-left text-sm">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-100">
                    <th className="whitespace-nowrap px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-gray-700">
                      Ticket ID
                    </th>
                    <th className="whitespace-nowrap px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-gray-700">
                      Group
                    </th>
                    <th className="whitespace-nowrap px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-gray-700">
                      Title
                    </th>
                    <th className="whitespace-nowrap px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-gray-700">
                      Status
                    </th>
                    <th className="whitespace-nowrap px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-gray-700">
                      Assigned at
                    </th>
                    <th className="whitespace-nowrap px-4 py-2.5 text-center text-xs font-semibold uppercase tracking-wide text-gray-700">
                      Rating
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {tickets.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="border-b border-gray-200 bg-white px-4 py-10 text-center text-sm text-gray-500">
                        No tickets for this agent with the selected filters.
                      </td>
                    </tr>
                  ) : (
                    tickets.map((t) => (
                      <tr key={t.id} className="border-b border-gray-200 bg-white hover:bg-gray-50/80">
                        <td className="whitespace-nowrap px-4 py-3">
                          <span className="inline-flex items-center gap-1.5">
                            <span className="font-medium text-gray-900">{t.ticketNumber}</span>
                            <button
                              type="button"
                              onClick={() => {
                                const id = t.ticketNumber?.trim() || String(t.id);
                                void navigator.clipboard.writeText(id).catch(() => {});
                              }}
                              className="rounded p-0.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                              aria-label={`Copy ticket ID ${t.ticketNumber}`}
                            >
                              <Copy className="h-3.5 w-3.5 shrink-0" aria-hidden />
                            </button>
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-gray-800">
                          {t.group?.name?.trim() ? t.group.name : "—"}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-gray-900">{ticketTitle(t)}</td>
                        <td className="whitespace-nowrap px-4 py-3 text-gray-800">{statusLabel(t.status)}</td>
                        <td className="whitespace-nowrap px-4 py-3 text-gray-700 tabular-nums">
                          {formatAssignedAt(t.assignedAt ?? null)}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-center text-gray-800 tabular-nums">
                          {t.satisfactionRating != null ? (
                            <span title="Customer satisfaction">{t.satisfactionRating}★</span>
                          ) : (
                            "—"
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
              {data && data.total > tickets.length ? (
                <p className="mt-2 text-center text-xs text-gray-600">
                  Showing {tickets.length} of {data.total}. Refine filters or open the main tickets list for more.
                </p>
              ) : null}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
