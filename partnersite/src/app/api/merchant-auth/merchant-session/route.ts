import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { isFatalRefreshTokenError, isNetworkOrTransientError, isRefreshTokenAlreadyUsed } from "@/lib/auth/session-errors";
import { validateMerchantFromSession } from "@/lib/auth/validate-merchant";
import { toStoredDocumentUrl } from "@/lib/r2";
import {
  getSessionMetadata,
  checkSessionValidity,
  formatTimeRemaining,
  initializeSession,
} from "@/lib/auth/session-manager";
import { cookies } from "next/headers";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder.supabase.co";
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "placeholder-service-role-key";

function getSupabaseAdmin() {
  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

const maxGetUserAttempts = 3;
const retryDelaysMs = [800, 1600];

/** GET /api/merchant-auth/merchant-session — Supabase-based merchant session. */
export async function GET() {
  try {
    const supabase = await createServerSupabaseClient();
    let user: {
      id: string;
      email?: string;
      phone?: string;
      name?: string;
      avatar_url?: string;
    } | null = null;
    let userError: unknown = null;

    for (let attempt = 1; attempt <= maxGetUserAttempts; attempt++) {
      const result = await supabase.auth.getUser();
      const u = result.data?.user;
      const meta = (u?.user_metadata ?? {}) as Record<string, unknown>;
      const avatarRaw = meta.avatar_url ?? meta.picture;
      const nameRaw = meta.full_name ?? meta.name;
      user = u
        ? {
            id: u.id,
            email: u.email ?? undefined,
            phone: u.phone ?? undefined,
            name: typeof nameRaw === 'string' && nameRaw.trim() ? nameRaw.trim() : undefined,
            avatar_url:
              typeof avatarRaw === 'string' && avatarRaw.trim() ? avatarRaw.trim() : undefined,
          }
        : null;
      userError = result.error ?? null;
      if (!userError && user) break;
      if (userError && isRefreshTokenAlreadyUsed(userError)) {
        // Race: wait briefly and retry once so we can pick up rotated cookies if available.
        if (attempt < maxGetUserAttempts) {
          await new Promise((r) => setTimeout(r, retryDelaysMs[attempt - 1] ?? 1000));
          continue;
        }
        break;
      }
      if (userError && isFatalRefreshTokenError(userError)) break;
      if (userError && isNetworkOrTransientError(userError)) break;
      if (userError && attempt < maxGetUserAttempts) {
        await new Promise((r) => setTimeout(r, retryDelaysMs[attempt - 1] ?? 1000));
        continue;
      }
      if (!user && !userError && attempt < maxGetUserAttempts) {
        await new Promise((r) => setTimeout(r, 400));
        continue;
      }
      break;
    }

    if (userError || !user) {
      if (userError && isRefreshTokenAlreadyUsed(userError)) {
        return NextResponse.json(
          { success: false, error: "Service temporarily unavailable", code: "SERVICE_UNAVAILABLE" },
          { status: 503 }
        );
      }
      if (userError && isFatalRefreshTokenError(userError)) {
        // Clear cookies only via client logout path — do not revoke refresh globally here.
        return NextResponse.json(
          { success: false, error: "Session invalid", code: "SESSION_INVALID" },
          { status: 401 }
        );
      }
      if (userError && isNetworkOrTransientError(userError)) {
        return NextResponse.json(
          { success: false, error: "Service temporarily unavailable", code: "SERVICE_UNAVAILABLE" },
          { status: 503 }
        );
      }
      return NextResponse.json(
        { success: false, error: "Not authenticated", code: "SESSION_REQUIRED" },
        { status: 200 }
      );
    }

    // getUser() already validates/refreshes — do not call getSession() (second refresh race).

    const validation = await validateMerchantFromSession({
      id: user.id,
      email: user.email ?? null,
      phone: user.phone ?? null,
    });

    let parentStoreLogo: string | null = null;
    let parentOwnerName: string | null = null;
    if (validation.merchantParentId != null) {
      try {
        const db = getSupabaseAdmin();
        const { data: parentRow } = await db
          .from("merchant_parents")
          .select("store_logo, owner_name")
          .eq("id", validation.merchantParentId)
          .maybeSingle();
        parentOwnerName =
          typeof parentRow?.owner_name === "string" && parentRow.owner_name.trim()
            ? parentRow.owner_name.trim()
            : null;

        const raw = typeof parentRow?.store_logo === "string" ? parentRow.store_logo.trim() : "";
        if (raw) {
          parentStoreLogo = toStoredDocumentUrl(raw) ?? raw;
        }
      } catch {
        parentStoreLogo = null;
        parentOwnerName = null;
      }
    }

    // Ensure UI always shows owner name from merchant_parents (not OAuth profile name).
    if (parentOwnerName) {
      user = { ...user, name: parentOwnerName };
    }

    const parent = validation.isValid
      ? {
          id: validation.merchantParentId,
          parent_merchant_id: validation.parentMerchantId,
          approval_status: validation.approvalStatus ?? undefined,
          registration_status: validation.registrationStatus ?? undefined,
          is_active: validation.isActive,
          can_register_child: true,
          store_logo: parentStoreLogo,
        }
      : {
          id: validation.merchantParentId,
          parent_merchant_id: validation.parentMerchantId,
          approval_status: validation.approvalStatus ?? undefined,
          registration_status: validation.registrationStatus ?? undefined,
          is_active: validation.isActive,
          can_register_child: false,
          block_message: validation.error ?? "Account restricted.",
          store_logo: parentStoreLogo,
        };

    // Partner_* sliding cookies: restore if missing/stale while Supabase session is valid.
    const cookieStore = await cookies();
    const cookieReader = { get: (name: string) => cookieStore.get(name) };
    let metadata = getSessionMetadata(cookieReader);
    const validity = checkSessionValidity(metadata);
    if (!metadata || !validity.isValid) {
      metadata = initializeSession({
        set: (name, value, options) => {
          try {
            cookieStore.set(name, value, options as Parameters<typeof cookieStore.set>[2]);
          } catch {
            /* ignore — middleware will re-init on next navigation */
          }
        },
      });
    }
    const freshValidity = checkSessionValidity(metadata);

    return NextResponse.json({
      success: true,
      authenticated: true,
      expired: false,
      data: {
        user: {
          id: user.id,
          email: user.email,
          phone: user.phone,
          name: user.name,
          avatar_url: user.avatar_url,
        },
        parent: validation.merchantParentId != null ? parent : null,
      },
      session: {
        email: user.email,
        userId: user.id,
        sessionId: metadata?.sessionId,
        timeRemaining: freshValidity.timeRemaining,
        timeRemainingFormatted: freshValidity.timeRemaining
          ? formatTimeRemaining(freshValidity.timeRemaining)
          : "Expired",
        daysRemaining: freshValidity.daysRemaining,
        sessionStartTime: metadata?.sessionStartTime,
        lastActivityTime: metadata?.lastActivityTime,
      },
    });
  } catch (error) {
    if (isNetworkOrTransientError(error)) {
      return NextResponse.json(
        { success: false, error: "Service temporarily unavailable", code: "SERVICE_UNAVAILABLE" },
        { status: 503 }
      );
    }
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
