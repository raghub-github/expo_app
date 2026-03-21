/**
 * Menu Setup uploads (registration step 3): one attachment type per store (images max 5, or one PDF, or one CSV).
 * R2: `.../stores/{storePublicId}/onboarding/menu/{fileName}` (flat, like documents/ & bank/).
 * DB: `r2_key`, `public_url`, and `menu_url` all store the app proxy URL (`/api/attachments/proxy?key=...`).
 * GET: list by store_id
 * POST: upload → R2 → save menu_url; rollback R2 on DB fail
 * DELETE: remove one by id (R2 + DB)
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createClient } from "@supabase/supabase-js";
import { validateMerchantFromSession } from "@/lib/auth/validate-merchant";
import {
  getOnboardingMenuReferenceFlatPath,
  getOnboardingMenuReferenceCanonicalPdfKey,
  getOnboardingMenuReferenceCanonicalSheetKey,
} from "@/lib/r2-paths";
import { uploadToR2, deleteFromR2, toStoredDocumentUrl, r2KeyFromMenuMediaRow } from "@/lib/r2";
import {
  collectMenuReferenceRowUrlsForR2Purge,
  dedupeEntriesByUrl,
  entriesFromImageMediaRows,
  newImageEntry,
  parseMenuReferenceImageUrls,
  stableEntryIdForUrl,
  type MenuReferenceImageEntry,
} from "@/lib/menu-reference-image-bundle";
import { randomUUID } from "crypto";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function getSupabaseAdmin() {
  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

const MAX_IMAGES = 5;
const MAX_FILE_BYTES = 5 * 1024 * 1024; // 5 MB per file
const IMAGE_TYPES = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
const PDF_MIME = "application/pdf";
const CSV_MIMES = ["text/csv", "application/csv", "text/plain", "application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"];

function getExt(name: string, mime: string, attachmentType: string): string {
  if (attachmentType === "pdf") return "pdf";
  if (attachmentType === "csv") {
    const lower = (name || "").split(".").pop()?.toLowerCase();
    if (lower === "csv" || lower === "xls" || lower === "xlsx") return lower;
    return "csv";
  }
  const lower = (name || "").split(".").pop()?.toLowerCase();
  if (["jpg", "jpeg", "png", "webp"].includes(lower || "")) return lower!;
  if (mime?.includes("png")) return "png";
  if (mime?.includes("webp")) return "webp";
  return "jpg";
}

function contentTypeForUpload(file: File, ext: string): string {
  const t = (file.type || "").trim();
  if (t) return t;
  const e = ext.toLowerCase();
  if (e === "pdf") return "application/pdf";
  if (e === "csv") return "text/csv";
  if (e === "xlsx") return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  if (e === "xls") return "application/vnd.ms-excel";
  if (["jpg", "jpeg"].includes(e)) return "image/jpeg";
  if (e === "png") return "image/png";
  if (e === "webp") return "image/webp";
  return "application/octet-stream";
}

type StoreRowWithParentCode = {
  id: number;
  store_id: string;
  parent_id: number;
  /** merchant_parents.id — R2 path segment under docs/merchants/{id}/ */
  parentPrimaryKeySegment: string;
};

/** Load store by numeric PK and verify parent */
async function getStoreForMerchant(db: ReturnType<typeof getSupabaseAdmin>, storeId: number, merchantParentId: number) {
  const { data, error } = await db
    .from("merchant_stores")
    .select("id, store_id, parent_id")
    .eq("id", storeId)
    .single();
  if (error || !data || (data as { parent_id: number }).parent_id !== merchantParentId) return null;
  const store = data as { id: number; store_id: string; parent_id: number };
  return { ...store, parentPrimaryKeySegment: String(store.parent_id) };
}

/**
 * Resolve draft store for onboarding menu upload: numeric `store_id` (DB id) OR public `store_id` (GMMCxxxx).
 * Step 3 often has public id before client state picks up `draftStoreDbId`.
 */
