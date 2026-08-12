export const dynamic = "force-dynamic";

/**
 * Standalone order detail segment — logo header + no dashboard left sidebar.
 * Auth/bootstrap lives in ControlAppShell for both `/dashboard/*` and `/order/*`
 * so cross-navigation does not remount AuthProvider.
 */
export default function OrderLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
