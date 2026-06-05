"use client";

import { usePathname } from "next/navigation";
import { usePageVisible } from "@/hooks/usePageVisible";

const FOOD_ORDERS_PATH = "/dashboard/orders/food";

/** True only on the food orders list route while the tab is visible. */
export function useFoodOrdersListActive(): boolean {
  const pathname = usePathname() ?? "";
  const clean = pathname.split("?")[0].split("#")[0];
  const pageVisible = usePageVisible();
  return clean === FOOD_ORDERS_PATH && pageVisible;
}
