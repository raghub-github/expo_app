"use client";

import { useEffect, useLayoutEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  BarChart3,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  Clock3,
  Plus,
  Ticket,
  Trash2,
  UserRound,
} from "lucide-react";
import { useTicketsReferenceDataQuery } from "@/hooks/tickets/useTicketsReferenceDataQuery";
import { loadClientSnapshot, saveClientSnapshot } from "@/lib/client-route-snapshot";
const TICKETS_LIST_PATH = "/dashboard/tickets";

/** Same active pipeline as GatiMitra Queue Unresolved card (excludes resolved/closed/cancelled/rejected). */
const UNRESOLVED_STATUS_PARAM =
  "open,in_progress,waiting_for_user,waiting_for_merchant,waiting_for_rider,escalated,reopened,pending,provisionally_resolved";

function ticketsFilteredHref(
  query: Record<string, string>,
  groupId: string,
  dateOpts?: { dateFrom?: string; dateTo?: string }
): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v) p.set(k, v);
  }
  if (groupId && groupId !== "all") p.set("groupIds", groupId);
  const df = dateOpts?.dateFrom?.trim();
  const dt = dateOpts?.dateTo?.trim();
  if (df) p.set("dateFrom", df);
  if (dt) p.set("dateTo", dt);
  const qs = p.toString();
  return qs ? `${TICKETS_LIST_PATH}?${qs}` : TICKETS_LIST_PATH;
}

interface HelpdeskDashboardData {
  unresolved: number;
  open: number;
  onHold: number;
  unassigned: number;
  total: number;
  resolved: number;
  overdue: number;
  dueToday: number;
  undeliveredByGroup: { groupName: string; count: number }[];
  unresolvedByGroup: { groupName: string; count: number }[];
  groupIdFilter: number | null;
  dateFrom?: string | null;
  dateTo?: string | null;
}

interface HelpdeskTodo {
  id: number;
  title: string;
  done: boolean;
  sortOrder: number;
  createdAt: string | null;
  updatedAt: string | null;
}

const HELPDESK_DASHBOARD_SNAPSHOT_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const HELPDESK_TODOS_SNAPSHOT_KEY = "dashboard_snapshot:helpdeskTodos:v1";
/** Bump when API payload shape changes (avoids stale localStorage missing `total`, etc.). */
const HELPDESK_DASH_SNAPSHOT_VER = "v3";

function emptyDashboardMetrics(groupId: string): HelpdeskDashboardData {
  const n = groupId !== "all" ? parseInt(groupId, 10) : NaN;
  return {
    unresolved: 0,
    open: 0,
    onHold: 0,
    unassigned: 0,
    total: 0,
    resolved: 0,
    overdue: 0,
    dueToday: 0,
    undeliveredByGroup: [],
    unresolvedByGroup: [],
    groupIdFilter: Number.isFinite(n) && n > 0 ? n : null,
  };
}

