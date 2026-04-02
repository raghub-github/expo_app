/** Display labels and summaries for workflow automation UI (Freshdesk-style). */

export const TRIGGER_TABS = [
  {
    id: "ticket_created" as const,
    label: "When a new ticket is created",
    shortLabel: "New ticket",
    tabHint: "Runs once when a ticket row is created.",
  },
  {
    id: "ticket_updated" as const,
    label: "When a ticket is updated",
    shortLabel: "Ticket updates",
    tabHint: "Runs after saves to the ticket (fields, assignment, status, and similar).",
  },
  {
    id: "ticket_reopened" as const,
    label: "When a ticket is reopened",
    shortLabel: "Ticket reopened",
    tabHint: "Runs when a ticket returns to open work from resolved or closed (same save as the reopen).",
  },
  {
    id: "agent_went_online" as const,
    label: "When an agent comes online",
    shortLabel: "Agent online",
    tabHint: "Runs when an agent switches to Online (not for break or busy).",
  },
  {
    id: "agent_went_offline" as const,
    label: "When an agent goes fully offline",
    shortLabel: "Agent offline",
    tabHint:
      "Two layers: (1) built-in release of open tickets when someone goes fully Offline — see the card below and Queue settings; (2) optional workflow rules here (IF/THEN) that run on the same event. Break and busy never trigger this.",
  },
];

const TRIGGER_IDS = new Set(TRIGGER_TABS.map((t) => t.id));

/**
 * Normalize DB/API trigger strings so rules land in the correct tab (legacy aliases, casing).
 */
export function canonicalAutomationTriggerId(raw: string): (typeof TRIGGER_TABS)[number]["id"] {
  const t = raw
    .trim()
    .toLowerCase()
    .replace(/-/g, "_")
    .replace(/\s+/g, "_");

  const synonyms: Record<string, (typeof TRIGGER_TABS)[number]["id"]> = {
    ticket_created: "ticket_created",
    new_ticket: "ticket_created",
    create_ticket: "ticket_created",
    ticket_updated: "ticket_updated",
    ticket_update: "ticket_updated",
    updated: "ticket_updated",
    agent_went_online: "agent_went_online",
    agent_online: "agent_went_online",
    went_online: "agent_went_online",
    agent_went_offline: "agent_went_offline",
    agent_offline: "agent_went_offline",
    went_offline: "agent_went_offline",
    offline: "agent_went_offline",
    ticket_reopened: "ticket_reopened",
    reopened: "ticket_reopened",
    ticket_reopen: "ticket_reopened",
  };

  if (synonyms[t]) return synonyms[t];
  if (TRIGGER_IDS.has(t as (typeof TRIGGER_TABS)[number]["id"])) {
    return t as (typeof TRIGGER_TABS)[number]["id"];
  }
  return "ticket_updated";
}

export const FIELD_LABELS: Record<string, string> = {
  status: "Status",
  priority: "Priority",
  group_id: "Group (queue) ID",
  ticket_type: "Ticket type",
  ticket_category: "Category",
  service_type: "Service type",
  raised_by_type: "Raised by (who reported)",
  ticket_source: "Channel / source",
  assigned_to_agent_id: "Assignee (user ID)",
  tags: "Tags",
  subject: "Subject line",
  description: "Description / first message body",
  ticket_title: "Ticket title (template code)",
  subject_or_description: "Subject + title + description (keywords)",
  ticket_text: "Subject + title + description (keywords)",
  agent_status: "Agent ticket status",
  is_online: "Agent is online",
};

/** Field order in the rule editor condition dropdown (routing-first). */
export const WORKFLOW_CONDITION_FIELD_KEYS: string[] = [
  "service_type",
  "ticket_type",
  "ticket_category",
  "ticket_source",
  "raised_by_type",
  "subject",
  "subject_or_description",
  "description",
  "ticket_title",
  "tags",
  "group_id",
  "status",
  "priority",
  "assigned_to_agent_id",
  "agent_status",
  "is_online",
];

export const OPERATOR_LABELS: Record<string, string> = {
  eq: "Equals",
  ne: "Does not equal",
  in: "Is one of (comma-separated)",
  not_in: "Is not one of",
  contains: "Contains (exact, case-sensitive)",
  not_contains: "Does not contain",
  icontains: "Text contains (ignores capital letters)",
  is_null: "Is empty",
  is_not_null: "Has a value",
};

/** Stable rule_code from a display name: lowercase_snake, ASCII, max length. */
export function slugifyRuleCode(name: string, maxLen = 80): string {
  const base = name
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_+/g, "_");
  if (!base) return "";
  const clipped = base.slice(0, maxLen).replace(/_+$/g, "");
  return clipped || "";
}

