import DashboardLayoutClient from "./DashboardLayoutClient";

/** Force dynamic rendering so Home and Ticket detail (and all dashboard routes) always show latest UI — no cached HTML. */
export const dynamic = "force-dynamic";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <DashboardLayoutClient>{children}</DashboardLayoutClient>;
}
