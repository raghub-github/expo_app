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
};

export function ReviewsComplaintsSkeleton({ variant }: Props) {
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

  const chipCount = variant === "reviews" ? 6 : 4;

  return (
    <View style={styles.screen}>
      <StatusBar style="dark" />
      <View style={styles.content}>
        {/* Tabs */}
        <View style={styles.tabsWrap}>
          <View style={styles.tabsBackground}>
            <SkeletonBox width={100} height={32} borderRadius={999} animatedValue={pulse} />
            <SkeletonBox width={100} height={32} borderRadius={999} animatedValue={pulse} />
          </View>
        </View>

        {/* Header */}
        <View style={styles.headerBlock}>
          <SkeletonBox width={60} height={10} animatedValue={pulse} style={styles.headerEyebrow} />
          <View style={styles.headerTitleRow}>
            <View style={styles.headerLeft}>
              <SkeletonBox width={38} height={38} borderRadius={19} animatedValue={pulse} />
              <View style={styles.headerTextCol}>
                <SkeletonBox width={160} height={18} animatedValue={pulse} style={{ marginBottom: 6 }} />
                <SkeletonBox width={120} height={12} animatedValue={pulse} />
              </View>
            </View>
            <SkeletonBox width={90} height={28} borderRadius={999} animatedValue={pulse} />
          </View>
        </View>

        {/* Summary card */}
        <View style={styles.summaryCard}>
          <View style={styles.summaryRow}>
            <View style={styles.summaryLeft}>
              <SkeletonBox width={48} height={32} animatedValue={pulse} style={{ marginBottom: 8 }} />
              <View style={styles.starsRow}>
                {Array.from({ length: 5 }).map((_, i) => (
                  <SkeletonBox key={i} width={14} height={14} borderRadius={7} animatedValue={pulse} style={{ marginRight: 4 }} />
                ))}
              </View>
              <SkeletonBox width={80} height={12} animatedValue={pulse} style={{ marginTop: 8 }} />
              <SkeletonBox width={140} height={12} animatedValue={pulse} style={{ marginTop: 4 }} />
            </View>
            <View style={styles.summaryRight}>
              {[5, 4, 3, 2, 1].map((star) => (
                <View key={star} style={styles.distRow}>
                  <SkeletonBox width={24} height={10} animatedValue={pulse} />
                  <SkeletonBox width="60%" height={6} borderRadius={999} animatedValue={pulse} style={{ marginHorizontal: 6 }} />
                  <SkeletonBox width={16} height={10} animatedValue={pulse} />
                </View>
              ))}
            </View>
          </View>
        </View>

        {/* Search + filter */}
        <View style={styles.searchRow}>
          <View style={styles.searchBarWrap}>
            <SkeletonBox width="100%" height={40} borderRadius={999} animatedValue={pulse} />
          </View>
          <SkeletonBox width={44} height={40} borderRadius={999} animatedValue={pulse} />
        </View>

        {/* Chips */}
        <View style={styles.chipsRow}>
          {Array.from({ length: chipCount }).map((_, i) => (
            <SkeletonBox key={i} width={i === 0 ? 44 : 72} height={28} borderRadius={999} animatedValue={pulse} style={{ marginRight: 8 }} />
          ))}
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
  tabsWrap: {
    alignItems: "center",
    marginBottom: 12,
  },
  tabsBackground: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  headerBlock: {
    marginBottom: 12,
  },
  headerEyebrow: {
    marginBottom: 8,
  },
  headerTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
  },
  headerTextCol: {
    marginLeft: 10,
  },
  summaryCard: {
    backgroundColor: GatiMitraMerchant.cardBg,
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: GatiMitraMerchant.border,
  },
  summaryRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
  },
  summaryLeft: {
    marginRight: 16,
  },
  starsRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  summaryRight: {
    flex: 1,
  },
  distRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 6,
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
  chipsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginBottom: 12,
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
