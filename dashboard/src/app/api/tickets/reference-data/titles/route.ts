/**
 * GET /api/tickets/reference-data/titles — List ticket_titles (super-admin)
 * POST — Create a title row (merchant help / intake fields when migration applied)
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getSystemUserByEmail } from "@/lib/db/operations/users";
import { isSuperAdmin } from "@/lib/permissions/engine";
import { getSql } from "@/lib/db/client";
import { isInvalidRefreshToken, signOutIfSessionDead } from "@/lib/auth/session-errors";
import { mapTitleTagsFromRow, replaceTicketTitleTags } from "@/lib/tickets/title-tag-map";

export const runtime = "nodejs";

async function requireSuperAdmin() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError) {
    if (isInvalidRefreshToken(userError)) {
      await signOutIfSessionDead(supabase, userError);
      return NextResponse.json({ success: false, error: "Session invalid", code: "SESSION_INVALID" }, { status: 401 });
    }
    return NextResponse.json({ success: false, error: "Not authenticated" }, { status: 401 });
  }
  if (!user) {
    return NextResponse.json({ success: false, error: "Not authenticated" }, { status: 401 });
  }
  const systemUser = await getSystemUserByEmail(user.email!);
  if (!systemUser) {
    return NextResponse.json({ success: false, error: "User not found" }, { status: 404 });
  }
  const ok = await isSuperAdmin(user.id, user.email!);
  if (!ok) {
    return NextResponse.json({ success: false, error: "Super admin only" }, { status: 403 });
  }
  return null;
}

type SqlClient = { unsafe: (q: string, v?: unknown[]) => Promise<Record<string, unknown>[]> };

function mapTitleRow(r: Record<string, unknown>) {
  const opts = r.default_quick_options;
  let defaultQuickOptions: string[] | null = null;
  if (Array.isArray(opts)) {
    defaultQuickOptions = opts.map((x) => String(x)).filter(Boolean);
  }
  const { tags, tagIds } = mapTitleTagsFromRow(r);
  const primary = tags[0];
  return {
    id: Number(r.id),
    groupId: r.group_id != null ? Number(r.group_id) : null,
    groupCode: r.group_code ?? null,
    groupName: r.group_name ?? null,
    serviceType: r.service_type ?? "",
    ticketSection: r.ticket_section ?? "",
    sourceRole: r.source_role ?? "",
    titleCode: r.title_code ?? "",
    titleText: r.title_text ?? "",
    description: r.description ?? null,
    displayOrder: r.display_order != null ? Number(r.display_order) : null,
    isActive: Boolean(r.is_active),
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    subtext: r.subtext != null ? String(r.subtext) : null,
    defaultQuickOptions,
    tagIds,
    tags,
    tagId: primary?.id ?? (r.tag_id != null ? Number(r.tag_id) : null),
    tagCode: primary?.tagCode ?? (r.resolved_tag_code != null ? String(r.resolved_tag_code) : r.tag_code != null ? String(r.tag_code) : null),
    tagName: primary?.tagName ?? (r.resolved_tag_name != null ? String(r.resolved_tag_name) : r.tag_name != null ? String(r.tag_name) : null),
    priorityId: r.priority_id != null ? Number(r.priority_id) : null,
    priorityCode: r.resolved_priority_code != null ? String(r.resolved_priority_code) : null,
    priorityDisplayName: r.resolved_priority_display_name != null ? String(r.resolved_priority_display_name) : null,
    merchantSectionId: r.merchant_section_id != null ? String(r.merchant_section_id) : null,
    customerSectionId: r.customer_section_id != null ? String(r.customer_section_id) : null,
    applicableOrderStatuses: Array.isArray(r.applicable_order_statuses)
      ? (r.applicable_order_statuses as string[]).map((s) => String(s))
      : null,
    intakeTicketType: r.intake_ticket_type != null ? String(r.intake_ticket_type) : null,
    intakeUnifiedTitle: r.intake_unified_title != null ? String(r.intake_unified_title) : null,
    intakeUnifiedCategory: r.intake_unified_category != null ? String(r.intake_unified_category) : null,
    intakeUnifiedPriority: r.intake_unified_priority != null ? String(r.intake_unified_priority) : null,
    intakeUnifiedServiceType: r.intake_unified_service_type != null ? String(r.intake_unified_service_type) : null,
    parentTitleId: r.parent_title_id != null ? Number(r.parent_title_id) : null,
    metadata:
      r.metadata != null && typeof r.metadata === "object" && !Array.isArray(r.metadata)
        ? (r.metadata as Record<string, unknown>)
        : {},
    merchantHelpIconName: r.merchant_help_icon_name != null ? String(r.merchant_help_icon_name) : null,
  };
}

const ORDER_BY = `ORDER BY tt.group_id NULLS LAST, tt.display_order ASC NULLS LAST, tt.title_text ASC`;

async function fetchTitlesExtended(sqlClient: SqlClient) {
  const rows = await sqlClient.unsafe(`
      SELECT
        tt.id,
        tt.group_id,
        tt.service_type::text AS service_type,
        tt.ticket_section::text AS ticket_section,
        tt.source_role::text AS source_role,
        tt.title_code,
        tt.title_text,
        tt.description,
        tt.display_order,
        tt.is_active,
        tt.created_at,
        tt.updated_at,
        tt.subtext,
        tt.default_quick_options,
        tt.tag_id,
        tt.priority_id,
        tt.merchant_section_id,
        tt.customer_section_id,
        tt.applicable_order_statuses,
        tt.intake_ticket_type,
        tt.intake_unified_title,
        tt.intake_unified_category,
        tt.intake_unified_priority,
        tt.intake_unified_service_type,
        tt.parent_title_id,
        tt.metadata,
        tt.merchant_help_icon_name,
        tg.group_code,
        tg.group_name,
        ttags.tag_code AS resolved_tag_code,
        ttags.tag_name AS resolved_tag_name,
        tp.priority_code AS resolved_priority_code,
        tp.priority_name AS resolved_priority_display_name,
        (
          SELECT json_agg(
            json_build_object(
              'id', xg.id,
              'tagCode', xg.tag_code,
              'tagName', xg.tag_name
            ) ORDER BY xg.id
          )
          FROM ticket_title_tags ttm
          INNER JOIN ticket_tags xg ON xg.id = ttm.tag_id
          WHERE ttm.ticket_title_id = tt.id
        ) AS title_tags_json
      FROM ticket_titles tt
      LEFT JOIN ticket_groups tg ON tg.id = tt.group_id
      LEFT JOIN ticket_tags ttags ON ttags.id = tt.tag_id
      LEFT JOIN ticket_priorities tp ON tp.id = tt.priority_id
      ${ORDER_BY}
    `);
  return rows || [];
}

async function fetchTitlesBasic(sqlClient: SqlClient) {
  const rows = await sqlClient.unsafe(`
      SELECT
        tt.id,
        tt.group_id,
        tt.service_type::text AS service_type,
        tt.ticket_section::text AS ticket_section,
        tt.source_role::text AS source_role,
        tt.title_code,
        tt.title_text,
        tt.description,
        tt.display_order,
        tt.is_active,
        tt.created_at,
        tt.updated_at,
        tg.group_code,
        tg.group_name
      FROM ticket_titles tt
      LEFT JOIN ticket_groups tg ON tg.id = tt.group_id
      ${ORDER_BY}
    `);
  return rows || [];
}

function slugTitleCode(raw: string): string {
  const s = String(raw)
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
  return s || "TITLE";
}

async function ensureUniqueTitleCode(sqlClient: SqlClient, base: string): Promise<string> {
  let code = base;
  let n = 0;
  while (n < 500) {
    const existing = await sqlClient.unsafe(`SELECT 1 FROM ticket_titles WHERE title_code = $1 LIMIT 1`, [code]);
    if (!existing?.length) return code;
    n += 1;
    code = `${base}_${n}`;
  }
  return `${base}_${Math.random().toString(36).slice(2, 10).toUpperCase()}`;
}

function parseQuickOptions(v: unknown): string[] | null {
  if (v == null) return null;
  if (Array.isArray(v)) return v.map((x) => String(x).trim()).filter(Boolean);
  if (typeof v === "string") return v.split(",").map((s) => s.trim()).filter(Boolean);
  return null;
}

/** JSON string for jsonb column; default empty object when omitted. */
function parseMetadataForInsert(v: unknown): string {
  if (v === undefined) return "{}";
  if (v == null) return "{}";
  if (typeof v === "string") {
    const t = v.trim();
    return t === "" ? "{}" : t;
  }
  return JSON.stringify(v);
}

