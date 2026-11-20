/**
 * Shared native Razorpay checkout for rider app (onboarding fee, negative
 * wallet recovery, subscription dues).
 *
 * Uses `require()` — not a static ESM import — because Metro/Hermes often
 * resolves `react-native-razorpay`'s default export incorrectly, which made
 * `isNativeRazorpayAvailable()` return false and Pay buttons appear dead.
 *
 * Prefer native Android/iOS SDK; callers should fall back to hosted browser
 * checkout when this returns unavailable (Expo Go / unlinked builds).
 */
import { NativeModules, Platform } from "react-native";

export type NativeRazorpayOrder = {
  orderId: string;
  /** Amount in paise (integer). */
  amount: number;
  currency?: string;
  keyId: string;
};

export type NativeRazorpayPrefill = {
  name?: string | null;
  contact?: string | null;
  email?: string | null;
};

export type NativeRazorpayResult = {
  razorpayOrderId: string;
  razorpayPaymentId: string;
  razorpaySignature: string;
};

type RazorpayNativeModule = {
  open: (options: Record<string, unknown>) => Promise<{
    razorpay_payment_id?: string;
    razorpay_order_id?: string;
    razorpay_signature?: string;
  }>;
};

let cachedModule: RazorpayNativeModule | null | undefined;

/** True when the Android/iOS native bridge is linked (not Expo Go). */
function hasNativeRazorpayBridge(): boolean {
  const bridge = (NativeModules as { RNRazorpayCheckout?: { open?: unknown } | null })
    .RNRazorpayCheckout;
  return Boolean(bridge && typeof bridge.open === "function");
}

/**
 * Resolve the native module once. Handles both CJS shapes:
 *   module.exports = { open }
 *   module.exports.default = { open }
 *
 * IMPORTANT: `react-native-razorpay`'s JS file always exports `open`, even in
 * Expo Go — but it then crashes with "Cannot read property 'open' of null"
 * because `NativeModules.RNRazorpayCheckout` is missing. We require the bridge.
 */
function resolveNativeModule(): RazorpayNativeModule | null {
  if (Platform.OS === "web" || !hasNativeRazorpayBridge()) {
    cachedModule = null;
    return null;
  }
  if (cachedModule !== undefined) return cachedModule;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require("react-native-razorpay");
    const candidate = (mod?.default ?? mod) as RazorpayNativeModule | undefined;
    if (candidate && typeof candidate.open === "function") {
      cachedModule = candidate;
      return candidate;
    }
    cachedModule = null;
    return null;
  } catch {
    cachedModule = null;
    return null;
  }
}

/** True when the native Razorpay SDK is linked (dev-client / EAS / Play build). */
export function isNativeRazorpayAvailable(): boolean {
  return resolveNativeModule() != null;
}

function last10(raw?: string | null): string | undefined {
  if (!raw) return undefined;
  const digits = String(raw).replace(/\D/g, "");
  return digits.length >= 10 ? digits.slice(-10) : undefined;
}

function toPaiseInt(amount: number): number {
  const n = Number(amount);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.max(100, Math.trunc(n));
}

/**
 * Open the native Razorpay sheet. Resolves with verification tokens on success;
 * rejects with `{ code, description }` on cancel / gateway / linker failure.
 */
