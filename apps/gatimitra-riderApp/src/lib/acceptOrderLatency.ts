/**
 * Accept-order latency trace (T0–T12). Dev-only; no PII beyond order id.
 * Marks are ms since process origin (Date.now).
 */

export type AcceptLatencyMark =
  | "T0_SLIDE_COMPLETE"
  | "T1_HANDLER"
  | "T2_REQUEST_CREATED"
  | "T3_REQUEST_SENT"
  | "T8_RESPONSE_RECEIVED"
  | "T9_SUCCESS_STATE"
  | "T10_MODAL_CLOSE"
  | "T11_NAVIGATION_START"
  | "T12_ACCEPTED_SCREEN";

const marks = new Map<AcceptLatencyMark, number>();
let orderId: string | null = null;
let t0 = 0;

export function beginAcceptLatency(nextOrderId: string): number {
  marks.clear();
  orderId = nextOrderId;
  t0 = Date.now();
  marks.set("T0_SLIDE_COMPLETE", t0);
  return t0;
}

export function setAcceptLatencyOrderId(nextOrderId: string): void {
  orderId = nextOrderId;
}

export function getAcceptLatencyT0(): number {
  return t0;
}

export function markAcceptScreenVisible(): void {
  if (!t0 || Date.now() - t0 > 15_000) return;
  if (marks.has("T12_ACCEPTED_SCREEN")) return;
  markAcceptLatency("T12_ACCEPTED_SCREEN");
  logAcceptLatency();
}

export function markAcceptLatency(name: AcceptLatencyMark): number {
  const now = Date.now();
  if (!marks.has(name)) marks.set(name, now);
  return now;
}

export function logAcceptLatency(extra?: Record<string, unknown>): void {
  if (!__DEV__) return;
  const t = (k: AcceptLatencyMark) => marks.get(k) ?? null;
  const delta = (a: AcceptLatencyMark, b: AcceptLatencyMark) => {
    const av = marks.get(a);
    const bv = marks.get(b);
    return av != null && bv != null ? bv - av : null;
  };
  console.log("[RiderAcceptLatency]", {
    orderId,
    T0_SLIDE_COMPLETE: t("T0_SLIDE_COMPLETE"),
    T1_HANDLER: t("T1_HANDLER"),
    T2_REQUEST_CREATED: t("T2_REQUEST_CREATED"),
    T3_REQUEST_SENT: t("T3_REQUEST_SENT"),
    T8_RESPONSE_RECEIVED: t("T8_RESPONSE_RECEIVED"),
    T9_SUCCESS_STATE: t("T9_SUCCESS_STATE"),
    T10_MODAL_CLOSE: t("T10_MODAL_CLOSE"),
    T11_NAVIGATION_START: t("T11_NAVIGATION_START"),
    T12_ACCEPTED_SCREEN: t("T12_ACCEPTED_SCREEN"),
    "T1-T0_handler": delta("T0_SLIDE_COMPLETE", "T1_HANDLER"),
    "T2-T1_mutation": delta("T1_HANDLER", "T2_REQUEST_CREATED"),
    "T3-T2_before_fetch": delta("T2_REQUEST_CREATED", "T3_REQUEST_SENT"),
    "T8-T3_network_plus_server": delta("T3_REQUEST_SENT", "T8_RESPONSE_RECEIVED"),
    "T9-T8_cache": delta("T8_RESPONSE_RECEIVED", "T9_SUCCESS_STATE"),
    "T10-T9_modal": delta("T9_SUCCESS_STATE", "T10_MODAL_CLOSE"),
    "T11-T10_nav": delta("T10_MODAL_CLOSE", "T11_NAVIGATION_START"),
    "T12-T11_screen": delta("T11_NAVIGATION_START", "T12_ACCEPTED_SCREEN"),
    "T11-T0_total_to_nav": delta("T0_SLIDE_COMPLETE", "T11_NAVIGATION_START"),
    "T12-T0_total": delta("T0_SLIDE_COMPLETE", "T12_ACCEPTED_SCREEN"),
    ...extra,
  });
}
