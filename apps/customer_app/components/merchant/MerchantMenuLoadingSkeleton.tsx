import React, { useEffect, useRef } from "react";
import { AppText } from "@/components/AppText";

import { View, StyleSheet, Animated, useWindowDimensions } from "react-native";
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
  /** Full-bleed loader — skeleton paints behind the status bar and to the bottom edge. */
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
  const { height: windowH } = useWindowDimensions();
  const message = useMerchantLoadingMessage(merchantId, startMessageIndex);
  const isScreen = variant === "screen";

  // Full-bleed: hero shimmer extends UP behind the status bar (no white strip).
  const heroTopExtend = isScreen && edgeToEdge ? insets.top : 0;
  /** Keep text above the home indicator; white background still paints to the edge. */
  const bottomPad = isScreen ? Math.max(insets.bottom, 14) : 16;
  // Fewer rows so the sentence footer always has room in the column.
  const rowCount = isScreen ? 5 : 3;

  // Smooth cross-fade when the rotating message changes — keep first paint fully visible.
  const fade = useRef(new Animated.Value(1)).current;
  const isFirstMessageRef = useRef(true);
  useEffect(() => {
    if (isFirstMessageRef.current) {
      isFirstMessageRef.current = false;
      fade.setValue(1);
      return;
    }
    fade.setValue(0);
    const anim = Animated.timing(fade, {
      toValue: 1,
      duration: 320,
      useNativeDriver: true,
    });
    anim.start();
    return () => anim.stop();
  }, [message, fade]);

  return (
    <View
      style={[
        styles.root,
        isScreen ? styles.rootScreen : styles.rootInline,
        // Fill the visible window (not screen) so the footer is never clipped below the Modal.
        isScreen && edgeToEdge ? { height: windowH, minHeight: windowH } : null,
        isScreen && !edgeToEdge ? styles.rootScreenFlex : null,
      ]}
    >
      <View
        style={[
          styles.skeletonContent,
          isScreen ? styles.skeletonContentScreen : styles.skeletonContentInline,
        ]}
      >
        {isScreen ? (
          <GMSkeleton style={[styles.heroBlock, { height: 168 + heroTopExtend }]} />
        ) : null}
        {Array.from({ length: rowCount }).map((_, i) => (
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

      {/* Flex footer (not absolute) — always stays on-screen above the home indicator. */}
      <View
        style={[
          styles.messageFooter,
          isScreen ? styles.messageFooterScreen : styles.messageFooterInline,
          { paddingBottom: bottomPad },
        ]}
        pointerEvents="none"
      >
        <MerchantLoadingWave />
        <Animated.View style={[styles.messageTextWrap, { opacity: fade }]}>
          <AppText style={styles.messageText} numberOfLines={3}>
            {message || "Preparing your perfect menu."}
          </AppText>
        </Animated.View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    backgroundColor: "#FFFFFF",
    overflow: "hidden",
    flexDirection: "column",
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
    flex: 1,
    paddingTop: 0,
    paddingHorizontal: 0,
    minHeight: 0,
  },
  skeletonContentInline: {
    flexShrink: 1,
  },
  heroBlock: {
    width: "100%",
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
    paddingHorizontal: 24,
    width: "100%",
    backgroundColor: "#FFFFFF",
    flexShrink: 0,
    zIndex: 20,
    elevation: 12,
  },
  messageFooterScreen: {
    paddingTop: 8,
    minHeight: 96,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#F1F5F9",
  },
  messageFooterInline: {
    marginTop: 12,
    paddingBottom: 28,
    paddingHorizontal: 16,
  },
  messageTextWrap: {
    width: "100%",
    minHeight: 48,
    justifyContent: "center",
  },
  messageText: {
    textAlign: "center",
    fontSize: 15,
    lineHeight: 22,
    fontWeight: "600",
    color: StoreTheme.textPrimary,
    width: "100%",
  },
});
