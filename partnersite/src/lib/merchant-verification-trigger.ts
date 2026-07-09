import { createClient } from "@supabase/supabase-js";
import { fetchBackend } from "@/lib/fetch-backend";

/**
 * Fire-and-forget auto-verification for merchant onboarding documents.
 *
 * After partnersite saves store documents (step-4 autosave or final
 * /api/register-store submit), this asks the backend verification module to
 * verify the doc NUMBERS through Cashfree:
 *
 *   PAN   → POST /v1/verification/submit/pan
 *   GSTIN → POST /v1/verification/submit/gstin
 *   Bank  → POST /v1/verification/submit/bank
 *
 * The backend policy engine decides what actually happens per document:
 * mode=manual → no-op (agent reviews the upload as today); auto/hybrid →
 * Cashfree call, low-confidence or provider failure falls back to the manual
 * review queue automatically (fallback_to_manual). So flipping modes in the
 * super-admin Policy Center now genuinely controls merchant onboarding.
 *
 * FSSAI / pharma / trade licences are intentionally NOT submitted — those
 * stay upload + manual review. Aadhaar auto-verify requires DigiLocker
 * consent, so it is also left to the manual queue for now.
 *
 * Auth: X-Internal-Secret (same shared secret as triggerStoreScheduleTick).
 * Everything here is best-effort: errors are logged, never thrown, so a
 * provider outage can never block onboarding.
 */

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder.supabase.co";
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "placeholder-service-role-key";

function getDb() {
  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

const PAN_RE = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
const GSTIN_RE = /^\d{2}[A-Z]{5}\d{4}[A-Z]{1}[A-Z\d]{1}[Z]{1}[A-Z\d]{1}$/i;
const IFSC_RE = /^[A-Z]{4}0[A-Z0-9]{6}$/;

async function submitToBackend(path: string, body: Record<string, unknown>): Promise<void> {
  const secret = process.env.BACKEND_SCHEDULE_TICK_SECRET;
  if (!secret) {
    console.warn("[merchant-verification] BACKEND_SCHEDULE_TICK_SECRET not set — skipping", path);
    return;
  }
  try {
    const res = await fetchBackend(path, {
      method: "POST",
      headers: { "X-Internal-Secret": secret, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      timeoutMs: 25_000,
    });
    if (!res) {
      console.warn("[merchant-verification] backend unreachable for", path);
      return;
    }
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    console.log(
      "[merchant-verification]",
      path,
      "→",
      res.status,
      data.kind ?? data.error ?? "",
      data.status ?? "",
    );
  } catch (e) {
    console.warn("[merchant-verification] submit failed:", path, e);
  }
}

export type MerchantVerificationInput = {
  /** merchant_stores.id (internal numeric id). */
  storeInternalId: number;
  /** Optional narrowing — when the caller knows what changed, pass only that. */
  only?: Array<"pan" | "gstin" | "bank">;
};

/**
 * Read the store's saved documents + primary bank account and submit whatever
 * is present and well-formed. Call WITHOUT await (fire-and-forget) from API
 * routes: `void triggerMerchantStoreVerifications({ storeInternalId })`.
 */
export async function triggerMerchantStoreVerifications(
  input: MerchantVerificationInput,
): Promise<void> {
  const { storeInternalId, only } = input;
  if (!Number.isInteger(storeInternalId) || storeInternalId < 1) return;
  const wants = (k: "pan" | "gstin" | "bank") => !only || only.includes(k);

  try {
    const db = getDb();

    const [{ data: store }, { data: docs }, { data: bank }] = await Promise.all([
      db
        .from("merchant_stores")
        .select("id, store_name, store_display_name, owner_full_name, store_phones")
        .eq("id", storeInternalId)
        .maybeSingle(),
      db
        .from("merchant_store_documents")
        .select("pan_document_number, pan_holder_name, gst_document_number")
        .eq("store_id", storeInternalId)
        .maybeSingle(),
      db
        .from("merchant_store_bank_accounts")
        .select("account_holder_name, account_number, ifsc_code")
        .eq("store_id", storeInternalId)
        .eq("is_primary", true)
        .eq("is_active", true)
        .limit(1)
        .maybeSingle(),
    ]);

    if (!store) return;

    const facts = { store_internal_id: storeInternalId };
    const subject = { subject_type: "merchant_store", subject_id: storeInternalId, subject_facts: facts };
    const runs: Array<Promise<void>> = [];

    // PAN — number + a name to match (holder name, else owner, else store).
    const pan = (docs?.pan_document_number ?? "").toString().trim().toUpperCase();
    const panName = (
      docs?.pan_holder_name ||
      store.owner_full_name ||
      store.store_display_name ||
      store.store_name ||
      ""
    ).toString().trim();
    if (wants("pan") && PAN_RE.test(pan) && panName.length >= 2) {
      runs.push(submitToBackend("/v1/verification/submit/pan", { ...subject, pan, name: panName }));
    }

    // GSTIN — number + business name for name-match context.
    const gstin = (docs?.gst_document_number ?? "").toString().trim().toUpperCase();
    if (wants("gstin") && GSTIN_RE.test(gstin)) {
      runs.push(
        submitToBackend("/v1/verification/submit/gstin", {
          ...subject,
          gstin,
          business_name: (store.store_name || store.store_display_name || "").toString().trim() || undefined,
        }),
      );
    }

    // Bank — pennyless BAV. If Cashfree is down/misconfigured the policy
    // engine's fallback_to_manual queues it for the agent (upload stays the
    // human-reviewable evidence).
    const account = (bank?.account_number ?? "").toString().replace(/\D/g, "");
    const ifsc = (bank?.ifsc_code ?? "").toString().trim().toUpperCase();
    if (wants("bank") && /^\d{6,20}$/.test(account) && IFSC_RE.test(ifsc)) {
      const phone = Array.isArray(store.store_phones)
        ? String(store.store_phones[0] ?? "")
        : String(store.store_phones ?? "");
      runs.push(
        submitToBackend("/v1/verification/submit/bank", {
          ...subject,
          bank_account: account,
          ifsc,
          name: (bank?.account_holder_name || store.owner_full_name || store.store_name || "").toString().trim() || undefined,
          phone: phone.replace(/\D/g, "").slice(-10) || undefined,
        }),
      );
    }

    if (runs.length === 0) return;
    await Promise.allSettled(runs);
  } catch (e) {
    console.warn("[merchant-verification] trigger failed for store", storeInternalId, e);
  }
}
