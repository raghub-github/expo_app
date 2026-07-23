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

export async function printOrderKot(
  order: OrderRecord,
  ctx?: MerchantPrintStoreContext | KotPrintContext | null
): Promise<void> {
  const { printKotFromRecord } = await import("@/lib/printKot");
  await printKotFromRecord(order, buildKotPrintContext(ctx));
}

/** Speak quantity + item names only (e.g. "2 Chicken Biryani. 1 Plain Chapati"). */
export async function speakOrderItems(
  order: OrderRecord,
  opts?: { onStart?: () => void; onDone?: () => void }
): Promise<void> {
  const text = order.lineItems
    .map((it) => {
      const qtyWord = it.qty === 1 ? "1" : String(it.qty);
      return `${qtyWord} ${it.name}`;
    })
    .join(". ");

  if (!text.trim()) return;

  opts?.onStart?.();

  const finish = () => opts?.onDone?.();

  if (Platform.OS === "web" && typeof window !== "undefined" && window.speechSynthesis) {
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = "en-IN";
    utter.onend = finish;
    utter.onerror = finish;
    window.speechSynthesis.speak(utter);
    return;
  }

  try {
    const Speech = await import("expo-speech");
    Speech.stop();
    Speech.speak(text, {
      language: "en-IN",
      onDone: finish,
      onStopped: finish,
      onError: finish,
    });
  } catch {
    finish();
    Alert.alert("Order items", text);
  }
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
