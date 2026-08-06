"use client";

import { useEffect, useState } from "react";
import { mapCache } from "@/lib/map-cache";
import { resolveOrderTypeFromPublicId } from "@/lib/orders/resolve-order-type-from-public-id";
import OrderHeader from "./OrderHeader";
import OrderDetailClient from "./OrderDetailClient";
import PersonRideOrderDetailClient from "./person-ride/PersonRideOrderDetailClient";
import ParcelOrderDetailClient from "./parcel/ParcelOrderDetailClient";

interface OrderPageClientProps {
  orderPublicId: string;
}

/**
 * Independent order page: GatiMitra logo header + order body.
 * Viewport-locked shell so main/side columns can scroll (not the window).
 */
export default function OrderPageClient({ orderPublicId }: OrderPageClientProps) {
  const [orderLoading, setOrderLoading] = useState(true);
  const [orderNotFound, setOrderNotFound] = useState(false);
  const orderType = resolveOrderTypeFromPublicId(orderPublicId);
  const isPersonRide = orderType === "person_ride";
  const isParcel = orderType === "parcel";

  useEffect(() => {
    void mapCache.loadMapboxScript();
  }, []);

  if (isPersonRide) {
    return (
      <div className="flex h-dvh max-h-dvh flex-col overflow-hidden bg-[#FAFAFA]">
        {!orderNotFound && <OrderHeader forceSkeleton={orderLoading} />}
        <main
          className={
            orderNotFound
              ? "flex min-h-0 flex-1 flex-col overflow-y-auto"
              : "flex min-h-0 flex-1 flex-col overflow-y-auto px-3 py-3 sm:px-4 md:px-6 md:py-4 lg:overflow-hidden"
          }
        >
          <PersonRideOrderDetailClient
            orderPublicId={orderPublicId}
            onLoadingChange={setOrderLoading}
            onNotFoundChange={setOrderNotFound}
          />
        </main>
      </div>
    );
  }

  if (isParcel) {
    return (
      <div className="flex h-dvh max-h-dvh flex-col overflow-hidden bg-[#FAFAFA]">
        {!orderNotFound && <OrderHeader forceSkeleton={orderLoading} />}
        <main
          className={
            orderNotFound
              ? "flex min-h-0 flex-1 flex-col overflow-y-auto"
              : "flex min-h-0 flex-1 flex-col overflow-y-auto px-3 py-3 sm:px-4 md:px-6 md:py-4 lg:overflow-hidden"
          }
        >
          <ParcelOrderDetailClient
            orderPublicId={orderPublicId}
            onLoadingChange={setOrderLoading}
            onNotFoundChange={setOrderNotFound}
          />
        </main>
      </div>
    );
  }

  return (
    <div className="orders-typo flex h-dvh max-h-dvh flex-col overflow-hidden bg-[#F8FAFC]">
      {!orderNotFound && <OrderHeader forceSkeleton={orderLoading} />}
      <main
        className={
          orderNotFound
            ? "flex min-h-0 flex-1 flex-col overflow-y-auto"
            : "flex min-h-0 flex-1 flex-col overflow-y-auto px-3 py-3 sm:px-4 md:px-6 md:py-4 lg:overflow-hidden"
        }
      >
        <OrderDetailClient
          orderPublicId={orderPublicId}
          onLoadingChange={setOrderLoading}
          onNotFoundChange={setOrderNotFound}
        />
      </main>
    </div>
  );
}
