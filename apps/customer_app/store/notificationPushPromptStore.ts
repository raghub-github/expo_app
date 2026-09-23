/**
 * Post-login notification (FCM) permission sheet.
 * Shown when push tokens are missing; Skip → 7-day local cooldown; never blocks the app.
 */
import { create } from "zustand";
import {
  isPushPromptCooldownActive,
  readPushPromptSatisfied,
  writePushPromptSatisfied,
  writePushPromptSkipCooldown,
} from "@/lib/notificationPushPromptStorage";

type NotificationPushPromptState = {
  showSheet: boolean;
  allowInFlight: boolean;
  /** At most one prompt attempt per app process. */
  promptedThisSession: boolean;
  dismissedThisSession: boolean;
  setShowSheet: (show: boolean) => void;
  /**
   * Evaluate whether to show the sheet.
   * Call after a token sync attempt with the resulting token presence.
   */
  promptIfNeeded: (opts: {
    hasPushToken: boolean;
    /** Expo Go cannot complete native FCM — skip the sheet. */
    expoGo?: boolean;
  }) => Promise<boolean>;
  handleSkip: () => Promise<void>;
  beginAllow: () => void;
  endAllow: () => void;
  /**
   * Close the sheet INSTANTLY the moment the OS permission dialog is answered
   * (granted). State is set synchronously so the modal disappears with zero
   * delay; the "satisfied" flag persists in the background. Token registration /
   * backend sync happen after this, off the UI path.
   */
  markGrantedInstant: () => void;
  /** Call when Expo and/or native token registered successfully. */
  markTokenRegistered: () => Promise<void>;
  /** Permission/token lost — allow future prompts (still respects cooldown). */
  markTokenMissing: () => Promise<void>;
};

export const useNotificationPushPromptStore = create<NotificationPushPromptState>(
  (set, get) => ({
    showSheet: false,
    allowInFlight: false,
    promptedThisSession: false,
    dismissedThisSession: false,

    setShowSheet: (show) => set({ showSheet: show }),

    promptIfNeeded: async ({ hasPushToken, expoGo }) => {
      if (expoGo) {
        set({ showSheet: false });
        return false;
      }
      if (hasPushToken) {
        await get().markTokenRegistered();
        return false;
      }

      const {
        promptedThisSession,
        dismissedThisSession,
        showSheet,
        allowInFlight,
      } = get();
      if (promptedThisSession || dismissedThisSession || showSheet || allowInFlight) {
        return showSheet;
      }

      if (await readPushPromptSatisfied()) {
        // Previously satisfied but token gone — clear so cooldown/session rules apply.
        await writePushPromptSatisfied(false);
      }

      if (await isPushPromptCooldownActive()) {
        set({ promptedThisSession: true, showSheet: false });
        return false;
      }

      set({
        showSheet: true,
        promptedThisSession: true,
      });
      return true;
    },

    handleSkip: async () => {
      await writePushPromptSkipCooldown();
      set({
        showSheet: false,
        dismissedThisSession: true,
        allowInFlight: false,
      });
    },

    beginAllow: () => set({ allowInFlight: true }),

    endAllow: () => set({ allowInFlight: false }),

    markGrantedInstant: () => {
      // Synchronous close — no await, so the sheet vanishes immediately.
      set({
        showSheet: false,
        allowInFlight: false,
        promptedThisSession: true,
      });
      // Persist "satisfied" off the UI path so it never re-nags after a kill.
      void writePushPromptSatisfied(true);
    },

    markTokenRegistered: async () => {
      await writePushPromptSatisfied(true);
      set({
        showSheet: false,
        allowInFlight: false,
        promptedThisSession: true,
      });
    },

    markTokenMissing: async () => {
      await writePushPromptSatisfied(false);
    },
  })
);
