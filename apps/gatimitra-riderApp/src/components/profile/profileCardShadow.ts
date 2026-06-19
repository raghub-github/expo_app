import { Platform, type ViewStyle } from "react-native";

export const profileCardShadow: ViewStyle = Platform.select({
  ios: {
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
  },
  android: { elevation: 1 },
  default: {},
}) ?? {};

export const profileHeroShadow: ViewStyle = Platform.select({
  ios: {
    shadowColor: "#059669",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 5,
  },
  android: { elevation: 2 },
  default: {},
}) ?? {};
