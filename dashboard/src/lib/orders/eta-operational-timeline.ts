/**
 * Collapse noisy ETA history into an operational timeline for admins / customers.
 * Raw rows stay available for Advanced / developer view.
 */

export type EtaHistoryRawEntry = {
  id: number;
  etaVersion: number;
  at: string;
  reason: string;
  label: string;
  detail: string | null;
  stage: string | null;
  displayEta: number | null;
  totalEta: number | null;
  oldEtaMinutes: number | null;
  newEtaMinutes: number | null;
  deltaMinutes: number | null;
  confidence: string | null;
  freezeCountdown: boolean;
  etaSource: string | null;
  orderStatus: string | null;
  riderId?: number | null;
};

export type OpsEtaCard = {
  key: string;
  title: string;
  at: string;
  atEnd: string | null;
  summary: string;
  etaBefore: number | null;
  etaAfter: number | null;
  stage: string | null;
  stageLabel: string | null;
  reasonLabel: string;
  confidence: string | null;
  orderStatus: string | null;
  /** How many raw rows were folded into this card. */
  groupedCount: number;
  /** Optional countdown trail like "10 → 9 → 8 → 7". */
  etaTrail: string | null;
  /** Raw ids for Advanced expansion. */
  rawIds: number[];
  isGrouped: boolean;
};

const MAJOR_REASONS = new Set([
  "ORDER_PLACED",
  "RIDER_ASSIGNED",
  "RIDER_PICKED_UP",
  "MERCHANT_DELAY",
  "TRAFFIC_UPDATE",
  "WEATHER_UPDATE",
  "BATCHING_CHANGE",
  "MANUAL_OVERRIDE",
  "INITIAL_ESTIMATE",
]);

const STAGE_LABELS: Record<string, string> = {
  MERCHANT_ACCEPTED: "Merchant accepted",
  MERCHANT_PREP: "Merchant is preparing the order",
  READY_AWAITING_RIDER: "Order ready — waiting for rider",
  RIDER_TO_MERCHANT: "Rider heading to the restaurant",
  AT_STORE: "Rider reached the restaurant",
  CUSTOMER_DELIVERY: "Order on the way",
  ARRIVING: "Rider nearby",
  DELIVERED: "Delivered",
};

function isMajor(e: EtaHistoryRawEntry): boolean {
  const r = String(e.reason ?? "").toUpperCase();
  return MAJOR_REASONS.has(r);
}

function isLiveNoise(e: EtaHistoryRawEntry): boolean {
  const r = String(e.reason ?? "").toUpperCase();
  const src = String(e.etaSource ?? "").toUpperCase();
  // Lifecycle reasons are never "noise" even if etaSource says LIVE_TICK.
  if (MAJOR_REASONS.has(r)) return false;
  if (r === "LIVE_TICK" || src === "LIVE_TICK") return true;
  if (r === "STATUS_CHANGE" || src === "STATUS_CHANGE") return true;
  return false;
}

function titleFor(e: EtaHistoryRawEntry): string {
  if (e.stage && STAGE_LABELS[e.stage]) return STAGE_LABELS[e.stage];
  return e.label || "Estimate updated";
}

function reasonLabelFor(e: EtaHistoryRawEntry): string {
  const r = String(e.reason ?? "").toUpperCase();
  switch (r) {
    case "ORDER_PLACED":
      return "Order placed";
    case "RIDER_ASSIGNED":
      return "Rider assigned";
    case "RIDER_PICKED_UP":
      return "Order picked up";
    case "MERCHANT_DELAY":
      return "Kitchen needs more time";
    case "TRAFFIC_UPDATE":
      return "Traffic update";
    case "WEATHER_UPDATE":
      return "Weather update";
    case "MANUAL_OVERRIDE":
      return "Manually updated";
    case "BATCHING_CHANGE":
      return "Delivery batching update";
    case "LIVE_TICK":
      return "Live progress";
    case "STATUS_CHANGE":
      return "Status update";
    default:
      return e.label || "Estimate update";
  }
}

function etaPhrase(before: number | null, after: number | null): string | null {
  if (before != null && after != null && Math.round(before) !== Math.round(after)) {
    const o = Math.round(before);
    const n = Math.round(after);
    return n < o
      ? `ETA improved from ${o} min to ${n} min`
      : `ETA updated from ${o} min to ${n} min`;
  }
  if (after != null) {
    return after <= 0 ? "Arriving now" : `About ${Math.round(after)} min remaining`;
  }
  return null;
}

