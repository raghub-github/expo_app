import React from "react";
import { View, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { GMSkeleton } from "@/components/ShimmerSkeleton";
import { useMerchantLoadingMessage } from "@/hooks/useMerchantLoadingMessage";
import { MerchantLoadingTypewriterText } from "@/components/merchant/MerchantLoadingTypewriterText";
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
  const message = useMerchantLoadingMessage(merchantId, startMessageIndex);
  const isScreen = variant === "screen";

  return (
    <View
      style={[
        styles.root,
        isScreen ? styles.rootScreen : styles.rootInline,
        isScreen && edgeToEdge ? { paddingTop: insets.top } : null,
      ]}
    >
      <View style={[styles.skeletonContent, isScreen ? styles.skeletonContentScreen : null]}>
        {isScreen ? <GMSkeleton style={styles.heroBlock} /> : null}
        {Array.from({ length: isScreen ? 5 : 4 }).map((_, i) => (
          <View key={i} style={styles.row}>
            <View style={styles.rowLeft}>
              <GMSkeleton style={styles.lineLg} />
              <GMSkeleton style={styles.lineMd} />
              <GMSkeleton style={styles.lineSm} />
            </View>
            <GMSkeleton style={styles.thumb} />
          </View>
        ))}
      </View>

      <View
        style={[
          styles.messageFooter,
          isScreen ? styles.messageFooterScreen : styles.messageFooterInline,
          isScreen && edgeToEdge ? { paddingBottom: Math.max(insets.bottom, 12) } : { paddingBottom: insets.bottom },
        ]}
        pointerEvents="none"
      >
        <MerchantLoadingTypewriterText text={message} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    backgroundColor: StoreTheme.background,
  },
  rootScreen: {
    flex: 1,
  },
  rootInline: {
    minHeight: 420,
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  skeletonContent: {
    paddingHorizontal: 16,
    gap: 22,
  },
  skeletonContentScreen: {
    flex: 1,
    paddingTop: 8,
  },
  heroBlock: {
    width: "100%",
    height: 168,
    borderRadius: 12,
  },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 14,
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
    paddingHorizontal: 20,
    paddingTop: 10,
    flexShrink: 0,
    width: "100%",
  },
  messageFooterScreen: {
    marginTop: "auto",
  },
  messageFooterInline: {
    marginTop: 24,
    paddingBottom: 32,
  },
});
