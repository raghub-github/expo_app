import { Suspense } from "react";
import AuthenticatedShell from "@/providers/AuthenticatedShell";
import DashboardLayoutClient from "./DashboardLayoutClient";
import { GatiSpinner } from "@/components/ui/GatiSpinner";

// Every page under /dashboard/* requires an authenticated session and calls
// Supabase server-side (`getRequiredSupabaseEnv()` throws when env is unset).
// Static prerender during `next build` has neither cookies nor the env at
// the right time — declare the whole segment dynamic so Next skips the SSG
// pass for these routes. Individual pages still control their own caching.
export const dynamic = "force-dynamic";

function DashboardLayoutFallback() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50" role="status" aria-live="polite">
      <GatiSpinner />
    </div>
  );
}

/** Layout shell is static; individual pages opt into dynamic data via `cookies()` / server checks. Keeps client navigation from over-invalidating the whole dashboard. */
export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AuthenticatedShell>
      <Suspense fallback={<DashboardLayoutFallback />}>
        <DashboardLayoutClient>{children}</DashboardLayoutClient>
      </Suspense>
    </AuthenticatedShell>
  );
}
