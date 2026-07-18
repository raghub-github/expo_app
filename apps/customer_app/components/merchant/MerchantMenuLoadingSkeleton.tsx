import React from "react";
import { AppText } from "@/components/AppText";

import { View, StyleSheet, Dimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { GMSkeleton } from "@/components/ShimmerSkeleton";
import { useMerchantLoadingMessage } from "@/hooks/useMerchantLoadingMessage";
import { MerchantLoadingWave } from "@/components/merchant/MerchantLoadingWave";
import { StoreTheme } from "@/constants/storeTheme";

export type MerchantMenuLoadingSkeletonProps = {
  merchantId?: string;
  /** Pre-selected message index (nav shutter + page overlay share one pick per visit). */
  startMessageIndex?: number;
  /** Inline block inside scroll (menu_loading row) vs full-screen loader. */
  variant?: "screen" | "inline";
  /** Modal shutter — pad for status bar / home indicator (store overlay is already inset). */
  edgeToEdge?: boolean;
};

/** Generic merchant loading skeleton — not a replica of the final page layout. */
export function MerchantMenuLoadingSkeleton({
  merchantId,
  startMessageIndex,
  variant = "screen",
  edgeToEdge = false,
}: MerchantMenuLoadingSkeletonProps) {
  const insets = useSafeAreaInsets();
  const screenH = Dimensions.get("screen").height;
  const message = useMerchantLoadingMessage(merchantId, startMessageIndex);
  const isScreen = variant === "screen";
  const topPad = isScreen && edgeToEdge ? insets.top : 0;
  /** Keep text above home indicator; white background still paints to the screen edge. */
  const bottomPad = isScreen ? Math.max(insets.bottom, 12) : 0;

  return (
    <View
      style={[
        styles.root,
        isScreen ? styles.rootScreen : styles.rootInline,
        // Modal shutter: paint full device height so no grey strip under the sheet.
        isScreen && edgeToEdge ? { height: screenH, minHeight: screenH } : null,
        isScreen && !edgeToEdge ? styles.rootScreenFlex : null,
      ]}
    >
      <View
        style={[
          styles.skeletonContent,
          isScreen ? styles.skeletonContentScreen : null,
          isScreen ? { paddingTop: topPad } : null,
        ]}
      >
        {isScreen ? <GMSkeleton style={styles.heroBlock} /> : null}
        {Array.from({ length: isScreen ? 4 : 3 }).map((_, i) => (
          <View key={i} style={[styles.row, isScreen && styles.rowPad]}>
            <View style={styles.rowLeft}>
              <GMSkeleton style={styles.lineLg} />
              <GMSkeleton style={styles.lineMd} />
              <GMSkeleton style={styles.lineSm} />
            </View>
            <GMSkeleton style={styles.thumb} />
          </View>
        ))}
      </View>

      {message.trim() ? (
        <View
          style={[
            styles.messageFooter,
            isScreen
              ? [styles.messageFooterScreen, { paddingBottom: bottomPad }]
              : styles.messageFooterInline,
          ]}
          pointerEvents="none"
        >
          <MerchantLoadingWave />
          <AppText style={styles.messageText} numberOfLines={3}>
            {message}
          </AppText>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    backgroundColor: "#FFFFFF",
    overflow: "hidden",
  },
  rootScreen: {
    width: "100%",
  },
  rootScreenFlex: {
    flex: 1,
  },
  rootInline: {
    minHeight: 420,
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  skeletonContent: {
    gap: 22,
    paddingHorizontal: 16,
  },
  skeletonContentScreen: {
    flexGrow: 1,
    paddingBottom: 120,
    paddingHorizontal: 0,
  },
  heroBlock: {
    width: "100%",
    height: 168,
    borderRadius: 0,
  },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 14,
  },
  rowPad: {
    paddingHorizontal: 16,
  },
  rowLeft: {
    flex: 1,
    gap: 10,
    paddingTop: 4,
  },
  lineLg: {
    height: 14,
    width: "88%",
    borderRadius: 6,
  },
  lineMd: {
    height: 12,
    width: "62%",
    borderRadius: 6,
  },
  lineSm: {
    height: 12,
    width: "44%",
    borderRadius: 6,
  },
  thumb: {
    width: 72,
    height: 72,
    borderRadius: 10,
  },
  messageFooter: {
    alignItems: "center",
    justifyContent: "flex-end",
    paddingHorizontal: 20,
    width: "100%",
    backgroundColor: "#FFFFFF",
  },
  messageFooterScreen: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingTop: 4,
  },
  messageFooterInline: {
    marginTop: 24,
    paddingBottom: 32,
    paddingHorizontal: 16,
  },
  messageText: {
    textAlign: "center",
    fontSize: 15,
    lineHeight: 22,
    fontWeight: "600",
    color: StoreTheme.textSecondary,
    minHeight: 44,
    width: "100%",
  },
});
