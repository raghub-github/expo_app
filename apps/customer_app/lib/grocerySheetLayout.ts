/** @deprecated Grocery sheets use the original 88% max-height again — kept for imports. */
export const GROCERY_SHEET_HEIGHT_BASE_RATIO = 0.88;
/** @deprecated */
export const GROCERY_SHEET_HEIGHT_EXPANDED_RATIO = 0.88;
export type GrocerySheetHeightMode = "base" | "expanded";

export function resolveGrocerySheetHeight(
  screenHeight: number,
  mode: GrocerySheetHeightMode
): number {
  const ratio =
    mode === "expanded"
      ? GROCERY_SHEET_HEIGHT_EXPANDED_RATIO
      : GROCERY_SHEET_HEIGHT_BASE_RATIO;
  return Math.round(screenHeight * ratio);
}
