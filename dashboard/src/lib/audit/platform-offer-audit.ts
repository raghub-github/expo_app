/**
 * Super-admin audit helper for platform offer + geo-binding mutations.
 * Uses action_audit_log via existing logger (never throws into request path).
 */

import { NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  getIpAddress,
  getUserAgent,
  logFailedAction,
  logSuccessAction,
} from "@/lib/audit/logger";
import type { ActionType } from "@/lib/db/schema";

export async function auditPlatformOfferMutation(
  req: NextRequest,
  actionType: ActionType,
  opts: {
    resourceType: "platform_offer" | "geo_platform_offer_binding";
    resourceId: string;
    actionDetails?: Record<string, unknown>;
    previousValues?: Record<string, unknown> | null;
    newValues?: Record<string, unknown> | null;
    failed?: boolean;
    errorMessage?: string;
  }
): Promise<void> {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user?.id || !user.email) return;

    const common = {
      resourceType: opts.resourceType,
      resourceId: opts.resourceId,
      actionDetails: opts.actionDetails,
      previousValues: opts.previousValues ?? undefined,
      newValues: opts.newValues ?? undefined,
      ipAddress: getIpAddress(req),
      userAgent: getUserAgent(req),
      requestPath: req.nextUrl.pathname,
      requestMethod: req.method,
    };

    if (opts.failed) {
      await logFailedAction(
        user.id,
        user.email,
        "SYSTEM",
        actionType,
        opts.errorMessage ?? "failed",
        common
      );
      return;
    }

    await logSuccessAction(user.id, user.email, "SYSTEM", actionType, common);
  } catch (err) {
    console.error("[auditPlatformOfferMutation]", err);
  }
}
