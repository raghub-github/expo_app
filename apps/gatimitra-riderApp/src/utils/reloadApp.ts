import { DevSettings, NativeModules, Platform } from "react-native";

/**
 * Reload the JS bundle (production OTA or dev).
 * Avoids blind DevSettings.reload on Android dev builds — that can crash with
 * JSBigFileString::fromPath when no on-disk bundle path exists (Metro URL mode).
 */
export async function reloadApp(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 120));

  if (__DEV__) {
    const devLauncher = NativeModules.ExpoDevLauncher as { reload?: () => void } | undefined;
    if (devLauncher?.reload) {
      devLauncher.reload();
      return;
    }

    if (Platform.OS === "web") {
      if (typeof globalThis.location?.reload === "function") {
        globalThis.location.reload();
      }
      return;
    }

    // Expo Go / Metro: only reload when dev support exposes a bundle URL.
    const devSupport = (
      NativeModules as {
        DevSettings?: { reload?: () => void };
        SourceCode?: { scriptURL?: string };
      }
    ).SourceCode;
    const scriptUrl = devSupport?.scriptURL;
    if (scriptUrl && DevSettings?.reload) {
      DevSettings.reload();
      return;
    }

    console.warn(
      "[reloadApp] Skipping DevSettings.reload — no dev bundle URL (use Metro reload: press r in terminal).",
    );
    return;
  }

  try {
    const Updates = require("expo-updates") as {
      isEnabled?: boolean;
      reloadAsync?: () => Promise<void>;
    };
    if (Updates?.isEnabled && Updates.reloadAsync) {
      await Updates.reloadAsync();
      return;
    }
  } catch {
    // expo-updates optional in dev / bare builds
  }

  DevSettings.reload();
}
