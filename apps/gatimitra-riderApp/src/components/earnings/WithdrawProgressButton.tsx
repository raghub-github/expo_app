import React from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "@/src/theme";
import { withdrawButtonState } from "@/src/lib/withdrawAmount";

type Props = {
  current: number;
  minAmount: number;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  labelReady?: string;
  /** Shown when the amount is fine but withdrawing is not allowed (frozen, over limit). */
  blockedLabel?: string;
  style?: StyleProp<ViewStyle>;
  color?: string;
};

/**
 * Withdraw CTA with three unmistakable states:
 *   ready   — solid brand teal, white label + arrow
 *   pending — light card, dark label ("Add ₹73 more · min ₹300") and a slim
 *             progress track BELOW the label (text never sits on a coloured fill)
 *   blocked — grey, muted label
 *
 * Earlier builds drew the label over a partial teal fill inside an
 * overflow:hidden + zIndex container; on Android the ready label often did not
 * render at all and the pending label was dark-on-teal. No clipping, no zIndex.
 */
export function WithdrawProgressButton({
  current,
  minAmount,
  onPress,
  disabled = false,
  loading = false,
  labelReady = "Withdraw",
  blockedLabel,
  style,
  color = colors.primary[700],
}: Props) {
  const state = withdrawButtonState({
    current,
    minAmount,
    readyLabel: labelReady,
    loading,
    disabled,
    blockedLabel,
  });
  const pressable = state.kind === "ready";
  const solid = state.kind === "ready" || state.kind === "loading";
  const textColor = solid ? "#FFFFFF" : state.kind === "pending" ? "#1E293B" : "#64748B";

  return (
    <Pressable
      onPress={onPress}
      disabled={!pressable}
      accessibilityRole="button"
      accessibilityState={{ disabled: !pressable, busy: state.kind === "loading" }}
      accessibilityLabel={state.label}
      style={style}
    >
      {({ pressed }) => (
        <View
          style={[
            styles.btn,
            solid ? [styles.btnSolid, { backgroundColor: color }] : null,
            state.kind === "pending" ? styles.btnPending : null,
            state.kind === "blocked" ? styles.btnBlocked : null,
            pressed && pressable ? styles.pressed : null,
          ]}
        >
          <View style={styles.row}>
            {state.kind === "loading" ? <ActivityIndicator color="#FFFFFF" size="small" /> : null}
            {state.kind === "pending" ? (
              <Ionicons name="lock-closed-outline" size={16} color="#475569" />
            ) : null}
            {state.kind === "blocked" ? <Ionicons name="ban-outline" size={16} color="#64748B" /> : null}
            <Text
              style={[styles.text, { color: textColor }]}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.85}
            >
              {state.label}
            </Text>
            {state.kind === "ready" ? (
              <Ionicons name="arrow-forward-circle" size={22} color="#FFFFFF" />
            ) : null}
          </View>
          {state.kind === "pending" ? (
            <View style={styles.track}>
              <View
                style={[
                  styles.trackFill,
                  { width: `${Math.max(4, Math.round(state.progress * 100))}%`, backgroundColor: color },
                ]}
              />
            </View>
          ) : null}
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    minHeight: 54,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  btnSolid: {
    ...Platform.select({
      ios: {
        shadowColor: "#0F766E",
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.28,
        shadowRadius: 10,
      },
      android: { elevation: 4 },
      default: {},
    }),
  },
  btnPending: {
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#CBD5E1",
    paddingBottom: 18,
  },
  btnBlocked: {
    backgroundColor: "#E2E8F0",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    maxWidth: "100%",
  },
  text: {
    fontSize: 16,
    fontWeight: "800",
    letterSpacing: 0.2,
    flexShrink: 1,
    includeFontPadding: false,
    textAlign: "center",
  },
  track: {
    position: "absolute",
    left: 16,
    right: 16,
    bottom: 8,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#E2E8F0",
  },
  trackFill: {
    height: 4,
    borderRadius: 2,
  },
  pressed: {
    opacity: 0.9,
    transform: [{ scale: 0.99 }],
  },
});
