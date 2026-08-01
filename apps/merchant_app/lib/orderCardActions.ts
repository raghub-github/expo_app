import { Alert, Linking, Platform, Share } from "react-native";
import type { OrderRecord } from "@/hooks/useOrders";
import type { KotPrintContext } from "@/lib/printKot";
import type { MerchantPrintStoreContext } from "@/lib/printContext";
import { buildKotPrintContext } from "@/lib/printContext";

export async function printOrderBill(
  order: OrderRecord,
  ctx?: MerchantPrintStoreContext | KotPrintContext | null
): Promise<void> {
  const { printBillFromRecord } = await import("@/lib/printBill");
  try {
    await printBillFromRecord(order, ctx);
  } catch {
    if (Platform.OS !== "web") {
      const storeName = ctx?.storeName?.trim() || "GatiMitra Partner";
      const id = order.formattedOrderId || String(order.ordersCoreId);
      await Share.share({
        message: `${storeName}\nOrder ${id}\nTotal: ₹${order.total.toLocaleString("en-IN")}`,
        title: "Order bill",
      });
    }
  }
}

/** Android throws instead of resolving when the user dismisses the print dialog. */
function isPrintCancellation(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err ?? "");
  return /cancel|dismiss|did not complete/i.test(message);
}

export async function printOrderKot(
  order: OrderRecord,
  ctx?: MerchantPrintStoreContext | KotPrintContext | null
): Promise<void> {
  try {
    const { printKotFromRecord } = await import("@/lib/printKot");
    const printContext = buildKotPrintContext(ctx);
    // A unified incoming board can print an order from a store other than the
    // currently active outlet. Refresh KOT/token against the order's own store,
    // while keeping the shared Partner Site template and printer settings.
    await printKotFromRecord(order, {
      ...printContext,
      storeId: order.merchantStoreId ?? printContext.storeId,
      storeName: order.merchantStoreName?.trim() || printContext.storeName,
    });
  } catch (err) {
    if (isPrintCancellation(err)) return;
    Alert.alert(
      "Could not print KOT",
      err instanceof Error ? err.message : "Printing failed. Please try again."
    );
  }
}

type SpeechModule = typeof import("expo-speech");

/** How long an engine may take to start talking before we treat it as failed. */
const SPEECH_START_GRACE_MS = 500;

/**
 * Kitchen cards need a snappy read-out. Expo maps `rate` differently per OS:
 * iOS is ~0–1 (default ≈0.5), Android commonly treats 1.0 as normal.
 */
const SPEECH_RATE = Platform.OS === "ios" ? 0.62 : 1.35;

/**
 * Resolved once per app run: Android matches `language` with `Locale(tag)`, which
 * never matches a region tag like "en-IN", so it silently falls back to the device
 * locale — and stays mute when that locale has no voice data installed. Naming an
 * actual installed voice is the only reliable way to get English out of the engine.
 */
let cachedSpeechVoice: { voice: string; language: string } | null | undefined;
let speechModulePromise: Promise<SpeechModule> | null = null;

function loadSpeechModule(): Promise<SpeechModule> {
  if (!speechModulePromise) {
    speechModulePromise = import("expo-speech");
  }
  return speechModulePromise;
}

async function resolveEnglishVoice(
  Speech: SpeechModule
): Promise<{ voice: string; language: string } | null> {
  if (cachedSpeechVoice !== undefined) return cachedSpeechVoice;
  try {
    const voices = await Speech.getAvailableVoicesAsync();
    const english = voices.filter((v) => /^en[-_]?/i.test(v.language ?? ""));
    const preferred =
      english.find((v) => /^en[-_]in$/i.test(v.language)) ??
      english.find((v) => /^en[-_]gb$/i.test(v.language)) ??
      english.find((v) => /^en[-_]us$/i.test(v.language)) ??
      english[0];
    cachedSpeechVoice = preferred
      ? { voice: preferred.identifier, language: preferred.language }
      : null;
  } catch {
    cachedSpeechVoice = null;
  }
  return cachedSpeechVoice;
}

