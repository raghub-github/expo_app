/**
 * GET/PATCH — browser queue assignment buzzer (single-row ticket_agent_notification_settings).
 */

import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedApiUser, authFailureResponse } from "@/lib/auth/api-session";
import { resolveSystemUserForSupabaseAuth } from "@/lib/auth/user-mapping";
import { isSuperAdmin, hasDashboardAccessByAuth } from "@/lib/permissions/engine";
import { getSql } from "@/lib/db/client";

export const runtime = "nodejs";

const DEFAULT_URL = "/notification.wav";

async function requireTicketAccess(request?: NextRequest) {
  const auth = await getAuthenticatedApiUser(request);
  if (!auth.ok) {
    return { error: authFailureResponse(auth) };
  }
  const { user } = auth;
  const systemUser = await resolveSystemUserForSupabaseAuth(user.id, user.email);
  if (!systemUser) {
    return { error: NextResponse.json({ success: false, error: "User not found" }, { status: 404 }) };
  }
  const email = user.email ?? systemUser.email;
  const userIsSuperAdmin = await isSuperAdmin(user.id, email);
  const hasTicketAccess = await hasDashboardAccessByAuth(user.id, email, "TICKET");
  if (!userIsSuperAdmin && !hasTicketAccess) {
    return { error: NextResponse.json({ success: false, error: "Insufficient permissions" }, { status: 403 }) };
  }
  return { systemUser };
}

function normalizeSoundUrl(raw: unknown): string | null {
  if (raw == null) return DEFAULT_URL;
  const s = String(raw).trim();
  if (s === "") return DEFAULT_URL;
  if (!s.startsWith("/") || s.startsWith("//")) return null;
  if (s.length > 512) return null;
  const lower = s.toLowerCase();
  const ok =
    lower.endsWith(".wav") ||
    lower.endsWith(".mp3") ||
    lower.endsWith(".ogg") ||
    lower.endsWith(".mpeg") ||
    lower.endsWith(".m4a");
  if (!ok) return null;
  return s;
}

export async function GET(request: NextRequest) {
  const auth = await requireTicketAccess(request);
  if ("error" in auth && auth.error) return auth.error;

  try {
    const sql = getSql();
    const rows = (await sql`
      SELECT queue_assignment_sound_enabled, queue_assignment_sound_url
      FROM public.ticket_agent_notification_settings
      WHERE id = 1
      LIMIT 1
    `) as { queue_assignment_sound_enabled?: boolean; queue_assignment_sound_url?: string }[];
    const row = rows[0];
    return NextResponse.json({
      success: true,
      data: {
        enabled: row?.queue_assignment_sound_enabled !== false,
        soundUrl: String(row?.queue_assignment_sound_url ?? DEFAULT_URL) || DEFAULT_URL,
      },
    });
  } catch (e) {
    console.error("[GET /api/tickets/queue-assignment-sound]", e);
    return NextResponse.json({
      success: true,
      data: { enabled: true, soundUrl: DEFAULT_URL },
    });
  }
}

export async function PATCH(request: NextRequest) {
  const auth = await requireTicketAccess(request);
  if ("error" in auth && auth.error) return auth.error;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON" }, { status: 400 });
  }

  const enabled =
    body.enabled !== undefined || body.queue_assignment_sound_enabled !== undefined
      ? Boolean(body.enabled ?? body.queue_assignment_sound_enabled)
      : undefined;
  const soundUrlRaw = body.soundUrl ?? body.queue_assignment_sound_url ?? body.sound_url;
  const soundUrl =
    soundUrlRaw !== undefined ? normalizeSoundUrl(soundUrlRaw === null || soundUrlRaw === "" ? DEFAULT_URL : soundUrlRaw) : undefined;
  if (soundUrlRaw !== undefined && soundUrl === null) {
    return NextResponse.json(
      { success: false, error: "Invalid sound URL (use a same-origin path ending in .wav, .mp3, .ogg, .mpeg, or .m4a)" },
      { status: 400 }
    );
  }

  try {
    const sql = getSql();
    if (enabled !== undefined && soundUrl !== undefined) {
      await sql`
        UPDATE public.ticket_agent_notification_settings
        SET queue_assignment_sound_enabled = ${enabled},
            queue_assignment_sound_url = ${soundUrl},
            updated_at = NOW()
        WHERE id = 1
      `;
    } else if (enabled !== undefined) {
      await sql`
        UPDATE public.ticket_agent_notification_settings
        SET queue_assignment_sound_enabled = ${enabled}, updated_at = NOW()
        WHERE id = 1
      `;
    } else if (soundUrl !== undefined) {
      await sql`
        UPDATE public.ticket_agent_notification_settings
        SET queue_assignment_sound_url = ${soundUrl}, updated_at = NOW()
        WHERE id = 1
      `;
    } else {
      return NextResponse.json({ success: false, error: "No changes (send enabled and/or soundUrl)" }, { status: 400 });
    }

    const rows = (await sql`
      SELECT queue_assignment_sound_enabled, queue_assignment_sound_url
      FROM public.ticket_agent_notification_settings WHERE id = 1 LIMIT 1
    `) as { queue_assignment_sound_enabled?: boolean; queue_assignment_sound_url?: string }[];
    const row = rows[0];
    return NextResponse.json({
      success: true,
      data: {
        enabled: row?.queue_assignment_sound_enabled !== false,
        soundUrl: String(row?.queue_assignment_sound_url ?? DEFAULT_URL),
      },
    });
  } catch (e) {
    console.error("[PATCH /api/tickets/queue-assignment-sound]", e);
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : "Update failed — run migration 0179_ticket_queue_assignment_browser_sound.sql" },
      { status: 503 }
    );
  }
}
