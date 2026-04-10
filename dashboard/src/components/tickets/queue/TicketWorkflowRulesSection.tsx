"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import {
  Copy,
  MoreVertical,
  Pencil,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { useToast } from "@/context/ToastContext";
import { usePermission } from "@/hooks/usePermission";
import { useTicketsReferenceDataQuery, type TicketReferenceGroup } from "@/hooks/tickets/useTicketsReferenceDataQuery";
import { TICKETS_QUEUE_MANAGER_PATH } from "@/lib/tickets/ticket-path-utils";
import { saveClientSnapshot } from "@/lib/client-route-snapshot";
import {
  ACTION_LABELS,
  buildActionsSummary,
  buildConditionsSummary,
  FIELD_LABELS,
  formatConditionClause,
  OPERATOR_LABELS,
  PRIORITY_OPTIONS,
  relativeTime,
  slugifyRuleCode,
  STATUS_OPTIONS,
  TRIGGER_TABS,
  triggerTabLabel,
  canonicalAutomationTriggerId,
  workflowActionEditorKeys,
  WORKFLOW_CONDITION_FIELD_KEYS,
  type ActionPreview,
  type ConditionPreview,
} from "@/lib/tickets/workflow-rule-ui";

type RuleListItem = {
  id: number;
  rule_code: string;
  rule_name: string;
  rule_description?: string | null;
  rule_priority: number;
  trigger_event: string;
  execution_mode?: string | null;
  is_enabled: boolean;
  is_active: boolean;
  condition_count?: number;
  action_count?: number;
  updated_at?: string | null;
  updated_by_user_id?: number | null;
  updated_by_email?: string | null;
  updated_by_name?: string | null;
  conditions_preview?: unknown;
  actions_preview?: unknown;
};

type EditorCondition = {
  field: string;
  operator: string;
  value: unknown;
  /** For rows after the first: how this row combines with the chain above (left-associative). */
  combineWithPrevious?: "and" | "or";
};
type EditorAction = {
  actionType: string;
  payload: Record<string, unknown>;
  /** For rows after the first: how this action combines with the last executed prior action. */
  combineWithPrevious?: "and" | "or" | "if";
};

const CONDITION_FIELD_OPTIONS = [
  ...WORKFLOW_CONDITION_FIELD_KEYS,
  ...Object.keys(FIELD_LABELS).filter((k) => !WORKFLOW_CONDITION_FIELD_KEYS.includes(k)),
];
const OP_KEYS = Object.keys(OPERATOR_LABELS);

const RULES_LIST_SNAPSHOT_KEY = "dashboard_snapshot:ticketAutomationRulesList";
const AUTOMATION_TAB_STORAGE_KEY = "dashboard:ticketAutomationTriggerTab";

function isAutomationTabId(id: string): id is (typeof TRIGGER_TABS)[number]["id"] {
  return TRIGGER_TABS.some((t) => t.id === id);
}

const workflowSelectClass =
  "w-full rounded-md border border-gray-200 bg-white px-2 py-1.5 text-xs font-medium text-gray-900 disabled:cursor-not-allowed disabled:bg-gray-100";

function parsePreview(raw: unknown): ConditionPreview[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw as ConditionPreview[];
  if (typeof raw === "string") {
    try {
      const p = JSON.parse(raw) as unknown;
      return Array.isArray(p) ? (p as ConditionPreview[]) : [];
    } catch {
      return [];
    }
  }
  return [];
}

function parseActionsPreview(raw: unknown): ActionPreview[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw as ActionPreview[];
  if (typeof raw === "string") {
    try {
      const p = JSON.parse(raw) as unknown;
      return Array.isArray(p) ? (p as ActionPreview[]) : [];
    } catch {
      return [];
    }
  }
  return [];
}

function ruleHasQueueBalanceForAgent(r: RuleListItem): boolean {
  const acts = parseActionsPreview(r.actions_preview);
  return acts.some(
    (a) => String(a.action_type ?? a.actionType ?? "").toLowerCase() === "run_queue_balance_for_agent"
  );
}

function normalizeRuleRow(raw: Record<string, unknown>): RuleListItem {
  const idRaw = raw.id;
  const id =
    typeof idRaw === "bigint"
      ? Number(idRaw)
      : typeof idRaw === "string"
        ? parseInt(idRaw, 10)
        : Number(idRaw);
  const triggerRaw = String(raw.trigger_event ?? raw.triggerEvent ?? "").trim();
  const trigger = canonicalAutomationTriggerId(triggerRaw || "ticket_updated");
  return {
    id: Number.isFinite(id) ? id : 0,
    rule_code: String(raw.rule_code ?? raw.ruleCode ?? ""),
    rule_name: String(raw.rule_name ?? raw.ruleName ?? ""),
    rule_description:
      raw.rule_description != null || raw.ruleDescription != null
        ? String(raw.rule_description ?? raw.ruleDescription ?? "")
        : null,
    rule_priority: Number(raw.rule_priority ?? raw.rulePriority ?? 0) || 0,
    trigger_event: trigger,
    execution_mode: raw.execution_mode != null ? String(raw.execution_mode) : raw.executionMode != null ? String(raw.executionMode) : "immediate",
    is_enabled: raw.is_enabled !== false && raw.isEnabled !== false,
    is_active: raw.is_active !== false && raw.isActive !== false,
    condition_count: raw.condition_count != null ? Number(raw.condition_count) : undefined,
    action_count: raw.action_count != null ? Number(raw.action_count) : undefined,
    updated_at: raw.updated_at != null ? String(raw.updated_at) : raw.updatedAt != null ? String(raw.updatedAt) : null,
    updated_by_user_id:
      raw.updated_by_user_id != null ? Number(raw.updated_by_user_id) : raw.updatedByUserId != null ? Number(raw.updatedByUserId) : null,
    updated_by_email: raw.updated_by_email != null ? String(raw.updated_by_email) : null,
    updated_by_name: raw.updated_by_name != null ? String(raw.updated_by_name) : null,
    conditions_preview: raw.conditions_preview ?? raw.conditionsPreview,
    actions_preview: raw.actions_preview ?? raw.actionsPreview,
  };
}

function normalizeCombineFromApi(row: Record<string, unknown>): "and" | "or" {
  const raw = String(row.combineWithPrevious ?? row.combine_with_previous ?? "and").toLowerCase();
  return raw === "or" ? "or" : "and";
}

function normalizeActionCombineFromApi(row: Record<string, unknown>): "and" | "or" | "if" {
  const raw = String(row.combineWithPrevious ?? row.combine_with_previous ?? "and").toLowerCase();
  if (raw === "or") return "or";
  if (raw === "if" || raw === "iff") return "if";
  return "and";
}

function defaultCondition(trigger: string): EditorCondition {
  if (trigger === "agent_went_online") {
    return { field: "is_online", operator: "eq", value: true, combineWithPrevious: "and" };
  }
  if (trigger === "agent_went_offline") {
    return { field: "is_online", operator: "eq", value: false, combineWithPrevious: "and" };
  }
  return { field: "subject", operator: "icontains", value: "", combineWithPrevious: "and" };
}

function defaultActionForTrigger(trigger: string): EditorAction {
  if (trigger === "agent_went_online" || trigger === "agent_went_offline") {
    return { actionType: "run_queue_balance_for_agent", payload: {}, combineWithPrevious: "and" };
  }
  return { actionType: "assign_least_loaded", payload: {}, combineWithPrevious: "and" };
}

