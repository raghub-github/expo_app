import { Suspense } from "react";
import DashboardLayoutClient from "./DashboardLayoutClient";
import { GatiSpinner } from "@/components/ui/GatiSpinner";

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
    <Suspense fallback={<DashboardLayoutFallback />}>
      <DashboardLayoutClient>{children}</DashboardLayoutClient>
    </Suspense>
  );
}
