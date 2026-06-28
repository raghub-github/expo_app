"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAppPathname, useAppSearchParams } from "@/hooks/useAppSearchParams";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Search } from "lucide-react";
import {
  useTicketsAgentsQuery,
  type QueueAgentPresence,
  type TicketAgent,
} from "@/hooks/tickets/useTicketsAgentsQuery";
import { useTicketsReferenceDataQuery } from "@/hooks/tickets/useTicketsReferenceDataQuery";
import { usePermissions } from "@/hooks/usePermissions";
import { useToast } from "@/context/ToastContext";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
type Tiered = { primary: number[]; secondary: number[] };
type Assignments = Record<string, Tiered>;
type RefGroup = { id: number; groupName: string };

function emptyTiers(): Tiered {
  return { primary: [], secondary: [] };
}

function formatMinutes(m: number): string {
  if (!m || m <= 0) return "0m";
  const h = Math.floor(m / 60);
  const mm = m % 60;
  if (h === 0) return `${mm}m`;
  return mm ? `${h}h ${mm}m` : `${h}h`;
}

const KOLKATA_TZ = "Asia/Kolkata";

function formatActivityDateInKolkata(ymd: string): string {
  try {
    const d = new Date(`${ymd}T00:00:00.000Z`);
    return new Intl.DateTimeFormat("en-IN", {
      timeZone: KOLKATA_TZ,
      year: "numeric",
      month: "short",
      day: "numeric",
    }).format(d);
  } catch {
    return ymd;
  }
}

/** Parses API/Postgres timestamps; avoids Invalid Date in strict parsers. */
function parseAgentTimestamp(raw: string): Date | null {
  const s = raw.trim();
  let n = s;
  if (/^\d{4}-\d{2}-\d{2} /.test(s)) {
    n = s.replace(" ", "T");
  }
  // e.g. ...+00 → ...+00: (ISO offset without minutes)
  n = n.replace(/([+-])(\d{2})$/, "$1$2:00");
  const d = new Date(n);
  return Number.isNaN(d.getTime()) ? null : d;
}

function formatLogoutDisplay(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = parseAgentTimestamp(iso);
  if (!d) return iso;
  try {
    // dateStyle/timeStyle must not be combined with timeZoneName (throws → raw string shown).
    return new Intl.DateTimeFormat("en-IN", {
      dateStyle: "medium",
      timeStyle: "medium",
      timeZone: KOLKATA_TZ,
    }).format(d);
  } catch {
    return iso;
  }
}

function statusRowClass(p: QueueAgentPresence): string {
  const s = p.currentStatus;
  if (s === "offline" || !p.isOnline) return "font-bold text-red-600";
  if (s === "break") return "font-semibold text-amber-800";
  if (s === "busy") return "font-semibold text-orange-800";
  return "font-semibold text-green-800";
}

function statusLabel(p: QueueAgentPresence): string {
  if (p.currentStatus === "break") return "Break";
  if (p.currentStatus === "busy") return "Busy";
  if (p.isOnline && p.currentStatus === "online") return "Online";
  return "Offline";
}

function resolveGroupNamesToIds(tokens: string[], allGroups: RefGroup[]): { matched: number[]; unknown: string[] } {
  const matched: number[] = [];
  const unknown: string[] = [];
  for (const raw of tokens) {
    const t = raw.trim();
    if (!t) continue;
    const lower = t.toLowerCase();
    const exact = allGroups.find((g) => g.groupName.toLowerCase() === lower);
    if (exact) {
      if (!matched.includes(exact.id)) matched.push(exact.id);
      continue;
    }
    const partial = allGroups.filter(
      (g) =>
        g.groupName.toLowerCase().includes(lower) ||
        lower.includes(g.groupName.toLowerCase())
    );
    if (partial.length === 1) {
      const id = partial[0].id;
      if (!matched.includes(id)) matched.push(id);
    } else {
      unknown.push(t);
    }
  }
  return { matched, unknown };
}

function agentDisplayLabel(a: TicketAgent): string {
  const n = a.name?.trim();
  return n ? n : a.email ?? "";
}

