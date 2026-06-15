import type { OrderRecord } from "@/hooks/useOrders";
import { merchantBillPartsFromOrder } from "@/lib/resolveMerchantOrderTotal";

export type MerchantOrderCardBillLine = {
  key: string;
  label: string;
  amount: number;
  kind: "charge" | "tax" | "discount";
};

/** Compact bill rows for order cards — same rules as partnersite merchant bill. */
export function getMerchantOrderCardBillLines(order: OrderRecord): MerchantOrderCardBillLine[] {
  const bill = merchantBillPartsFromOrder(order);

  const lines: MerchantOrderCardBillLine[] = [
    { key: "subtotal", label: "Item subtotal", amount: bill.itemsSubtotal, kind: "charge" },
    {
      key: "packaging",
      label: "Restaurant packaging charges",
      amount: bill.packaging,
      kind: "charge",
    },
    { key: "taxes", label: "Taxes", amount: bill.taxes, kind: "tax" },
  ];

  if (bill.discount > 0.005) {
    lines.push({
      key: "store_offer",
      label: "Restaurant discount",
      amount: bill.discount,
      kind: "discount",
    });
  }

  return lines;
}
