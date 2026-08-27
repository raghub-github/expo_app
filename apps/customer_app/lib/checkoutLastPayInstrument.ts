import AsyncStorage from "@react-native-async-storage/async-storage";
import type { CheckoutPayMethodItem } from "@/lib/razorpayPaymentMethods";

const STORAGE_KEY = "@gatimitra/checkout_last_pay_instrument_v1";

function isPayInstrument(value: unknown): value is CheckoutPayMethodItem {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === "string" &&
    typeof v.label === "string" &&
    typeof v.method === "string" &&
    typeof v.action === "string" &&
    typeof v.logoKey === "string"
  );
}

export async function loadLastPayInstrument(): Promise<CheckoutPayMethodItem | null> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return isPayInstrument(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export async function saveLastPayInstrument(item: CheckoutPayMethodItem): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(item));
  } catch {
    // Best-effort preference — ignore storage failures.
  }
}