export const ACTION_LABELS: Record<string, string> = {
  assign_to_agent: "Assign to agent",
  assign_least_loaded: "Auto-assign within queue (least busy)",
  assign_round_robin: "Auto-assign within queue (round robin)",
  assign_priority_weighted: "Auto-assign within queue (priority weighted)",
  set_status: "Change status",
  set_priority: "Change priority",
  add_tags: "Add tags",
  set_group: "Move to group/queue",
  send_notification: "Send notification",
  run_queue_balance_for_agent: "Rebalance queues for agent (their groups)",
  run_queue_balance_for_group: "Rebalance / auto-assign within one group",
};

/** Primary order in the rule editor action dropdown; extra keys from ACTION_LABELS are appended for legacy rules. */
export const WORKFLOW_ACTION_EDITOR_ORDER = [
  "set_group",
  "assign_least_loaded",
  "assign_round_robin",
  "assign_priority_weighted",
  "assign_to_agent",
  "run_queue_balance_for_group",
  "run_queue_balance_for_agent",
  "set_status",
  "set_priority",
  "add_tags",
  "send_notification",
] as const;

export function workflowActionEditorKeys(): string[] {
  const ordered = new Set<string>(WORKFLOW_ACTION_EDITOR_ORDER);
  const extras = Object.keys(ACTION_LABELS).filter((k) => !ordered.has(k));
  return [...WORKFLOW_ACTION_EDITOR_ORDER, ...extras];
}

export type ConditionPreview = {
  field: string;
  operator: string;
  value: unknown;
  combine_with_previous?: string | null;
};

function formatValue(v: unknown): string {
  if (v == null) return "—";
  if (Array.isArray(v)) return v.map((x) => String(x)).join(", ");
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

/** One readable fragment, e.g. "Subject contains magicorder". */
export function formatConditionClause(c: ConditionPreview): string {
  const field = FIELD_LABELS[c.field] ?? c.field;
  const op = OPERATOR_LABELS[c.operator] ?? c.operator;
  const val = formatValue(c.value);
  if (c.operator === "is_null" || c.operator === "is_not_null") {
    return `${field} ${op}`;
  }
  return `${field} ${op} ${val}`;
}

function isOrCombine(c: ConditionPreview): boolean {
  return String(c.combine_with_previous ?? "and").trim().toLowerCase() === "or";
}

function actionJoinerFromCombine(a: ActionPreview, idx: number): string {
  if (idx === 0) return "";
  const j = String(a.combine_with_previous ?? a.combineWithPrevious ?? "and").trim().toLowerCase();
  if (j === "or") return " else ";
  if (j === "if" || j === "iff") return " if prev ok → ";
  return " → ";
}

/** Card summary: action chain with AND (→), OR (else), IF (if prev ok →) between rows. */
export type ActionPreview = {
  action_type?: string;
  actionType?: string;
  payload?: unknown;
  combine_with_previous?: string;
  combineWithPrevious?: string;
};

/** Short list of action types for rule cards. */
export function buildActionsSummary(actions: ActionPreview[] | null | undefined, maxParts = 5): string {
  if (!actions || actions.length === 0) return "No actions";
  const parts: string[] = [];
  const n = Math.min(actions.length, maxParts);
  for (let i = 0; i < n; i++) {
    const a = actions[i];
    const t = String(a.action_type ?? a.actionType ?? "").trim();
    const label = (ACTION_LABELS[t] ?? t) || "Action";
    if (i > 0) parts.push(actionJoinerFromCombine(a, i));
    parts.push(label);
  }
  const more = actions.length > maxParts ? ` +${actions.length - maxParts}` : "";
  return parts.join("") + more;
}

export function buildConditionsSummary(conditions: ConditionPreview[] | null | undefined, maxParts = 4): string {
  if (!conditions || conditions.length === 0) {
    return "No conditions (always matches when trigger fires)";
  }
  const out: string[] = [];
  for (let i = 0; i < Math.min(conditions.length, maxParts); i++) {
    const c = conditions[i];
    const clause = formatConditionClause(c);
    if (i === 0) {
      out.push(clause);
    } else {
      const joiner = isOrCombine(c) ? "Or if" : "And if";
      out.push(`${joiner} ${clause}`);
    }
  }
  const more = conditions.length > maxParts ? ` … +${conditions.length - maxParts} more` : "";
  return out.join(" ") + more;
}

export function relativeTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "—";
  const diff = Date.now() - t;
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return "just now";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 48) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day}d ago`;
  return new Date(iso).toLocaleDateString();
}

export const STATUS_OPTIONS = [
  "OPEN",
  "IN_PROGRESS",
  "PENDING",
  "WAITING_FOR_USER",
  "WAITING_FOR_MERCHANT",
  "WAITING_FOR_RIDER",
  "ESCALATED",
  "RESOLVED",
  "CLOSED",
  "REJECTED",
  "REOPENED",
  "CANCELLED",
  "PROVISIONALLY_RESOLVED",
];

export const PRIORITY_OPTIONS = ["LOW", "MEDIUM", "HIGH", "URGENT", "CRITICAL"];

export function triggerTabLabel(triggerId: string): string {
  const t = TRIGGER_TABS.find((x) => x.id === triggerId);
  return t?.shortLabel ?? t?.label ?? triggerId;
}
