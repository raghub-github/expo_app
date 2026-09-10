/** Shared header chrome metrics + control label styles. */

export const LORA_BOLD = "Lora_700Bold";
export const LORA_SEMIBOLD = "Lora_600SemiBold";
export const LORA_REGULAR = "Lora_400Regular";
export const POPPINS_SEMIBOLD = "Poppins_600SemiBold";
export const POPPINS_BOLD = "Poppins_700Bold";
export const POPPINS_EXTRA_BOLD = "Poppins_800ExtraBold";

export const HEADER_TITLE_SIZE = 20;
export const HEADER_ICON_SIZE = 18;
export const HEADER_BADGE_SIZE = 36;
export const HEADER_BADGE_RADIUS = 12;

/** Shared edge inset — duty toggle left ↔ lang/bell group right. */
export const HEADER_EDGE_INSET = 16;

/** Fixed duty pill width — keeps first paint / later paint identical.
 * Prefer DutyToggle's responsive width (scales from this base). */
export const HEADER_DUTY_PILL_WIDTH = 108;

/** Services chip base width — RiderServiceTypeDropdown scales from this. */
export const HEADER_SERVICES_WIDTH = 108;

/** MAX badge slot base — HeaderTrailingActions scales on compact widths. */
export const HEADER_MAX_SLOT_WIDTH = 64;

/**
 * Compact header control labels.
 * System black weight — custom Lora/Poppins at 11–13px were not painting bold
 * (and letterSpacing made them look thinner). Same approach as home title / demand card.
 */
export const headerControlText = {
  fontWeight: "800" as const,
  includeFontPadding: false as const,
};

export const TAB_LABEL_SIZE = 11;
