import { Alert } from "react-native";

export const STORE_DELISTED_CODE = "STORE_DELISTED";
export const STORE_DELISTED_TITLE = "Store delisted";
export const STORE_DELISTED_MESSAGE =
  "This store is delisted. You cannot turn it online until GatiMitra relists it. Please contact support.";
export const MERCHANT_DELIST_SUPPORT_HREF = "/(tabs)/profile/contact";
export const STORE_RELISTED_MANUAL_OPEN_MARQUEE =
  "Store has been relisted. Turn the Store Status toggle ON once to go online. After that, auto on/off will work as usual.";

export function showStoreDelistedAlert(onContactSupport: () => void) {
  Alert.alert(STORE_DELISTED_TITLE, STORE_DELISTED_MESSAGE, [
    { text: "Got It", style: "cancel" },
    { text: "Contact support", onPress: onContactSupport },
  ]);
}

export function isStoreDelistedPayload(raw: unknown): boolean {
  if (!raw || typeof raw !== "object") return false;
  const row = raw as Record<string, unknown>;
  if (row.is_delisted === true || row.isDelisted === true) return true;
  if (row.delisted_at != null && String(row.delisted_at).trim() !== "") return true;
  return String(row.approval_status ?? "").toUpperCase() === "DELISTED";
}

export function needsManualOpenAfterRelist(opts: {
  isDelisted?: boolean;
  isOpen?: boolean | null;
  lastToggleType?: string | null;
  closeReason?: string | null;
  unavailableReason?: string | null;
}): boolean {
  if (opts.isDelisted) return false;
  if (opts.isOpen === true) return false;
  const toggle = String(opts.lastToggleType ?? "").trim().toUpperCase();
  if (toggle === "RELIST") return true;
  const reason = String(opts.closeReason ?? "");
  if (/relisted/i.test(reason)) return true;
  // Relist keeps the store CLOSED. Leftover "Store delisted" copy must still show the marquee.
  if (/store\s*delisted/i.test(reason)) return true;
  const unavail = String(opts.unavailableReason ?? "").trim().toLowerCase();
  return unavail === "manual_indefinite" && /relist|delist/i.test(reason);
}

