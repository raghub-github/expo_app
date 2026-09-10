import { api } from "@/services/api";

/** Schedule Zomato-style abandoned-cart push (backend delay + template). */
export async function scheduleAbandonedCartReminder(args: {
  storeId: string;
  storeName: string;
}): Promise<void> {
  await api.post("/v1/me/abandoned-cart/schedule", {
    store_id: args.storeId,
    store_name: args.storeName,
  });
}

/** Cancel pending abandoned-cart push (foreground / clear cart / order placed). */
export async function cancelAbandonedCartReminder(): Promise<void> {
  await api.post("/v1/me/abandoned-cart/cancel");
}
