import { create } from "zustand";
import { Platform } from "react-native";
import {
  getSmsPermissionGranted,
  isSmsReadPermissionApplicable,
  revalidateSmsPermissionAfterSettings,
  runSmsAllowPipeline,
} from "@/lib/smsPermissionManager";
import { profileService } from "@/services/profile.service";
import { useAuthStore } from "@/store/authStore";

type SmsPermissionState = {
  showSheet: boolean;
  granted: boolean | null;
  dismissedThisSession: boolean;
  blocksLocation: boolean;
  allowInFlight: boolean;
  /** Prevent Settings open loop after user already returned once. */
  settingsRedirectUsed: boolean;
  setShowSheet: (show: boolean) => void;
  promptSmsPermissionIfNeeded: () => Promise<boolean>;
  handleAllowSmsPermission: () => Promise<boolean>;
  dismissSmsPermissionSheet: () => void;
  beginSmsAllowRequest: () => void;
  endSmsAllowRequest: () => void;
  /** Call on AppState active — fresh OS check, never stale cache. */
  recheckAfterAppActive: () => Promise<boolean>;
  syncSmsPermissionToProfile: (granted: boolean) => Promise<void>;
};

async function syncProfile(granted: boolean) {
  if (!useAuthStore.getState().session?.accessToken) return;
  try {
    await profileService.updateProfile({ sms_permission: granted });
  } catch {
    // non-blocking
  }
}

function computeBlocksLocation(state: {
  granted: boolean | null;
  dismissedThisSession: boolean;
}): boolean {
  if (Platform.OS !== "android") return false;
  if (!isSmsReadPermissionApplicable()) return false;
  if (state.granted === true || state.dismissedThisSession) return false;
  return true;
}

export function isSmsBlockingLocationPrompts(): boolean {
  return useSmsPermissionStore.getState().blocksLocation;
}

function markSatisfied(set: (p: Partial<SmsPermissionState>) => void) {
  set({
    granted: true,
    showSheet: false,
    blocksLocation: false,
    allowInFlight: false,
  });
}

export const useSmsPermissionStore = create<SmsPermissionState>((set, get) => ({
  showSheet: false,
  granted: null,
  dismissedThisSession: false,
  // Don't block location for Expo Go / iOS — SMS read isn't applicable.
  blocksLocation: Platform.OS === "android" && isSmsReadPermissionApplicable(),
  allowInFlight: false,
  settingsRedirectUsed: false,

  setShowSheet: (show) =>
    set((prev) => ({
      showSheet: show,
      blocksLocation: computeBlocksLocation(prev),
    })),

  beginSmsAllowRequest: () =>
    set({
      allowInFlight: true,
      showSheet: false,
      blocksLocation: computeBlocksLocation(get()),
    }),

  endSmsAllowRequest: () => set({ allowInFlight: false }),

  promptSmsPermissionIfNeeded: async () => {
    if (get().allowInFlight) return false;

    // Fresh OS / applicability check every time.
    const ok = await getSmsPermissionGranted();
    if (ok) {
      markSatisfied(set);
      void syncProfile(true);
      return true;
    }

    if (!isSmsReadPermissionApplicable()) {
      markSatisfied(set);
      void syncProfile(true);
      return true;
    }

    if (get().dismissedThisSession) {
      set({ granted: false, showSheet: false, blocksLocation: false });
      return false;
    }

    set({
      granted: false,
      showSheet: true,
      blocksLocation: true,
    });
    return false;
  },

  handleAllowSmsPermission: async () => {
    if (get().allowInFlight) return false;

    // Fresh check first — if already granted / N/A, never open Settings.
    const alreadyOk = await getSmsPermissionGranted();
    if (alreadyOk) {
      markSatisfied(set);
      void syncProfile(true);
      return true;
    }

    set({
      showSheet: false,
      allowInFlight: true,
      blocksLocation: true,
    });

    try {
      const result = await runSmsAllowPipeline({
        openSettingsOnPermanentDeny: !get().settingsRedirectUsed,
      });

      if (result.status === "granted" || result.status === "skipped" || result.notApplicable) {
        markSatisfied(set);
        void syncProfile(true);
        return true;
      }

      // Re-validate OS immediately after pipeline (covers OEM quirks).
      const okNow = await revalidateSmsPermissionAfterSettings();
      if (okNow) {
        markSatisfied(set);
        void syncProfile(true);
        return true;
      }

      if (result.openedSettings) {
        set({
          granted: false,
          showSheet: false,
          blocksLocation: true,
          allowInFlight: false,
          settingsRedirectUsed: true,
        });
      } else {
        set({
          granted: false,
          showSheet: true,
          blocksLocation: true,
          allowInFlight: false,
        });
      }
      return false;
    } catch {
      set({
        granted: false,
        showSheet: true,
        blocksLocation: true,
        allowInFlight: false,
      });
      return false;
    }
  },

  recheckAfterAppActive: async () => {
    if (get().allowInFlight) return false;
    const ok = await revalidateSmsPermissionAfterSettings();
    if (ok) {
      markSatisfied(set);
      void syncProfile(true);
      return true;
    }
    // Still denied after Settings — show sheet once; do not auto-open Settings again.
    if (!get().dismissedThisSession && isSmsReadPermissionApplicable()) {
      set({
        granted: false,
        showSheet: true,
        blocksLocation: true,
      });
    }
    return false;
  },

  dismissSmsPermissionSheet: () => {
    set({
      showSheet: false,
      dismissedThisSession: true,
      blocksLocation: false,
      allowInFlight: false,
    });
    void syncProfile(false);
  },

  syncSmsPermissionToProfile: syncProfile,
}));