export function TicketWorkflowRulesSection({ embedded = false }: { embedded?: boolean }) {
  const { toast } = useToast();
  const { isSuperAdmin, hasDashboardAccess, loading: permLoading } = usePermission();
  const canUse = isSuperAdmin || hasDashboardAccess("TICKET");
  const accessReady = !permLoading;
  const { data: ticketRefData, isLoading: ticketRefLoading } = useTicketsReferenceDataQuery();
  const ticketGroups = ticketRefData?.groups ?? [];

  const [rules, setRules] = useState<RuleListItem[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [tabTrigger, setTabTrigger] = useState<(typeof TRIGGER_TABS)[number]["id"]>("ticket_created");
  const [searchQ, setSearchQ] = useState("");
  const [menuOpenId, setMenuOpenId] = useState<number | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [ruleCode, setRuleCode] = useState("");
  const [ruleName, setRuleName] = useState("");
  /** After user edits code on create, stop overwriting from name. */
  const [ruleCodeUserEdited, setRuleCodeUserEdited] = useState(false);
  const [ruleDescription, setRuleDescription] = useState("");
  const [triggerEvent, setTriggerEvent] = useState<(typeof TRIGGER_TABS)[number]["id"]>("ticket_updated");
  const [rulePriority, setRulePriority] = useState(10);
  const [isEnabled, setIsEnabled] = useState(true);
  const [oncePerTicket, setOncePerTicket] = useState(false);
  const [stopAfterMatch, setStopAfterMatch] = useState(false);
  const [conditionRows, setConditionRows] = useState<EditorCondition[]>([defaultCondition("ticket_updated")]);
  const [actionRows, setActionRows] = useState<EditorAction[]>([defaultActionForTrigger("ticket_updated")]);
  const [testTicketId, setTestTicketId] = useState("");
  const [testAgentId, setTestAgentId] = useState("");
  const [testResult, setTestResult] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [executionMode, setExecutionMode] = useState<"immediate" | "queued">("immediate");
  const [executionDelaySeconds, setExecutionDelaySeconds] = useState(0);
  const [maxActionRetries, setMaxActionRetries] = useState(2);
  const [skipLogs, setSkipLogs] = useState<{ id: number; summary: string; created_at: string; ticket_id: number | null }[]>(
    []
  );
  const [offlineReleaseEnabled, setOfflineReleaseEnabled] = useState<boolean | null>(null);
  const [offlineSettingsAvailable, setOfflineSettingsAvailable] = useState<boolean | null>(null);
  const [offlineSettingsLoading, setOfflineSettingsLoading] = useState(false);
  const [confirmRuleAction, setConfirmRuleAction] = useState<{
    type: "edit" | "duplicate" | "delete";
    ruleId: number;
    ruleName: string;
  } | null>(null);
  const [processingOfflineReleaseJobs, setProcessingOfflineReleaseJobs] = useState(false);
  /** Avoid SSR/client hydration mismatch on permission-gated trees (server often lacks session-shaped access). */
  const [clientMounted, setClientMounted] = useState(false);
  useEffect(() => {
    setClientMounted(true);
  }, []);

  const loadOfflineQueueSetting = useCallback(async () => {
    setOfflineSettingsLoading(true);
    try {
      const res = await fetch("/api/tickets/queue/auto-assign-settings", {
        credentials: "include",
        cache: "no-store",
      });
      const json = (await res.json()) as {
        success?: boolean;
        data?: {
          releaseAssignmentsWhenAgentOffline?: boolean;
          offlineReleaseSettingsAvailable?: boolean;
        };
      };
      if (!res.ok || !json.success) {
        setOfflineReleaseEnabled(null);
        setOfflineSettingsAvailable(null);
        return;
      }
      setOfflineReleaseEnabled(json.data?.releaseAssignmentsWhenAgentOffline !== false);
      setOfflineSettingsAvailable(json.data?.offlineReleaseSettingsAvailable !== false);
    } catch {
      setOfflineReleaseEnabled(null);
      setOfflineSettingsAvailable(null);
    } finally {
      setOfflineSettingsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (tabTrigger === "agent_went_offline") void loadOfflineQueueSetting();
  }, [tabTrigger, loadOfflineQueueSetting]);

  const refreshSkipLogs = useCallback(async () => {
    try {
      const res = await fetch("/api/tickets/automation/logs?logType=assignment_skip&limit=12", {
        credentials: "include",
        cache: "no-store",
      });
      const json = (await res.json()) as {
        success?: boolean;
        data?: { logs?: Record<string, unknown>[] };
      };
      if (!res.ok || !json.success) return;
      const logs = json.data?.logs ?? [];
      setSkipLogs(
        logs.map((row, i) => ({
          id: Number(row.id) || i,
          summary: String(row.summary ?? ""),
          created_at: String(row.created_at ?? ""),
          ticket_id: row.ticket_id != null ? Number(row.ticket_id) : null,
        }))
      );
    } catch {
      setSkipLogs([]);
    }
  }, []);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const res = await fetch("/api/tickets/automation/rules", {
        credentials: "include",
        cache: "no-store",
      });
      const json = (await res.json()) as {
        success?: boolean;
        data?: { rules: Record<string, unknown>[] };
        error?: string;
      };
      if (!res.ok || !json.success) {
        setLoadError(json.error ?? `Could not load (${res.status})`);
        setRules([]);
        return;
      }
      const rawList = json.data?.rules ?? [];
      const next = rawList.map((r) => normalizeRuleRow(r)).filter((r) => r.id > 0);
      setRules(next);
      saveClientSnapshot(RULES_LIST_SNAPSHOT_KEY, { rules: next });
      void refreshSkipLogs();
    } catch {
      setLoadError("Network error while loading rules.");
      setRules([]);
    }
  }, [refreshSkipLogs]);

  const runOfflineReleaseAutomationJobs = useCallback(async () => {
    setProcessingOfflineReleaseJobs(true);
    try {
      const res = await fetch("/api/tickets/automation/process-jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        cache: "no-store",
        body: JSON.stringify({ limit: 30 }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        success?: boolean;
        error?: string;
        data?: { processed?: number; jobErrors?: string[] };
      };
      if (!res.ok || !json.success) {
        throw new Error(json.error ?? `Request failed (${res.status})`);
      }
      const n = Number(json.data?.processed);
      const errs = json.data?.jobErrors?.length ? ` (${json.data?.jobErrors?.length} errors)` : "";
      toast(
        Number.isFinite(n)
          ? `Processed ${n} automation job(s)${errs}`
          : "Automation jobs processed",
        json.data?.jobErrors?.length ? "error" : "success"
      );
      await load();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Could not process jobs", "error");
    } finally {
      setProcessingOfflineReleaseJobs(false);
    }
  }, [toast, load]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(AUTOMATION_TAB_STORAGE_KEY);
      if (raw && isAutomationTabId(raw)) setTabTrigger(raw);
    } catch {
      /* ignore */
    }
  }, []);

  const setAutomationTab = useCallback((id: (typeof TRIGGER_TABS)[number]["id"]) => {
    setTabTrigger(id);
    try {
      localStorage.setItem(AUTOMATION_TAB_STORAGE_KEY, id);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (editingId != null || ruleCodeUserEdited) return;
    setRuleCode(slugifyRuleCode(ruleName));
  }, [ruleName, editingId, ruleCodeUserEdited]);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpenId(null);
    };
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, []);

  useEffect(() => {
    if (!confirmRuleAction) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setConfirmRuleAction(null);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [confirmRuleAction]);

  const tabMeta = useMemo(() => TRIGGER_TABS.find((t) => t.id === tabTrigger)!, [tabTrigger]);

  /** Rules that run queue balance for the agent on "went online" (drives auto-assign to that agent / group). */
  const agentOnlineQueueBalanceRules = useMemo(
    () =>
      rules
        .filter((r) => r.trigger_event === "agent_went_online")
        .filter(ruleHasQueueBalanceForAgent)
        .sort((a, b) => b.rule_priority - a.rule_priority || b.id - a.id),
    [rules]
  );

  const filteredRules = useMemo(() => {
    const q = searchQ.trim().toLowerCase();
    return rules
      .filter((r) => r.trigger_event === tabTrigger)
      .sort((a, b) => b.rule_priority - a.rule_priority || a.id - b.id)
      .filter((r) => {
        if (!q) return true;
        return (
          r.rule_name.toLowerCase().includes(q) ||
          r.rule_code.toLowerCase().includes(q) ||
          buildConditionsSummary(parsePreview(r.conditions_preview)).toLowerCase().includes(q)
        );
      });
  }, [rules, tabTrigger, searchQ]);

  const resetEditor = (trigger: (typeof TRIGGER_TABS)[number]["id"]) => {
    setEditingId(null);
    setRuleCode("");
    setRuleName("");
    setRuleCodeUserEdited(false);
    setRuleDescription("");
    setTriggerEvent(trigger);
    setRulePriority(10);
    setIsEnabled(true);
    setOncePerTicket(false);
    setStopAfterMatch(false);
    setExecutionMode("immediate");
    setExecutionDelaySeconds(0);
    setMaxActionRetries(2);
    setConditionRows([defaultCondition(trigger)]);
    setActionRows([defaultActionForTrigger(trigger)]);
    setTestResult(null);
    setTestTicketId("");
    setTestAgentId("");
    setShowAdvanced(false);
  };

  const openCreate = () => {
    resetEditor(tabTrigger);
    setDrawerOpen(true);
  };

  const openEdit = async (id: number): Promise<boolean> => {
    setTestResult(null);
    try {
      const res = await fetch(`/api/tickets/automation/rules/${id}`, {
        credentials: "include",
        cache: "no-store",
      });
      const json = (await res.json()) as {
        success?: boolean;
        data?: {
          rule: Record<string, unknown>;
          conditions: Record<string, unknown>[];
          actions: { action_type: string; payload: unknown; combine_with_previous?: string }[];
        };
        error?: string;
      };
      if (!res.ok || !json.success || !json.data) {
        toast(json.error ?? "Could not load rule", "error");
        return false;
      }
      const r = json.data.rule;
      const te = canonicalAutomationTriggerId(String(r.trigger_event ?? "ticket_updated"));
      setEditingId(id);
      setRuleCode(String(r.rule_code ?? ""));
      setRuleName(String(r.rule_name ?? ""));
      setRuleDescription(String(r.rule_description ?? ""));
      setTriggerEvent(te);
      setRulePriority(Number(r.rule_priority ?? 0));
      setIsEnabled(r.is_enabled !== false);
      setOncePerTicket(r.once_per_ticket === true);
      setStopAfterMatch(r.stop_after_match === true);
      const em = String(r.execution_mode ?? "immediate").toLowerCase();
      setExecutionMode(em === "queued" ? "queued" : "immediate");
      setExecutionDelaySeconds(Math.max(0, Number(r.execution_delay_seconds ?? 0) || 0));
      setMaxActionRetries(Math.min(10, Math.max(0, Number(r.max_action_retries ?? 2) || 2)));
      const rawConds = json.data.conditions;
      const rawActs = json.data.actions;
      if (!Array.isArray(rawConds) || !Array.isArray(rawActs)) {
        toast("Invalid rule data from server", "error");
        return false;
      }
      const conds = rawConds.map((c, idx) => ({
        field: String(c.field ?? ""),
        operator: String(c.operator ?? ""),
        value: c.value,
        combineWithPrevious: idx === 0 ? ("and" as const) : normalizeCombineFromApi(c),
      }));
      setConditionRows(conds.length ? conds : [defaultCondition(te)]);
      const acts = rawActs.map((a, idx) => ({
        actionType: String(a.action_type ?? ""),
        payload: (a.payload && typeof a.payload === "object" ? a.payload : {}) as Record<string, unknown>,
        combineWithPrevious: idx === 0 ? ("and" as const) : normalizeActionCombineFromApi(a as Record<string, unknown>),
      }));
      setActionRows(acts.length ? acts : [defaultActionForTrigger(te)]);
      setDrawerOpen(true);
      setMenuOpenId(null);
      return true;
    } catch {
      toast("Failed to load rule", "error");
      return false;
    }
  };

  const saveRule = async () => {
    if (!editingId && !ruleCode.trim()) {
      toast("Rule code is required", "error");
      return;
    }
    if (!ruleName.trim()) {
      toast("Rule name is required", "error");
      return;
    }
    const filteredConds = conditionRows.filter((c) => c.field && c.operator);
    const conditions = filteredConds.map((c, idx) => ({
      field: c.field.trim(),
      operator: c.operator.trim(),
      value: c.value,
      combineWithPrevious: idx === 0 ? "and" : c.combineWithPrevious === "or" ? "or" : "and",
    }));
    const filteredActs = actionRows.filter((a) => a.actionType);
    const actions = filteredActs.map((a, idx) => {
      const raw =
        idx === 0 ? "and" : a.combineWithPrevious === "or" ? "or" : a.combineWithPrevious === "if" ? "if" : "and";
      return { actionType: a.actionType, payload: a.payload ?? {}, combineWithPrevious: raw };
    });
    if (conditions.length === 0) {
      toast("Add at least one condition, or use a catch-all with is_not_null on subject", "error");
      return;
    }
    if (actions.length === 0) {
      toast("Add at least one action", "error");
      return;
    }

    setSaving(true);
    try {
      const url = editingId ? `/api/tickets/automation/rules/${editingId}` : "/api/tickets/automation/rules";
      const method = editingId ? "PATCH" : "POST";
      const base = {
        ruleName: ruleName.trim(),
        ruleDescription: ruleDescription.trim() || null,
        triggerEvent,
        rulePriority,
        isEnabled,
        oncePerTicket,
        stopAfterMatch,
        executionMode,
        executionDelaySeconds,
        maxActionRetries,
        conditions,
        actions,
      };
      const body = editingId ? base : { ...base, ruleCode: ruleCode.trim() };

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        cache: "no-store",
        body: JSON.stringify(body),
      });
      const json = (await res.json().catch(() => ({}))) as { success?: boolean; error?: string };
      if (!res.ok || !json.success) {
        throw new Error(json.error ?? `Save failed (${res.status})`);
      }
      toast(editingId ? "Rule saved" : "Rule created", "success");
      const savedTrigger = triggerEvent;
      setDrawerOpen(false);
      setAutomationTab(savedTrigger);
      resetEditor(savedTrigger);
      await load();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Save failed", "error");
    } finally {
      setSaving(false);
    }
  };

  const toggleEnabled = async (id: number, next: boolean) => {
    setRules((prev) => prev.map((r) => (r.id === id ? { ...r, is_enabled: next } : r)));
    try {
      const res = await fetch(`/api/tickets/automation/rules/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        cache: "no-store",
        body: JSON.stringify({ isEnabled: next }),
      });
      const json = (await res.json().catch(() => ({}))) as { success?: boolean; error?: string };
      if (!res.ok || !json.success) throw new Error(json.error ?? "Update failed");
      toast(next ? "Rule enabled" : "Rule disabled", "success");
      await load();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Update failed", "error");
      await load();
    }
  };

  const deleteRuleConfirmed = async (id: number) => {
    setRules((prev) => prev.filter((r) => r.id !== id));
    try {
      const res = await fetch(`/api/tickets/automation/rules/${id}`, {
        method: "DELETE",
        credentials: "include",
        cache: "no-store",
      });
      const json = (await res.json().catch(() => ({}))) as { success?: boolean; error?: string };
      if (!res.ok || !json.success) throw new Error(json.error ?? "Delete failed");
      toast("Rule deleted", "success");
      setMenuOpenId(null);
      await load();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Delete failed", "error");
      await load();
    }
  };

  const duplicateRuleConfirmed = async (id: number) => {
    try {
      const res = await fetch(`/api/tickets/automation/rules/${id}`, {
        credentials: "include",
        cache: "no-store",
      });
      const json = (await res.json()) as {
        success?: boolean;
        data?: {
          rule: Record<string, unknown>;
          conditions: Record<string, unknown>[];
          actions: { action_type: string; payload: unknown; combine_with_previous?: string }[];
        };
        error?: string;
      };
      if (!res.ok || !json.success || !json.data) throw new Error(json.error ?? "Load failed");
      const r = json.data.rule;
      const suffix = `_${Date.now().toString(36)}`;
      const newCode = `${String(r.rule_code ?? "rule").slice(0, 80)}${suffix}`;
      const body = {
        ruleCode: newCode,
        ruleName: `${String(r.rule_name ?? "Rule")} (copy)`,
        ruleDescription: r.rule_description != null ? String(r.rule_description) : null,
        triggerEvent: canonicalAutomationTriggerId(String(r.trigger_event ?? "ticket_updated")),
        rulePriority: Number(r.rule_priority ?? 0),
        isEnabled: true,
        oncePerTicket: r.once_per_ticket === true,
        stopAfterMatch: r.stop_after_match === true,
        executionMode: String(r.execution_mode ?? "immediate").toLowerCase() === "queued" ? "queued" : "immediate",
        executionDelaySeconds: Math.max(0, Number(r.execution_delay_seconds ?? 0) || 0),
        maxActionRetries: Math.min(10, Math.max(0, Number(r.max_action_retries ?? 2) || 2)),
        conditions: json.data.conditions.map((c, idx) => ({
          field: String(c.field ?? ""),
          operator: String(c.operator ?? ""),
          value: c.value,
          combineWithPrevious: idx === 0 ? "and" : normalizeCombineFromApi(c),
        })),
        actions: json.data.actions.map((a, idx) => ({
          actionType: a.action_type,
          payload: a.payload && typeof a.payload === "object" ? a.payload : {},
          combineWithPrevious: idx === 0 ? "and" : normalizeActionCombineFromApi(a as Record<string, unknown>),
        })),
      };
      const post = await fetch("/api/tickets/automation/rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        cache: "no-store",
        body: JSON.stringify(body),
      });
      const postJson = (await post.json().catch(() => ({}))) as { success?: boolean; error?: string };
      if (!post.ok || !postJson.success) throw new Error(postJson.error ?? "Duplicate failed");
      toast("Rule duplicated", "success");
      setMenuOpenId(null);
      await load();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Duplicate failed", "error");
    }
  };

  const executeConfirmedRuleAction = async () => {
    if (!confirmRuleAction) return;
    const { type, ruleId } = confirmRuleAction;
    if (type === "edit") {
      const ok = await openEdit(ruleId);
      if (ok) setConfirmRuleAction(null);
      return;
    }
    setConfirmRuleAction(null);
    if (type === "duplicate") await duplicateRuleConfirmed(ruleId);
    else await deleteRuleConfirmed(ruleId);
  };

  const runTest = async () => {
    if (!editingId) {
      toast("Save the rule first to run a test", "error");
      return;
    }
    setTestResult(null);
    try {
      const body: Record<string, number> = {};
      if (triggerEvent === "agent_went_online" || triggerEvent === "agent_went_offline") {
        const aid = parseInt(testAgentId, 10);
        if (!Number.isFinite(aid)) {
          toast("Enter agent user id", "error");
          return;
        }
        body.agentUserId = aid;
      } else {
        const tid = parseInt(testTicketId, 10);
        if (!Number.isFinite(tid)) {
          toast("Enter ticket id", "error");
          return;
        }
        body.ticketId = tid;
      }
      const res = await fetch(`/api/tickets/automation/rules/${editingId}/test`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        cache: "no-store",
        body: JSON.stringify(body),
      });
      const json = (await res.json()) as {
        success?: boolean;
        data?: { matches?: boolean; wouldRunActions?: unknown[] };
        error?: string;
      };
      if (!res.ok || !json.success) throw new Error(json.error ?? "Test failed");
      setTestResult(
        JSON.stringify({ matches: json.data?.matches, wouldRunActions: json.data?.wouldRunActions }, null, 2)
      );
      toast("Dry run complete — no data was changed", "success");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Test failed", "error");
    }
  };

  return (
    <div className={embedded ? "w-full" : "min-h-0"}>
      {!clientMounted || !accessReady ? (
        <p className="text-sm text-gray-500">Loading automations…</p>
      ) : !canUse ? (
        <p className="text-sm text-gray-600">You do not have access to ticket automation.</p>
      ) : (
        <>
      {loadError ? (
        <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-900 sm:px-4">
          <p className="font-medium">Automations unavailable</p>
          <p className="mt-1 text-xs opacity-90">
            {loadError.includes("0166") ? loadError : `${loadError} — run migration 0166_ticket_workflow_automation.sql`}
          </p>
        </div>
      ) : null}

      {/* Breadcrumb */}
      <nav className={`text-xs text-gray-500 ${embedded ? "mb-0" : "mb-1"}`} aria-label="Breadcrumb">
        <Link href="/dashboard/tickets" className="cursor-pointer hover:text-blue-600">
          Tickets
        </Link>
        <span className="mx-1.5">/</span>
        <Link href="/dashboard/tickets/queue/home" className="cursor-pointer hover:text-blue-600">
          Queue
        </Link>
        <span className="mx-1.5">/</span>
        <Link
          href={`${TICKETS_QUEUE_MANAGER_PATH}?section=workflow-rules`}
          className="cursor-pointer hover:text-blue-600"
        >
          Manager
        </Link>
        <span className="mx-1.5">/</span>
        <span className="font-medium text-gray-700">Automations</span>
      </nav>

      <div
        className={`flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between ${embedded ? "mb-2 mt-0.5" : "mb-4"}`}
      >
        <div>
          <h1 className={`font-semibold tracking-tight text-gray-900 ${embedded ? "text-xl sm:text-2xl" : "text-2xl"}`}>
            Automations
          </h1>
          <p className={`text-sm text-gray-500 ${embedded ? "mt-0.5" : "mt-1"}`}>
            Automate assignment, fields, tags, and emails when tickets change or when agents go online or fully offline.
            Break and busy keep ticket ownership unchanged.
          </p>
        </div>
        <button
          type="button"
          onClick={() => openCreate()}
          className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-700"
        >
          <Plus className="h-4 w-4" strokeWidth={2.5} />
          New rule
        </button>
      </div>

      {/* Tabs */}
      <div className="mb-0 flex flex-wrap items-center gap-1 border-b border-gray-200">
        {TRIGGER_TABS.map((t, ti) => {
          const count = rules.filter((r) => r.trigger_event === t.id).length;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setAutomationTab(t.id)}
              className={`relative -mb-px cursor-pointer border-b-2 py-2.5 text-sm font-medium transition-colors sm:py-3 ${
                embedded && ti === 0 ? "pl-0 pr-3 sm:pr-4" : "px-3 sm:px-4"
              } ${
                tabTrigger === t.id
                  ? "border-blue-600 text-blue-600"
                  : "border-transparent text-gray-600 hover:text-gray-900"
              }`}
            >
              <span>{t.shortLabel}</span>
              <span className="ml-1.5 rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-gray-600">
                {count}
              </span>
            </button>
          );
        })}
        <div className="ml-auto flex min-w-[200px] flex-1 items-center gap-2 pb-2 sm:max-w-xs sm:flex-none sm:pb-0">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="search"
              placeholder="Search rules…"
              value={searchQ}
              onChange={(e) => setSearchQ(e.target.value)}
              className="w-full rounded-lg border border-gray-200 bg-white py-2 pl-9 pr-3 text-sm outline-none ring-blue-500 focus:ring-2"
            />
          </div>
        </div>
      </div>

      {tabMeta.tabHint && tabTrigger !== "agent_went_offline" && tabTrigger !== "agent_went_online" ? (
        <p className="mb-4 mt-1 rounded-lg border border-slate-200 bg-slate-50/90 px-3 py-2 text-xs leading-relaxed text-slate-700">
          {tabMeta.tabHint}
        </p>
      ) : null}

      {tabTrigger === "agent_went_offline" ? (
        <div className="mb-4 rounded-xl border border-blue-200/80 bg-blue-50/95 px-4 py-3 text-sm text-blue-950 shadow-sm">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h3 className="text-sm font-semibold text-blue-950">
              Built-in: release tickets when an agent goes fully offline
            </h3>
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-blue-900 shadow-sm ring-1 ring-blue-100">
                {offlineSettingsLoading
                  ? "Status: …"
                  : offlineReleaseEnabled === false
                    ? "Status: Off"
                    : offlineReleaseEnabled === true
                      ? "Status: On"
                      : "Status: —"}
              </span>
              <button
                type="button"
                onClick={() => void runOfflineReleaseAutomationJobs()}
                disabled={!accessReady || !canUse || processingOfflineReleaseJobs}
                className="inline-flex cursor-pointer items-center justify-center rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 shadow-sm transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {processingOfflineReleaseJobs ? "Processing…" : "Run offline ticket releases"}
              </button>
            </div>
          </div>
          <p className="mt-2 max-w-2xl text-xs text-blue-900/85">
            Same as <span className="font-medium">Process automation jobs now</span> in Queue settings — run if an offline
            release looks stuck.
          </p>
          {offlineSettingsAvailable === false ? (
            <p className="mt-2 text-xs text-amber-800">Apply migration 0171 for manager toggle persistence.</p>
          ) : null}
        </div>
      ) : null}

      {tabTrigger === "agent_went_online" ? (
        <div className="mb-4 rounded-xl border border-emerald-200/80 bg-emerald-50/95 px-4 py-3 text-sm text-emerald-950 shadow-sm">
          <h3 className="text-sm font-semibold text-emerald-950">
            Auto-assign / queue balance when an agent comes online
          </h3>
          <p className="mt-1 max-w-3xl text-xs leading-relaxed text-emerald-900/95">
            When someone switches to <strong className="font-medium">Online</strong>, enabled rules here run in priority
            order. The usual driver is <strong className="font-medium">Rebalance queues for this agent</strong> — it runs
            group queue balance so unassigned tickets can auto-assign to them (caps and eligibility still apply). Break and
            busy do not fire this trigger.
          </p>
          {agentOnlineQueueBalanceRules.length > 0 ? (
            <div className="mt-3 rounded-lg border border-emerald-200/70 bg-white/90 px-3 py-2.5">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-emerald-800/90">
                Rule that runs queue balance on online (highest priority first)
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
                <span className="font-semibold text-emerald-950">{agentOnlineQueueBalanceRules[0]!.rule_name}</span>
                <span className="rounded-full bg-gray-100 px-2 py-0.5 font-mono text-[10px] text-gray-700">
                  {agentOnlineQueueBalanceRules[0]!.rule_code}
                </span>
                <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-medium text-emerald-800 ring-1 ring-emerald-100">
                  Priority {agentOnlineQueueBalanceRules[0]!.rule_priority}
                </span>
                {agentOnlineQueueBalanceRules[0]!.is_enabled ? (
                  <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-medium text-emerald-900">
                    Enabled
                  </span>
                ) : (
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-900">
                    Disabled
                  </span>
                )}
              </div>
              <p className="mt-2 text-[11px] text-emerald-900/85">
                Then:{" "}
                <span className="font-medium">
                  {buildActionsSummary(parseActionsPreview(agentOnlineQueueBalanceRules[0]!.actions_preview))}
                </span>
              </p>
              {agentOnlineQueueBalanceRules.length > 1 ? (
                <p className="mt-2 text-[11px] text-emerald-900/80">
                  {agentOnlineQueueBalanceRules.length - 1} more rule
                  {agentOnlineQueueBalanceRules.length > 2 ? "s" : ""} with the same action — order by priority below.
                </p>
              ) : null}
            </div>
          ) : (
            <p className="mt-2 text-xs text-amber-900">
              No rule with <strong className="font-medium">Rebalance queues for this agent</strong> yet. Add one with{" "}
              <strong className="font-medium">New rule</strong> — the editor defaults to the right condition and action for
              auto-assign when an agent goes online.
            </p>
          )}
        </div>
      ) : null}

      {skipLogs.length > 0 ? (
        <div className="mb-4 rounded-lg border border-amber-200/80 bg-amber-50/90 px-3 py-2 text-xs text-amber-950">
          <div className="flex items-center justify-between gap-2">
            <span className="font-semibold">Recent assignment skips (capacity / availability)</span>
            <button
              type="button"
              onClick={() => void refreshSkipLogs()}
              className="font-medium text-amber-900 underline hover:no-underline"
            >
              Refresh
            </button>
          </div>
          <ul className="mt-2 max-h-32 space-y-1 overflow-y-auto text-amber-900/95">
            {skipLogs.map((l) => (
              <li key={l.id} className="flex flex-wrap gap-x-2 border-t border-amber-200/50 pt-1 first:border-t-0 first:pt-0">
                <span className="text-amber-700">{relativeTime(l.created_at)}</span>
                <span>{l.summary}</span>
                {l.ticket_id ? (
                  <span className="font-mono text-[10px] text-amber-800">ticket #{l.ticket_id}</span>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {filteredRules.length === 0 ? (
        <div
          className={`rounded-xl border border-dashed border-gray-200 text-center ${embedded ? "mt-5 py-12" : "mt-8 py-16"}`}
        >
          <p className="text-sm font-medium text-gray-700">
            {tabTrigger === "agent_went_offline"
              ? "No custom workflow rules for Agent offline"
              : `No rules for ${tabMeta.shortLabel}`}
          </p>
          <p className="mt-1 text-xs text-gray-500">
            {tabTrigger === "agent_went_offline"
              ? "Add a rule here for extra steps after someone goes fully offline, or use Queue settings for the built-in release only."
              : "Create one to run when this trigger fires."}
          </p>
          <button
            type="button"
            onClick={() => openCreate()}
            className="mt-4 cursor-pointer text-sm font-medium text-blue-600 hover:text-blue-700"
          >
            + New rule
          </button>
        </div>
      ) : (
        <ul className={`space-y-4 ${embedded ? "mt-4" : "mt-6"}`}>
          {filteredRules.map((r, idx) => {
            const preview = parsePreview(r.conditions_preview);
            const summary = buildConditionsSummary(preview);
            const actPrev = parseActionsPreview(r.actions_preview);
            const actionsSummary = buildActionsSummary(actPrev);
            const exMode = String(r.execution_mode ?? "immediate");
            const by =
              r.updated_by_name?.trim() ||
              r.updated_by_email?.trim() ||
              (r.updated_by_user_id != null ? `User #${r.updated_by_user_id}` : "—");
            const condSummary = summary;
            const isCatchAllSummary = condSummary.includes("always matches");
            const condLead =
              isCatchAllSummary || /^(or if|and if)\b/i.test(condSummary.trim()) ? "" : "If ";
            return (
              <li
                key={r.id}
                className="rounded-xl border border-gray-200 bg-white shadow-sm transition-shadow hover:shadow-md overflow-visible"
              >
                <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-medium tabular-nums text-gray-400">{idx + 1}.</span>
                      <h2 className="text-base font-semibold text-gray-900">{r.rule_name}</h2>
                      <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-gray-600">
                        {r.rule_code}
                      </span>
                      <span className="rounded-full bg-violet-50 px-2 py-0.5 text-[10px] font-medium text-violet-800">
                        {triggerTabLabel(r.trigger_event)}
                      </span>
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-700">
                        Priority {r.rule_priority}
                      </span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                          exMode === "queued" ? "bg-amber-50 text-amber-900" : "bg-sky-50 text-sky-900"
                        }`}
                      >
                        {exMode === "queued" ? "Queued run" : "Immediate"}
                      </span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                          r.is_enabled ? "bg-emerald-50 text-emerald-800" : "bg-gray-100 text-gray-600"
                        }`}
                      >
                        {r.is_enabled ? "Enabled" : "Disabled"}
                      </span>
                    </div>
                    <p className="mt-2 text-sm leading-relaxed text-gray-600">
                      {condLead ? (
                        <>
                          <span className="font-medium text-gray-700">{condLead.trim()}</span>{" "}
                        </>
                      ) : null}
                      <span className="text-teal-700">{condSummary}</span>
                    </p>
                    <p className="mt-1.5 text-sm text-gray-700">
                      <span className="font-medium text-indigo-800">Then</span>{" "}
                      <span className="text-indigo-900">{actionsSummary}</span>
                    </p>
                    {r.rule_description ? (
                      <p className="mt-1 text-xs text-gray-500 line-clamp-2">{r.rule_description}</p>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 items-center gap-2 sm:flex-col sm:items-end sm:gap-2">
                    <button
                      type="button"
                      role="switch"
                      aria-checked={r.is_enabled}
                      onClick={() => void toggleEnabled(r.id, !r.is_enabled)}
                      className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${
                        r.is_enabled ? "bg-blue-600" : "bg-gray-200"
                      }`}
                    >
                      <span
                        className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-transform ${
                          r.is_enabled ? "left-[calc(100%-1.625rem)]" : "left-0.5"
                        }`}
                      />
                    </button>
                    <div
                      className="relative shrink-0"
                      ref={menuOpenId === r.id ? menuRef : null}
                    >
                      <button
                        type="button"
                        aria-expanded={menuOpenId === r.id}
                        aria-haspopup="menu"
                        aria-label="Open rule actions menu"
                        onClick={(e) => {
                          e.stopPropagation();
                          setMenuOpenId((id) => (id === r.id ? null : r.id));
                        }}
                        className="flex h-9 w-9 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-600 shadow-sm hover:bg-gray-50 hover:text-gray-900"
                      >
                        <MoreVertical className="h-5 w-5" aria-hidden />
                      </button>
                      {menuOpenId === r.id ? (
                        <div
                          role="menu"
                          className="absolute right-0 top-full z-[70] mt-1.5 w-48 origin-top-right rounded-lg border border-gray-200 bg-white py-1 shadow-xl ring-1 ring-black/5"
                        >
                          <button
                            type="button"
                            role="menuitem"
                            className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-gray-800 hover:bg-gray-50"
                            onClick={(e) => {
                              e.stopPropagation();
                              setMenuOpenId(null);
                              setConfirmRuleAction({
                                type: "edit",
                                ruleId: r.id,
                                ruleName: r.rule_name,
                              });
                            }}
                          >
                            <Pencil className="h-4 w-4 shrink-0 text-gray-500" aria-hidden />
                            Edit
                          </button>
                          <button
                            type="button"
                            role="menuitem"
                            className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-gray-800 hover:bg-gray-50"
                            onClick={(e) => {
                              e.stopPropagation();
                              setMenuOpenId(null);
                              setConfirmRuleAction({
                                type: "duplicate",
                                ruleId: r.id,
                                ruleName: r.rule_name,
                              });
                            }}
                          >
                            <Copy className="h-4 w-4 shrink-0 text-gray-500" aria-hidden />
                            Duplicate
                          </button>
                          <button
                            type="button"
                            role="menuitem"
                            className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-red-600 hover:bg-red-50"
                            onClick={(e) => {
                              e.stopPropagation();
                              setMenuOpenId(null);
                              setConfirmRuleAction({
                                type: "delete",
                                ruleId: r.id,
                                ruleName: r.rule_name,
                              });
                            }}
                          >
                            <Trash2 className="h-4 w-4 shrink-0" aria-hidden />
                            Delete
                          </button>
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-3 divide-x divide-gray-100 border-t border-gray-100 bg-gray-50/80 text-center text-xs">
                  <div className="px-3 py-2.5">
                    <div className="font-medium text-gray-500">Last modified</div>
                    <div className="mt-0.5 text-gray-800">{relativeTime(r.updated_at ?? null)}</div>
                  </div>
                  <div className="px-3 py-2.5">
                    <div className="font-medium text-gray-500">By</div>
                    <div className="mt-0.5 truncate text-gray-800" title={by}>
                      {by}
                    </div>
                  </div>
                  <div className="px-3 py-2.5">
                    <div className="font-medium text-gray-500">Runs (7d)</div>
                    <div className="mt-0.5 text-gray-400">—</div>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {typeof document !== "undefined" && confirmRuleAction
        ? createPortal(
            <div
              className="fixed inset-0 z-[190] flex items-center justify-center bg-black/45 p-4"
              role="presentation"
              onClick={() => setConfirmRuleAction(null)}
            >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="rule-action-confirm-title"
            className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="rule-action-confirm-title" className="text-lg font-semibold text-gray-900">
              {confirmRuleAction.type === "edit"
                ? "Open rule editor?"
                : confirmRuleAction.type === "duplicate"
                  ? "Duplicate this rule?"
                  : "Delete this rule?"}
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-gray-600">
              <span className="font-medium text-gray-800">{confirmRuleAction.ruleName}</span>
              {confirmRuleAction.type === "edit"
                ? " — You can change conditions, actions, and run settings in the side panel."
                : confirmRuleAction.type === "duplicate"
                  ? " — A copy will be created with a new rule code. You can rename it afterward."
                  : " — This cannot be undone. The rule will be removed from Automations."}
            </p>
            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setConfirmRuleAction(null)}
                className="rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-800 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void executeConfirmedRuleAction()}
                className={`rounded-lg px-4 py-2.5 text-sm font-semibold text-white shadow-sm ${
                  confirmRuleAction.type === "delete"
                    ? "bg-red-600 hover:bg-red-700"
                    : "bg-blue-600 hover:bg-blue-700"
                }`}
              >
                {confirmRuleAction.type === "edit"
                  ? "Continue to editor"
                  : confirmRuleAction.type === "duplicate"
                    ? "Duplicate"
                    : "Delete rule"}
              </button>
            </div>
          </div>
            </div>,
            document.body
          )
        : null}

      {/* Editor drawer (portal: escapes overflow-y-auto on main / queue layout) */}
      {typeof document !== "undefined" && drawerOpen
        ? createPortal(
            <div
              className="fixed inset-0 z-[200] flex justify-end bg-black/40"
              role="presentation"
            >
          <div
            className="h-full w-full max-w-lg overflow-y-auto border-l border-gray-200 bg-white shadow-2xl"
            role="dialog"
            aria-labelledby="workflow-rule-editor-title"
          >
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-gray-100 bg-white px-4 py-3">
              <nav className="text-[11px] text-gray-500">
                <span>Automations</span>
                <span className="mx-1">›</span>
                <span>{editingId ? "Edit rule" : "New rule"}</span>
              </nav>
              <button
                type="button"
                aria-label="Close"
                onClick={() => {
                  setDrawerOpen(false);
                  resetEditor(tabTrigger);
                }}
                className="rounded-lg p-2 text-gray-500 hover:bg-gray-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <h2 id="workflow-rule-editor-title" className="sr-only">
              {editingId ? "Edit automation rule" : "New automation rule"}
            </h2>
            <div className="space-y-6 p-4 pb-28">
              <div className="space-y-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <label htmlFor="workflow-rule-name" className="block text-xs font-medium text-gray-600">
                      Rule name
                    </label>
                    <input
                      id="workflow-rule-name"
                      value={ruleName}
                      onChange={(e) => setRuleName(e.target.value)}
                      placeholder="e.g. Route premium merchant tickets"
                      className="mt-1.5 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                    />
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${
                      isEnabled ? "bg-emerald-100 text-emerald-800" : "bg-gray-100 text-gray-600"
                    }`}
                  >
                    {isEnabled ? "Enabled" : "Disabled"}
                  </span>
                </div>
                {!editingId ? (
                  <div>
                    <label htmlFor="workflow-rule-code" className="block text-xs font-medium text-gray-600">
                      Rule code <span className="font-normal text-gray-400">(unique, used internally)</span>
                    </label>
                    <input
                      id="workflow-rule-code"
                      value={ruleCode}
                      onChange={(e) => {
                        setRuleCodeUserEdited(true);
                        setRuleCode(e.target.value);
                      }}
                      placeholder="e.g. premium_routing"
                      className="mt-1.5 w-full rounded-lg border border-gray-200 px-3 py-2 font-mono text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                    />
                    <p className="mt-1 text-[11px] text-gray-500">
                      Edit if needed, otherwise it will be auto-filled.
                    </p>
                  </div>
                ) : (
                  <div>
                    <div className="text-xs font-medium text-gray-600">Rule code</div>
                    <p className="mt-1.5 font-mono text-sm text-gray-800">{ruleCode}</p>
                  </div>
                )}
                <div>
                  <label htmlFor="workflow-rule-description" className="block text-xs font-medium text-gray-600">
                    Description
                  </label>
                  <textarea
                    id="workflow-rule-description"
                    value={ruleDescription}
                    onChange={(e) => setRuleDescription(e.target.value)}
                    placeholder="Add a description for your team…"
                    rows={2}
                    className="mt-1.5 w-full resize-none rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  />
                </div>
              </div>

              {/* Step 1 — Event */}
              <section>
                <div className="mb-3 flex items-center gap-2">
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-teal-100 text-sm font-bold text-teal-800">
                    1
                  </span>
                  <h3 className="text-sm font-semibold text-teal-800">Event</h3>
                </div>
                <div className="rounded-xl border border-gray-200 bg-gray-50/80 p-4">
                  <label className="text-xs font-medium text-gray-600">When</label>
                  <select
                    value={triggerEvent}
                    onChange={(e) => {
                      const v = e.target.value as (typeof TRIGGER_TABS)[number]["id"];
                      setTriggerEvent(v);
                      setConditionRows([defaultCondition(v)]);
                      setActionRows([defaultActionForTrigger(v)]);
                    }}
                    className={`mt-2 ${workflowSelectClass}`}
                  >
                    {TRIGGER_TABS.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                </div>
              </section>

              {/* Step 2 — Conditions */}
              <section>
                <div className="mb-3 flex items-center gap-2">
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-amber-100 text-sm font-bold text-amber-900">
                    2
                  </span>
                  <h3 className="text-sm font-semibold text-amber-900">Condition</h3>
                </div>
                <div className="rounded-xl border border-amber-200/60 bg-amber-50/30 p-4">
                  <p className="text-xs font-medium text-gray-700">On tickets with these properties</p>
                  <div className="mt-4 space-y-3">
                    {conditionRows.map((row, i) => (
                      <div key={i}>
                        {i > 0 ? (
                          <div className="relative my-3 flex flex-col items-center gap-1 py-0.5">
                            <div className="absolute inset-x-0 top-1/2 h-px bg-amber-200" />
                            <div className="relative flex flex-col items-center gap-0.5">
                              <span className="rounded-full border border-amber-200/80 bg-amber-50/95 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-900 shadow-sm">
                                {row.combineWithPrevious === "or" ? "Or also if" : "And also if"}
                              </span>
                              <select
                                aria-label={`Combine condition ${i + 1} with previous row`}
                                value={row.combineWithPrevious === "or" ? "or" : "and"}
                                onChange={(e) => {
                                  const next = [...conditionRows];
                                  next[i] = {
                                    ...next[i],
                                    combineWithPrevious: e.target.value === "or" ? "or" : "and",
                                  };
                                  setConditionRows(next);
                                }}
                                className={`${workflowSelectClass} !w-auto min-w-[5rem] border-amber-100 py-1`}
                              >
                                <option value="and">AND</option>
                                <option value="or">OR</option>
                              </select>
                            </div>
                          </div>
                        ) : null}
                        <div className="flex flex-col gap-2 rounded-lg border border-gray-200 bg-white p-3 shadow-sm">
                          <div className="flex flex-wrap items-center gap-2 text-sm">
                            <span className="text-gray-500">In</span>
                            <span className="rounded-md bg-gray-100 px-2 py-1 text-xs font-medium text-gray-700">
                              {triggerEvent === "agent_went_online" || triggerEvent === "agent_went_offline"
                                ? "Agent"
                                : "Tickets"}
                            </span>
                          </div>
                          <div className="grid gap-2 sm:grid-cols-12">
                            <select
                              value={row.field}
                              onChange={(e) => {
                                const next = [...conditionRows];
                                next[i] = { ...next[i], field: e.target.value };
                                setConditionRows(next);
                              }}
                              className={`sm:col-span-4 ${workflowSelectClass}`}
                            >
                              {CONDITION_FIELD_OPTIONS.map((k) => (
                                <option key={k} value={k}>
                                  {FIELD_LABELS[k] ?? k}
                                </option>
                              ))}
                            </select>
                            <select
                              value={row.operator}
                              onChange={(e) => {
                                const next = [...conditionRows];
                                next[i] = { ...next[i], operator: e.target.value };
                                setConditionRows(next);
                              }}
                              className={`sm:col-span-4 ${workflowSelectClass}`}
                            >
                              {OP_KEYS.map((k) => (
                                <option key={k} value={k}>
                                  {OPERATOR_LABELS[k]}
                                </option>
                              ))}
                            </select>
                            {row.operator !== "is_null" && row.operator !== "is_not_null" ? (
                              row.field === "is_online" ? (
                                <select
                                  value={row.value === true || row.value === "true" || row.value === 1 ? "true" : "false"}
                                  onChange={(e) => {
                                    const next = [...conditionRows];
                                    next[i] = { ...next[i], value: e.target.value === "true" };
                                    setConditionRows(next);
                                  }}
                                  className={`sm:col-span-4 ${workflowSelectClass}`}
                                >
                                  <option value="true">Yes (online)</option>
                                  <option value="false">No</option>
                                </select>
                              ) : row.field === "group_id" ? (
                                <div className="sm:col-span-4">
                                  <WorkflowGroupSearchCombo
                                    groups={ticketGroups}
                                    loading={ticketRefLoading}
                                    valueId={
                                      row.value != null && String(row.value).trim() !== "" && !Number.isNaN(Number(row.value))
                                        ? Number(row.value)
                                        : null
                                    }
                                    onPick={(id) => {
                                      const next = [...conditionRows];
                                      next[i] = { ...next[i], value: id === null ? "" : id };
                                      setConditionRows(next);
                                    }}
                                    placeholder="Search queue by name…"
                                  />
                                </div>
                              ) : (
                                <input
                                  value={
                                    Array.isArray(row.value)
                                      ? row.value.join(", ")
                                      : row.value != null && typeof row.value === "object"
                                        ? JSON.stringify(row.value)
                                        : String(row.value ?? "")
                                  }
                                  onChange={(e) => {
                                    const next = [...conditionRows];
                                    const raw = e.target.value;
                                    next[i] = {
                                      ...next[i],
                                      value: raw.includes(",") ? raw.split(",").map((s) => s.trim()) : raw,
                                    };
                                    setConditionRows(next);
                                  }}
                                  placeholder="Value"
                                  className="sm:col-span-4 rounded-md border border-gray-200 px-2 py-1.5 text-xs text-gray-900"
                                />
                              )
                            ) : (
                              <div className="sm:col-span-4 flex items-center text-xs text-gray-400">No value</div>
                            )}
                          </div>
                          <div className="flex justify-end">
                            <button
                              type="button"
                              onClick={() => setConditionRows(conditionRows.filter((_, j) => j !== i))}
                              disabled={conditionRows.length <= 1}
                              className="text-xs text-red-600 hover:underline disabled:opacity-40"
                            >
                              Remove
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() => setConditionRows([...conditionRows, defaultCondition(triggerEvent)])}
                    className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-blue-600 hover:text-blue-700"
                  >
                    <Plus className="h-4 w-4" />
                    Add condition
                  </button>
                </div>
              </section>

              {/* Step 3 — Actions */}
              <section>
                <div className="mb-3 flex items-center gap-2">
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-100 text-sm font-bold text-indigo-900">
                    3
                  </span>
                  <h3 className="text-sm font-semibold text-indigo-900">Actions</h3>
                </div>
                <div className="space-y-3">
                  {actionRows.map((row, i) => (
                    <div key={i}>
                      {i > 0 ? (
                        <div className="relative my-3 flex flex-col items-center gap-1 py-0.5">
                          <div className="absolute inset-x-0 top-1/2 h-px bg-indigo-100" />
                          <div className="relative flex flex-col items-center gap-0.5">
                            <span className="rounded-full border border-indigo-100 bg-indigo-50/95 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-indigo-900 shadow-sm">
                              {row.combineWithPrevious === "or"
                                ? "Or else try"
                                : row.combineWithPrevious === "if"
                                  ? "IF (prev ok)"
                                  : "And then"}
                            </span>
                            <select
                              aria-label={`Combine action ${i + 1} with previous executed action`}
                              value={row.combineWithPrevious === "or" ? "or" : row.combineWithPrevious === "if" ? "if" : "and"}
                              onChange={(e) => {
                                const next = [...actionRows];
                                const v = e.target.value;
                                next[i] = {
                                  ...next[i],
                                  combineWithPrevious: v === "or" ? "or" : v === "if" ? "if" : "and",
                                };
                                setActionRows(next);
                              }}
                              className={`${workflowSelectClass} !w-auto min-w-[5rem] border-indigo-100 py-1`}
                            >
                              <option value="and">AND (always run)</option>
                              <option value="or">OR (if previous failed)</option>
                              <option value="if">IF (if previous succeeded)</option>
                            </select>
                          </div>
                        </div>
                      ) : null}
                      <div className="rounded-xl border border-gray-200 bg-white p-3 shadow-sm">
                        <div className="flex flex-wrap items-end gap-2">
                          <label className="min-w-[200px] flex-1 text-xs font-medium text-gray-600">
                            Then
                            <select
                              value={row.actionType}
                              onChange={(e) => {
                                const next = [...actionRows];
                                next[i] = { ...next[i], actionType: e.target.value, payload: {} };
                                setActionRows(next);
                              }}
                              className={`mt-1 ${workflowSelectClass}`}
                            >
                            {workflowActionEditorKeys().map((k) => (
                              <option key={k} value={k}>
                                {ACTION_LABELS[k]}
                              </option>
                            ))}
                          </select>
                        </label>
                        <ActionPayloadFields
                          actionType={row.actionType}
                          payload={row.payload}
                          groups={ticketGroups}
                          groupsLoading={ticketRefLoading}
                          onChange={(p) => {
                            const next = [...actionRows];
                            next[i] = { ...next[i], payload: p };
                            setActionRows(next);
                          }}
                        />
                          <button
                            type="button"
                            onClick={() => setActionRows(actionRows.filter((_, j) => j !== i))}
                            disabled={actionRows.length <= 1}
                            className="shrink-0 rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-red-600 disabled:opacity-40"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => setActionRows([...actionRows, defaultActionForTrigger(triggerEvent)])}
                    className="inline-flex items-center gap-1 text-sm font-medium text-blue-600 hover:text-blue-700"
                  >
                    <Plus className="h-4 w-4" />
                    Add action
                  </button>
                </div>
              </section>

              {/* Step 4 — Execution & priority */}
              <section>
                <div className="mb-3 flex items-center gap-2">
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-200 text-sm font-bold text-slate-900">
                    4
                  </span>
                  <h3 className="text-sm font-semibold text-slate-900">Run settings</h3>
                </div>
                <div className="space-y-4 rounded-xl border border-slate-200 bg-slate-50/60 p-4">
                  <label className="block text-xs font-medium text-gray-600">
                    Priority <span className="font-normal text-gray-400">(higher number runs first)</span>
                    <input
                      type="number"
                      value={rulePriority}
                      onChange={(e) => setRulePriority(parseInt(e.target.value, 10) || 0)}
                      className="mt-1.5 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm"
                    />
                  </label>
                  <label className="block text-xs font-medium text-gray-600">
                    Execution mode
                    <select
                      value={executionMode}
                      onChange={(e) => setExecutionMode(e.target.value === "queued" ? "queued" : "immediate")}
                      className={`mt-1.5 ${workflowSelectClass}`}
                    >
                      <option value="immediate">Immediate (run as soon as the trigger fires)</option>
                      <option value="queued">Queued (respect delay / job worker timing)</option>
                    </select>
                  </label>
                  <label className="block text-xs font-medium text-gray-600">
                    Delay before run (seconds)
                    <input
                      type="number"
                      min={0}
                      value={executionDelaySeconds}
                      onChange={(e) => setExecutionDelaySeconds(Math.max(0, parseInt(e.target.value, 10) || 0))}
                      className="mt-1.5 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm"
                    />
                  </label>
                  <label className="block text-xs font-medium text-gray-600">
                    Max retries per action
                    <input
                      type="number"
                      min={0}
                      max={10}
                      value={maxActionRetries}
                      onChange={(e) =>
                        setMaxActionRetries(Math.min(10, Math.max(0, parseInt(e.target.value, 10) || 0)))
                      }
                      className="mt-1.5 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm"
                    />
                  </label>
                  <label className="flex items-center gap-2 text-sm text-gray-800">
                    <input type="checkbox" checked={isEnabled} onChange={(e) => setIsEnabled(e.target.checked)} />
                    Rule enabled
                  </label>
                </div>
              </section>

              <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
                <button
                  type="button"
                  onClick={() => setShowAdvanced(!showAdvanced)}
                  className="flex w-full items-center justify-between text-left text-sm font-medium text-gray-800"
                >
                  Advanced
                  <span className="text-gray-400">{showAdvanced ? "▼" : "▶"}</span>
                </button>
                {showAdvanced ? (
                  <div className="mt-3 space-y-3 border-t border-gray-200 pt-3">
                    <label className="flex items-center gap-2 text-sm text-gray-700">
                      <input type="checkbox" checked={oncePerTicket} onChange={(e) => setOncePerTicket(e.target.checked)} />
                      Apply this rule only once (no repeat actions)
                    </label>
                    <p className="text-xs text-gray-500">For ticket triggers: once per ticket. For agent online/offline: once per agent per event.</p>
                    <label className="flex items-center gap-2 text-sm text-gray-700">
                      <input type="checkbox" checked={stopAfterMatch} onChange={(e) => setStopAfterMatch(e.target.checked)} />
                      Don’t run other rules after this one succeeds
                    </label>
                  </div>
                ) : null}
              </div>

              {/* Summary preview — always reflects current Event / Conditions / Actions in this editor */}
              <div className="rounded-xl border border-gray-200 bg-white p-4">
                <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Summary</div>
                <p className="mt-2 text-sm font-medium text-teal-800">
                  {TRIGGER_TABS.find((t) => t.id === triggerEvent)?.label ?? triggerEvent}
                </p>
                <ul className="mt-2 space-y-1 text-sm">
                  {conditionRows
                    .map((c, origIdx) => ({ c, origIdx }))
                    .filter(({ c }) => Boolean(c.field?.trim() && c.operator?.trim()))
                    .map(({ c, origIdx }, displayIdx) => (
                      <li key={`summary-cond-${origIdx}`} className="flex gap-2 text-gray-700">
                        <span className="text-blue-500">●</span>
                        <span>
                          {displayIdx === 0 ? (
                            <>
                              If <span className="text-teal-700">{formatConditionClause(c as ConditionPreview)}</span>
                            </>
                          ) : c.combineWithPrevious === "or" ? (
                            <>
                              Or if <span className="text-teal-700">{formatConditionClause(c as ConditionPreview)}</span>
                            </>
                          ) : (
                            <>
                              And if <span className="text-teal-700">{formatConditionClause(c as ConditionPreview)}</span>
                            </>
                          )}
                        </span>
                      </li>
                    ))}
                </ul>
                {!conditionRows.some((c) => c.field?.trim() && c.operator?.trim()) ? (
                  <p className="mt-2 text-sm text-gray-500">No conditions yet — finish step 2 to see them here.</p>
                ) : null}
                <p className="mt-2 text-sm text-gray-800">
                  <span className="font-medium text-indigo-800">Then</span>{" "}
                  <span className="text-indigo-900">
                    {buildActionsSummary(
                      actionRows
                        .filter((a) => a.actionType?.trim())
                        .map((a, idx) => ({
                          action_type: a.actionType,
                          payload: a.payload,
                          combine_with_previous:
                            idx === 0 ? "and" : a.combineWithPrevious === "or" ? "or" : a.combineWithPrevious === "if" ? "if" : "and",
                        }))
                    )}
                  </span>
                </p>
              </div>

              {editingId ? (
                <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 p-4">
                  <p className="text-xs font-semibold text-gray-700">Test (dry run)</p>
                  {triggerEvent === "agent_went_online" || triggerEvent === "agent_went_offline" ? (
                    <input
                      type="text"
                      inputMode="numeric"
                      autoComplete="off"
                      className="mt-2 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-500 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                      placeholder="e.g. 42 (agent system_users.id)"
                      value={testAgentId}
                      onChange={(e) => setTestAgentId(e.target.value)}
                    />
                  ) : (
                    <input
                      type="text"
                      inputMode="numeric"
                      autoComplete="off"
                      className="mt-2 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-500 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                      placeholder="e.g. 10025 (unified_tickets.id)"
                      value={testTicketId}
                      onChange={(e) => setTestTicketId(e.target.value)}
                    />
                  )}
                  <button
                    type="button"
                    onClick={() => void runTest()}
                    className="mt-2 rounded-lg bg-gray-900 px-3 py-2 text-xs font-medium text-white hover:bg-gray-800"
                  >
                    Run test
                  </button>
                  {testResult ? (
                    <pre className="mt-2 max-h-36 overflow-auto rounded-lg bg-slate-900 p-2 text-[10px] text-emerald-200">
                      {testResult}
                    </pre>
                  ) : null}
                </div>
              ) : null}
            </div>

            <div className="fixed bottom-0 right-0 flex w-full max-w-lg justify-end gap-2 border-t border-gray-200 bg-white px-4 py-3 shadow-[0_-4px_12px_rgba(0,0,0,0.06)]">
              <button
                type="button"
                onClick={() => {
                  setDrawerOpen(false);
                  resetEditor(tabTrigger);
                }}
                className="rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => void saveRule()}
                className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {saving ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
            </div>,
            document.body
          )
        : null}
        </>
      )}
    </div>
  );
}

/** Search ticket_groups (from reference-data API) for Move to queue / routing actions and group_id conditions. */
function WorkflowGroupSearchCombo({
  groups,
  loading,
  valueId,
  onPick,
  optional = false,
  placeholder = "Search queue by name or code…",
}: {
  groups: TicketReferenceGroup[];
  loading: boolean;
  valueId: number | null;
  onPick: (id: number | null) => void;
  optional?: boolean;
  placeholder?: string;
}) {
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);

  const selected = valueId != null && Number.isFinite(valueId) && valueId > 0 ? groups.find((g) => g.id === valueId) : undefined;

  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();
    if (!qq) return groups.slice(0, 100);
    return groups
      .filter(
        (g) =>
          g.groupName.toLowerCase().includes(qq) ||
          String(g.id).includes(qq) ||
          (g.groupCode && g.groupCode.toLowerCase().includes(qq))
      )
      .slice(0, 100);
  }, [groups, q]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const inputDisplay = open ? q : selected ? `${selected.groupName} (#${selected.id})` : "";

  return (
    <div ref={rootRef} className="relative w-full min-w-[12rem]">
      <div className="flex gap-1.5">
        <input
          type="text"
          autoComplete="off"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          disabled={loading}
          value={loading ? "Loading queues…" : inputDisplay}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
          }}
          onFocus={() => {
            setOpen(true);
            setQ("");
          }}
          placeholder={loading ? "Loading…" : placeholder}
          className={`min-w-0 flex-1 rounded-md border border-gray-200 bg-white px-2 py-1.5 text-xs text-gray-900 placeholder:text-gray-400 disabled:bg-gray-50`}
        />
        {optional ? (
          <button
            type="button"
            className="shrink-0 rounded-md border border-gray-200 bg-white px-2 py-1 text-[11px] font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50"
            disabled={loading || valueId == null}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              onPick(null);
              setQ("");
              setOpen(false);
            }}
          >
            Clear
          </button>
        ) : null}
      </div>
      {open && !loading && groups.length > 0 ? (
        <ul
          id={listId}
          role="listbox"
          className="absolute left-0 right-0 z-[280] mt-1 max-h-52 overflow-auto rounded-md border border-gray-200 bg-white py-1 shadow-lg ring-1 ring-black/5"
        >
          {filtered.length === 0 ? (
            <li className="px-3 py-2 text-xs text-gray-500">No matching queue</li>
          ) : (
            filtered.map((g) => (
              <li key={g.id} role="option">
                <button
                  type="button"
                  className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-xs hover:bg-blue-50"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    onPick(g.id);
                    setOpen(false);
                    setQ("");
                  }}
                >
                  <span className="font-medium text-gray-900">{g.groupName}</span>
                  <span className="shrink-0 font-mono text-[10px] text-gray-400">#{g.id}</span>
                </button>
              </li>
            ))
          )}
        </ul>
      ) : null}
      {!loading && groups.length === 0 ? (
        <p className="mt-1 text-[10px] text-amber-800">No queues in Ticket reference data — check ticket_groups.</p>
      ) : null}
    </div>
  );
}

