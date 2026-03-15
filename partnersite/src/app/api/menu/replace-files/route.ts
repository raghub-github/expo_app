import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createClient } from "@supabase/supabase-js";
import { extractR2KeyFromUrl, deleteFromR2, toStoredDocumentUrl } from "@/lib/r2";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function getSupabaseAdmin() {
  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/**
 * POST /api/menu/replace-files
 * Handles menu file replacement during onboarding or post-verification.
 * 
 * During onboarding: Deletes old files from R2 and database, uploads new files.
 * After verification: Keeps old files with is_active=false, adds new files with is_active=true.
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { storeDbId, oldImageUrls, oldSpreadsheetUrl, newImageUrls, newSpreadsheetUrl, menuUploadMode } = body;

    if (!storeDbId) {
      return NextResponse.json({ error: "storeDbId is required" }, { status: 400 });
    }

    const db = getSupabaseAdmin();

    // Check if store is verified (onboarding completed and approved)
    const { data: storeData } = await db
      .from("merchant_stores")
      .select("id, onboarding_completed, approval_status")
      .eq("id", storeDbId)
      .single();

    const isVerified = storeData?.onboarding_completed && storeData?.approval_status === "APPROVED";

    // Get existing menu media files
    const { data: existingMedia } = await db
      .from("merchant_store_media_files")
      .select("id, r2_key, public_url, is_active, source_entity")
      .eq("store_id", storeDbId)
      .eq("media_scope", "MENU_REFERENCE");

    const oldImageKeys: string[] = [];
    let oldSpreadsheetKey: string | null = null;

    // Extract R2 keys from old URLs
    if (oldImageUrls && Array.isArray(oldImageUrls)) {
      for (const url of oldImageUrls) {
        const key = extractR2KeyFromUrl(url) || (url.includes("://") ? null : url.replace(/^\/+/, ""));
        if (key) oldImageKeys.push(key);
      }
    }

    if (oldSpreadsheetUrl) {
      const key = extractR2KeyFromUrl(oldSpreadsheetUrl) || (oldSpreadsheetUrl.includes("://") ? null : oldSpreadsheetUrl.replace(/^\/+/, ""));
      if (key) {
        oldSpreadsheetKey = key;
      }
    }

    if (isVerified) {
      // Post-verification: Keep old files, mark as inactive, add new files as active
      const updates: Promise<any>[] = [];

      // Mark old menu images as inactive
      if (oldImageKeys.length > 0) {
        for (const key of oldImageKeys) {
          const existing = existingMedia?.find((m) => m.r2_key === key && m.source_entity === "ONBOARDING_MENU_IMAGE");
          if (existing) {
            updates.push(
              Promise.resolve(
                db
                  .from("merchant_store_media_files")
                  .update({ is_active: false, updated_at: new Date().toISOString() })
                  .eq("id", existing.id)
              ) as Promise<any>
            );
          }
        }
      }

      // Mark old spreadsheet as inactive
      if (oldSpreadsheetUrl) {
        const key = extractR2KeyFromUrl(oldSpreadsheetUrl) || (oldSpreadsheetUrl.includes("://") ? null : oldSpreadsheetUrl.replace(/^\/+/, ""));
        if (key) {
          const existing = existingMedia?.find((m) => m.r2_key === key && m.source_entity === "ONBOARDING_MENU_SHEET");
          if (existing) {
            updates.push(
              Promise.resolve(
                db
                  .from("merchant_store_media_files")
                  .update({ is_active: false, updated_at: new Date().toISOString() })
                  .eq("id", existing.id)
              ) as Promise<any>
            );
          }
        }
      }

      // Add new files as active
      const newMediaRows: any[] = [];
      if (menuUploadMode === "IMAGE" && newImageUrls && Array.isArray(newImageUrls)) {
        for (const url of newImageUrls) {
          const key = extractR2KeyFromUrl(url) || (url.includes("://") ? null : url.replace(/^\/+/, ""));
          if (key) {
            const publicUrl = toStoredDocumentUrl(key) ?? url;
            newMediaRows.push({
              store_id: storeDbId,
              media_scope: "MENU_REFERENCE",
              source_entity: "ONBOARDING_MENU_IMAGE",
              source_entity_id: null,
              original_file_name: `menu_image_${Date.now()}`,
              r2_key: key,
              public_url: publicUrl,
              mime_type: "image/*",
              is_active: true,
              verification_status: "PENDING",
              uploaded_by: user.id,
            });
          }
        }
      } else if (menuUploadMode === "CSV" && newSpreadsheetUrl) {
        const key = extractR2KeyFromUrl(newSpreadsheetUrl) || (newSpreadsheetUrl.includes("://") ? null : newSpreadsheetUrl.replace(/^\/+/, ""));
        if (key) {
          const publicUrl = toStoredDocumentUrl(key) ?? newSpreadsheetUrl;
          newMediaRows.push({
            store_id: storeDbId,
            media_scope: "MENU_REFERENCE",
            source_entity: "ONBOARDING_MENU_SHEET",
            source_entity_id: null,
            original_file_name: "menu_spreadsheet",
            r2_key: key,
            public_url: publicUrl,
            mime_type: "application/octet-stream",
            is_active: true,
            verification_status: "PENDING",
            uploaded_by: user.id,
          });
        }
      }

      if (newMediaRows.length > 0) {
        updates.push(Promise.resolve(db.from("merchant_store_media_files").insert(newMediaRows)) as Promise<any>);
        const isImage = menuUploadMode === "IMAGE";
        updates.push(
          Promise.resolve(
            db.from("merchant_store_activity_log").insert({
              store_id: storeDbId,
              activity_type: "MENU_FILE_UPLOADED",
              activity_reason: isImage ? "Menu image uploaded; pending verification." : "Menu CSV uploaded; pending verification.",
              activity_reason_code: isImage ? "MENU_IMAGE_UPLOAD" : "MENU_CSV_UPLOAD",
              actioned_by: "MERCHANT",
              actioned_by_id: null,
              actioned_by_name: user.email?.split("@")[0] ?? "Merchant",
              actioned_by_email: user.email ?? null,
            })
          ) as Promise<any>
        );
      }

      await Promise.all(updates);
    } else {
      // During onboarding: Delete old files from R2 and database, add new files
      const deletePromises: Promise<any>[] = [];

      // Delete old images from R2
      for (const key of oldImageKeys) {
        try {
          await deleteFromR2(key);
        } catch (e) {
          console.warn("[menu/replace-files] R2 delete failed for key:", key, e);
        }
      }

      // Delete old spreadsheet from R2
      if (oldSpreadsheetUrl) {
        const key = extractR2KeyFromUrl(oldSpreadsheetUrl) || (oldSpreadsheetUrl.includes("://") ? null : oldSpreadsheetUrl.replace(/^\/+/, ""));
        if (key) {
          try {
            await deleteFromR2(key);
          } catch (e) {
            console.warn("[menu/replace-files] R2 delete failed for spreadsheet key:", key, e);
          }
        }
      }

      // Delete old records from database
      deletePromises.push(
        Promise.resolve(
          db
            .from("merchant_store_media_files")
            .delete()
            .eq("store_id", storeDbId)
            .eq("media_scope", "MENU_REFERENCE")
        ) as Promise<any>
      );

      await Promise.all(deletePromises);

      // Add new files with proxy URL (no expiry)
      const newMediaRows: any[] = [];
      if (menuUploadMode === "IMAGE" && newImageUrls && Array.isArray(newImageUrls)) {
        for (const url of newImageUrls) {
          const key = extractR2KeyFromUrl(url) || (url.includes("://") ? null : url.replace(/^\/+/, ""));
          if (key) {
            const publicUrl = toStoredDocumentUrl(key) ?? url;
            newMediaRows.push({
              store_id: storeDbId,
              media_scope: "MENU_REFERENCE",
              source_entity: "ONBOARDING_MENU_IMAGE",
              source_entity_id: null,
              original_file_name: `menu_image_${Date.now()}`,
              r2_key: key,
              public_url: publicUrl,
              mime_type: "image/*",
              is_active: true,
              verification_status: "PENDING",
              uploaded_by: user.id,
            });
          }
        }
      } else if (menuUploadMode === "CSV" && newSpreadsheetUrl) {
        const key = extractR2KeyFromUrl(newSpreadsheetUrl) || (newSpreadsheetUrl.includes("://") ? null : newSpreadsheetUrl.replace(/^\/+/, ""));
        if (key) {
          const publicUrl = toStoredDocumentUrl(key) ?? newSpreadsheetUrl;
          newMediaRows.push({
            store_id: storeDbId,
            media_scope: "MENU_REFERENCE",
            source_entity: "ONBOARDING_MENU_SHEET",
            source_entity_id: null,
            original_file_name: "menu_spreadsheet",
            r2_key: key,
            public_url: publicUrl,
            mime_type: "application/octet-stream",
            is_active: true,
            verification_status: "PENDING",
            uploaded_by: user.id,
          });
        }
      }

      if (newMediaRows.length > 0) {
        await db.from("merchant_store_media_files").insert(newMediaRows);
        const isImage = menuUploadMode === "IMAGE";
        await db.from("merchant_store_activity_log").insert({
          store_id: storeDbId,
          activity_type: "MENU_FILE_UPLOADED",
          activity_reason: isImage ? "Menu image uploaded; pending verification." : "Menu CSV uploaded; pending verification.",
          activity_reason_code: isImage ? "MENU_IMAGE_UPLOAD" : "MENU_CSV_UPLOAD",
          actioned_by: "MERCHANT",
          actioned_by_id: null,
          actioned_by_name: user.email?.split("@")[0] ?? "Merchant",
          actioned_by_email: user.email ?? null,
        });
      }
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("[menu/replace-files] Error:", error);
    return NextResponse.json({ error: error.message || "Failed to replace menu files" }, { status: 500 });
  }
}
