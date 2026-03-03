/**
 * Recent order card: amount top-right, status bottom-right, order ID bold.
 * Tap → scale 0.98 + shadow; swipe to remove from list.
 */

import { useRef, useState } from "react";
import { View, Text, StyleSheet, Animated, PanResponder, Dimensions, Platform } from "react-native";
import {
  GatiMitraMerchant,
  CARD_RADIUS,
  CARD_PADDING,
  FONT_LABEL,
  FONT_SECONDARY,
} from "@/constants/theme";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const SWIPE_THRESHOLD = 60;
const ANIM_DURATION = 200;

const STATUS_STYLES = {
  Pending: { bg: GatiMitraMerchant.statusPendingBg, color: GatiMitraMerchant.statusPending },
  Preparing: { bg: GatiMitraMerchant.statusPreparingBg, color: GatiMitraMerchant.statusPreparing },
  Completed: { bg: GatiMitraMerchant.statusCompletedBg, color: GatiMitraMerchant.statusCompleted },
} as const;

function StatusPill({ status }: { status: "Preparing" | "Pending" | "Completed" }) {
  const { bg, color } = STATUS_STYLES[status];
  return (
    <View style={[styles.statusPill, { backgroundColor: bg }]}>
      <Text style={[styles.statusPillText, { color }]}>{status}</Text>
    </View>
  );
}

export function SwipeableOrderCard({
  id,
  items,
  amount,
  status,
  time,
  onPress,
  onDismiss,
}: {
  id: string;
  items: string;
  amount: string;
  status: "Preparing" | "Pending" | "Completed";
  time: string;
  onPress: () => void;
  onDismiss: () => void;
}) {
  const translateX = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(1)).current;
  const [pressed, setPressed] = useState(false);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, gestureState) => Math.abs(gestureState.dx) > 15,
      onPanResponderGrant: () => {
        setPressed(true);
        Animated.spring(scale, { toValue: 0.98, useNativeDriver: true, speed: 100, bounciness: 0 }).start();
      },
      onPanResponderMove: (_, gestureState) => {
        translateX.setValue(gestureState.dx);
      },
      onPanResponderRelease: (_, gestureState) => {
        setPressed(false);
        Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 100, bounciness: 0 }).start();
        const { dx, dy } = gestureState;
        if (Math.abs(dx) > SWIPE_THRESHOLD) {
          const dir = dx > 0 ? 1 : -1;
          Animated.timing(translateX, {
            toValue: dir * SCREEN_WIDTH,
            duration: ANIM_DURATION,
            useNativeDriver: true,
          }).start(() => onDismiss());
        } else {
          Animated.spring(translateX, { toValue: 0, useNativeDriver: true, friction: 8 }).start();
          if (Math.abs(dx) < 15 && Math.abs(dy) < 15) onPress();
        }
      },
    })
  ).current;

  return (
    <Animated.View
      style={[
        styles.wrap,
        {
          transform: [{ translateX }, { scale }],
        },
      ]}
      {...panResponder.panHandlers}
    >
      <View style={[styles.card, GatiMitraMerchant.cursorPointer, pressed && styles.cardPressed]}>
        {/* Row 1: Order ID (left) | Amount (right) */}
        <View style={styles.row1}>
          <Text style={styles.orderId} numberOfLines={1}>{id}</Text>
          <Text style={styles.orderAmount}>{amount}</Text>
        </View>
        <Text style={styles.orderItems} numberOfLines={2}>{items}</Text>
        {/* Row 2: Time (left) | Status badge (right) */}
        <View style={styles.row2}>
          <Text style={styles.orderTime}>{time}</Text>
          <StatusPill status={status} />
        </View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: 12 },
  card: {
    backgroundColor: GatiMitraMerchant.cardBg,
    borderRadius: CARD_RADIUS,
    padding: CARD_PADDING,
    borderWidth: 1,
    borderColor: GatiMitraMerchant.border,
    ...GatiMitraMerchant.shadowSm,
  },
  cardPressed: {
    ...Platform.select({
      ios: {
        shadowColor: "#0F172A",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.08,
        shadowRadius: 6,
      },
      android: { elevation: 3 },
    }),
  },
  row1: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  orderId: {
    fontSize: FONT_LABEL,
    fontWeight: "700",
    color: GatiMitraMerchant.textPrimary,
    flex: 1,
    marginRight: 8,
  },
  orderAmount: {
    fontSize: FONT_LABEL + 2,
    fontWeight: "700",
    color: GatiMitraMerchant.textPrimary,
  },
  orderItems: {
    fontSize: FONT_SECONDARY,
    color: GatiMitraMerchant.textSecondary,
    marginBottom: 8,
    lineHeight: 18,
  },
  row2: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  orderTime: {
    fontSize: FONT_SECONDARY,
    color: GatiMitraMerchant.textTertiary,
  },
  statusPill: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 20,
  },
  statusPillText: {
    fontSize: 12,
    fontWeight: "600",
  },
});
