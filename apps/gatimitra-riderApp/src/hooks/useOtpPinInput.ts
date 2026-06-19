import { useCallback, useEffect, useRef, useState } from "react";
import { Animated, Platform, Vibration } from "react-native";

const DIGIT_SLOTS = [0, 1, 2, 3] as const;

function hapticLight() {
  if (Platform.OS === "android") {
    Vibration.vibrate(12);
  }
}

function hapticError() {
  if (Platform.OS === "android") {
    Vibration.vibrate([0, 30, 40, 30]);
  }
}

function hapticSuccess() {
  if (Platform.OS === "android") {
    Vibration.vibrate([0, 20, 30, 20]);
  }
}

export type UseOtpPinInputOptions = {
  loading?: boolean;
  error?: string | null;
  resetKey?: number;
  autoSubmit?: boolean;
  onSubmit: (otp: string) => void;
  onErrorClear?: () => void;
};

export function useOtpPinInput({
  loading = false,
  error = null,
  resetKey = 0,
  autoSubmit = true,
  onSubmit,
  onErrorClear,
}: UseOtpPinInputOptions) {
  const [otp, setOtp] = useState("");
  const submittedRef = useRef(false);
  const lastSubmittedOtpRef = useRef<string | null>(null);
  const rowScale = useRef(new Animated.Value(1)).current;
  const statusOpacity = useRef(new Animated.Value(0)).current;

  const isComplete = otp.length === 4;
  const isInvalid = !!error?.trim();
  const isVerifying = loading && isComplete;
  const activeIndex = Math.min(otp.length, 3);

  const resetOtpState = useCallback(() => {
    setOtp("");
    submittedRef.current = false;
    lastSubmittedOtpRef.current = null;
    rowScale.setValue(1);
    statusOpacity.setValue(0);
  }, [rowScale, statusOpacity]);

  useEffect(() => {
    resetOtpState();
  }, [resetKey, resetOtpState]);

  useEffect(() => {
    if (!isInvalid) return;
    hapticError();
    rowScale.setValue(1);
    Animated.sequence([
      Animated.timing(rowScale, { toValue: 1.04, duration: 70, useNativeDriver: true }),
      Animated.timing(rowScale, { toValue: 0.98, duration: 70, useNativeDriver: true }),
      Animated.spring(rowScale, { toValue: 1, friction: 7, tension: 120, useNativeDriver: true }),
    ]).start();
  }, [isInvalid, resetKey, rowScale]);

  useEffect(() => {
    if (!isVerifying && !isInvalid) {
      statusOpacity.setValue(0);
      return;
    }
    Animated.timing(statusOpacity, { toValue: 1, duration: 180, useNativeDriver: true }).start();
  }, [isVerifying, isInvalid, statusOpacity]);

  useEffect(() => {
    if (!autoSubmit || !isComplete || loading) return;
    if (otp === lastSubmittedOtpRef.current) return;
    submittedRef.current = true;
    lastSubmittedOtpRef.current = otp;
    hapticSuccess();
    onSubmit(otp);
  }, [autoSubmit, isComplete, loading, otp, onSubmit]);

  const applyOtp = useCallback(
    (digits: string) => {
      const next = digits.replace(/\D/g, "").slice(0, 4);
      if (next !== lastSubmittedOtpRef.current) {
        submittedRef.current = false;
      }
      if (error?.trim()) onErrorClear?.();
      setOtp(next);
      if (!autoSubmit && next.length === 4) onSubmit(next);
    },
    [autoSubmit, error, onErrorClear, onSubmit]
  );

  const pressDigit = useCallback(
    (digit: string) => {
      if (loading || otp.length >= 4) return;
      hapticLight();
      applyOtp(`${otp}${digit}`);
    },
    [applyOtp, loading, otp]
  );

  const backspace = useCallback(() => {
    if (loading || otp.length === 0) return;
    hapticLight();
    applyOtp(otp.slice(0, -1));
  }, [applyOtp, loading, otp]);

  const applyPastedOtp = useCallback(
    (value: string) => {
      const next = value.replace(/\D/g, "").slice(0, 4);
      if (!next) return;
      hapticLight();
      applyOtp(next);
    },
    [applyOtp]
  );

  return {
    otp,
    digitSlots: DIGIT_SLOTS,
    activeIndex,
    isInvalid,
    isVerifying,
    isComplete,
    rowScale,
    statusOpacity,
    applyOtp,
    pressDigit,
    backspace,
    applyPastedOtp,
    disabled: loading,
  };
}
