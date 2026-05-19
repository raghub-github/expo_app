/** Labels for merchant food order accept / cancel attribution. */

export type MerchantOrderActionSource = "app" | "website" | "admin" | "api" | "system";

export type MerchantOrderActionMode = "auto" | "manual";

export function normalizeActionSource(raw: unknown): MerchantOrderActionSource {
  const s = String(raw ?? "website").trim().toLowerCase();
  if (s === "app" || s === "mobile" || s === "merchant_app") return "app";
  if (s === "admin" || s === "dashboard") return "admin";
  if (s === "api") return "api";
  if (s === "system" || s === "auto" || s === "schedule") return "system";
  return "website";
}

export function normalizeActionMode(raw: unknown): MerchantOrderActionMode {
  return String(raw ?? "manual").trim().toLowerCase() === "auto" ? "auto" : "manual";
}

export function buildAcceptedByLabel(
  source: MerchantOrderActionSource,
  mode: MerchantOrderActionMode
): string {
  if (source === "admin") return "Accepted by GatiMitra Team";
  if (source === "app") {
    return mode === "auto" ? "Accepted - Merchant App (Auto)" : "Accepted - Merchant App (Manual)";
  }
  if (source === "system") return "Accepted - System (Auto)";
  return mode === "auto"
    ? "Accepted - Merchant portal (Auto)"
    : "Accepted - Merchant portal (Manual)";
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
  if (source === "admin") return "Cancelled by GatiMitra Team";
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
