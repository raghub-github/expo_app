/** INR-style 2-decimal monetary rounding for GST / discounts. */
export function round2(n: number): number {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}
