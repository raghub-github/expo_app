// @ts-nocheck — pending strict-mode cleanup; tracked in follow-up issue.
import { useSegments } from "expo-router";
import { useTranslation } from "react-i18next";
import type { Ionicons } from "@expo/vector-icons";
import { colors } from "@/src/theme";

export type TabHeaderConfig = {
  title: string;
  icon: keyof typeof Ionicons.glyphMap;
  accentBg: string;
  accentColor: string;
};

/** Header brand for GlobalTopBar — null on Orders (HomeMapHeader + duty toggle). */
export function useTabHeaderConfig(): TabHeaderConfig | null {
  const segments = useSegments();
  const { t } = useTranslation();

  if (segments[0] !== "(tabs)") return null;
  const tab = segments[1];
  if (!tab || tab === "orders" || tab === "index") return null;

  const teal = colors.primary[600];

  const configs: Record<string, TabHeaderConfig> = {
    ledger: {
      title: t("tabs.ledger", "Ledger"),
      icon: "cash-outline",
      accentBg: "#F0FDFA",
      accentColor: teal,
    },
    offers: {
      title: t("tabs.offers", "Offers"),
      icon: "pricetag-outline",
      accentBg: "#F5F3FF",
      accentColor: "#7C3AED",
    },
    earnings: {
      title: t("tabs.earnings", "Earnings"),
      icon: "wallet-outline",
      accentBg: "#ECFDF5",
      accentColor: "#059669",
    },
    profile: {
      title: t("tabs.profile", "Profile"),
      icon: "person-outline",
      accentBg: "#F0FDFA",
      accentColor: teal,
    },
  };

  return configs[tab] ?? null;
}

/** @deprecated Use useTabHeaderConfig */
export function useTabHeaderTitle(): string | null {
  return useTabHeaderConfig()?.title ?? null;
}
