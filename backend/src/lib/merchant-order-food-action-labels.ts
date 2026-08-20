/** Labels for merchant food order accept / cancel attribution. */

export type MerchantOrderActionSource = "app" | "website" | "admin" | "api" | "system";

export type MerchantOrderActionMode = "auto" | "manual";

export function normalizeActionSource(raw: unknown): MerchantOrderActionSource {
  const s = String(raw ?? "website").trim().toLowerCase();
  if (s === "app" || s === "mobile" || s === "merchant_app") return "app";
  if (
    s === "admin" ||
    s === "dashboard" ||
    s === "dash-mx-port" ||
    s === "dash_mx_port" ||
    s === "dash-mx-portal"
  ) {
    return "admin";
  }
  if (s === "api") return "api";
  if (s === "system" || s === "auto" || s === "schedule") return "system";
  return "website";
}

export const ORDER_ACCEPTANCE_SOURCE = {
  DASH_MX_PORT: "DASH-MX-PORT",
  PARTNERSITE: "PARTNERSITE",
  MX_APP: "MX-APP",
} as const;

export type OrderAcceptanceSource =
  (typeof ORDER_ACCEPTANCE_SOURCE)[keyof typeof ORDER_ACCEPTANCE_SOURCE];

export function orderAcceptanceSourceFromAction(
  source: MerchantOrderActionSource
): OrderAcceptanceSource | null {
  if (source === "app") return ORDER_ACCEPTANCE_SOURCE.MX_APP;
  if (source === "admin") return ORDER_ACCEPTANCE_SOURCE.DASH_MX_PORT;
  if (source === "website") return ORDER_ACCEPTANCE_SOURCE.PARTNERSITE;
  return null;
}

export function normalizeOrderAcceptanceSource(raw: unknown): OrderAcceptanceSource | null {
  const s = String(raw ?? "")
    .trim()
    .toUpperCase()
    .replace(/[\s_]+/g, "-");
  if (
    s === "DASH-MX-PORT" ||
    s === "DASH-MX-PORTAL" ||
    s === "ADMIN" ||
    s === "DASHBOARD" ||
    s === "ADMIN-DASHBOARD"
  ) {
    return ORDER_ACCEPTANCE_SOURCE.DASH_MX_PORT;
  }
  if (s === "PARTNERSITE" || s === "PARTNER-SITE" || s === "WEBSITE" || s === "PORTAL") {
    return ORDER_ACCEPTANCE_SOURCE.PARTNERSITE;
  }
  if (s === "MX-APP" || s === "APP" || s === "MERCHANT-APP" || s === "MERCHANTAPP") {
    return ORDER_ACCEPTANCE_SOURCE.MX_APP;
  }
  return null;
}

export function normalizeActionMode(raw: unknown): MerchantOrderActionMode {
  return String(raw ?? "manual").trim().toLowerCase() === "auto" ? "auto" : "manual";
}

export function buildAcceptedByLabel(
  source: MerchantOrderActionSource,
  mode: MerchantOrderActionMode
): string {
  if (source === "admin") return "Accepted by GatiMitra Team";
  if (mode === "auto") return "Auto accepted";
  if (source === "app") return "Accepted - Merchant App (Manual)";
  if (source === "system") return "Auto accepted";
  return "Accepted - Merchant portal (Manual)";
}

/** Timeline node title for order_timelines.status */
export function buildAcceptanceTimelineStatus(mode: MerchantOrderActionMode): string {
  return mode === "auto" ? "Auto Accepted" : "Accepted";
}

export function buildCancelledByLabel(
  source: MerchantOrderActionSource,
  mode: MerchantOrderActionMode,
  rejectedReason?: string | null
): string {
  const r = (rejectedReason ?? "").trim();
  if (/^auto cancelled/i.test(r) || (source === "system" && mode === "auto")) {
    return "Auto Cancelled";
  }
  if (source === "admin") return "Rejected by GatiMitra Team";
  if (source === "app") {
    return mode === "auto" ? "Cancelled - Merchant App (Auto)" : "Cancelled - Merchant App (Manual)";
  }
  if (source === "system") return "Auto Cancelled";
  return mode === "auto"
    ? "Cancelled - Merchant portal (Auto)"
    : "Cancelled - Merchant portal (Manual)";
}

export function labelsForStatusUpdate(args: {
  newStatus: string;
  actionSource: MerchantOrderActionSource;
  actionMode: MerchantOrderActionMode;
  rejectedReason?: string | null;
}): {
  accepted_by_label?: string;
  cancelled_by_label?: string;
  actor_label: string | null;
} {
  const st = String(args.newStatus || "").toUpperCase();
  if (st === "ACCEPTED") {
    const actor_label = buildAcceptedByLabel(args.actionSource, args.actionMode);
    return { accepted_by_label: actor_label, actor_label };
  }
  if (st === "CANCELLED") {
    const actor_label = buildCancelledByLabel(args.actionSource, args.actionMode, args.rejectedReason);
    return { cancelled_by_label: actor_label, actor_label };
  }
  return { actor_label: null };
}
