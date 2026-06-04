import { Platform, type ViewStyle } from "react-native";
import { colors } from "@/src/theme";

export const LEDGER_TEAL = colors.primary[600];
export const LEDGER_TEAL_DARK = colors.primary[700];
export const LEDGER_PAGE_BG = "#F4F6F8";
export const LEDGER_CARD_RADIUS = 18;

export const ledgerCardShadow: ViewStyle = Platform.select({
  ios: {
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
  },
  android: { elevation: 3 },
  default: {},
}) ?? {};

export const ledgerSoftShadow: ViewStyle = Platform.select({
  ios: {
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
  },
  android: { elevation: 2 },
  default: {},
}) ?? {};
