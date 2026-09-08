/**
 * Tracks which legal pack the user has consented to, and re-prompts when a
 * new material version ships.
 *
 * Source of truth: server (customers.legal_consent_pack_version).
 * Local SecureStore is a cache for offline / faster boot.
 */

import * as SecureStore from "expo-secure-store";
import api from "@/services/api";
import { getDeviceIdAsync } from "@/utils/deviceId";
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

export type LegalConsentStatus = {
  pack_version: string | null;
  accepted_at: string | null;
  has_current_consent: boolean;
  required_pack_version: string;
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

async function saveLocalConsent(state: ConsentState): Promise<void> {
  await SecureStore.setItemAsync(KEY, JSON.stringify(state));
}

let consentInFlight: Promise<LegalConsentStatus | null> | null = null;
let consentMemory: { at: number; status: LegalConsentStatus } | null = null;
const CONSENT_MEMORY_TTL_MS = 5 * 60 * 1000;

export async function fetchServerConsentStatus(): Promise<LegalConsentStatus | null> {
  if (consentMemory && Date.now() - consentMemory.at < CONSENT_MEMORY_TTL_MS) {
    return consentMemory.status;
  }
  if (consentInFlight) return consentInFlight;
  consentInFlight = (async () => {
    try {
      const { data } = await api.get<LegalConsentStatus>("/v1/me/legal-consent");
      if (data) consentMemory = { at: Date.now(), status: data };
      return data;
    } catch {
      return null;
    } finally {
      consentInFlight = null;
    }
  })();
  return consentInFlight;
}

export async function recordConsent(opts?: { appVersion?: string }): Promise<void> {
  const state: ConsentState = {
    packVersion: LEGAL_PACK_VERSION,
    acceptedAt: new Date().toISOString(),
    acceptedDocIds: ONBOARDING_CONSENT_DOCS.map((d) => d.id),
    appVersion: opts?.appVersion,
  };

  let deviceId: string | undefined;
  try {
    deviceId = await getDeviceIdAsync();
  } catch {
    /* optional */
  }

  await api.post<LegalConsentStatus>("/v1/me/legal-consent", {
    pack_version: LEGAL_PACK_VERSION,
    app_version: opts?.appVersion,
    accepted_doc_ids: state.acceptedDocIds,
    device_id: deviceId,
  });

  await saveLocalConsent(state);
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
  // Local cache first — avoids duplicate GETs on every route change / cold boot race.
  const local = await loadConsent();
  if (local?.packVersion === LEGAL_PACK_VERSION) {
    return true;
  }

  const server = await fetchServerConsentStatus();
  if (server?.has_current_consent) {
    await saveLocalConsent({
      packVersion: server.required_pack_version,
      acceptedAt: server.accepted_at ?? new Date().toISOString(),
      acceptedDocIds: ONBOARDING_CONSENT_DOCS.map((d) => d.id),
    });
    return true;
  }

  return false;
}

export async function syncConsentFromProfile(profile: {
  legal_consent_pack_version?: string | null;
  legal_consent_at?: string | null;
}): Promise<boolean> {
  const pack = profile.legal_consent_pack_version?.trim();
  if (pack === LEGAL_PACK_VERSION) {
    await saveLocalConsent({
      packVersion: pack,
      acceptedAt: profile.legal_consent_at ?? new Date().toISOString(),
      acceptedDocIds: ONBOARDING_CONSENT_DOCS.map((d) => d.id),
    });
    return true;
  }
  return false;
}
