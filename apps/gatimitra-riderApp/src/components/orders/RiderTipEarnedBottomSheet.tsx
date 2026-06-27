import React, { useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Pressable,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import Svg, { Path } from "react-native-svg";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { useTranslation } from "react-i18next";
import { colors } from "@/src/theme/colors";

const H_PADDING = 20;
const CARD_RADIUS = 18;
const BADGE_W = 228;
const BADGE_H = 44;
const BADGE_STROKE = 4;
const BADGE_OVERLAP = BADGE_H * 0.2;

function buildPillOutlinePath(w: number, h: number, inset: number): string {
  const x = inset;
  const y = inset;
  const iw = w - inset * 2;
  const ih = h - inset * 2;
  const r = ih / 2;
  if (iw < ih) return "";
  const topCx = x + iw / 2;
  return [
    `M ${topCx} ${y}`,
    `L ${x + iw - r} ${y}`,
    `A ${r} ${r} 0 0 1 ${x + iw} ${y + r}`,
    `V ${y + ih - r}`,
    `A ${r} ${r} 0 0 1 ${x + iw - r} ${y + ih}`,
    `H ${x + r}`,
    `A ${r} ${r} 0 0 1 ${x} ${y + ih - r}`,
    `V ${y + r}`,
    `A ${r} ${r} 0 0 1 ${x + r} ${y}`,
    `H ${topCx}`,
    "Z",
  ].join(" ");
}

function TipEarnedBadgePill({ label }: { label: string }) {
  const pulse = useSharedValue(1);
  const entryScale = useSharedValue(0.92);

  useEffect(() => {
    entryScale.value = withSpring(1, { damping: 14, stiffness: 200 });
    pulse.value = withRepeat(
      withSequence(
        withTiming(1.03, { duration: 900, easing: Easing.inOut(Easing.ease) }),
        withTiming(1, { duration: 900, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      false
    );
  }, [entryScale, pulse]);

  const shellStyle = useAnimatedStyle(() => ({
    transform: [{ scale: entryScale.value * pulse.value }],
  }));

  const inset = BADGE_STROKE / 2;
  const pathD = buildPillOutlinePath(BADGE_W, BADGE_H, inset);

  return (
    <Animated.View style={[styles.badgeFuseShell, shellStyle]}>
      <Svg width={BADGE_W} height={BADGE_H} style={styles.badgeFuseSvg}>
        <Path
          d={pathD}
          stroke="rgba(21, 128, 61, 0.22)"
          strokeWidth={BADGE_STROKE}
          fill="#FFFFFF"
        />
        <Path
          d={pathD}
          stroke={colors.success[700]}
          strokeWidth={BADGE_STROKE}
          fill="none"
          strokeLinecap="round"
        />
      </Svg>
      <View style={styles.badgePillCenter} pointerEvents="none">
        <Text style={styles.badgeText} numberOfLines={1}>
          {label}
        </Text>
      </View>
    </Animated.View>
  );
}

function formatTipAmount(amount: number): string {
  const n = Math.round(amount);
  return `₹${n.toLocaleString("en-IN")}`;
}

type Props = {
  visible: boolean;
  tipAmount: number;
  orderIdLabel?: string | null;
  customerName?: string | null;
  onDismiss: () => void;
};

export function RiderTipEarnedBottomSheet({
  visible,
  tipAmount,
  orderIdLabel,
  customerName,
  onDismiss,
}: Props) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const bottomPad = Math.max(insets.bottom, Platform.OS === "android" ? 12 : 8);

  if (!visible || tipAmount <= 0) return null;

  const badgeLabel = t("orders.tipEarned.badge", "You've Earned a Tip!");
  const tagline = t("orders.tipEarned.tagline", "Your Service Made Someone Smile!");
  const messageLead = t("orders.tipEarned.messageLead", "Good news!");
  const messageMid = t(
    "orders.tipEarned.messageMid",
    "appreciated your service with a"
  );
  const messageSuffix = t("orders.tipEarned.messageSuffix", "tip.");
  const footer = t("orders.tipEarned.footer", "Keep delivering excellence.");
  const orderIdCaption = t("orders.tipEarned.orderId", "Order ID");
  const tipLabel = formatTipAmount(tipAmount);
  const displayCustomerName =
    customerName?.trim() ||
    t("orders.tipEarned.customerFallback", "Customer");
  const displayOrderId = orderIdLabel?.trim() || null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      statusBarTranslucent
      presentationStyle="overFullScreen"
      onRequestClose={onDismiss}
    >
      <View style={styles.overlay}>
        <Pressable style={styles.dismissArea} onPress={onDismiss} accessibilityRole="button" />

        <View style={styles.sheetStack}>
          <View style={styles.sheetOverlapHeader} pointerEvents="box-none">
            <TipEarnedBadgePill label={badgeLabel} />
          </View>

          <View style={[styles.sheet, { paddingBottom: bottomPad }]}>
            <View style={styles.sheetTopCap} pointerEvents="none" />

            <View style={styles.body}>
              {displayOrderId ? (
                <View style={styles.orderIdChip}>
                  <Text style={styles.orderIdCaption}>{orderIdCaption}</Text>
                  <Text style={styles.orderIdValue} numberOfLines={1}>
                    {displayOrderId}
                  </Text>
                </View>
              ) : null}

              <View style={styles.iconRing}>
                <Ionicons name="heart" size={30} color={colors.success[600]} />
              </View>

              <Text style={styles.tagline}>{tagline}</Text>
              <Text style={styles.message}>
                {messageLead}{" "}
                <Text style={styles.customerName}>{displayCustomerName}</Text> {messageMid}{" "}
                <Text style={styles.messageAmount}>{tipLabel}</Text> {messageSuffix}
              </Text>

              <View style={styles.tipAmountWrap}>
                <Text style={styles.tipAmount}>{tipLabel}</Text>
              </View>

              <Text style={styles.footer}>{footer}</Text>
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.52)",
    justifyContent: "flex-end",
    margin: 0,
    padding: 0,
  },
  dismissArea: {
    ...StyleSheet.absoluteFillObject,
  },
  sheetStack: {
    position: "relative",
    width: "100%",
    alignSelf: "stretch",
    marginBottom: 0,
    paddingBottom: 0,
    overflow: "visible",
    zIndex: 2,
  },
  sheetOverlapHeader: {
    position: "relative",
    alignSelf: "stretch",
    width: "100%",
    height: BADGE_H,
    marginBottom: -BADGE_OVERLAP,
    zIndex: 30,
    alignItems: "center",
    justifyContent: "flex-start",
    overflow: "visible",
    ...Platform.select({
      android: { elevation: 16 },
      default: {},
    }),
  },
  badgeFuseShell: {
    width: BADGE_W,
    height: BADGE_H,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.08,
        shadowRadius: 4,
      },
      android: { elevation: 4 },
      default: {},
    }),
  },
  badgeFuseSvg: {
    position: "absolute",
    top: 0,
    left: 0,
  },
  badgePillCenter: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  badgeText: {
    fontSize: 15,
    fontWeight: "800",
    color: colors.gray[900],
    letterSpacing: 0.1,
    textAlign: "center",
  },
  sheet: {
    width: "100%",
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: CARD_RADIUS + 6,
    borderTopRightRadius: CARD_RADIUS + 6,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    paddingTop: BADGE_OVERLAP + 8,
  },
  sheetTopCap: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: BADGE_OVERLAP + 10,
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: CARD_RADIUS + 6,
    borderTopRightRadius: CARD_RADIUS + 6,
    zIndex: 1,
  },
  body: {
    paddingHorizontal: H_PADDING,
    paddingTop: 4,
    paddingBottom: 8,
    alignItems: "center",
  },
  orderIdChip: {
    alignSelf: "flex-end",
    alignItems: "flex-end",
    maxWidth: "72%",
    backgroundColor: colors.gray[50],
    borderWidth: 1,
    borderColor: colors.gray[200],
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginBottom: 8,
  },
  orderIdCaption: {
    fontSize: 10,
    fontWeight: "700",
    color: colors.gray[500],
    letterSpacing: 0.4,
    textTransform: "uppercase",
    includeFontPadding: false,
  },
  orderIdValue: {
    marginTop: 2,
    fontSize: 13,
    fontWeight: "800",
    color: colors.gray[900],
    includeFontPadding: false,
  },
  tipAmountWrap: {
    width: "100%",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.success[50],
    borderWidth: 1.5,
    borderColor: colors.success[200],
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 20,
    marginBottom: 10,
  },
  tipAmount: {
    fontSize: 40,
    fontWeight: "900",
    color: colors.success[700],
    letterSpacing: -0.5,
    includeFontPadding: false,
  },
  iconRing: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.success[50],
    borderWidth: 2,
    borderColor: colors.success[200],
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
  },
  tagline: {
    fontSize: 19,
    fontWeight: "800",
    color: colors.gray[900],
    textAlign: "center",
    marginBottom: 8,
  },
  message: {
    fontSize: 15,
    lineHeight: 22,
    fontWeight: "500",
    color: colors.gray[600],
    textAlign: "center",
    marginBottom: 12,
  },
  messageAmount: {
    fontSize: 15,
    lineHeight: 22,
    fontWeight: "800",
    color: colors.success[700],
  },
  customerName: {
    fontSize: 15,
    lineHeight: 22,
    fontWeight: "800",
    color: colors.gray[900],
  },
  footer: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.success[700],
    textAlign: "center",
    marginBottom: 0,
  },
});
