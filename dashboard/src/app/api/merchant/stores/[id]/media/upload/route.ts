/**
 * POST /api/merchant/stores/[id]/media/upload
 * Upload menu file (image, CSV, XLS) to R2 and register in merchant_store_media_files.
 */
import { NextRequest, NextResponse } from "next/server";
import { authenticateMerchantStoreOperator } from "@/lib/merchant-store-route-auth";
import { resolveMerchantListAreaManagerId } from "@/lib/merchants/resolve-merchant-list-scope";
import { getMerchantStoreById } from "@/lib/db/operations/merchant-stores";
import { getSql } from "@/lib/db/client";
import { uploadWithKey, deleteDocument } from "@/lib/services/r2";
import {
  toAttachmentProxyUrl,
  extractR2KeyFromProxyUrl,
  contentTypeFromR2Key,
} from "@/lib/r2-proxy-url";
import { randomUUID } from "crypto";

export const runtime = "nodejs";

const MAX_MENU_FILE_BYTES = 15 * 1024 * 1024; // 15 MB for PDF/CSV/XLS/XLSX
const MAX_MENU_IMAGE_BYTES = 12 * 1024 * 1024; // 12 MB per image
const MAX_MENU_IMAGES = 5;
const CSV_MIN_ROWS = 1;
const CSV_MAX_ROWS = 500;
const CSV_REQUIRED_HEADERS = [
  ["item_name", "name"],
  ["price", "base_price", "selling_price"],
];

function sanitizeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 80) || "file";
}

