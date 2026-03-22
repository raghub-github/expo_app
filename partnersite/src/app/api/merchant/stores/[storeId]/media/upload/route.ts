import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createClient } from "@supabase/supabase-js";
import { validateMerchantFromSession } from "@/lib/auth/validate-merchant";
import {
  getAreaManagerRecordIdForAuthUser,
  getMerchantStoreById,
} from "@/lib/merchant/get-merchant-store";
import {
  getMerchantMenuPath,
  getMerchantMenuCanonicalPdfKey,
  getMerchantMenuCanonicalSheetKey,
  getMenuReferenceUploadFileName,
  getOnboardingR2Path,
  menuSpreadsheetMimeFromFileName,
} from "@/lib/r2-paths";
import { collectMenuReferenceRowUrlsForR2Purge } from "@/lib/menu-reference-image-bundle";
import {
  deleteFromR2,
  deleteFromR2ByPrefix,
  r2KeyFromMenuMediaRow,
  signedPublicUrlForMenuR2Key,
  uploadWithKey,
} from "@/lib/r2";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function getSupabaseAdmin() {
  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

const MAX_FILE_BYTES = 15 * 1024 * 1024;
const MAX_MENU_IMAGES = 3;

const SOURCE_ENTITIES = [
  "ONBOARDING_MENU_IMAGE",
  "ONBOARDING_MENU_PDF",
  "ONBOARDING_MENU_SHEET",
] as const;
type MenuSourceEntity = (typeof SOURCE_ENTITIES)[number];

const CSV_MIN_ROWS = 1;
const CSV_MAX_ROWS = 500;
const CSV_REQUIRED_HEADERS = [
  ["item_name", "name"],
  ["price", "base_price", "selling_price"],
];

function parseCsvRowCountAndHeaders(text: string): { rowCount: number; headers: string[]; error?: string } {
  const lines = text.trim().split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return { rowCount: 0, headers: [], error: "CSV is empty" };
  const headerLine = lines[0];
  const headers = headerLine.split(/[,;\t]/).map((h) => h.trim().toLowerCase().replace(/^["']|["']$/g, ""));
  const rowCount = Math.max(0, lines.length - 1);
  if (rowCount < CSV_MIN_ROWS)
    return { rowCount, headers, error: `Minimum ${CSV_MIN_ROWS} data row(s) required (excluding header).` };
  if (rowCount > CSV_MAX_ROWS)
    return { rowCount, headers, error: `Maximum ${CSV_MAX_ROWS} data rows allowed. You have ${rowCount}.` };
  const hasName = CSV_REQUIRED_HEADERS[0].some((h) => headers.includes(h));
  const hasPrice = CSV_REQUIRED_HEADERS[1].some((h) => headers.includes(h));
  if (!hasName)
    return { rowCount, headers, error: `CSV must have a column named one of: ${CSV_REQUIRED_HEADERS[0].join(", ")}.` };
  if (!hasPrice)
    return { rowCount, headers, error: `CSV must have a column named one of: ${CSV_REQUIRED_HEADERS[1].join(", ")}.` };
  return { rowCount, headers };
}

function collectUploadFiles(formData: FormData): File[] {
  const fromFile = formData.getAll("file").filter((f): f is File => f instanceof File && f.size > 0);
  const fromFiles = formData.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  const fromFilesBracket = formData.getAll("files[]").filter((f): f is File => f instanceof File && f.size > 0);
  return [...fromFile, ...fromFiles, ...fromFilesBracket];
}

function inferSourceEntity(file: File): MenuSourceEntity | null {
  const mime = (file.type || "").toLowerCase();
  const name = (file.name || "").toLowerCase();
  if (mime.startsWith("image/") || /\.(jpe?g|png|webp)$/i.test(name)) return "ONBOARDING_MENU_IMAGE";
  if (mime === "application/pdf" || name.endsWith(".pdf")) return "ONBOARDING_MENU_PDF";
  if (
    mime.includes("csv") ||
    mime.includes("sheet") ||
    mime === "text/plain" ||
    mime === "application/vnd.ms-excel" ||
    mime.includes("spreadsheetml") ||
    /\.(csv|xlsx|xls)$/i.test(name)
  ) {
    return "ONBOARDING_MENU_SHEET";
  }
  return null;
}

function parseBoolField(v: FormDataEntryValue | null): boolean {
  if (v == null) return false;
  const s = String(v).trim().toLowerCase();
  return s === "1" || s === "true" || s === "yes" || s === "on";
}

async function deleteAllMenuReferenceForStore(
  db: ReturnType<typeof getSupabaseAdmin>,
  storePk: number
): Promise<void> {
  const { data: rows } = await db
    .from("merchant_store_media_files")
    .select("id, r2_key, public_url, menu_url, menu_reference_image_urls")
    .eq("store_id", storePk)
    .eq("media_scope", "MENU_REFERENCE");

  for (const row of rows || []) {
    const r = row as {
      r2_key?: string | null;
      public_url?: string | null;
      menu_url?: string | null;
      menu_reference_image_urls?: unknown;
    };
    for (const u of collectMenuReferenceRowUrlsForR2Purge(r)) {
      const key = r2KeyFromMenuMediaRow({ menu_url: u, public_url: u, r2_key: u });
      if (!key) continue;
      try {
        await deleteFromR2(key);
      } catch (e) {
        console.warn("[stores/.../media/upload] R2 delete failed:", key, e);
      }
    }
  }

  await db.from("merchant_store_media_files").delete().eq("store_id", storePk).eq("media_scope", "MENU_REFERENCE");
}

/**
 * POST /api/merchant/stores/{storeId}/media/upload
 * Multipart: `file` and/or `files` / `files[]`, optional `source_entity`, optional `replace_menu` (full MENU_REFERENCE wipe first).
 */
export async function POST(
  req: NextRequest,
  context: { params: Promise<{ storeId: string }> }
) {
  try {
    const { storeId: storeIdParam } = await context.params;
    const storePublicId = String(storeIdParam || "").trim();
    if (!storePublicId) {
      return NextResponse.json({ error: "storeId is required." }, { status: 400 });
    }

    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();
    if (userError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const validation = await validateMerchantFromSession({
      id: user.id,
      email: user.email ?? null,
      phone: user.phone ?? null,
    });

    const db = getSupabaseAdmin();
    const merchantParentId =
      validation.isValid && validation.merchantParentId != null ? validation.merchantParentId : null;
    const areaManagerId = await getAreaManagerRecordIdForAuthUser(db, user.email);

    if (merchantParentId == null && areaManagerId == null) {
      return NextResponse.json(
        { error: validation.error ?? "Merchant dashboard access required." },
        { status: 403 }
      );
    }

    const store = await getMerchantStoreById(db, storePublicId, {
      merchantParentId,
      areaManagerId,
    });
    if (!store) {
      return NextResponse.json({ error: "Store not found or not accessible." }, { status: 404 });
    }

    const formData = await req.formData();
    const files = collectUploadFiles(formData);
    if (files.length === 0) {
      return NextResponse.json({ error: "No file provided (use file, files, or files[])." }, { status: 400 });
    }

    for (const f of files) {
      if (f.size > MAX_FILE_BYTES) {
        return NextResponse.json(
          { error: `Each file must be at most ${MAX_FILE_BYTES / (1024 * 1024)} MB.` },
          { status: 400 }
        );
      }
    }

    const rawEntity = formData.get("source_entity");
    const entityFromForm =
      rawEntity != null && String(rawEntity).trim()
        ? (String(rawEntity).trim().toUpperCase() as MenuSourceEntity)
        : null;
    if (entityFromForm && !SOURCE_ENTITIES.includes(entityFromForm)) {
      return NextResponse.json(
        { error: `Invalid source_entity. Use one of: ${SOURCE_ENTITIES.join(", ")}.` },
        { status: 400 }
      );
    }

    const replaceMenu = parseBoolField(formData.get("replace_menu"));

    if (replaceMenu) {
      await deleteAllMenuReferenceForStore(db, store.id);
    }

    const inferred = inferSourceEntity(files[0]);
    const sourceEntity: MenuSourceEntity | null = entityFromForm ?? inferred;
    if (!sourceEntity) {
      return NextResponse.json(
        { error: "Could not determine source_entity; set it explicitly or upload a known image/PDF/sheet type." },
        { status: 400 }
      );
    }

    for (const f of files) {
      const e = entityFromForm ?? inferSourceEntity(f);
      if (e !== sourceEntity) {
        return NextResponse.json(
          { error: "All files in one request must match the same source_entity (or inferred type)." },
          { status: 400 }
        );
      }
    }

    const menuPath = getMerchantMenuPath(store.store_id, store.parentPrimaryKeySegment);
    const parentPrimaryKeySegment = store.parentPrimaryKeySegment;

    if (sourceEntity === "ONBOARDING_MENU_IMAGE") {
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
          {
            error: `Maximum ${MAX_MENU_IMAGES} menu images allowed. You have ${currentCount}, uploading ${files.length}.`,
          },
          { status: 400 }
        );
      }

      const uploaded: { r2_key: string; public_url: string }[] = [];
      for (const file of files) {
        const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
        const safeBase = getMenuReferenceUploadFileName(file.name || `menu_image.${ext}`);
        const r2Key = `${menuPath}/${safeBase}`;
        const imgMime =
          (file.type && file.type.trim()) ||
          (ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg");
        try {
          await uploadWithKey(file, r2Key, imgMime);
        } catch (e) {
          console.error("[stores/.../media/upload] R2 image upload failed:", e);
          return NextResponse.json(
            { error: e instanceof Error ? e.message : "Could not store file in cloud storage (R2)." },
            { status: 502 }
          );
        }
        const publicUrl = await signedPublicUrlForMenuR2Key(r2Key);

        const { error: insertError } = await db.from("merchant_store_media_files").insert({
          store_id: store.id,
          media_scope: "MENU_REFERENCE",
          source_entity: "ONBOARDING_MENU_IMAGE",
          source_entity_id: null,
          original_file_name: file.name || safeBase,
          r2_key: r2Key,
          public_url: publicUrl,
          mime_type: imgMime,
          file_size_bytes: file.size,
          version_no: 1,
          is_active: true,
          verification_status: "PENDING",
          uploaded_by: user.id,
        });

        if (insertError) {
          console.error("[stores/.../media/upload] DB insert failed:", insertError);
          try {
            await deleteFromR2(r2Key);
          } catch {
            /* ignore */
          }
          return NextResponse.json(
            { error: insertError.message || "Failed to save menu image in database" },
            { status: 500 }
          );
        }
        uploaded.push({ r2_key: r2Key, public_url: publicUrl });
      }

      await db.from("merchant_store_activity_log").insert({
        store_id: store.id,
        activity_type: "MENU_FILE_UPLOADED",
        activity_reason: `${files.length} menu image(s) uploaded; pending verification.`,
        activity_reason_code: "MENU_IMAGE_UPLOAD",
        activity_notes: JSON.stringify({ keys: uploaded.map((u) => u.r2_key), count: files.length }),
        actioned_by: "MERCHANT",
        actioned_by_id: null,
        actioned_by_name: user.email?.split("@")[0] ?? user.user_metadata?.name ?? "Merchant",
        actioned_by_email: user.email ?? null,
      });

      return NextResponse.json({ success: true, files: uploaded });
    }

    if (files.length !== 1) {
      return NextResponse.json(
        { error: "PDF and sheet uploads accept exactly one file per request." },
        { status: 400 }
      );
    }

    const file = files[0];
    const fileBuffer = Buffer.from(await file.arrayBuffer());
    const lowerName = (file.name || "").toLowerCase();
    const sheetExt = lowerName.endsWith(".xlsx")
      ? "xlsx"
      : lowerName.endsWith(".xls")
        ? "xls"
        : "csv";

    const isPdf = sourceEntity === "ONBOARDING_MENU_PDF";

    if (sourceEntity === "ONBOARDING_MENU_SHEET" && sheetExt === "csv") {
      const parsed = parseCsvRowCountAndHeaders(fileBuffer.toString("utf8"));
      if (parsed.error) {
        return NextResponse.json({ error: parsed.error }, { status: 400 });
      }
    }

    const { data: existingRows } = await db
      .from("merchant_store_media_files")
      .select("id, r2_key")
      .eq("store_id", store.id)
      .eq("media_scope", "MENU_REFERENCE")
      .eq("source_entity", sourceEntity);

    for (const row of existingRows || []) {
      if ((row as { r2_key?: string }).r2_key) {
        try {
          await deleteFromR2((row as { r2_key: string }).r2_key);
        } catch {
          /* ignore */
        }
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

    try {
      if (isPdf) {
        const pdfPrefix = getOnboardingR2Path(parentPrimaryKeySegment, store.store_id, "MENU_PDF");
        await deleteFromR2ByPrefix(pdfPrefix);
      } else {
        const csvPrefix = getOnboardingR2Path(parentPrimaryKeySegment, store.store_id, "MENU_CSV");
        await deleteFromR2ByPrefix(csvPrefix);
      }
    } catch {
      /* ignore */
    }

    if (isPdf) {
      try {
        await deleteFromR2(getMerchantMenuCanonicalPdfKey(store.store_id, parentPrimaryKeySegment));
      } catch {
        /* ignore */
      }
    } else {
      for (const ext of ["csv", "xlsx", "xls"] as const) {
        try {
          await deleteFromR2(getMerchantMenuCanonicalSheetKey(store.store_id, ext, parentPrimaryKeySegment));
        } catch {
          /* ignore */
        }
      }
    }

    const fallbackName = isPdf ? "menu-reference.pdf" : `menu-reference-sheet.${sheetExt}`;
    const r2Key = isPdf
      ? getMerchantMenuCanonicalPdfKey(store.store_id, parentPrimaryKeySegment)
      : getMerchantMenuCanonicalSheetKey(store.store_id, sheetExt, parentPrimaryKeySegment);
    const mimeType = isPdf
      ? "application/pdf"
      : menuSpreadsheetMimeFromFileName(file.name || fallbackName);

    const fileForUpload = new File([fileBuffer], file.name || fallbackName, { type: mimeType });
    try {
      await uploadWithKey(fileForUpload, r2Key, mimeType);
    } catch (e) {
      console.error("[stores/.../media/upload] R2 PDF/sheet upload failed:", e);
      return NextResponse.json(
        { error: e instanceof Error ? e.message : "Could not store file in cloud storage (R2)." },
        { status: 502 }
      );
    }

    const publicUrl = await signedPublicUrlForMenuR2Key(r2Key);

    const { error: insertError } = await db.from("merchant_store_media_files").insert({
      store_id: store.id,
      media_scope: "MENU_REFERENCE",
      source_entity: sourceEntity,
      source_entity_id: null,
      original_file_name: file.name || fallbackName,
      r2_key: r2Key,
      public_url: publicUrl,
      mime_type: (file.type && file.type.trim()) || mimeType,
      file_size_bytes: fileBuffer.length,
      version_no: 1,
      is_active: true,
      verification_status: "PENDING",
      uploaded_by: user.id,
    });

    if (insertError) {
      console.error("[stores/.../media/upload] DB insert failed:", insertError);
      try {
        await deleteFromR2(r2Key);
      } catch {
        /* ignore */
      }
      return NextResponse.json(
        { error: insertError.message || "Failed to save menu file in database" },
        { status: 500 }
      );
    }

    await db.from("merchant_store_activity_log").insert({
      store_id: store.id,
      activity_type: "MENU_FILE_UPLOADED",
      activity_reason: isPdf ? "Menu PDF uploaded; pending verification." : "Menu sheet uploaded; pending verification.",
      activity_reason_code: isPdf ? "MENU_PDF_UPLOAD" : "MENU_CSV_UPLOAD",
      activity_notes: JSON.stringify({ fileName: file.name || fallbackName, r2_key: r2Key }),
      actioned_by: "MERCHANT",
      actioned_by_id: null,
      actioned_by_name: user.email?.split("@")[0] ?? user.user_metadata?.name ?? "Merchant",
      actioned_by_email: user.email ?? null,
    });

    return NextResponse.json({ success: true, r2_key: r2Key, public_url: publicUrl });
  } catch (err: unknown) {
    console.error("[stores/.../media/upload]", err);
    const message = err instanceof Error ? err.message : "Upload failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
