/**
 * Menu Setup uploads: one attachment type per store (images max 5, or one PDF, or one CSV).
 * GET: list by store_id
 * POST: upload file(s) — handles type switch (delete all), then R2 upload + DB insert; rollback R2 on DB fail
 * DELETE: remove one by id (R2 + DB)
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createClient } from "@supabase/supabase-js";
import { validateMerchantFromSession } from "@/lib/auth/validate-merchant";
import { getMenuUploadR2Key } from "@/lib/r2-paths";
import { uploadToR2, deleteFromR2 } from "@/lib/r2";
import { toStoredDocumentUrl } from "@/lib/r2";

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

function toProxyUrl(key: string): string {
  return toStoredDocumentUrl(key) ?? `/api/attachments/proxy?key=${encodeURIComponent(key)}`;
}

/** Ensure store belongs to current merchant */
async function getStoreForMerchant(db: ReturnType<typeof getSupabaseAdmin>, storeId: number, merchantParentId: number) {
  const { data, error } = await db
    .from("merchant_stores")
    .select("id, store_id, parent_id")
    .eq("id", storeId)
    .single();
  if (error || !data || (data as { parent_id: number }).parent_id !== merchantParentId) return null;
  return data as { id: number; store_id: string; parent_id: number };
}

/** Delete all menu uploads for store from R2 and DB (for type switch). Uses merchant_store_media_files with media_scope='MENU_REFERENCE'. */
async function deleteAllForStore(db: ReturnType<typeof getSupabaseAdmin>, storeId: number): Promise<void> {
  const { data: rows } = await db
    .from("merchant_store_media_files")
    .select("id, r2_key")
    .eq("store_id", storeId)
    .eq("media_scope", "MENU_REFERENCE");

  if (!rows?.length) return;

  for (const row of rows as { id: number; r2_key: string | null }[]) {
    const key = row.r2_key;
    if (!key) continue;
    try {
      await deleteFromR2(key);
    } catch (e) {
      console.warn("[register-store-menu-uploads] R2 delete failed:", key, e);
    }
  }

  await db
    .from("merchant_store_media_files")
    .delete()
    .eq("store_id", storeId)
    .eq("media_scope", "MENU_REFERENCE");
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
    const storeId = storeIdParam ? parseInt(storeIdParam, 10) : NaN;
    if (!Number.isFinite(storeId) || storeId <= 0) {
      return NextResponse.json({ error: "Missing or invalid store_id" }, { status: 400 });
    }

    const db = getSupabaseAdmin();
    const store = await getStoreForMerchant(db, storeId, validation.merchantParentId);
    if (!store) return NextResponse.json({ error: "Store not found" }, { status: 404 });

    const { data: rows } = await db
      .from("merchant_store_media_files")
      .select("id, source_entity, r2_key, original_file_name, file_size_bytes, mime_type")
      .eq("store_id", storeId)
      .eq("media_scope", "MENU_REFERENCE")
      .eq("is_active", true)
      .order("created_at", { ascending: true });

    const mediaRows = (rows || []) as {
      id: number;
      source_entity: string | null;
      r2_key: string | null;
      original_file_name: string | null;
      file_size_bytes: number | null;
      mime_type: string | null;
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

    const files = mediaRows.map((r) => ({
      id: r.id,
      file_url: r.r2_key ? toProxyUrl(r.r2_key) : null,
      file_name: r.original_file_name,
      file_size: r.file_size_bytes,
      mime_type: r.mime_type,
    }));

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
    if (!validation.isValid || validation.merchantParentId == null || !validation.parentMerchantId) {
      return NextResponse.json({ error: validation.error ?? "Forbidden" }, { status: 403 });
    }

    const formData = await req.formData();
    const action = (formData.get("action") as string) || "";
    const storeIdParam = (formData.get("store_id") as string) || "";
    const storeId = parseInt(storeIdParam, 10);
    const attachmentType = ((formData.get("attachment_type") as string)?.toLowerCase() || "") as
      | "images"
      | "pdf"
      | "csv";
    const newAttachmentType = ((formData.get("new_attachment_type") as string)?.toLowerCase() || "") as
      | "images"
      | "pdf"
      | "csv";

    if (!Number.isFinite(storeId) || storeId <= 0) {
      return NextResponse.json({ error: "Missing or invalid store_id" }, { status: 400 });
    }

    const db = getSupabaseAdmin();
    const store = await getStoreForMerchant(db, storeId, validation.merchantParentId);
    if (!store) return NextResponse.json({ error: "Store not found" }, { status: 404 });

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

    // PDF/CSV: replace existing (delete old single file) before adding new
    if ((attachmentType === "pdf" || attachmentType === "csv") && existingRows.length > 0) {
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

    if (attachmentType === "images") {
      const currentCount =
        currentType === "images"
          ? existingRows.filter((r) => r.source_entity === "ONBOARDING_MENU_IMAGE").length
          : 0;
      if (currentCount + files.length > MAX_IMAGES) {
        return NextResponse.json({ error: `Maximum ${MAX_IMAGES} images allowed. You have ${currentCount} and are adding ${files.length}.` }, { status: 400 });
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
        if ((f.type || "").toLowerCase() !== PDF_MIME) {
          return NextResponse.json({ error: "Only PDF allowed." }, { status: 400 });
        }
      } else {
        const mime = (f.type || "").toLowerCase();
        const name = (f.name || "").toLowerCase();
        const ok = CSV_MIMES.some((m) => mime.includes(m)) || name.endsWith(".csv") || name.endsWith(".xls") || name.endsWith(".xlsx");
        if (!ok) return NextResponse.json({ error: "Only CSV or Excel allowed." }, { status: 400 });
      }
    }

    const uploadedKeys: string[] = [];
    try {
      const inserted: { id: number; file_url: string; file_name: string | null; file_size: number | null }[] = [];

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const ext = getExt(file.name || "", file.type || "", attachmentType);
        const uniqueName = `${crypto.randomUUID()}.${ext}`;
        const r2Key = getMenuUploadR2Key(
          validation.parentMerchantId!,
          store.store_id,
          attachmentType,
          uniqueName
        );
        await uploadToR2(file, r2Key);
        uploadedKeys.push(r2Key);

        const fileUrl = toProxyUrl(r2Key);
        const sourceEntity =
          attachmentType === "images"
            ? "ONBOARDING_MENU_IMAGE"
            : attachmentType === "pdf"
            ? "ONBOARDING_MENU_PDF"
            : "ONBOARDING_MENU_SHEET";

        const { data: row, error: insertErr } = await db
          .from("merchant_store_media_files")
          .insert({
            store_id: storeId,
            media_scope: "MENU_REFERENCE",
            source_entity: sourceEntity,
            source_entity_id: null,
            original_file_name: file.name || uniqueName,
            r2_key: r2Key,
            public_url: fileUrl,
            mime_type: file.type || null,
            file_size_bytes: file.size,
            is_active: true,
          })
          .select("id, r2_key, original_file_name, file_size_bytes")
          .single();

        if (insertErr) {
          throw new Error(insertErr.message || "DB insert failed");
        }

        const insertedRow = row as {
          id: number;
          original_file_name: string | null;
          file_size_bytes: number | null;
        };

        inserted.push({
          id: insertedRow.id,
          file_url: fileUrl,
          file_name: insertedRow.original_file_name,
          file_size: insertedRow.file_size_bytes,
        });
      }

      return NextResponse.json({
        success: true,
        attachment_type: attachmentType,
        files: inserted,
      });
    } catch (err) {
      for (const key of uploadedKeys) {
        try {
          await deleteFromR2(key);
        } catch (e2) {
          console.warn("[register-store-menu-uploads] Rollback R2 delete failed:", key, e2);
        }
      }
      throw err;
    }
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
    const { data: row, error: fetchErr } = await db
      .from("merchant_store_media_files")
      .select("id, store_id, r2_key, media_scope")
      .eq("id", id)
      .eq("media_scope", "MENU_REFERENCE")
      .maybeSingle();

    if (fetchErr || !row) {
      return NextResponse.json({ error: "Record not found" }, { status: 404 });
    }

    const storeId = (row as { store_id: number }).store_id;
    const store = await getStoreForMerchant(db, storeId, validation.merchantParentId);
    if (!store) return NextResponse.json({ error: "Store not found" }, { status: 404 });

    const key = (row as { r2_key: string | null }).r2_key;
    if (key) {
      try {
        await deleteFromR2(key);
      } catch (e) {
        console.warn("[register-store-menu-uploads] R2 delete failed:", key, e);
      }
    }

    await db
      .from("merchant_store_media_files")
      .delete()
      .eq("id", id)
      .eq("media_scope", "MENU_REFERENCE");

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("[register-store-menu-uploads] DELETE", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
