/**
 * Customer SMS permission manager.
 *
 * OTP autofill uses Android SMS Retriever when available (no READ_SMS).
 * READ_SMS is only requestable in a custom native build that declares it.
 * Expo Go cannot grant READ_SMS — never send users to Settings for that case.
 *
 * Callers must unmount RN Modal before `runSmsAllowPipeline`.
 */

import { Platform, PermissionsAndroid, Linking, InteractionManager } from "react-native";
import Constants from "expo-constants";

export type SmsPermissionStatus = "granted" | "denied" | "undetermined" | "not_applicable";

export type SmsAllowPipelineResult = {
  status: "granted" | "denied" | "skipped";
  openedSettings: boolean;
  showedSystemDialog: boolean;
  /** True when READ_SMS is not needed / not available (iOS, Expo Go). */
  notApplicable: boolean;
};

function isExpoGo(): boolean {
  return Constants.appOwnership === "expo";
}

/** READ_SMS cannot be granted in Expo Go; OTP still works via Retriever / manual entry. */
export function isSmsReadPermissionApplicable(): boolean {
  if (Platform.OS !== "android") return false;
  if (isExpoGo()) return false;
  return true;
}

async function openAppSettings(): Promise<void> {
  try {
    if (Platform.OS === "ios") {
      await Linking.openURL("app-settings:");
      return;
    }
    await Linking.openSettings();
  } catch {
    try {
      await Linking.openSettings();
    } catch {
      // ignore
    }
  }
}

async function waitForModalTeardown(): Promise<void> {
  await new Promise<void>((resolve) => {
    InteractionManager.runAfterInteractions(() => resolve());
  });
  await new Promise((r) => requestAnimationFrame(() => r(undefined)));
  await new Promise((r) => setTimeout(r, 120));
}

/**
 * Fresh OS check — never cache. Returns:
 * - granted / denied on Android custom builds
 * - not_applicable on iOS / Expo Go
 */
export async function getSmsPermissionStatus(): Promise<SmsPermissionStatus> {
  if (!isSmsReadPermissionApplicable()) {
    return "not_applicable";
  }
  try {
    const ok = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.READ_SMS);
    return ok ? "granted" : "denied";
  } catch {
    return "undetermined";
  }
}

/** True when flow can proceed (granted OR not applicable). */
export async function getSmsPermissionGranted(): Promise<boolean> {
  const status = await getSmsPermissionStatus();
  return status === "granted" || status === "not_applicable";
}

/**
 * Allow pipeline (fresh check every time):
 * 1) Not applicable (iOS / Expo Go) → skip as success, never Settings
 * 2) Already granted → success, never Settings
 * 3) Runtime READ_SMS dialog
 * 4) NEVER_ASK_AGAIN → Settings once
 * 5) Soft deny → denied, no Settings
 */
export async function runSmsAllowPipeline(options?: {
  /** Only open Settings on permanent deny. Default true. */
  openSettingsOnPermanentDeny?: boolean;
}): Promise<SmsAllowPipelineResult> {
  const openSettingsOnPermanentDeny = options?.openSettingsOnPermanentDeny !== false;

  if (!isSmsReadPermissionApplicable()) {
    return {
      status: "skipped",
      openedSettings: false,
      showedSystemDialog: false,
      notApplicable: true,
    };
  }

  // Always re-read OS — never trust UI/cache.
  const already = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.READ_SMS);
  if (already) {
    return {
      status: "granted",
      openedSettings: false,
      showedSystemDialog: false,
      notApplicable: false,
    };
  }

  await waitForModalTeardown();

  try {
    const read = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.READ_SMS);

    // Re-check after dialog — some OEMs report inconsistently.
    const grantedNow = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.READ_SMS);
    if (grantedNow || read === PermissionsAndroid.RESULTS.GRANTED) {
      void PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.RECEIVE_SMS).catch(() => undefined);
      return {
        status: "granted",
        openedSettings: false,
        showedSystemDialog: true,
        notApplicable: false,
      };
    }

    if (read === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN && openSettingsOnPermanentDeny) {
      await openAppSettings();
      return {
        status: "denied",
        openedSettings: true,
        showedSystemDialog: true,
        notApplicable: false,
      };
    }

    return {
      status: "denied",
      openedSettings: false,
      showedSystemDialog: true,
      notApplicable: false,
    };
  } catch {
    // Do NOT open Settings on unexpected errors — avoid Settings loops.
    return {
      status: "denied",
      openedSettings: false,
      showedSystemDialog: false,
      notApplicable: false,
    };
  }
}

/** Re-validate after returning from Settings (fresh OS read). */
export async function revalidateSmsPermissionAfterSettings(): Promise<boolean> {
  return getSmsPermissionGranted();
}

export async function openSmsPermissionSettings(): Promise<void> {
  await openAppSettings();
}

/** @deprecated */
export async function requestSmsPermissionOrOpenSettings(options?: {
  openSettingsOnDeny?: boolean;
}): Promise<{ status: "granted" | "denied"; openedSettings: boolean }> {
  const result = await runSmsAllowPipeline({
    openSettingsOnPermanentDeny: options?.openSettingsOnDeny !== false,
  });
  if (result.status === "skipped" || result.notApplicable) {
    return { status: "granted", openedSettings: false };
  }
  return { status: result.status === "granted" ? "granted" : "denied", openedSettings: result.openedSettings };
}
