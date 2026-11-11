/**
 * Parcel ops-board status resolution (list badge + terminal hide).
 * Prefer the further-along of orders_core.status vs current_status.
 */

export type ParcelListStatusInput = {
  status?: string | null;
  currentStatus?: string | null;
  cancelledAt?: string | Date | null;
};

/** Normalize free-text / enum status → snake_case key. */
export function normalizeParcelStatusKey(value: string | null | undefined): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
}

const PIPELINE_RANK: Record<string, number> = {
  assigned: 0,
  searching_rider: 0,
  created: 0,
  pending: 0,
  placed: 0,
  confirmed: 0,
  rider_assigned: 0,
  accepted: 1,
  rider_on_the_way: 1,
  on_the_way: 1,
  reached_store: 2,
  reached_pickup: 2,
  rider_at_pickup: 2,
  rider_reached_pickup: 2,
  rider_waiting_for_otp: 2,
  arrived: 2,
  picked_up: 3,
  trip_started: 3,
  ride_in_progress: 3,
  in_transit: 4,
  near_drop: 4,
  arrived_at_drop: 4,
  delivered: 5,
  completed: 5,
  complete: 5,
  cancelled: 6,
  canceled: 6,
  failed: 6,
  rejected: 6,
};

/** Map free-text / alias keys → list badge / tab keys. */
const TO_BOARD_KEY: Record<string, string> = {
  searching_rider: "assigned",
  created: "assigned",
  pending: "assigned",
  placed: "assigned",
  confirmed: "assigned",
  rider_assigned: "assigned",
  assigned: "assigned",
  accepted: "accepted",
  rider_on_the_way: "accepted",
  on_the_way: "accepted",
  reached_store: "reached_store",
  reached_pickup: "reached_store",
  rider_at_pickup: "reached_store",
  rider_reached_pickup: "reached_store",
  rider_waiting_for_otp: "reached_store",
  arrived: "reached_store",
  picked_up: "picked_up",
  trip_started: "picked_up",
  ride_in_progress: "picked_up",
  in_transit: "in_transit",
  near_drop: "in_transit",
  arrived_at_drop: "in_transit",
  delivered: "delivered",
  completed: "delivered",
  complete: "delivered",
  cancelled: "cancelled",
  canceled: "cancelled",
  failed: "cancelled",
  rejected: "cancelled",
};

const TERMINAL_BOARD_KEYS = new Set(["delivered", "cancelled"]);

export function isParcelListTerminalStatus(input: ParcelListStatusInput): boolean {
  if (input.cancelledAt != null && String(input.cancelledAt).trim() !== "") {
    return true;
  }
  const core = normalizeParcelStatusKey(input.status);
  const cur = normalizeParcelStatusKey(input.currentStatus);
  const coreBoard = TO_BOARD_KEY[core] ?? core;
  const curBoard = TO_BOARD_KEY[cur] ?? cur;
  return TERMINAL_BOARD_KEYS.has(coreBoard) || TERMINAL_BOARD_KEYS.has(curBoard);
}

/**
 * Resolve list badge key + raw label source.
 * Picks the further-along of core status vs current_status so a stale
 * "Searching Rider" label does not win over an advanced pipeline status.
 */
export function resolveParcelListStatus(input: ParcelListStatusInput): {
  boardKey: string;
  labelSource: string;
} {
  const coreRaw = normalizeParcelStatusKey(input.status);
  const curRaw = normalizeParcelStatusKey(input.currentStatus);
  const coreRank = PIPELINE_RANK[coreRaw] ?? -1;
  const curRank = PIPELINE_RANK[curRaw] ?? -1;

  let chosenRaw = coreRaw || curRaw;
  if (curRank > coreRank) {
    chosenRaw = curRaw;
  } else if (curRank === coreRank && curRaw) {
    chosenRaw = curRaw;
  } else if (coreRank < 0 && curRaw) {
    chosenRaw = curRaw;
  }

  const boardKey = TO_BOARD_KEY[chosenRaw] ?? (coreRaw || "assigned");

  const preferCurrent =
    Boolean(input.currentStatus?.trim()) &&
    curRank >= coreRank &&
    curRank >= 0;

  const labelSource = preferCurrent
    ? String(input.currentStatus).trim()
    : String(input.status ?? chosenRaw).trim() || "—";

  return { boardKey, labelSource };
}
