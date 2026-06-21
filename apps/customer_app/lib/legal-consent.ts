/**
 * Tracks which legal pack the user has consented to, and re-prompts when a
 * new material version ships.
 *
 * Storage: expo-secure-store (already a dependency). One key, JSON-encoded.
 *
 * Flow:
 *   - At app boot, call `loadConsent()`.
 *   - If `state.packVersion !== LEGAL_PACK_VERSION` → show the re-consent
 *     modal and call `recordConsent()` after the user accepts.
 *   - At onboarding (new user) → show the consent screen and call
 *     `recordConsent()` after they tap Accept.
 *
 * We never persist the user's name / phone here — only consent metadata.
 */

import * as SecureStore from "expo-secure-store";
import { LEGAL_PACK_VERSION, ONBOARDING_CONSENT_DOCS } from "./legal-registry";

const KEY = "gm_legal_consent_v1";

export type ConsentState = {
  /** LEGAL_PACK_VERSION at the moment the user accepted. */
  packVersion: string;
  /** ISO timestamp when the user accepted. */
  acceptedAt: string;
  /** IDs of the docs they explicitly checked / scrolled. */
  acceptedDocIds: string[];
  /** App version at time of consent (for audit). */
  appVersion?: string;
};

export async function loadConsent(): Promise<ConsentState | null> {
  try {
    const raw = await SecureStore.getItemAsync(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (typeof parsed?.packVersion !== "string") return null;
    return parsed as ConsentState;
  } catch {
    return null;
  }
}

export async function recordConsent(opts?: { appVersion?: string }): Promise<void> {
  const state: ConsentState = {
    packVersion: LEGAL_PACK_VERSION,
    acceptedAt: new Date().toISOString(),
    acceptedDocIds: ONBOARDING_CONSENT_DOCS.map((d) => d.id),
    appVersion: opts?.appVersion,
  };
  await SecureStore.setItemAsync(KEY, JSON.stringify(state));
}

export async function clearConsent(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(KEY);
  } catch {
    /* ignore */
  }
}

/** True if the user has accepted the current pack version. */
export async function hasCurrentConsent(): Promise<boolean> {
  const state = await loadConsent();
  return state?.packVersion === LEGAL_PACK_VERSION;
}
