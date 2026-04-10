/** Display resolved geo `base_fee` (effective along hierarchy). */
export function formatGeoBaseFee(v: string | null | undefined): string {
  if (v == null || v === "") return "—";
  return `₹${v}`;
}
