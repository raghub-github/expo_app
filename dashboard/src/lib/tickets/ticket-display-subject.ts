type TicketSubjectInput = {
  subject: string;
  formattedOrderId?: string | null;
  orderId?: number | null;
  orderServiceType?: string | null;
  serviceType?: string | null;
};

const ORDER_ID_IN_TEXT =
  /\b(GMF|GMR|GMP|GMI)\d{4,}\b/i;

function normalizeOrderIdToken(raw: string): string {
  return raw.trim().replace(/^#/, "").toUpperCase();
}

function fallbackFormattedOrderId(ticket: TicketSubjectInput): string | null {
  if (ticket.orderId == null || !Number.isFinite(ticket.orderId)) return null;
  const service = String(ticket.orderServiceType ?? ticket.serviceType ?? "food").toLowerCase();
  const prefix =
    service === "person_ride" || service === "ride"
      ? "GMR"
      : service === "parcel"
        ? "GMP"
        : "GMF";
  return `${prefix}${String(ticket.orderId).padStart(6, "0")}`;
}

export function resolveFormattedOrderId(ticket: TicketSubjectInput): string | null {
  const fromApi = ticket.formattedOrderId?.trim();
  if (fromApi) return normalizeOrderIdToken(fromApi);

  const subject = (ticket.subject ?? "").trim();
  const fromSubject = subject.match(ORDER_ID_IN_TEXT)?.[0];
  if (fromSubject) return normalizeOrderIdToken(fromSubject);

  return fallbackFormattedOrderId(ticket);
}

function stripOrderBoilerplate(text: string): string {
  return text
    .replace(/^Order related issues\s*[-–—:]\s*/i, "")
    .replace(/^Order\s+#?[A-Za-z0-9]+\s*[-–—:]\s*/i, "")
    .replace(/\bOrder\s+#?[A-Za-z0-9]+\b/gi, "")
    .trim();
}

export function formatTicketDisplaySubject(ticket: TicketSubjectInput): string {
  const subject = (ticket.subject ?? "").trim() || "No subject";
  const formattedId = resolveFormattedOrderId(ticket);
  if (!formattedId) return subject;

  const escaped = formattedId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const standard = subject.match(
    new RegExp(`^Order\\s+#${escaped}\\s*[—–-]\\s*(.+)$`, "i"),
  );
  if (standard?.[1]?.trim()) {
    return `Order #${formattedId} — ${standard[1].trim()}`;
  }

  let tail = stripOrderBoilerplate(subject);
  tail = tail.replace(new RegExp(`\\b#?${escaped}\\b`, "gi"), "").trim();
  tail = tail.replace(/^[-–—:\s]+/, "").trim();
  if (!tail) tail = "Order issue";

  return `Order #${formattedId} — ${tail}`;
}
