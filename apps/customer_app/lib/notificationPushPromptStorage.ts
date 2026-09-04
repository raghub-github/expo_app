/**
 * Device-local persistence for the notification (FCM) permission sheet.
 * No backend writes — skip cooldown + "satisfied after successful register".
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import { STORAGE_KEYS } from "@/constants";

export const PUSH_PROMPT_SKIP_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;

export async function readPushPromptSatisfied(): Promise<boolean> {
  try {
    const v = await AsyncStorage.getItem(STORAGE_KEYS.PUSH_PROMPT_SATISFIED);
    return v === "1" || v === "true";
  } catch {
    return false;
  }
}

export async function writePushPromptSatisfied(satisfied: boolean): Promise<void> {
  try {
    if (satisfied) {
      await AsyncStorage.setItem(STORAGE_KEYS.PUSH_PROMPT_SATISFIED, "1");
      await AsyncStorage.removeItem(STORAGE_KEYS.PUSH_PROMPT_SKIP_UNTIL);
    } else {
      await AsyncStorage.removeItem(STORAGE_KEYS.PUSH_PROMPT_SATISFIED);
    }
  } catch {
    // non-blocking
  }
}

export async function readPushPromptSkipUntil(): Promise<number> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEYS.PUSH_PROMPT_SKIP_UNTIL);
    const n = raw ? Number(raw) : 0;
    return Number.isFinite(n) && n > 0 ? n : 0;
  } catch {
    return 0;
  }
}

export async function writePushPromptSkipCooldown(
  cooldownMs: number = PUSH_PROMPT_SKIP_COOLDOWN_MS
): Promise<number> {
  const until = Date.now() + cooldownMs;
  try {
    await AsyncStorage.setItem(STORAGE_KEYS.PUSH_PROMPT_SKIP_UNTIL, String(until));
  } catch {
    // non-blocking
  }
  return until;
}

export async function isPushPromptCooldownActive(): Promise<boolean> {
  const until = await readPushPromptSkipUntil();
  return until > Date.now();
}
