import React, { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import {
  View,
  Text,
  Pressable,
  Modal,
  StyleSheet,
  ActivityIndicator,
  Keyboard,
  Platform,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { OtpSheetWaveCut, OTP_WAVE_H, OTP_WAVE_LOW_Y } from "./OtpSheetWaveCut";
import { OtpPinField } from "./OtpPinField";
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
  /** Unused for digit rendering. Kept for reset/compat; digits live in OtpPinField. */
  value?: string;
  onChange?: (next: string) => void;
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
  /** Modal enter animation. Default fade. Use `none` to avoid a flash over an existing screen. */
  animationType?: "none" | "fade" | "slide";
  /**
   * Render as an overlay View instead of a nested Modal (e.g. inside the drop-order Modal).
   */
  embedded?: boolean;
  /** Clear isolated pin digits (invalid OTP / reopen). */
  resetKey?: number;
};

/**
 * System soft-keyboard OTP sheet.
 * Android Modal: TextInput mounts only after `onShow` so the phone keyboard opens reliably.
 * Digit state is isolated in OtpPinField so typing does not re-render photo/wave/map chrome.
 */
export function OtpVerifySheetModal({
  visible,
  title,
  subtitle,
  otpLength = 4,
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
  animationType = "fade",
  embedded = false,
  resetKey = 0,
}: OtpVerifySheetModalProps) {
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const [modalReady, setModalReady] = useState(false);
  const [completeCode, setCompleteCode] = useState("");
  const [dismissedError, setDismissedError] = useState(false);
  const [focusNonce, setFocusNonce] = useState(0);
  const keyboardLift = useOtpKeyboardLift(visible, dockToKeyboard ? 0 : undefined);
  const keyboardUp = keyboardLift > 0;
  const showActions = !hideVerifyButton || !hideCancelButton;

  const titleFont = theme.titleFontFamily;
  const bodyFont = theme.bodyFontFamily ?? theme.titleFontFamily;
  const digitFont = theme.digitFontFamily ?? theme.bodyFontFamily;

  const onVerifyRef = useRef(onVerify);
  onVerifyRef.current = onVerify;
  const loadingRef = useRef(loading);
  loadingRef.current = loading;
  const verifyDisabledRef = useRef(verifyDisabled);
  verifyDisabledRef.current = verifyDisabled;
  const autoSubmitRef = useRef(autoSubmitOnComplete);
  autoSubmitRef.current = autoSubmitOnComplete;
  const hideVerifyRef = useRef(hideVerifyButton);
  hideVerifyRef.current = hideVerifyButton;

  const shownError = dismissedError ? null : error;

  useEffect(() => {
    setDismissedError(false);
  }, [error]);

  const fireVerify = useCallback((code: string) => {
    setDismissedError(true);
    if (!hideVerifyRef.current) setCompleteCode(code);
    if (!autoSubmitRef.current) return;
    if (loadingRef.current || verifyDisabledRef.current) return;
    onVerifyRef.current(code);
  }, []);

  const otpReadySafe = completeCode.length === otpLength;

  const requestPinFocus = useCallback(() => {
    setFocusNonce((n) => n + 1);
  }, []);

  useEffect(() => {
    if (!visible) {
      setModalReady(false);
      setCompleteCode("");
      setDismissedError(false);
      Keyboard.dismiss();
      return;
    }
    if (!embedded) return;
    const id = requestAnimationFrame(() => setModalReady(true));
    return () => cancelAnimationFrame(id);
  }, [visible, embedded]);

  useEffect(() => {
    if (resetKey > 0) setCompleteCode("");
  }, [resetKey]);

  const sheetBottomPad =
    dockToKeyboard && keyboardUp
      ? 10
      : Math.max(insets.bottom, Platform.OS === "android" ? 48 : 12);

  if (embedded && !visible) return null;

  const body = (
      <View style={[styles.modalRoot, embedded && styles.embeddedRoot]}>
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
              onPress={requestPinFocus}
            >
              <Text
                style={[
                  styles.title,
                  titleFont
                    ? { fontFamily: titleFont, fontWeight: "normal" }
                    : styles.titleFallbackWeight,
                ]}
              >
                {title}
              </Text>
              <Text
                style={[
                  styles.subtitle,
                  bodyFont
                    ? { fontFamily: bodyFont, fontWeight: "normal" }
                    : null,
                ]}
              >
                {subtitle}
              </Text>

              {prependContent ? <View style={styles.prepend}>{prependContent}</View> : null}

              {visible ? (
                <OtpPinField
                  otpLength={otpLength}
                  loading={loading}
                  visible={visible}
                  resetKey={resetKey}
                  error={error}
                  digitFontFamily={digitFont}
                  textPrimary={theme.textPrimary}
                  primary={theme.primary}
                  inputReady={modalReady}
                  focusNonce={focusNonce}
                  onComplete={fireVerify}
                  onChange={onChange}
                />
              ) : null}
              {resendSlot ? <View style={styles.resendWrap}>{resendSlot}</View> : null}

              {shownError ? (
                <View style={styles.errorBanner}>
                  <Text
                    style={[
                      styles.errorText,
                      bodyFont ? { fontFamily: bodyFont } : null,
                      { color: theme.error },
                    ]}
                  >
                    {shownError}
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
                      <Text style={[styles.cancelText, titleFont ? { fontFamily: titleFont, fontWeight: "normal" } : null]}>
                        {cancelLabel}
                      </Text>
                    </Pressable>
                  ) : null}
                  {!hideVerifyButton ? (
                    <Pressable
                      style={[
                        styles.verifyBtn,
                        otpReadySafe && !loading && !verifyDisabled
                          ? { backgroundColor: theme.primary }
                          : styles.verifyBtnIdle,
                        (loading || verifyDisabled) && styles.btnDisabled,
                      ]}
                      onPress={() => {
                        if (!otpReadySafe || loading || verifyDisabled) return;
                        onVerifyRef.current(completeCode);
                      }}
                      disabled={loading || verifyDisabled || !otpReadySafe}
                    >
                      {loading ? (
                        <ActivityIndicator color="#fff" size="small" />
                      ) : (
                        <Text style={[styles.verifyText, titleFont ? { fontFamily: titleFont, fontWeight: "normal" } : null]}>
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
  );

  if (embedded) return body;

  return (
    <Modal
      visible={visible}
      transparent
      animationType={animationType}
      onRequestClose={onCancel}
      statusBarTranslucent
      onShow={() => {
        requestAnimationFrame(() => setModalReady(true));
      }}
    >
      {body}
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalRoot: {
    flex: 1,
    justifyContent: "flex-end",
  },
  embeddedRoot: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 80,
    elevation: 80,
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
    color: "#0F172A",
    marginTop: -(OTP_WAVE_LOW_Y - 14),
    marginBottom: 8,
  },
  titleFallbackWeight: {
    fontWeight: "700",
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
    color: "#FFFFFF",
  },
  pressed: {
    opacity: 0.72,
  },
  btnDisabled: {
    opacity: 0.7,
  },
});
