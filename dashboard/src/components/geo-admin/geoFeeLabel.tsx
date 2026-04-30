/** Display resolved geo `base_fee` (effective along hierarchy). */
export function formatGeoBaseFee(v: string | null | undefined): string {
  if (v == null || v === "") return "—";
  return `₹${v}`;
}

/** Display compact customer delivery slab preview (already formatted server-side). */
export function formatGeoDeliverySlabPreview(v: string | null | undefined): string {
  if (v == null || v.trim() === "") return "—";
  return v;
}