async function resolveStoreForMenuUpload(
  db: ReturnType<typeof getSupabaseAdmin>,
  merchantParentId: number,
  storeIdParam: string | null | undefined,
  storePublicIdParam: string | null | undefined
): Promise<StoreRowWithParentCode | null> {
  const n = parseInt(String(storeIdParam ?? "").trim(), 10);
  if (Number.isFinite(n) && n > 0) {
    const row = await getStoreForMerchant(db, n, merchantParentId);
    if (row) return row;
  }
  const pub = String(storePublicIdParam ?? "").trim();
  if (!pub) return null;
  const { data, error } = await db
    .from("merchant_stores")
    .select("id, store_id, parent_id")
    .eq("store_id", pub)
    .maybeSingle();
  if (error || !data || (data as { parent_id: number }).parent_id !== merchantParentId) return null;
  const store = data as { id: number; store_id: string; parent_id: number };
  return { ...store, parentPrimaryKeySegment: String(store.parent_id) };
}

/** Delete all menu uploads for store from R2 and DB (for type switch). Uses merchant_store_media_files with media_scope='MENU_REFERENCE'. */
async function deleteAllForStore(db: ReturnType<typeof getSupabaseAdmin>, storeId: number): Promise<void> {
  const { data: rows } = await db
    .from("merchant_store_media_files")
    .select("id, r2_key, public_url, menu_url, menu_reference_image_urls")
    .eq("store_id", storeId)
    .eq("media_scope", "MENU_REFERENCE");

  if (!rows?.length) return;

  for (const row of rows as {
    id: number;
    r2_key: string | null;
    public_url?: string | null;
    menu_url?: string | null;
    menu_reference_image_urls?: unknown;
  }[]) {
    for (const u of collectMenuReferenceRowUrlsForR2Purge(row)) {
      const key = r2KeyFromMenuMediaRow({ menu_url: u, public_url: u, r2_key: u });
      if (!key) continue;
      try {
        await deleteFromR2(key);
      } catch (e) {
        console.warn("[register-store-menu-uploads] R2 delete failed:", key, e);
      }
    }
  }

  await db
    .from("merchant_store_media_files")
    .delete()
    .eq("store_id", storeId)
    .eq("media_scope", "MENU_REFERENCE");
}

/** Remove DB rows + R2 objects for one menu sheet/PDF entity before canonical re-upload. */
async function deleteMenuSheetOrPdfForReplace(
  db: ReturnType<typeof getSupabaseAdmin>,
  storeId: number,
  sourceEntity: "ONBOARDING_MENU_PDF" | "ONBOARDING_MENU_SHEET",
  parentPk: string,
  storePublicId: string
): Promise<void> {
  const { data: rows } = await db
    .from("merchant_store_media_files")
    .select("id, r2_key, public_url, menu_url")
    .eq("store_id", storeId)
    .eq("media_scope", "MENU_REFERENCE")
    .eq("source_entity", sourceEntity);

  for (const row of (rows || []) as {
    id: number;
    r2_key: string | null;
    public_url?: string | null;
    menu_url?: string | null;
  }[]) {
    const key = r2KeyFromMenuMediaRow(row);
    if (key) {
      try {
        await deleteFromR2(key);
      } catch (e) {
        console.warn("[register-store-menu-uploads] R2 delete failed:", key, e);
      }
    }
  }

  // Always remove sheet/PDF rows for this store+entity (not only when select returned rows — avoids stale
  // rows and races where insert hits merchant_store_media_files_r2_key_idx before delete ran).
  await db
    .from("merchant_store_media_files")
    .delete()
    .eq("store_id", storeId)
    .eq("media_scope", "MENU_REFERENCE")
    .eq("source_entity", sourceEntity);

  if (sourceEntity === "ONBOARDING_MENU_PDF") {
    try {
      await deleteFromR2(getOnboardingMenuReferenceCanonicalPdfKey(parentPk, storePublicId));
    } catch {
      /* already gone */
    }
  } else {
    for (const ext of ["csv", "xlsx", "xls"] as const) {
      try {
        await deleteFromR2(getOnboardingMenuReferenceCanonicalSheetKey(parentPk, storePublicId, ext));
      } catch {
        /* ignore */
      }
    }
  }
}

