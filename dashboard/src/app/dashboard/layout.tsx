import DashboardLayoutClient from "./DashboardLayoutClient";

/** Layout shell is static; individual pages opt into dynamic data via `cookies()` / server checks. Keeps client navigation from over-invalidating the whole dashboard. */
export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <DashboardLayoutClient>{children}</DashboardLayoutClient>;
}
