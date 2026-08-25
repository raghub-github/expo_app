/**
 * GET /api/onboarding/verify-document/status?storeId=GMMC1027&docKind=aadhaar
 *
 * Poll DigiLocker / async verification status for AM child onboarding
 * (mirrors partnersite status route). For Aadhaar, actively polls Cashfree
 * via the backend so completion does not depend on webhooks.
 */
import { NextRequest, NextResponse } from "next/server";
import { authenticateMerchantStoreForId } from "@/lib/merchant-store-route-auth";
import { getSql } from "@/lib/db/client";
import { backendFetch } from "@/lib/notif-backend";

export const runtime = "nodejs";

const DOC_KIND_MAP: Record<string, string> = {
  pan: "pan",
  gstin: "gstin",
  aadhaar: "aadhaar_digilocker",
  bank: "bank_account",
};

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const storePublicId = String(url.searchParams.get("storeId") ?? "").trim();
    const docKindParam = url.searchParams.get("docKind") ?? "";
    const documentKind = DOC_KIND_MAP[docKindParam];
    if (!documentKind) {
      return NextResponse.json({ success: false, error: "Unsupported docKind." }, { status: 400 });
    }
    if (!storePublicId) {
      return NextResponse.json({ success: false, error: "storeId required" }, { status: 400 });
    }

    const sql = getSql();
    const storeRows = (await sql`
      SELECT id FROM public.merchant_stores WHERE store_id = ${storePublicId} LIMIT 1
    `) as unknown as Array<{ id: number }>;
    const storeIdNum = storeRows[0]?.id;
    if (!storeIdNum) {
      return NextResponse.json({ success: false, error: "Store not found" }, { status: 404 });
    }

    const access = await authenticateMerchantStoreForId(req, storeIdNum);
    if (!access.ok) return access.response;

    if (docKindParam === "aadhaar") {
      const poll = await backendFetch("/v1/verification/poll/digilocker", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject_type: "merchant_store",
          subject_id: storeIdNum,
        }),
      });
      if (poll.status >= 200 && poll.status < 300 && poll.body && typeof poll.body === "object") {
        const b = poll.body as {
          verified?: boolean;
          status?: string;
          statusReason?: string | null;
          verifiedData?: Record<string, unknown>;
        };
        const status = String(b.status ?? "unknown");
        return NextResponse.json({
          success: true,
          status,
          verified: !!b.verified || status === "verified",
          statusReason: b.statusReason ?? null,
          verifiedData: b.verifiedData ?? null,
        });
      }
    }

    const reqRows = (await sql`
      SELECT id, status::text AS status, status_reason, created_at
        FROM public.verification_requests
       WHERE subject_type = 'merchant_store'
         AND subject_id = ${storeIdNum}
         AND document_kind::text = ${documentKind}
       ORDER BY created_at DESC
       LIMIT 1
    `) as unknown as Array<{
      id: string | number;
      status: string;
      status_reason: string | null;
    }>;

    const data = reqRows[0];
    if (!data) return NextResponse.json({ success: true, status: "none" });

    const status = String(data.status ?? "unknown");
    let verifiedData: Record<string, unknown> | null = null;
    if (status === "verified") {
      const evRows = (await sql`
        SELECT details
          FROM public.verification_events
         WHERE request_id = ${data.id}
         ORDER BY created_at DESC
         LIMIT 5
      `) as unknown as Array<{ details: unknown }>;
      for (const e of evRows ?? []) {
        const d =
          e.details && typeof e.details === "object"
            ? (e.details as { verifiedData?: Record<string, unknown> }).verifiedData
            : null;
        if (d && typeof d === "object") {
          verifiedData = d;
          break;
        }
      }
    }

    return NextResponse.json({
      success: true,
      status,
      verified: status === "verified",
      statusReason: data.status_reason ?? null,
      verifiedData,
    });
  } catch (e) {
    console.error("[verify-document/status] error:", e);
    return NextResponse.json({ success: false, error: "Server error" }, { status: 500 });
  }
}