export async function GET(req: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const validation = await validateMerchantFromSession({
      id: user.id,
      email: user.email ?? null,
      phone: user.phone ?? null,
    });
    if (!validation.isValid || validation.merchantParentId == null) {
      return NextResponse.json({ error: validation.error ?? "Forbidden" }, { status: 403 });
    }

    const storeIdParam = req.nextUrl.searchParams.get("store_id");
    const storePublicParam = req.nextUrl.searchParams.get("store_public_id");
    const db = getSupabaseAdmin();
    const store = await resolveStoreForMenuUpload(
      db,
      validation.merchantParentId,
      storeIdParam,
      storePublicParam
    );
    if (!store) {
      return NextResponse.json(
        { error: "Store not found. Pass store_id (numeric) or store_public_id (e.g. GMMC1025)." },
        { status: 404 }
      );
    }
    const storeId = store.id;

    const { data: rows } = await db
      .from("merchant_store_media_files")
      .select(
        "id, source_entity, r2_key, public_url, menu_url, original_file_name, file_size_bytes, mime_type, menu_reference_image_urls"
      )
      .eq("store_id", storeId)
      .eq("media_scope", "MENU_REFERENCE")
      .eq("is_active", true)
      .order("created_at", { ascending: true });

    const mediaRows = (rows || []) as {
      id: number;
      source_entity: string | null;
      r2_key: string | null;
      public_url: string | null;
      menu_url: string | null;
      original_file_name: string | null;
      file_size_bytes: number | null;
      mime_type: string | null;
      menu_reference_image_urls?: unknown;
    }[];

    const imageRows = mediaRows.filter((r) => r.source_entity === "ONBOARDING_MENU_IMAGE");
    const pdfRows = mediaRows.filter((r) => r.source_entity === "ONBOARDING_MENU_PDF");
    const sheetRows = mediaRows.filter((r) => r.source_entity === "ONBOARDING_MENU_SHEET");

    let attachmentType: "images" | "pdf" | "csv" | null = null;
    if (imageRows.length > 0) {
      attachmentType = "images";
    } else if (pdfRows.length > 0) {
      attachmentType = "pdf";
    } else if (sheetRows.length > 0) {
      attachmentType = "csv";
    }

    const rowToProxy = (r: (typeof mediaRows)[0]) =>
      (r.menu_url && String(r.menu_url).trim()) ||
      (r.public_url && String(r.public_url).trim()) ||
      (r.r2_key ? toStoredDocumentUrl(r.r2_key) : null);

    const files: {
      id: number;
      entry_id?: string;
      file_url: string | null;
      file_name: string | null;
      file_size: number | null;
      mime_type: string | null;
    }[] = [];

    for (const r of mediaRows) {
      if (r.source_entity === "ONBOARDING_MENU_IMAGE") {
        const parsed = parseMenuReferenceImageUrls(r.menu_reference_image_urls);
        const list: MenuReferenceImageEntry[] =
          parsed.length > 0
            ? parsed
            : (() => {
                const raw =
                  (r.menu_url && String(r.menu_url).trim()) ||
                  (r.public_url && String(r.public_url).trim()) ||
                  (r.r2_key && String(r.r2_key).trim()) ||
                  "";
                return raw
                  ? [
                      {
                        id: stableEntryIdForUrl(raw),
                        url: raw,
                        file_name: r.original_file_name,
                      },
                    ]
                  : [];
              })();
        for (const e of list) {
          files.push({
            id: r.id,
            entry_id: e.id,
            file_url: e.url,
            file_name: (e.file_name && String(e.file_name)) || r.original_file_name,
            file_size: r.file_size_bytes,
            mime_type: r.mime_type,
          });
        }
        continue;
      }
      files.push({
        id: r.id,
        file_url: rowToProxy(r),
        file_name: r.original_file_name,
        file_size: r.file_size_bytes,
        mime_type: r.mime_type,
      });
    }

    return NextResponse.json({
      success: true,
      store_id: storeId,
      attachment_type: attachmentType,
      files,
    });
  } catch (e) {
    console.error("[register-store-menu-uploads] GET", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const validation = await validateMerchantFromSession({
      id: user.id,
      email: user.email ?? null,
      phone: user.phone ?? null,
    });
    if (!validation.isValid || validation.merchantParentId == null) {
      return NextResponse.json({ error: validation.error ?? "Forbidden" }, { status: 403 });
    }

    const formData = await req.formData();
    const action = (formData.get("action") as string) || "";
    const storeIdParam = (formData.get("store_id") as string) || "";
    const storePublicForm = (formData.get("store_public_id") as string) || "";
    const attachmentType = ((formData.get("attachment_type") as string)?.toLowerCase() || "") as
      | "images"
      | "pdf"
      | "csv";
    const newAttachmentType = ((formData.get("new_attachment_type") as string)?.toLowerCase() || "") as
      | "images"
      | "pdf"
      | "csv";

    const db = getSupabaseAdmin();
    const store = await resolveStoreForMenuUpload(
      db,
      validation.merchantParentId,
      storeIdParam,
      storePublicForm
    );
    if (!store) {
      return NextResponse.json(
        {
          error:
            "Missing store. Pass store_id (draft numeric id from onboarding) or store_public_id (e.g. GMMC1025). Finish Steps 1–2 first.",
        },
        { status: 400 }
      );
    }
    const storeId = store.id;

    if (action === "switch_type" && ["images", "pdf", "csv"].includes(newAttachmentType)) {
      await deleteAllForStore(db, storeId);
      return NextResponse.json({ success: true, attachment_type: newAttachmentType, files: [] });
    }

    if (!["images", "pdf", "csv"].includes(attachmentType)) {
      return NextResponse.json({ error: "Missing or invalid attachment_type (use images, pdf, csv)" }, { status: 400 });
    }

    const existing = await db
      .from("merchant_store_media_files")
      .select("id, source_entity, r2_key")
      .eq("store_id", storeId)
      .eq("media_scope", "MENU_REFERENCE");

    const existingRows = (existing.data || []) as { id: number; source_entity: string | null; r2_key: string | null }[];
    const currentType =
      existingRows.length && existingRows.some((r) => r.source_entity === "ONBOARDING_MENU_IMAGE")
        ? "images"
        : existingRows.length && existingRows.some((r) => r.source_entity === "ONBOARDING_MENU_PDF")
        ? "pdf"
        : existingRows.length && existingRows.some((r) => r.source_entity === "ONBOARDING_MENU_SHEET")
        ? "csv"
        : null;

    // Type switch: delete all existing from R2 + DB
    if (currentType && currentType !== attachmentType) {
      await deleteAllForStore(db, storeId);
    }

    const files: File[] = [];
    if (attachmentType === "images") {
      const fileList = formData.getAll("files") as File[];
      for (const f of fileList) if (f && f instanceof File) files.push(f);
      if (formData.get("file") instanceof File) files.push(formData.get("file") as File);
    } else {
      const single = formData.get("file") as File | null;
      if (single && single instanceof File) files.push(single);
    }

    if (files.length === 0) {
      return NextResponse.json({ error: "No file(s) provided" }, { status: 400 });
    }

    type MenuImageDbRow = {
      id: number;
      menu_reference_image_urls?: unknown;
      menu_url?: string | null;
      public_url?: string | null;
      r2_key?: string | null;
      original_file_name?: string | null;
    };
    let menuImageExistingRows: MenuImageDbRow[] | null = null;

    if (attachmentType === "images") {
      const { data: imgRowsPre } = await db
        .from("merchant_store_media_files")
        .select("id, r2_key, public_url, menu_url, original_file_name, menu_reference_image_urls")
        .eq("store_id", storeId)
        .eq("media_scope", "MENU_REFERENCE")
        .eq("source_entity", "ONBOARDING_MENU_IMAGE");
      menuImageExistingRows = (imgRowsPre || []) as MenuImageDbRow[];
      const existingImageEntries = entriesFromImageMediaRows(menuImageExistingRows);
      if (existingImageEntries.length + files.length > MAX_IMAGES) {
        return NextResponse.json(
          {
            error: `Maximum ${MAX_IMAGES} images allowed. You have ${existingImageEntries.length} and are adding ${files.length}.`,
          },
          { status: 400 }
        );
      }
      for (const f of files) {
        if (f.size > MAX_FILE_BYTES) {
          return NextResponse.json({ error: `File ${f.name} exceeds 5 MB limit.` }, { status: 400 });
        }
        const mime = (f.type || "").toLowerCase();
        if (!IMAGE_TYPES.some((t) => mime.includes(t.split("/")[1]))) {
          return NextResponse.json({ error: `Only JPG, PNG, WEBP allowed. Got ${f.type || "unknown"}.` }, { status: 400 });
        }
      }
    } else {
      if (files.length > 1) {
        return NextResponse.json({ error: "Only one file allowed for PDF or CSV." }, { status: 400 });
      }
      const f = files[0];
      if (f.size > MAX_FILE_BYTES) {
        return NextResponse.json({ error: "File exceeds 5 MB limit." }, { status: 400 });
      }
      if (attachmentType === "pdf") {
        const mime = (f.type || "").toLowerCase();
        const name = (f.name || "").toLowerCase();
        const okPdf =
          name.endsWith(".pdf") || mime === PDF_MIME || mime === "application/x-pdf";
        if (!okPdf) {
          return NextResponse.json({ error: "Only PDF allowed." }, { status: 400 });
        }
      } else {
        const mime = (f.type || "").toLowerCase();
        const name = (f.name || "").toLowerCase();
        const ok = CSV_MIMES.some((m) => mime.includes(m)) || name.endsWith(".csv") || name.endsWith(".xls") || name.endsWith(".xlsx");
        if (!ok) return NextResponse.json({ error: "Only CSV or Excel allowed." }, { status: 400 });
      }
    }

    const parentKeyForR2 = (store as { parentPrimaryKeySegment: string }).parentPrimaryKeySegment;
    const menuPrefix = getOnboardingMenuReferenceFlatPath(parentKeyForR2, store.store_id);

    if (attachmentType === "images") {
      const existingImageEntries = entriesFromImageMediaRows(menuImageExistingRows || []);
      const newUploadedKeys: string[] = [];
      const newEntries: MenuReferenceImageEntry[] = [];
      try {
        for (const file of files) {
          if (!file || typeof file.size !== "number" || file.size <= 0) {
            return NextResponse.json({ error: "Invalid or empty file." }, { status: 400 });
          }
          const ext = getExt(file.name || "", file.type || "", attachmentType);
          const r2Key = `${menuPrefix}/menu-ref-img_${randomUUID()}.${ext}`;
          const mimeForDb = contentTypeForUpload(file, ext);
          const storedKey = await uploadToR2(file, r2Key, mimeForDb);
          newUploadedKeys.push(storedKey);
          const proxyUrl =
            toStoredDocumentUrl(storedKey) ||
            `/api/attachments/proxy?key=${encodeURIComponent(storedKey.replace(/^\/+/, ""))}`;
          newEntries.push(newImageEntry(proxyUrl, file.name || null));
        }
        console.info(
          "[register-store-menu-uploads] R2 PutObject OK | bucket=%s | keys=%s",
          process.env.R2_BUCKET_NAME ?? "(unset)",
          newUploadedKeys.join(" | ")
        );
      } catch (uploadErr: unknown) {
        const msg = uploadErr instanceof Error ? uploadErr.message : String(uploadErr);
        console.error("[register-store-menu-uploads] R2 upload failed:", msg, uploadErr);
        for (const k of newUploadedKeys) {
          try {
            await deleteFromR2(k);
          } catch {
            /* best effort */
          }
        }
        return NextResponse.json(
          { error: `Could not store file in cloud storage (R2). ${msg}`.slice(0, 500) },
          { status: 502 }
        );
      }

      const merged = dedupeEntriesByUrl([...existingImageEntries, ...newEntries]);
      const oldRowIds = (menuImageExistingRows || []).map((r) => r.id);
      if (oldRowIds.length) {
        await db.from("merchant_store_media_files").delete().in("id", oldRowIds);
      }

      const first = merged[0];
      const urlForDb = first.url;
      const displayName =
        merged
          .map((e) => e.file_name)
          .filter((n): n is string => typeof n === "string" && !!n.trim())
          .join(", ") || "menu_images";

      const { data: insRow, error: insertErr } = await db
        .from("merchant_store_media_files")
        .insert({
          store_id: storeId,
          media_scope: "MENU_REFERENCE",
          source_entity: "ONBOARDING_MENU_IMAGE",
          source_entity_id: null,
          original_file_name: displayName,
          r2_key: urlForDb,
          public_url: urlForDb,
          menu_url: urlForDb,
          menu_reference_image_urls: merged,
          mime_type: "image/*",
          file_size_bytes: null,
          version_no: 1,
          is_active: true,
          verification_status: "PENDING",
          uploaded_by: user.id,
        })
        .select("id, original_file_name, file_size_bytes")
        .single();

      if (insertErr || !insRow) {
        console.error("[register-store-menu-uploads] image bundle insert failed:", insertErr);
        for (const k of newUploadedKeys) {
          try {
            await deleteFromR2(k);
          } catch {
            /* best effort */
          }
        }
        return NextResponse.json(
          {
            error:
              (insertErr as { message?: string })?.message ||
              "File uploaded to storage but could not save metadata in database.",
          },
          { status: 500 }
        );
      }

      const rowId = (insRow as { id: number }).id;
      const inserted = merged.map((e) => ({
        id: rowId,
        entry_id: e.id,
        file_url: e.url,
        file_name: e.file_name ?? null,
        file_size: null as number | null,
      }));

      return NextResponse.json({
        success: true,
        attachment_type: attachmentType,
        files: inserted,
        r2_bucket: process.env.R2_BUCKET_NAME ?? null,
        r2_objects_prefix: menuPrefix,
      });
    }

    const sheetSource: "ONBOARDING_MENU_PDF" | "ONBOARDING_MENU_SHEET" =
      attachmentType === "pdf" ? "ONBOARDING_MENU_PDF" : "ONBOARDING_MENU_SHEET";
    await deleteMenuSheetOrPdfForReplace(db, storeId, sheetSource, parentKeyForR2, store.store_id);

    const file = files[0];
    if (!file || typeof file.size !== "number" || file.size <= 0) {
      return NextResponse.json({ error: "Invalid or empty file." }, { status: 400 });
    }
    const ext = getExt(file.name || "", file.type || "", attachmentType);
    const mimeForDb = contentTypeForUpload(file, ext);
    const r2Key =
      attachmentType === "pdf"
        ? getOnboardingMenuReferenceCanonicalPdfKey(parentKeyForR2, store.store_id)
        : (() => {
            const lowerName = (file.name || "").toLowerCase();
            const sheetExt: "csv" | "xlsx" | "xls" = lowerName.endsWith(".xlsx")
              ? "xlsx"
              : lowerName.endsWith(".xls")
                ? "xls"
                : "csv";
            return getOnboardingMenuReferenceCanonicalSheetKey(parentKeyForR2, store.store_id, sheetExt);
          })();

    let storedKey: string;
    try {
      storedKey = await uploadToR2(file, r2Key, mimeForDb);
      console.info(
        "[register-store-menu-uploads] R2 PutObject OK | bucket=%s | key=%s",
        process.env.R2_BUCKET_NAME ?? "(unset)",
        storedKey
      );
    } catch (uploadErr: unknown) {
      const msg = uploadErr instanceof Error ? uploadErr.message : String(uploadErr);
      console.error("[register-store-menu-uploads] R2 upload failed:", msg, uploadErr);
      return NextResponse.json(
        { error: `Could not store file in cloud storage (R2). ${msg}`.slice(0, 500) },
        { status: 502 }
      );
    }

    const proxyUrl =
      toStoredDocumentUrl(storedKey) ||
      `/api/attachments/proxy?key=${encodeURIComponent(storedKey.replace(/^\/+/, ""))}`;
    const urlForDb = proxyUrl;
    const sheetPdfPayload = {
      store_id: storeId,
      media_scope: "MENU_REFERENCE" as const,
      source_entity: sheetSource,
      source_entity_id: null as string | null,
      original_file_name: file.name || (attachmentType === "pdf" ? "menu-reference.pdf" : "menu-reference-sheet"),
      r2_key: urlForDb,
      public_url: urlForDb,
      menu_url: urlForDb,
      mime_type: mimeForDb,
      file_size_bytes: file.size,
      version_no: 1,
      is_active: true,
      verification_status: "PENDING" as const,
      uploaded_by: user.id,
    };

    const { data: row, error: insertErr } = await db
      .from("merchant_store_media_files")
      .upsert(sheetPdfPayload, { onConflict: "r2_key" })
      .select("id, original_file_name, file_size_bytes")
      .single();

    if (insertErr || !row) {
      console.error("[register-store-menu-uploads] DB upsert failed after R2 OK:", storedKey, insertErr);
      try {
        await deleteFromR2(storedKey);
      } catch {
        /* best effort */
      }
      return NextResponse.json(
        {
          error:
            (insertErr as { message?: string })?.message ||
            "File uploaded to storage but could not save metadata in database.",
        },
        { status: 500 }
      );
    }

    const insertedRow = row as {
      id: number;
      original_file_name: string | null;
      file_size_bytes: number | null;
    };

    return NextResponse.json({
      success: true,
      attachment_type: attachmentType,
      files: [
        {
          id: insertedRow.id,
          file_url: urlForDb,
          file_name: insertedRow.original_file_name,
          file_size: insertedRow.file_size_bytes,
        },
      ],
      r2_bucket: process.env.R2_BUCKET_NAME ?? null,
      r2_objects_prefix: menuPrefix,
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Upload failed";
    console.error("[register-store-menu-uploads] POST", e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const validation = await validateMerchantFromSession({
      id: user.id,
      email: user.email ?? null,
      phone: user.phone ?? null,
    });
    if (!validation.isValid || validation.merchantParentId == null) {
      return NextResponse.json({ error: validation.error ?? "Forbidden" }, { status: 403 });
    }

    const idParam = req.nextUrl.searchParams.get("id");
    const id = idParam ? parseInt(idParam, 10) : NaN;
    if (!Number.isFinite(id) || id <= 0) {
      return NextResponse.json({ error: "Missing or invalid id" }, { status: 400 });
    }

    const db = getSupabaseAdmin();
    const entryId = req.nextUrl.searchParams.get("entry_id")?.trim() || null;

    const { data: row, error: fetchErr } = await db
      .from("merchant_store_media_files")
      .select(
        "id, store_id, r2_key, public_url, menu_url, media_scope, source_entity, menu_reference_image_urls"
      )
      .eq("id", id)
      .eq("media_scope", "MENU_REFERENCE")
      .maybeSingle();

    if (fetchErr || !row) {
      return NextResponse.json({ error: "Record not found" }, { status: 404 });
    }

    const storeFk = (row as { store_id: number | string }).store_id;
    const storeId =
      typeof storeFk === "string" ? parseInt(storeFk, 10) : Number(storeFk);
    if (!Number.isFinite(storeId) || storeId <= 0) {
      return NextResponse.json({ error: "Invalid store on record" }, { status: 400 });
    }
    const store = await getStoreForMerchant(db, storeId, validation.merchantParentId);
    if (!store) return NextResponse.json({ error: "Store not found" }, { status: 404 });

    const srcEntity = (row as { source_entity?: string | null }).source_entity;

    if (entryId && srcEntity === "ONBOARDING_MENU_IMAGE") {
      const ents = entriesFromImageMediaRows([
        row as {
          id: number;
          menu_reference_image_urls?: unknown;
          menu_url?: string | null;
          public_url?: string | null;
          r2_key?: string | null;
          original_file_name?: string | null;
        },
      ]);
      const victim = ents.find((e) => e.id === entryId);
      if (!victim) {
        return NextResponse.json({ error: "Image entry not found" }, { status: 404 });
      }
      const delKey = r2KeyFromMenuMediaRow({ menu_url: victim.url, public_url: victim.url, r2_key: victim.url });
      if (delKey) {
        try {
          await deleteFromR2(delKey);
        } catch (e) {
          console.warn("[register-store-menu-uploads] R2 delete failed:", delKey, e);
        }
      }
      const next = ents.filter((e) => e.id !== entryId);
      if (next.length === 0) {
        await db.from("merchant_store_media_files").delete().eq("id", id).eq("media_scope", "MENU_REFERENCE");
      } else {
        const u0 = next[0].url;
        await db
          .from("merchant_store_media_files")
          .update({
            menu_reference_image_urls: next,
            menu_url: u0,
            public_url: u0,
            r2_key: u0,
            updated_at: new Date().toISOString(),
          })
          .eq("id", id)
          .eq("media_scope", "MENU_REFERENCE");
      }
      return NextResponse.json({ success: true });
    }

    if (srcEntity === "ONBOARDING_MENU_IMAGE") {
      const ents = entriesFromImageMediaRows([
        row as {
          id: number;
          menu_reference_image_urls?: unknown;
          menu_url?: string | null;
          public_url?: string | null;
          r2_key?: string | null;
          original_file_name?: string | null;
        },
      ]);
      for (const e of ents) {
        const k = r2KeyFromMenuMediaRow({ menu_url: e.url, public_url: e.url, r2_key: e.url });
        if (k) {
          try {
            await deleteFromR2(k);
          } catch (err) {
            console.warn("[register-store-menu-uploads] R2 delete failed:", k, err);
          }
        }
      }
      if (ents.length === 0) {
        const key = r2KeyFromMenuMediaRow(row as { r2_key: string | null; public_url?: string | null; menu_url?: string | null });
        if (key) {
          try {
            await deleteFromR2(key);
          } catch (e) {
            console.warn("[register-store-menu-uploads] R2 delete failed:", key, e);
          }
        }
      }
    } else {
      const key = r2KeyFromMenuMediaRow(row as { r2_key: string | null; public_url?: string | null; menu_url?: string | null });
      if (key) {
        try {
          await deleteFromR2(key);
        } catch (e) {
          console.warn("[register-store-menu-uploads] R2 delete failed:", key, e);
        }
      }
    }

    await db.from("merchant_store_media_files").delete().eq("id", id).eq("media_scope", "MENU_REFERENCE");

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("[register-store-menu-uploads] DELETE", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
