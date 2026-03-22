import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getSystemUserByEmail } from "@/lib/db/operations/users";
import { getUserAvatarUrl } from "@/lib/user-avatar";
import {
  finalizeOrphanOfflineOpenRows,
  getActiveWorkSession,
  getLatestClosedUserSession,
  setUserLiveStatus,
  sumTodayWorkSeconds,
  type UserLiveStatus,
} from "@/lib/db/operations/user-sessions";

export const runtime = "nodejs";

const LIVE: UserLiveStatus[] = ["online", "offline", "break", "emergency"];

function isLiveStatus(v: unknown): v is UserLiveStatus {
  return typeof v === "string" && (LIVE as string[]).includes(v);
}

export async function GET(_req: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user || !user.email) {
      return NextResponse.json({ success: false, error: "Not authenticated" }, { status: 401 });
    }

    const systemUser = await getSystemUserByEmail(user.email);
    if (!systemUser) {
      return NextResponse.json({ success: false, error: "User not found in system_users" }, { status: 404 });
    }

    const userMetadata = (user.user_metadata || {}) as Record<string, unknown>;
    const avatarUrl = getUserAvatarUrl(user.email, userMetadata, 64);

    await finalizeOrphanOfflineOpenRows(systemUser.id);

    const work = await getActiveWorkSession(systemUser.id);
    const latestClosed = await getLatestClosedUserSession(systemUser.id);
    const todayWorkSeconds = await sumTodayWorkSeconds(systemUser.id);

    const status: UserLiveStatus = work ? (work.currentStatus as UserLiveStatus) : "offline";

    const loginIso = work
      ? new Date(work.loginTime).toISOString()
      : latestClosed?.loginTime
        ? new Date(latestClosed.loginTime).toISOString()
        : null;
    const logoutIso =
      work || !latestClosed?.logoutTime ? null : new Date(latestClosed.logoutTime).toISOString();
    const offlineIso =
      work || !latestClosed?.offlineAt ? null : new Date(latestClosed.offlineAt).toISOString();

    const data = {
      userId: systemUser.id,
      systemUserId: systemUser.systemUserId,
      fullName: systemUser.fullName,
      email: systemUser.email,
      avatarUrl,
      status,
      sessionId: work?.id ?? null,
      loginTime: loginIso,
      logoutTime: logoutIso,
      offlineAt: offlineIso,
      todayWorkSeconds,
      todayOrderCount: 0,
    };

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("[GET /api/profile/status] Error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error in profile status",
      },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user || !user.email) {
      return NextResponse.json({ success: false, error: "Not authenticated" }, { status: 401 });
    }

    const systemUser = await getSystemUserByEmail(user.email);
    if (!systemUser) {
      return NextResponse.json({ success: false, error: "User not found in system_users" }, { status: 404 });
    }

    const body = (await req.json().catch(() => ({}))) as { status?: unknown };
    if (!isLiveStatus(body.status)) {
      return NextResponse.json(
        { success: false, error: "Invalid status; use online, offline, break, or emergency" },
        { status: 400 }
      );
    }

    try {
      await setUserLiveStatus(systemUser.id, body.status);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Status update failed";
      return NextResponse.json({ success: false, error: msg }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[PATCH /api/profile/status] Error:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