function applyToggleToAssignments(
  prev: Assignments,
  agentId: number,
  groupId: number,
  tier: "primary" | "secondary"
): Assignments {
  const key = String(agentId);
  const cur = prev[key] ?? emptyTiers();
  let primary = [...cur.primary];
  let secondary = [...cur.secondary];
  if (tier === "primary") {
    if (primary.includes(groupId)) {
      primary = primary.filter((g) => g !== groupId);
    } else {
      primary = [...primary, groupId].sort((a, b) => a - b);
      secondary = secondary.filter((g) => g !== groupId);
    }
  } else {
    if (secondary.includes(groupId)) {
      secondary = secondary.filter((g) => g !== groupId);
    } else {
      secondary = [...secondary, groupId].sort((a, b) => a - b);
      primary = primary.filter((g) => g !== groupId);
    }
  }
  return { ...prev, [key]: { primary, secondary } };
}

function applyResolvedIdsToAssignments(
  prev: Assignments,
  agentId: number,
  ids: number[],
  tier: "primary" | "secondary"
): Assignments {
  const key = String(agentId);
  const cur = prev[key] ?? emptyTiers();
  let primary = [...cur.primary];
  let secondary = [...cur.secondary];
  for (const gid of ids) {
    if (tier === "primary") {
      if (!primary.includes(gid)) primary.push(gid);
      secondary = secondary.filter((g) => g !== gid);
    } else {
      if (!secondary.includes(gid)) secondary.push(gid);
      primary = primary.filter((g) => g !== gid);
    }
  }
  primary.sort((a, b) => a - b);
  secondary.sort((a, b) => a - b);
  return { ...prev, [key]: { primary, secondary } };
}

function InfoRow({
  label,
  children,
  valueStripe,
}: {
  label: string;
  children: React.ReactNode;
  valueStripe: boolean;
}) {
  return (
    <tr className="border-b border-rose-200/80 last:border-b-0">
      <th
        scope="row"
        className="w-[38%] min-w-[120px] border-r border-rose-200/80 bg-violet-100/90 px-2.5 py-2 text-left text-xs font-medium text-gray-800 sm:text-sm"
      >
        {label}
      </th>
      <td
        className={`px-2.5 py-2 text-xs text-gray-800 sm:text-sm ${valueStripe ? "bg-violet-50/40" : "bg-white"}`}
      >
        {children}
      </td>
    </tr>
  );
}

const SUP_OFFLINE_PRESETS: { value: string; label: string }[] = [
  { value: "supervisor_policy", label: "Supervisor — policy / routing" },
  { value: "end_shift", label: "End of shift (agent unavailable)" },
  { value: "break_cover", label: "Force break / coverage" },
  { value: "other", label: "Other (type below)" },
];

