import { useEffect, useRef } from "react";
import { View, StyleSheet, Animated } from "react-native";
import { GatiMitraMerchant, H_PADDING, CARD_PADDING, CARD_RADIUS } from "@/constants/theme";

const SKELETON_BG = "#E2E8F0";

function SkeletonBox({
  width,
  height,
  borderRadius = 8,
  style,
  pulse,
}: {
  width: number | string;
  height: number;
  borderRadius?: number;
  style?: object;
  pulse: Animated.Value;
}) {
  return (
    <Animated.View
      style={[
        { width, height, borderRadius, backgroundColor: SKELETON_BG, opacity: pulse },
        style,
      ]}
    />
  );
}

export function OrderDetailSkeleton() {
  const pulse = useRef(new Animated.Value(0.5)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 0.9, duration: 750, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.45, duration: 750, useNativeDriver: true }),
      ])
    );
    animation.start();
    return () => animation.stop();
  }, [pulse]);

  return (
    <View style={styles.wrap}>
      <View style={styles.card}>
        <SkeletonBox width="55%" height={20} pulse={pulse} />
        <SkeletonBox width="40%" height={14} pulse={pulse} style={styles.gap} />
        <SkeletonBox width="35%" height={14} pulse={pulse} style={styles.gap} />
        <SkeletonBox width={88} height={28} borderRadius={20} pulse={pulse} style={styles.gapLg} />
      </View>

      <View style={styles.sectionBlock}>
        <SkeletonBox width="35%" height={18} pulse={pulse} />
        <View style={styles.card}>
          <SkeletonBox width="100%" height={14} pulse={pulse} />
        </View>
      </View>

      <View style={styles.sectionBlock}>
        <SkeletonBox width="40%" height={18} pulse={pulse} />
        <View style={styles.card}>
          {[0, 1, 2].map((i) => (
            <SkeletonBox key={i} width="100%" height={14} pulse={pulse} style={i > 0 ? styles.gap : undefined} />
          ))}
          <SkeletonBox width="100%" height={1} pulse={pulse} style={styles.gapLg} />
          <SkeletonBox width="70%" height={16} pulse={pulse} style={styles.gap} />
        </View>
      </View>

      <View style={styles.card}>
        <SkeletonBox width="35%" height={18} pulse={pulse} />
        <SkeletonBox width="100%" height={14} pulse={pulse} style={styles.gap} />
      </View>

      <View style={styles.timelineSection}>
        <SkeletonBox width="45%" height={18} pulse={pulse} />
        <View style={styles.timelineCard}>
          {[0, 1, 2, 3].map((i) => (
            <View key={i} style={styles.timelineStep}>
              <SkeletonBox width={26} height={26} borderRadius={13} pulse={pulse} />
              <View style={styles.timelineStepText}>
                <SkeletonBox width="55%" height={14} pulse={pulse} />
                <SkeletonBox width="40%" height={12} pulse={pulse} style={styles.gap} />
              </View>
            </View>
          ))}
        </View>
      </View>

      <SkeletonBox width="100%" height={48} borderRadius={12} pulse={pulse} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: H_PADDING,
    paddingTop: 16,
    gap: 14,
  },
  card: {
    padding: CARD_PADDING,
    backgroundColor: GatiMitraMerchant.cardBg,
    borderRadius: CARD_RADIUS,
    borderWidth: 1,
    borderColor: GatiMitraMerchant.border,
  },
  gap: { marginTop: 10 },
  gapLg: { marginTop: 14 },
  sectionBlock: { marginTop: 4 },
  timelineSection: { marginTop: 4 },
  timelineCard: {
    marginTop: 10,
    padding: 14,
    borderRadius: 12,
    backgroundColor: GatiMitraMerchant.surfaceSubtle,
    gap: 16,
  },
  timelineStep: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  timelineStepText: { flex: 1 },
});