function ActionPayloadFields({
  actionType,
  payload,
  onChange,
  groups,
  groupsLoading,
}: {
  actionType: string;
  payload: Record<string, unknown>;
  onChange: (p: Record<string, unknown>) => void;
  groups: TicketReferenceGroup[];
  groupsLoading: boolean;
}) {
  const set = (patch: Record<string, unknown>) => onChange({ ...payload, ...patch });

  if (actionType === "assign_to_agent") {
    const v = payload.agent_user_id ?? payload.agentUserId ?? "";
    return (
      <label className="min-w-[120px] flex-1 text-xs text-gray-600">
        Agent user id
        <input
          type="number"
          value={v === "" ? "" : String(v)}
          onChange={(e) => set({ agent_user_id: e.target.value ? Number(e.target.value) : "" })}
          className="mt-1 w-full rounded-md border border-gray-200 px-2 py-1.5 text-xs text-gray-900"
        />
      </label>
    );
  }
  if (actionType === "set_status") {
    return (
      <label className="min-w-[160px] flex-1 text-xs text-gray-600">
        Status
        <select
          value={String(payload.status ?? "OPEN")}
          onChange={(e) => set({ status: e.target.value })}
          className={`mt-1 ${workflowSelectClass}`}
        >
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </label>
    );
  }
  if (actionType === "set_priority") {
    return (
      <label className="min-w-[140px] flex-1 text-xs text-gray-600">
        Priority
        <select
          value={String(payload.priority ?? "MEDIUM")}
          onChange={(e) => set({ priority: e.target.value })}
          className={`mt-1 ${workflowSelectClass}`}
        >
          {PRIORITY_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </label>
    );
  }
  if (actionType === "add_tags") {
    const raw = Array.isArray(payload.tags) ? (payload.tags as string[]).join(", ") : String(payload.tags ?? "");
    return (
      <label className="min-w-[180px] flex-1 text-xs text-gray-600">
        Tags (comma-separated)
        <input
          value={raw}
          onChange={(e) =>
            set({
              tags: e.target.value
                .split(",")
                .map((s) => s.trim())
                .filter(Boolean),
            })
          }
          className="mt-1 w-full rounded-md border border-gray-200 px-2 py-1.5 text-xs text-gray-900"
        />
      </label>
    );
  }
  if (actionType === "set_group" || actionType === "run_queue_balance_for_group") {
    const raw = payload.group_id ?? payload.groupId;
    const num =
      typeof raw === "number"
        ? raw
        : raw != null && String(raw).trim() !== "" && !Number.isNaN(Number(raw))
          ? Number(raw)
          : null;
    return (
      <label className="min-w-[200px] flex-1 text-xs font-medium text-gray-600">
        Queue (search by name)
        <div className="mt-1">
          <WorkflowGroupSearchCombo
            groups={groups}
            loading={groupsLoading}
            valueId={num != null && num > 0 && Number.isFinite(num) ? num : null}
            onPick={(id) => {
              if (id == null) {
                onChange({ ...payload, group_id: undefined, groupId: undefined });
                return;
              }
              set({ group_id: id });
            }}
            optional={false}
          />
        </div>
      </label>
    );
  }
  if (
    actionType === "assign_least_loaded" ||
    actionType === "assign_round_robin" ||
    actionType === "assign_priority_weighted"
  ) {
    const raw = payload.group_id ?? payload.groupId;
    const num =
      typeof raw === "number"
        ? raw
        : raw != null && String(raw).trim() !== "" && !Number.isNaN(Number(raw))
          ? Number(raw)
          : null;
    return (
      <label className="min-w-[200px] flex-1 text-xs font-medium text-gray-600">
        Target queue (optional — else ticket&apos;s group)
        <div className="mt-1">
          <WorkflowGroupSearchCombo
            groups={groups}
            loading={groupsLoading}
            valueId={num != null && num > 0 && Number.isFinite(num) ? num : null}
            onPick={(id) => {
              if (id == null) {
                onChange({ ...payload, group_id: undefined, groupId: undefined });
                return;
              }
              set({ group_id: id });
            }}
            optional
            placeholder="Search or leave empty…"
          />
        </div>
      </label>
    );
  }
  if (actionType === "send_notification") {
    return (
      <label className="min-w-[180px] flex-1 text-xs text-gray-600">
        When to email
        <select
          value={String(payload.event_code ?? "ticket_assigned")}
          onChange={(e) => set({ event_code: e.target.value })}
          className={`mt-1 ${workflowSelectClass}`}
        >
          <option value="ticket_assigned">Ticket assigned (notify assignee)</option>
          <option value="ticket_reopened">Ticket reopened</option>
        </select>
      </label>
    );
  }
  return null;
}