export async function openRazorpayCheckout(args: {
  order: NativeRazorpayOrder;
  prefill?: NativeRazorpayPrefill;
  name?: string;
  description?: string;
  themeColor?: string;
}): Promise<NativeRazorpayResult> {
  const sdk = resolveNativeModule();
  if (!sdk) {
    const err = Object.assign(new Error("Native Razorpay module is not available"), {
      code: "MODULE_MISSING",
      description:
        "Native Razorpay is not linked. Install a production/dev-client build (not Expo Go).",
    });
    throw err;
  }

  const { order } = args;
  const amountPaise = toPaiseInt(order.amount);
  if (!(amountPaise >= 100)) {
    const err = Object.assign(new Error("Invalid payment amount"), {
      code: "INVALID_AMOUNT",
      description: "Payment amount must be at least ₹1.",
    });
    throw err;
  }
  if (!order.keyId || order.keyId === "dummy_key" || !order.orderId) {
    const err = Object.assign(new Error("Invalid Razorpay order"), {
      code: "INVALID_ORDER",
      description: "Missing Razorpay order id or key.",
    });
    throw err;
  }

  const options: Record<string, unknown> = {
    key: order.keyId,
    order_id: order.orderId,
    amount: amountPaise,
    currency: order.currency || "INR",
    name: args.name || "GatiMitra",
    description: args.description || "Payment",
    theme: { color: args.themeColor || "#39d353" },
    prefill: {
      name: args.prefill?.name || undefined,
      contact: last10(args.prefill?.contact),
      email: args.prefill?.email || undefined,
    },
    retry: { enabled: true, max_count: 1 },
  };

  try {
    const result = await sdk.open(options);
    const paymentId = String(result?.razorpay_payment_id ?? "").trim();
    const orderId = String(result?.razorpay_order_id ?? order.orderId).trim();
    const signature = String(result?.razorpay_signature ?? "").trim();
    if (!paymentId || !signature) {
      const err = Object.assign(new Error("Incomplete Razorpay response"), {
        code: "INCOMPLETE_RESPONSE",
        description: "Payment completed but verification tokens were missing.",
      });
      throw err;
    }
    return {
      razorpayOrderId: orderId,
      razorpayPaymentId: paymentId,
      razorpaySignature: signature,
    };
  } catch (rzpErr) {
    const msg = rzpErr instanceof Error ? rzpErr.message : String(rzpErr ?? "");
    // Expo Go / unlinked: JS wrapper exists but NativeModules.RNRazorpayCheckout is null.
    if (/open['"]?\s+of\s+null/i.test(msg) || /RNRazorpayCheckout/i.test(msg)) {
      cachedModule = null;
      throw Object.assign(new Error("Native Razorpay module is not available"), {
        code: "MODULE_MISSING",
        description:
          "Native Razorpay is not linked. Install a production/dev-client build (not Expo Go).",
      });
    }
    // Re-throw normalised shape so callers can Alert consistently.
    const extracted = extractRazorpayError(rzpErr);
    if (extracted.code || extracted.description) {
      throw Object.assign(
        rzpErr instanceof Error ? rzpErr : new Error(extracted.description || "Payment failed"),
        extracted
      );
    }
    throw rzpErr;
  }
}

/**
 * Fast-confirm poll: while the native Razorpay sheet is open, ask the backend
 * whether the payment has already been confirmed (webhook / reconciler), so the
 * app can finish as soon as the money is settled server-side instead of waiting
 * on the native SDK promise — which, for UPI-intent, only resolves after Razorpay
 * itself confirms the collect (can take ~40s).
 *
 * `check` returns true once the backend confirms. `onConfirmed` fires at most
 * once. The caller MUST call the returned stop() when the native promise settles
 * (success / cancel / failure) so polling ends. Errors from `check` are swallowed
 * (a transient failure just retries on the next tick).
 */
export function startServerConfirmPoll(
  check: () => Promise<boolean>,
  onConfirmed: () => void,
  opts?: { firstDelayMs?: number; intervalMs?: number },
): () => void {
  const firstDelayMs = opts?.firstDelayMs ?? 3000;
  const intervalMs = opts?.intervalMs ?? 2500;
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const runOnce = async () => {
    if (stopped) return;
    let confirmed = false;
    try {
      confirmed = await check();
    } catch {
      confirmed = false;
    }
    if (stopped) return;
    if (confirmed) {
      stopped = true;
      onConfirmed();
      return;
    }
    timer = setTimeout(() => void runOnce(), intervalMs);
  };

  timer = setTimeout(() => void runOnce(), firstDelayMs);

  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
    timer = null;
  };
}

function isUsableRazorpayText(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const t = value.trim();
  if (!t) return false;
  const lower = t.toLowerCase();
  if (lower === "undefined" || lower === "null" || lower === "[object object]") return false;
  // Never surface raw gateway JSON blobs in the UI.
  if (t.startsWith("{") || t.startsWith("[")) return false;
  return true;
}

function parseRazorpayJsonBlob(raw: string): Record<string, unknown> | null {
  const text = raw.trim();
  if (!text.startsWith("{") && !text.startsWith("[")) return null;
  try {
    const parsed = JSON.parse(text) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    /* ignore */
  }
  return null;
}

