import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createClient } from "@supabase/supabase-js";
import { validateMerchantFromSession } from "@/lib/auth/validate-merchant";
import { getMerchantMenuPath, getOnboardingR2Path } from "@/lib/r2-paths";
import { uploadToR2, deleteFromR2, deleteFromR2ByPrefix, toStoredDocumentUrl } from "@/lib/r2";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function getSupabaseAdmin() {
  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

const CSV_MIN_ROWS = 1;
const CSV_MAX_ROWS = 500;
const CSV_REQUIRED_HEADERS = [
  ["item_name", "name"],
  ["price", "base_price", "selling_price"],
];

const MAX_MENU_IMAGES = 3;

function parseCsvRowCountAndHeaders(text: string): { rowCount: number; headers: string[]; error?: string } {
  const lines = text.trim().split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return { rowCount: 0, headers: [], error: "CSV is empty" };
  const headerLine = lines[0];
  const headers = headerLine.split(/[,;\t]/).map((h) => h.trim().toLowerCase().replace(/^["']|["']$/g, ""));
  const rowCount = Math.max(0, lines.length - 1);
  if (rowCount < CSV_MIN_ROWS) return { rowCount, headers, error: `Minimum ${CSV_MIN_ROWS} data row(s) required (excluding header).` };
  if (rowCount > CSV_MAX_ROWS) return { rowCount, headers, error: `Maximum ${CSV_MAX_ROWS} data rows allowed. You have ${rowCount}.` };
  const hasName = CSV_REQUIRED_HEADERS[0].some((h) => headers.includes(h));
  const hasPrice = CSV_REQUIRED_HEADERS[1].some((h) => headers.includes(h));
  if (!hasName) return { rowCount, headers, error: `CSV must have a column named one of: ${CSV_REQUIRED_HEADERS[0].join(", ")}.` };
  if (!hasPrice) return { rowCount, headers, error: `CSV must have a column named one of: ${CSV_REQUIRED_HEADERS[1].join(", ")}.` };
  return { rowCount, headers };
}

async function authenticateAndGetStore(req: NextRequest, storeIdValue: string) {
  const supabase = await createServerSupabaseClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) return { error: "Unauthorized", status: 401 } as const;

  const validation = await validateMerchantFromSession({
    id: user.id,
    email: user.email ?? null,
    phone: user.phone ?? null,
  });
  if (!validation.isValid || validation.merchantParentId == null) {
    return { error: validation.error ?? "Merchant not found", status: 403 } as const;
  }

  const db = getSupabaseAdmin();
  const { data: store } = await db
    .from("merchant_stores")
    .select("id, store_id, parent_id")
    .eq("store_id", String(storeIdValue).trim())
    .maybeSingle();

  if (!store) return { error: "Store not found", status: 404 } as const;

  const { data: parent } = await db
    .from("merchant_parents")
    .select("id, parent_merchant_id")
    .eq("id", store.parent_id)
    .maybeSingle();
  if (!parent || parent.id !== validation.merchantParentId) {
    return { error: "Store not accessible", status: 403 } as const;
  }

  const parentMerchantCode = (parent as { parent_merchant_id?: string }).parent_merchant_id || String(store.parent_id);
  return { user, store, parent, parentMerchantCode, db } as const;
}

/**
 * POST /api/merchant/menu-upload
 * Upload menu file(s). IMAGE mode appends (max 3 total). CSV/PDF replaces any existing file of that type.
 * Supports multiple files via repeated "file" fields for IMAGE mode.
 */
export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const storeId = formData.get("storeId") as string | null;
    const menuUploadMode = (formData.get("menuUploadMode") as string) || "";

    if (!storeId || !["CSV", "IMAGE", "PDF"].includes(menuUploadMode)) {
      return NextResponse.json(
        { error: "Missing storeId or invalid menuUploadMode (use CSV, IMAGE, or PDF)." },
        { status: 400 }
      );
    }

    const files = formData.getAll("file").filter((f): f is File => f instanceof File && f.size > 0);
    if (files.length === 0) {
      return NextResponse.json({ error: "No file provided." }, { status: 400 });
    }

    const auth = await authenticateAndGetStore(req, storeId);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const { user, store, parentMerchantCode, db } = auth;

    const menuPath = getMerchantMenuPath(store.store_id, parentMerchantCode);
    const isImage = menuUploadMode === "IMAGE";
    const isPdf = menuUploadMode === "PDF";

    if (isImage) {
      const { data: existingImages } = await db
        .from("merchant_store_media_files")
        .select("id")
        .eq("store_id", store.id)
        .eq("media_scope", "MENU_REFERENCE")
        .eq("source_entity", "ONBOARDING_MENU_IMAGE")
        .eq("is_active", true);

      const currentCount = existingImages?.length ?? 0;
      if (currentCount + files.length > MAX_MENU_IMAGES) {
        return NextResponse.json(
          { error: `Maximum ${MAX_MENU_IMAGES} menu images allowed. You have ${currentCount}, trying to add ${files.length}.` },
          { status: 400 }
        );
      }

      const uploadedKeys: string[] = [];
      for (const file of files) {
        const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
        const safeName = `menu_card_${Date.now()}_${Math.random().toString(36).slice(2, 6)}.${ext}`;
        const r2Key = `${menuPath}/${safeName}`;
        await uploadToR2(file, r2Key);
        const publicUrl = toStoredDocumentUrl(r2Key);
        await db.from("merchant_store_media_files").insert({
          store_id: store.id,
          media_scope: "MENU_REFERENCE",
          source_entity: "ONBOARDING_MENU_IMAGE",
          source_entity_id: null,
          original_file_name: file.name || safeName,
          r2_key: r2Key,
          public_url: publicUrl ?? `/api/attachments/proxy?key=${encodeURIComponent(r2Key)}`,
          mime_type: file.type || "image/*",
          is_active: true,
          verification_status: "PENDING",
          uploaded_by: user.id,
        });
        uploadedKeys.push(r2Key);
      }

      await db.from("merchant_store_activity_log").insert({
        store_id: store.id,
        activity_type: "MENU_FILE_UPLOADED",
        activity_reason: `${files.length} menu image(s) uploaded; pending verification.`,
        activity_reason_code: "MENU_IMAGE_UPLOAD",
        activity_notes: JSON.stringify({ keys: uploadedKeys, count: files.length }),
        actioned_by: "MERCHANT",
        actioned_by_id: null,
        actioned_by_name: user.email?.split("@")[0] ?? user.user_metadata?.name ?? "Merchant",
        actioned_by_email: user.email ?? null,
      });

      return NextResponse.json({ success: true, keys: uploadedKeys });
    }

    // CSV or PDF — single file, replaces existing of same type
    const file = files[0];

    if (menuUploadMode === "CSV") {
      const text = await file.text();
      const parsed = parseCsvRowCountAndHeaders(text);
      if (parsed.error) {
        return NextResponse.json({ error: parsed.error }, { status: 400 });
      }
    }

    const sourceEntity = isPdf ? "ONBOARDING_MENU_PDF" : "ONBOARDING_MENU_SHEET";

    const { data: existingRows } = await db
      .from("merchant_store_media_files")
      .select("id, r2_key")
      .eq("store_id", store.id)
      .eq("media_scope", "MENU_REFERENCE")
      .eq("source_entity", sourceEntity);

    for (const row of existingRows || []) {
      if (row.r2_key) {
        try { await deleteFromR2(row.r2_key); } catch {}
      }
    }
    if (existingRows && existingRows.length > 0) {
      await db
        .from("merchant_store_media_files")
        .delete()
        .eq("store_id", store.id)
        .eq("media_scope", "MENU_REFERENCE")
        .eq("source_entity", sourceEntity);
    }

    // Clean up old onboarding prefixes
    try {
      if (isPdf) {
        const pdfPrefix = getOnboardingR2Path(parentMerchantCode, store.store_id, "MENU_PDF");
        await deleteFromR2ByPrefix(pdfPrefix);
      } else {
        const csvPrefix = getOnboardingR2Path(parentMerchantCode, store.store_id, "MENU_CSV");
        await deleteFromR2ByPrefix(csvPrefix);
      }
    } catch {}

    const ext = isPdf ? "pdf" : "csv";
    const safeName = isPdf ? `menu_pdf_${Date.now()}.${ext}` : `menu_sheet_${Date.now()}.${ext}`;
    const r2Key = `${menuPath}/${safeName}`;
    await uploadToR2(file, r2Key);

    const publicUrl = toStoredDocumentUrl(r2Key);
    const mimeType = isPdf ? "application/pdf" : "text/csv";

    await db.from("merchant_store_media_files").insert({
      store_id: store.id,
      media_scope: "MENU_REFERENCE",
      source_entity: sourceEntity,
      source_entity_id: null,
      original_file_name: file.name || safeName,
      r2_key: r2Key,
      public_url: publicUrl ?? `/api/attachments/proxy?key=${encodeURIComponent(r2Key)}`,
      mime_type: mimeType,
      is_active: true,
      verification_status: "PENDING",
      uploaded_by: user.id,
    });

    await db.from("merchant_store_activity_log").insert({
      store_id: store.id,
      activity_type: "MENU_FILE_UPLOADED",
      activity_reason: isPdf ? "Menu PDF uploaded; pending verification." : "Menu CSV uploaded; pending verification.",
      activity_reason_code: isPdf ? "MENU_PDF_UPLOAD" : "MENU_CSV_UPLOAD",
      activity_notes: JSON.stringify({ fileName: file.name || safeName, r2_key: r2Key }),
      actioned_by: "MERCHANT",
      actioned_by_id: null,
      actioned_by_name: user.email?.split("@")[0] ?? user.user_metadata?.name ?? "Merchant",
      actioned_by_email: user.email ?? null,
    });

    return NextResponse.json({ success: true, key: r2Key });
  } catch (err: any) {
    console.error("[merchant/menu-upload]", err);
    return NextResponse.json({ error: err?.message || "Upload failed" }, { status: 500 });
  }
}

/**
 * DELETE /api/merchant/menu-upload?storeId=GMMC1015&fileId=123
 * Remove a single menu file from R2 and DB.
 */
export async function DELETE(req: NextRequest) {
  try {
    const storeId = req.nextUrl.searchParams.get("storeId");
    const fileId = req.nextUrl.searchParams.get("fileId");

    if (!storeId || !fileId) {
      return NextResponse.json({ error: "storeId and fileId are required." }, { status: 400 });
    }

    const auth = await authenticateAndGetStore(req, storeId);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const { user, store, db } = auth;

    const { data: row } = await db
      .from("merchant_store_media_files")
      .select("id, r2_key, source_entity, original_file_name")
      .eq("id", Number(fileId))
      .eq("store_id", store.id)
      .eq("media_scope", "MENU_REFERENCE")
      .maybeSingle();

    if (!row) {
      return NextResponse.json({ error: "File not found." }, { status: 404 });
    }

    if (row.r2_key) {
      try { await deleteFromR2(row.r2_key); } catch (e) {
        console.warn("[menu-upload DELETE] R2 delete failed:", row.r2_key, e);
      }
    }

    await db
      .from("merchant_store_media_files")
      .delete()
      .eq("id", row.id);

    await db.from("merchant_store_activity_log").insert({
      store_id: store.id,
      activity_type: "MENU_FILE_DELETED",
      activity_reason: `Menu file removed: ${row.original_file_name || "unknown"}`,
      activity_reason_code: "MENU_FILE_DELETE",
      activity_notes: JSON.stringify({ fileId: row.id, r2_key: row.r2_key, source_entity: row.source_entity }),
      actioned_by: "MERCHANT",
      actioned_by_id: null,
      actioned_by_name: user.email?.split("@")[0] ?? user.user_metadata?.name ?? "Merchant",
      actioned_by_email: user.email ?? null,
    });

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("[merchant/menu-upload DELETE]", err);
    return NextResponse.json({ error: err?.message || "Delete failed" }, { status: 500 });
  }
}
