import type { ThermalPrinterWidthMm } from "./types";

export type KotAddressInput = {
  fullAddress?: string | null;
  landmark?: string | null;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
};

/** Build a single-line store address for the KOT header. */
export function formatKotRestaurantAddress(input: KotAddressInput): string {
  const line = (input.fullAddress ?? "").trim();
  const landmark = (input.landmark ?? "").trim();
  const city = (input.city ?? "").trim();
  const state = (input.state ?? "").trim();
  const postal = (input.postalCode ?? "").trim();

  const locality = [landmark, city, state].filter(Boolean).join(", ");
  const tail = [locality, postal].filter(Boolean).join(" - ");
  if (line && tail) return `${line}, ${tail}`;
  return line || tail;
}

export function normalizeThermalPrinterWidthMm(
  value: unknown
): ThermalPrinterWidthMm {
  return value === 58 || value === "58" ? 58 : 80;
}
