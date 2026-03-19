/**
 * POST /api/merchant/stores/[id]/offers/upload-image
 * FormData: file (required), offerId (required; merchant_offers.offer_id), currentImageUrl (optional)
 *
 * Stores one image per offer under:
 *   docs/merchants/{parent_code}/stores/{store_code}/offers/{offerId}.{ext}
 *
 * Returns: { success, key, url } where url is a non-expiring proxy URL.
 */
import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getMerchantAccess } from "@/lib/permissions/merchant-access";
import { getSql } from "@/lib/db/client";
import { uploadWithKey, deleteDocument } from "@/lib/services/r2";
import { hasDashboardAccessByAuth, isSuperAdmin } from "@/lib/permissions/engine";
import { getSystemUserByEmail } from "@/lib/auth/user-mapping";
import { getAreaManagerByUserId } from "@/lib/area-manager/auth";
import { getMerchantStoreById } from "@/lib/db/operations/merchant-stores";
import { logStoreActivity } from "@/lib/db/operations/store-activity-feed";
import { logActionByAuth, getIpAddress, getUserAgent } from "@/lib/audit/logger";

export const runtime = "nodejs";

function getBaseUrl(request: NextRequest): string {
  const host = request.headers.get("x-forwarded-host") || request.headers.get("host") || "";
  const proto = request.headers.get("x-forwarded-proto") || "https";
  if (host) return `${proto === "https" ? "https" : "http"}://${host}`;
  return process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "";
}

function extFromName(name: string): string {
  const m = /\.([a-z0-9]+)$/i.exec(name);
  const ext = (m?.[1] || "jpg").toLowerCase();
  return ["jpg", "jpeg", "png", "webp"].includes(ext) ? (ext === "jpeg" ? "jpg" : ext) : "jpg";
}

function extractKeyFromProxyOrUrl(value: string): string | null {
  const v = (value || "").trim();
  if (!v) return null;
  // proxy format
  if (v.includes("/api/attachments/proxy") && v.includes("key=")) {
    try {
      const u = new URL(v, "http://dummy");
      const k = u.searchParams.get("key");
      return k ? decodeURIComponent(k) : null;
    } catch {
      return null;
    }
  }
  // full url => key = pathname
  if (v.startsWith("http://") || v.startsWith("https://")) {
    try {
      const u = new URL(v);
      return u.pathname.replace(/^\/+/, "") || null;
    } catch {
      return null;
    }
  }
  // already a key
  return v.replace(/^\/+/, "");
}

async function assertStoreAccess(storeId: number) {
  const supabase = await createServerSupabaseClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user?.email) {
    return { ok: false as const, status: 401, error: "Not authenticated" };
  }
  const allowed =
    (await isSuperAdmin(user.id, user.email)) ||
    (await hasDashboardAccessByAuth(user.id, user.email, "MERCHANT"));
  if (!allowed) {
    return { ok: false as const, status: 403, error: "Merchant dashboard access required" };
  }
  let areaManagerId: number | null = null;
  if (!(await isSuperAdmin(user.id, user.email))) {
    const systemUser = await getSystemUserByEmail(user.email);
    if (systemUser) {
      const am = await getAreaManagerByUserId(systemUser.id);
      if (am) areaManagerId = am.id;
    }
  }
  const store = await getMerchantStoreById(storeId, areaManagerId);
  if (!store) {
    return { ok: false as const, status: 404, error: "Store not found" };
  }
  return { ok: true as const, store, user: { id: user.id, email: user.email } };
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const storeId = parseInt(id, 10);
    if (!Number.isFinite(storeId)) {
      return NextResponse.json({ success: false, error: "Invalid store id" }, { status: 400 });
    }

    const access = await assertStoreAccess(storeId);
    if (!access.ok) {
      return NextResponse.json({ success: false, error: access.error }, { status: access.status });
    }

    const merchantAccess = await getMerchantAccess(access.user.id, access.user.email);
    if (!merchantAccess || !merchantAccess.can_update_offers) {
      return NextResponse.json({ success: false, error: "Permission denied" }, { status: 403 });
    }

    const form = await request.formData();
    const file = form.get("file") as File | null;
    const offerId = String(form.get("offerId") ?? "").trim();
    const currentImageUrl = String(form.get("currentImageUrl") ?? "").trim();

    if (!file || !(file instanceof File)) {
      return NextResponse.json({ success: false, error: "No file provided" }, { status: 400 });
    }
    if (!offerId) {
      return NextResponse.json({ success: false, error: "offerId is required" }, { status: 400 });
    }

    const sql = getSql();
    const [storeRow] = await sql`
      SELECT ms.store_id AS store_code, mp.parent_merchant_id AS parent_code
      FROM merchant_stores ms
      LEFT JOIN merchant_parents mp ON mp.id = ms.parent_id
      WHERE ms.id = ${storeId}
      LIMIT 1
    `;
    const storeCode = String((storeRow as any)?.store_code ?? storeId);
    const parentCode = String((storeRow as any)?.parent_code ?? (access.store as any)?.parent_id ?? "unknown");

    const ext = extFromName(file.name);
    const r2Key = `docs/merchants/${parentCode}/stores/${storeCode}/offers/${offerId}.${ext}`;

    // Best-effort delete old image if present (proxy url or key)
    if (currentImageUrl) {
      const oldKey = extractKeyFromProxyOrUrl(currentImageUrl);
      if (oldKey && oldKey !== r2Key) {
        deleteDocument(oldKey).catch(() => undefined);
      }
    }

    await uploadWithKey(file, r2Key);
    const baseUrl = getBaseUrl(request);
    const url = `${baseUrl}/api/attachments/proxy?key=${encodeURIComponent(r2Key)}`;

    try {
      const sql2 = getSql();
      const [offerRow] = await sql2`
        SELECT id, offer_title FROM merchant_offers
        WHERE offer_id = ${offerId} AND store_id = ${storeId}
        LIMIT 1
      `;
      await logStoreActivity({
        storeId,
        section: "offer",
        action: "image_update",
        entityId: (offerRow as any)?.id ?? null,
        entityName: (offerRow as any)?.offer_title ?? offerId,
        summary: `Agent updated offer image "${(offerRow as any)?.offer_title ?? offerId}"`,
        actorType: "agent",
        source: "dashboard",
      });
    } catch {
      // ignore
    }

    try {
      await logActionByAuth(access.user.id, access.user.email, "MERCHANT", "UPDATE", {
        resourceType: "OFFER_IMAGE",
        resourceId: String(offerId),
        actionDetails: { storeId, offerId, r2Key },
        newValues: { offer_image_url: url },
        ipAddress: getIpAddress(request),
        userAgent: getUserAgent(request),
        requestPath: request.nextUrl.pathname,
        requestMethod: "POST",
      });
    } catch {
      // ignore
    }

    return NextResponse.json({ success: true, key: r2Key, url }, { status: 201 });
  } catch (e) {
    console.error("[POST /api/merchant/stores/[id]/offers/upload-image]", e);
    return NextResponse.json({ success: false, error: "Internal error" }, { status: 500 });
  }
}

