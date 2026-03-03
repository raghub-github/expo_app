/**
 * POST /api/merchant/stores/[id]/bank-accounts/upload
 * FormData: file. Returns { url } for bank proof.
 */
import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { hasDashboardAccessByAuth, isSuperAdmin } from "@/lib/permissions/engine";
import { getSystemUserByEmail } from "@/lib/auth/user-mapping";
import { getAreaManagerByUserId } from "@/lib/area-manager/auth";
import { getMerchantStoreById } from "@/lib/db/operations/merchant-stores";
import { uploadWithKey } from "@/lib/services/r2";

export const runtime = "nodejs";

const MAX_BYTES = 10 * 1024 * 1024; // 10 MB

async function assertStoreAccess(storeId: number) {
  const supabase = await createServerSupabaseClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user?.email) return { ok: false as const, status: 401, error: "Not authenticated" };
  const allowed =
    (await isSuperAdmin(user.id, user.email)) ||
    (await hasDashboardAccessByAuth(user.id, user.email, "MERCHANT"));
  if (!allowed) return { ok: false as const, status: 403, error: "Forbidden" };
  let areaManagerId: number | null = null;
  if (!(await isSuperAdmin(user.id, user.email))) {
    const systemUser = await getSystemUserByEmail(user.email);
    if (systemUser) {
      const am = await getAreaManagerByUserId(systemUser.id);
      if (am) areaManagerId = am.id;
    }
  }
  const store = await getMerchantStoreById(storeId, areaManagerId);
  if (!store) return { ok: false as const, status: 404, error: "Store not found" };
  return { ok: true as const, store };
}

function getBaseUrl(request: NextRequest): string {
  const host = request.headers.get("x-forwarded-host") || request.headers.get("host") || "";
  const proto = request.headers.get("x-forwarded-proto") || "https";
  if (host) return `${proto === "https" ? "https" : "http"}://${host}`;
  return process.env.NEXT_PUBLIC_APP_URL || "";
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
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    if (!file || !(file instanceof File)) {
      return NextResponse.json({ success: false, error: "No file provided" }, { status: 400 });
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ success: false, error: "File too large (max 10 MB)" }, { status: 400 });
    }
    const ext = file.name.split(".").pop()?.toLowerCase() || "pdf";
    const r2Key = `merchants/${storeId}/bank/proof_${Date.now()}.${ext}`;
    await uploadWithKey(file, r2Key);
    const baseUrl = getBaseUrl(request);
    const url = `${baseUrl}/api/attachments/proxy?key=${encodeURIComponent(r2Key)}`;
    return NextResponse.json({ success: true, url });
  } catch (e) {
    console.error("[POST /api/merchant/stores/[id]/bank-accounts/upload]", e);
    return NextResponse.json({ success: false, error: "Upload failed" }, { status: 500 });
  }
}
