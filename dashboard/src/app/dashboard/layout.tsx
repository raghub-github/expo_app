// Authenticated chrome (AuthProvider + HierarchicalSidebar + Header) lives in
// root `ControlAppShell` for `/dashboard/*` only. Standalone `/order/*` uses
// its own layout shell (logo header, no left sidebar).

// Every page under /dashboard/* requires an authenticated session and calls
// Supabase server-side (`getRequiredSupabaseEnv()` throws when env is unset).
// Static prerender during `next build` has neither cookies nor the env at
// the right time — declare the whole segment dynamic so Next skips the SSG
// pass for these routes. Individual pages still control their own caching.
export const dynamic = "force-dynamic";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
