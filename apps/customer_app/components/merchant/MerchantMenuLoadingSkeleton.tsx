import React, { useEffect, useRef } from "react";
import { AppText } from "@/components/AppText";
import { View, StyleSheet, Animated, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { GMSkeleton } from "@/components/ShimmerSkeleton";
import { useMerchantLoadingMessage } from "@/hooks/useMerchantLoadingMessage";
import { MerchantLoadingWave } from "@/components/merchant/MerchantLoadingWave";
import { StoreTheme } from "@/constants/storeTheme";
import { CATEGORY_RAIL_WIDTH } from "@/features/merchant-detail/constants/layout";
import { MerchantDarkPalette, useMerchantUiDark } from "@/features/merchant-detail/merchantUiTheme";

export type MerchantMenuLoadingSkeletonProps = {
  merchantId?: string;
  /** Pre-selected message index (nav shutter + page overlay share one pick per visit). */
  startMessageIndex?: number;
  /** Inline block inside scroll (menu_loading row) vs full-screen loader. */
  variant?: "screen" | "inline";
  /** Full-bleed loader — skeleton paints behind the status bar and to the bottom edge. */
  edgeToEdge?: boolean;
  /** Hide the inner rail when the page already draws a sibling category rail. */
  showRail?: boolean;
};

function MasonryCardSkeleton({ dark }: { dark: boolean }) {
  return (
    <View style={[styles.card, dark && styles.cardDark]}>
      <GMSkeleton dark={dark} style={styles.cardImage} />
      <View style={styles.cardBody}>
        <GMSkeleton dark={dark} style={styles.cardTitle} />
        <GMSkeleton dark={dark} style={styles.cardSubtitle} />
        <View style={styles.cardPriceRow}>
          <GMSkeleton dark={dark} style={styles.cardPrice} />
          <GMSkeleton dark={dark} style={styles.cardAdd} />
        </View>
      </View>
    </View>
  );
}

/** Merchant loading skeleton — list rows for Classic/Grid First, masonry rail for Discovery. */
export function MerchantMenuLoadingSkeleton({
  merchantId,
  startMessageIndex,
  variant = "screen",
  edgeToEdge = false,
  showRail,
}: MerchantMenuLoadingSkeletonProps) {
  const insets = useSafeAreaInsets();
  const dark = useMerchantUiDark();
  const { height: windowH } = useWindowDimensions();
  const message = useMerchantLoadingMessage(merchantId, startMessageIndex);
  const isScreen = variant === "screen";
  const renderRail = showRail ?? isScreen;

  const topPad = isScreen && edgeToEdge ? insets.top : isScreen ? 8 : 0;
  const bottomPad = isScreen ? Math.max(insets.bottom, 14) : 16;

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

  const messageFooter = (
    <View
      style={[
        styles.messageFooter,
        dark && styles.messageFooterDark,
        isScreen ? styles.messageFooterScreen : styles.messageFooterInline,
        isScreen && dark ? styles.messageFooterScreenDark : null,
        { paddingBottom: bottomPad },
      ]}
      pointerEvents="none"
    >
      <MerchantLoadingWave />
      <Animated.View style={[styles.messageTextWrap, { opacity: fade }]}>
        <AppText style={[styles.messageText, dark && styles.messageTextDark]} numberOfLines={3}>
          {message || "Preparing your perfect menu."}
        </AppText>
      </Animated.View>
    </View>
  );

  if (!dark) {
    const heroTopExtend = isScreen && edgeToEdge ? insets.top : 0;
    const rowCount = isScreen ? 5 : 3;
    return (
      <View
        style={[
          styles.classicRoot,
          isScreen ? styles.rootScreen : styles.classicRootInline,
          isScreen && edgeToEdge ? { height: windowH, minHeight: windowH } : null,
          isScreen && !edgeToEdge ? styles.rootScreenFlex : null,
        ]}
      >
        <View
          style={[
            styles.classicContent,
            isScreen ? styles.classicContentScreen : styles.classicContentInline,
          ]}
        >
          {isScreen ? (
            <GMSkeleton style={[styles.classicHero, { height: 168 + heroTopExtend }]} />
          ) : null}
          {Array.from({ length: rowCount }).map((_, i) => (
            <View key={i} style={[styles.classicRow, isScreen && styles.classicRowPad]}>
              <View style={styles.classicRowLeft}>
                <GMSkeleton style={styles.classicLineLg} />
                <GMSkeleton style={styles.classicLineMd} />
                <GMSkeleton style={styles.classicLineSm} />
              </View>
              <GMSkeleton style={styles.classicThumb} />
            </View>
          ))}
        </View>
        {messageFooter}
      </View>
    );
  }

  return (
    <View
      style={[
        styles.root,
        styles.rootDark,
        isScreen ? styles.rootScreen : styles.rootInline,
        isScreen && edgeToEdge ? { height: windowH, minHeight: windowH } : null,
        isScreen && !edgeToEdge ? styles.rootScreenFlex : null,
      ]}
    >
      <View style={[styles.skeletonContent, isScreen && { paddingTop: topPad }]}>
        {isScreen ? (
          <>
            <View style={[styles.headerRow, styles.chromeDark]}>
              <GMSkeleton dark style={styles.headerCircle} />
              <GMSkeleton dark style={styles.headerName} />
              <GMSkeleton dark style={styles.headerRating} />
              <GMSkeleton dark style={styles.headerSquareDark} />
            </View>
            <View style={[styles.searchRow, styles.chromeDark]}>
              <GMSkeleton dark style={styles.searchBar} />
              <GMSkeleton dark style={styles.filterSquare} />
            </View>
            <View style={styles.filterRow}>
              <GMSkeleton dark style={styles.filterChip} />
              <GMSkeleton dark style={styles.filterChipSm} />
              <GMSkeleton dark style={styles.filterChipSm} />
              <GMSkeleton dark style={styles.filterChip} />
            </View>
          </>
        ) : null}

        <View style={styles.menuSplit}>
          {renderRail ? (
            <View style={[styles.rail, styles.railDark]}>
              {Array.from({ length: 7 }).map((_, i) => (
                <View key={i} style={styles.railItem}>
                  <GMSkeleton dark style={styles.railThumbDark} />
                  <GMSkeleton dark style={styles.railLabelDark} />
                </View>
              ))}
            </View>
          ) : null}
          <View style={styles.grid}>
            <View style={styles.columns}>
              <View style={styles.column}>
                {Array.from({ length: 3 }).map((_, i) => (
                  <MasonryCardSkeleton key={`l-${i}`} dark />
                ))}
              </View>
              <View style={styles.column}>
                {Array.from({ length: 3 }).map((_, i) => (
                  <MasonryCardSkeleton key={`r-${i}`} dark />
                ))}
              </View>
            </View>
          </View>
        </View>
      </View>
      {messageFooter}
    </View>
  );
}

const styles = StyleSheet.create({
  classicRoot: {
    backgroundColor: "#FFFFFF",
    overflow: "hidden",
    flexDirection: "column",
  },
  classicRootInline: {
    minHeight: 420,
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  classicContent: {
    gap: 22,
    paddingHorizontal: 16,
  },
  classicContentScreen: {
    flex: 1,
    paddingTop: 0,
    paddingHorizontal: 0,
    minHeight: 0,
  },
  classicContentInline: {
    flexShrink: 1,
  },
  classicHero: {
    width: "100%",
    borderRadius: 0,
  },
  classicRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 14,
  },
  classicRowPad: {
    paddingHorizontal: 16,
  },
  classicRowLeft: {
    flex: 1,
    gap: 10,
    paddingTop: 4,
  },
  classicLineLg: {
    height: 14,
    width: "88%",
    borderRadius: 6,
  },
  classicLineMd: {
    height: 12,
    width: "62%",
    borderRadius: 6,
  },
  classicLineSm: {
    height: 12,
    width: "44%",
    borderRadius: 6,
  },
  classicThumb: {
    width: 72,
    height: 72,
    borderRadius: 10,
  },
  root: {
    backgroundColor: "#F8FAF9",
    overflow: "hidden",
    flexDirection: "column",
  },
  rootDark: {
    backgroundColor: MerchantDarkPalette.bg,
  },
  rootScreen: {
    width: "100%",
  },
  rootScreenFlex: {
    flex: 1,
  },
  rootInline: {
    minHeight: 420,
    paddingTop: 8,
  },
  skeletonContent: {
    flex: 1,
    minHeight: 0,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingBottom: 8,
    gap: 10,
    backgroundColor: "#FFFFFF",
  },
  chromeDark: {
    backgroundColor: MerchantDarkPalette.bg,
  },
  headerCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
  },
  headerName: {
    flex: 1,
    height: 18,
    borderRadius: 8,
  },
  headerSquareMint: {
    width: 36,
    height: 36,
    borderRadius: 10,
  },
  headerSquareDark: {
    width: 36,
    height: 36,
    borderRadius: 10,
  },
  headerRating: {
    width: 52,
    height: 28,
    borderRadius: 8,
  },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingBottom: 10,
    gap: 8,
    backgroundColor: "#FFFFFF",
  },
  searchBar: {
    flex: 1,
    height: 44,
    borderRadius: 12,
  },
  filterSquare: {
    width: 44,
    height: 44,
    borderRadius: 12,
  },
  filterRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingBottom: 10,
    backgroundColor: MerchantDarkPalette.bg,
  },
  filterChip: {
    height: 34,
    width: 78,
    borderRadius: 8,
  },
  filterChipSm: {
    height: 34,
    width: 56,
    borderRadius: 8,
  },
  menuSplit: {
    flex: 1,
    flexDirection: "row",
    minHeight: 0,
    alignItems: "flex-start",
  },
  rail: {
    width: CATEGORY_RAIL_WIDTH,
    backgroundColor: "#134E3A",
    borderTopRightRadius: 22,
    borderBottomRightRadius: 22,
    paddingVertical: 12,
    paddingHorizontal: 8,
    gap: 10,
    minHeight: 320,
  },
  railDark: {
    backgroundColor: MerchantDarkPalette.rail,
    borderTopRightRadius: 0,
    borderBottomRightRadius: 0,
  },
  railItem: {
    alignItems: "center",
    gap: 6,
    paddingVertical: 8,
    borderRadius: 12,
  },
  railThumb: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.28)",
  },
  railThumbDark: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: MerchantDarkPalette.card,
  },
  railLabel: {
    width: 36,
    height: 8,
    borderRadius: 4,
    backgroundColor: "rgba(255,255,255,0.28)",
  },
  railLabelDark: {
    width: 36,
    height: 8,
    borderRadius: 4,
  },
  grid: {
    flex: 1,
    minWidth: 0,
    paddingHorizontal: 8,
    paddingTop: 10,
    gap: 8,
  },
  sectionTitle: {
    height: 16,
    width: "42%",
    borderRadius: 6,
    marginBottom: 4,
  },
  columns: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
  },
  column: {
    flex: 1,
    minWidth: 0,
    gap: 8,
  },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    overflow: "hidden",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#E8E8E8",
  },
  cardDark: {
    backgroundColor: MerchantDarkPalette.card,
    borderColor: MerchantDarkPalette.border,
  },
  cardImage: {
    width: "100%",
    aspectRatio: 1,
    borderTopLeftRadius: 14,
    borderTopRightRadius: 14,
  },
  cardBody: {
    padding: 8,
    gap: 8,
  },
  cardTitle: {
    height: 12,
    width: "86%",
    borderRadius: 5,
  },
  cardSubtitle: {
    height: 10,
    width: "58%",
    borderRadius: 5,
  },
  cardPriceRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 2,
  },
  cardPrice: {
    height: 12,
    width: 44,
    borderRadius: 5,
  },
  cardAdd: {
    width: 32,
    height: 32,
    borderRadius: 8,
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
  messageFooterDark: {
    backgroundColor: MerchantDarkPalette.bg,
  },
  messageFooterScreen: {
    paddingTop: 8,
    minHeight: 96,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#F1F5F9",
  },
  messageFooterScreenDark: {
    borderTopColor: MerchantDarkPalette.border,
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
  messageTextDark: {
    color: MerchantDarkPalette.textMuted,
  },
});
