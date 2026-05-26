import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { validateMerchantFromSession } from "@/lib/auth/validate-merchant";
import { createClient } from "@supabase/supabase-js";
import { extractR2KeyFromUrl } from "@/lib/r2";
import { entriesWithRowMetaFromImageRows, fileNameFromMenuStoredUrl } from "@/lib/menu-reference-image-bundle";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder.supabase.co";
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "placeholder-service-role-key";

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
      .select(
        "id, public_url, menu_url, r2_key, source_entity, verification_status, created_at, uploaded_by, original_file_name, mime_type, menu_reference_image_urls"
      )
      .eq("store_id", storeId)
      .eq("media_scope", "MENU_REFERENCE")
      .eq("is_active", true);

    type MediaRow = {
      id: number;
      public_url?: string;
      menu_url?: string;
      r2_key?: string;
      mime_type?: string | null;
      source_entity?: string;
      verification_status?: string;
      created_at?: string;
      original_file_name?: string;
    };

    const emptyResponse = {
      success: true,
      files: [] as { id: number; url: string; fileName: string; type: "image" | "pdf" | "csv"; verificationStatus: string }[],
      menuSpreadsheetUrl: null as string | null,
      menuImageUrls: [] as string[],
      menuImageItems: [] as {
        rowId: number;
        entryId: string;
        url: string;
        fileName: string;
      }[],
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

    const toUrl = (r: MediaRow) => toProxyUrl(r.menu_url || r.public_url || r.r2_key || null);

    const imageWithMeta = entriesWithRowMetaFromImageRows(
      imageRows as {
        id: number;
        menu_reference_image_urls?: unknown;
        menu_url?: string | null;
        public_url?: string | null;
        r2_key?: string | null;
        original_file_name?: string | null;
      }[]
    );
    const menuImageItems = imageWithMeta.map((m, i) => {
      const u = toProxyUrl(m.url) ?? m.url;
      const named =
        (m.file_name && String(m.file_name).trim()) ||
        fileNameFromMenuStoredUrl(m.url) ||
        `Menu image ${i + 1}`;
      return {
        rowId: m.rowId,
        entryId: m.id,
        url: u,
        fileName: named,
      };
    });

    const files = (menuMedia as MediaRow[]).map((r) => ({
      id: r.id,
      url: toProxyUrl(r.menu_url || r.public_url || r.r2_key || null) ?? "",
      fileName: r.original_file_name ?? "File",
      type: (r.source_entity === "ONBOARDING_MENU_IMAGE" ? "image" : r.source_entity === "ONBOARDING_MENU_PDF" ? "pdf" : "csv") as "image" | "pdf" | "csv",
      verificationStatus: r.verification_status ?? "PENDING",
    })).filter((f) => f.url);

    return NextResponse.json({
      success: true,
      files,
      menuSpreadsheetUrl: sheetRow ? toUrl(sheetRow) : null,
      menuImageUrls: menuImageItems.map((i) => i.url).filter(Boolean),
      menuImageItems,
      menuPdfUrls: pdfRows.map(toUrl).filter((u): u is string => !!u),
      menuSpreadsheetFileName: sheetRow?.original_file_name ?? null,
      menuImageFileNames: menuImageItems.map((i) => i.fileName),
      menuPdfFileNames: pdfRows.map((r) => r.original_file_name ?? "Menu PDF"),
      menuSpreadsheetId: sheetRow?.id ?? null,
      menuImageIds: menuImageItems.map((i) => i.rowId),
      menuPdfIds: pdfRows.map((r) => r.id),
      menuSpreadsheetVerificationStatus: sheetRow?.verification_status ?? null,
      menuImageVerificationStatuses: imageWithMeta.map((m) =>
        String(m.verification_status ?? "PENDING").toUpperCase()
      ),
      menuPdfVerificationStatuses: pdfRows.map((r) => r.verification_status ?? "PENDING"),
      menuSpreadsheetUploadedAt: sheetRow?.created_at ?? null,
    });
  } catch (e) {
    console.error("[store-menu-media-signed]", e);
    return NextResponse.json({ success: false, error: "Internal error" }, { status: 500 });
  }
}
