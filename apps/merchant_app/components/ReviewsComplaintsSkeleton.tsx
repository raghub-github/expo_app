import { useEffect, useRef } from "react";
import { View, StyleSheet, Animated } from "react-native";
import { StatusBar } from "expo-status-bar";
import { GatiMitraMerchant, H_PADDING } from "@/constants/theme";

const SKELETON_BG = "#E2E8F0";

function SkeletonBox({
  width,
  height,
  borderRadius = 8,
  style,
  animatedValue,
}: {
  width: number | string;
  height: number;
  borderRadius?: number;
  style?: object;
  animatedValue: Animated.Value;
}) {
  return (
    <Animated.View
      style={[
        {
          width,
          height,
          borderRadius,
          backgroundColor: SKELETON_BG,
          opacity: animatedValue,
        },
        style,
      ]}
    />
  );
}

type Props = {
  /** "reviews" | "complaints" — only affects tab pill count (6 vs 4) and header title width */
  variant: "reviews" | "complaints";
  /** Real Complaints/Reviews toggle is rendered by the parent so it stays sticky. */
  hideTabs?: boolean;
};

export function ReviewsComplaintsSkeleton({ variant, hideTabs = false }: Props) {
  const pulse = useRef(new Animated.Value(0.5)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 0.85,
          duration: 800,
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0.5,
          duration: 800,
          useNativeDriver: true,
        }),
      ])
    );
    animation.start();
    return () => animation.stop();
  }, [pulse]);

  return (
    <View style={styles.screen}>
      <StatusBar style="dark" />
      <View style={[styles.content, hideTabs && styles.contentEmbedded]}>
        {hideTabs ? null : (
          <View style={styles.tabsWrap}>
            <View style={styles.tabsBackground}>
              <SkeletonBox width="48%" height={40} borderRadius={10} animatedValue={pulse} />
              <SkeletonBox width="48%" height={40} borderRadius={10} animatedValue={pulse} />
            </View>
          </View>
        )}

        <SkeletonBox width={90} height={12} animatedValue={pulse} style={{ marginBottom: 10 }} />

        {/* Search + filter */}
        <View style={styles.searchRow}>
          <View style={styles.searchBarWrap}>
            <SkeletonBox width="100%" height={40} borderRadius={999} animatedValue={pulse} />
          </View>
          <SkeletonBox width={44} height={40} borderRadius={10} animatedValue={pulse} />
        </View>

        {/* Card placeholders */}
        {[1, 2, 3].map((n) => (
          <View key={n} style={styles.card}>
            <View style={styles.cardHeaderRow}>
              <SkeletonBox width={52} height={24} borderRadius={999} animatedValue={pulse} />
              <SkeletonBox width="70%" height={16} borderRadius={4} animatedValue={pulse} style={{ marginLeft: 8 }} />
            </View>
            <SkeletonBox width="100%" height={14} animatedValue={pulse} style={{ marginTop: 8 }} />
            <SkeletonBox width="90%" height={14} animatedValue={pulse} style={{ marginTop: 4 }} />
            <SkeletonBox width="60%" height={14} animatedValue={pulse} style={{ marginTop: 4 }} />
            <View style={styles.cardFooterRow}>
              <SkeletonBox width={70} height={12} animatedValue={pulse} />
              <SkeletonBox width={64} height={28} borderRadius={999} animatedValue={pulse} />
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: GatiMitraMerchant.surfaceWarm,
  },
  content: {
    flex: 1,
    padding: H_PADDING,
    paddingTop: 8,
  },
  contentEmbedded: {
    paddingTop: 0,
  },
  tabsWrap: {
    marginBottom: 12,
  },
  tabsBackground: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: GatiMitraMerchant.cardBg,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: GatiMitraMerchant.border,
    padding: 4,
  },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
  },
  searchBarWrap: {
    flex: 1,
    marginRight: 8,
  },
  card: {
    backgroundColor: GatiMitraMerchant.cardBg,
    borderRadius: 16,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: GatiMitraMerchant.border,
  },
  cardHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  cardFooterRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 10,
  },
});
