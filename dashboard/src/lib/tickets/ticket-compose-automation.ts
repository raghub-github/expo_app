/**
 * Optional per-browser overrides / legacy localStorage helpers for ticket reply composer.
 * Primary source of truth is GET /api/tickets/compose-automation (global defaults for all ticket users).
 */

export const TICKET_COMPOSE_SUPPORT_CC_FALLBACK = "support@gatimitra.com";

export type TicketComposeAutomation = {
  defaultTo: string;
  defaultCc: string;
  defaultBcc: string;
};

const STORAGE_KEY = "gatimitra:ticket-compose-automation-v1";

export const TICKET_COMPOSE_AUTOMATION_CHANGE_EVENT = "gatimitra:ticket-compose-automation-change";

function defaults(): TicketComposeAutomation {
  return {
    defaultTo: "",
    defaultCc: TICKET_COMPOSE_SUPPORT_CC_FALLBACK,
    defaultBcc: "",
  };
}

export function getTicketComposeAutomation(): TicketComposeAutomation {
  if (typeof window === "undefined") return defaults();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaults();
    const p = JSON.parse(raw) as Record<string, unknown>;
    const d = defaults();
    return {
      defaultTo: typeof p.defaultTo === "string" ? p.defaultTo : d.defaultTo,
      defaultCc: typeof p.defaultCc === "string" ? p.defaultCc : d.defaultCc,
      defaultBcc: typeof p.defaultBcc === "string" ? p.defaultBcc : d.defaultBcc,
    };
  } catch {
    return defaults();
  }
}

export function setTicketComposeAutomation(next: TicketComposeAutomation): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      defaultTo: next.defaultTo.trim(),
      defaultCc: next.defaultCc.trim(),
      defaultBcc: next.defaultBcc.trim(),
    }),
  );
  window.dispatchEvent(new CustomEvent(TICKET_COMPOSE_AUTOMATION_CHANGE_EVENT));
}

/** Ensure fallback support address appears in a comma-separated CC line (client + server alignment). */
export function mergeCcWithSupportFallback(rawCc: string, supportEmail: string = TICKET_COMPOSE_SUPPORT_CC_FALLBACK): string {
  const parts = rawCc.split(",").map((x) => x.trim()).filter(Boolean);
  const lower = new Set(parts.map((p) => p.toLowerCase()));
  if (!lower.has(supportEmail.toLowerCase())) parts.push(supportEmail);
  return parts.join(", ");
}
