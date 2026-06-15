import { useEffect, useMemo, useRef } from "react";
import type { OrderDetail } from "@/services/order.service";

function normalizeInstructionList(list: string[] | null | undefined): string[] {
  return (list ?? []).map((item) => String(item ?? "").trim()).filter(Boolean);
}

/** Keep last known non-empty instruction lists during partial order cache / refetch. */
export function useStableOrderInstructionLists(order: OrderDetail) {
  const deliveryRef = useRef<string[]>(normalizeInstructionList(order.deliveryInstructionsList));
  const merchantRef = useRef<string[]>(normalizeInstructionList(order.merchantInstructionsList));

  useEffect(() => {
    deliveryRef.current = normalizeInstructionList(order.deliveryInstructionsList);
    merchantRef.current = normalizeInstructionList(order.merchantInstructionsList);
  }, [order.orderId]);

  const deliveryInstructionsList = useMemo(() => {
    const next = normalizeInstructionList(order.deliveryInstructionsList);
    if (next.length > 0) {
      deliveryRef.current = next;
      return next;
    }
    return deliveryRef.current;
  }, [order.deliveryInstructionsList]);

  const merchantInstructionsList = useMemo(() => {
    const next = normalizeInstructionList(order.merchantInstructionsList);
    if (next.length > 0) {
      merchantRef.current = next;
      return next;
    }
    return merchantRef.current;
  }, [order.merchantInstructionsList]);

  return { deliveryInstructionsList, merchantInstructionsList };
}
