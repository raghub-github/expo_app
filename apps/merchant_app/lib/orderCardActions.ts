import { Alert, Linking, Platform, Share } from "react-native";
import type { OrderRecord } from "@/hooks/useOrders";
import { formatOrderIdDisplay } from "@/components/order/orderFormatters";

function billLines(order: OrderRecord, storeName?: string | null, kotOnly = false): string {
  const id = formatOrderIdDisplay(order.formattedOrderId, order.ordersCoreId) || "ID unavailable";
  const header = [storeName?.trim() || "GatiMitra Partner", `Order ${id}`, ""];
  const items = order.lineItems.map(
    (it) =>
      kotOnly
        ? `${it.qty} x ${it.name}`
        : `${it.qty} x ${it.name} — ₹${it.price.toLocaleString("en-IN")}`
  );
  if (kotOnly) {
    return [...header, ...items].join("\n");
  }
  return [...header, ...items, "", `Total: ₹${order.total.toLocaleString("en-IN")}`].join("\n");
}

function billHtml(order: OrderRecord, storeName?: string | null, kotOnly = false): string {
  const id = formatOrderIdDisplay(order.formattedOrderId, order.ordersCoreId) || "ID unavailable";
  const rows = order.lineItems
    .map(
      (it) =>
        `<tr><td>${it.qty} x ${escapeHtml(it.name)}</td>${
          kotOnly ? "" : `<td style="text-align:right">₹${it.price}</td>`
        }</tr>`
    )
    .join("");
  const total = kotOnly
    ? ""
    : `<p style="font-weight:700;margin-top:12px">Total: ₹${order.total.toLocaleString("en-IN")}</p>`;
  return `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>Order ${id}</title></head><body style="font-family:sans-serif;padding:16px">
<h2>${escapeHtml(storeName || "GatiMitra Partner")}</h2>
<p><strong>Order ${escapeHtml(id)}</strong></p>
<table style="width:100%;border-collapse:collapse">${rows}</table>
${total}
</body></html>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export async function printOrderBill(
  order: OrderRecord,
  storeName?: string | null
): Promise<void> {
  if (Platform.OS === "web" && typeof window !== "undefined") {
    const w = window.open("", "_blank");
    if (w) {
      w.document.write(billHtml(order, storeName, false));
      w.document.close();
      w.focus();
      w.print();
    }
    return;
  }
  try {
    const Print = await import("expo-print");
    await Print.printAsync({ html: billHtml(order, storeName, false) });
  } catch {
    await Share.share({ message: billLines(order, storeName, false), title: "Order bill" });
  }
}

export async function printOrderKot(
  order: OrderRecord,
  storeName?: string | null
): Promise<void> {
  if (Platform.OS === "web" && typeof window !== "undefined") {
    const w = window.open("", "_blank");
    if (w) {
      w.document.write(billHtml(order, storeName, true));
      w.document.close();
      w.focus();
      w.print();
    }
    return;
  }
  try {
    const Print = await import("expo-print");
    await Print.printAsync({ html: billHtml(order, storeName, true) });
  } catch {
    await Share.share({ message: billLines(order, storeName, true), title: "KOT" });
  }
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
