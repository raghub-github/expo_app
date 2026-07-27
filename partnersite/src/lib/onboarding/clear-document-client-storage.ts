/**
 * Clear browser-stored onboarding document drafts / PII once Step 4 (Store documents)
 * is fully completed.
 *
 * Safe to call even when no draft keys exist.
 */

const EXPLICIT_KEYS = [
  "gm_onboarding_docs",
  "gm_onboarding_step4",
  "gm_step4_documents",
  "register_store_documents",
  "register-store-documents",
  "register_store_step4",
  "mx_register_store_docs",
];

const KEY_NEEDLES = [
  "gm_onboarding_docs",
  "gm_onboarding_step4",
  "gm_step4",
  "step4_doc",
  "step4-doc",
  "step4_draft",
  "step4-draft",
  "store_documents_draft",
  "store-documents-draft",
  "onboarding_doc",
  "onboarding-doc",
  "doc_draft",
  "doc-draft",
  "digilocker_draft",
  "digilocker-draft",
  "bank_verified_details",
  "pan_verified_details",
  "aadhaar_verified_details",
  "gst_verified_details",
  "mx_register_store_docs",
];

function shouldClearKey(key: string): boolean {
  const lower = key.toLowerCase();
  if (
    lower.includes("auth") ||
    lower.includes("supabase") ||
    lower.includes("sb-") ||
    lower === "selectedstoreid" ||
    lower.startsWith("mx_register_store_resume:") // keep resume step pointer for later steps
  ) {
    return false;
  }
  if (EXPLICIT_KEYS.some((k) => lower === k.toLowerCase() || lower.startsWith(`${k.toLowerCase()}:`))) {
    return true;
  }
  return KEY_NEEDLES.some((n) => lower.includes(n));
}

function clearMatching(storage: Storage): void {
  const keys: string[] = [];
  for (let i = 0; i < storage.length; i++) {
    const k = storage.key(i);
    if (k) keys.push(k);
  }
  for (const k of keys) {
    if (!shouldClearKey(k)) continue;
    try {
      storage.removeItem(k);
    } catch {
      /* ignore */
    }
  }
}

/** Remove Step-4 document drafts from localStorage + sessionStorage. */
export function clearOnboardingDocumentClientStorage(storeKey?: string | number | null): void {
  if (typeof window === "undefined") return;
  try {
    clearMatching(window.localStorage);
    clearMatching(window.sessionStorage);
    const id = storeKey != null ? String(storeKey).trim() : "";
    if (id) {
      const scoped = [
        `gm_onboarding_docs:v1:${id}`,
        `gm_onboarding_step4:v1:${id}`,
        `mx_register_store_docs:v1:${id}`,
        `register_store_documents:${id}`,
      ];
      for (const k of scoped) {
        try {
          window.localStorage.removeItem(k);
          window.sessionStorage.removeItem(k);
        } catch {
          /* ignore */
        }
      }
    }
  } catch {
    /* ignore */
  }
}
