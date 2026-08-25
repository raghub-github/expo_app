import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createClient } from "@supabase/supabase-js";
import { validateMerchantFromSession } from "@/lib/auth/validate-merchant";
import {
  getMerchantMenuPath,
  getMerchantMenuCanonicalPdfKey,
  getMerchantMenuCanonicalSheetKey,
  getOnboardingR2Path,
} from "@/lib/r2-paths";
import {
  uploadToR2,
  deleteFromR2,
  deleteFromR2ByPrefix,
  toStoredDocumentUrl,
  extractR2KeyFromUrl,
} from "@/lib/r2";
import {
  parseMenuReferenceImageUrls,
  collectMenuReferenceRowUrlsForR2Purge,
  entriesFromImageMediaRows,
} from "@/lib/menu-reference-image-bundle";
import { randomUUID } from "crypto";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder.supabase.co";
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "placeholder-service-role-key";

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

  const parentPrimaryKeySegment = String(store.parent_id);
  return { user, store, parent, parentPrimaryKeySegment, db } as const;
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
    const { user, store, parentPrimaryKeySegment, db } = auth;

    const menuPath = getMerchantMenuPath(store.store_id, parentPrimaryKeySegment);
    const isImage = menuUploadMode === "IMAGE";
    const isPdf = menuUploadMode === "PDF";

    if (isImage) {
      const { data: existingImages } = await db
        .from("merchant_store_media_files")
        .select("id, menu_reference_image_urls, menu_url, public_url, r2_key, original_file_name")
        .eq("store_id", store.id)
        .eq("media_scope", "MENU_REFERENCE")
        .eq("source_entity", "ONBOARDING_MENU_IMAGE")
        .eq("is_active", true);

      // Count individual images, not rows — onboarding bundles several images into one row.
      const currentCount = entriesFromImageMediaRows(existingImages ?? []).length;
      if (currentCount + files.length > MAX_MENU_IMAGES) {
        return NextResponse.json(
          { error: `Maximum ${MAX_MENU_IMAGES} menu images allowed. You have ${currentCount}, trying to add ${files.length}.` },
          { status: 400 }
        );
      }

      const uploadedKeys: string[] = [];
      const uploadedPublicUrls: string[] = [];
      for (const file of files) {
        const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
        const safeName = `menu_card_${Date.now()}_${randomUUID().slice(0, 8)}.${ext}`;
        const r2Key = `${menuPath}/${safeName}`;
        const imgMime =
          (file.type && file.type.trim()) ||
          (ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg");
        try {
          await uploadToR2(file, r2Key, imgMime);
        } catch (e) {
          console.error("[merchant/menu-upload] R2 image upload failed:", e);
          return NextResponse.json(
            { error: e instanceof Error ? e.message : "Could not store file in cloud storage (R2)." },
            { status: 502 }
          );
        }
        const publicUrl =
          toStoredDocumentUrl(r2Key) ||
          `/api/attachments/proxy?key=${encodeURIComponent(r2Key.replace(/^\/+/, ""))}`;

        const { error: insertError } = await db.from("merchant_store_media_files").insert({
          store_id: store.id,
          media_scope: "MENU_REFERENCE",
          source_entity: "ONBOARDING_MENU_IMAGE",
          source_entity_id: null,
          original_file_name: file.name || safeName,
          r2_key: r2Key,
          public_url: publicUrl,
          menu_url: publicUrl,
          mime_type: imgMime,
          file_size_bytes: file.size,
          version_no: 1,
          is_active: true,
          verification_status: "PENDING",
          uploaded_by: user.id,
        });

        if (insertError) {
          console.error("[merchant/menu-upload] image insert failed:", insertError);
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

        uploadedKeys.push(r2Key);
        uploadedPublicUrls.push(publicUrl);
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

      return NextResponse.json({
        success: true,
        keys: uploadedKeys,
        publicUrls: uploadedPublicUrls,
      });
    }

    // CSV or PDF — single file, replaces existing of same type
    const file = files[0];
    // Read once: file.text() consumes the stream in some runtimes and would upload 0 bytes to R2 afterwards.
    const fileBuffer = Buffer.from(await file.arrayBuffer());
    const lowerName = (file.name || "").toLowerCase();
    const sheetExt = lowerName.endsWith(".xlsx")
      ? "xlsx"
      : lowerName.endsWith(".xls")
        ? "xls"
        : "csv";

    if (menuUploadMode === "CSV" && sheetExt === "csv") {
      const parsed = parseCsvRowCountAndHeaders(fileBuffer.toString("utf8"));
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
        const pdfPrefix = getOnboardingR2Path(parentPrimaryKeySegment, store.store_id, "MENU_PDF");
        await deleteFromR2ByPrefix(pdfPrefix);
      } else {
        const csvPrefix = getOnboardingR2Path(parentPrimaryKeySegment, store.store_id, "MENU_CSV");
        await deleteFromR2ByPrefix(csvPrefix);
      }
    } catch {}

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

    const r2Key = isPdf
      ? getMerchantMenuCanonicalPdfKey(store.store_id, parentPrimaryKeySegment)
      : getMerchantMenuCanonicalSheetKey(store.store_id, sheetExt, parentPrimaryKeySegment);
    const mimeType = isPdf
      ? "application/pdf"
      : sheetExt === "xlsx"
        ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        : sheetExt === "xls"
          ? "application/vnd.ms-excel"
          : "text/csv";

    const fallbackName = isPdf ? "menu-reference.pdf" : `menu-reference-sheet.${sheetExt}`;
    const fileForUpload = new File([fileBuffer], file.name || fallbackName, { type: mimeType });
    try {
      await uploadToR2(fileForUpload, r2Key, mimeType);
    } catch (e) {
      console.error("[merchant/menu-upload] R2 CSV/PDF upload failed:", e);
      return NextResponse.json(
        { error: e instanceof Error ? e.message : "Could not store file in cloud storage (R2)." },
        { status: 502 }
      );
    }

    const publicUrl =
      toStoredDocumentUrl(r2Key) ||
      `/api/attachments/proxy?key=${encodeURIComponent(r2Key.replace(/^\/+/, ""))}`;

    const { error: insertError } = await db.from("merchant_store_media_files").insert({
      store_id: store.id,
      media_scope: "MENU_REFERENCE",
      source_entity: sourceEntity,
      source_entity_id: null,
      original_file_name: file.name || fallbackName,
      r2_key: r2Key,
      public_url: publicUrl,
      menu_url: publicUrl,
      mime_type: (file.type && file.type.trim()) || mimeType,
      file_size_bytes: fileBuffer.length,
      version_no: 1,
      is_active: true,
      verification_status: "PENDING",
      uploaded_by: user.id,
    });

    if (insertError) {
      console.error("[merchant/menu-upload] CSV/PDF insert failed:", insertError);
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
      activity_reason: isPdf ? "Menu PDF uploaded; pending verification." : "Menu CSV uploaded; pending verification.",
      activity_reason_code: isPdf ? "MENU_PDF_UPLOAD" : "MENU_CSV_UPLOAD",
      activity_notes: JSON.stringify({ fileName: file.name || fallbackName, r2_key: r2Key }),
      actioned_by: "MERCHANT",
      actioned_by_id: null,
      actioned_by_name: user.email?.split("@")[0] ?? user.user_metadata?.name ?? "Merchant",
      actioned_by_email: user.email ?? null,
    });

    return NextResponse.json({ success: true, key: r2Key, r2Key, publicUrl });
  } catch (err: any) {
    console.error("[merchant/menu-upload]", err);
    return NextResponse.json({ error: err?.message || "Upload failed" }, { status: 500 });
  }
}

