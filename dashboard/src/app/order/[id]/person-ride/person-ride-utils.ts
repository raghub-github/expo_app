/** Person-ride detail helpers (isolated from food order UI). */

import { titleCaseStatusWords } from "@/lib/riders/rider-order-status-display";

export const PR_GREEN = "#16A34A";
export const PR_RED = "#DC2626";
export const PR_BLACK = "#121212";
export const PR_WHITE = "#FFFFFF";
export const PR_BORDER = "#E5E5E5";
export const PR_MUTED = "#6B7280";
export const PR_SURFACE = "#FAFAFA";

export type RideMilestoneKey =
  | "booked"
  | "assigned"
  | "on_the_way"
  | "arrived"
  | "trip_started"
  | "near_destination"
  | "completed"
  | "cancelled";

export const RIDE_MILESTONES: {
  key: RideMilestoneKey;
  label: string;
  statuses: string[];
}[] = [
  {
    key: "booked",
    label: "Ride Booked",
    statuses: ["created", "pending", "confirmed", "placed", "searching_rider"],
  },
  {
    key: "assigned",
    label: "Captain Assigned",
    statuses: ["assigned", "rider_assigned"],
  },
  {
    key: "on_the_way",
    label: "Captain On The Way",
    statuses: ["accepted", "rider_on_the_way"],
  },
  {
    key: "arrived",
    label: "Captain Arrived",
    statuses: [
      "reached_store",
      "rider_waiting_for_otp",
      "rider_at_pickup",
      "rider_reached_pickup",
      "pickup_otp_verified",
    ],
  },
  {
    key: "trip_started",
    label: "Trip Started",
    statuses: ["picked_up", "ride_in_progress"],
  },
  {
    key: "near_destination",
    label: "Near Destination",
    statuses: ["in_transit", "near_drop", "arrived_at_drop"],
  },
  {
    key: "completed",
    label: "Trip Completed",
    statuses: ["delivered", "completed"],
  },
];

export function normalizeStatus(status: string | null | undefined): string {
  return String(status ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
}

export function formatRideStatusLabel(status: string | null | undefined): string {
  const key = normalizeStatus(status);
  if (!key) return "—";
  if (key === "delivered" || key === "completed") return "Completed";
  if (
    key === "reached_store" ||
    key === "rider_waiting_for_otp" ||
    key === "rider_at_pickup" ||
    key === "rider_reached_pickup" ||
    key === "pickup_otp_verified"
  ) {
    return "Captain Arrived";
  }
  if (key === "picked_up" || key === "ride_in_progress") return "Trip Started";
  if (key === "in_transit" || key === "near_drop") return "On Trip";
  if (key === "accepted" || key === "rider_on_the_way") return "Captain On The Way";
  if (key === "assigned" || key === "rider_assigned") return "Captain Assigned";
  if (key === "cancelled" || key === "canceled") return "Cancelled";
  return titleCaseStatusWords(key);
}

/** 0–1 progress for active rides; cancelled stays at last reached stage. */
export function rideProgressFraction(status: string | null | undefined): number {
  const key = normalizeStatus(status);
  if (key === "cancelled") return 0;
  const idx = RIDE_MILESTONES.findIndex((m) => m.statuses.includes(key));
  if (idx < 0) return 0.08;
  return Math.min(1, (idx + 1) / RIDE_MILESTONES.length);
}

export function activeMilestoneIndex(status: string | null | undefined): number {
  const key = normalizeStatus(status);
  if (key === "cancelled") return -1;
  return RIDE_MILESTONES.findIndex((m) => m.statuses.includes(key));
}

export function formatInr(amount: number | null | undefined): string {
  if (amount == null || !Number.isFinite(Number(amount))) return "—";
  return `₹${Number(amount).toLocaleString("en-IN", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}`;
}

export function formatKm(km: number | null | undefined): string {
  if (km == null || !Number.isFinite(Number(km))) return "—";
  return `${Number(km).toFixed(1)} km`;
}

/** Straight-line distance between two lat/lon points (km). */
export function haversineKm(
  lat1: number | null | undefined,
  lon1: number | null | undefined,
  lat2: number | null | undefined,
  lon2: number | null | undefined
): number | null {
  if (
    lat1 == null ||
    lon1 == null ||
    lat2 == null ||
    lon2 == null ||
    !Number.isFinite(lat1) ||
    !Number.isFinite(lon1) ||
    !Number.isFinite(lat2) ||
    !Number.isFinite(lon2)
  ) {
    return null;
  }
  const toRad = (d: number) => (d * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

export function formatDurationFromSeconds(sec: number | null | undefined): string {
  if (sec == null || !Number.isFinite(Number(sec)) || Number(sec) <= 0) return "—";
  const s = Math.round(Number(sec));
  const m = Math.floor(s / 60);
  const rem = s % 60;
  if (m >= 60) {
    const h = Math.floor(m / 60);
    const mm = m % 60;
    return `${h}h ${mm}m`;
  }
  if (m === 0) return `${rem}s`;
  return rem > 0 ? `${m} min ${rem}s` : `${m} min`;
}

export function formatEtaLabel(etaSeconds: number | null | undefined): string {
  if (etaSeconds == null || !Number.isFinite(Number(etaSeconds))) return "—";
  const m = Math.max(1, Math.round(Number(etaSeconds) / 60));
  return `${m} min`;
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

export function formatLabel(raw: string | null | undefined): string {
  if (!raw?.trim()) return "—";
  return titleCaseStatusWords(raw);
}

export function statusTone(
  status: string | null | undefined
): "green" | "red" | "black" {
  const key = normalizeStatus(status);
  if (key === "cancelled" || key === "failed") return "red";
  if (key === "delivered") return "green";
  return "black";
}
