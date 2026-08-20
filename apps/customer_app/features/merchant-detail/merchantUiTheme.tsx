import React, { createContext, useContext } from "react";

/** Discovery store inner page — charcoal, no purple. */
export const MerchantDarkPalette = {
  bg: "#121212",
  surface: "#1A1A1A",
  card: "#1E1E1E",
  elevated: "#242424",
  border: "#2F2F2F",
  text: "#FFFFFF",
  textMuted: "#B0B0B0",
  textDim: "#8A8A8A",
  accent: "#2DD4BF",
  accentSoft: "rgba(45, 212, 191, 0.16)",
  search: "#2A2A2A",
  chip: "#242424",
  chipBorder: "#3A3A3A",
  chipActive: "rgba(45, 212, 191, 0.2)",
  rail: "#161616",
  railActiveBg: "#2DD4BF",
  railActiveText: "#042F2E",
  add: "#22C55E",
  offer: "#0EA5E9",
} as const;

type MerchantUiMode = "light" | "dark";

const MerchantUiThemeContext = createContext<MerchantUiMode>("light");

export function MerchantUiThemeProvider({
  dark,
  children,
}: {
  dark: boolean;
  children: React.ReactNode;
}) {
  return (
    <MerchantUiThemeContext.Provider value={dark ? "dark" : "light"}>
      {children}
    </MerchantUiThemeContext.Provider>
  );
}

export function useMerchantUiDark(): boolean {
  return useContext(MerchantUiThemeContext) === "dark";
}
