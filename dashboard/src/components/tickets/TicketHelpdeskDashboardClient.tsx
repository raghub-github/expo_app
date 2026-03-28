"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarDays, Plus, Trash2 } from "lucide-react";
import { useTicketsReferenceDataQuery } from "@/hooks/tickets/useTicketsReferenceDataQuery";
import { loadClientSnapshot, saveClientSnapshot } from "@/lib/client-route-snapshot";

const TICKETS_LIST_PATH = "/dashboard/tickets";

/** Same active pipeline as GatiMitra Queue Unresolved card (excludes resolved/closed/cancelled/rejected). */
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

function emptyDashboardMetrics(groupId: string): HelpdeskDashboardData {
  const n = groupId !== "all" ? parseInt(groupId, 10) : NaN;
  return {
    unresolved: 0,
    open: 0,
    onHold: 0,
    unassigned: 0,
    undeliveredByGroup: [],
    unresolvedByGroup: [],
    groupIdFilter: Number.isFinite(n) && n > 0 ? n : null,
  };
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
  const [todoAddOpen, setTodoAddOpen] = useState(false);
  const [newTodoTitle, setNewTodoTitle] = useState("");
  const queryClient = useQueryClient();
  const { data: refData } = useTicketsReferenceDataQuery();

  const dashboardSnapshotKey = useMemo(
    () => `dashboard_snapshot:helpdeskDashboard:v1:${groupId}`,
    [groupId]
  );

  const initialDashboardSnapshot = useMemo(() => {
    const raw = loadClientSnapshot<HelpdeskDashboardData>(dashboardSnapshotKey, HELPDESK_DASHBOARD_SNAPSHOT_TTL_MS);
    if (!raw || typeof raw.unresolved !== "number") return undefined;
    return raw;
  }, [dashboardSnapshotKey]);

  const { data, isError, error, refetch, isFetching } = useQuery({
    queryKey: ["tickets", "helpdesk-dashboard", groupId],
    queryFn: () => fetchHelpdeskDashboard(groupId),
    staleTime: 60_000,
    gcTime: 24 * 60 * 60_000,
    initialData: initialDashboardSnapshot,
    initialDataUpdatedAt: initialDashboardSnapshot != null ? 0 : undefined,
  });

  useEffect(() => {
    if (data) saveClientSnapshot(dashboardSnapshotKey, data);
  }, [data, dashboardSnapshotKey]);

  const metrics = data ?? emptyDashboardMetrics(groupId);

  const initialTodosSnapshot = useMemo(() => {
    const raw = loadClientSnapshot<HelpdeskTodo[]>(HELPDESK_TODOS_SNAPSHOT_KEY, HELPDESK_DASHBOARD_SNAPSHOT_TTL_MS);
    return Array.isArray(raw) ? raw : undefined;
  }, []);

  const {
    data: todoList,
    isError: todosError,
    error: todosErr,
  } = useQuery({
    queryKey: ["tickets", "helpdesk-todos"],
    queryFn: async (): Promise<HelpdeskTodo[]> => {
      const r = await fetch("/api/tickets/helpdesk-todos", { credentials: "include" });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j?.error || "Failed to load to-dos");
      return (j?.data?.todos ?? []) as HelpdeskTodo[];
    },
    staleTime: 60_000,
    gcTime: 24 * 60 * 60_000,
    initialData: initialTodosSnapshot,
    initialDataUpdatedAt: initialTodosSnapshot != null ? 0 : undefined,
  });

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
        <label className="sr-only" htmlFor="gatimitra-queue-group-filter">
          All groups
        </label>
        <select
          id="gatimitra-queue-group-filter"
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
        {isFetching ? <span className="text-xs text-gray-400">Updating…</span> : null}
      </div>

      {isError ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error instanceof Error ? error.message : "Could not load metrics."}
          <button type="button" className="ml-3 font-semibold text-red-900 underline" onClick={() => void refetch()}>
            Retry
          </button>
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCardLink
          label="Unresolved"
          value={metrics.unresolved}
          href={hrefUnresolved}
          ariaLabel={`Unresolved tickets, ${fmt(metrics.unresolved)}. Open filtered list.`}
        />
        <SummaryCardLink
          label="Open"
          value={metrics.open}
          href={hrefOpen}
          ariaLabel={`Open tickets, ${fmt(metrics.open)}. Open filtered list.`}
        />
        <SummaryCardLink
          label="On hold"
          value={metrics.onHold}
          href={hrefOnHold}
          ariaLabel={`On hold tickets, ${fmt(metrics.onHold)}. Open filtered list.`}
        />
        <SummaryCardLink
          label="Unassigned"
          value={metrics.unassigned}
          href={hrefUnassigned}
          ariaLabel={`Unassigned tickets, ${fmt(metrics.unassigned)}. Open filtered list.`}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
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
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-gray-100 text-gray-400">
                    <CalendarDays className="h-7 w-7" aria-hidden />
                  </div>
                  <p className="text-sm font-medium text-gray-600">You have no tasks to do!</p>
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
                      className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 text-sm shadow-sm transition-shadow ${
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
  );
}
