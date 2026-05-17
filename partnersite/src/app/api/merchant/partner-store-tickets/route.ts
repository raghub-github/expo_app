import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { validateMerchantFromSession } from "@/lib/auth/validate-merchant";
import { assertStoreAccess } from "@/lib/auth/assert-store-access";
import {
  mapMerchantSectionCode,
  normalizeUnifiedCategory,
  normalizeUnifiedPriority,
  normalizeUnifiedServiceType,
  resolveTicketTitleForInsert,
} from "@/lib/merchant-partner-ticket-intake";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function getSupabaseAdmin() {
  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function isMerchantSection(raw: unknown): boolean {
  return String(raw ?? "")
    .trim()
    .toLowerCase() === "merchant";
}

type TitleRow = Record<string, unknown>;

/**
 * POST /api/merchant/partner-store-tickets
 * Same intake as mobile POST /v1/merchant-partner/stores/:numericId/tickets (section + ticket_title_id).
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const storeIdParam = typeof body.store_id === "string" ? body.store_id.trim() : "";
    const ticketTitleIdRaw = body.ticket_title_id;
    const ticketTitleId =
      typeof ticketTitleIdRaw === "number" && Number.isInteger(ticketTitleIdRaw) && ticketTitleIdRaw > 0
        ? ticketTitleIdRaw
        : typeof ticketTitleIdRaw === "string" && /^\d+$/.test(ticketTitleIdRaw.trim())
          ? Number(ticketTitleIdRaw.trim())
          : NaN;
    const subjectIn = typeof body.subject === "string" ? body.subject.trim() : "";
    const descriptionIn = typeof body.description === "string" ? body.description.trim() : "";
    const attachmentsRaw = body.attachments;
    const formattedOrderIdIn =
      typeof body.formatted_order_id === "string" ? body.formatted_order_id.trim() : "";
    const coreOrderIdRaw = body.core_order_id;
    const coreOrderId =
      typeof coreOrderIdRaw === "number" && Number.isInteger(coreOrderIdRaw) && coreOrderIdRaw > 0
        ? coreOrderIdRaw
        : typeof coreOrderIdRaw === "string" && /^\d+$/.test(coreOrderIdRaw.trim())
          ? Number(coreOrderIdRaw.trim())
          : NaN;

    if (!storeIdParam || !Number.isInteger(ticketTitleId) || ticketTitleId < 1) {
      return NextResponse.json(
        { ok: false, error: "store_id and ticket_title_id are required." },
        { status: 400 }
      );
    }
    if (!descriptionIn) {
      return NextResponse.json({ ok: false, error: "description is required." }, { status: 400 });
    }

    const gate = await assertStoreAccess(storeIdParam);
    if (!gate.ok) {
      return NextResponse.json({ ok: false, error: gate.error }, { status: gate.status });
    }
    const storeIdNum = gate.storeIdNum;

    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ ok: false, error: "Please log in." }, { status: 401 });
    }

    const validation = await validateMerchantFromSession({
      id: user.id,
      email: user.email ?? null,
      phone: user.phone ?? null,
    });
    if (!validation.isValid || validation.merchantParentId == null) {
      return NextResponse.json({ ok: false, error: validation.error ?? "Merchant not found." }, { status: 403 });
    }
    const parentId = validation.merchantParentId;

    const db = getSupabaseAdmin();

    const { data: storeCheck } = await db
      .from("merchant_stores")
      .select("id, parent_id")
      .eq("id", storeIdNum)
      .single();
    if (!storeCheck || storeCheck.parent_id !== parentId) {
      return NextResponse.json({ ok: false, error: "Store not found." }, { status: 404 });
    }

    const { data: tt, error: ttErr } = await db.from("ticket_titles").select("*").eq("id", ticketTitleId).maybeSingle();

    if (ttErr || !tt) {
      return NextResponse.json({ ok: false, error: "Invalid help topic." }, { status: 400 });
    }
    const titleRow = tt as TitleRow;
    if (titleRow.is_active !== true) {
      return NextResponse.json({ ok: false, error: "Invalid help topic." }, { status: 400 });
    }
    if (!isMerchantSection(titleRow.ticket_section)) {
      return NextResponse.json({ ok: false, error: "Invalid help topic." }, { status: 400 });
    }
    const sectionCode = String(titleRow.merchant_section_id ?? "")
      .trim()
      .toLowerCase();
    if (!sectionCode) {
      return NextResponse.json({ ok: false, error: "Invalid help topic." }, { status: 400 });
    }

    const { data: tagLinks, error: tagLinkErr } = await db
      .from("ticket_title_tags")
      .select("tag_id")
      .eq("ticket_title_id", ticketTitleId);
    if (tagLinkErr) {
      console.warn("[partner-store-tickets] ticket_title_tags:", tagLinkErr.message);
    }
    const tagIds = (tagLinks ?? [])
      .map((r: { tag_id?: number | null }) => r.tag_id)
      .filter((id): id is number => typeof id === "number" && id > 0);
    let tagList: string[] = [];
    if (tagIds.length > 0) {
      const { data: tagCodes } = await db.from("ticket_tags").select("tag_code").in("id", tagIds);
      tagList = [
        ...new Set(
          (tagCodes ?? [])
            .map((r: { tag_code?: string | null }) => String(r.tag_code ?? "").trim().toUpperCase())
            .filter(Boolean)
        ),
      ];
    }

    const mapped = mapMerchantSectionCode(sectionCode);
    const rawIntakeTitle = String(titleRow.intake_unified_title ?? "").trim();
    const ticketTitleRaw = rawIntakeTitle || mapped.title;
    const ticketTitleForInsert = resolveTicketTitleForInsert(ticketTitleRaw);
    const ticketCategory = normalizeUnifiedCategory(
      String(titleRow.intake_unified_category || mapped.category)
    );
    const priority = normalizeUnifiedPriority(String(titleRow.intake_unified_priority || mapped.priority));
    const serviceType = normalizeUnifiedServiceType(String(titleRow.intake_unified_service_type || "GENERAL"));

    const titleForSubjectFallback = ticketTitleRaw;
    const subject =
      subjectIn ||
      (titleRow.title_text != null && String(titleRow.title_text).trim()
        ? String(titleRow.title_text).trim()
        : titleForSubjectFallback
            .toLowerCase()
            .split("_")
            .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
            .join(" "));

    const groupId =
      titleRow.group_id != null && Number.isFinite(Number(titleRow.group_id))
        ? Number(titleRow.group_id)
        : null;

    const metadataPayload: Record<string, unknown> = {
      merchant_help: {
        section_code: sectionCode || null,
        ticket_title_id: ticketTitleId,
        ticket_title_row_code: ticketTitleRaw,
        ...(formattedOrderIdIn ? { formatted_order_id: formattedOrderIdIn } : {}),
        ...(Number.isFinite(coreOrderId) ? { core_order_id: coreOrderId } : {}),
      },
    };

    const ticketType =
      Number.isFinite(coreOrderId) || formattedOrderIdIn ? "ORDER_RELATED" : "NON_ORDER_RELATED";
    let resolvedCoreOrderId: number | null = Number.isFinite(coreOrderId) ? coreOrderId : null;
    if (resolvedCoreOrderId == null && formattedOrderIdIn) {
      const { data: coreByFmt } = await db
        .from("orders_core")
        .select("id")
        .eq("formatted_order_id", formattedOrderIdIn)
        .eq("merchant_store_id", storeIdNum)
        .maybeSingle();
      if (coreByFmt?.id != null) resolvedCoreOrderId = Number(coreByFmt.id);
    }

    const attachmentUrls =
      Array.isArray(attachmentsRaw) && attachmentsRaw.length > 0
        ? attachmentsRaw.filter((u: unknown) => typeof u === "string" && u.trim()).slice(0, 20)
        : [];

    const { data: parentRow } = await db
      .from("merchant_parents")
      .select("owner_name, parent_name")
      .eq("id", parentId)
      .maybeSingle();
    const raisedName =
      [parentRow?.owner_name, parentRow?.parent_name, user.email, user.phone]
        .map((x) => (typeof x === "string" ? x.trim() : ""))
        .find(Boolean) || null;

    const insertRow: Record<string, unknown> = {
      ticket_id: "",
      ticket_type: ticketType,
      ticket_source: "MERCHANT",
      service_type: serviceType,
      ticket_title: ticketTitleForInsert,
      ticket_category: ticketCategory,
      order_id: ticketType === "ORDER_RELATED" ? resolvedCoreOrderId : null,
      order_type: ticketType === "ORDER_RELATED" ? "food" : null,
      customer_id: null,
      rider_id: null,
      merchant_store_id: storeIdNum,
      merchant_parent_id: parentId,
      raised_by_type: "MERCHANT",
      raised_by_id: storeIdNum,
      raised_by_name: raisedName,
      raised_by_email: user.email ?? null,
      raised_by_mobile: user.phone ?? null,
      subject: subject.slice(0, 500),
      description: descriptionIn.slice(0, 5000),
      priority,
      status: "OPEN",
      auto_generated: false,
      group_id: groupId,
      tags: tagList.length > 0 ? tagList : null,
      metadata: metadataPayload,
      buyer_np_name: "GatiMitra",
    };
    if (attachmentUrls.length > 0) {
      insertRow.attachments = attachmentUrls;
    }

    let ticketIns = await db
      .from("unified_tickets")
      .insert(insertRow)
      .select("id, ticket_id, status, priority, subject, description, created_at")
      .single();

    if (ticketIns.error && String(ticketIns.error.message || "").toLowerCase().includes("buyer_np")) {
      const { buyer_np_name: _omit, ...rest } = insertRow;
      void _omit;
      ticketIns = await db
        .from("unified_tickets")
        .insert(rest)
        .select("id, ticket_id, status, priority, subject, description, created_at")
        .single();
    }

    if (ticketIns.error || !ticketIns.data) {
      console.error("[partner-store-tickets] insert:", ticketIns.error);
      return NextResponse.json(
        { ok: false, error: ticketIns.error?.message || "Failed to create ticket." },
        { status: 500 }
      );
    }

    const created = ticketIns.data as {
      id: number;
      ticket_id: string;
      status: string;
      priority: string;
      subject?: string | null;
      description?: string | null;
      created_at: string;
    };

    /** First touch stays on `unified_tickets` only (subject/description). Chat rows go to `unified_ticket_messages` when the merchant sends a follow-up via /api/merchant/tickets/reply. */

    return NextResponse.json({
      ok: true,
      ticket: {
        id: created.id,
        ticket_id: created.ticket_id,
        status: created.status,
        priority: created.priority,
        subject: created.subject ?? null,
        description: created.description ?? null,
        created_at: created.created_at,
      },
    });
  } catch (e) {
    console.error("[partner-store-tickets]", e);
    return NextResponse.json({ ok: false, error: "Internal error." }, { status: 500 });
  }
}