/** Prefetch TTS module + English voice so the first card tap starts immediately. */
export function warmupOrderSpeech(): void {
  if (Platform.OS === "web") return;
  void loadSpeechModule()
    .then((Speech) => resolveEnglishVoice(Speech))
    .catch(() => {
      /* optional warm-up */
    });
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function speechIsActive(Speech: SpeechModule): Promise<boolean> {
  try {
    return await Speech.isSpeakingAsync();
  } catch {
    return false;
  }
}

/** Stop any ongoing announcement (also used when a card toggles the speaker off). */
export async function stopOrderSpeech(): Promise<void> {
  if (Platform.OS === "web") {
    if (typeof window !== "undefined" && window.speechSynthesis) window.speechSynthesis.cancel();
    return;
  }
  try {
    const Speech = await loadSpeechModule();
    await Speech.stop();
  } catch {
    /* engine unavailable — nothing to stop */
  }
}

/** True while the engine is actually talking, so a stale UI flag can be corrected. */
export async function isOrderSpeechActive(): Promise<boolean> {
  if (Platform.OS === "web") {
    return typeof window !== "undefined" ? Boolean(window.speechSynthesis?.speaking) : false;
  }
  try {
    const Speech = await loadSpeechModule();
    return await speechIsActive(Speech);
  } catch {
    return false;
  }
}

/** Speak quantity + item names only (e.g. "2 Chicken Biryani, 1 Plain Chapati"). */
export async function speakOrderItems(
  order: OrderRecord,
  opts?: { onStart?: () => void; onDone?: () => void }
): Promise<void> {
  const text = order.lineItems
    .map((it) => {
      const qtyWord = it.qty === 1 ? "1" : String(it.qty);
      return `${qtyWord} ${it.name}`;
    })
    .join(", ");

  if (!text.trim()) {
    Alert.alert("No items", "This order has no items to read out.");
    return;
  }

  opts?.onStart?.();

  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    opts?.onDone?.();
  };

  if (Platform.OS === "web" && typeof window !== "undefined" && window.speechSynthesis) {
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = "en-IN";
    utter.rate = 1.25;
    utter.onend = finish;
    utter.onerror = finish;
    window.speechSynthesis.speak(utter);
    return;
  }

  let Speech: SpeechModule;
  try {
    Speech = await loadSpeechModule();
  } catch {
    finish();
    Alert.alert("Order items", text);
    return;
  }

  let started = false;
  const callbacks = {
    onStart: () => {
      started = true;
    },
    onDone: finish,
    onStopped: finish,
    onError: finish,
  };

  const voice = await resolveEnglishVoice(Speech);
  try {
    await Speech.stop();
  } catch {
    /* nothing queued */
  }
  Speech.speak(text, { ...(voice ?? {}), rate: SPEECH_RATE, ...callbacks });

  await wait(SPEECH_START_GRACE_MS);
  if (started || (await speechIsActive(Speech))) return;

  // The chosen voice was rejected without any callback — re-pick it next time and
  // retry on the engine default before giving up.
  cachedSpeechVoice = undefined;
  try {
    await Speech.stop();
  } catch {
    /* nothing queued */
  }
  Speech.speak(text, { rate: SPEECH_RATE, ...callbacks });

  await wait(SPEECH_START_GRACE_MS);
  if (started || (await speechIsActive(Speech))) return;

  finish();
  Alert.alert("Order items", text);
}

/** Normalize to E.164 for dialer (e.g. +917367878981). */
export function formatPhoneForDial(phone: string | null | undefined): string | null {
  const raw = (phone ?? "").trim();
  if (!raw) return null;

  if (raw.startsWith("+")) {
    const digits = raw.replace(/\D/g, "");
    return digits.length >= 10 ? `+${digits}` : null;
  }

  let digits = raw.replace(/\D/g, "");
  if (!digits) return null;

  if (digits.length === 10) return `+91${digits}`;
  if (digits.length === 11 && digits.startsWith("0")) return `+91${digits.slice(1)}`;
  if (digits.startsWith("91") && digits.length === 12) return `+${digits}`;
  if (digits.length >= 10) return `+${digits}`;

  return null;
}

async function openPhoneDialer(phone: string | null | undefined, emptyMessage: string): Promise<void> {
  const e164 = formatPhoneForDial(phone);
  if (!e164) {
    Alert.alert("No phone", emptyMessage);
    return;
  }
  const url = `tel:${e164}`;
  const ok = await Linking.canOpenURL(url);
  if (!ok) {
    Alert.alert("Call unavailable", e164);
    return;
  }
  await Linking.openURL(url);
}

export async function callCustomer(phone: string | null | undefined): Promise<void> {
  await openPhoneDialer(phone, "Customer phone number is not available for this order.");
}

export async function callRider(phone: string | null | undefined): Promise<void> {
  await openPhoneDialer(phone, "Rider phone number is not available for this order.");
}
