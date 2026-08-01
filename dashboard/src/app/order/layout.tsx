import AuthenticatedShell from "@/providers/AuthenticatedShell";

export const dynamic = "force-dynamic";

/**
 * Standalone order detail shell — logo header + no dashboard left sidebar.
 * Auth/bootstrap is local to `/order/*` (not ControlAppShell).
 */
export default function OrderLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AuthenticatedShell>{children}</AuthenticatedShell>;
}
