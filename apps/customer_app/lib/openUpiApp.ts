import { AppState, Linking, Platform } from "react-native";
import * as IntentLauncher from "expo-intent-launcher";

/**
 * Open the selected UPI app with a Razorpay (or WebView) intent URL.
 *
 * On Android, start a VIEW activity for `upi://pay?…` so PhonePe / GPay is a
 * child of GatiMitra. When the user finishes or cancels, the activity ends and
 * control returns here — that is how we land back in this app after success or fail.
 *
 * React Native `Linking.openURL("intent://…")` does not wait for a result and
 * often never comes back. Never gate on `canOpenURL` in Expo Go.
 */

const APP_SCHEMES: Record<string, string[]> = {
  phonepe: ["phonepe://pay", "phonepe://upi/pay", "ppe://pay"],
  google_pay: ["tez://upi/pay", "gpay://upi/pay", "tez://pay"],
  paytm: ["paytmmp://pay", "paytmmp://upi/pay"],
  bhim: ["bhim://pay", "bhim://upi/pay"],
  amazon_pay: ["amazonpay://upi/pay"],
  cred: ["cred://upi/pay"],
  whatsapp: ["whatsapp://upi/pay"],
};

const APP_PACKAGES: Record<string, string> = {
  google_pay: "com.google.android.apps.nbu.paisa.user",
  phonepe: "com.phonepe.app",
  paytm: "net.one97.paytm",
  bhim: "in.org.npci.upiapp",
  amazon_pay: "com.amazon.mShop.android.shopping",
  cred: "com.dreamplug.androidapp",
  whatsapp: "com.whatsapp",
};

export function unwrapIntentToUpiPay(url: string): string | null {
  const raw = String(url || "").trim();
  if (!raw) return null;
  if (raw.startsWith("upi://")) return raw;
  if (!raw.startsWith("intent://")) return null;
  const hash = raw.indexOf("#Intent;");
  if (hash < 0) return null;
  const path = raw.slice("intent://".length, hash);
  let scheme = "upi";
  for (const part of raw.slice(hash + "#Intent;".length).split(";")) {
    if (part.startsWith("scheme=")) scheme = part.slice("scheme=".length) || scheme;
  }
  return `${scheme}://${path}`;
}

function queryFromPayUrl(url: string): string {
  const i = url.indexOf("?");
  return i >= 0 ? url.slice(i + 1) : "";
}

function waitForReturnToForeground(timeoutMs: number): Promise<void> {
  return new Promise((resolve) => {
    let left = AppState.currentState !== "active";
    const finish = () => {
      sub.remove();
      clearTimeout(timer);
      resolve();
    };
    const sub = AppState.addEventListener("change", (next) => {
      if (next !== "active") left = true;
      if (next === "active" && left) finish();
    });
    const timer = setTimeout(finish, timeoutMs);
  });
}

async function openAndroidUpiActivity(upiPay: string, upiApp?: string): Promise<boolean> {
  const pkg = upiApp ? APP_PACKAGES[upiApp] : undefined;
  const attempts: Array<{ data: string; packageName?: string }> = [];
  if (pkg) attempts.push({ data: upiPay, packageName: pkg });
  attempts.push({ data: upiPay });

  for (const extra of attempts) {
    try {
      // Raw Android action string (equivalent to ActivityAction.VIEW, which isn't
      // exposed on the enum in this expo-intent-launcher version). startActivityAsync
      // accepts the action as a string.
      await IntentLauncher.startActivityAsync("android.intent.action.VIEW", extra);
      return true;
    } catch {
      // app missing or activity rejected — try the next target
    }
  }
  return false;
}

export async function openUpiApp(url: string, upiApp?: string): Promise<boolean> {
  const upiPay = unwrapIntentToUpiPay(url) ?? (url.startsWith("upi://") ? url : null);
  const q = upiPay ? queryFromPayUrl(upiPay) : "";

  if (Platform.OS === "android" && upiPay) {
    const opened = await openAndroidUpiActivity(upiPay, upiApp);
    if (opened) return true;
  }

  const tries: string[] = [];
  if (upiApp && q) {
    for (const base of APP_SCHEMES[upiApp] ?? []) {
      tries.push(`${base}?${q}`);
    }
  }
  if (upiPay) tries.push(upiPay);
  if (url && !url.startsWith("intent://") && !tries.includes(url)) {
    tries.push(url);
  }

  for (const candidate of tries) {
    try {
      await Linking.openURL(candidate);
      await new Promise((r) => setTimeout(r, 800));
      if (AppState.currentState !== "active") {
        await waitForReturnToForeground(5 * 60 * 1000);
      }
      return true;
    } catch {
      // try the next scheme
    }
  }
  return false;
}

export function upiAppDisplayName(upiApp?: string | null): string {
  if (upiApp === "google_pay") return "Google Pay";
  if (upiApp === "phonepe") return "PhonePe";
  if (upiApp === "paytm") return "Paytm";
  if (upiApp === "bhim") return "BHIM";
  if (upiApp === "amazon_pay") return "Amazon Pay";
  if (upiApp === "cred") return "CRED";
  if (upiApp === "whatsapp") return "WhatsApp";
  return "UPI";
}
