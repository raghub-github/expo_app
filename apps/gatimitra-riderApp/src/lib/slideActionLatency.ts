/**
 * Shared slide-to-action latency (T0–T9). Dev-only; no PII beyond action + order id.
 * Accept-order keeps acceptOrderLatency.ts (T0–T12).
 */

export type SlideActionMark =
  | "T0_THRESHOLD"
  | "T1_HANDLER"
  | "T2_REQUEST_CREATED"
  | "T3_REQUEST_SENT"
  | "T6_RESPONSE"
  | "T7_UI_SUCCESS"
  | "T8_NAVIGATION";

const marks = new Map<SlideActionMark, number>();
let action = "";
let orderId: string | null = null;
let t0 = 0;

export function beginSlideAction(nextAction: string, nextOrderId?: string): number {
  marks.clear();
  action = nextAction;
  orderId = nextOrderId ?? null;
  t0 = Date.now();
  marks.set("T0_THRESHOLD", t0);
  return t0;
}

export function getSlideActionT0(): number {
  return t0;
}

export function getSlideActionName(): string {
  return action;
}

export function markSlideAction(name: SlideActionMark): number {
  const now = Date.now();
  if (!marks.has(name)) marks.set(name, now);
  return now;
}

export function logSlideActionLatency(extra?: Record<string, unknown>): void {
  if (!__DEV__) return;
  const t = (k: SlideActionMark) => marks.get(k) ?? null;
  const delta = (a: SlideActionMark, b: SlideActionMark) => {
    const av = marks.get(a);
    const bv = marks.get(b);
    return av != null && bv != null ? bv - av : null;
  };
  console.log("[RiderSlideLatency]", {
    action,
    orderId,
    T0_THRESHOLD: t("T0_THRESHOLD"),
    T1_HANDLER: t("T1_HANDLER"),
    T2_REQUEST_CREATED: t("T2_REQUEST_CREATED"),
    T3_REQUEST_SENT: t("T3_REQUEST_SENT"),
    T6_RESPONSE: t("T6_RESPONSE"),
    T7_UI_SUCCESS: t("T7_UI_SUCCESS"),
    T8_NAVIGATION: t("T8_NAVIGATION"),
    "T1-T0_handler": delta("T0_THRESHOLD", "T1_HANDLER"),
    "T2-T1_mutation": delta("T1_HANDLER", "T2_REQUEST_CREATED"),
    "T3-T2_before_fetch": delta("T2_REQUEST_CREATED", "T3_REQUEST_SENT"),
    "T6-T3_network_plus_server": delta("T3_REQUEST_SENT", "T6_RESPONSE"),
    "T7-T6_ui": delta("T6_RESPONSE", "T7_UI_SUCCESS"),
    "T8-T7_nav": delta("T7_UI_SUCCESS", "T8_NAVIGATION"),
    "T7-T0_total_to_ui": delta("T0_THRESHOLD", "T7_UI_SUCCESS"),
    ...extra,
  });
}