function parseCsvRowCountAndHeaders(text: string): { rowCount: number; headers: string[]; error?: string } {
  const lines = text
    .trim()
    .split(/\r?\n/)
    .filter((l) => l.trim().length > 0);
  if (lines.length === 0) return { rowCount: 0, headers: [], error: "CSV is empty" };
  const headers = lines[0]
    .split(/[,;\t]/)
    .map((h) => h.trim().toLowerCase().replace(/^["']|["']$/g, ""));
  const rowCount = Math.max(0, lines.length - 1);
  if (rowCount < CSV_MIN_ROWS) {
    return { rowCount, headers, error: `Minimum ${CSV_MIN_ROWS} data row(s) required (excluding header).` };
  }
  if (rowCount > CSV_MAX_ROWS) {
    return { rowCount, headers, error: `Maximum ${CSV_MAX_ROWS} data rows allowed. You have ${rowCount}.` };
  }
  const hasName = CSV_REQUIRED_HEADERS[0].some((h) => headers.includes(h));
  const hasPrice = CSV_REQUIRED_HEADERS[1].some((h) => headers.includes(h));
  if (!hasName) return { rowCount, headers, error: `CSV must have one of: ${CSV_REQUIRED_HEADERS[0].join(", ")}` };
  if (!hasPrice) return { rowCount, headers, error: `CSV must have one of: ${CSV_REQUIRED_HEADERS[1].join(", ")}` };
  return { rowCount, headers };
}

function docsMenuBasePath(parentId: number, storeCode: string): string {
  return `docs/merchants/${parentId}/stores/${storeCode}/onboarding/menu`;
}

function canonicalSheetMime(fileName: string): string {
  const n = fileName.toLowerCase();
  if (n.endsWith(".xlsx")) return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  if (n.endsWith(".xls")) return "application/vnd.ms-excel";
  return "text/csv";
}

function mimeForMenuFile(file: File, r2Key: string, fallback?: string | null): string {
  return contentTypeFromR2Key(r2Key, (fallback && fallback.trim()) || file.type || null);
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const storeId = parseInt(id, 10);
    if (!Number.isFinite(storeId)) {
      console.warn("[media/upload] invalid store id:", id);
      return NextResponse.json(
        { success: false, error: "Invalid store id", code: "INVALID_STORE_ID" },
        { status: 400 }
      );
    }

    const operator = await authenticateMerchantStoreOperator(request);
    if (!operator.ok) return operator.response;
    const user = operator.user;

    const areaManagerId = await resolveMerchantListAreaManagerId({
      supabaseAuthId: user.id,
      email: user.email ?? "",
    });

    const store = await getMerchantStoreById(storeId, areaManagerId);
    if (!store) {
      return NextResponse.json(
        { success: false, error: "Store not found" },
        { status: 404 }
      );
    }

    const formData = await request.formData();
    const directFile = formData.get("file");
    const multiFiles = formData.getAll("files");
    const files: File[] = [];

    if (directFile instanceof File) {
      files.push(directFile);
    }
    for (const f of multiFiles) {
      if (f instanceof File) {
        files.push(f);
      }
    }

    const sourceEntityRaw = (formData.get("source_entity") as string) || "";
    const sourceEntity =
      sourceEntityRaw === "ONBOARDING_MENU_IMAGE" ||
      sourceEntityRaw === "ONBOARDING_MENU_PDF" ||
      sourceEntityRaw === "ONBOARDING_MENU_SHEET"
        ? sourceEntityRaw
        : "ONBOARDING_MENU_IMAGE";
    if (files.length === 0) {
      console.warn("[media/upload] no files in form-data", {
        storeId,
        sourceEntityRaw,
      });
      return NextResponse.json(
        { success: false, error: "No file provided", code: "NO_FILE" },
        { status: 400 }
      );
    }

    // For images allow up to 5 files in one request.
    const effectiveFiles =
      sourceEntity === "ONBOARDING_MENU_IMAGE" ? files.slice(0, 5) : files.slice(0, 1);

    for (const f of effectiveFiles) {
      const sizeLimit =
        sourceEntity === "ONBOARDING_MENU_IMAGE"
          ? MAX_MENU_IMAGE_BYTES
          : MAX_MENU_FILE_BYTES;
      if (f.size > sizeLimit) {
        const maxMb = sourceEntity === "ONBOARDING_MENU_IMAGE" ? 12 : 15;
        console.warn("[media/upload] file too large", {
          storeId,
          fileName: f.name,
          fileSize: f.size,
          sourceEntity,
          sizeLimit,
        });
        return NextResponse.json(
          {
            success: false,
            error:
              sourceEntity === "ONBOARDING_MENU_IMAGE"
                ? `Image "${f.name}" is too large. Each image must be less than ${maxMb} MB.`
                : `File "${f.name}" is too large. Maximum allowed size is ${maxMb} MB.`,
            code: "FILE_TOO_LARGE",
          },
          { status: 400 }
        );
      }
    }

    const sql = getSql();
    const storeIdStr = String(store.store_id || storeId).trim();
    let parentIdForPath =
      typeof store.parent_id === "number" && Number.isFinite(store.parent_id)
        ? store.parent_id
        : null;
    if (parentIdForPath == null) {
      const parentRows = await sql`
        SELECT parent_id
        FROM merchant_stores
        WHERE id = ${storeId}
        LIMIT 1
      `;
      const parentRow = Array.isArray(parentRows) ? parentRows[0] : parentRows;
      if (parentRow && (parentRow as { parent_id?: unknown }).parent_id != null) {
        const parsed = Number((parentRow as { parent_id: unknown }).parent_id);
        if (Number.isFinite(parsed)) parentIdForPath = parsed;
      }
    }
    if (parentIdForPath == null) {
      console.warn("[media/upload] parent id missing", {
        storeId,
        storePublicId: storeIdStr,
      });
      return NextResponse.json(
        { success: false, error: "Parent id not found for store", code: "PARENT_ID_MISSING" },
        { status: 400 }
      );
    }
    const menuBasePath = docsMenuBasePath(parentIdForPath, storeIdStr);

    const createdFiles: {
      id: number;
      store_id: number;
      media_scope: string;
      original_file_name: string;
      r2_key: string;
      public_url: string;
      mime_type: string | null;
      file_size_bytes: number;
      verification_status: string;
      created_at: string;
    }[] = [];

    try {
      // Align with partnersite behavior:
      // - IMAGE: append (max 5 total)
      // - PDF / SHEET: replace only same source_entity (not all menu files)
      const existing = await sql`
        SELECT id, r2_key, menu_reference_image_urls
        FROM merchant_store_media_files
        WHERE store_id = ${storeId}
          AND media_scope = 'MENU_REFERENCE'
          AND source_entity = ${sourceEntity}
      `;
      const rows = (Array.isArray(existing) ? existing : existing ? [existing] : []) as {
        id: number;
        r2_key: string | null;
        menu_reference_image_urls?: unknown;
      }[];

      if (sourceEntity === "ONBOARDING_MENU_IMAGE") {
        const aggregateRow = rows[0] ?? null;
        const existingBundle = Array.isArray(aggregateRow?.menu_reference_image_urls)
          ? (aggregateRow?.menu_reference_image_urls as Array<{
              id?: string;
              url?: string;
              file_name?: string;
              verification_status?: string;
            }>)
          : [];
        const existingImageCount = existingBundle.length;
        if (existingImageCount + effectiveFiles.length > MAX_MENU_IMAGES) {
          console.warn("[media/upload] max images exceeded", {
            storeId,
            existingImageCount,
            incoming: effectiveFiles.length,
            max: MAX_MENU_IMAGES,
          });
          return NextResponse.json(
            {
              success: false,
              error: `Maximum ${MAX_MENU_IMAGES} menu images allowed. You have ${existingImageCount}, uploading ${effectiveFiles.length}.`,
              code: "MAX_IMAGES_EXCEEDED",
            },
            { status: 400 }
          );
        }

        const uploadedBundleEntries: Array<{
          id: string;
          url: string;
          file_name: string;
          verification_status: string;
        }> = [];

        for (const f of effectiveFiles) {
          const ext = f.name.split(".").pop()?.toLowerCase() || "bin";
          const r2Key = `${menuBasePath}/menu-ref-img_${randomUUID()}.${ext}`;
          const uploadMime = mimeForMenuFile(f, r2Key);
          await uploadWithKey(f, r2Key, uploadMime);
          const publicUrl = toAttachmentProxyUrl(r2Key) || `/api/attachments/proxy?key=${encodeURIComponent(r2Key)}`;
          uploadedBundleEntries.push({
            id: randomUUID(),
            url: publicUrl,
            file_name: f.name,
            verification_status: "PENDING",
          });
        }

        const mergedBundle = [...existingBundle, ...uploadedBundleEntries];
        const primaryMenuUrl = mergedBundle[0]?.url ?? null;
        const primaryR2Key = primaryMenuUrl
          ? extractR2KeyFromProxyUrl(primaryMenuUrl)
          : null;
        const bundleJson = JSON.stringify(mergedBundle);
        const mergedNames = mergedBundle
          .map((entry) => String(entry.file_name ?? "").trim())
          .filter(Boolean)
          .join(", ");

        if (aggregateRow) {
          await sql`
            UPDATE merchant_store_media_files
            SET original_file_name = ${mergedNames || null},
                r2_key = ${primaryR2Key},
                public_url = ${primaryMenuUrl},
                menu_url = ${primaryMenuUrl},
                menu_reference_image_urls = CAST(${bundleJson} AS jsonb),
                mime_type = 'image/*',
                file_size_bytes = NULL,
                verification_status = 'PENDING',
                updated_at = NOW()
            WHERE id = ${aggregateRow.id}
          `;
        } else {
          await sql`
            INSERT INTO merchant_store_media_files (
              store_id, media_scope, source_entity, original_file_name, r2_key, public_url, menu_url, menu_reference_image_urls,
              mime_type, file_size_bytes, version_no, is_active, verification_status
            )
            VALUES (
              ${storeId},
              'MENU_REFERENCE',
              ${sourceEntity},
              ${mergedNames || null},
              ${primaryR2Key},
              ${primaryMenuUrl},
              ${primaryMenuUrl},
              CAST(${bundleJson} AS jsonb),
              'image/*',
              NULL,
              1,
              true,
              'PENDING'
            )
          `;
        }

        mergedBundle.forEach((entry, index) => {
          createdFiles.push({
            id: Date.now() + index,
            store_id: storeId,
            media_scope: "MENU_REFERENCE",
            original_file_name: String(entry.file_name ?? `menu-image-${index + 1}`),
            r2_key: extractR2KeyFromProxyUrl(String(entry.url ?? "")),
            public_url: String(entry.url ?? ""),
            mime_type: "image/*",
            file_size_bytes: 0,
            verification_status: String(entry.verification_status ?? "PENDING"),
            created_at: new Date().toISOString(),
          });
        });
      } else {
        // Replace only same type for PDF/SHEET.
        for (const row of rows) {
          if (!row.r2_key) continue;
          const keyToDelete = extractR2KeyFromProxyUrl(row.r2_key) || row.r2_key;
          try {
            await deleteDocument(keyToDelete);
          } catch (e) {
            console.warn("[media/upload] R2 delete failed for key:", keyToDelete, e);
          }
        }
        await sql`
          DELETE FROM merchant_store_media_files
          WHERE store_id = ${storeId}
            AND media_scope = 'MENU_REFERENCE'
            AND source_entity = ${sourceEntity}
        `;
        for (const f of effectiveFiles) {
          const ext = f.name.split(".").pop()?.toLowerCase() || "bin";
          let r2Key = "";
          let uploadMime = f.type || null;

          if (sourceEntity === "ONBOARDING_MENU_PDF") {
            r2Key = `${menuBasePath}/menu-reference.pdf`;
            uploadMime = "application/pdf";
          } else {
            // Keep extension-specific canonical file for sheet.
            const sheetExt = ext === "xlsx" || ext === "xls" ? ext : "csv";
            if (sheetExt === "csv") {
              const parsed = parseCsvRowCountAndHeaders(Buffer.from(await f.arrayBuffer()).toString("utf8"));
              // AM onboarding accepts merchant-provided reference CSVs with variable schemas.
              // Keep parse best-effort for diagnostics, but do not block upload.
              if (parsed.error) {
                console.warn("[media/upload] CSV validation warning (non-blocking):", parsed.error);
              }
            }
            r2Key = `${menuBasePath}/menu-reference-sheet.${sheetExt}`;
            uploadMime = canonicalSheetMime(`x.${sheetExt}`);
          }

          await uploadWithKey(f, r2Key, uploadMime);

          const publicUrl =
            toAttachmentProxyUrl(r2Key) ||
            `/api/attachments/proxy?key=${encodeURIComponent(r2Key)}`;
          const inserted = await sql`
            INSERT INTO merchant_store_media_files (
              store_id, media_scope, source_entity, original_file_name, r2_key, public_url, menu_url, menu_reference_image_urls,
              mime_type, file_size_bytes, version_no, is_active, verification_status
            )
            VALUES (
              ${storeId},
              'MENU_REFERENCE',
              ${sourceEntity},
              ${f.name},
              ${r2Key},
              ${publicUrl},
              ${publicUrl},
              NULL,
              ${uploadMime},
              ${f.size},
              1,
              true,
              'PENDING'
            )
            RETURNING id, store_id, media_scope, source_entity, original_file_name, r2_key, public_url,
                      mime_type, file_size_bytes, verification_status, created_at
          `;
          const row = Array.isArray(inserted) ? inserted[0] : inserted;
          if (row) {
            createdFiles.push({
              id: Number(row.id),
              store_id: storeId,
              media_scope: "MENU_REFERENCE",
              original_file_name: String(row.original_file_name ?? f.name),
              r2_key: String(row.r2_key ?? r2Key),
              public_url: String(row.public_url ?? publicUrl),
              mime_type: ((row.mime_type as string | null) ?? uploadMime) || null,
              file_size_bytes: Number(row.file_size_bytes ?? f.size),
              verification_status: String(row.verification_status ?? "PENDING"),
              created_at: (row.created_at as string) ?? new Date().toISOString(),
            });
          }
        }
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      console.error("[POST /api/merchant/stores/[id]/media/upload] failed:", e);
      const looksLikeMissingTable =
        /merchant_store_media_files/i.test(message) &&
        /(does not exist|undefined table|42703|42P01)/i.test(message);
      return NextResponse.json(
        {
          success: false,
          error: looksLikeMissingTable
            ? "Upload succeeded but failed to save record. Table merchant_store_media_files may not exist."
            : `Menu upload failed: ${message}`.slice(0, 400),
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      files: createdFiles,
      file: createdFiles[0] ?? null,
      message: "File(s) uploaded and saved.",
    });
  } catch (e) {
    console.error("[POST /api/merchant/stores/[id]/media/upload]", e);
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : "Upload failed" },
      { status: 500 }
    );
  }
}
