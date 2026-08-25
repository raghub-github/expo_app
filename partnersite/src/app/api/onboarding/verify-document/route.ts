import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { assertStoreAccess } from "@/lib/auth/assert-store-access";
import { fetchBackend } from "@/lib/fetch-backend";
import { resolveCashfreeDigilockerRedirectUrl } from "@/lib/cashfree-digilocker-redirect";

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
const UPI_VPA_RE = /^[a-z0-9.\-_]{2,256}@[a-z0-9]{2,64}$/i;

type BackendOutcome = {
  kind?: "auto" | "manual";
  policy?: { mode?: string; provider?: string | null };
  status?: string;
  status_reason?: string;
  verified_data?: Record<string, unknown>;
  error?: string;
  reason?: string;
  detail?: string | null;
};

/**
 * POST /api/onboarding/verify-document
 * Body: { storeId: "GMMC1027", docKind: "pan" | "gstin" | "bank" | "upi",
 *         pan?, name?, gstin?, businessName?, bankAccount?, ifsc?, vpa? }
 *
 * Interactive verification for the register-store step-4 UI. Proxies to the
 * backend verification engine (Cashfree per the super-admin policy) and maps
 * the result to what the UI needs:
 *
 *   { outcome: "verified", mode, verifiedData }  → show fetched details, continue
 *   { outcome: "failed",   mode }                → hybrid: reveal upload; auto: block
 *   { outcome: "manual",   mode }                → policy is manual/disabled: upload flow
 *
 * On "verified" the corresponding *_is_verified flag is set on
 * merchant_store_documents so the agent dashboard sees it as done.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const storeId = String(body.storeId ?? body.store_id ?? "");
    const docKind = String(body.docKind ?? "");

    const access = await assertStoreAccess(storeId);
    if (!access.ok) {
      return NextResponse.json({ success: false, error: access.error }, { status: access.status });
    }

    const secret = process.env.BACKEND_SCHEDULE_TICK_SECRET;
    if (!secret) {
      return NextResponse.json(
        { success: false, outcome: "manual", mode: "manual", error: "Verification service not configured." },
        { status: 200 },
      );
    }

    const subject = { subject_type: "merchant_store", subject_id: access.storeIdNum };
    let path: string;
    let payload: Record<string, unknown>;

    if (docKind === "pan") {
      const pan = String(body.pan ?? "").trim().toUpperCase();
      if (!PAN_RE.test(pan)) {
        return NextResponse.json({ success: false, error: "Invalid PAN format." }, { status: 400 });
      }
      // The merchant only types the PAN number — the name Cashfree matches
      // against is sourced automatically: explicit body name → saved PAN holder
      // name → store owner / display / store name → parent business name.
      let name = String(body.name ?? "").trim();
      const db = getDb();
      if (name.length < 2) {
        const [{ data: storeRows }, { data: docRow }] = await Promise.all([
          db
            .from("merchant_stores")
            .select("owner_full_name, store_display_name, store_name, parent_id")
            .eq("id", access.storeIdNum)
            .order("id", { ascending: false })
            .limit(1),
          db
            .from("merchant_store_documents")
            .select("pan_holder_name")
            .eq("store_id", access.storeIdNum)
            .order("created_at", { ascending: false })
            .limit(1),
        ]);
        const store = storeRows?.[0];
        name = String(
          docRow?.[0]?.pan_holder_name ||
          store?.owner_full_name ||
          store?.store_display_name ||
          store?.store_name ||
          "",
        ).trim();
        if (name.length < 2 && store?.parent_id) {
          const { data: parent } = await db
            .from("merchant_parents")
            .select("owner_name, parent_name")
            .eq("id", store.parent_id)
            .limit(1);
          name = String(parent?.[0]?.owner_name || parent?.[0]?.parent_name || "").trim();
        }
      }
      if (name.length < 2) {
        return NextResponse.json({ success: false, error: "Store owner name missing — complete Store Information first." }, { status: 400 });
      }
      path = "/v1/verification/submit/pan";
      payload = { ...subject, pan, name };
    } else if (docKind === "aadhaar") {
      // Aadhaar verifies through DigiLocker consent — no number needed here.
      // The backend returns a consent URL; the result lands via webhook and is
      // read back through /api/onboarding/verify-document/status.
      path = "/v1/verification/submit/digilocker";
      payload = {
        ...subject,
        documents: ["AADHAAR"],
        redirect_url: resolveCashfreeDigilockerRedirectUrl(body.redirectUrl),
      };
    } else if (docKind === "gstin") {
      const gstin = String(body.gstin ?? "").trim().toUpperCase();
      if (!GSTIN_RE.test(gstin)) {
        return NextResponse.json({ success: false, error: "Invalid GSTIN format." }, { status: 400 });
      }
      path = "/v1/verification/submit/gstin";
      payload = {
        ...subject,
        gstin,
        business_name: String(body.businessName ?? "").trim() || undefined,
      };
    } else if (docKind === "bank") {
      const bankAccount = String(body.bankAccount ?? "").replace(/\D/g, "");
      const ifsc = String(body.ifsc ?? "").trim().toUpperCase();
      if (!/^\d{6,20}$/.test(bankAccount)) {
        return NextResponse.json({ success: false, error: "Invalid account number." }, { status: 400 });
      }
      if (!IFSC_RE.test(ifsc)) {
        return NextResponse.json({ success: false, error: "Invalid IFSC." }, { status: 400 });
      }
      path = "/v1/verification/submit/bank";
      payload = {
        ...subject,
        bank_account: bankAccount,
        ifsc,
        name: String(body.name ?? "").trim() || undefined,
      };
    } else if (docKind === "upi") {
      const vpa = String(body.vpa ?? body.upiId ?? body.upi_id ?? "").trim().toLowerCase();
      if (!UPI_VPA_RE.test(vpa)) {
        return NextResponse.json({ success: false, error: "Invalid UPI ID." }, { status: 400 });
      }
      path = "/v1/verification/submit/upi";
      payload = {
        ...subject,
        vpa,
        name: String(body.name ?? "").trim() || undefined,
      };
    } else {
      return NextResponse.json({ success: false, error: "Unsupported docKind." }, { status: 400 });
    }

    const res = await fetchBackend(path, {
      method: "POST",
      headers: { "X-Internal-Secret": secret, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      timeoutMs: 30_000,
    });

    if (!res) {
      // Backend unreachable — treat like a provider outage: hybrid falls back
      // to upload, auto tells the user to retry later. Mode unknown → report
      // "hybrid" so the merchant is never hard-stuck because OUR server is down.
      console.error(
        "[verify-document] backend API unreachable — is the Fastify backend running on",
        process.env.GATIMITRA_BACKEND_API_URL || "http://127.0.0.1:3000",
        "?",
      );
      return NextResponse.json({
        success: true, outcome: "failed", mode: "hybrid",
        error: "Verification service is temporarily unavailable. You can upload the document instead.",
      });
    }

    const data = (await res.json().catch(() => ({}))) as BackendOutcome;

    if (!res.ok) {
      const detail = String(
        (data as { message?: string; reason?: string }).message
          || (data as { reason?: string }).reason
          || "",
      ).trim();
      console.error("[verify-document] backend non-OK:", res.status, data);
      return NextResponse.json({
        success: true, outcome: "failed", mode: "hybrid",
        error: data.error === "cashfree_not_configured"
          ? "Automatic verification is temporarily unavailable."
          : detail
            ? `Automatic verification failed: ${detail}`
            : `Verification failed (${data.error ?? res.status}).`,
      });
    }

    const mode = data.policy?.mode ?? "manual";

    if (data.kind === "manual") {
      const reason = String(data.reason ?? "");
      // Provider-side failures are NOT "policy says manual" — surface them as
      // failed so hybrid shows the upload fallback and auto blocks properly.
      if (reason.startsWith("provider_error") || reason === "provider_not_configured") {
        // data.detail carries Cashfree's own message (e.g. "IP not whitelisted.
        // Your current ip is x.x.x.x") — log it verbatim so ops can act.
        console.error("[verify-document] provider failure:", reason, "—", data.detail ?? "(no detail)");
        const detail = String(data.detail ?? "");
        const isIpBlock = /ip.*whitelist/i.test(detail);
        const isEnvMismatch = /belongs to prod|belongs to sandbox|prod environment|sandbox environment/i.test(detail);
        const isNotEnabled = /not enabled/i.test(detail) || reason === "provider_error_not_enabled";
        // Always expose hybrid-capable fallback to the UI when provider is down —
        // partnersite unlocks the upload zone on outcome=failed for auto+hybrid.
        const uiMode = mode === "auto" || mode === "hybrid" ? mode : "hybrid";
        return NextResponse.json({
          success: true, outcome: "failed", mode: uiMode,
          error: isEnvMismatch
            ? "Automatic verification is misconfigured (API keys do not match the Cashfree environment). You can upload the PAN card image for manual review."
            : isIpBlock
              ? "Automatic verification is temporarily unavailable (server not yet authorised with the verification provider)."
              : isNotEnabled
                ? "UPI auto-verify is not enabled on the Cashfree Secure ID account. Ask ops to enable UPI Penny Drop (or UPI Verification), then retry."
              : reason === "provider_error_auth"
                ? "Automatic verification is temporarily unavailable (provider authentication failed)."
                : detail
                  ? `Automatic verification failed: ${detail}`
                  : "Automatic verification is temporarily unavailable.",
        });
      }
      // Genuine policy manual / subject filtered — classic upload flow.
      return NextResponse.json({ success: true, outcome: "manual", mode, reason: reason || null });
    }

    // Backend auto path: status lives on the flattened body (sendOutcome).
    const status = String(data.status ?? "").toLowerCase();
    console.log("[verify-document] auto outcome:", {
      docKind,
      status,
      mode,
      status_reason: data.status_reason ?? null,
    });

    // Cashfree matched the PAN. Even if policy queues ops review (manual_review),
    // the merchant may proceed without uploading a card image.
    if (status === "verified" || status === "manual_review") {
      let verifiedData = (data.verified_data ?? {}) as Record<string, unknown>;
      const verifiedAt = new Date().toISOString();
      const pendingReview = status === "manual_review";

      try {
        const db = getDb();
        const { data: existingDoc } = await db
          .from("merchant_store_documents")
          .select(
            "id, pan_document_metadata, gst_document_metadata, aadhaar_document_metadata, extracted_data_summary",
          )
          .eq("store_id", access.storeIdNum)
          .maybeSingle();

        const {
          mergeAutoVerificationMetadata,
          mergeExtractedDataSummary,
          pickGstFetchedBusinessInfo,
          pickBankFetchedInfo,
          pickUpiFetchedInfo,
          flattenBankVerifiedData,
          pickPanFetchedInfo,
          flattenPanVerifiedData,
        } = await import("@/lib/merchant-doc-auto-verification");

        if (docKind === "pan") {
          verifiedData = flattenPanVerifiedData(verifiedData);
        }

        const method = "CASHFREE_AUTO" as const;
        const autoPayload = {
          method,
          status: status as "verified" | "manual_review",
          verified_at: verifiedAt,
          verified_data: verifiedData,
          document_number:
            docKind === "pan"
              ? String(payload.pan ?? verifiedData.pan ?? "").toUpperCase() || null
              : docKind === "gstin"
                ? String(payload.gstin ?? verifiedData.gstin ?? "").toUpperCase() || null
                : docKind === "bank"
                  ? String(payload.bank_account ?? "").replace(/\D/g, "") || null
                : docKind === "upi"
                  ? String(payload.vpa ?? "").toLowerCase() || null
                : null,
          verification_id: (data as { verification_id?: string }).verification_id ?? null,
          provider_reference: (data as { provider_reference?: string }).provider_reference ?? null,
          pending_review: pendingReview,
        };

        const patch: Record<string, unknown> = {
          store_id: access.storeIdNum,
          last_verification_id: autoPayload.verification_id,
          last_provider_reference: autoPayload.provider_reference,
          extracted_data_summary: mergeExtractedDataSummary(
            existingDoc?.extracted_data_summary,
            docKind === "gstin"
              ? "gstin"
              : docKind === "aadhaar"
                ? "aadhaar"
                : docKind === "bank"
                  ? "bank_account"
                  : docKind === "upi"
                    ? "upi_penny_drop"
                  : "pan",
            {
              provider: "cashfree",
              method,
              status,
              verifiedData,
              pendingReview,
            },
          ),
        };

        if (docKind === "pan") {
          const registered = pickPanFetchedInfo(verifiedData).registered_name ?? "";
          patch.pan_is_verified = true;
          patch.pan_verified_at = verifiedAt;
          patch.pan_rejection_reason = null;
          patch.pan_verification_method = method;
          if (autoPayload.document_number) patch.pan_document_number = autoPayload.document_number;
          if (registered) patch.pan_holder_name = registered;
          patch.pan_document_metadata = mergeAutoVerificationMetadata(
            existingDoc?.pan_document_metadata,
            autoPayload,
          );
        } else if (docKind === "gstin") {
          const gstInfo = pickGstFetchedBusinessInfo(verifiedData);
          patch.gst_is_verified = true;
          patch.gst_verified_at = verifiedAt;
          patch.gst_rejection_reason = null;
          patch.gst_verification_method = method;
          if (autoPayload.document_number) patch.gst_document_number = autoPayload.document_number;
          if (gstInfo.legal_business_name) {
            patch.gst_legal_business_name = gstInfo.legal_business_name;
          }
          if (gstInfo.principal_place_of_business) {
            patch.gst_principal_place_of_business = gstInfo.principal_place_of_business;
          }
          if (gstInfo.effective_registration_date) {
            patch.gst_effective_registration_date = gstInfo.effective_registration_date;
          }
          patch.gst_document_metadata = mergeAutoVerificationMetadata(
            existingDoc?.gst_document_metadata,
            autoPayload,
          );
        } else if (docKind === "aadhaar") {
          patch.aadhaar_is_verified = true;
          patch.aadhaar_verified_at = verifiedAt;
          patch.aadhaar_rejection_reason = null;
          patch.aadhaar_verification_method = method;
          patch.aadhaar_document_metadata = mergeAutoVerificationMetadata(
            existingDoc?.aadhaar_document_metadata,
            autoPayload,
          );
        } else if (docKind === "bank") {
          const account = String(payload.bank_account ?? "").replace(/\D/g, "");
          const ifsc = String(payload.ifsc ?? "").trim().toUpperCase();
          let bankInfo = pickBankFetchedInfo(verifiedData);

          // BAV sometimes omits branch — enrich from IFSC lookup when needed.
          if (!bankInfo.branch_name && ifsc) {
            try {
              const ifscRes = await fetchBackend("/v1/verification/submit/ifsc", {
                method: "POST",
                headers: { "X-Internal-Secret": secret, "Content-Type": "application/json" },
                body: JSON.stringify({ ...subject, ifsc }),
                timeoutMs: 15_000,
              });
              if (ifscRes?.ok) {
                const ifscBody = (await ifscRes.json().catch(() => ({}))) as {
                  status?: string;
                  verified_data?: Record<string, unknown>;
                };
                const ifscVd = (ifscBody.verified_data ?? {}) as Record<string, unknown>;
                if (
                  String(ifscBody.status ?? "").toLowerCase() === "verified" ||
                  Object.keys(ifscVd).length > 0
                ) {
                  const prevIfsc =
                    verifiedData.ifsc_details &&
                    typeof verifiedData.ifsc_details === "object" &&
                    !Array.isArray(verifiedData.ifsc_details)
                      ? (verifiedData.ifsc_details as Record<string, unknown>)
                      : {};
                  verifiedData = {
                    ...verifiedData,
                    ifsc_details: { ...prevIfsc, ...ifscVd },
                    branch_name:
                      String(ifscVd.branch ?? ifscVd.branch_name ?? "").trim() ||
                      verifiedData.branch_name,
                    bank_name:
                      String(verifiedData.bank_name ?? ifscVd.bank ?? "").trim() ||
                      verifiedData.bank_name,
                  };
                  bankInfo = pickBankFetchedInfo(verifiedData);
                }
              }
            } catch (ifscErr) {
              console.warn("[verify-document] IFSC enrich after bank failed:", ifscErr);
            }
          }

          verifiedData = flattenBankVerifiedData(verifiedData);
          bankInfo = pickBankFetchedInfo(verifiedData);

          const holder =
            bankInfo.name_at_bank ||
            String(payload.name ?? "").trim() ||
            "Verified Account";
          const bankName = bankInfo.bank_name || "Bank";
          const bankMeta = {
            auto_verification: {
              method,
              status,
              verified_at: verifiedAt,
              verified_data: verifiedData,
              document_number: account ? `****${account.slice(-4)}` : null,
              verification_id: autoPayload.verification_id,
              provider_reference: autoPayload.provider_reference,
              pending_review: pendingReview,
            },
          };
          const { data: existingBank } = await db
            .from("merchant_store_bank_accounts")
            .select("id")
            .eq("store_id", access.storeIdNum)
            .order("is_primary", { ascending: false })
            .limit(1)
            .maybeSingle();
          const bankPatch = {
            store_id: access.storeIdNum,
            account_holder_name: holder,
            account_number: account,
            ifsc_code: ifsc,
            bank_name: bankName,
            branch_name: bankInfo.branch_name,
            account_type: bankInfo.account_type,
            payout_method: "bank",
            is_primary: true,
            is_active: true,
            is_verified: true,
            upi_verified: false,
            verified_at: verifiedAt,
            verification_method: method,
            bank_metadata: bankMeta,
          };
          if (existingBank?.id) {
            await db.from("merchant_store_bank_accounts").update(bankPatch).eq("id", existingBank.id);
          } else {
            await db.from("merchant_store_bank_accounts").insert(bankPatch);
          }
        } else if (docKind === "upi") {
          const upiInfo = pickUpiFetchedInfo(verifiedData);
          const vpa = String(payload.vpa ?? "").trim().toLowerCase();
          const holder =
            upiInfo.name_at_bank ||
            String(payload.name ?? "").trim() ||
            vpa ||
            "UPI";
          const bankMeta = {
            auto_verification: {
              method,
              status,
              verified_at: verifiedAt,
              verified_data: verifiedData,
              document_number: vpa,
              verification_id: autoPayload.verification_id,
              provider_reference: autoPayload.provider_reference,
              pending_review: pendingReview,
            },
          };
          const { data: existingBank } = await db
            .from("merchant_store_bank_accounts")
            .select("id")
            .eq("store_id", access.storeIdNum)
            .order("is_primary", { ascending: false })
            .limit(1)
            .maybeSingle();
          const upiPatch = {
            store_id: access.storeIdNum,
            account_holder_name: holder,
            account_number: null,
            ifsc_code: null,
            bank_name: null,
            branch_name: null,
            payout_method: "upi",
            upi_id: vpa,
            upi_qr_screenshot_url: null,
            is_primary: true,
            is_active: true,
            is_verified: true,
            upi_verified: true,
            verified_at: verifiedAt,
            verification_method: method,
            bank_metadata: bankMeta,
          };
          if (existingBank?.id) {
            await db.from("merchant_store_bank_accounts").update(upiPatch).eq("id", existingBank.id);
          } else {
            await db.from("merchant_store_bank_accounts").insert(upiPatch);
          }
        }

        if (docKind !== "bank" && docKind !== "upi") {
          if (existingDoc?.id) {
            await db.from("merchant_store_documents").update(patch).eq("store_id", access.storeIdNum);
          } else {
            await db.from("merchant_store_documents").upsert([patch], { onConflict: "store_id" });
          }
        }
      } catch (e) {
        console.warn("[verify-document] persist verified state failed:", e);
      }

      return NextResponse.json({
        success: true,
        outcome: "verified",
        mode,
        pendingReview,
        verifiedData,
      });
    }

    if (docKind === "aadhaar" && status === "provider_processing") {
      // DigiLocker create step succeeded — hand the consent URL to the UI.
      const url = (data.verified_data as { url?: string } | undefined)?.url ?? null;
      if (url) {
        return NextResponse.json({ success: true, outcome: "digilocker", mode, url });
      }
      return NextResponse.json({ success: true, outcome: "manual", mode, reason: "digilocker_no_url" });
    }

    if (status === "provider_processing") {
      return NextResponse.json({ success: true, outcome: "manual", mode, reason: status });
    }

    // rejected / failed / timeout / provider_down
    return NextResponse.json({
      success: true, outcome: "failed", mode,
      error: data.status_reason || "Document could not be verified.",
    });
  } catch (e) {
    console.error("[verify-document] error:", e);
    return NextResponse.json({ success: false, error: "Server error" }, { status: 500 });
  }
}
