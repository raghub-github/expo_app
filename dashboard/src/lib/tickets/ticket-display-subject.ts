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

/** Remove slash separators from ticket titles/subjects shown in dashboard UI. */
export function sanitizeTicketDisplayText(text: string): string {
  return String(text ?? "")
    .replace(/\s*\/\s*/g, " · ")
    .replace(/\s·\s·+/g, " · ")
    .replace(/^[-–—:·\s/]+/, "")
    .replace(/\s+/g, " ")
    .trim();
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

/**
 * List / grid subject line.
 * When the ticket is linked to an order, prefix `Order #GMF… — ` unless the
 * subject already contains that order id (avoids "Order #X — Order #X — …").
 */
export function formatTicketDisplaySubject(ticket: TicketSubjectInput): string {
  const subjectRaw = (ticket.subject ?? "").trim() || "No subject";
  const subject = sanitizeTicketDisplayText(
    subjectRaw.length > 0 ? `${subjectRaw.charAt(0).toUpperCase()}${subjectRaw.slice(1)}` : subjectRaw
  );

  const orderId = resolveFormattedOrderId(ticket);
  if (!orderId) return subject;

  // Already present in subject (e.g. "Order #GMF100053 — Where is my refund?")
  if (subject.toUpperCase().includes(orderId)) return subject;

  return sanitizeTicketDisplayText(`Order #${orderId} — ${subject}`);
}
