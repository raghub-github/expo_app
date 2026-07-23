import { NativeModules, Platform } from "react-native";

export type AndroidSmsOtpListener = {
  stop: () => void;
};

type OtpVerifyModule = {
  getOtp: () => Promise<string>;
  removeListener: () => void;
  startOtpListener?: (handler: (message: string) => void) => Promise<unknown>;
  getHash?: () => Promise<string[]>;
};

function extractSixDigitCode(message: string): string | null {
  return /\b(\d{6})\b/.exec(message)?.[1] ?? null;
}

/**
 * Android SMS Retriever (zero-tap OTP). No-op on iOS, Expo Go, or when the native
 * module is not linked — react-native-otp-verify throws during import if OtpVerify
 * is missing from NativeModules.
 */
export async function startAndroidSmsOtpListener(options: {
  onCode: (code: string) => void;
}): Promise<AndroidSmsOtpListener | null> {
  if (Platform.OS !== "android" || !NativeModules.OtpVerify) {
    if (__DEV__) {
      console.log("[otp] SMS Retriever unavailable — manual OTP entry only");
    }
    return null;
  }

  let otpMod: OtpVerifyModule;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require("react-native-otp-verify");
    otpMod = (mod?.default ?? mod) as OtpVerifyModule;
  } catch {
    if (__DEV__) console.log("[otp] SMS Retriever module failed to load");
    return null;
  }

  if (__DEV__ && typeof otpMod.getHash === "function") {
    otpMod.getHash().then((h) => console.log("[otp] app SMS hash:", h)).catch(() => undefined);
  }

  let stopped = false;

  const stop = () => {
    if (stopped) return;
    stopped = true;
    try {
      otpMod.removeListener();
    } catch {
      /* native module may already be torn down */
    }
  };

  const deliver = (message: string) => {
    if (stopped) return;
    const code = extractSixDigitCode(String(message ?? ""));
    if (code) {
      options.onCode(code);
      stop();
    }
  };

  if (typeof otpMod.startOtpListener === "function") {
    try {
      await otpMod.startOtpListener(deliver);
      return { stop };
    } catch (e) {
      if (__DEV__) console.log("[otp] SMS Retriever listener failed:", (e as Error)?.message);
      return null;
    }
  }

  if (typeof otpMod.getOtp !== "function") return null;

  void otpMod
    .getOtp()
    .then((message) => deliver(String(message ?? "")))
    .catch((e) => {
      if (__DEV__) console.log("[otp] SMS Retriever ended:", (e as Error)?.message);
    });

  return { stop };
}
