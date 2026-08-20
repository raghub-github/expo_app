"use client";

import { useEffect, useState } from "react";
import { mapCache } from "@/lib/map-cache";
import { resolveOrderTypeFromPublicId } from "@/lib/orders/resolve-order-type-from-public-id";
import OrderHeader from "./OrderHeader";
import OrderDetailClient from "./OrderDetailClient";
import PersonRideOrderDetailClient from "./person-ride/PersonRideOrderDetailClient";
import ParcelOrderDetailClient from "./parcel/ParcelOrderDetailClient";

const ORDER_PAGE_SHELL =
  "orders-typo flex h-dvh max-h-dvh flex-col overflow-hidden overscroll-none";
const ORDER_PAGE_MAIN =
  "flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-none px-3 pb-3 pt-2 sm:px-4 sm:pb-4 md:px-6 lg:overflow-hidden";
const ORDER_PAGE_MAIN_NOT_FOUND = "flex min-h-0 flex-1 flex-col overflow-y-auto";

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

  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    const prev = {
      htmlOverflow: html.style.overflow,
      bodyOverflow: body.style.overflow,
      htmlOverscroll: html.style.overscrollBehavior,
      bodyOverscroll: body.style.overscrollBehavior,
      htmlHeight: html.style.height,
      bodyHeight: body.style.height,
    };
    html.style.overflow = "hidden";
    body.style.overflow = "hidden";
    html.style.overscrollBehavior = "none";
    body.style.overscrollBehavior = "none";
    html.style.height = "100dvh";
    body.style.height = "100dvh";
    return () => {
      html.style.overflow = prev.htmlOverflow;
      body.style.overflow = prev.bodyOverflow;
      html.style.overscrollBehavior = prev.htmlOverscroll;
      body.style.overscrollBehavior = prev.bodyOverscroll;
      html.style.height = prev.htmlHeight;
      body.style.height = prev.bodyHeight;
    };
  }, []);

  if (isPersonRide) {
    return (
      <div className={`${ORDER_PAGE_SHELL} bg-[#FAFAFA]`}>
        {!orderNotFound && <OrderHeader forceSkeleton={orderLoading} />}
        <main className={orderNotFound ? ORDER_PAGE_MAIN_NOT_FOUND : ORDER_PAGE_MAIN}>
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
      <div className={`${ORDER_PAGE_SHELL} bg-[#FAFAFA]`}>
        {!orderNotFound && <OrderHeader forceSkeleton={orderLoading} />}
        <main className={orderNotFound ? ORDER_PAGE_MAIN_NOT_FOUND : ORDER_PAGE_MAIN}>
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
    <div className={`${ORDER_PAGE_SHELL} bg-[#F8FAFC]`}>
      {!orderNotFound && <OrderHeader forceSkeleton={orderLoading} />}
      <main className={orderNotFound ? ORDER_PAGE_MAIN_NOT_FOUND : ORDER_PAGE_MAIN}>
        <OrderDetailClient
          orderPublicId={orderPublicId}
          onLoadingChange={setOrderLoading}
          onNotFoundChange={setOrderNotFound}
        />
      </main>
    </div>
  );
}
