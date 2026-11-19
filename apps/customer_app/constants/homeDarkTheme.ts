/**
 * Tabs Home dark chrome — softer than discovery pure-black (#121212).
 * Page sits mid-charcoal; service tiles lift as greyer cards (magicpin-like).
 */
export const HOME_DARK = {
  /** Page — darker so grey tiles clearly lift off. */
  page: "#2C2C30",
  /**
   * Magicpin-like service tile — true mid grey (not near-black).
   * Must stay clearly lighter than `page`.
   */
  card: "#585858",
  cardElevated: "#646464",
  /** Press / hover wash — grey lift, never mint. */
  cardPress: "rgba(255,255,255,0.14)",
  border: "rgba(255,255,255,0.10)",
  text: "#FFFFFF",
  textMuted: "#D0D0D6",
  textDim: "#A0A0A8",
  weather: "#3A3A42",
  iconChip: "#3A3A42",
} as const;
