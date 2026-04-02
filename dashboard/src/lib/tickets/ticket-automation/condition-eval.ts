import type { AgentSnapshot, AutomationContext, ConditionRow, TicketSnapshot } from "./types";

function normStr(v: unknown): string {
  if (v == null) return "";
  return String(v).trim().toUpperCase().replace(/-/g, "_");
}

function arrFromJson(v: unknown): string[] {
  if (Array.isArray(v)) return v.map((x) => String(x).trim()).filter(Boolean);
  if (typeof v === "string") {
    return v
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [];
}

function ticketField(t: TicketSnapshot, field: string): unknown {
  switch (field) {
    case "status":
      return normStr(t.status);
    case "priority":
      return normStr(t.priority);
    case "group_id":
      return t.group_id;
    case "ticket_type":
      return normStr(t.ticket_type);
    case "ticket_category":
      return normStr(t.ticket_category);
    case "service_type":
      return normStr(t.service_type);
    case "raised_by_type":
      return normStr(t.raised_by_type);
    case "ticket_source":
      return normStr(t.ticket_source);
    case "assigned_to_agent_id":
      return t.assigned_to_agent_id;
    case "tags":
      return t.tags ?? [];
    case "subject":
      return (t.subject ?? "").toString();
    case "description":
      return (t.description ?? "").toString();
    case "ticket_title":
      return (t.ticket_title ?? "").toString();
    /** Subject + description + title (for keyword / Freshdesk-style “contains” routing). */
    case "subject_or_description":
    case "ticket_text":
      return `${(t.subject ?? "").toString()} ${(t.ticket_title ?? "").toString()} ${(t.description ?? "").toString()}`.trim();
    default:
      return undefined;
  }
}

function evalOp(left: unknown, op: string, rawValue: unknown): boolean {
  const o = op.toLowerCase().trim();
  if (o === "is_null") return left == null || left === "";
  if (o === "is_not_null") return left != null && left !== "";

  if (o === "eq") {
    if (typeof left === "number" && rawValue != null && !Number.isNaN(Number(rawValue))) {
      return left === Number(rawValue);
    }
    return normStr(left) === normStr(rawValue);
  }
  if (o === "ne") {
    if (typeof left === "number" && rawValue != null && !Number.isNaN(Number(rawValue))) {
      return left !== Number(rawValue);
    }
    return normStr(left) !== normStr(rawValue);
  }
  if (o === "in") {
    const list = arrFromJson(rawValue).map(normStr);
    return list.includes(normStr(left));
  }
  if (o === "not_in") {
    const list = arrFromJson(rawValue).map(normStr);
    return !list.includes(normStr(left));
  }
  if (o === "contains") {
    const needle = normStr(rawValue);
    if (!needle) return true;
    if (Array.isArray(left)) {
      const tags = (left as unknown[]).map((x) => normStr(x));
      return tags.includes(needle);
    }
    return normStr(left).includes(needle);
  }
  if (o === "not_contains") {
    const needle = normStr(rawValue);
    if (!needle) return true;
    if (Array.isArray(left)) {
      const tags = (left as unknown[]).map((x) => normStr(x));
      return !tags.includes(needle);
    }
    return !normStr(left).includes(needle);
  }
  if (o === "contains_text" || o === "icontains") {
    const hay = String(left ?? "").toLowerCase();
    const needle = String(rawValue ?? "").toLowerCase().trim();
    if (!needle) return true;
    return hay.includes(needle);
  }
  return false;
}

/** Evaluate a single condition row (ticket or agent context). */
export function evalSingleCondition(c: ConditionRow, ctx: AutomationContext): boolean {
  const field = c.field.trim().toLowerCase();
  if (ctx.kind === "agent") {
    const a: AgentSnapshot = ctx.agent;
    if (field === "agent_status" || field === "current_status") {
      return evalOp(normStr(a.current_status), c.operator, c.value);
    }
    if (field === "is_online" || field === "agent_is_online") {
      const want =
        c.value === true ||
        c.value === 1 ||
        normStr(c.value) === "TRUE" ||
        String(c.value).toLowerCase() === "true";
      const got = a.is_online === true;
      return got === want;
    }
    return false;
  }
  const t = ctx.ticket;
  if (field === "agent_status" || field === "is_online" || field === "agent_is_online") {
    return false;
  }
  const left = ticketField(t, field);
  if (left === undefined) return false;
  return evalOp(left, c.operator, c.value);
}

function normalizeCombine(raw: unknown): "and" | "or" {
  const s = String(raw ?? "and").trim().toLowerCase();
  return s === "or" ? "or" : "and";
}

/**
 * Left-associative: row 0 alone, then for i>=1 combine (acc op eval(i)).
 * Example: A and B or C === ((A and B) or C).
 */
export function evaluateConditions(conditions: ConditionRow[], ctx: AutomationContext): boolean {
  const sorted = [...conditions].sort((a, b) => a.sort_order - b.sort_order || a.id - b.id);
  if (sorted.length === 0) return true;

  let acc = evalSingleCondition(sorted[0], ctx);
  for (let i = 1; i < sorted.length; i++) {
    const c = sorted[i];
    const op = normalizeCombine(c.combine_with_previous);
    const next = evalSingleCondition(c, ctx);
    acc = op === "or" ? acc || next : acc && next;
  }
  return acc;
}