function buildTrail(minutes: number[]): string | null {
  const uniq: number[] = [];
  for (const m of minutes) {
    const r = Math.round(m);
    if (!Number.isFinite(r)) continue;
    if (uniq.length === 0 || uniq[uniq.length - 1] !== r) uniq.push(r);
  }
  if (uniq.length < 2) return null;
  // Cap trail length for readability.
  const shown =
    uniq.length <= 6
      ? uniq
      : [...uniq.slice(0, 2), ...uniq.slice(-3)];
  if (uniq.length > 6) {
    return `${shown.slice(0, 2).join(" → ")} → … → ${shown.slice(-3).join(" → ")}`;
  }
  return shown.join(" → ");
}

/**
 * Chronological asc input preferred; returns cards newest-first for admin sheets.
 */
export function toOperationalEtaCards(
  entries: EtaHistoryRawEntry[],
  opts?: { order?: "asc" | "desc" }
): OpsEtaCard[] {
  if (!entries.length) return [];
  const asc = [...entries].sort((a, b) => a.id - b.id);
  const cards: OpsEtaCard[] = [];

  let i = 0;
  while (i < asc.length) {
    const e = asc[i]!;
    const major = isMajor(e) && !isLiveNoise(e);

    if (major || !isLiveNoise(e)) {
      const before = e.oldEtaMinutes;
      const after = e.newEtaMinutes ?? e.displayEta;
      const etaLine = etaPhrase(before, after);
      const summaryParts = [
        etaLine,
        e.reason === "MERCHANT_DELAY"
          ? "Restaurant needs a bit more prep time"
          : e.detail && !etaLine
            ? e.detail
            : null,
        !etaLine && !e.detail
          ? "Updated based on order progress"
          : null,
      ].filter(Boolean) as string[];

      cards.push({
        key: `evt-${e.id}`,
        title: titleFor(e),
        at: e.at,
        atEnd: null,
        summary: summaryParts.join(". ") || "Estimate updated",
        etaBefore: before,
        etaAfter: after,
        stage: e.stage,
        stageLabel: e.stage ? STAGE_LABELS[e.stage] ?? e.stage : null,
        reasonLabel: reasonLabelFor(e),
        confidence: e.confidence,
        orderStatus: e.orderStatus,
        groupedCount: 1,
        etaTrail: null,
        rawIds: [e.id],
        isGrouped: false,
      });
      i += 1;
      continue;
    }

    // Group consecutive live-noise rows that share the same stage (or both lack stage).
    const group: EtaHistoryRawEntry[] = [e];
    const stageKey = e.stage ?? "";
    let j = i + 1;
    while (j < asc.length) {
      const n = asc[j]!;
      if (!isLiveNoise(n)) break;
      if ((n.stage ?? "") !== stageKey) break;
      group.push(n);
      j += 1;
    }

    const first = group[0]!;
    const last = group[group.length - 1]!;
    const mins = group
      .map((g) => g.displayEta ?? g.newEtaMinutes)
      .filter((m): m is number => m != null && Number.isFinite(m));
    const before =
      first.oldEtaMinutes ??
      (mins.length > 0 ? mins[0]! : null);
    const after =
      last.displayEta ??
      last.newEtaMinutes ??
      (mins.length > 0 ? mins[mins.length - 1]! : null);
    const trail = buildTrail(mins);
    const etaLine = etaPhrase(before, after);
    const summaryParts: string[] = [];
    if (group.length > 1) {
      summaryParts.push(
        `ETA refreshed ${group.length} times during this stage`
      );
    }
    if (trail) summaryParts.push(trail.replace(/→/g, "→"));
    if (etaLine) summaryParts.push(`Final ETA: ${after != null ? `${Math.round(after)} min` : "—"}`);
    else if (after != null) summaryParts.push(`About ${Math.round(after)} min remaining`);
    summaryParts.push("Updated automatically based on live progress");

    cards.push({
      key: `grp-${first.id}-${last.id}`,
      title: titleFor(last),
      at: first.at,
      atEnd: group.length > 1 ? last.at : null,
      summary: summaryParts.join(". "),
      etaBefore: before,
      etaAfter: after,
      stage: last.stage,
      stageLabel: last.stage ? STAGE_LABELS[last.stage] ?? last.stage : null,
      reasonLabel: "Live progress",
      confidence: last.confidence,
      orderStatus: last.orderStatus,
      groupedCount: group.length,
      etaTrail: trail,
      rawIds: group.map((g) => g.id),
      isGrouped: group.length > 1,
    });
    i = j;
  }

  const order = opts?.order ?? "desc";
  return order === "desc" ? cards.reverse() : cards;
}
