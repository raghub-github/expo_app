import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { isNetworkOrTransientError } from "@/lib/auth/session-errors";
import { validateMerchantFromSession } from "@/lib/auth/validate-merchant";
import {
  partnerMissingUserStatus,
  requestHasPartnerAuthCookies,
  resolvePartnerUser,
} from "@/lib/auth/resolve-partner-user";
import { toStoredDocumentUrl } from "@/lib/r2";
import {
  getSessionMetadata,
  checkSessionValidity,
  formatTimeRemaining,
  initializeSession,
} from "@/lib/auth/session-manager";
import { cookies } from "next/headers";
import { createFetchWithTimeout, runWithQuietAuthTimeoutErrors } from "@/lib/auth/fetch-with-timeout";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder.supabase.co";
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "placeholder-service-role-key";

const adminFetch = createFetchWithTimeout(5_000);

function getSupabaseAdmin() {
  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { fetch: adminFetch },
  });
}

/** GET /api/merchant-auth/merchant-session — cookie-first merchant session. */
export async function GET(req: NextRequest) {
  return runWithQuietAuthTimeoutErrors(async () => {
  try {
    const resolved = await resolvePartnerUser({
      cookieReader: {
        get: (name) => req.cookies.get(name),
        getAll: () => req.cookies.getAll(),
      },
      cookieHeader: req.headers.get("cookie"),
    });
    let user = resolved.user
      ? {
          id: resolved.user.id,
          email: resolved.user.email ?? undefined,
          phone: resolved.user.phone ?? undefined,
          name: undefined as string | undefined,
          avatar_url: undefined as string | undefined,
        }
      : null;
    const userError = resolved.error;

    if (userError || !user) {
      const mapped = partnerMissingUserStatus(requestHasPartnerAuthCookies(req), userError);
      return NextResponse.json(
        { success: false, error: mapped.error, code: mapped.code },
        { status: mapped.status === 503 ? 503 : mapped.code === "SESSION_INVALID" ? 401 : 200 }
      );
    }

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
  });
}