/** Stored menu URLs may be full signed URLs or bare keys — normalise before deleting from R2. */
async function deleteStoredMenuUrlFromR2(storedUrlOrKey: string | null | undefined): Promise<void> {
  if (!storedUrlOrKey) return;
  const key =
    extractR2KeyFromUrl(storedUrlOrKey) ||
    (storedUrlOrKey.includes("://") ? null : storedUrlOrKey.replace(/^\/+/, ""));
  if (!key) return;
  try {
    await deleteFromR2(key);
  } catch (e) {
    console.warn("[menu-upload DELETE] R2 delete failed:", key, e);
  }
}

/**
 * DELETE /api/merchant/menu-upload?storeId=GMMC1015&fileId=123[&entryId=abc]
 * Remove a menu file from R2 and DB. Onboarding stores several images in one row's
 * `menu_reference_image_urls` bundle, so `entryId` removes just that image and keeps the rest.
 */
export async function DELETE(req: NextRequest) {
  try {
    const storeId = req.nextUrl.searchParams.get("storeId");
    const fileId = req.nextUrl.searchParams.get("fileId");
    const entryId = req.nextUrl.searchParams.get("entryId");

    if (!storeId || !fileId) {
      return NextResponse.json({ error: "storeId and fileId are required." }, { status: 400 });
    }

    const auth = await authenticateAndGetStore(req, storeId);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const { user, store, db } = auth;

    const { data: row } = await db
      .from("merchant_store_media_files")
      .select("id, r2_key, public_url, menu_url, source_entity, original_file_name, menu_reference_image_urls")
      .eq("id", Number(fileId))
      .eq("store_id", store.id)
      .eq("media_scope", "MENU_REFERENCE")
      .maybeSingle();

    if (!row) {
      return NextResponse.json({ error: "File not found." }, { status: 404 });
    }

    const bundle = parseMenuReferenceImageUrls(row.menu_reference_image_urls);

    // Remove one image out of a multi-image bundle — keep the row and its siblings.
    if (entryId && bundle.length > 1) {
      const target = bundle.find((e) => e.id === entryId);
      if (!target) {
        return NextResponse.json({ error: "Image not found." }, { status: 404 });
      }
      const remaining = bundle.filter((e) => e.id !== entryId);

      await deleteStoredMenuUrlFromR2(target.url);

      const first = remaining[0];
      const { error: updateError } = await db
        .from("merchant_store_media_files")
        .update({
          menu_reference_image_urls: remaining,
          r2_key: first.url,
          public_url: first.url,
          menu_url: first.url,
          original_file_name: remaining
            .map((e) => e.file_name)
            .filter(Boolean)
            .join(", ") || row.original_file_name,
        })
        .eq("id", row.id);

      if (updateError) {
        console.error("[menu-upload DELETE] bundle update failed:", updateError);
        return NextResponse.json({ error: updateError.message || "Delete failed" }, { status: 500 });
      }

      await db.from("merchant_store_activity_log").insert({
        store_id: store.id,
        activity_type: "MENU_FILE_DELETED",
        activity_reason: `Menu image removed: ${target.file_name || "unknown"}`,
        activity_reason_code: "MENU_FILE_DELETE",
        activity_notes: JSON.stringify({ fileId: row.id, entryId, remaining: remaining.length }),
        actioned_by: "MERCHANT",
        actioned_by_id: null,
        actioned_by_name: user.email?.split("@")[0] ?? user.user_metadata?.name ?? "Merchant",
        actioned_by_email: user.email ?? null,
      });

      return NextResponse.json({ success: true });
    }

    // Whole row: purge every object it references (bundle entries or the single URL columns).
    const urlsToPurge = collectMenuReferenceRowUrlsForR2Purge(row);
    for (const url of urlsToPurge) {
      await deleteStoredMenuUrlFromR2(url);
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
