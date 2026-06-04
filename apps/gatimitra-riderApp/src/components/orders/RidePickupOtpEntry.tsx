import React, { useCallback, useRef, useState, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  Platform,
  Animated,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { colors } from "@/src/theme";

type Props = {
  loading?: boolean;
  resetKey?: number;
  mode?: "food" | "ride" | "delivery";
  autoSubmit?: boolean;
  onSubmit: (otp: string) => void;
};

const DIGIT_SLOTS = [0, 1, 2, 3] as const;
const AUTO_VERIFY_DELAY_MS = 0;

export function RidePickupOtpEntry({
  loading = false,
  resetKey = 0,
  mode = "ride",
  autoSubmit = true,
  onSubmit,
}: Props) {
  const { t } = useTranslation();
  const [otp, setOtp] = useState("");
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<TextInput>(null);
  const submittedRef = useRef(false);
  const rowScale = useRef(new Animated.Value(1)).current;
  const verifiedOpacity = useRef(new Animated.Value(0)).current;

  const isFood = mode === "food";
  const isDelivery = mode === "delivery";
  const isComplete = otp.length === 4;

  useEffect(() => {
    setOtp("");
    submittedRef.current = false;
    rowScale.setValue(1);
    verifiedOpacity.setValue(0);
    const timer = setTimeout(() => inputRef.current?.focus(), 320);
    return () => clearTimeout(timer);
  }, [resetKey, rowScale, verifiedOpacity]);

  useEffect(() => {
    if (!isComplete) {
      verifiedOpacity.setValue(0);
      return;
    }

    Animated.parallel([
      Animated.sequence([
        Animated.spring(rowScale, {
          toValue: 1.04,
          friction: 6,
          tension: 120,
          useNativeDriver: true,
        }),
        Animated.spring(rowScale, {
          toValue: 1,
          friction: 7,
          tension: 90,
          useNativeDriver: true,
        }),
      ]),
      Animated.timing(verifiedOpacity, {
        toValue: 1,
        duration: 220,
        useNativeDriver: true,
      }),
    ]).start();
  }, [isComplete, rowScale, verifiedOpacity]);

  useEffect(() => {
    if (!autoSubmit || !isComplete || loading || submittedRef.current) return;

    submittedRef.current = true;
    const timer = setTimeout(() => {
      onSubmit(otp);
    }, AUTO_VERIFY_DELAY_MS);

    return () => clearTimeout(timer);
  }, [autoSubmit, isComplete, loading, otp, onSubmit]);

  const handleChange = useCallback((value: string) => {
    const digits = value.replace(/\D/g, "").slice(0, 4);
    if (digits.length < 4) {
      submittedRef.current = false;
    }
    setOtp(digits);
    if (!autoSubmit && digits.length === 4) {
      onSubmit(digits);
    }
  }, [autoSubmit, onSubmit]);

  const activeIndex = Math.min(otp.length, 3);

  const verifiedLabel = loading
    ? t("orders.activeFood.otpVerifying", "Verifying…")
    : t("orders.activeFood.otpVerified", "Verified");

  return (
    <View style={styles.wrap}>
      <Text style={styles.sectionLabel}>
        {isDelivery
          ? t("orders.activeFood.deliveryOtpTitle", "Enter delivery OTP")
          : isFood
            ? t("orders.activeFood.otpEntryTitle", "Enter pickup OTP")
            : t("orders.activeRide.otpTitle", "Enter customer pickup OTP")}
      </Text>
      <Text style={styles.sectionHint}>
        {isDelivery
          ? t(
              "orders.activeFood.deliveryOtpHint",
              "Use the Delivery OTP from the customer's app — not the restaurant pickup OTP."
            )
          : isFood
            ? t(
                "orders.activeFood.otpEntryHint",
                "Enter the 4-digit code from the merchant to mark this order as picked up."
              )
            : t(
                "orders.activeRide.otpSubtitle",
                "Ask the customer for their 4-digit code to start the ride."
              )}
      </Text>

      <Pressable style={styles.digitTapArea} onPress={() => inputRef.current?.focus()}>
        <Animated.View style={[styles.digitRow, { transform: [{ scale: rowScale }] }]}>
          {DIGIT_SLOTS.map((slot) => {
            const char = otp[slot] ?? "";
            const isActive = focused && activeIndex === slot && !char && !isComplete;
            const isFilled = !!char;
            return (
              <View
                key={slot}
                style={[
                  styles.digitBox,
                  isFilled && !isComplete && styles.digitBoxFilled,
                  isActive && styles.digitBoxActive,
                  isComplete && styles.digitBoxVerified,
                ]}
              >
                {char ? (
                  <Text
                    style={[
                      styles.digitTextFilled,
                      isComplete && styles.digitTextVerified,
                    ]}
                  >
                    {char}
                  </Text>
                ) : isActive ? (
                  <View style={styles.cursor} />
                ) : null}
                {isComplete ? (
                  <View style={styles.slotCheck}>
                    <Ionicons
                      name="checkmark"
                      size={11}
                      color={colors.success[700]}
                    />
                  </View>
                ) : null}
              </View>
            );
          })}
        </Animated.View>

        <Animated.View
          style={[styles.verifiedBanner, { opacity: verifiedOpacity }]}
          pointerEvents="none"
        >
          {isComplete ? (
            <View style={styles.verifiedRow}>
              {loading ? (
                <ActivityIndicator size="small" color={colors.success[700]} />
              ) : (
                <Ionicons name="checkmark-circle" size={20} color={colors.success[600]} />
              )}
              <Text style={styles.verifiedText}>{verifiedLabel}</Text>
            </View>
          ) : null}
        </Animated.View>

        <TextInput
          ref={inputRef}
          value={otp}
          onChangeText={handleChange}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          keyboardType="number-pad"
          maxLength={4}
          editable={!loading && !isComplete}
          style={styles.hiddenInput}
          autoComplete="one-time-code"
          textContentType="oneTimeCode"
          caretHidden
          importantForAutofill="yes"
        />
      </Pressable>

      {!autoSubmit ? (
        <Pressable
          onPress={() => otp.length === 4 && onSubmit(otp)}
          disabled={loading || otp.length !== 4}
          style={({ pressed }) => [
            styles.btn,
            (loading || otp.length !== 4) && styles.btnDisabled,
            pressed && otp.length === 4 && !loading && styles.btnPressed,
          ]}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Ionicons
                name={
                  isDelivery
                    ? "checkmark-done-outline"
                    : isFood
                      ? "bag-check-outline"
                      : "play-circle-outline"
                }
                size={20}
                color="#fff"
                style={styles.btnIcon}
              />
              <Text style={styles.btnText}>
                {isDelivery
                  ? t("orders.activeFood.confirmDelivered", "Confirm delivered")
                  : isFood
                    ? t("orders.activeFood.markPickedUp", "Mark as picked up")
                    : t("orders.activeRide.verifyPickupOtp", "Verify OTP")}
              </Text>
            </>
          )}
        </Pressable>
      ) : null}

      {autoSubmit && isComplete ? (
        <View style={styles.autoVerifyHint}>
          {loading ? (
            <ActivityIndicator size="small" color={colors.success[700]} />
          ) : (
            <Ionicons name="shield-checkmark" size={16} color={colors.success[700]} />
          )}
          <Text style={styles.autoVerifyHintText}>
            {loading
              ? isDelivery
                ? t("orders.activeFood.autoVerifyingDeliveryOtp", "Confirming delivery…")
                : isFood
                  ? t(
                      "orders.activeFood.autoVerifyingPickupOtp",
                      "Confirming pickup…"
                    )
                  : t("orders.activeRide.autoVerifyingOtp", "Starting ride…")
              : isDelivery
                ? t(
                    "orders.activeFood.autoVerifyDeliveryOtp",
                    "OTP verified — completing delivery…"
                  )
                : isFood
                  ? t(
                      "orders.activeFood.autoVerifyPickupOtp",
                      "OTP verified — starting delivery…"
                    )
                  : t(
                      "orders.activeRide.autoVerifyOtp",
                      "OTP verified — starting ride…"
                    )}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: 20,
    paddingBottom: 8,
  },
  sectionLabel: {
    fontSize: 15,
    fontWeight: "800",
    color: colors.gray[900],
    marginBottom: 4,
  },
  sectionHint: {
    fontSize: 13,
    fontWeight: "500",
    color: colors.gray[500],
    lineHeight: 19,
    marginBottom: 18,
  },
  digitTapArea: {
    position: "relative",
    marginBottom: 8,
  },
  digitRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 10,
  },
  digitBox: {
    flex: 1,
    aspectRatio: 0.82,
    maxHeight: 64,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: colors.gray[200],
    backgroundColor: colors.gray[50],
    alignItems: "center",
    justifyContent: "center",
  },
  digitBoxActive: {
    borderColor: colors.primary[400],
    backgroundColor: colors.primary[50],
    ...Platform.select({
      ios: {
        shadowColor: colors.primary[500],
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.25,
        shadowRadius: 6,
      },
      android: { elevation: 2 },
    }),
  },
  digitBoxFilled: {
    borderColor: colors.primary[500],
    backgroundColor: "#ffffff",
  },
  digitBoxVerified: {
    borderColor: colors.success[500],
    backgroundColor: colors.success[50],
    ...Platform.select({
      ios: {
        shadowColor: colors.success[600],
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.35,
        shadowRadius: 8,
      },
      android: { elevation: 3 },
    }),
  },
  digitTextFilled: {
    fontSize: 26,
    fontWeight: "800",
    color: colors.gray[900],
    includeFontPadding: false,
  },
  digitTextVerified: {
    color: colors.success[800],
  },
  slotCheck: {
    position: "absolute",
    top: 5,
    right: 6,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: "#ffffff",
    alignItems: "center",
    justifyContent: "center",
  },
  cursor: {
    width: 2,
    height: 28,
    borderRadius: 1,
    backgroundColor: colors.primary[500],
  },
  verifiedBanner: {
    marginTop: 12,
    minHeight: 28,
  },
  verifiedRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 999,
    backgroundColor: colors.success[50],
    borderWidth: 1,
    borderColor: colors.success[200],
    alignSelf: "center",
  },
  verifiedText: {
    fontSize: 14,
    fontWeight: "800",
    color: colors.success[800],
  },
  hiddenInput: {
    position: "absolute",
    width: 1,
    height: 1,
    left: 0,
    top: 0,
    opacity: 0,
    color: "transparent",
  },
  btn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.primary[600],
    borderRadius: 14,
    paddingVertical: 15,
    gap: 8,
    marginTop: 8,
    ...Platform.select({
      ios: {
        shadowColor: colors.primary[700],
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.22,
        shadowRadius: 8,
      },
      android: { elevation: 4 },
    }),
  },
  btnDisabled: {
    opacity: 0.5,
    ...Platform.select({
      ios: { shadowOpacity: 0 },
      android: { elevation: 0 },
    }),
  },
  btnPressed: {
    opacity: 0.92,
    transform: [{ scale: 0.99 }],
  },
  btnIcon: {
    marginTop: 1,
  },
  btnText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "800",
  },
  autoVerifyHint: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 10,
    paddingVertical: 8,
  },
  autoVerifyHintText: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.success[800],
  },
});
