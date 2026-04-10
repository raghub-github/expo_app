import type { BillContext, DeliveryRateCardRow } from "./types.js";

function num(v: unknown): number {
  if (v == null) return 0;
  const x = typeof v === "number" ? v : parseFloat(String(v));
  return Number.isFinite(x) ? x : 0;
}

/** time_slot: ALL | DAY | NIGHT | PEAK (simple defaults) */
export function timeSlotMatches(slot: string | null | undefined, now: Date): boolean {
  const s = (slot ?? "").trim().toUpperCase();
  if (!s || s === "ALL") return true;
  const h = now.getHours();
  if (s === "NIGHT") return h >= 22 || h < 6;
  if (s === "DAY") return h >= 6 && h < 22;
  if (s === "PEAK") return (h >= 12 && h < 15) || (h >= 19 && h < 22);
  return true;
}

export function pickDeliveryRateCard(cards: DeliveryRateCardRow[], ctx: BillContext): DeliveryRateCardRow | null {
  const st = ctx.serviceType || "FOOD";
  const scoped = cards.filter((c) => c.serviceType === st || c.serviceType === "ALL");
  const cityHave = ctx.cityName?.trim().toLowerCase() ?? "";

  const citySpecific = [...scoped]
    .filter((c) => {
      if (!timeSlotMatches(c.timeSlot, ctx.now)) return false;
      const cCity = c.cityName?.trim() ?? "";
      if (!cCity) return false;
      if (!cityHave) return false;
      return cCity.toLowerCase() === cityHave;
    })
    .sort((a, b) => a.priority - b.priority);

  if (citySpecific.length > 0) return citySpecific[0] ?? null;

  const global = [...scoped]
    .filter((c) => timeSlotMatches(c.timeSlot, ctx.now) && !(c.cityName?.trim()))
    .sort((a, b) => a.priority - b.priority);

  return global[0] ?? null;
}

export function feeFromRateCard(card: DeliveryRateCardRow, ctx: BillContext, cartSubtotal: number): number {
  if (ctx.distanceKm == null || !Number.isFinite(ctx.distanceKm)) return 0;
  const dRaw = ctx.distanceKm;
  const minD = num(card.minKm);
  const dEff = minD > 0 ? Math.max(dRaw, minD) : dRaw;
  const maxD = num(card.maxKm);
  const dUse = maxD > 0 ? Math.min(dEff, maxD) : dEff;
  let fee = num(card.baseFare) + num(card.perKmRate) * dUse;
  const mult = num(card.surgeMultiplier);
  fee *= mult > 0 ? mult : 1;
  const freeAbove = num(card.freeDeliveryAbove);
  if (freeAbove > 0 && cartSubtotal >= freeAbove) fee = 0;
  return Math.max(0, fee);
}
