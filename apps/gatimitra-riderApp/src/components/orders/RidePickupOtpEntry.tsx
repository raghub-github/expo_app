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
import { OtpNumericKeypad } from "@/src/components/orders/OtpNumericKeypad";
import { colors } from "@/src/theme";

type Props = {
  loading?: boolean;
  error?: string | null;
  resetKey?: number;
  mode?: "food" | "ride" | "delivery";
  autoSubmit?: boolean;
  /** System keyboard vs in-sheet numeric keypad. */
  inputMode?: "system" | "keypad";
  /** Bottom-sheet layout with keypad docked below OTP boxes. */
  layout?: "default" | "ride-sheet";
  /** Boxed digits (default) vs underline slots (CIBIL-style sheet). */
  pinStyle?: "boxes" | "underline";
  /** Sheet header already shows title/hint — omit duplicate copy. */
  hideSectionCopy?: boolean;
  onSubmit: (otp: string) => void;
  onErrorClear?: () => void;
  onOtpChange?: (otp: string) => void;
};

const DIGIT_SLOTS = [0, 1, 2, 3] as const;

export function RidePickupOtpEntry({
  loading = false,
  error = null,
  resetKey = 0,
  mode = "ride",
  autoSubmit = true,
  inputMode = "system",
  layout = "default",
  pinStyle = "boxes",
  hideSectionCopy = false,
  onSubmit,
  onErrorClear,
  onOtpChange,
}: Props) {
  const { t } = useTranslation();
  const [otp, setOtp] = useState("");
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<TextInput>(null);
  const submittedRef = useRef(false);
  const lastSubmittedOtpRef = useRef<string | null>(null);
  const lastHandledErrorRef = useRef<string | null>(null);
  const rowScale = useRef(new Animated.Value(1)).current;
  const statusOpacity = useRef(new Animated.Value(0)).current;

  const usesKeypad = inputMode === "keypad";
  const isRideSheet = layout === "ride-sheet";
  const isUnderline = pinStyle === "underline";
  const isFood = mode === "food";
  const isDelivery = mode === "delivery";
  const isComplete = otp.length === 4;
  const isInvalid = !!error?.trim();
  const isVerifying = loading && isComplete;

  const resetOtpState = useCallback(() => {
    setOtp("");
    onOtpChange?.("");
    submittedRef.current = false;
    lastSubmittedOtpRef.current = null;
    lastHandledErrorRef.current = null;
    rowScale.setValue(1);
    statusOpacity.setValue(0);
  }, [onOtpChange, rowScale, statusOpacity]);

  const tryAutoSubmit = useCallback(
    (code: string) => {
      if (!autoSubmit || code.length !== 4 || loading) return;
      if (code === lastSubmittedOtpRef.current) return;
      submittedRef.current = true;
      lastSubmittedOtpRef.current = code;
      onSubmit(code);
    },
    [autoSubmit, loading, onSubmit]
  );

  useEffect(() => {
    resetOtpState();
    if (usesKeypad) return;
    const timer = setTimeout(() => inputRef.current?.focus(), 280);
    return () => clearTimeout(timer);
  }, [resetKey, resetOtpState, usesKeypad]);

  useEffect(() => {
    const err = error?.trim() || null;
    if (!err) {
      lastHandledErrorRef.current = null;
      return;
    }
    if (lastHandledErrorRef.current === err) return;
    lastHandledErrorRef.current = err;
    setOtp("");
    onOtpChange?.("");
    submittedRef.current = false;
    lastSubmittedOtpRef.current = null;
    if (usesKeypad) return;
    const focusTimer = setTimeout(() => inputRef.current?.focus(), 80);
    return () => clearTimeout(focusTimer);
  }, [error, onOtpChange, usesKeypad]);

  useEffect(() => {
    if (!isInvalid) return;
    rowScale.setValue(1);
    Animated.sequence([
      Animated.timing(rowScale, {
        toValue: 1.03,
        duration: 70,
        useNativeDriver: true,
      }),
      Animated.timing(rowScale, {
        toValue: 0.98,
        duration: 70,
        useNativeDriver: true,
      }),
      Animated.spring(rowScale, {
        toValue: 1,
        friction: 7,
        tension: 120,
        useNativeDriver: true,
      }),
    ]).start();
  }, [isInvalid, resetKey, rowScale]);

  useEffect(() => {
    if (!isVerifying && !isInvalid) {
      statusOpacity.setValue(0);
      return;
    }

    Animated.timing(statusOpacity, {
      toValue: 1,
      duration: 180,
      useNativeDriver: true,
    }).start();
  }, [isVerifying, isInvalid, statusOpacity]);

  useEffect(() => {
    if (!autoSubmit || !isComplete || loading) return;
    tryAutoSubmit(otp);
  }, [autoSubmit, isComplete, loading, otp, tryAutoSubmit]);

  const applyOtp = useCallback(
    (digits: string) => {
      const next = digits.replace(/\D/g, "").slice(0, 4);
      if (next !== lastSubmittedOtpRef.current) {
        submittedRef.current = false;
      }
      if (error?.trim()) {
        onErrorClear?.();
      }
      setOtp(next);
      onOtpChange?.(next);
      tryAutoSubmit(next);
    },
    [error, onErrorClear, onOtpChange, tryAutoSubmit]
  );

  const handleChange = useCallback(
    (value: string) => {
      applyOtp(value);
    },
    [applyOtp]
  );

  const handleDigitPress = useCallback(
    (digit: string) => {
      if (loading || otp.length >= 4) return;
      applyOtp(`${otp}${digit}`);
    },
    [applyOtp, loading, otp]
  );

  const handleBackspace = useCallback(() => {
    if (loading || otp.length === 0) return;
    applyOtp(otp.slice(0, -1));
  }, [applyOtp, loading, otp]);

  const focusInput = useCallback(() => {
    if (loading || usesKeypad) return;
    inputRef.current?.focus();
  }, [loading, usesKeypad]);

  const activeIndex = usesKeypad
    ? Math.min(otp.length, 3)
    : Math.min(otp.length, 3);
  const showActiveSlot = usesKeypad ? !isVerifying : focused && !isVerifying;

  const invalidMessage =
    error?.trim() ||
    (isDelivery
      ? t(
          "orders.activeFood.deliveryOtpInvalidMessage",
          "The delivery OTP did not match. Please try again."
        )
      : isFood
        ? t(
            "orders.activeFood.pickupOtpInvalidMessage",
            "The pickup OTP did not match. Please try again."
          )
        : t("orders.activeRide.otpInvalidMessage", "The pickup OTP did not match. Please try again."));

  const digitBoxes = (
    <View
      style={[
        styles.digitTapArea,
        isRideSheet && styles.digitTapAreaSheet,
        isUnderline && styles.digitTapAreaUnderline,
      ]}
    >
      <Animated.View
        style={[
          styles.digitRow,
          isUnderline && styles.digitRowUnderline,
          { transform: [{ scale: rowScale }] },
        ]}
        pointerEvents="none"
      >
        {DIGIT_SLOTS.map((slot) => {
          const char = otp[slot] ?? "";
          const isActive = showActiveSlot && activeIndex === slot && !char && !isVerifying;
          const isFilled = !!char;

          if (isUnderline) {
            return (
              <View key={slot} style={styles.underlineSlot}>
                <View style={styles.underlineCharWrap}>
                  {char ? (
                    <Text
                      style={[
                        styles.underlineDigit,
                        isInvalid && styles.digitTextInvalid,
                      ]}
                    >
                      {char}
                    </Text>
                  ) : isActive ? (
                    <View style={styles.underlineCursor} />
                  ) : (
                    <Text style={styles.underlinePlaceholder}>-</Text>
                  )}
                </View>
                <View
                  style={[
                    styles.underlineBar,
                    isActive && styles.underlineBarActive,
                    isFilled && !isInvalid && styles.underlineBarFilled,
                    isInvalid && styles.underlineBarInvalid,
                  ]}
                />
              </View>
            );
          }

          return (
            <View
              key={slot}
              style={[
                styles.digitBox,
                isRideSheet && styles.digitBoxSheet,
                isInvalid && styles.digitBoxInvalid,
                !isInvalid && isVerifying && styles.digitBoxVerifying,
                !isInvalid && !isVerifying && isFilled && styles.digitBoxFilled,
                !isInvalid && !isVerifying && isActive && styles.digitBoxActive,
              ]}
            >
              {char ? (
                <Text style={[styles.digitTextFilled, isInvalid && styles.digitTextInvalid]}>
                  {char}
                </Text>
              ) : isActive ? (
                <View style={styles.cursor} />
              ) : isInvalid ? (
                <Ionicons name="close" size={14} color={colors.error[400]} />
              ) : null}
            </View>
          );
        })}
      </Animated.View>

      {!isUnderline ? (
        <Animated.View
          style={[styles.statusBanner, { opacity: statusOpacity }]}
          pointerEvents="none"
        >
          {isInvalid ? (
            <View style={styles.invalidRow}>
              <Ionicons name="alert-circle" size={18} color={colors.error[600]} />
              <Text style={styles.invalidText}>{invalidMessage}</Text>
            </View>
          ) : isVerifying ? (
            <View style={styles.verifyingRow}>
              <ActivityIndicator size="small" color={colors.primary[700]} />
              <Text style={styles.verifyingText}>
                {t("orders.activeFood.otpVerifying", "Verifying…")}
              </Text>
            </View>
          ) : null}
        </Animated.View>
      ) : isInvalid || isVerifying ? (
        <View style={styles.underlineStatus}>
          {isInvalid ? (
            <Text style={styles.underlineStatusError}>{invalidMessage}</Text>
          ) : (
            <View style={styles.verifyingRow}>
              <ActivityIndicator size="small" color={colors.gray[600]} />
              <Text style={styles.underlineStatusVerifying}>
                {t("orders.activeFood.otpVerifying", "Verifying…")}
              </Text>
            </View>
          )}
        </View>
      ) : null}

      {usesKeypad ? null : (
        <TextInput
          ref={inputRef}
          value={otp}
          onChangeText={handleChange}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onPressIn={focusInput}
          keyboardType="number-pad"
          maxLength={4}
          editable={!loading}
          showSoftInputOnFocus
          blurOnSubmit={false}
          style={styles.overlayInput}
          pointerEvents={loading ? "none" : "auto"}
          autoComplete="one-time-code"
          textContentType="oneTimeCode"
          caretHidden
          importantForAutofill="yes"
        />
      )}
    </View>
  );

  const footerHints = (
    <>
      {autoSubmit && isVerifying ? (
        <View style={styles.autoVerifyHint}>
          <ActivityIndicator size="small" color={colors.primary[700]} />
          <Text style={styles.autoVerifyHintText}>
            {isDelivery
              ? t("orders.activeFood.autoVerifyingDeliveryOtp", "Confirming delivery…")
              : isFood
                ? t("orders.activeFood.autoVerifyingPickupOtp", "Confirming pickup…")
                : t("orders.activeRide.autoVerifyingOtp", "Verifying pickup OTP…")}
          </Text>
        </View>
      ) : null}

      {autoSubmit && isInvalid ? (
        <Text style={styles.reenterHint}>
          {t("orders.activeRide.otpReenterHint", "Re-enter the correct 4-digit OTP.")}
        </Text>
      ) : null}
    </>
  );

  const keypadBlock =
    usesKeypad ? (
      <OtpNumericKeypad
        onDigit={handleDigitPress}
        onBackspace={handleBackspace}
        disabled={loading}
      />
    ) : null;

  if (isRideSheet) {
    return (
      <View style={styles.sheetRoot}>
        <View style={styles.sheetDigits}>
          {digitBoxes}
          {footerHints}
        </View>
        {keypadBlock}
      </View>
    );
  }

  return (
    <View
      style={[
        styles.wrap,
        usesKeypad && styles.wrapKeypad,
        isUnderline && styles.wrapUnderline,
      ]}
    >
      {hideSectionCopy ? null : (
        <>
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
        </>
      )}

      {digitBoxes}
      {keypadBlock}

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

      {isUnderline ? null : footerHints}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: 20,
    paddingBottom: 8,
  },
  wrapKeypad: {
    paddingHorizontal: 12,
    paddingBottom: 4,
  },
  wrapUnderline: {
    paddingHorizontal: 0,
    paddingBottom: 0,
    paddingTop: 0,
  },
  sheetRoot: {
    width: "100%",
  },
  sheetDigits: {
    backgroundColor: "#ffffff",
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
  },
  digitTapAreaSheet: {
    marginBottom: 4,
  },
  digitTapAreaUnderline: {
    minHeight: 40,
    marginBottom: 0,
  },
  digitRowUnderline: {
    gap: 8,
    justifyContent: "space-between",
    paddingHorizontal: 0,
  },
  underlineSlot: {
    flex: 1,
    height: 40,
    alignItems: "center",
    justifyContent: "flex-end",
    paddingBottom: 6,
  },
  underlineCharWrap: {
    minHeight: 26,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 0,
  },
  underlineDigit: {
    fontSize: 22,
    fontWeight: "700",
    color: "#0F172A",
    includeFontPadding: false,
    textAlign: "center",
  },
  underlinePlaceholder: {
    fontSize: 20,
    fontWeight: "400",
    color: "#94A3B8",
    includeFontPadding: false,
    lineHeight: 24,
  },
  underlineCursor: {
    width: 2,
    height: 20,
    backgroundColor: "#0F172A",
    borderRadius: 1,
  },
  underlineBar: {
    width: "100%",
    height: 1.5,
    backgroundColor: "#94A3B8",
    borderRadius: 1,
  },
  underlineBarActive: {
    height: 1.5,
    backgroundColor: "#3EB489",
  },
  underlineBarFilled: {
    backgroundColor: "#64748B",
  },
  underlineBarInvalid: {
    backgroundColor: colors.error[500],
  },
  underlineStatus: {
    marginTop: 10,
    minHeight: 18,
  },
  underlineStatusError: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.error[600],
    textAlign: "left",
  },
  underlineStatusVerifying: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.gray[600],
  },
  digitBoxSheet: {
    maxHeight: 58,
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
    minHeight: 72,
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
  digitBoxVerifying: {
    borderColor: colors.primary[500],
    backgroundColor: colors.primary[50],
  },
  digitBoxInvalid: {
    borderColor: colors.error[500],
    backgroundColor: colors.error[50],
    ...Platform.select({
      ios: {
        shadowColor: colors.error[500],
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.2,
        shadowRadius: 6,
      },
      android: { elevation: 2 },
    }),
  },
  digitTextFilled: {
    fontSize: 26,
    fontWeight: "800",
    color: colors.gray[900],
    includeFontPadding: false,
  },
  digitTextInvalid: {
    color: colors.error[700],
  },
  cursor: {
    width: 2,
    height: 28,
    borderRadius: 1,
    backgroundColor: colors.primary[500],
  },
  statusBanner: {
    marginTop: 12,
    minHeight: 28,
  },
  invalidRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: colors.error[50],
    borderWidth: 1,
    borderColor: colors.error[200],
    alignSelf: "stretch",
  },
  invalidText: {
    flex: 1,
    fontSize: 13,
    fontWeight: "700",
    color: colors.error[700],
    lineHeight: 18,
  },
  verifyingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 999,
    backgroundColor: colors.primary[50],
    borderWidth: 1,
    borderColor: colors.primary[200],
    alignSelf: "center",
  },
  verifyingText: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.primary[800],
  },
  overlayInput: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.02,
    color: "transparent",
    fontSize: 16,
    zIndex: 2,
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
    color: colors.primary[800],
  },
  reenterHint: {
    marginTop: 8,
    fontSize: 12,
    fontWeight: "600",
    color: colors.error[600],
    textAlign: "center",
  },
});
