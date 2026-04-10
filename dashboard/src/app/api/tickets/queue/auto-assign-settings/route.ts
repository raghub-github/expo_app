/**
 * GET/PUT singleton ticket_queue_auto_assign_settings (max open tickets per agent)
 * and ticket_auto_assign_distribution (N:M primary:secondary round-robin pattern).
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { isSuperAdmin, hasDashboardAccessByAuth } from "@/lib/permissions/engine";
import { getSql } from "@/lib/db/client";

export const runtime = "nodejs";

const CYCLE_MIN = 1;
const CYCLE_MAX = 50;

function clampCycle(n: number): number {
  return Math.min(CYCLE_MAX, Math.max(CYCLE_MIN, Math.floor(n)));
}

type SlaPriorityMinutes = {
  low: number;
  medium: number;
  high: number;
  urgent: number;
  critical: number;
};

const SLA_MIN_LIMIT = 1;
const SLA_MAX_LIMIT = 1440;
const DEFAULT_SLA_MINUTES: SlaPriorityMinutes = {
  low: 30,
  medium: 25,
  high: 20,
  urgent: 15,
  critical: 10,
};

function clampSlaMinutes(n: number, fallback: number): number {
  if (!Number.isFinite(n)) return fallback;
  return Math.max(SLA_MIN_LIMIT, Math.min(SLA_MAX_LIMIT, Math.floor(n)));
}

export async function GET() {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();
    if (userError || !user?.email) {
      return NextResponse.json({ success: false, error: "Not authenticated" }, { status: 401 });
    }

    const allowed =
      (await isSuperAdmin(user.id, user.email)) ||
      (await hasDashboardAccessByAuth(user.id, user.email, "TICKET"));
    if (!allowed) {
      return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
    }

    const sql = getSql();
    const rows = (await sql`
      SELECT max_open_tickets_per_agent, updated_at
      FROM public.ticket_queue_auto_assign_settings
      WHERE id = 1
      LIMIT 1
    `) as { max_open_tickets_per_agent?: number; updated_at?: string }[];

    const maxOpen = Number(rows[0]?.max_open_tickets_per_agent);

    let releaseAssignmentsWhenAgentOffline = true;
    let offlineReleaseMaxTickets = 200;
    let offlineReleaseSettingsAvailable = false;
    try {
      const offRows = (await sql`
        SELECT release_assignments_when_agent_offline, offline_release_max_tickets
        FROM public.ticket_queue_auto_assign_settings
        WHERE id = 1
        LIMIT 1
      `) as {
        release_assignments_when_agent_offline?: boolean | null;
        offline_release_max_tickets?: number | null;
      }[];
      offlineReleaseSettingsAvailable = true;
      const rel = offRows[0]?.release_assignments_when_agent_offline;
      releaseAssignmentsWhenAgentOffline = rel !== false;
      const mx = Number(offRows[0]?.offline_release_max_tickets);
      if (Number.isFinite(mx) && mx >= 1 && mx <= 500) offlineReleaseMaxTickets = Math.floor(mx);
    } catch {
      // 0171_ticket_queue_offline_release_settings.sql not applied
    }

    let primaryPerCycle = 2;
    let secondaryPerCycle = 1;
    let distributionUpdatedAt: string | null = null;
    let distributionAvailable = false;
    try {
      const dist = (await sql`
        SELECT primary_per_cycle, secondary_per_cycle, updated_at
        FROM public.ticket_auto_assign_distribution
        WHERE id = 1
        LIMIT 1
      `) as {
        primary_per_cycle?: number;
        secondary_per_cycle?: number;
        updated_at?: string;
      }[];
      distributionAvailable = true;
      const pc = Number(dist[0]?.primary_per_cycle);
      const sc = Number(dist[0]?.secondary_per_cycle);
      if (Number.isFinite(pc) && pc >= CYCLE_MIN && pc <= CYCLE_MAX) primaryPerCycle = pc;
      if (Number.isFinite(sc) && sc >= CYCLE_MIN && sc <= CYCLE_MAX) secondaryPerCycle = sc;
      distributionUpdatedAt = dist[0]?.updated_at != null ? String(dist[0].updated_at) : null;
    } catch {
      // table or columns missing until migrations 0162 / 0167 / 0168
    }

    let defaultRoutingGroupId: number | null = null;
    let defaultRoutingGroupAvailable = false;
    try {
      const dr = (await sql`
        SELECT default_routing_group_id
        FROM public.ticket_queue_auto_assign_settings
        WHERE id = 1
        LIMIT 1
      `) as { default_routing_group_id?: unknown }[];
      defaultRoutingGroupAvailable = true;
      const n = Number(dr[0]?.default_routing_group_id);
      if (Number.isFinite(n) && n > 0) defaultRoutingGroupId = n;
    } catch {
      // 0177_ticket_routing_default_group_and_docs.sql not applied
    }

    let slaMinutesByPriority = { ...DEFAULT_SLA_MINUTES };
    let slaSettingsAvailable = false;
    try {
      const slaRows = (await sql`
        SELECT
          sla_minutes_low,
          sla_minutes_medium,
          sla_minutes_high,
          sla_minutes_urgent,
          sla_minutes_critical
        FROM public.ticket_queue_auto_assign_settings
        WHERE id = 1
        LIMIT 1
      `) as {
        sla_minutes_low?: number | null;
        sla_minutes_medium?: number | null;
        sla_minutes_high?: number | null;
        sla_minutes_urgent?: number | null;
        sla_minutes_critical?: number | null;
      }[];
      const row = slaRows[0] ?? {};
      slaSettingsAvailable = true;
      slaMinutesByPriority = {
        low: clampSlaMinutes(Number(row.sla_minutes_low), DEFAULT_SLA_MINUTES.low),
        medium: clampSlaMinutes(Number(row.sla_minutes_medium), DEFAULT_SLA_MINUTES.medium),
        high: clampSlaMinutes(Number(row.sla_minutes_high), DEFAULT_SLA_MINUTES.high),
        urgent: clampSlaMinutes(Number(row.sla_minutes_urgent), DEFAULT_SLA_MINUTES.urgent),
        critical: clampSlaMinutes(Number(row.sla_minutes_critical), DEFAULT_SLA_MINUTES.critical),
      };
    } catch {
      // 0193_ticket_sla_priority_settings.sql not applied yet
    }

    return NextResponse.json({
      success: true,
      data: {
        maxOpenTicketsPerAgent: Number.isFinite(maxOpen) && maxOpen >= 1 ? maxOpen : 6,
        updatedAt: rows[0]?.updated_at ?? null,
        primaryPerCycle,
        secondaryPerCycle,
        distributionUpdatedAt,
        distributionAvailable,
        releaseAssignmentsWhenAgentOffline,
        offlineReleaseMaxTickets,
        offlineReleaseSettingsAvailable,
        defaultRoutingGroupId,
        defaultRoutingGroupAvailable,
        slaMinutesByPriority,
        slaSettingsAvailable,
      },
    });
  } catch (e) {
    console.error("[GET /api/tickets/queue/auto-assign-settings]", e);
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : "Failed to load settings" },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();
    if (userError || !user?.email) {
      return NextResponse.json({ success: false, error: "Not authenticated" }, { status: 401 });
    }

    const userIsSuperAdmin = await isSuperAdmin(user.id, user.email);
    const hasTicket = await hasDashboardAccessByAuth(user.id, user.email, "TICKET");
    if (!userIsSuperAdmin && !hasTicket) {
      return NextResponse.json({ success: false, error: "Insufficient permissions" }, { status: 403 });
    }

    const body = (await request.json()) as {
      maxOpenTicketsPerAgent?: unknown;
      primaryPerCycle?: unknown;
      secondaryPerCycle?: unknown;
      releaseAssignmentsWhenAgentOffline?: unknown;
      offlineReleaseMaxTickets?: unknown;
      defaultRoutingGroupId?: unknown;
      slaMinutesByPriority?: Partial<Record<keyof SlaPriorityMinutes, unknown>>;
    };

    const hasCap = body.maxOpenTicketsPerAgent !== undefined && body.maxOpenTicketsPerAgent !== null;
    const hasPrimary = body.primaryPerCycle !== undefined && body.primaryPerCycle !== null;
    const hasSecondary = body.secondaryPerCycle !== undefined && body.secondaryPerCycle !== null;
    const hasRR = hasPrimary || hasSecondary;
    const hasOfflineRelease =
      body.releaseAssignmentsWhenAgentOffline !== undefined && body.releaseAssignmentsWhenAgentOffline !== null;
    const hasOfflineMax =
      body.offlineReleaseMaxTickets !== undefined && body.offlineReleaseMaxTickets !== null;
    const hasDefaultGroup = Object.prototype.hasOwnProperty.call(body, "defaultRoutingGroupId");
    const hasSlaByPriority =
      body.slaMinutesByPriority != null &&
      typeof body.slaMinutesByPriority === "object";

    if (!hasCap && !hasRR && !hasOfflineRelease && !hasOfflineMax && !hasDefaultGroup && !hasSlaByPriority) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Send maxOpenTicketsPerAgent, primary/secondaryPerCycle, offline release fields, defaultRoutingGroupId, or slaMinutesByPriority",
        },
        { status: 400 }
      );
    }

    const sql = getSql();

    if (hasDefaultGroup) {
      const raw = body.defaultRoutingGroupId;
      let gid: number | null = null;
      if (raw === null || raw === "" || raw === "none") {
        gid = null;
      } else {
        const n = typeof raw === "number" ? raw : Number(raw);
        if (!Number.isFinite(n) || n <= 0) {
          return NextResponse.json(
            { success: false, error: "defaultRoutingGroupId must be a positive integer or null to clear" },
            { status: 400 }
          );
        }
        gid = Math.floor(n);
      }
      try {
        await sql`
          UPDATE public.ticket_queue_auto_assign_settings
          SET default_routing_group_id = ${gid}, updated_at = now()
          WHERE id = 1
        `;
      } catch (e) {
        console.error("[PUT auto-assign-settings] default_routing_group_id:", e);
        return NextResponse.json(
          {
            success: false,
            error: "Could not save default routing queue — apply migration 0177_ticket_routing_default_group_and_docs.sql.",
          },
          { status: 503 }
        );
      }
    }

    if (hasCap) {
      const raw = body.maxOpenTicketsPerAgent;
      const n = typeof raw === "number" ? raw : Number(raw);
      if (!Number.isFinite(n) || n < 1 || n > 500) {
        return NextResponse.json(
          { success: false, error: "maxOpenTicketsPerAgent must be between 1 and 500" },
          { status: 400 }
        );
      }
      await sql`
        INSERT INTO public.ticket_queue_auto_assign_settings (id, max_open_tickets_per_agent, updated_at)
        VALUES (1, ${Math.floor(n)}, now())
        ON CONFLICT (id) DO UPDATE SET
          max_open_tickets_per_agent = ${Math.floor(n)},
          updated_at = now()
      `;
    }

    if (hasRR) {
      let currentPc = 2;
      let currentSc = 1;
      try {
        const cur = (await sql`
          SELECT primary_per_cycle, secondary_per_cycle
          FROM public.ticket_auto_assign_distribution
          WHERE id = 1
          LIMIT 1
        `) as { primary_per_cycle?: number; secondary_per_cycle?: number }[];
        const cpc = Number(cur[0]?.primary_per_cycle);
        const csc = Number(cur[0]?.secondary_per_cycle);
        if (Number.isFinite(cpc) && cpc >= CYCLE_MIN && cpc <= CYCLE_MAX) currentPc = cpc;
        if (Number.isFinite(csc) && csc >= CYCLE_MIN && csc <= CYCLE_MAX) currentSc = csc;
      } catch (e) {
        console.error("[PUT auto-assign-settings] read distribution:", e);
        return NextResponse.json(
          {
            success: false,
            error:
              "Could not load round-robin settings — run migrations 0162 / 0167 and 0168 (ticket_auto_assign_distribution).",
          },
          { status: 503 }
        );
      }

      let newPc = currentPc;
      let newSc = currentSc;
      if (hasPrimary) {
        const v =
          typeof body.primaryPerCycle === "number" ? body.primaryPerCycle : Number(body.primaryPerCycle);
        if (!Number.isFinite(v) || v < CYCLE_MIN || v > CYCLE_MAX) {
          return NextResponse.json(
            {
              success: false,
              error: `primaryPerCycle must be between ${CYCLE_MIN} and ${CYCLE_MAX}`,
            },
            { status: 400 }
          );
        }
        newPc = clampCycle(v);
      }
      if (hasSecondary) {
        const v =
          typeof body.secondaryPerCycle === "number" ? body.secondaryPerCycle : Number(body.secondaryPerCycle);
        if (!Number.isFinite(v) || v < CYCLE_MIN || v > CYCLE_MAX) {
          return NextResponse.json(
            {
              success: false,
              error: `secondaryPerCycle must be between ${CYCLE_MIN} and ${CYCLE_MAX}`,
            },
            { status: 400 }
          );
        }
        newSc = clampCycle(v);
      }

      if (newPc !== currentPc || newSc !== currentSc) {
        try {
          await sql`
            INSERT INTO public.ticket_auto_assign_distribution (
              id,
              primary_per_cycle,
              secondary_per_cycle,
              primary_slots_remaining,
              secondary_slots_remaining,
              updated_at
            )
            VALUES (1, ${newPc}, ${newSc}, ${newPc}, 0, now())
            ON CONFLICT (id) DO UPDATE SET
              primary_per_cycle = EXCLUDED.primary_per_cycle,
              secondary_per_cycle = EXCLUDED.secondary_per_cycle,
              primary_slots_remaining = EXCLUDED.primary_slots_remaining,
              secondary_slots_remaining = EXCLUDED.secondary_slots_remaining,
              updated_at = now()
          `;
        } catch (e) {
          console.error("[PUT auto-assign-settings] ticket_auto_assign_distribution:", e);
          return NextResponse.json(
            {
              success: false,
              error:
                "Could not save round-robin settings — run migrations 0162 / 0167 and 0168 (ticket_auto_assign_distribution).",
            },
            { status: 503 }
          );
        }
      }
    }

    if (hasOfflineRelease || hasOfflineMax) {
      const relRaw = body.releaseAssignmentsWhenAgentOffline;
      const releaseWhenOffline =
        hasOfflineRelease && typeof relRaw === "boolean"
          ? relRaw
          : hasOfflineRelease
            ? String(relRaw).toLowerCase() === "true"
            : undefined;

      let maxT = 200;
      if (hasOfflineMax) {
        const raw = body.offlineReleaseMaxTickets;
        const n = typeof raw === "number" ? raw : Number(raw);
        if (!Number.isFinite(n) || n < 1 || n > 500) {
          return NextResponse.json(
            { success: false, error: "offlineReleaseMaxTickets must be between 1 and 500" },
            { status: 400 }
          );
        }
        maxT = Math.floor(n);
      }

      try {
        if (hasOfflineRelease && hasOfflineMax) {
          await sql`
            UPDATE public.ticket_queue_auto_assign_settings
            SET release_assignments_when_agent_offline = ${Boolean(releaseWhenOffline)},
                offline_release_max_tickets = ${maxT},
                updated_at = now()
            WHERE id = 1
          `;
        } else if (hasOfflineRelease && releaseWhenOffline !== undefined) {
          await sql`
            UPDATE public.ticket_queue_auto_assign_settings
            SET release_assignments_when_agent_offline = ${Boolean(releaseWhenOffline)},
                updated_at = now()
            WHERE id = 1
          `;
        } else if (hasOfflineMax) {
          await sql`
            UPDATE public.ticket_queue_auto_assign_settings
            SET offline_release_max_tickets = ${maxT},
                updated_at = now()
            WHERE id = 1
          `;
        }
      } catch (e) {
        console.error("[PUT auto-assign-settings] offline release columns:", e);
        return NextResponse.json(
          {
            success: false,
            error:
              "Could not save offline release settings — run migration 0171_ticket_queue_offline_release_settings.sql.",
          },
          { status: 503 }
        );
      }
    }

    if (hasSlaByPriority) {
      const raw = body.slaMinutesByPriority as Partial<Record<keyof SlaPriorityMinutes, unknown>>;
      const hasAnySlaKey = ["low", "medium", "high", "urgent", "critical"].some((k) =>
        Object.prototype.hasOwnProperty.call(raw, k)
      );
      if (hasAnySlaKey) {
        let current = { ...DEFAULT_SLA_MINUTES };
        try {
          const rows = (await sql`
            SELECT
              sla_minutes_low,
              sla_minutes_medium,
              sla_minutes_high,
              sla_minutes_urgent,
              sla_minutes_critical
            FROM public.ticket_queue_auto_assign_settings
            WHERE id = 1
            LIMIT 1
          `) as {
            sla_minutes_low?: number | null;
            sla_minutes_medium?: number | null;
            sla_minutes_high?: number | null;
            sla_minutes_urgent?: number | null;
            sla_minutes_critical?: number | null;
          }[];
          const row = rows[0] ?? {};
          current = {
            low: clampSlaMinutes(Number(row.sla_minutes_low), DEFAULT_SLA_MINUTES.low),
            medium: clampSlaMinutes(Number(row.sla_minutes_medium), DEFAULT_SLA_MINUTES.medium),
            high: clampSlaMinutes(Number(row.sla_minutes_high), DEFAULT_SLA_MINUTES.high),
            urgent: clampSlaMinutes(Number(row.sla_minutes_urgent), DEFAULT_SLA_MINUTES.urgent),
            critical: clampSlaMinutes(Number(row.sla_minutes_critical), DEFAULT_SLA_MINUTES.critical),
          };
        } catch {
          // fallback to defaults
        }
        const low = Number(raw.low ?? current.low);
        const medium = Number(raw.medium ?? current.medium);
        const high = Number(raw.high ?? current.high);
        const urgent = Number(raw.urgent ?? current.urgent);
        const critical = Number(raw.critical ?? current.critical);
        const entries: Array<[string, number]> = [
          ["low", low],
          ["medium", medium],
          ["high", high],
          ["urgent", urgent],
          ["critical", critical],
        ];
        for (const [key, value] of entries) {
          if (!Number.isFinite(value) || value < SLA_MIN_LIMIT || value > SLA_MAX_LIMIT) {
            return NextResponse.json(
              { success: false, error: `slaMinutesByPriority.${key} must be between ${SLA_MIN_LIMIT} and ${SLA_MAX_LIMIT}` },
              { status: 400 }
            );
          }
        }

        try {
          await sql`
            UPDATE public.ticket_queue_auto_assign_settings
            SET
              sla_minutes_low = ${Math.floor(low)},
              sla_minutes_medium = ${Math.floor(medium)},
              sla_minutes_high = ${Math.floor(high)},
              sla_minutes_urgent = ${Math.floor(urgent)},
              sla_minutes_critical = ${Math.floor(critical)},
              updated_at = now()
            WHERE id = 1
          `;
        } catch (e) {
          console.error("[PUT auto-assign-settings] sla minutes:", e);
          return NextResponse.json(
            {
              success: false,
              error: "Could not save SLA settings — run migration 0193_ticket_sla_priority_settings.sql.",
            },
            { status: 503 }
          );
        }
      }
    }

    const capRows = (await sql`
      SELECT max_open_tickets_per_agent FROM public.ticket_queue_auto_assign_settings WHERE id = 1 LIMIT 1
    `) as { max_open_tickets_per_agent?: number }[];
    const maxOpen = Number(capRows[0]?.max_open_tickets_per_agent);

    let primaryPerCycle = 2;
    let secondaryPerCycle = 1;
    let distributionAvailable = false;
    try {
      const dist = (await sql`
        SELECT primary_per_cycle, secondary_per_cycle
        FROM public.ticket_auto_assign_distribution
        WHERE id = 1
        LIMIT 1
      `) as { primary_per_cycle?: number; secondary_per_cycle?: number }[];
      distributionAvailable = true;
      const pc = Number(dist[0]?.primary_per_cycle);
      const sc = Number(dist[0]?.secondary_per_cycle);
      if (Number.isFinite(pc) && pc >= CYCLE_MIN && pc <= CYCLE_MAX) primaryPerCycle = pc;
      if (Number.isFinite(sc) && sc >= CYCLE_MIN && sc <= CYCLE_MAX) secondaryPerCycle = sc;
    } catch {
      // ignore
    }

    let releaseAssignmentsWhenAgentOffline = true;
    let offlineReleaseMaxTickets = 200;
    let offlineReleaseSettingsAvailable = false;
    try {
      const offRows = (await sql`
        SELECT release_assignments_when_agent_offline, offline_release_max_tickets
        FROM public.ticket_queue_auto_assign_settings
        WHERE id = 1
        LIMIT 1
      `) as {
        release_assignments_when_agent_offline?: boolean | null;
        offline_release_max_tickets?: number | null;
      }[];
      offlineReleaseSettingsAvailable = true;
      const rel = offRows[0]?.release_assignments_when_agent_offline;
      releaseAssignmentsWhenAgentOffline = rel !== false;
      const mx = Number(offRows[0]?.offline_release_max_tickets);
      if (Number.isFinite(mx) && mx >= 1 && mx <= 500) offlineReleaseMaxTickets = Math.floor(mx);
    } catch {
      // 0171 not applied
    }

    let defaultRoutingGroupId: number | null = null;
    let defaultRoutingGroupAvailable = false;
    try {
      const dr = (await sql`
        SELECT default_routing_group_id
        FROM public.ticket_queue_auto_assign_settings
        WHERE id = 1
        LIMIT 1
      `) as { default_routing_group_id?: unknown }[];
      defaultRoutingGroupAvailable = true;
      const n = Number(dr[0]?.default_routing_group_id);
      if (Number.isFinite(n) && n > 0) defaultRoutingGroupId = n;
    } catch {
      // 0177 not applied
    }

    let slaMinutesByPriority = { ...DEFAULT_SLA_MINUTES };
    let slaSettingsAvailable = false;
    try {
      const slaRows = (await sql`
        SELECT
          sla_minutes_low,
          sla_minutes_medium,
          sla_minutes_high,
          sla_minutes_urgent,
          sla_minutes_critical
        FROM public.ticket_queue_auto_assign_settings
        WHERE id = 1
        LIMIT 1
      `) as {
        sla_minutes_low?: number | null;
        sla_minutes_medium?: number | null;
        sla_minutes_high?: number | null;
        sla_minutes_urgent?: number | null;
        sla_minutes_critical?: number | null;
      }[];
      const row = slaRows[0] ?? {};
      slaSettingsAvailable = true;
      slaMinutesByPriority = {
        low: clampSlaMinutes(Number(row.sla_minutes_low), DEFAULT_SLA_MINUTES.low),
        medium: clampSlaMinutes(Number(row.sla_minutes_medium), DEFAULT_SLA_MINUTES.medium),
        high: clampSlaMinutes(Number(row.sla_minutes_high), DEFAULT_SLA_MINUTES.high),
        urgent: clampSlaMinutes(Number(row.sla_minutes_urgent), DEFAULT_SLA_MINUTES.urgent),
        critical: clampSlaMinutes(Number(row.sla_minutes_critical), DEFAULT_SLA_MINUTES.critical),
      };
    } catch {
      // 0193 not applied
    }

    return NextResponse.json({
      success: true,
      data: {
        maxOpenTicketsPerAgent: Number.isFinite(maxOpen) && maxOpen >= 1 ? maxOpen : 6,
        primaryPerCycle,
        secondaryPerCycle,
        distributionAvailable,
        releaseAssignmentsWhenAgentOffline,
        offlineReleaseMaxTickets,
        offlineReleaseSettingsAvailable,
        defaultRoutingGroupId,
        defaultRoutingGroupAvailable,
        slaMinutesByPriority,
        slaSettingsAvailable,
      },
    });
  } catch (e) {
    console.error("[PUT /api/tickets/queue/auto-assign-settings]", e);
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : "Failed to save" },
      { status: 500 }
    );
  }
}