export function QueueSupervisorUpdatedAgentsClient() {
  const queryClient = useQueryClient();
  const router = useRouter();
  const pathname = useAppPathname();
  const searchParams = useAppSearchParams();
  const agentIdFromUrl = (searchParams.get("agentId") ?? "").trim();

  const { toast } = useToast();
  const { isSuperAdmin, loading: permLoading } = usePermissions();
  const { data: agentsData, isLoading: agentsLoading } = useTicketsAgentsQuery({
    includePresence: true,
    refetchIntervalMs: 5000,
  });
  const { data: refData, isLoading: refLoading } = useTicketsReferenceDataQuery();

  const agents = agentsData?.agents ?? [];
  const groups = useMemo(() => refData?.groups ?? [], [refData?.groups]);
  const groupNameById = useMemo(() => new Map(groups.map((g) => [g.id, g.groupName])), [groups]);

  const [assignments, setAssignments] = useState<Assignments>({});
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [forcingId, setForcingId] = useState<number | null>(null);
  const [selectedAgentId, setSelectedAgentId] = useState<string>("");
  const [groupFilter, setGroupFilter] = useState("");
  const [manualGroupInput, setManualGroupInput] = useState("");
  const [manualApplyTier, setManualApplyTier] = useState<"primary" | "secondary">("primary");
  const [showOfflineModal, setShowOfflineModal] = useState(false);
  const [supOfflinePreset, setSupOfflinePreset] = useState("supervisor_policy");
  const [supOfflineCustom, setSupOfflineCustom] = useState("");
  const [showAllPrimaryGroups, setShowAllPrimaryGroups] = useState(false);
  const [showAllSecondaryGroups, setShowAllSecondaryGroups] = useState(false);
  const [agentQuery, setAgentQuery] = useState("");
  const [agentSuggestOpen, setAgentSuggestOpen] = useState(false);
  const assignmentsRef = useRef<Assignments>({});
  const persistDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const agentSearchContainerRef = useRef<HTMLDivElement>(null);

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

  const VISIBLE_GROUP_CAP = 10;

  useEffect(() => {
    setShowAllPrimaryGroups(false);
    setShowAllSecondaryGroups(false);
  }, [groupFilter]);

  /** Keep comma-separated box aligned with checkbox selections for the active Apply-to tier. */
  useEffect(() => {
    if (!selectedAgentId) {
      setManualGroupInput("");
      return;
    }
    const key = selectedAgentId;
    const tiers = assignments[key] ?? emptyTiers();
    const ids = manualApplyTier === "primary" ? tiers.primary : tiers.secondary;
    const names = ids
      .map((id) => groupNameById.get(id))
      .filter((n): n is string => Boolean(n && n.trim()));
    setManualGroupInput(names.join(", "));
  }, [selectedAgentId, manualApplyTier, assignments, groupNameById]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/tickets/queue/agent-groups", { credentials: "include" });
        const json = (await res.json()) as {
          success?: boolean;
          data?: { assignments?: Record<string, Tiered | { primary?: number[]; secondary?: number[] }> };
        };
        if (!res.ok || !json.success) throw new Error((json as { error?: string }).error ?? "Failed to load");
        if (!cancelled) {
          const raw = json.data?.assignments ?? {};
          const next: Assignments = {};
          for (const [uid, v] of Object.entries(raw)) {
            next[uid] = {
              primary: Array.isArray(v?.primary) ? v.primary.map(Number).filter((n) => Number.isFinite(n)) : [],
              secondary: Array.isArray(v?.secondary)
                ? v.secondary.map(Number).filter((n) => Number.isFinite(n))
                : [],
            };
          }
          setAssignments(next);
          setLoaded(true);
        }
      } catch (e) {
        if (!cancelled) {
          setAssignments({});
          setLoaded(true);
          toast(e instanceof Error ? e.message : "Could not load group assignments", "error");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [toast]);

  useEffect(() => {
    assignmentsRef.current = assignments;
  }, [assignments]);

  useEffect(() => {
    const onDocDown = (e: MouseEvent) => {
      const el = agentSearchContainerRef.current;
      if (!el?.contains(e.target as Node)) setAgentSuggestOpen(false);
    };
    document.addEventListener("mousedown", onDocDown);
    return () => document.removeEventListener("mousedown", onDocDown);
  }, []);

  useEffect(() => {
    if (agents.length === 0) return;
    if (!agentIdFromUrl) return;
    if (!agents.some((a) => String(a.id) === agentIdFromUrl)) return;
    setSelectedAgentId(agentIdFromUrl);
    const ag = agents.find((a) => String(a.id) === agentIdFromUrl);
    if (ag) setAgentQuery(agentDisplayLabel(ag));
  }, [agents, agentIdFromUrl]);

  const putAssignments = useCallback(async (payload: Assignments): Promise<boolean> => {
    try {
      const res = await fetch("/api/tickets/queue/agent-groups", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ assignments: payload }),
      });
      const json = (await res.json()) as { success?: boolean; error?: string };
      if (!res.ok || !json.success) throw new Error(json.error ?? "Save failed");
      return true;
    } catch (e) {
      toast(e instanceof Error ? e.message : "Save failed", "error");
      return false;
    }
  }, [toast]);

  const selectedAgent = useMemo(
    () => agents.find((a) => String(a.id) === selectedAgentId) ?? null,
    [agents, selectedAgentId]
  );

  const filteredAgentSuggestions = useMemo(() => {
    const q = agentQuery.trim().toLowerCase();
    if (!q) return agents.slice(0, 20);
    return agents
      .filter((a) => {
        const label = agentDisplayLabel(a).toLowerCase();
        const em = (a.email ?? "").toLowerCase();
        return label.includes(q) || em.includes(q);
      })
      .slice(0, 25);
  }, [agents, agentQuery]);

  const filteredGroups = useMemo(() => {
    const q = groupFilter.trim().toLowerCase();
    if (!q) return groups;
    return groups.filter((g) => g.groupName.toLowerCase().includes(q));
  }, [groups, groupFilter]);

  const toggleGroup = useCallback(
    (agentId: number, groupId: number, tier: "primary" | "secondary") => {
      setAssignments((prev) => applyToggleToAssignments(prev, agentId, groupId, tier));
      if (persistDebounceRef.current) clearTimeout(persistDebounceRef.current);
      persistDebounceRef.current = setTimeout(() => {
        persistDebounceRef.current = null;
        void putAssignments(assignmentsRef.current);
      }, 450);
    },
    [putAssignments]
  );

  const applyManualGroupNames = async () => {
    if (!selectedAgent) return;
    const fromText = manualGroupInput.split(",").map((s) => s.trim()).filter(Boolean);
    const tiersNow = assignments[String(selectedAgent.id)] ?? emptyTiers();
    const idsForApplyTier =
      manualApplyTier === "primary" ? tiersNow.primary : tiersNow.secondary;
    const fromCheckboxes = idsForApplyTier
      .map((id) => groupNameById.get(id))
      .filter((n): n is string => Boolean(n && n.trim()));
    const tokens = fromText.length > 0 ? fromText : fromCheckboxes;
    if (tokens.length === 0) {
      toast("Select at least one group or enter names comma-separated", "error");
      return;
    }
    const { matched, unknown } = resolveGroupNamesToIds(tokens, groups);
    if (persistDebounceRef.current) {
      clearTimeout(persistDebounceRef.current);
      persistDebounceRef.current = null;
    }

    let next = assignments;
    if (matched.length) {
      next = applyResolvedIdsToAssignments(assignments, selectedAgent.id, matched, manualApplyTier);
      setAssignments(next);
      assignmentsRef.current = next;
    }

    if (matched.length) {
      setSaving(true);
      const ok = await putAssignments(next);
      setSaving(false);
      if (!ok) return;
    }

    if (matched.length && unknown.length) {
      toast(`Added ${matched.length} to ${manualApplyTier}. Not matched: ${unknown.join(", ")}`, "error");
    } else if (unknown.length) {
      toast(`Not matched (check spelling): ${unknown.join(", ")}`, "error");
    } else if (matched.length) {
      toast(`Added ${matched.length} group(s) to ${manualApplyTier}`, "success");
    }
  };

  const pickAgent = useCallback(
    (a: TicketAgent) => {
      setSelectedAgentId(String(a.id));
      setAgentQuery(agentDisplayLabel(a));
      setAgentSuggestOpen(false);
      syncAgentIdToUrl(String(a.id));
    },
    [syncAgentIdToUrl]
  );

  const clearAgentSelection = useCallback(() => {
    setSelectedAgentId("");
    setAgentQuery("");
    setAgentSuggestOpen(false);
    syncAgentIdToUrl("");
  }, [syncAgentIdToUrl]);

  const confirmSupervisorOffline = async () => {
    if (!isSuperAdmin || !selectedAgent) return;
    const reason =
      supOfflinePreset === "other"
        ? supOfflineCustom.trim()
        : SUP_OFFLINE_PRESETS.find((p) => p.value === supOfflinePreset)?.label ?? "Supervisor offline";
    if (!reason) {
      toast("Choose or enter a reason", "error");
      return;
    }
    setShowOfflineModal(false);
    setForcingId(selectedAgent.id);
    try {
      const res = await fetch(`/api/tickets/queue/agents/${selectedAgent.id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ status: "offline", reason: reason.slice(0, 500) }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error ?? "Failed");
      void queryClient.invalidateQueries({ queryKey: ["tickets", "agents"] });
      toast("Agent marked offline", "success");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Failed to set offline", "error");
    } finally {
      setForcingId(null);
    }
  };

  const loading = agentsLoading || refLoading || permLoading || !loaded;

  const renderGroupChips = (
    a: { id: number },
    tier: "primary" | "secondary",
    list: RefGroup[],
    expanded: boolean,
    setExpanded: (v: boolean) => void
  ) => {
    const key = String(a.id);
    const tiers = assignments[key] ?? emptyTiers();
    const selected = new Set(tier === "primary" ? tiers.primary : tiers.secondary);
    const overCap = list.length > VISIBLE_GROUP_CAP;
    const visibleList = overCap && !expanded ? list.slice(0, VISIBLE_GROUP_CAP) : list;
    return (
      <div className="mt-2">
        <div
          className={`flex flex-wrap gap-2 pr-0.5 ${overCap && expanded ? "max-h-52 overflow-y-auto" : ""}`}
        >
          {list.length === 0 ? (
            <span className="text-xs text-gray-400">
              {groups.length === 0 ? "No groups in reference data." : "No groups match search."}
            </span>
          ) : (
            visibleList.map((g) => (
              <label
                key={`${tier}-${g.id}`}
                className={`inline-flex cursor-pointer items-center gap-1.5 rounded-md border px-2 py-1 text-xs text-gray-800 hover:bg-gray-100 ${
                  tier === "primary" ? "border-blue-200 bg-blue-50/80" : "border-amber-200 bg-amber-50/80"
                }`}
              >
                <input
                  type="checkbox"
                  className="h-3.5 w-3.5 cursor-pointer rounded border-gray-300 text-blue-600"
                  checked={selected.has(g.id)}
                  onChange={() => toggleGroup(a.id, g.id, tier)}
                />
                {g.groupName}
              </label>
            ))
          )}
        </div>
        {overCap && !expanded ? (
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="mt-2 text-xs font-semibold text-blue-800 hover:text-blue-900 hover:underline"
          >
            Show more
          </button>
        ) : null}
        {overCap && expanded ? (
          <button
            type="button"
            onClick={() => setExpanded(false)}
            className="mt-2 text-xs font-medium text-gray-600 hover:text-gray-800 hover:underline"
          >
            Show less
          </button>
        ) : null}
      </div>
    );
  };

  const tiersForSelected = selectedAgent ? assignments[String(selectedAgent.id)] ?? emptyTiers() : emptyTiers();
  const primaryNames = tiersForSelected.primary.map((id) => groupNameById.get(id) ?? `#${id}`).join(", ");
  const secondaryNames = tiersForSelected.secondary.map((id) => groupNameById.get(id) ?? `#${id}`).join(", ");
  const qp = selectedAgent?.queuePresence ?? null;
  const selectedAgentAlreadyOffline =
    qp != null && (qp.currentStatus === "offline" || !qp.isOnline);

  const supOfflineReasonOk =
    supOfflinePreset !== "other" || supOfflineCustom.trim().length > 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-gradient-to-b from-slate-50/80 to-gray-50/90">
      <div className="relative z-20 shrink-0 border-b border-gray-200 bg-white px-3 py-2">
        {/* Avoid overflow-x-auto on this row: it forces overflow-y to clip, hiding the agent suggestions popover. */}
        <div className="flex min-w-0 flex-nowrap items-center gap-2">
          <div
            ref={agentSearchContainerRef}
            className="relative z-[300] min-w-[12rem] max-w-lg flex-1 shrink-0 rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 shadow-sm"
          >
            <div className="relative">
              <Search
                className="pointer-events-none absolute left-0 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400"
                aria-hidden
              />
              <input
                id="queue-agent-search"
                type="text"
                autoComplete="off"
                inputMode="search"
                suppressHydrationWarning
                value={agentQuery}
                onChange={(e) => {
                  const v = e.target.value;
                  setAgentQuery(v);
                  setAgentSuggestOpen(true);
                  if (selectedAgentId) {
                    const cur = agents.find((x) => String(x.id) === selectedAgentId);
                    if (cur && v.trim() !== agentDisplayLabel(cur)) {
                      setSelectedAgentId("");
                      syncAgentIdToUrl("");
                    }
                  }
                }}
                onFocus={() => setAgentSuggestOpen(true)}
                placeholder="Search by agent name or email…"
                className={`w-full border-0 bg-transparent py-0.5 pl-7 text-sm text-gray-900 outline-none ring-0 placeholder:text-gray-400 ${selectedAgentId ? "pr-8" : "pr-1"}`}
              />
              {selectedAgentId ? (
                <button
                  type="button"
                  aria-label="Clear agent"
                  onClick={clearAgentSelection}
                  className="absolute right-0 top-1/2 -translate-y-1/2 rounded px-1.5 text-lg leading-none text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                >
                  ×
                </button>
              ) : null}
            </div>
            {agentSuggestOpen && filteredAgentSuggestions.length > 0 ? (
              <ul
                className="absolute left-0 right-0 top-full z-[200] mt-1 max-h-60 overflow-y-auto rounded-md border border-gray-200 bg-white py-1 shadow-lg"
                role="listbox"
              >
                {filteredAgentSuggestions.map((a) => {
                  const label = agentDisplayLabel(a);
                  const active = String(a.id) === selectedAgentId;
                  return (
                    <li key={a.id} role="option" aria-selected={active}>
                      <button
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => pickAgent(a)}
                        className={`flex w-full flex-col items-start px-3 py-2 text-left text-sm hover:bg-gray-50 ${
                          active ? "bg-blue-50 text-blue-900" : "text-gray-800"
                        }`}
                      >
                        <span className="font-medium">{label || a.email}</span>
                        {label ? <span className="text-xs text-gray-500">{a.email}</span> : null}
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : null}
          </div>
          <div className="ml-auto flex min-w-0 shrink-0 flex-nowrap items-center gap-2 overflow-x-auto">
            {isSuperAdmin && selectedAgent ? (
              <button
                type="button"
                onClick={() => setShowOfflineModal(true)}
                disabled={forcingId === selectedAgent.id || selectedAgentAlreadyOffline}
                className="cursor-pointer rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {forcingId === selectedAgent.id ? "…" : "Mark offline"}
              </button>
            ) : null}
          </div>
        </div>
      </div>

      <div className="relative min-h-0 flex-1 overflow-hidden">
        {loading ? (
          <div className="flex min-h-[min(420px,50vh)] flex-1 items-center justify-center">
            <LoadingSpinner size="lg" />
          </div>
        ) : agents.length === 0 ? (
          <div className="p-4">
            <p className="text-sm text-gray-500">No agents found.</p>
          </div>
        ) : selectedAgent ? (
          <div className="h-full overflow-y-auto p-3 sm:p-4">
            <div className="mx-auto grid min-h-0 w-full max-w-6xl grid-cols-1 gap-4 lg:grid-cols-2 lg:items-start">
            <div className="flex min-h-[280px] flex-col rounded-lg border border-gray-200 bg-white p-4 shadow-sm lg:min-h-[360px]">
              <h2 className="text-xs font-bold uppercase tracking-wide text-blue-800">Department assignment</h2>
              <label className="sr-only" htmlFor="queue-group-filter">
                Search groups
              </label>
              <input
                id="queue-group-filter"
                type="search"
                value={groupFilter}
                onChange={(e) => setGroupFilter(e.target.value)}
                placeholder="Search groups…"
                className="mt-3 w-full rounded-md border border-gray-300 px-2.5 py-2 text-sm"
              />
              <div className="mt-3 rounded-md border border-dashed border-gray-300 bg-gray-50/80 p-3">
                <p className="text-xs font-medium text-gray-600">Assign by name (comma-separated)</p>
                <textarea
                  value={manualGroupInput}
                  onChange={(e) => setManualGroupInput(e.target.value)}
                  placeholder="e.g. Customer - General, Merchant - Order issues"
                  rows={3}
                  className="mt-2 w-full resize-y rounded-md border border-gray-300 bg-white px-2.5 py-2 text-xs text-gray-900"
                />
                <div className="mt-3 flex flex-wrap items-end justify-between gap-3 border-t border-gray-200/90 pt-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs text-gray-600">Apply to:</span>
                    <select
                      value={manualApplyTier}
                      onChange={(e) => setManualApplyTier(e.target.value as "primary" | "secondary")}
                      className="rounded-md border border-gray-300 bg-white px-2.5 py-1.5 text-xs"
                    >
                      <option value="primary">Primary</option>
                      <option value="secondary">Secondary</option>
                    </select>
                  </div>
                  <button
                    type="button"
                    onClick={() => void applyManualGroupNames()}
                    disabled={saving || loading || !selectedAgent}
                    className="shrink-0 rounded-md bg-slate-800 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-slate-900 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {saving ? "Saving…" : "Update Department"}
                  </button>
                </div>
              </div>
              <p className="mt-4 text-[11px] font-semibold uppercase tracking-wide text-blue-700">
                Primary (preferred)
              </p>
              {renderGroupChips(
                selectedAgent,
                "primary",
                filteredGroups,
                showAllPrimaryGroups,
                setShowAllPrimaryGroups
              )}
              <p className="mt-4 text-[11px] font-semibold uppercase tracking-wide text-amber-800">Secondary</p>
              {renderGroupChips(
                selectedAgent,
                "secondary",
                filteredGroups,
                showAllSecondaryGroups,
                setShowAllSecondaryGroups
              )}
            </div>

            <div className="min-h-0 overflow-hidden rounded-lg border border-rose-300/90 shadow-sm lg:sticky lg:top-0">
              <div className="border-b border-rose-200/80 bg-violet-100/90 px-2.5 py-1.5">
                <span className="text-xs font-semibold text-gray-800 sm:text-sm">Status</span>
              </div>
              <table className="w-full border-collapse text-left">
                <tbody>
                  <InfoRow label="Email Id" valueStripe={false}>
                    {selectedAgent.email || "—"}
                  </InfoRow>
                  <InfoRow label="Departments" valueStripe>
                    {primaryNames || "—"}
                  </InfoRow>
                  <InfoRow label="Secondary Departments" valueStripe={false}>
                    {secondaryNames || "—"}
                  </InfoRow>
                  <InfoRow label="Status" valueStripe>
                    {qp ? (
                      <span className={statusRowClass(qp)}>{statusLabel(qp)}</span>
                    ) : (
                      <span className="text-gray-500">—</span>
                    )}
                  </InfoRow>
                  <InfoRow label="Today (Asia/Kolkata)" valueStripe={false}>
                    {qp ? (
                      <span className="text-gray-800">
                        {formatActivityDateInKolkata(qp.todayUtc)}: working {formatMinutes(qp.todayWorkingMinutes)} · available{" "}
                        {formatMinutes(qp.todayOnlineMinutes)} · busy {formatMinutes(qp.todayBusyMinutes)} · break{" "}
                        {formatMinutes(qp.todayBreakMinutes)}
                      </span>
                    ) : (
                      <span className="text-gray-500">—</span>
                    )}
                  </InfoRow>
                  <InfoRow label="Last Logout Time" valueStripe>
                    {qp ? formatLogoutDisplay(qp.lastLogoutAt) : "—"}
                  </InfoRow>
                  <InfoRow label="Last Logout Reason" valueStripe={false}>
                    {qp?.lastLogoutReason?.trim() ? qp.lastLogoutReason : "—"}
                  </InfoRow>
                </tbody>
              </table>
            </div>
            </div>
          </div>
        ) : (
          <div className="absolute inset-0 flex items-center justify-center p-4">
            <div className="max-w-md rounded-lg border border-dashed border-gray-300 bg-white px-8 py-10 text-center shadow-sm">
              <p className="text-sm leading-relaxed text-gray-600">
                Search for an agent using the field above or select one from the list.
              </p>
            </div>
          </div>
        )}
      </div>

      {showOfflineModal && selectedAgent ? (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-black/50">
          <div
            className="w-full max-w-md rounded-xl border border-gray-200 bg-white p-5 shadow-xl"
            role="alertdialog"
            aria-labelledby="sup-offline-title"
          >
            <div className="mb-3 flex items-center gap-2">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-100">
                <AlertTriangle className="h-4 w-4 text-amber-700" />
              </div>
              <h2 id="sup-offline-title" className="text-base font-semibold text-gray-900">
                Mark {selectedAgent.name || selectedAgent.email} offline?
              </h2>
            </div>
            <p className="mb-2 text-sm text-gray-600">Choose a reason — it is stored in the availability log.</p>
            <label className="mb-1 block text-xs font-medium text-gray-700" htmlFor="sup-offline-preset">
              Reason
            </label>
            <select
              id="sup-offline-preset"
              value={supOfflinePreset}
              onChange={(e) => setSupOfflinePreset(e.target.value)}
              className="mb-2 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            >
              {SUP_OFFLINE_PRESETS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
            {supOfflinePreset === "other" ? (
              <input
                type="text"
                value={supOfflineCustom}
                onChange={(e) => setSupOfflineCustom(e.target.value)}
                placeholder="Required"
                maxLength={500}
                className="mb-4 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
            ) : (
              <div className="mb-4" />
            )}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowOfflineModal(false)}
                className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!supOfflineReasonOk || forcingId != null}
                onClick={() => void confirmSupervisorOffline()}
                className="rounded-lg bg-gray-800 px-3 py-2 text-sm font-medium text-white hover:bg-gray-900 disabled:opacity-50"
              >
                Confirm offline
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
