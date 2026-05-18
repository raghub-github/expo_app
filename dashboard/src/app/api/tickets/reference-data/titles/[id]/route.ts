/**
 * PATCH /api/tickets/reference-data/titles/[id] - Update ticket title row (super-admin)
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getSystemUserByEmail } from "@/lib/db/operations/users";
import { isSuperAdmin } from "@/lib/permissions/engine";
import { getSql } from "@/lib/db/client";
import { isInvalidRefreshToken } from "@/lib/auth/session-errors";
import { mapTitleTagsFromRow, replaceTicketTitleTags } from "@/lib/tickets/title-tag-map";

export const runtime = "nodejs";

type SqlClient = { unsafe: (q: string, v?: unknown[]) => Promise<Record<string, unknown>[]> };

async function requireSuperAdmin() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError) {
    if (isInvalidRefreshToken(userError)) {
      await supabase.auth.signOut();
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

function parseQuickOptions(v: unknown): string[] | null {
  if (v == null) return null;
  if (Array.isArray(v)) return v.map((x) => String(x).trim()).filter(Boolean);
  if (typeof v === "string") return v.split(",").map((s) => s.trim()).filter(Boolean);
  return null;
}

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
    tagCode: primary?.tagCode ?? (r.resolved_tag_code != null ? String(r.resolved_tag_code) : null),
    tagName: primary?.tagName ?? (r.resolved_tag_name != null ? String(r.resolved_tag_name) : null),
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

async function loadTitleFull(sqlClient: SqlClient, titleId: number) {
  try {
    const full = await sqlClient.unsafe(
      `SELECT
        tt.id, tt.group_id, tt.service_type::text AS service_type, tt.ticket_section::text AS ticket_section, tt.source_role::text AS source_role,
        tt.title_code, tt.title_text, tt.description, tt.display_order, tt.is_active, tt.created_at, tt.updated_at,
        tt.subtext, tt.default_quick_options, tt.tag_id, tt.priority_id, tt.merchant_section_id,
        tt.customer_section_id, tt.applicable_order_statuses, tt.intake_ticket_type,
        tt.intake_unified_title, tt.intake_unified_category, tt.intake_unified_priority, tt.intake_unified_service_type,
        tt.parent_title_id,
        tt.metadata,
        tt.merchant_help_icon_name,
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
      [titleId]
    );
    return full?.[0] ?? null;
  } catch {
    const full = await sqlClient.unsafe(
      `SELECT
        tt.id, tt.group_id, tt.service_type::text AS service_type, tt.ticket_section::text AS ticket_section, tt.source_role::text AS source_role,
        tt.title_code, tt.title_text, tt.description, tt.display_order, tt.is_active, tt.created_at, tt.updated_at,
        tg.group_code, tg.group_name
      FROM ticket_titles tt
      LEFT JOIN ticket_groups tg ON tg.id = tt.group_id
      WHERE tt.id = $1`,
      [titleId]
    );
    return full?.[0] ?? null;
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const err = await requireSuperAdmin();
  if (err) return err;
  const { id } = await params;
  const titleId = parseInt(id, 10);
  if (Number.isNaN(titleId)) {
    return NextResponse.json({ success: false, error: "Invalid id" }, { status: 400 });
  }
  try {
    const body = await request.json();
    const sql = getSql();
    const sqlClient = sql as SqlClient;
    const updates: string[] = [];
    const values: unknown[] = [];
    let idx = 0;
    if (body.isActive !== undefined) {
      idx++;
      updates.push(`is_active = $${idx}`);
      values.push(Boolean(body.isActive));
    }
    if (body.titleText !== undefined) {
      idx++;
      updates.push(`title_text = $${idx}`);
      values.push(String(body.titleText).trim());
    }
    if (body.titleCode !== undefined || body.title_code !== undefined) {
      idx++;
      updates.push(`title_code = $${idx}`);
      values.push(String(body.titleCode ?? body.title_code).trim().toUpperCase());
    }
    if (body.description !== undefined) {
      idx++;
      updates.push(`description = $${idx}`);
      values.push(body.description == null ? null : String(body.description).trim());
    }
    if (body.displayOrder !== undefined) {
      idx++;
      updates.push(`display_order = $${idx}`);
      values.push(body.displayOrder == null ? null : Number(body.displayOrder));
    }
    if (body.groupId !== undefined || body.group_id !== undefined) {
      const gid = body.groupId ?? body.group_id;
      idx++;
      updates.push(`group_id = $${idx}`);
      values.push(gid == null ? null : Number(gid));
    }
    if (body.serviceType !== undefined || body.service_type !== undefined) {
      idx++;
      updates.push(`service_type = $${idx}::ticket_service_type`);
      values.push(String(body.serviceType ?? body.service_type));
    }
    if (body.ticketSection !== undefined || body.ticket_section !== undefined) {
      idx++;
      updates.push(`ticket_section = $${idx}::ticket_section`);
      values.push(String(body.ticketSection ?? body.ticket_section));
    }
    if (body.sourceRole !== undefined || body.source_role !== undefined) {
      idx++;
      updates.push(`source_role = $${idx}::ticket_source_role`);
      values.push(String(body.sourceRole ?? body.source_role));
    }
    if (body.subtext !== undefined) {
      idx++;
      updates.push(`subtext = $${idx}`);
      values.push(body.subtext == null ? null : String(body.subtext).trim() || null);
    }
    if (body.defaultQuickOptions !== undefined || body.default_quick_options !== undefined) {
      const quick = parseQuickOptions(body.defaultQuickOptions ?? body.default_quick_options);
      idx++;
      updates.push(`default_quick_options = $${idx}::text[]`);
      values.push(quick && quick.length ? quick : null);
    }
    if (body.priorityId !== undefined || body.priority_id !== undefined) {
      const pid = body.priorityId ?? body.priority_id;
      idx++;
      updates.push(`priority_id = $${idx}`);
      values.push(pid == null || pid === "" ? null : Number(pid));
    }
    if (body.merchantSectionId !== undefined || body.merchant_section_id !== undefined) {
      const mid = body.merchantSectionId ?? body.merchant_section_id;
      idx++;
      updates.push(`merchant_section_id = $${idx}`);
      values.push(mid == null ? null : String(mid).trim() || null);
    }
    if (body.customerSectionId !== undefined || body.customer_section_id !== undefined) {
      const cid = body.customerSectionId ?? body.customer_section_id;
      idx++;
      updates.push(`customer_section_id = $${idx}`);
      values.push(cid == null ? null : String(cid).trim() || null);
    }
    if (
      body.applicableOrderStatuses !== undefined ||
      body.applicable_order_statuses !== undefined
    ) {
      const raw = body.applicableOrderStatuses ?? body.applicable_order_statuses;
      let cleaned: string[] | null = null;
      if (Array.isArray(raw)) {
        cleaned = raw
          .map((s: unknown) => String(s).trim())
          .filter((s: string) => s.length > 0);
        if (cleaned.length === 0) cleaned = null;
      }
      idx++;
      updates.push(`applicable_order_statuses = $${idx}::text[]`);
      values.push(cleaned);
    }
    if (body.intakeTicketType !== undefined || body.intake_ticket_type !== undefined) {
      const it = body.intakeTicketType ?? body.intake_ticket_type;
      idx++;
      updates.push(`intake_ticket_type = $${idx}`);
      values.push(it == null ? null : String(it).trim() || null);
    }
    if (body.intakeUnifiedTitle !== undefined || body.intake_unified_title !== undefined) {
      const v = body.intakeUnifiedTitle ?? body.intake_unified_title;
      idx++;
      updates.push(`intake_unified_title = $${idx}`);
      values.push(v == null ? null : String(v).trim() || null);
    }
    if (body.intakeUnifiedCategory !== undefined || body.intake_unified_category !== undefined) {
      const v = body.intakeUnifiedCategory ?? body.intake_unified_category;
      idx++;
      updates.push(`intake_unified_category = $${idx}`);
      values.push(v == null ? null : String(v).trim() || null);
    }
    if (body.intakeUnifiedPriority !== undefined || body.intake_unified_priority !== undefined) {
      const v = body.intakeUnifiedPriority ?? body.intake_unified_priority;
      idx++;
      updates.push(`intake_unified_priority = $${idx}`);
      values.push(v == null ? null : String(v).trim() || null);
    }
    if (body.intakeUnifiedServiceType !== undefined || body.intake_unified_service_type !== undefined) {
      const v = body.intakeUnifiedServiceType ?? body.intake_unified_service_type;
      idx++;
      updates.push(`intake_unified_service_type = $${idx}`);
      values.push(v == null ? null : String(v).trim() || null);
    }
    if (body.merchantHelpIconName !== undefined || body.merchant_help_icon_name !== undefined) {
      const v = body.merchantHelpIconName ?? body.merchant_help_icon_name;
      idx++;
      updates.push(`merchant_help_icon_name = $${idx}`);
      values.push(v == null ? null : String(v).trim() || null);
    }
    if (body.metadata !== undefined) {
      idx++;
      updates.push(`metadata = $${idx}::jsonb`);
      if (body.metadata == null) {
        values.push(null);
      } else if (typeof body.metadata === "string") {
        const raw = String(body.metadata).trim();
        values.push(raw === "" ? null : raw);
      } else {
        values.push(JSON.stringify(body.metadata));
      }
    }
    if (body.parentTitleId !== undefined || body.parent_title_id !== undefined) {
      const raw = body.parentTitleId ?? body.parent_title_id;
      const newParent: number | null = raw == null || raw === "" ? null : Number(raw);
      if (newParent != null) {
        if (!Number.isFinite(newParent) || newParent === titleId) {
          return NextResponse.json({ success: false, error: "Invalid parent title" }, { status: 400 });
        }
        const cycleRows = await sqlClient.unsafe(
          `WITH RECURSIVE up AS (
             SELECT id, parent_title_id FROM ticket_titles WHERE id = $1
             UNION ALL
             SELECT t.id, t.parent_title_id FROM ticket_titles t
             INNER JOIN up ON t.id = up.parent_title_id
             WHERE up.parent_title_id IS NOT NULL
           )
           SELECT 1 FROM up WHERE id = $2 LIMIT 1`,
          [newParent, titleId]
        );
        if (cycleRows?.length) {
          return NextResponse.json({ success: false, error: "Cannot set parent: would create a cycle" }, { status: 400 });
        }
        const grpRows = await sqlClient.unsafe(
          `SELECT t.group_id AS cg, p.group_id AS pg
           FROM ticket_titles t
           CROSS JOIN ticket_titles p
           WHERE t.id = $1 AND p.id = $2`,
          [titleId, newParent]
        );
        const g0 = grpRows?.[0] as { cg?: unknown; pg?: unknown } | undefined;
        if (!g0) {
          return NextResponse.json({ success: false, error: "Title or parent not found" }, { status: 400 });
        }
        const cg = g0.cg != null ? Number(g0.cg) : null;
        const pg = g0.pg != null ? Number(g0.pg) : null;
        if (cg !== pg && !(cg == null && pg == null)) {
          return NextResponse.json({ success: false, error: "Parent title must be in the same group" }, { status: 400 });
        }
      }
      idx++;
      updates.push(`parent_title_id = $${idx}`);
      values.push(newParent);
    }

    const tagIdsExplicit =
      body.tagIds !== undefined ? body.tagIds : body.tag_ids !== undefined ? body.tag_ids : undefined;
    const tagIdsPayload =
      tagIdsExplicit !== undefined
        ? Array.isArray(tagIdsExplicit)
          ? tagIdsExplicit.map((x: unknown) => Number(x)).filter((n: number) => Number.isFinite(n) && n > 0)
          : []
        : null;
    const legacyTagTouched = body.tagId !== undefined || body.tag_id !== undefined;
    const tagSyncOnly = updates.length === 0 && (tagIdsPayload !== null || legacyTagTouched);

    if (updates.length === 0 && tagIdsPayload === null && !legacyTagTouched) {
      return NextResponse.json({ success: false, error: "No fields to update" }, { status: 400 });
    }

    if (updates.length > 0) {
      updates.push("updated_at = NOW()");
      values.push(titleId);
      const rows = await sqlClient.unsafe(
        `UPDATE ticket_titles SET ${updates.join(", ")} WHERE id = $${idx + 1} RETURNING id`,
        values
      );
      const row = rows?.[0];
      if (!row) {
        return NextResponse.json({ success: false, error: "Title not found" }, { status: 404 });
      }
    } else if (tagSyncOnly) {
      const exists = await sqlClient.unsafe(`SELECT 1 FROM ticket_titles WHERE id = $1 LIMIT 1`, [titleId]);
      if (!exists?.length) {
        return NextResponse.json({ success: false, error: "Title not found" }, { status: 404 });
      }
    }

    try {
      if (tagIdsPayload !== null) {
        await replaceTicketTitleTags(sqlClient, titleId, tagIdsPayload);
      } else if (legacyTagTouched) {
        const tid = body.tagId ?? body.tag_id;
        const n = tid == null || tid === "" ? null : Number(tid);
        await replaceTicketTitleTags(sqlClient, titleId, n != null && Number.isFinite(n) ? [n] : []);
      }
    } catch {
      /* ticket_title_tags missing until migration */
    }

    const full = await loadTitleFull(sqlClient, titleId);
    if (!full) {
      return NextResponse.json({ success: false, error: "Title not found" }, { status: 404 });
    }
    return NextResponse.json({ success: true, data: mapTitleRow(full) });
  } catch (e) {
    console.error("[PATCH /api/tickets/reference-data/titles]", e);
    return NextResponse.json({ success: false, error: String(e) }, { status: 500 });
  }
}

