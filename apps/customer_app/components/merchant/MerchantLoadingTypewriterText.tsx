/**
 * Instant loading sentence (no typewriter / wipe animation).
 * Kept as a shared component so call sites stay stable.
 */

import React from "react";
import { Text, StyleSheet } from "react-native";
import { StoreTheme } from "@/constants/storeTheme";

type Props = {
  text?: string;
  /** First line only — rotation removed; show instantly. */
  texts?: string[];
};

export function MerchantLoadingTypewriterText({ text, texts }: Props) {
  const display = (texts?.[0] ?? text ?? "").trim();
  if (!display) return null;

  return (
    <Text style={styles.text} accessibilityLiveRegion="polite" numberOfLines={3}>
      {display}
    </Text>
  );
}

const styles = StyleSheet.create({
  text: {
    textAlign: "center",
    fontSize: 15,
    lineHeight: 22,
    fontWeight: "600",
    color: StoreTheme.textSecondary,
    minHeight: 44,
    width: "100%",
  },
});
