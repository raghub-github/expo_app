import React, { useCallback, useEffect, useRef, type ReactNode } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  Modal,
  StyleSheet,
  ActivityIndicator,
  Platform,
  useWindowDimensions,
  InteractionManager,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { OtpSheetWaveCut, OTP_WAVE_H, OTP_WAVE_LOW_Y } from "./OtpSheetWaveCut";
import { useOtpKeyboardLift } from "./useOtpKeyboardLift";

export type OtpVerifySheetTheme = {
  primary: string;
  primaryDark: string;
  textPrimary: string;
  textSecondary: string;
  textTertiary: string;
  error: string;
  titleFontFamily?: string;
  bodyFontFamily?: string;
  digitFontFamily?: string;
};

export type OtpVerifySheetModalProps = {
  visible: boolean;
  title: string;
  subtitle: string;
  otpLength?: 4 | 6;
  value: string;
  onChange: (next: string) => void;
  /** Called with the completed OTP string when verifying. */
  onVerify: (code: string) => void;
  onCancel: () => void;
  loading?: boolean;
  error?: string | null;
  verifyLabel?: string;
  cancelLabel?: string;
  /** When false, user must tap Verify (pickup/delivery handoff). Default true for login. */
  autoSubmitOnComplete?: boolean;
  dismissOnBackdropPress?: boolean;
  theme: OtpVerifySheetTheme;
  /** Optional block above OTP boxes (e.g. delivery photo). */
  prependContent?: ReactNode;
  /** Login-only resend row */
  resendSlot?: ReactNode;
  /** Hide primary verify CTA — auto-submit on last digit (rider pickup/delivery). */
  hideVerifyButton?: boolean;
  /** Hide cancel — rider pickup/delivery sheets. */
  hideCancelButton?: boolean;
  /** Sit sheet bottom flush on keyboard (no extra gap). */
  dockToKeyboard?: boolean;
  /** Disable verify button even when OTP complete */
  verifyDisabled?: boolean;
};