/**
 * Permanently remove catalog row. Child rows (parent_title_id) become roots via ON DELETE SET NULL.
 * If another table still references this title with a hard FK, returns 409 so the client can show a clear error.
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const err = await requireSuperAdmin();
  if (err) return err;
  const { id } = await params;
  const titleId = parseInt(id, 10);
  if (Number.isNaN(titleId)) {
    return NextResponse.json({ success: false, error: "Invalid id" }, { status: 400 });
  }
  try {
    const sql = getSql();
    const sqlClient = sql as SqlClient;
    await sqlClient.unsafe(`UPDATE ticket_titles SET parent_title_id = NULL WHERE parent_title_id = $1`, [titleId]);
    const rows = await sqlClient.unsafe(`DELETE FROM ticket_titles WHERE id = $1 RETURNING id`, [titleId]);
    if (!rows?.[0]) {
      return NextResponse.json({ success: false, error: "Title not found" }, { status: 404 });
    }
    return NextResponse.json({ success: true, data: { id: titleId } });
  } catch (e) {
    const msg = String(e);
    console.error("[DELETE /api/tickets/reference-data/titles]", e);
    if (/foreign key|violates foreign key|23503/i.test(msg)) {
      return NextResponse.json(
        {
          success: false,
          error:
            "This title is still referenced by tickets or other records and cannot be deleted. Deactivate it instead or remove the references.",
        },
        { status: 409 }
      );
    }
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
