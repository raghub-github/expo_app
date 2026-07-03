/**
 * Merchant-facing cancellation actor labels for ledger and order UI.
 * Keep behaviour aligned with backend merchant-cancellation-ledger-brand.
 */

export type MerchantCancellationActor =
  | { kind: "auto" }
  | { kind: "actor"; label: string };

const GATIMITRA_ADMIN_LABEL = "GatiMitra";
const CUSTOMER_LABEL = "customer";
const STORE_LABEL = "store";

function norm(value: string | null | undefined): string {
  return String(value ?? "").trim().toLowerCase();
}

export function resolveMerchantCancellationActor(
  cancelledByType?: string | null,
  cancelledByLabel?: string | null,
  triggerSource?: string | null,
  rejectedReason?: string | null,
): MerchantCancellationActor {
  const type = norm(cancelledByType);
  const label = norm(cancelledByLabel);
  const source = norm(triggerSource);
  const reason = norm(rejectedReason);

  if (
    type === "system" ||
    source === "system" ||
    /auto cancel/i.test(label) ||
    /^auto cancel/i.test(reason)
  ) {
    return { kind: "auto" };
  }

  if (
    type === "customer" ||
    label.includes("customer") ||
    label.includes("cancelled by me")
  ) {
    return { kind: "actor", label: CUSTOMER_LABEL };
  }

  if (
    type === "store" ||
    type === "merchant" ||
    source === "merchant_cancel" ||
    source === "partner_cancel" ||
    source === "website" ||
    source === "app" ||
    /merchant (app|portal)/i.test(label) ||
    /cancelled - merchant/i.test(label) ||
    label.includes("restaurant") ||
    label.includes("store itself") ||
    label.includes("cancelled by store")
  ) {
    return { kind: "actor", label: STORE_LABEL };
  }

  if (
    type === "admin" ||
    source === "admin_cancel" ||
    source.includes("dashboard") ||
    label.includes("gatimitra team") ||
    label.includes("gatimitra")
  ) {
    return { kind: "actor", label: GATIMITRA_ADMIN_LABEL };
  }

  if (source.includes("merchant") || source.includes("partner")) {
    return { kind: "actor", label: STORE_LABEL };
  }

  if (label) {
    return { kind: "actor", label: cancelledByLabel!.trim() };
  }

  return { kind: "actor", label: GATIMITRA_ADMIN_LABEL };
}

export function merchantCancellationHeadline(
  actor: MerchantCancellationActor,
  reason?: string | null,
): string {
  const detail = String(reason ?? "").trim();
  if (actor.kind === "auto") {
    const stripped = detail.replace(/^auto cancelled?:?\s*/i, "").trim();
    return stripped ? `Auto Canceled: ${stripped}` : "Auto Canceled";
  }
  if (!detail) return `Cancelled by ${actor.label}`;
  return `Cancelled by ${actor.label}: ${detail}`;
}

export function applyMerchantCancellationActorToText(
  text: string,
  actor: MerchantCancellationActor,
  reason?: string | null,
): string {
  const trimmed = text.trim();
  if (!trimmed) return merchantCancellationHeadline(actor, reason);

  const policyMatch = /\.\s*(As per policy,.+)$/i.exec(trimmed);
  const policySentence = policyMatch?.[1]?.trim() ?? null;
  const body = policyMatch ? trimmed.slice(0, policyMatch.index).trim() : trimmed;

  let reasonFromBody = reason?.trim() || null;
  if (!reasonFromBody) {
    const colonMatch = /^Cancelled by [^:—·\n.]+:\s*(.+)$/i.exec(body);
    if (colonMatch?.[1]) reasonFromBody = colonMatch[1].trim();
    const autoMatch = /^Auto Canceled:?\s*(.+)$/i.exec(body);
    if (autoMatch?.[1]) reasonFromBody = autoMatch[1].trim();
  }

  const headline = merchantCancellationHeadline(actor, reasonFromBody);
  return policySentence ? `${headline}. ${policySentence}` : headline;
}

export function merchantCancellationBrandPrefix(
  actor: MerchantCancellationActor,
): string | null {
  if (actor.kind === "auto") return "Auto Canceled";
  return `Cancelled by ${actor.label}`;
}