/** Local calendar YYYY-MM-DD for due-date URL params (aligns with typical DB `date_trunc('day', now())` in same region). */
function localDateISO(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

async function fetchHelpdeskDashboard(
  groupId: string,
  dateFrom: string,
  dateTo: string
): Promise<HelpdeskDashboardData> {
  const sp = new URLSearchParams();
  if (groupId && groupId !== "all") sp.set("groupId", groupId);
  const df = dateFrom.trim();
  const dt = dateTo.trim();
  if (df) sp.set("dateFrom", df);
  if (dt) sp.set("dateTo", dt);
  const qs = sp.toString();
  const r = await fetch(`/api/tickets/helpdesk-dashboard${qs ? `?${qs}` : ""}`, { credentials: "include" });
  const d = r.ok ? await r.json().catch(() => ({ success: false })) : { success: false };
  if (!d.success || !d.data) {
    throw new Error(d.error || "Failed to load dashboard");
  }
  return { ...emptyDashboardMetrics(groupId), ...(d.data as HelpdeskDashboardData) };
}

function fmt(n: number) {
  return Number.isFinite(n) ? n.toLocaleString("en-IN") : "0";
}

function SummaryCardLink({
  label,
  value,
  href,
  ariaLabel,
  icon,
}: {
  label: string;
  value: number;
  href: string;
  ariaLabel: string;
  icon?: ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-label={ariaLabel}
      className="group flex h-[110px] flex-col rounded-md border border-gray-200 bg-white px-4 py-3 transition-colors hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-500"
    >
      <div className="flex min-h-[1.5rem] min-w-0 items-center gap-1.5">
        {icon ? (
          <span className="flex h-5 w-5 shrink-0 items-center justify-center text-slate-500" aria-hidden>
            {icon}
          </span>
        ) : null}
        <p className="min-w-0 flex-1 text-[12px] font-medium leading-tight text-slate-700">
          {label}
        </p>
      </div>
      <div className="flex min-h-0 flex-1 flex-col justify-center px-0.5">
        <p className="text-[34px] font-semibold tabular-nums leading-none tracking-tight text-slate-800">{fmt(value)}</p>
      </div>
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
    <div className="flex min-h-[320px] flex-col rounded-md border border-gray-200 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-1.5 border-b border-gray-200 px-4 py-3">
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-gray-900">{title}</h2>
          {subtitle ? <p className="mt-0.5 text-xs text-gray-500">{subtitle}</p> : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      <div className="min-h-0 flex-1 px-4 py-3">{children}</div>
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
    return <p className="text-xs text-gray-500">No data for this filter.</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-gray-100 text-left text-[10px] font-semibold uppercase tracking-wide text-gray-500">
            <th className="pb-1 pr-2 font-medium">Group</th>
            <th className="pb-1 text-right font-medium">{valueHeader}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, idx) => (
            <tr key={`${row.groupName}-${idx}`} className="border-b border-gray-50 last:border-b-0">
              <td className="py-1.5 pr-2 text-gray-700">{row.groupName}</td>
              <td className="py-1.5 text-right font-semibold tabular-nums text-gray-900">{fmt(row.count)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function TicketHelpdeskDashboardClient() {
  const [groupId, setGroupId] = useState<string>("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [todoAddOpen, setTodoAddOpen] = useState(false);
  const [newTodoTitle, setNewTodoTitle] = useState("");
  const queryClient = useQueryClient();
  const { data: refData } = useTicketsReferenceDataQuery();

  const dateKey = `${dateFrom.trim()}|${dateTo.trim()}`;
  const dashboardSnapshotKey = useMemo(
    () =>
      `dashboard_snapshot:helpdeskDashboard:${HELPDESK_DASH_SNAPSHOT_VER}:${groupId}:${encodeURIComponent(dateKey)}`,
    [groupId, dateKey]
  );

  const dashboardQueryKey = useMemo(
    () => ["tickets", "helpdesk-dashboard", groupId, dateFrom.trim(), dateTo.trim()] as const,
    [groupId, dateFrom, dateTo]
  );

  const { data, isError, error, refetch, isFetching } = useQuery({
    queryKey: dashboardQueryKey,
    queryFn: () => fetchHelpdeskDashboard(groupId, dateFrom, dateTo),
    staleTime: 30_000,
    gcTime: 24 * 60 * 60_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    /** Backup while dashboard is open (realtime + mutations also invalidate this query). */
    refetchInterval: (q) =>
      typeof document !== "undefined" && document.visibilityState === "visible" && q.state.data !== undefined
        ? 25_000
        : false,
  });

  /** localStorage snapshot must not be `initialData` — it is absent on the server and causes hydration mismatch. */
  useLayoutEffect(() => {
    const raw = loadClientSnapshot<HelpdeskDashboardData>(dashboardSnapshotKey, HELPDESK_DASHBOARD_SNAPSHOT_TTL_MS);
    if (!raw || typeof raw.unresolved !== "number") return;
    const merged = { ...emptyDashboardMetrics(groupId), ...raw };
    if (queryClient.getQueryData(dashboardQueryKey) != null) return;
    queryClient.setQueryData(dashboardQueryKey, merged);
  }, [dashboardSnapshotKey, groupId, dashboardQueryKey, queryClient]);

  useEffect(() => {
    if (data) saveClientSnapshot(dashboardSnapshotKey, data);
  }, [data, dashboardSnapshotKey]);

  const metrics = data ?? emptyDashboardMetrics(groupId);

  const todosQueryKey = useMemo(() => ["tickets", "helpdesk-todos"] as const, []);

  const {
    data: todoList,
    isError: todosError,
    error: todosErr,
  } = useQuery({
    queryKey: todosQueryKey,
    queryFn: async (): Promise<HelpdeskTodo[]> => {
      const r = await fetch("/api/tickets/helpdesk-todos", { credentials: "include" });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j?.error || "Failed to load to-dos");
      return (j?.data?.todos ?? []) as HelpdeskTodo[];
    },
    staleTime: 60_000,
    gcTime: 24 * 60 * 60_000,
  });

  useLayoutEffect(() => {
    const raw = loadClientSnapshot<HelpdeskTodo[]>(HELPDESK_TODOS_SNAPSHOT_KEY, HELPDESK_DASHBOARD_SNAPSHOT_TTL_MS);
    if (!Array.isArray(raw)) return;
    if (queryClient.getQueryData(todosQueryKey) != null) return;
    queryClient.setQueryData(todosQueryKey, raw);
  }, [queryClient, todosQueryKey]);

  useEffect(() => {
    if (todoList != null) saveClientSnapshot(HELPDESK_TODOS_SNAPSHOT_KEY, todoList);
  }, [todoList]);

  const todos = todoList ?? [];

  const createTodoMutation = useMutation({
    mutationFn: async (title: string) => {
      const r = await fetch("/api/tickets/helpdesk-todos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ title }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j?.error || "Could not create to-do");
      return j.data.todo as HelpdeskTodo;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tickets", "helpdesk-todos"] });
      setNewTodoTitle("");
      setTodoAddOpen(false);
    },
  });

  const patchTodoMutation = useMutation({
    mutationFn: async ({ id, done }: { id: number; done: boolean }) => {
      const r = await fetch(`/api/tickets/helpdesk-todos/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ done }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j?.error || "Update failed");
      return j.data.todo as HelpdeskTodo;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["tickets", "helpdesk-todos"] }),
  });

  const deleteTodoMutation = useMutation({
    mutationFn: async (id: number) => {
      const r = await fetch(`/api/tickets/helpdesk-todos/${id}`, { method: "DELETE", credentials: "include" });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j?.error || "Delete failed");
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["tickets", "helpdesk-todos"] }),
  });

  const groups = refData?.groups ?? [];

  const dateHrefOpts = useMemo(
    () => ({
      dateFrom: dateFrom.trim() || undefined,
      dateTo: dateTo.trim() || undefined,
    }),
    [dateFrom, dateTo]
  );

  const hrefUnresolved = useMemo(
    () => ticketsFilteredHref({ status: UNRESOLVED_STATUS_PARAM }, groupId, dateHrefOpts),
    [groupId, dateHrefOpts]
  );
  const hrefOpen = useMemo(
    () => ticketsFilteredHref({ status: "open" }, groupId, dateHrefOpts),
    [groupId, dateHrefOpts]
  );
  const hrefUnassigned = useMemo(
    () => ticketsFilteredHref({ assignedToIds: "unassigned" }, groupId, dateHrefOpts),
    [groupId, dateHrefOpts]
  );
  const hrefOverdue = useMemo(
    () => ticketsFilteredHref({ slaBreach: "true" }, groupId, dateHrefOpts),
    [groupId, dateHrefOpts]
  );
  const todayIso = useMemo(() => localDateISO(), []);
  const hrefDueToday = useMemo(
    () => ticketsFilteredHref({ dueFrom: todayIso, dueTo: todayIso }, groupId, dateHrefOpts),
    [groupId, todayIso, dateHrefOpts]
  );
  const hrefResolved = useMemo(
    () => ticketsFilteredHref({ status: "resolved" }, groupId, dateHrefOpts),
    [groupId, dateHrefOpts]
  );
  const hrefTotal = useMemo(() => ticketsFilteredHref({}, groupId, dateHrefOpts), [groupId, dateHrefOpts]);
  const hrefPendingWfu = useMemo(
    () => ticketsFilteredHref({ status: "pending,waiting_for_user" }, groupId, dateHrefOpts),
    [groupId, dateHrefOpts]
  );

  const iconCls = "h-4 w-4";

  return (
    <div className="mx-auto flex w-full max-w-[1400px] min-h-0 flex-1 flex-col gap-3 bg-[#f3f5f7] p-3">
      <div className="flex flex-wrap items-end gap-x-3 gap-y-2 rounded-md border border-gray-200 bg-white p-3">
        <div className="flex min-w-0 flex-col gap-0.5">
          <label className="text-[11px] font-medium text-gray-600" htmlFor="gatimitra-queue-group-filter">
            Group
          </label>
          <select
            id="gatimitra-queue-group-filter"
            value={groupId}
            onChange={(e) => setGroupId(e.target.value)}
            className="h-9 min-w-[140px] rounded-md border border-gray-300 bg-white px-2.5 text-sm text-gray-800 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            <option value="all">All groups</option>
            {groups.map((g) => (
              <option key={g.id} value={String(g.id)}>
                {g.groupName}
              </option>
            ))}
          </select>
        </div>
        <div className="flex min-w-0 flex-col gap-0.5">
          <label className="text-[11px] font-medium text-gray-600" htmlFor="helpdesk-date-from">
            From
          </label>
          <input
            id="helpdesk-date-from"
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="h-9 w-[148px] rounded-md border border-gray-300 bg-white px-2 text-sm text-gray-800 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
        <div className="flex min-w-0 flex-col gap-0.5">
          <label className="text-[11px] font-medium text-gray-600" htmlFor="helpdesk-date-to">
            To
          </label>
          <input
            id="helpdesk-date-to"
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="h-9 w-[148px] rounded-md border border-gray-300 bg-white px-2 text-sm text-gray-800 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
        {(dateFrom || dateTo) && (
          <button
            type="button"
            onClick={() => {
              setDateFrom("");
              setDateTo("");
            }}
            className="h-9 shrink-0 rounded-md border border-gray-200 bg-white px-2.5 text-xs font-medium text-gray-700 shadow-sm hover:bg-gray-50"
          >
            Clear dates
          </button>
        )}
        {/* Keep background refresh active, but do not show status text in UI. */}
        </div>

      {isError ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error instanceof Error ? error.message : "Could not load metrics."}
          <button type="button" className="ml-3 font-semibold text-red-900 underline" onClick={() => void refetch()}>
            Retry
          </button>
        </div>
      ) : null}

      <div className="min-h-0">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
          <SummaryCardLink
            label="Unresolved"
            value={metrics.unresolved}
            href={hrefUnresolved}
            ariaLabel={`Unresolved tickets, ${fmt(metrics.unresolved)}. Open filtered list.`}
            icon={<ClipboardList className={iconCls} strokeWidth={2} />}
          />
          <SummaryCardLink
            label="Open"
            value={metrics.open}
            href={hrefOpen}
            ariaLabel={`Open tickets, ${fmt(metrics.open)}. Open filtered list.`}
            icon={<Ticket className={iconCls} strokeWidth={2} />}
          />
          <SummaryCardLink
            label="Pending + WFU"
            value={metrics.onHold}
            href={hrefPendingWfu}
            ariaLabel={`Pending + WFU tickets, ${fmt(metrics.onHold)}. Open filtered list.`}
            icon={<Clock3 className={iconCls} strokeWidth={2} />}
          />
          <SummaryCardLink
            label="Unassigned"
            value={metrics.unassigned}
            href={hrefUnassigned}
            ariaLabel={`Unassigned tickets, ${fmt(metrics.unassigned)}. Open filtered list.`}
            icon={<UserRound className={iconCls} strokeWidth={2} />}
          />
          <SummaryCardLink
            label="Total"
            value={metrics.total}
            href={hrefTotal}
            ariaLabel={`Total tickets, ${fmt(metrics.total)}. Open filtered list.`}
            icon={<BarChart3 className={iconCls} strokeWidth={2} />}
          />
        </div>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-2 lg:grid-cols-12 lg:items-stretch">
        <div className="lg:col-span-4">
          <WidgetShell
            title="Undelivered emails"
            subtitle="Across GatiMitra Queue"
            action={
              <Link href="/dashboard/tickets/unified" className="text-xs font-medium text-blue-600 hover:underline">
                View details
              </Link>
            }
          >
            <GroupCountTable rows={metrics.undeliveredByGroup} valueHeader="Count" />
          </WidgetShell>
        </div>

        <div className="lg:col-span-4">
          <WidgetShell
            title="To-do"
            action={
              <button
                type="button"
                onClick={() => setTodoAddOpen((o) => !o)}
                className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-700 shadow-sm hover:bg-gray-50"
              >
                <Plus className="h-3.5 w-3.5" aria-hidden />
                Add a to-do
              </button>
            }
          >
          {todosError ? (
            <p className="text-sm text-red-700">
              {todosErr instanceof Error ? todosErr.message : "To-dos unavailable."} Run{" "}
              <span className="font-mono text-xs">0158_agent_helpdesk_todos.sql</span> if the table is missing.
            </p>
          ) : (
            <div className="space-y-3">
              {todoAddOpen ? (
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <input
                    type="text"
                    value={newTodoTitle}
                    onChange={(e) => setNewTodoTitle(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        const t = newTodoTitle.trim();
                        if (t && !createTodoMutation.isPending) createTodoMutation.mutate(t);
                      }
                    }}
                    placeholder="What do you need to do?"
                    className="min-w-0 flex-1 rounded-md border border-gray-200 px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    maxLength={500}
                  />
                  <button
                    type="button"
                    disabled={!newTodoTitle.trim() || createTodoMutation.isPending}
                    onClick={() => {
                      const t = newTodoTitle.trim();
                      if (t) createTodoMutation.mutate(t);
                    }}
                    className="shrink-0 rounded-md bg-blue-600 px-3 py-2 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                  >
                    {createTodoMutation.isPending ? "Adding…" : "Add"}
                  </button>
                </div>
              ) : null}
              {createTodoMutation.isError ? (
                <p className="text-xs text-red-600">
                  {createTodoMutation.error instanceof Error ? createTodoMutation.error.message : "Could not add."}
                </p>
              ) : null}
              {todos.length === 0 && !todoAddOpen ? (
                <div className="flex flex-col items-center justify-center py-4 text-center">
                  <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-gray-100 text-gray-400">
                    <CalendarDays className="h-5 w-5" aria-hidden />
                  </div>
                  <p className="text-xs font-medium text-gray-600">You have no tasks to do!</p>
                  <button
                    type="button"
                    onClick={() => setTodoAddOpen(true)}
                    className="mt-3 text-xs font-medium text-blue-600 hover:underline"
                  >
                    Add your first to-do
                  </button>
                </div>
              ) : null}
              {todos.length > 0 ? (
                <ul className="space-y-2">
                  {todos.map((t) => (
                    <li
                      key={t.id}
                      className={`flex items-center gap-2 rounded-md border px-2 py-1.5 text-xs shadow-sm transition-shadow ${
                        t.done
                          ? "border-gray-100 bg-gray-50/90 text-gray-500"
                          : "border-gray-200/90 bg-white hover:border-blue-200/80 hover:shadow-md"
                      }`}
                    >
                      <input
                        type="checkbox"
                        className="h-4 w-4 shrink-0 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        checked={t.done}
                        disabled={patchTodoMutation.isPending}
                        onChange={() => patchTodoMutation.mutate({ id: t.id, done: !t.done })}
                        aria-label={t.done ? "Mark as not done" : "Mark as done"}
                      />
                      <span
                        className={`min-w-0 flex-1 leading-snug ${t.done ? "text-gray-400 line-through" : "font-medium text-gray-900"}`}
                      >
                        {t.title}
                      </span>
                      <button
                        type="button"
                        className={`shrink-0 rounded-md p-1.5 transition-colors ${
                          t.done
                            ? "cursor-not-allowed text-gray-300"
                            : "text-gray-400 hover:bg-red-50 hover:text-red-600"
                        }`}
                        aria-label={t.done ? "Delete disabled for completed to-dos" : "Delete to-do"}
                        title={t.done ? "Completed to-dos cannot be deleted" : "Delete"}
                        disabled={t.done || deleteTodoMutation.isPending}
                        onClick={() => {
                          if (!t.done) deleteTodoMutation.mutate(t.id);
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          )}
          </WidgetShell>
        </div>

        <div className="lg:col-span-4">
          <WidgetShell
            title="Unresolved tickets"
            subtitle="Across GatiMitra Queue"
            action={
              <Link href={hrefUnresolved} className="text-xs font-medium text-blue-600 hover:underline">
                View details
              </Link>
            }
          >
            <GroupCountTable rows={metrics.unresolvedByGroup} valueHeader="Open" />
          </WidgetShell>
        </div>
      </div>
    </div>
  );
}
