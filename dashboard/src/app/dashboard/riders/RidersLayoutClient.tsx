"use client";

import { RiderDashboardProvider } from "@/context/RiderDashboardContext";

/**
 * Client wrapper for riders layout. Access is enforced by the server layout.
 */
export function RidersLayoutClient({
  children,
}: {
  children: React.ReactNode;
}) {
  return <RiderDashboardProvider>{children}</RiderDashboardProvider>;
}
