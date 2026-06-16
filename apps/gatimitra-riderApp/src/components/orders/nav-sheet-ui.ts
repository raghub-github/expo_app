/** Shared bottom-sheet tokens (food + ride navigation). */
export const NAV_SHEET_PHASE_BADGE_BG = "#1E3A5F";
/** Dark teal DROP pill (reach-drop reference). */
export const NAV_SHEET_PHASE_BADGE_DROP_BG = "#156B63";
/** Pickup leg “Go to Map” — teal. */
export const NAV_SHEET_MAP_BTN_BG = "#0F766E";
/** Drop leg “Map” action — Google-style blue. */
export const NAV_SHEET_DROP_MAP_BTN_BG = "#1A73E8";
export const NAV_SHEET_CALL_BLUE = "#1A73E8";

export function formatNavSheetDistance(metersAway: number | null | undefined): string {
  if (metersAway == null || !Number.isFinite(metersAway)) return "—";
  if (metersAway >= 1000) return `${(metersAway / 1000).toFixed(1)} km`;
  return `${Math.round(metersAway)} m`;
}