function readRazorpayField(
  source: Record<string, unknown> | null | undefined,
  key: string
): unknown {
  if (!source) return undefined;
  return source[key];
}

/**
 * Normalise a Razorpay rejection into `{ code, description }`.
 * Handles native Error.message that is a full JSON payload (common on Android).
 */
export function extractRazorpayError(err: unknown): { code: string; description: string } {
  let root: Record<string, unknown> | null = null;

  if (typeof err === "string") {
    root = parseRazorpayJsonBlob(err) ?? { message: err };
  } else if (err instanceof Error) {
    const fromMessage = parseRazorpayJsonBlob(err.message);
    root = fromMessage
      ? { ...fromMessage, message: err.message }
      : ({
          ...(err as unknown as Record<string, unknown>),
          message: err.message,
          code: (err as { code?: unknown }).code,
          description: (err as { description?: unknown }).description,
        } as Record<string, unknown>);
  } else if (err && typeof err === "object") {
    root = err as Record<string, unknown>;
  }

  const nestedRaw = readRazorpayField(root, "error");
  const nested =
    nestedRaw && typeof nestedRaw === "object" && !Array.isArray(nestedRaw)
      ? (nestedRaw as Record<string, unknown>)
      : null;

  const codeRaw = readRazorpayField(root, "code") ?? readRazorpayField(nested, "code");
  const candidates = [
    readRazorpayField(root, "description"),
    readRazorpayField(nested, "description"),
    readRazorpayField(nested, "reason"),
    readRazorpayField(root, "reason"),
    readRazorpayField(root, "message"),
  ];

  let description = "";
  for (const c of candidates) {
    if (isUsableRazorpayText(c)) {
      description = c.trim();
      break;
    }
  }

  const code =
    typeof codeRaw === "string"
      ? codeRaw.trim()
      : codeRaw != null && String(codeRaw) !== "undefined"
        ? String(codeRaw)
        : "";

  return { code, description };
}

function readRazorpayStep(err: unknown): string {
  const tryObj = (obj: Record<string, unknown> | null): string => {
    if (!obj) return "";
    const nested = obj.error;
    if (nested && typeof nested === "object" && !Array.isArray(nested)) {
      const step = (nested as Record<string, unknown>).step;
      if (typeof step === "string" && step.trim()) return step.trim();
    }
    const step = obj.step;
    return typeof step === "string" ? step.trim() : "";
  };

  if (typeof err === "string") return tryObj(parseRazorpayJsonBlob(err));
  if (err instanceof Error) {
    const fromMsg = tryObj(parseRazorpayJsonBlob(err.message));
    if (fromMsg) return fromMsg;
  }
  if (err && typeof err === "object") return tryObj(err as Record<string, unknown>);
  return "";
}

/**
 * Rider-facing payment failure copy — never raw JSON / "undefined".
 */
export function formatRazorpayUserMessage(
  err: unknown,
  fallback = "Payment could not be completed. Please try again."
): string {
  const { code, description } = extractRazorpayError(err);
  if (description) return description;

  const step = readRazorpayStep(err);
  if (code === "BAD_REQUEST_ERROR" || step === "payment_authentication") {
    return "Payment authentication failed. Please try another method or try again.";
  }
  if (code === "NETWORK_ERROR" || code === "0") {
    return "Network error during payment. Check your connection and try again.";
  }
  if (code && code !== "undefined") {
    return `${fallback} (${code})`;
  }
  return fallback;
}

/** True when the user dismissed the sheet (not a linker/gateway failure). */
export function isRazorpayUserCancel(err: unknown): boolean {
  const { code, description } = extractRazorpayError(err);
  // Razorpay's PAYMENT_CANCELLED constant is 2. Do NOT treat code 0 or an empty code
  // as cancel — 0 is NETWORK_ERROR and "" is "no code", both real failures we must
  // surface (the old `Number(code) === 0` swallowed every codeless error as a cancel,
  // hiding genuine gateway/verify failures and recording them as "cancelled").
  if (code.trim() === "2") return true;
  const d = description.toLowerCase();
  return (
    d.includes("cancelled") ||
    d.includes("canceled") ||
    d.includes("user closed") ||
    d.includes("dismiss") ||
    d.includes("backpressed") ||
    d.includes("back pressed")
  );
}
