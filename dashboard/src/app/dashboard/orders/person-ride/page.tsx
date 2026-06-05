import { Suspense } from "react";
import { requireDashboardAccess } from "@/lib/permissions/page-protection";
import PersonRideOrdersClient from "./PersonRideOrdersClient";

export default async function PersonRideOrdersPage() {
  await requireDashboardAccess("ORDER_PERSON_RIDE");

  return (
    <Suspense
      fallback={
        <div className="rounded-lg border border-gray-200 bg-white p-6 text-gray-500">
          Loading person ride orders…
        </div>
      }
    >
      <PersonRideOrdersClient />
    </Suspense>
  );
}
