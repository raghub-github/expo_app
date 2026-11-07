/**
 * Dev-only diagnostics for Metro `LoadBundleFromServerRequestError`.
 *
 * Root cause is almost always: the device cannot reach the Expo/Metro packager
 * (wrong LAN IP, Wi‑Fi flap, Metro restart mid-HMR, or stale debuggerHost).
 * Production embeds the JS bundle and never hits this path.
 *
 * Converts the unhandled rejection into a handled diagnostic (preventDefault)
 * while still surfacing a clear console.error + one-shot Alert with Reload.
 * Does NOT LogBox.ignore this error.
 */

import { Alert, DevSettings, Platform } from "react-native";
import Constants from "expo-constants";

let installed = false;
let alertOpen = false;

function messageOf(reason: unknown): string {
  if (reason instanceof Error) return reason.message || reason.name;
  if (typeof reason === "string") return reason;
  try {
    return String(reason ?? "");
  } catch {
    return "";
  }
}

function isBundleLoadFailure(message: string, reason: unknown): boolean {
  const name =
    reason && typeof reason === "object" && "name" in reason
      ? String((reason as { name?: unknown }).name ?? "")
      : "";
  return (
    name.includes("LoadBundleFromServer") ||
    message.includes("LoadBundleFromServerRequestError") ||
    message.includes("LoadBundleFromServerError") ||
    message.includes("Could not load bundle")
  );
}

function bundlerHint(): string {
  const hostUri =
    Constants.expoConfig?.hostUri ??
    (Constants.expoGoConfig as { hostUri?: string } | undefined)?.hostUri ??
    (Constants.manifest as { debuggerHost?: string } | null)?.debuggerHost ??
    "unknown";
  return String(hostUri);
}

function showDevAlertOnce(detail: string) {
  if (alertOpen) return;
  alertOpen = true;
  const host = bundlerHint();
  Alert.alert(
    "Could not load JS bundle",
    [
      detail,
      "",
      `Metro host: ${host}`,
      "Keep the phone on the same Wi‑Fi as this PC,",
      "confirm Metro is running on port 8081, then Reload.",
    ].join("\n"),
    [
      {
        text: "Dismiss",
        style: "cancel",
        onPress: () => {
          alertOpen = false;
        },
      },
      {
        text: "Reload",
        onPress: () => {
          alertOpen = false;
          try {
            DevSettings.reload();
          } catch {
            /* Expo Go may lack DevSettings on some builds */
          }
        },
      },
    ],
    {
      cancelable: true,
      onDismiss: () => {
        alertOpen = false;
      },
    }
  );
}

export function installBundleLoadDiagnostics(): void {
  if (installed) return;
  installed = true;
  if (!__DEV__) return;
  if (Platform.OS === "web") return;

  const onRejection = (event: PromiseRejectionEvent) => {
    const reason = event?.reason;
    const message = messageOf(reason);
    if (!isBundleLoadFailure(message, reason)) return;

    try {
      event.preventDefault?.();
    } catch {
      /* ignore */
    }

    const host = bundlerHint();
    console.error(
      "[GatiMitra][bundle] LoadBundleFromServerRequestError — Metro unreachable or interrupted.",
      {
        host,
        message,
        hint: "Phone Wi‑Fi must reach the PC LAN IP serving Expo/Metro :8081. Restart Metro if the host IP changed.",
      }
    );
    showDevAlertOnce(message || "Could not load bundle from the development server.");
  };

  if (typeof globalThis.addEventListener === "function") {
    globalThis.addEventListener("unhandledrejection", onRejection);
  }
}
