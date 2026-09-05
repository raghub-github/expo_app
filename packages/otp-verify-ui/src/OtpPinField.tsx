import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  Platform,
} from "react-native";

type Props = {
  otpLength: 4 | 6;
  loading?: boolean;
  visible: boolean;
  resetKey?: number;
  error?: string | null;
  digitFontFamily?: string;
  textPrimary: string;
  primary: string;
  inputReady: boolean;
  focusNonce?: number;
  onComplete: (code: string) => void;
  /** Called at most once per completed code (merchant parent sync). Not per digit. */
  onChange?: (next: string) => void;
};

/**
 * Local-only OTP digits + hidden TextInput.
 * Parent chrome (photo, wave, map) must NOT receive setState on each keypress.
 */
function OtpPinFieldInner({
  otpLength,
  loading = false,
  visible,
  resetKey = 0,
  error = null,
  digitFontFamily,
  textPrimary,
  primary,
  inputReady,
  focusNonce = 0,
  onComplete,
  onChange,
}: Props) {
  const [digits, setDigits] = useState("");
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<TextInput>(null);
  const submittedRef = useRef("");
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const loadingRef = useRef(loading);
  loadingRef.current = loading;
  const renderCountRef = useRef(0);
  const firstDigitAtRef = useRef(0);
  renderCountRef.current += 1;

  const resetLocal = useCallback(() => {
    setDigits("");
    submittedRef.current = "";
    firstDigitAtRef.current = 0;
    renderCountRef.current = 0;
  }, []);

  useEffect(() => {
    if (!visible) {
      resetLocal();
      setFocused(false);
    }
  }, [visible, resetLocal]);

  useEffect(() => {
    if (resetKey > 0) resetLocal();
  }, [resetKey, resetLocal]);

  const activeIndex = Math.min(digits.length, otpLength - 1);

  const focusInput = useCallback(() => {
    if (!inputReady) return;
    const node = inputRef.current;
    if (!node) return;
    node.focus();
    if (Platform.OS === "android") {
      const State = (TextInput as unknown as { State?: { focusTextInput?: (n: unknown) => void } })
        .State;
      State?.focusTextInput?.(node);
    }
  }, [inputReady]);

  useEffect(() => {
    if (focusNonce > 0) focusInput();
  }, [focusNonce, focusInput]);

  const applyDigits = useCallback(
    (raw: string) => {
      const next = raw.replace(/\D/g, "").slice(0, otpLength);
      setDigits((prev) => {
        if (prev.length === 0 && next.length === 1) {
          firstDigitAtRef.current = Date.now();
          renderCountRef.current = 1;
        }
        return next;
      });

      if (next.length === otpLength && submittedRef.current !== next) {
        submittedRef.current = next;
        if (__DEV__) {
          const started = firstDigitAtRef.current;
          console.log("[RiderOtpPerf]", {
            pinRendersThroughComplete: renderCountRef.current,
            msFirstDigitToComplete: started ? Date.now() - started : null,
            otpLength,
          });
        }
        onCompleteRef.current(next);
        onChangeRef.current?.(next);
      }
    },
    [otpLength]
  );

  return (
    <Pressable
      style={styles.boxesRow}
      onPress={focusInput}
      accessibilityLabel={`One-time code, ${otpLength} digits`}
    >
      {Array.from({ length: otpLength }).map((_, index) => {
        const digit = digits.charAt(index);
        const active = focused && index === activeIndex;
        return (
          <View key={index} style={styles.box} pointerEvents="none">
            <Text
              style={[
                styles.digit,
                digit ? styles.digitFilled : styles.digitEmpty,
                digitFontFamily
                  ? { fontFamily: digitFontFamily, fontWeight: "normal" }
                  : styles.digitFallbackWeight,
                { color: textPrimary },
              ]}
              numberOfLines={1}
            >
              {digit || (active ? "\u200B" : "-")}
            </Text>
            <View
              style={[styles.underline, active && { backgroundColor: primary }]}
            />
            {active && !digit ? <View style={styles.caret} /> : null}
          </View>
        );
      })}
      {inputReady ? (
        <TextInput
          key={`otp-input-${visible ? "on" : "off"}`}
          ref={inputRef}
          style={styles.hiddenInput}
          value={digits}
          onChangeText={applyDigits}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          keyboardType="number-pad"
          maxLength={otpLength}
          editable={visible}
          textContentType="oneTimeCode"
          autoComplete="sms-otp"
          autoCapitalize="none"
          autoCorrect={false}
          importantForAutofill="yes"
          showSoftInputOnFocus
          autoFocus
          blurOnSubmit={false}
          caretHidden
          contextMenuHidden
          selectTextOnFocus={false}
          selectionColor="transparent"
          underlineColorAndroid="transparent"
        />
      ) : null}
    </Pressable>
  );
}

export const OtpPinField = React.memo(OtpPinFieldInner);

const styles = StyleSheet.create({
  boxesRow: {
    position: "relative",
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 8,
    marginBottom: 10,
    overflow: "hidden",
  },
  box: {
    flex: 1,
    height: 44,
    alignItems: "center",
    justifyContent: "flex-end",
    paddingBottom: 6,
    overflow: "hidden",
  },
  digit: {
    fontSize: 24,
    minHeight: 28,
    width: "100%",
    textAlign: "center",
    includeFontPadding: false,
  },
  digitFilled: {
    fontSize: 26,
  },
  digitEmpty: {},
  digitFallbackWeight: {
    fontWeight: "700",
  },
  underline: {
    width: "100%",
    height: 2,
    borderRadius: 1,
    backgroundColor: "#94A3B8",
  },
  caret: {
    position: "absolute",
    bottom: 10,
    width: 2,
    height: 22,
    backgroundColor: "#0F172A",
  },
  hiddenInput: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 2,
    opacity: Platform.OS === "android" ? 0.02 : 0.01,
    color: "transparent",
    backgroundColor: "transparent",
    fontSize: 1,
    letterSpacing: 0,
    includeFontPadding: false,
  },
});
