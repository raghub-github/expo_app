import AuthenticatedShell from "@/providers/AuthenticatedShell";
import DashboardLayoutClient from "./DashboardLayoutClient";

// Every page under /dashboard/* requires an authenticated session and calls
// Supabase server-side (`getRequiredSupabaseEnv()` throws when env is unset).
// Static prerender during `next build` has neither cookies nor the env at
// the right time — declare the whole segment dynamic so Next skips the SSG
// pass for these routes. Individual pages still control their own caching.
export const dynamic = "force-dynamic";

/** Layout shell is static; individual pages opt into dynamic data via `cookies()` / server checks. Keeps client navigation from over-invalidating the whole dashboard. */
export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AuthenticatedShell>
      <DashboardLayoutClient>{children}</DashboardLayoutClient>
    </AuthenticatedShell>
  );
}
