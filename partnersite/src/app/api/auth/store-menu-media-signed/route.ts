import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { validateMerchantFromSession } from "@/lib/auth/validate-merchant";
import { createClient } from "@supabase/supabase-js";
import { extractR2KeyFromUrl } from "@/lib/r2";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function getSupabaseAdmin() {
  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/** Returns a proxy URL for viewing the file in browser (no expiry, works for private R2). */
function toProxyUrl(storedUrlOrKey: string | null | undefined): string | null {
  if (!storedUrlOrKey || typeof storedUrlOrKey !== "string") return null;
  const key = extractR2KeyFromUrl(storedUrlOrKey) || (storedUrlOrKey.includes("://") ? null : storedUrlOrKey.replace(/^\/+/, ""));
  if (!key) return storedUrlOrKey;
  return `/api/attachments/proxy?key=${encodeURIComponent(key)}`;
}

export async function GET(req: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return NextResponse.json({ success: false, error: "Not authenticated" }, { status: 401 });
    }

    const validation = await validateMerchantFromSession({
      id: user.id,
      email: user.email ?? null,
      phone: user.phone ?? null,
    });
    if (!validation.isValid || validation.merchantParentId == null) {
      return NextResponse.json({ success: false, error: validation.error ?? "Merchant not found" }, { status: 403 });
    }

    const storeDbId = req.nextUrl.searchParams.get("storeDbId");
    if (!storeDbId) {
      return NextResponse.json({ success: false, error: "storeDbId required" }, { status: 400 });
    }
    const storeId = Number(storeDbId);
    if (!Number.isFinite(storeId)) {
      return NextResponse.json({ success: false, error: "Invalid storeDbId" }, { status: 400 });
    }

    const db = getSupabaseAdmin();
    const { data: store } = await db
      .from("merchant_stores")
      .select("id, parent_id")
      .eq("id", storeId)
      .maybeSingle();

    if (!store) {
      return NextResponse.json({ success: false, error: "Store not found" }, { status: 404 });
    }
    const { data: parent } = await db
      .from("merchant_parents")
      .select("id")
      .eq("id", store.parent_id)
      .maybeSingle();
    if (!parent || parent.id !== validation.merchantParentId) {
      return NextResponse.json({ success: false, error: "Store not accessible" }, { status: 403 });
    }

    const { data: menuMedia } = await db
      .from("merchant_store_media_files")
      .select("id, public_url, r2_key, source_entity, verification_status, created_at, uploaded_by, original_file_name")
      .eq("store_id", storeId)
      .eq("media_scope", "MENU_REFERENCE")
      .eq("is_active", true);

    type MediaRow = { id: number; public_url?: string; r2_key?: string; source_entity?: string; verification_status?: string; created_at?: string; original_file_name?: string };

    const emptyResponse = {
      success: true,
      files: [] as { id: number; url: string; fileName: string; type: "image" | "pdf" | "csv"; verificationStatus: string }[],
      menuSpreadsheetUrl: null as string | null,
      menuImageUrls: [] as string[],
      menuPdfUrls: [] as string[],
      menuSpreadsheetFileName: null as string | null,
      menuImageFileNames: [] as string[],
      menuPdfFileNames: [] as string[],
      menuSpreadsheetId: null as number | null,
      menuImageIds: [] as number[],
      menuPdfIds: [] as number[],
      menuSpreadsheetVerificationStatus: null as string | null,
      menuImageVerificationStatuses: [] as string[],
      menuPdfVerificationStatuses: [] as string[],
      menuSpreadsheetUploadedAt: null as string | null,
    };

    if (!menuMedia || menuMedia.length === 0) {
      return NextResponse.json(emptyResponse);
    }

    const sheetRow = menuMedia.find((m: MediaRow) => m.source_entity === "ONBOARDING_MENU_SHEET") as MediaRow | undefined;
    const imageRows = menuMedia.filter((m: MediaRow) => m.source_entity === "ONBOARDING_MENU_IMAGE") as MediaRow[];
    const pdfRows = menuMedia.filter((m: MediaRow) => m.source_entity === "ONBOARDING_MENU_PDF") as MediaRow[];

    const toUrl = (r: MediaRow) => toProxyUrl(r.r2_key || r.public_url || null);

    const files = (menuMedia as MediaRow[]).map((r) => ({
      id: r.id,
      url: toProxyUrl(r.r2_key || r.public_url || null) ?? "",
      fileName: r.original_file_name ?? "File",
      type: (r.source_entity === "ONBOARDING_MENU_IMAGE" ? "image" : r.source_entity === "ONBOARDING_MENU_PDF" ? "pdf" : "csv") as "image" | "pdf" | "csv",
      verificationStatus: r.verification_status ?? "PENDING",
    })).filter((f) => f.url);

    return NextResponse.json({
      success: true,
      files,
      menuSpreadsheetUrl: sheetRow ? toUrl(sheetRow) : null,
      menuImageUrls: imageRows.map(toUrl).filter((u): u is string => !!u),
      menuPdfUrls: pdfRows.map(toUrl).filter((u): u is string => !!u),
      menuSpreadsheetFileName: sheetRow?.original_file_name ?? null,
      menuImageFileNames: imageRows.map((r) => r.original_file_name ?? "Menu image"),
      menuPdfFileNames: pdfRows.map((r) => r.original_file_name ?? "Menu PDF"),
      menuSpreadsheetId: sheetRow?.id ?? null,
      menuImageIds: imageRows.map((r) => r.id),
      menuPdfIds: pdfRows.map((r) => r.id),
      menuSpreadsheetVerificationStatus: sheetRow?.verification_status ?? null,
      menuImageVerificationStatuses: imageRows.map((r) => r.verification_status ?? "PENDING"),
      menuPdfVerificationStatuses: pdfRows.map((r) => r.verification_status ?? "PENDING"),
      menuSpreadsheetUploadedAt: sheetRow?.created_at ?? null,
    });
  } catch (e) {
    console.error("[store-menu-media-signed]", e);
    return NextResponse.json({ success: false, error: "Internal error" }, { status: 500 });
  }
}
