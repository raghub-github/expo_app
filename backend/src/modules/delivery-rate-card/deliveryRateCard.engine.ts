import type {
  DeliveryFeeRequest,
  DeliveryFeeResult,
  DeliveryRateCardDataset,
  DemandLevel,
  DistanceSlabRow,
  RateCardRow,
  TimeSlotRow,
  ZoneRow,
} from "./deliveryRateCard.types.js";
import { pointInGeoJSON } from "./geo.js";

function clamp0(n: number): number {
  return Math.max(0, n);
}

function normalizeServiceType(v: string): string {
  const s = (v ?? "").trim().toUpperCase();
  if (s === "FOOD" || s === "PARCEL" || s === "RIDE" || s === "ALL") return s;
  return "FOOD";
}

function nowMinutes(now: Date): number {
  return now.getHours() * 60 + now.getMinutes();
}

function isWeekend(now: Date): boolean {
  const d = now.getDay(); // 0 sun
  return d === 0 || d === 6;
}

function matchCity(card: RateCardRow, cityName: string | null | undefined): boolean {
  const c = card.cityName?.trim().toLowerCase();
  if (!c) return true; // global city
  const have = (cityName ?? "").trim().toLowerCase();
  return have !== "" && have === c;
}

function pickCard(cards: RateCardRow[], req: DeliveryFeeRequest): RateCardRow | null {
  const st = normalizeServiceType(req.serviceType);
  const eligible = cards
    .filter((c) => normalizeServiceType(String(c.serviceType)) === st || normalizeServiceType(String(c.serviceType)) === "ALL")
    .filter((c) => matchCity(c, req.cityName))
    .sort((a, b) => a.priority - b.priority);
  if (eligible.length > 0) return eligible[0] ?? null;

  // fallback: ignore city if none found
  const fallback = cards
    .filter((c) => normalizeServiceType(String(c.serviceType)) === st || normalizeServiceType(String(c.serviceType)) === "ALL")
    .sort((a, b) => a.priority - b.priority);
  return fallback[0] ?? null;
}

function pickSlab(slabs: DistanceSlabRow[], rateCardId: number, distanceKm: number): DistanceSlabRow | null {
  const list = slabs.filter((s) => s.rateCardId === rateCardId).sort((a, b) => a.priority - b.priority);
  for (const s of list) {
    const min = s.minKm ?? 0;
    const max = s.maxKm ?? 1e9;
    if (distanceKm >= min && distanceKm <= max) return s;
  }
  return list[0] ?? null;
}

function pickTimeSlot(
  slots: TimeSlotRow[],
  rateCardId: number,
  now: Date
): TimeSlotRow | null {
  const mins = nowMinutes(now);
  const weekend = isWeekend(now);
  const list = slots.filter((s) => s.rateCardId === rateCardId);
  for (const s of list) {
    if (s.isWeekendOnly && !weekend) continue;
    const start = s.startMin;
    const end = s.endMin;
    // handle wrap-around (e.g. 22:00 -> 06:00)
    const hit = start <= end ? mins >= start && mins < end : mins >= start || mins < end;
    if (hit) return s;
  }
  return null;
}

function pickZone(zones: ZoneRow[], rateCardId: number, pickup: { lat: number; lng: number }): ZoneRow | null {
  const list = zones
    .filter((z) => z.rateCardId === rateCardId && z.isActive)
    .sort((a, b) => a.priority - b.priority);
  for (const z of list) {
    if (pointInGeoJSON(pickup, z.geojson)) return z;
  }
  return null;
}

function pickSpecialDay(dataset: DeliveryRateCardDataset, now: Date): { id: number | null; mult: number } {
  const day = now.toISOString().slice(0, 10);
  const row = dataset.specialDays.find((d) => d.isActive && d.day === day) ?? null;
  return { id: row?.id ?? null, mult: row?.multiplier ?? 1 };
}

function demandMult(dataset: DeliveryRateCardDataset, st: string, level: DemandLevel): number {
  const row =
    dataset.demandLevels.find(
      (d) =>
        d.isActive &&
        (normalizeServiceType(String(d.serviceType)) === st || normalizeServiceType(String(d.serviceType)) === "ALL") &&
        String(d.demandLevel).toUpperCase() === String(level).toUpperCase()
    ) ?? null;
  return row?.multiplier ?? 1;
}

export function calculateDeliveryFee(dataset: DeliveryRateCardDataset, req: DeliveryFeeRequest): DeliveryFeeResult {
  const st = normalizeServiceType(req.serviceType);
  const demandLevel: DemandLevel = (req.demandLevel ?? "UNKNOWN") as DemandLevel;
  const card = pickCard(dataset.cards, req);
  if (!card) {
    return {
      distanceKm: req.distanceKm,
      baseFare: 0,
      perKmRate: 0,
      surgeMultiplier: 1,
      zoneMultiplier: 1,
      specialDayMultiplier: 1,
      demandMultiplier: 1,
      totalDeliveryFee: 0,
      appliedRateCardId: null,
      appliedSlabId: null,
      appliedTimeSlotId: null,
      appliedZoneId: null,
      appliedSpecialDayId: null,
      demandLevel,
      debug: { reason: "no_rate_card" },
    };
  }

  const slab = pickSlab(dataset.slabs, card.id, req.distanceKm);
  const timeSlot = pickTimeSlot(dataset.timeSlots, card.id, req.now);
  const zone = pickZone(dataset.zones, card.id, req.pickup);
  const special = pickSpecialDay(dataset, req.now);

  const baseFare = clamp0(slab?.baseFare ?? 0);
  const perKmRate = clamp0(slab?.perKmRate ?? 0);
  const surgeMultiplier = clamp0(timeSlot?.surgeMultiplier ?? 1) || 1;
  const zoneMultiplier = clamp0(zone?.multiplier ?? 1) || 1;
  const specialDayMultiplier = clamp0(special.mult) || 1;
  const demandMultiplier = clamp0(demandMult(dataset, st, demandLevel)) || 1;

  const raw = (baseFare + perKmRate * clamp0(req.distanceKm)) * surgeMultiplier * zoneMultiplier * specialDayMultiplier * demandMultiplier;
  const total = Math.round(raw * 100) / 100;

  return {
    distanceKm: req.distanceKm,
    baseFare,
    perKmRate,
    surgeMultiplier,
    zoneMultiplier,
    specialDayMultiplier,
    demandMultiplier,
    totalDeliveryFee: clamp0(total),
    appliedRateCardId: card.id,
    appliedSlabId: slab?.id ?? null,
    appliedTimeSlotId: timeSlot?.id ?? null,
    appliedZoneId: zone?.id ?? null,
    appliedSpecialDayId: special.id,
    demandLevel,
    debug: {
      card: { id: card.id, name: card.name, serviceType: card.serviceType, cityName: card.cityName, priority: card.priority },
      slab,
      timeSlot,
      zone: zone ? { id: zone.id, zoneName: zone.zoneName, multiplier: zone.multiplier } : null,
      specialDay: special,
    },
  };
}

