/**
 * GET/POST /api/area-manager/child-store-progress
 * Load or save child store onboarding progress (steps 1–9, form_data).
 * Uses merchant_store_registration_progress; store must belong to the area manager.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAreaManagerApiAuth, requireMerchantManager } from "@/lib/area-manager/auth";
import { getMerchantStoreByIdOnly, getMerchantStoreForProgress, getMerchantStoreStep1Fields, getParentDetailsByParentId } from "@/lib/db/operations/merchant-stores";
import { getChildStoreProgress, upsertChildStoreProgress } from "@/lib/db/operations/child-store-progress";
import { getSql } from "@/lib/db/client";
import { toAttachmentProxyUrl } from "@/lib/r2-proxy-url";

export const runtime = "nodejs";

type MenuImageBundleEntry = {
  id?: string;
  url?: string;
  file_name?: string;
  verification_status?: string;
};

function menuProxyUrl(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  return toAttachmentProxyUrl(value.trim());
}

function parseMenuImageBundle(value: unknown): MenuImageBundleEntry[] {
  if (Array.isArray(value)) return value as MenuImageBundleEntry[];
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? (parsed as MenuImageBundleEntry[]) : [];
    } catch {
      return [];
    }
  }
  return [];
}

export async function GET(req: NextRequest) {
  try {
    const authResult = await requireAreaManagerApiAuth(undefined, req);
    if (authResult.error) return authResult.error;
    const err = requireMerchantManager(authResult.resolved);
    if (err) return err;

    const storeInternalIdParam = req.nextUrl.searchParams.get("storeInternalId");
    const parentIdParam = req.nextUrl.searchParams.get("parentId");
    const storeInternalId = storeInternalIdParam ? parseInt(storeInternalIdParam, 10) : null;
    const parentId = parentIdParam ? parseInt(parentIdParam, 10) : null;

    if (storeInternalId == null || !Number.isFinite(storeInternalId)) {
      return NextResponse.json({ error: "storeInternalId is required" }, { status: 400 });
    }

    const store = await getMerchantStoreByIdOnly(storeInternalId);
    if (!store) {
      return NextResponse.json({ error: "Store not found" }, { status: 404 });
    }
    const effectiveParentId = store.parent_id;

    const progress = await getChildStoreProgress(effectiveParentId, storeInternalId);
    const formData = (progress?.form_data as Record<string, unknown>) ?? {};
    const stepStore = { storeDbId: storeInternalId, storePublicId: store.store_id };
    let formDataWithStepStore: Record<string, unknown> = {
      ...formData,
      step_store: { ...(formData.step_store as object ?? {}), ...stepStore },
    } as Record<string, unknown> & { step1?: Record<string, unknown> };

    // Payment captured → mark step 7 complete in form_data only (do NOT advance to step 8).
    // Agreement step stays locked until merchant_store_agreement_acceptances is signed.
    let effectiveCurrentStep = progress?.current_step ?? 1;
    let paymentCaptured = false;
    let agreementSigned = false;
    if (effectiveParentId != null) {
      try {
        const sql = getSql();
        const paymentRows = await sql`
          SELECT id
          FROM merchant_onboarding_payments
          WHERE merchant_parent_id = ${effectiveParentId}
            AND merchant_store_id = ${storeInternalId}
            AND status = 'captured'
          ORDER BY created_at DESC
          LIMIT 1
        `;
        const paymentRow = Array.isArray(paymentRows) ? paymentRows[0] : paymentRows;
        paymentCaptured = Boolean(paymentRow);
        if (paymentCaptured) {
          const step7Patch = {
            step7: {
              ...((formDataWithStepStore.step7 as Record<string, unknown> | undefined) ?? {}),
              paymentCaptured: true,
            },
          };
          // Stay on step 7 after payment — do not unlock agreement (step 8) yet.
          const nextStep = effectiveCurrentStep >= 9 ? effectiveCurrentStep : 7;
          await upsertChildStoreProgress({
            parentId: effectiveParentId,
            storeInternalId,
            currentStep: nextStep,
            formDataPatch: step7Patch,
          });
          formDataWithStepStore = { ...formDataWithStepStore, ...step7Patch };
          effectiveCurrentStep = nextStep;
        }
      } catch {
        // If payment table is unavailable, ignore and fall back to existing progress.
      }

      // Repair: payment-only bump to step 8 without agreement — roll back to step 7.
      if (paymentCaptured && !agreementSigned && effectiveCurrentStep === 8) {
        try {
          const sql = getSql();
          const agreementProbe = await sql`
            SELECT id
            FROM merchant_store_agreement_acceptances
            WHERE store_id = ${storeInternalId}
              AND terms_accepted = true
              AND contract_read_confirmed = true
              AND digital_signature_confirmed = true
            LIMIT 1
          `;
          const hasAgreement = Boolean(
            Array.isArray(agreementProbe) ? agreementProbe[0] : agreementProbe
          );
          if (!hasAgreement) {
            await upsertChildStoreProgress({
              parentId: effectiveParentId,
              storeInternalId,
              currentStep: 7,
              formDataPatch: null,
            });
            effectiveCurrentStep = 7;
          }
        } catch {
          /* ignore */
        }
      }

      // Step 8 → 9: agreement accepted & digitally signed on Partner Site
      if (effectiveCurrentStep < 9) {
        try {
          const sql = getSql();
          const rows = await sql`
            SELECT id
            FROM merchant_store_agreement_acceptances
            WHERE store_id = ${storeInternalId}
              AND terms_accepted = true
              AND contract_read_confirmed = true
              AND digital_signature_confirmed = true
            ORDER BY accepted_at DESC
            LIMIT 1
          `;
          const row = Array.isArray(rows) ? rows[0] : rows;
          if (row) {
            agreementSigned = true;
            const bumped = Math.max(effectiveCurrentStep, 9);
            await upsertChildStoreProgress({
              parentId: effectiveParentId,
              storeInternalId,
              currentStep: bumped,
              formDataPatch: null,
            });
            effectiveCurrentStep = bumped;
          }
        } catch {
          // If agreement table is unavailable, ignore and fall back to existing progress.
        }
      }
    }

    const step1FromStore = await getMerchantStoreStep1Fields(storeInternalId);
    if (step1FromStore) {
      const existingStep1 = (formDataWithStepStore.step1 as Record<string, unknown>) ?? {};
      const filled = (v: unknown) => {
        if (v == null) return false;
        if (typeof v === "string") return v.trim() !== "";
        if (Array.isArray(v)) return v.some((x) => String(x ?? "").trim() !== "");
        return true;
      };
      const preferFilled = (dbVal: unknown, progVal: unknown) =>
        filled(dbVal) ? dbVal : filled(progVal) ? progVal : dbVal ?? progVal;
      formDataWithStepStore = {
        ...formDataWithStepStore,
        step1: {
          ...existingStep1,
          store_name: preferFilled(step1FromStore.store_name, existingStep1.store_name),
          owner_full_name: preferFilled(step1FromStore.owner_full_name, existingStep1.owner_full_name),
          store_display_name: preferFilled(step1FromStore.store_display_name, existingStep1.store_display_name),
          store_description: preferFilled(step1FromStore.store_description, existingStep1.store_description),
          store_email: preferFilled(step1FromStore.store_email, existingStep1.store_email),
          store_phones: preferFilled(step1FromStore.store_phones, existingStep1.store_phones),
          store_type: preferFilled(step1FromStore.store_type, existingStep1.store_type),
          custom_store_type: preferFilled(step1FromStore.custom_store_type, existingStep1.custom_store_type),
        },
      };
    }

    // Always hydrate Step 3 menu attachments from DB media table so UI reflects latest data,
    // even if registration_progress step3 is stale or missing.
    try {
      const sql = getSql();
      const mediaRows = await sql`
        SELECT id, source_entity, original_file_name, r2_key, public_url, menu_reference_image_urls, created_at
        FROM merchant_store_media_files
        WHERE store_id = ${storeInternalId}
          AND media_scope = 'MENU_REFERENCE'
          AND is_active = true
          AND deleted_at IS NULL
        ORDER BY created_at DESC
      `;
      const rows = (Array.isArray(mediaRows) ? mediaRows : mediaRows ? [mediaRows] : []) as Array<{
        id: number | string;
        source_entity: string | null;
        original_file_name: string | null;
        r2_key: string | null;
        public_url: string | null;
        menu_reference_image_urls: unknown;
      }>;

      const imageRow =
        rows.find((r) => r.source_entity === "ONBOARDING_MENU_IMAGE") ?? null;
      const pdfRow =
        rows.find((r) => r.source_entity === "ONBOARDING_MENU_PDF") ?? null;
      const sheetRow =
        rows.find((r) => r.source_entity === "ONBOARDING_MENU_SHEET") ?? null;

      const imageBundle = imageRow ? parseMenuImageBundle(imageRow.menu_reference_image_urls) : [];
      const imageUrls = imageBundle
        .map((entry) => menuProxyUrl(entry.url) || "")
        .filter(Boolean);
      const imageNames = imageBundle
        .map((entry) => (typeof entry.file_name === "string" ? entry.file_name : ""))
        .filter(Boolean);
      const pdfProxy = menuProxyUrl(pdfRow?.public_url) || menuProxyUrl(pdfRow?.r2_key);
      const sheetProxy = menuProxyUrl(sheetRow?.public_url) || menuProxyUrl(sheetRow?.r2_key);
      const imageRowId =
        imageRow?.id != null && Number.isFinite(Number(imageRow.id)) ? Number(imageRow.id) : null;

      const step3FromDb: Record<string, unknown> = {
        menuUploadMode: imageUrls.length
          ? "IMAGE"
          : pdfRow
            ? "PDF"
            : sheetRow
              ? "CSV"
              : ((formDataWithStepStore.step3 as Record<string, unknown> | undefined)?.menuUploadMode ?? "IMAGE"),
        menuImageUrls: imageUrls,
        menuImageNames: imageNames,
        menuPdfUrl: pdfProxy,
        menuPdfFileName: pdfRow?.original_file_name ?? null,
        menuPdfR2Key: pdfRow?.r2_key ?? null,
        menuSpreadsheetUrl: sheetProxy,
        menuSpreadsheetName: sheetRow?.original_file_name ?? null,
        menuSpreadsheetR2Key: sheetRow?.r2_key ?? null,
        menuUploadIds: [
          imageRowId,
          pdfRow?.id != null && Number.isFinite(Number(pdfRow.id)) ? Number(pdfRow.id) : null,
          sheetRow?.id != null && Number.isFinite(Number(sheetRow.id)) ? Number(sheetRow.id) : null,
        ].filter((v): v is number => v != null),
      };

      formDataWithStepStore = {
        ...formDataWithStepStore,
        step3: {
          ...((formDataWithStepStore.step3 as Record<string, unknown>) ?? {}),
          ...step3FromDb,
        },
      };
    } catch {
      // Non-fatal: if media query fails, keep existing progress payload.
    }

    // Hydrate Step 5 from merchant_stores + operating_hours (same as Partner Site).
    try {
      const sql = getSql();
      const storeRows = await sql`
        SELECT banner_url, gallery_images, cuisine_types, delivery_radius_km,
               avg_preparation_time_minutes, min_order_amount,
               is_pure_veg, accepts_online_payment, accepts_cash
        FROM merchant_stores
        WHERE id = ${storeInternalId}
        LIMIT 1
      `;
      const storeRow = (Array.isArray(storeRows) ? storeRows[0] : storeRows) as
        | Record<string, unknown>
        | undefined;
      const hoursRows = await sql`
        SELECT *
        FROM merchant_store_operating_hours
        WHERE store_id = ${storeInternalId}
        LIMIT 1
      `;
      const hoursRow = (Array.isArray(hoursRows) ? hoursRows[0] : hoursRows) as
        | Record<string, unknown>
        | undefined;

      const existingStep5 =
        (formDataWithStepStore.step5 as Record<string, unknown> | undefined) ?? {};

      const toProxy = (raw: unknown): string => {
        if (typeof raw !== "string" || !raw.trim()) return "";
        const t = raw.trim();
        if (t.startsWith("/api/attachments/proxy") || t.startsWith("/v1/attachments/proxy")) {
          return t.replace("/v1/attachments/proxy", "/api/attachments/proxy");
        }
        if (t.startsWith("http://") || t.startsWith("https://")) {
          try {
            const u = new URL(t);
            if (u.pathname.includes("attachments/proxy")) {
              const key = u.searchParams.get("key");
              if (key) return `/api/attachments/proxy?key=${encodeURIComponent(key)}`;
            }
          } catch {
            /* ignore */
          }
          return "";
        }
        return `/api/attachments/proxy?key=${encodeURIComponent(t.replace(/^\/+/, ""))}`;
      };

      const bannerUrl = storeRow?.banner_url ? toProxy(storeRow.banner_url) : "";
      const galleryRaw = Array.isArray(storeRow?.gallery_images)
        ? (storeRow!.gallery_images as unknown[])
        : [];
      const galleryUrls = galleryRaw
        .map((u) => toProxy(u))
        .filter((u) => !!u)
        .slice(0, 5);
      const cuisineFromDb = Array.isArray(storeRow?.cuisine_types)
        ? (storeRow!.cuisine_types as unknown[]).filter(
            (c): c is string => typeof c === "string" && c.trim().length > 0,
          )
        : [];
      const cuisineFromPrev = Array.isArray(existingStep5.cuisine_types)
        ? (existingStep5.cuisine_types as unknown[]).filter(
            (c): c is string => typeof c === "string" && c.trim().length > 0,
          )
        : [];

      let storeHours = existingStep5.store_hours;
      if (hoursRow) {
        const days = [
          "monday",
          "tuesday",
          "wednesday",
          "thursday",
          "friday",
          "saturday",
          "sunday",
        ] as const;
        const nextHours: Record<string, unknown> = {};
        for (const day of days) {
          const open = !!(hoursRow as any)[`${day}_open`];
          const toStr = (v: unknown) =>
            typeof v === "string" ? v.slice(0, 5) : v != null ? String(v).slice(0, 5) : "";
          nextHours[day] = {
            closed: !open,
            slot1_open: open ? toStr((hoursRow as any)[`${day}_slot1_start`]) : "",
            slot1_close: open ? toStr((hoursRow as any)[`${day}_slot1_end`]) : "",
            slot2_open: open ? toStr((hoursRow as any)[`${day}_slot2_start`]) : "",
            slot2_close: open ? toStr((hoursRow as any)[`${day}_slot2_end`]) : "",
          };
        }
        storeHours = nextHours;
      } else if (storeHours && typeof storeHours === "object") {
        // Progress may only have monday (partial patch) — fill remaining days like partnersite.
        const days = [
          "monday",
          "tuesday",
          "wednesday",
          "thursday",
          "friday",
          "saturday",
          "sunday",
        ] as const;
        const defaults: Record<string, { closed: boolean; slot1_open: string; slot1_close: string; slot2_open: string; slot2_close: string }> = {
          monday: { closed: false, slot1_open: "09:00", slot1_close: "22:00", slot2_open: "", slot2_close: "" },
          tuesday: { closed: false, slot1_open: "09:00", slot1_close: "22:00", slot2_open: "", slot2_close: "" },
          wednesday: { closed: false, slot1_open: "09:00", slot1_close: "22:00", slot2_open: "", slot2_close: "" },
          thursday: { closed: false, slot1_open: "09:00", slot1_close: "22:00", slot2_open: "", slot2_close: "" },
          friday: { closed: false, slot1_open: "09:00", slot1_close: "22:00", slot2_open: "", slot2_close: "" },
          saturday: { closed: false, slot1_open: "10:00", slot1_close: "23:00", slot2_open: "", slot2_close: "" },
          sunday: { closed: false, slot1_open: "10:00", slot1_close: "22:00", slot2_open: "", slot2_close: "" },
        };
        const src = storeHours as Record<string, any>;
        const nextHours: Record<string, unknown> = {};
        for (const day of days) {
          const d = src[day] && typeof src[day] === "object" ? src[day] : {};
          const fb = defaults[day];
          nextHours[day] = {
            closed: typeof d.closed === "boolean" ? d.closed : fb.closed,
            slot1_open: typeof d.slot1_open === "string" && d.slot1_open ? d.slot1_open : fb.slot1_open,
            slot1_close: typeof d.slot1_close === "string" && d.slot1_close ? d.slot1_close : fb.slot1_close,
            slot2_open: typeof d.slot2_open === "string" ? d.slot2_open : "",
            slot2_close: typeof d.slot2_close === "string" ? d.slot2_close : "",
          };
        }
        storeHours = nextHours;
      }

      if (storeRow || hoursRow) {
        formDataWithStepStore = {
          ...formDataWithStepStore,
          step5: {
            ...existingStep5,
            cuisine_types: cuisineFromDb.length > 0 ? cuisineFromDb : cuisineFromPrev,
            delivery_radius_km:
              typeof existingStep5.delivery_radius_km === "number"
                ? existingStep5.delivery_radius_km
                : typeof storeRow?.delivery_radius_km === "number"
                  ? storeRow.delivery_radius_km
                  : 8,
            avg_preparation_time_minutes:
              typeof storeRow?.avg_preparation_time_minutes === "number"
                ? storeRow.avg_preparation_time_minutes
                : existingStep5.avg_preparation_time_minutes,
            min_order_amount:
              typeof storeRow?.min_order_amount === "number"
                ? storeRow.min_order_amount
                : existingStep5.min_order_amount,
            is_pure_veg:
              typeof storeRow?.is_pure_veg === "boolean"
                ? storeRow.is_pure_veg
                : existingStep5.is_pure_veg,
            accepts_online_payment:
              typeof storeRow?.accepts_online_payment === "boolean"
                ? storeRow.accepts_online_payment
                : existingStep5.accepts_online_payment,
            accepts_cash:
              typeof existingStep5.accepts_cash === "boolean"
                ? existingStep5.accepts_cash
                : false,
            banner_url: bannerUrl || existingStep5.banner_url || "",
            banner_preview: bannerUrl || existingStep5.banner_preview || "",
            gallery_image_urls:
              galleryUrls.length > 0 ? galleryUrls : existingStep5.gallery_image_urls || [],
            gallery_previews:
              galleryUrls.length > 0 ? galleryUrls : existingStep5.gallery_previews || [],
            store_hours: storeHours,
          },
        };
      }
    } catch {
      // Non-fatal
    }

    let parent_name: string | null = null;
    let parent_merchant_id: string | null = null;
    if (effectiveParentId != null) {
      const parentDetails = await getParentDetailsByParentId(effectiveParentId);
      parent_name = parentDetails.parent_name;
      parent_merchant_id = parentDetails.parent_merchant_id;
    }

    const res = NextResponse.json({
      success: true,
      parent_id: effectiveParentId,
      parent_name: parent_name ?? undefined,
      parent_merchant_id: parent_merchant_id ?? undefined,
      progress: {
        current_step: effectiveCurrentStep,
        payment_captured: paymentCaptured,
        agreement_signed: agreementSigned,
        form_data: formDataWithStepStore,
      },
    });
    // Ensure AM always sees latest data (including edits from Partner Site); no cache
    res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
    return res;
  } catch (e) {
    console.error("[GET /api/area-manager/child-store-progress]", e);
    return NextResponse.json({ error: "Failed to load progress" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const authResult = await requireAreaManagerApiAuth(undefined, req);
    if (authResult.error) return authResult.error;
    const err = requireMerchantManager(authResult.resolved);
    if (err) return err;

    const body = await req.json().catch(() => ({}));
    const storeInternalId = body.storeInternalId != null ? Number(body.storeInternalId) : null;
    const parentId = body.parentId != null ? Number(body.parentId) : null;
    const currentStep = body.currentStep != null ? Math.min(Math.max(Number(body.currentStep), 1), 9) : 1;
    let formDataPatch = body.formDataPatch != null && typeof body.formDataPatch === "object" ? body.formDataPatch : undefined;

    if (storeInternalId == null || !Number.isFinite(storeInternalId)) {
      return NextResponse.json({ error: "storeInternalId is required" }, { status: 400 });
    }

    const areaManagerId = authResult.resolved.isSuperAdmin ? null : authResult.resolved.areaManager?.id ?? null;
    // Relax store lookup to only use internal ID; AM access is already enforced above.
    // This avoids false 404s when parentId in URL/body does not exactly match filters used by getMerchantStoreForProgress.
    const store = await getMerchantStoreByIdOnly(storeInternalId);
    if (!store) {
      return NextResponse.json({ error: "Store not found or access denied" }, { status: 404 });
    }
    const effectiveParentId = store.parent_id;

    const stepStore = { storeDbId: storeInternalId, storePublicId: store.store_id };
    formDataPatch = { ...(formDataPatch ?? {}), step_store: { ...((formDataPatch?.step_store as object) ?? {}), ...stepStore } };

    const result = await upsertChildStoreProgress({
      parentId: effectiveParentId,
      storeInternalId,
      currentStep,
      formDataPatch: formDataPatch ?? null,
    });

    return NextResponse.json({ success: true, current_step: result.current_step });
  } catch (e) {
    console.error("[POST /api/area-manager/child-store-progress]", e);
    return NextResponse.json({ error: "Failed to save progress" }, { status: 500 });
  }
}
