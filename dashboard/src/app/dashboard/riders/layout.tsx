import { requireDashboardAccess } from "@/lib/permissions/page-protection";
import { RidersLayoutClient } from "./RidersLayoutClient";

/**
 * Rider dashboard layout: enforces RIDER access once for all child routes,
 * then provides shared rider context so rider data persists when navigating
 * between Rider Information, Penalties, Orders, Withdrawals, Wallet, etc.
 */
export default async function RidersLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireDashboardAccess("RIDER");
  return <RidersLayoutClient>{children}</RidersLayoutClient>;
}
