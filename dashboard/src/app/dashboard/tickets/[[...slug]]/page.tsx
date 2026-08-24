import { redirect } from "next/navigation";
import { requireSuperAdminAccess, checkDashboardAccess } from "@/lib/permissions/page-protection";
import { resolveSupabaseUser } from "@/lib/auth/resolve-supabase-user";
import {
  isNetworkOrTransientError,
  isRefreshTokenAlreadyUsed,
  isTimeoutOrAbortError,
} from "@/lib/auth/session-errors";
import { TicketsWorkspaceClient } from "@/components/tickets/TicketsWorkspaceClient";

export const dynamic = "force-dynamic";

function isTransientAuthBlip(error: unknown): boolean {
  return (
    isTimeoutOrAbortError(error) ||
    isNetworkOrTransientError(error) ||
    isRefreshTokenAlreadyUsed(error)
  );
}

/**
 * List ↔ detail share this RSC. After idle, Supabase Auth often AbortError /
 * ConnectTimeout on getUser(); treating that as hard deny + redirect felt like
 * a dashboard crash when clicking "All". Soft-pass Auth blips and still render.
 */
export default async function TicketsPage() {
  try {
    const hasTicketAccess = await checkDashboardAccess("TICKET");
    if (hasTicketAccess) {
      return <TicketsWorkspaceClient />;
    }

    const { user, error } = await resolveSupabaseUser({ maxAttempts: 1, retryDelayMs: 0 });
    if (!user?.id) {
      if (error && isTransientAuthBlip(error)) {
        return <TicketsWorkspaceClient />;
      }
      redirect("/login");
    }

    await requireSuperAdminAccess();
    return <TicketsWorkspaceClient />;
  } catch (err) {
    if (isTransientAuthBlip(err)) {
      return <TicketsWorkspaceClient />;
    }
    throw err;
  }
}
