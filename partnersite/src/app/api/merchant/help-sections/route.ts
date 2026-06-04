import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { validateMerchantFromSession } from "@/lib/auth/validate-merchant";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder.supabase.co";
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "placeholder-service-role-key";

function getSupabaseAdmin() {
  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function isMerchantSection(raw: unknown): boolean {
  const s = String(raw ?? "")
    .trim()
    .toLowerCase();
  return s === "merchant";
}

/**
 * GET /api/merchant/help-sections
 * Same catalog as mobile GET /v1/merchant-partner/merchant-help-sections (ticket_titles rows).
 */
export async function GET() {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ ok: false, error: "unauthorized", sections: [] }, { status: 401 });
    }

    const validation = await validateMerchantFromSession({
      id: user.id,
      email: user.email ?? null,
      phone: user.phone ?? null,
    });
    if (!validation.isValid) {
      return NextResponse.json({ ok: false, error: "forbidden", sections: [] }, { status: 403 });
    }

    const db = getSupabaseAdmin();

    const { data: rows, error } = await db.from("ticket_titles").select("*").eq("is_active", true);

    if (error) {
      console.error("[merchant/help-sections] ticket_titles:", error);
      return NextResponse.json({ ok: true, sections: [] });
    }

    const list = Array.isArray(rows) ? rows : [];
    const groupIds = [
      ...new Set(
        list
          .map((r: { group_id?: number | null }) => r.group_id)
          .filter((id): id is number => typeof id === "number" && id > 0)
      ),
    ];

    let activeGroupIds = new Set<number>();
    if (groupIds.length > 0) {
      const { data: groups } = await db.from("ticket_groups").select("id, is_active").in("id", groupIds);
      for (const g of groups ?? []) {
        if (g && typeof g.id === "number" && g.is_active === true) {
          activeGroupIds.add(g.id);
        }
      }
    }

    const sections = list
      .filter((r: Record<string, unknown>) => {
        const sid = String(r.merchant_section_id ?? "").trim();
        if (!sid) return false;
        if (!isMerchantSection(r.ticket_section)) return false;
        const gid = r.group_id;
        if (gid != null && typeof gid === "number" && gid > 0) {
          if (!activeGroupIds.has(gid)) return false;
        }
        return true;
      })
      .map((r: Record<string, unknown>) => {
        const rawParent = r.parent_title_id;
        let parent_title_id: number | null = null;
        if (rawParent != null) {
          const n =
            typeof rawParent === "number" && Number.isFinite(rawParent)
              ? rawParent
              : typeof rawParent === "string" && /^\d+$/.test(rawParent.trim())
                ? Number(rawParent.trim())
                : NaN;
          if (Number.isInteger(n) && n > 0) parent_title_id = n;
        }
        return {
        ticket_title_id: Number(r.id),
        parent_title_id,
        section_id: String(r.merchant_section_id ?? "")
          .trim()
          .toLowerCase(),
        title: String(r.title_text ?? "").trim() || String(r.merchant_section_id ?? "").trim(),
        subtitle: (() => {
          const st = r.subtext ?? (r as { subtitle?: unknown }).subtitle;
          return st != null && String(st).trim() ? String(st).trim() : null;
        })(),
        quick_options: Array.isArray(r.default_quick_options)
          ? (r.default_quick_options as unknown[]).map((x) => String(x).trim()).filter(Boolean)
          : [],
        display_order:
          typeof r.display_order === "number" && Number.isFinite(r.display_order)
            ? r.display_order
            : null,
        help_hub_icon:
          r.merchant_help_icon_name != null && String(r.merchant_help_icon_name).trim()
            ? String(r.merchant_help_icon_name).trim()
            : null,
      };
      })
      .filter((s) => Number.isInteger(s.ticket_title_id) && s.ticket_title_id > 0)
      .sort((a, b) => {
        const ao = a.display_order ?? 999999;
        const bo = b.display_order ?? 999999;
        if (ao !== bo) return ao - bo;
        return a.title.localeCompare(b.title);
      });

    return NextResponse.json({ ok: true, sections });
  } catch (e) {
    console.error("[merchant/help-sections]", e);
    return NextResponse.json({ ok: true, sections: [] });
  }
}