export async function GET() {
  const err = await requireSuperAdmin();
  if (err) return err;
  try {
    const sql = getSql();
    const sqlClient = sql as SqlClient;
    let rows: Record<string, unknown>[];
    try {
      rows = await fetchTitlesExtended(sqlClient);
    } catch {
      rows = await fetchTitlesBasic(sqlClient);
    }
    const titles = rows.map(mapTitleRow);
    return NextResponse.json({ success: true, data: { titles } });
  } catch (e) {
    console.error("[GET /api/tickets/reference-data/titles]", e);
    return NextResponse.json({ success: false, error: String(e) }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const err = await requireSuperAdmin();
  if (err) return err;
  try {
    const body = await request.json();
    const titleText = String(body.titleText ?? body.title_text ?? "").trim();
    if (!titleText) {
      return NextResponse.json({ success: false, error: "titleText is required" }, { status: 400 });
    }
    const sql = getSql();
    const sqlClient = sql as SqlClient;

    let groupId: number | null = body.groupId != null ? Number(body.groupId) : body.group_id != null ? Number(body.group_id) : null;
    if (groupId !== null && Number.isNaN(groupId)) groupId = null;

    let serviceType = body.serviceType != null ? String(body.serviceType) : body.service_type != null ? String(body.service_type) : "";
    let ticketSection = body.ticketSection != null ? String(body.ticketSection) : body.ticket_section != null ? String(body.ticket_section) : "";
    let sourceRole = body.sourceRole != null ? String(body.sourceRole) : body.source_role != null ? String(body.source_role) : "";

    if (groupId != null) {
      const gr = await sqlClient.unsafe(
        `SELECT service_type::text AS st, ticket_section::text AS ts, source_role::text AS sr FROM ticket_groups WHERE id = $1 LIMIT 1`,
        [groupId]
      );
      const g0 = gr?.[0] as { st?: string; ts?: string; sr?: string } | undefined;
      if (!g0) {
        return NextResponse.json({ success: false, error: "groupId not found" }, { status: 400 });
      }
      if (!serviceType && g0.st) serviceType = g0.st;
      if (!ticketSection && g0.ts) ticketSection = g0.ts;
      if (!sourceRole && g0.sr) sourceRole = g0.sr;
    }

    if (!serviceType || !ticketSection || !sourceRole) {
      return NextResponse.json(
        { success: false, error: "Provide groupId or all of serviceType, ticketSection, sourceRole" },
        { status: 400 }
      );
    }

    let titleCode = body.titleCode != null ? String(body.titleCode).trim() : body.title_code != null ? String(body.title_code).trim() : "";
    if (!titleCode) {
      titleCode = await ensureUniqueTitleCode(sqlClient, slugTitleCode(titleText));
    } else {
      titleCode = titleCode.toUpperCase();
      const taken = await sqlClient.unsafe(`SELECT 1 FROM ticket_titles WHERE title_code = $1 LIMIT 1`, [titleCode]);
      if (taken?.length) {
        titleCode = await ensureUniqueTitleCode(sqlClient, slugTitleCode(titleCode));
      }
    }

    const description = body.description == null ? null : String(body.description).trim() || null;
    const displayOrder = body.displayOrder != null ? Number(body.displayOrder) : body.display_order != null ? Number(body.display_order) : null;
    const subtext = body.subtext == null ? null : String(body.subtext).trim() || null;
    const quick = parseQuickOptions(body.defaultQuickOptions ?? body.default_quick_options);
    const legacySingleRaw = body.tagId != null ? Number(body.tagId) : body.tag_id != null ? Number(body.tag_id) : null;
    const legacySingleVal = legacySingleRaw != null && !Number.isNaN(legacySingleRaw) ? legacySingleRaw : null;
    const explicitTagIdsRaw = body.tagIds !== undefined ? body.tagIds : body.tag_ids !== undefined ? body.tag_ids : undefined;
    let tagIdsForJunction: number[] | null = null;
    if (explicitTagIdsRaw !== undefined) {
      tagIdsForJunction = Array.isArray(explicitTagIdsRaw)
        ? explicitTagIdsRaw.map((x: unknown) => Number(x)).filter((n: number) => Number.isFinite(n) && n > 0)
        : [];
    }
    const tagIdForInsert =
      tagIdsForJunction != null && tagIdsForJunction.length > 0 ? tagIdsForJunction[0] : legacySingleVal;
    const priorityId = body.priorityId != null ? Number(body.priorityId) : body.priority_id != null ? Number(body.priority_id) : null;
    const merchantSectionId =
      body.merchantSectionId != null ? String(body.merchantSectionId).trim() || null : body.merchant_section_id != null ? String(body.merchant_section_id).trim() || null : null;
    const customerSectionId =
      body.customerSectionId != null
        ? String(body.customerSectionId).trim() || null
        : body.customer_section_id != null
          ? String(body.customer_section_id).trim() || null
          : null;
    // applicable_order_statuses: TEXT[] of order status codes the title is
    // relevant for. NULL = always-relevant fallback.
    const applicableOrderStatusesRaw =
      body.applicableOrderStatuses !== undefined
        ? body.applicableOrderStatuses
        : body.applicable_order_statuses !== undefined
          ? body.applicable_order_statuses
          : undefined;
    let applicableOrderStatuses: string[] | null = null;
    if (Array.isArray(applicableOrderStatusesRaw)) {
      applicableOrderStatuses = applicableOrderStatusesRaw
        .map((s: unknown) => String(s).trim())
        .filter((s: string) => s.length > 0);
      if (applicableOrderStatuses.length === 0) applicableOrderStatuses = null;
    }
    const intakeTicketType =
      body.intakeTicketType != null ? String(body.intakeTicketType).trim() || null : body.intake_ticket_type != null ? String(body.intake_ticket_type).trim() || null : null;
    const intakeUnifiedTitle =
      body.intakeUnifiedTitle != null
        ? String(body.intakeUnifiedTitle).trim() || null
        : body.intake_unified_title != null
          ? String(body.intake_unified_title).trim() || null
          : null;
    const intakeUnifiedCategory =
      body.intakeUnifiedCategory != null
        ? String(body.intakeUnifiedCategory).trim() || null
        : body.intake_unified_category != null
          ? String(body.intake_unified_category).trim() || null
          : null;
    const intakeUnifiedPriority =
      body.intakeUnifiedPriority != null
        ? String(body.intakeUnifiedPriority).trim() || null
        : body.intake_unified_priority != null
          ? String(body.intake_unified_priority).trim() || null
          : null;
    const intakeUnifiedServiceType =
      body.intakeUnifiedServiceType != null
        ? String(body.intakeUnifiedServiceType).trim() || null
        : body.intake_unified_service_type != null
          ? String(body.intake_unified_service_type).trim() || null
          : null;
    const merchantHelpIconName =
      body.merchantHelpIconName != null
        ? String(body.merchantHelpIconName).trim() || null
        : body.merchant_help_icon_name != null
          ? String(body.merchant_help_icon_name).trim() || null
          : null;
    const isActive = !(body.isActive === false || body.is_active === false);
    const metadataJson = parseMetadataForInsert(body.metadata);

    const priorityIdVal = priorityId != null && !Number.isNaN(priorityId) ? priorityId : null;

    let parentTitleId: number | null =
      body.parentTitleId != null ? Number(body.parentTitleId) : body.parent_title_id != null ? Number(body.parent_title_id) : null;
    if (parentTitleId != null && !Number.isFinite(parentTitleId)) parentTitleId = null;
    if (parentTitleId != null) {
      const prow = await sqlClient.unsafe(`SELECT group_id FROM ticket_titles WHERE id = $1 LIMIT 1`, [parentTitleId]);
      const pg = prow?.[0] as { group_id?: unknown } | undefined;
      if (!pg) {
        return NextResponse.json({ success: false, error: "parentTitleId not found" }, { status: 400 });
      }
      const pgid = pg.group_id != null ? Number(pg.group_id) : null;
      if (pgid !== groupId && !(pgid == null && groupId == null)) {
        return NextResponse.json({ success: false, error: "Parent title must be in the same group" }, { status: 400 });
      }
    }

    let insertedId: number;
    try {
      const ins = await sqlClient.unsafe(
        `INSERT INTO ticket_titles (
          group_id, service_type, ticket_section, source_role, title_code, title_text, description, display_order, is_active,
          subtext, default_quick_options, tag_id, priority_id, merchant_section_id, intake_ticket_type, parent_title_id,
          intake_unified_title, intake_unified_category, intake_unified_priority, intake_unified_service_type,
          metadata, merchant_help_icon_name, customer_section_id, applicable_order_statuses
        ) VALUES (
          $1, $2::ticket_service_type, $3::ticket_section, $4::ticket_source_role, $5, $6, $7, $8, $9,
          $10, $11::text[], $12, $13, $14, $15, $16,
          $17, $18, $19, $20, $21::jsonb, $22, $23, $24::text[]
        )
        RETURNING id`,
        [
          groupId,
          serviceType,
          ticketSection,
          sourceRole,
          titleCode,
          titleText,
          description,
          displayOrder != null && Number.isFinite(displayOrder) ? displayOrder : null,
          isActive,
          subtext,
          quick && quick.length ? quick : null,
          tagIdForInsert,
          priorityIdVal,
          merchantSectionId,
          intakeTicketType,
          parentTitleId,
          intakeUnifiedTitle,
          intakeUnifiedCategory,
          intakeUnifiedPriority,
          intakeUnifiedServiceType,
          metadataJson,
          merchantHelpIconName,
          customerSectionId,
          applicableOrderStatuses,
        ]
      );
      insertedId = Number(ins?.[0]?.id);
    } catch (e1) {
      try {
        const insMid = await sqlClient.unsafe(
          `INSERT INTO ticket_titles (
          group_id, service_type, ticket_section, source_role, title_code, title_text, description, display_order, is_active,
          subtext, default_quick_options, tag_id, priority_id, merchant_section_id, intake_ticket_type, parent_title_id
        ) VALUES (
          $1, $2::ticket_service_type, $3::ticket_section, $4::ticket_source_role, $5, $6, $7, $8, $9,
          $10, $11::text[], $12, $13, $14, $15, $16
        )
        RETURNING id`,
          [
            groupId,
            serviceType,
            ticketSection,
            sourceRole,
            titleCode,
            titleText,
            description,
            displayOrder != null && Number.isFinite(displayOrder) ? displayOrder : null,
            isActive,
            subtext,
            quick && quick.length ? quick : null,
            tagIdForInsert,
            priorityIdVal,
            merchantSectionId,
            intakeTicketType,
            parentTitleId,
          ]
        );
        insertedId = Number(insMid?.[0]?.id);
      } catch {
        const ins2 = await sqlClient.unsafe(
          `INSERT INTO ticket_titles (
          group_id, service_type, ticket_section, source_role, title_code, title_text, description, display_order, is_active
        ) VALUES (
          $1, $2::ticket_service_type, $3::ticket_section, $4::ticket_source_role, $5, $6, $7, $8, $9
        )
        RETURNING id`,
          [
            groupId,
            serviceType,
            ticketSection,
            sourceRole,
            titleCode,
            titleText,
            description,
            displayOrder != null && Number.isFinite(displayOrder) ? displayOrder : null,
            isActive,
          ]
        );
        insertedId = Number(ins2?.[0]?.id);
        if (!Number.isFinite(insertedId)) throw e1;
      }
    }

    if (!Number.isFinite(insertedId)) {
      return NextResponse.json({ success: false, error: "Insert failed" }, { status: 500 });
    }

    try {
      if (tagIdsForJunction !== null) {
        await replaceTicketTitleTags(sqlClient, insertedId, tagIdsForJunction);
      } else if (legacySingleVal != null) {
        await replaceTicketTitleTags(sqlClient, insertedId, [legacySingleVal]);
      }
    } catch {
      /* ticket_title_tags may not exist until migration 0203 */
    }

    let full: Record<string, unknown>[] = [];
    try {
      full = await sqlClient.unsafe(
        `SELECT
          tt.id, tt.group_id, tt.service_type::text AS service_type, tt.ticket_section::text AS ticket_section, tt.source_role::text AS source_role,
          tt.title_code, tt.title_text, tt.description, tt.display_order, tt.is_active, tt.created_at, tt.updated_at,
          tt.subtext, tt.default_quick_options, tt.tag_id, tt.priority_id, tt.merchant_section_id,
          tt.customer_section_id, tt.applicable_order_statuses, tt.intake_ticket_type,
          tt.intake_unified_title, tt.intake_unified_category, tt.intake_unified_priority, tt.intake_unified_service_type,
          tt.parent_title_id, tt.metadata, tt.merchant_help_icon_name,
          tg.group_code, tg.group_name,
          ttags.tag_code AS resolved_tag_code, ttags.tag_name AS resolved_tag_name,
          tp.priority_code AS resolved_priority_code, tp.priority_name AS resolved_priority_display_name,
          (
            SELECT json_agg(
              json_build_object(
                'id', xg.id,
                'tagCode', xg.tag_code,
                'tagName', xg.tag_name
              ) ORDER BY xg.id
            )
            FROM ticket_title_tags ttm
            INNER JOIN ticket_tags xg ON xg.id = ttm.tag_id
            WHERE ttm.ticket_title_id = tt.id
          ) AS title_tags_json
        FROM ticket_titles tt
        LEFT JOIN ticket_groups tg ON tg.id = tt.group_id
        LEFT JOIN ticket_tags ttags ON ttags.id = tt.tag_id
        LEFT JOIN ticket_priorities tp ON tp.id = tt.priority_id
        WHERE tt.id = $1`,
        [insertedId]
      );
    } catch {
      full = await sqlClient.unsafe(
        `SELECT
          tt.id, tt.group_id, tt.service_type::text AS service_type, tt.ticket_section::text AS ticket_section, tt.source_role::text AS source_role,
          tt.title_code, tt.title_text, tt.description, tt.display_order, tt.is_active, tt.created_at, tt.updated_at,
          tg.group_code, tg.group_name
        FROM ticket_titles tt
        LEFT JOIN ticket_groups tg ON tg.id = tt.group_id
        WHERE tt.id = $1`,
        [insertedId]
      );
    }

    const row = full?.[0];
    if (!row) {
      return NextResponse.json({ success: false, error: "Created but could not load row" }, { status: 500 });
    }
    return NextResponse.json({ success: true, data: { title: mapTitleRow(row) } });
  } catch (e) {
    console.error("[POST /api/tickets/reference-data/titles]", e);
    return NextResponse.json({ success: false, error: String(e) }, { status: 500 });
  }
}
