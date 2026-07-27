/**
 * POST /api/onboarding/verify-document
 *
 * Area-manager / merchant dashboard interactive verify (Cashfree via backend).
 * Mirrors partnersite verify-document: persists pan/gst flags + details on
 * merchant_store_documents so refresh restores verified state.
 */
import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { hasDashboardAccessByAuth, isSuperAdmin } from "@/lib/permissions/engine";
import { getSystemUserByEmail } from "@/lib/auth/user-mapping";
import { getAreaManagerByUserId } from "@/lib/area-manager/auth";
import { getMerchantStoreById } from "@/lib/db/operations/merchant-stores";
import { getSql } from "@/lib/db/client";
import { backendFetch } from "@/lib/notif-backend";
import {
  mergeAutoVerificationMetadata,
  mergeExtractedDataSummary,
  pickBankFetchedInfo,
  flattenBankVerifiedData,
  pickGstFetchedBusinessInfo,
  pickUpiFetchedInfo,
  type DocAutoVerificationPayload,
} from "@/lib/merchant-doc-auto-verification";
import { resolveCashfreeDigilockerRedirectUrl } from "@/lib/cashfree-digilocker-redirect";

export const runtime = "nodejs";

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
  verification_id?: string;
  provider_reference?: string;
  error?: string;
  reason?: string;
  detail?: string | null;
};