export function OtpVerifySheetModal({
  visible,
  title,
  subtitle,
  otpLength = 4,
  value,
  onChange,
  onVerify,
  onCancel,
  loading = false,
  error = null,
  verifyLabel = "Verify OTP",
  cancelLabel = "Cancel",
  autoSubmitOnComplete = false,
  dismissOnBackdropPress = true,
  theme,
  prependContent,
  resendSlot,
  verifyDisabled = false,
  hideVerifyButton = false,
  hideCancelButton = false,
  dockToKeyboard = false,
}: OtpVerifySheetModalProps) {
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const inputRef = useRef<TextInput>(null);
  const [focused, setFocused] = React.useState(false);
  const keyboardLift = useOtpKeyboardLift(visible, dockToKeyboard ? 0 : undefined);
  const autoSubmittedRef = useRef("");
  const keyboardUp = keyboardLift > 0;
  const showActions = !hideVerifyButton || !hideCancelButton;

  const otpReady = value.length === otpLength;
  const titleFont = theme.titleFontFamily;
  const bodyFont = theme.bodyFontFamily ?? theme.titleFontFamily;
  const digitFont = theme.digitFontFamily ?? theme.bodyFontFamily;

  const focusInput = useCallback(() => {
    if (loading) return;
    inputRef.current?.focus();
    if (Platform.OS === "android") {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [loading]);

  useEffect(() => {
    if (!visible) {
      autoSubmittedRef.current = "";
      return;
    }
    let cancelled = false;
    const run = () => {
      if (!cancelled) focusInput();
    };
    run();
    const t1 = setTimeout(run, 80);
    const t2 = setTimeout(run, 220);
    const task = InteractionManager.runAfterInteractions(run);
    return () => {
      cancelled = true;
      clearTimeout(t1);
      clearTimeout(t2);
      void task;
    };
  }, [visible, focusInput]);

  useEffect(() => {
    if (error?.trim()) {
      autoSubmittedRef.current = "";
    }
  }, [error]);

  useEffect(() => {
    if (!visible || !autoSubmitOnComplete || !otpReady || loading || verifyDisabled) {
      if (!otpReady) autoSubmittedRef.current = "";
      return;
    }
    if (autoSubmittedRef.current === value) return;
    autoSubmittedRef.current = value;
    onVerify(value);
  }, [visible, autoSubmitOnComplete, otpReady, loading, verifyDisabled, value, onVerify]);

  const sheetBottomPad = dockToKeyboard && keyboardUp ? 10 : Math.max(insets.bottom, 12);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onCancel}
      statusBarTranslucent
    >
      <View style={styles.modalRoot}>
        <Pressable
          style={styles.dim}
          onPress={dismissOnBackdropPress ? onCancel : undefined}
          accessibilityLabel="Dismiss"
        />
        <View
          style={[
            styles.sheetWrap,
            dockToKeyboard
              ? { position: "absolute", left: 0, right: 0, bottom: keyboardLift }
              : { marginBottom: keyboardLift },
          ]}
        >
          <View style={styles.sheetOuter} pointerEvents="box-none">
            <OtpSheetWaveCut width={windowWidth} />
            <Pressable
              style={[
                styles.sheetBody,
                { paddingBottom: sheetBottomPad },
                dockToKeyboard && keyboardUp && styles.sheetBodyDocked,
              ]}
              onPress={focusInput}
            >
              <Text style={[styles.title, titleFont ? { fontFamily: titleFont } : null]}>{title}</Text>
              <Text style={[styles.subtitle, bodyFont ? { fontFamily: bodyFont } : null]}>{subtitle}</Text>

              {prependContent ? <View style={styles.prepend}>{prependContent}</View> : null}

              <Pressable
                style={styles.boxesRow}
                onPress={focusInput}
                accessibilityLabel={`One-time code, ${otpLength} digits`}
              >
                {Array.from({ length: otpLength }).map((_, index) => {
                  const digit = value[index] ?? "";
                  const active = focused && index === Math.min(value.length, otpLength - 1);
                  return (
                    <View key={index} style={styles.box}>
                      <Text
                        style={[
                          styles.digit,
                          digit ? styles.digitFilled : styles.digitEmpty,
                          digitFont ? { fontFamily: digitFont } : null,
                          { color: theme.textPrimary },
                        ]}
                      >
                        {digit || (active ? "" : "-")}
                      </Text>
                      <View
                        style={[
                          styles.underline,
                          active && { backgroundColor: theme.primary },
                        ]}
                      />
                      {active && !digit ? <View style={styles.caret} /> : null}
                    </View>
                  );
                })}
                <TextInput
                  ref={inputRef}
                  style={styles.hiddenInput}
                  value={value}
                  onChangeText={(t) => onChange(t.replace(/\D/g, "").slice(0, otpLength))}
                  onFocus={() => setFocused(true)}
                  onBlur={() => {
                    setFocused(false);
                    if (value.length >= otpLength || loading) return;
                    requestAnimationFrame(() => inputRef.current?.focus());
                  }}
                  keyboardType="number-pad"
                  maxLength={otpLength}
                  editable={!loading}
                  textContentType="oneTimeCode"
                  autoComplete="sms-otp"
                  autoCapitalize="none"
                  autoCorrect={false}
                  importantForAutofill="yes"
                  showSoftInputOnFocus
                  blurOnSubmit={false}
                  caretHidden
                  selectionColor={theme.primary}
                />
              </Pressable>

              {resendSlot ? <View style={styles.resendWrap}>{resendSlot}</View> : null}

              {error ? (
                <View style={styles.errorBanner}>
                  <Text style={[styles.errorText, bodyFont ? { fontFamily: bodyFont } : null, { color: theme.error }]}>
                    {error}
                  </Text>
                </View>
              ) : null}

              {loading && hideVerifyButton ? (
                <View style={styles.autoVerifyLoading}>
                  <ActivityIndicator color={theme.primary} size="small" />
                </View>
              ) : null}

              {showActions ? (
                <View style={[styles.actionsRow, hideVerifyButton && styles.actionsRowSingle]}>
                  {!hideCancelButton ? (
                    <Pressable
                      style={({ pressed }) => [
                        styles.cancelBtn,
                        hideVerifyButton && styles.cancelBtnFull,
                        pressed && styles.pressed,
                        loading && styles.btnDisabled,
                      ]}
                      onPress={onCancel}
                      disabled={loading}
                    >
                      <Text style={[styles.cancelText, titleFont ? { fontFamily: titleFont } : null]}>
                        {cancelLabel}
                      </Text>
                    </Pressable>
                  ) : null}
                  {!hideVerifyButton ? (
                    <Pressable
                      style={[
                        styles.verifyBtn,
                        otpReady && !loading && !verifyDisabled
                          ? { backgroundColor: theme.primary }
                          : styles.verifyBtnIdle,
                        (loading || verifyDisabled) && styles.btnDisabled,
                      ]}
                      onPress={() => onVerify(value)}
                      disabled={loading || verifyDisabled || !otpReady}
                    >
                      {loading ? (
                        <ActivityIndicator color="#fff" size="small" />
                      ) : (
                        <Text style={[styles.verifyText, titleFont ? { fontFamily: titleFont } : null]}>
                          {verifyLabel}
                        </Text>
                      )}
                    </Pressable>
                  ) : null}
                </View>
              ) : null}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalRoot: {
    flex: 1,
    justifyContent: "flex-end",
  },
  dim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(15, 23, 42, 0.45)",
  },
  sheetWrap: {
    width: "100%",
  },
  sheetOuter: {
    width: "100%",
  },
  sheetBody: {
    backgroundColor: "#FFFFFF",
    marginTop: -(OTP_WAVE_H - OTP_WAVE_LOW_Y),
    paddingHorizontal: 20,
    paddingTop: 10,
  },
  sheetBodyDocked: {
    paddingBottom: 8,
  },
  title: {
    fontSize: 18,
    fontWeight: "700",
    color: "#0F172A",
    marginTop: -(OTP_WAVE_LOW_Y - 14),
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 12,
    lineHeight: 17,
    color: "#64748B",
    marginBottom: 14,
  },
  prepend: {
    marginBottom: 12,
  },
  boxesRow: {
    position: "relative",
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 8,
    marginBottom: 10,
  },
  box: {
    flex: 1,
    height: 40,
    alignItems: "center",
    justifyContent: "flex-end",
    paddingBottom: 6,
  },
  digit: {
    fontSize: 22,
    minHeight: 26,
    textAlign: "center",
  },
  digitFilled: {
    fontWeight: "900",
    fontSize: 24,
  },
  digitEmpty: {
    fontWeight: "600",
  },
  underline: {
    width: "100%",
    height: 1.5,
    borderRadius: 1,
    backgroundColor: "#94A3B8",
  },
  caret: {
    position: "absolute",
    bottom: 10,
    width: 2,
    height: 20,
    backgroundColor: "#0F172A",
  },
  hiddenInput: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.02,
    color: "transparent",
  },
  resendWrap: {
    marginBottom: 14,
  },
  errorBanner: {
    backgroundColor: "#FEF2F2",
    borderRadius: 12,
    padding: 12,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: "#FECACA",
  },
  errorText: {
    fontSize: 13,
    lineHeight: 18,
  },
  actionsRow: {
    flexDirection: "row",
    gap: 12,
    marginTop: 2,
  },
  actionsRowSingle: {
    marginTop: 6,
  },
  autoVerifyLoading: {
    alignItems: "center",
    marginBottom: 8,
  },
  cancelBtn: {
    flex: 1,
    height: 46,
    borderRadius: 23,
    borderWidth: 1.5,
    borderColor: "#0F172A",
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  cancelBtnFull: {
    flex: 0,
    width: "100%",
  },
  cancelText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#0F172A",
  },
  verifyBtn: {
    flex: 1,
    height: 46,
    borderRadius: 23,
    alignItems: "center",
    justifyContent: "center",
  },
  verifyBtnIdle: {
    backgroundColor: "#94A3B8",
  },
  verifyText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  pressed: {
    opacity: 0.72,
  },
  btnDisabled: {
    opacity: 0.7,
  },
});
