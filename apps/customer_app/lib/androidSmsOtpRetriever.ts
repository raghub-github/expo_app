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

export function extractSixDigitCode(message: string): string | null {
  return /\b(\d{6})\b/.exec(String(message ?? ""))?.[1] ?? null;
}

let pendingSmsOtp: string | null = null;
const pendingSmsOtpListeners = new Set<(code: string) => void>();
let armedListener: AndroidSmsOtpListener | null = null;

export function publishPendingSmsOtp(raw: string): void {
  const cleaned = extractSixDigitCode(raw) ?? String(raw ?? "").replace(/\D/g, "").slice(0, 6);
  if (cleaned.length !== 6) return;
  pendingSmsOtp = cleaned;
  pendingSmsOtpListeners.forEach((fn) => fn(cleaned));
}

export function takePendingSmsOtp(): string | null {
  const code = pendingSmsOtp;
  pendingSmsOtp = null;
  return code;
}

export function subscribePendingSmsOtp(onCode: (code: string) => void): () => void {
  pendingSmsOtpListeners.add(onCode);
  if (pendingSmsOtp) onCode(pendingSmsOtp);
  return () => {
    pendingSmsOtpListeners.delete(onCode);
  };
}

/** Start SMS Retriever as soon as OTP is sent (before the OTP screen mounts). */
export async function armSmsOtpCapture(): Promise<void> {
  armedListener?.stop();
  armedListener = await startAndroidSmsOtpListener({
    onCode: publishPendingSmsOtp,
  });
}

/** True when react-native-otp-verify native module is linked (dev/prod builds, not Expo Go). */
export function isAndroidSmsRetrieverAvailable(): boolean {
  return Platform.OS === "android" && !!NativeModules.OtpVerify;
}

/**
 * Android SMS Retriever (zero-tap OTP). No-op on iOS, Expo Go, or when the native
 * module is not linked.
 *
 * No READ_SMS permission required. Pair with OS autofill (`sms-otp` / `oneTimeCode`)
 * and clipboard paste for Expo Go / iOS manual fallback.
 */
export async function startAndroidSmsOtpListener(options: {
  onCode: (code: string) => void;
}): Promise<AndroidSmsOtpListener | null> {
  if (!isAndroidSmsRetrieverAvailable()) {
    if (__DEV__) {
      console.log("[otp] SMS Retriever unavailable — use keyboard autofill / manual entry");
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
    const code = extractSixDigitCode(message);
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