async function assertStoreAccess(storeIdNum: number) {
  const supabase = await createServerSupabaseClient();
  let {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user?.email) {
    try {
      await supabase.auth.getSession();
    } catch {
      /* ignore */
    }
    const retry = await supabase.auth.getUser();
    user = retry.data.user;
    error = retry.error;
  }
  if (error || !user?.email) {
    return { ok: false as const, status: 401, error: "Not authenticated" };
  }
  const allowed =
    (await isSuperAdmin(user.id, user.email)) ||
    (await hasDashboardAccessByAuth(user.id, user.email, "MERCHANT")) ||
    (await hasDashboardAccessByAuth(user.id, user.email, "AREA_MANAGER"));
  if (!allowed) {
    return { ok: false as const, status: 403, error: "Dashboard access required" };
  }
  let areaManagerId: number | null = null;
  if (!(await isSuperAdmin(user.id, user.email))) {
    const systemUser = await getSystemUserByEmail(user.email);
    if (systemUser) {
      const am = await getAreaManagerByUserId(systemUser.id);
      if (am) areaManagerId = am.id;
    }
  }
  const store = await getMerchantStoreById(storeIdNum, areaManagerId);
  if (!store) {
    return { ok: false as const, status: 404, error: "Store not found" };
  }
  return { ok: true as const, storeIdNum, store };
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const storeInternalId = Number(body.storeInternalId ?? body.store_id ?? body.storeId ?? 0);
    const docKind = String(body.docKind ?? "");

    if (!Number.isFinite(storeInternalId) || storeInternalId < 1) {
      return NextResponse.json({ success: false, error: "Invalid store id" }, { status: 400 });
    }

    const access = await assertStoreAccess(storeInternalId);
    if (!access.ok) {
      return NextResponse.json({ success: false, error: access.error }, { status: access.status });
    }

    let path: string;
    let payload: Record<string, unknown>;
    const subject = { subject_type: "merchant_store", subject_id: storeInternalId };

    if (docKind === "pan") {
      const pan = String(body.pan ?? "").trim().toUpperCase();
      if (!PAN_RE.test(pan)) {
        return NextResponse.json({ success: false, error: "Invalid PAN format." }, { status: 400 });
      }
      let name = String(body.name ?? "").trim();
      if (name.length < 2) {
        const sql = getSql();
        const rows = (await sql`
          SELECT s.owner_full_name, s.store_display_name, s.store_name, d.pan_holder_name
            FROM public.merchant_stores s
            LEFT JOIN public.merchant_store_documents d ON d.store_id = s.id
           WHERE s.id = ${storeInternalId}
           LIMIT 1
        `) as unknown as Array<{
          owner_full_name: string | null;
          store_display_name: string | null;
          store_name: string | null;
          pan_holder_name: string | null;
        }>;
        const r = rows[0];
        name = String(
          r?.pan_holder_name ||
            r?.owner_full_name ||
            r?.store_display_name ||
            r?.store_name ||
            "",
        ).trim();
      }
      if (name.length < 2) {
        return NextResponse.json(
          { success: false, error: "PAN holder name missing — enter Name as on PAN." },
          { status: 400 },
        );
      }
      path = "/v1/verification/submit/pan";
      payload = { ...subject, pan, name };
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
    } else if (docKind === "aadhaar") {
      path = "/v1/verification/submit/digilocker";
      payload = {
        ...subject,
        documents: ["AADHAAR"],
        redirect_url: resolveCashfreeDigilockerRedirectUrl(body.redirectUrl),
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

    const res = await backendFetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (res.status === 503 && (res.body as { error?: string })?.error === "backend_not_configured") {
      return NextResponse.json({
        success: true,
        outcome: "failed",
        mode: "hybrid",
        error: "Verification service is temporarily unavailable. You can upload the document instead.",
      });
    }

    const data = (res.body ?? {}) as BackendOutcome;

    if (res.status < 200 || res.status >= 300) {
    const detail = String(
      (data as { message?: string }).message ?? data.detail ?? data.reason ?? data.error ?? "",
    ).trim();
      return NextResponse.json({
        success: true,
        outcome: "failed",
        mode: "hybrid",
        error: detail
          ? `Automatic verification failed: ${detail}`
          : `Verification failed (${data.error ?? res.status}).`,
      });
    }

    const mode = data.policy?.mode ?? "manual";

    if (data.kind === "manual") {
      const reason = String(data.reason ?? "");
      if (reason.startsWith("provider_error") || reason === "provider_not_configured") {
        const detail = String(data.detail ?? "");
        const uiMode = mode === "auto" || mode === "hybrid" ? mode : "hybrid";
        const isNotEnabled =
          /not enabled/i.test(detail) || reason === "provider_error_not_enabled";
        return NextResponse.json({
          success: true,
          outcome: "failed",
          mode: uiMode,
          error: isNotEnabled
            ? "UPI auto-verify is not enabled on the Cashfree Secure ID account. Ask ops to enable UPI Penny Drop (or UPI Verification), then retry."
            : detail
              ? `Automatic verification failed: ${detail}`
              : "Automatic verification is temporarily unavailable.",
        });
      }
      return NextResponse.json({ success: true, outcome: "manual", mode, reason: reason || null });
    }

    const status = String(data.status ?? "").toLowerCase();
    if (status === "verified" || status === "manual_review") {
      let verifiedData = (data.verified_data ?? {}) as Record<string, unknown>;
      const verifiedAt = new Date().toISOString();
      const pendingReview = status === "manual_review";
      const method = "CASHFREE_AUTO" as const;

      try {
        const sql = getSql();
        const existingRows = (await sql`
          SELECT pan_document_metadata, gst_document_metadata, extracted_data_summary
            FROM public.merchant_store_documents
           WHERE store_id = ${storeInternalId}
           LIMIT 1
        `) as unknown as Array<{
          pan_document_metadata: unknown;
          gst_document_metadata: unknown;
          extracted_data_summary: unknown;
        }>;
        const existing = existingRows[0];

        const autoPayload: DocAutoVerificationPayload = {
          method,
          status: status as "verified" | "manual_review",
          verified_at: verifiedAt,
          verified_data: verifiedData,
          document_number:
            docKind === "pan"
              ? String(payload.pan ?? verifiedData.pan ?? "").toUpperCase() || null
              : String(payload.gstin ?? "").toUpperCase() || null,
          verification_id: data.verification_id ?? null,
          provider_reference: data.provider_reference ?? null,
          pending_review: pendingReview,
        };
        const verificationId = autoPayload.verification_id ?? null;
        const providerReference = autoPayload.provider_reference ?? null;
        const documentNumber = autoPayload.document_number ?? null;

        const summary = mergeExtractedDataSummary(
          existing?.extracted_data_summary,
          docKind === "gstin" ? "gstin" : "pan",
          { provider: "cashfree", method, status, verifiedData, pendingReview },
        );

        if (docKind === "pan") {
          const registered = String(
            verifiedData.registered_name ?? verifiedData.name_provided ?? "",
          ).trim();
          const meta = mergeAutoVerificationMetadata(existing?.pan_document_metadata, autoPayload);
          await sql`
            INSERT INTO public.merchant_store_documents (store_id)
            VALUES (${storeInternalId})
            ON CONFLICT (store_id) DO NOTHING
          `;
          await sql`
            UPDATE public.merchant_store_documents SET
              pan_is_verified = true,
              pan_verified_at = ${verifiedAt},
              pan_rejection_reason = NULL,
              pan_verification_method = ${method},
              pan_document_number = COALESCE(${documentNumber}, pan_document_number),
              pan_holder_name = COALESCE(${registered || null}, pan_holder_name),
              pan_document_metadata = ${JSON.stringify(meta)}::jsonb,
              last_verification_id = ${verificationId},
              last_provider_reference = ${providerReference},
              extracted_data_summary = ${JSON.stringify(summary)}::jsonb,
              updated_at = NOW()
            WHERE store_id = ${storeInternalId}
          `;
        } else if (docKind === "gstin") {
          const meta = mergeAutoVerificationMetadata(existing?.gst_document_metadata, autoPayload);
          const gstInfo = pickGstFetchedBusinessInfo(verifiedData);
          await sql`
            INSERT INTO public.merchant_store_documents (store_id)
            VALUES (${storeInternalId})
            ON CONFLICT (store_id) DO NOTHING
          `;
          await sql`
            UPDATE public.merchant_store_documents SET
              gst_is_verified = true,
              gst_verified_at = ${verifiedAt},
              gst_rejection_reason = NULL,
              gst_verification_method = ${method},
              gst_document_number = COALESCE(${documentNumber}, gst_document_number),
              gst_legal_business_name = COALESCE(${gstInfo.legal_business_name}, gst_legal_business_name),
              gst_principal_place_of_business = COALESCE(${gstInfo.principal_place_of_business}, gst_principal_place_of_business),
              gst_effective_registration_date = COALESCE(${gstInfo.effective_registration_date}, gst_effective_registration_date),
              gst_document_metadata = ${JSON.stringify(meta)}::jsonb,
              last_verification_id = ${verificationId},
              last_provider_reference = ${providerReference},
              extracted_data_summary = ${JSON.stringify(summary)}::jsonb,
              updated_at = NOW()
              WHERE store_id = ${storeInternalId}
          `;
        } else if (docKind === "bank") {
          const account = String(payload.bank_account ?? "").replace(/\D/g, "");
          const ifsc = String(payload.ifsc ?? "").trim().toUpperCase();
          let bankInfo = pickBankFetchedInfo(verifiedData);

          if (!bankInfo.branch_name && ifsc) {
            try {
              const ifscRes = await backendFetch("/v1/verification/submit/ifsc", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ ...subject, ifsc }),
              });
              if (ifscRes.status >= 200 && ifscRes.status < 300) {
                const ifscBody = (ifscRes.body ?? {}) as {
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
          const branch = bankInfo.branch_name;
          const accountType = bankInfo.account_type;
          const meta = {
            auto_verification: {
              method,
              status,
              verified_at: verifiedAt,
              verified_data: verifiedData,
              document_number: account ? `****${account.slice(-4)}` : null,
              verification_id: data.verification_id ?? null,
              provider_reference: data.provider_reference ?? null,
              pending_review: pendingReview,
            },
          };
          const existingBank = (await sql`
            SELECT id FROM public.merchant_store_bank_accounts
             WHERE store_id = ${storeInternalId}
             ORDER BY is_primary DESC, created_at ASC
             LIMIT 1
          `) as unknown as Array<{ id: number }>;
          if (existingBank[0]?.id) {
            await sql`
              UPDATE public.merchant_store_bank_accounts SET
                account_holder_name = COALESCE(${holder}, account_holder_name),
                account_number = COALESCE(${account || null}, account_number),
                ifsc_code = COALESCE(${ifsc || null}, ifsc_code),
                bank_name = COALESCE(${bankName}, bank_name),
                branch_name = COALESCE(${branch}, branch_name),
                account_type = COALESCE(${accountType}, account_type),
                payout_method = 'bank',
                is_verified = true,
                upi_verified = false,
                verified_at = ${verifiedAt}::timestamptz,
                verification_method = ${method},
                bank_metadata = COALESCE(bank_metadata, '{}'::jsonb) || ${JSON.stringify(meta)}::jsonb,
                updated_at = NOW()
              WHERE id = ${existingBank[0].id}
            `;
          } else {
            await sql`
              INSERT INTO public.merchant_store_bank_accounts (
                store_id, account_holder_name, account_number, ifsc_code, bank_name, branch_name,
                account_type, payout_method, is_primary, is_active, is_verified, upi_verified,
                verified_at, verification_method, bank_metadata
              ) VALUES (
                ${storeInternalId}, ${holder}, ${account}, ${ifsc}, ${bankName}, ${branch},
                ${accountType}, 'bank', true, true, true, false,
                ${verifiedAt}::timestamptz, ${method}, ${JSON.stringify(meta)}::jsonb
              )
            `;
          }
        } else if (docKind === "upi") {
          const upiInfo = pickUpiFetchedInfo(verifiedData);
          const vpa = String(payload.vpa ?? "").trim().toLowerCase();
          const holder =
            upiInfo.name_at_bank ||
            String(payload.name ?? "").trim() ||
            vpa ||
            "UPI";
          const meta = {
            auto_verification: {
              method,
              status,
              verified_at: verifiedAt,
              verified_data: verifiedData,
              document_number: vpa,
              verification_id: data.verification_id ?? null,
              provider_reference: data.provider_reference ?? null,
              pending_review: pendingReview,
            },
          };
          const existingBank = (await sql`
            SELECT id FROM public.merchant_store_bank_accounts
             WHERE store_id = ${storeInternalId}
             ORDER BY is_primary DESC, created_at ASC
             LIMIT 1
          `) as unknown as Array<{ id: number }>;
          if (existingBank[0]?.id) {
            await sql`
              UPDATE public.merchant_store_bank_accounts SET
                account_holder_name = COALESCE(${holder}, account_holder_name),
                account_number = NULL,
                ifsc_code = NULL,
                bank_name = NULL,
                branch_name = NULL,
                payout_method = 'upi',
                upi_id = ${vpa},
                upi_qr_screenshot_url = NULL,
                is_verified = true,
                upi_verified = true,
                verified_at = ${verifiedAt}::timestamptz,
                verification_method = ${method},
                bank_metadata = COALESCE(bank_metadata, '{}'::jsonb) || ${JSON.stringify(meta)}::jsonb,
                updated_at = NOW()
              WHERE id = ${existingBank[0].id}
            `;
          } else {
            await sql`
              INSERT INTO public.merchant_store_bank_accounts (
                store_id, account_holder_name, account_number, ifsc_code, bank_name,
                payout_method, upi_id, is_primary, is_active, is_verified, upi_verified,
                verified_at, verification_method, bank_metadata
              ) VALUES (
                ${storeInternalId}, ${holder}, NULL, NULL, NULL,
                'upi', ${vpa}, true, true, true, true,
                ${verifiedAt}::timestamptz, ${method}, ${JSON.stringify(meta)}::jsonb
              )
            `;
          }
        }
      } catch (e) {
        console.warn("[verify-document] persist failed:", e);
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
      const url =
        (data.verified_data as { url?: string } | undefined)?.url ??
        (data as { url?: string }).url ??
        null;
      if (url) {
        return NextResponse.json({ success: true, outcome: "digilocker", mode, url });
      }
      return NextResponse.json({
        success: true,
        outcome: "manual",
        mode,
        reason: "digilocker_no_url",
      });
    }

    return NextResponse.json({
      success: true,
      outcome: "failed",
      mode,
      error: data.status_reason || "Document could not be verified.",
    });
  } catch (e) {
    console.error("[verify-document] error:", e);
    return NextResponse.json({ success: false, error: "Server error" }, { status: 500 });
  }
}
