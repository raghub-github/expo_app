import type { OrderDetail } from "@/services/order.service";

export type OrderDeliveryDetailsView = {
  contactTitle: string | null;
  contactSubtitle: string | null;
  addressTitle: string | null;
  addressLine: string | null;
  instructionItems: string[];
  bannerText?: string | null;
  addressIcon?: "location" | "store";
  addressAction?: "edit" | "directions";
};

export function maskPhone(phone: string) {
  const digits = phone.replace(/\D/g, "");
  if (digits.length <= 4) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 2)}XXXX`;
  return `${digits.slice(0, 6)}XXXX`;
}

function contactTitleFromOrder(order: OrderDetail): string | null {
  const contactName = order.deliveryContactName?.trim() || null;
  const contactPhone = order.deliveryContactPhone?.trim() || null;
  if (contactName && contactPhone) return `${contactName}, ${maskPhone(contactPhone)}`;
  return contactName ?? (contactPhone ? maskPhone(contactPhone) : null);
}

export function buildOrderDeliveryDetailsView(order: OrderDetail): OrderDeliveryDetailsView {
  const contactTitle = contactTitleFromOrder(order);
  const addressLabel = order.deliveryAddressLabel?.trim() || null;
  const addressLine = order.deliveryAddress?.trim() || null;
  const addressTitle = addressLabel ? `Delivery at ${addressLabel}` : null;

  const instructionItems = (order.deliveryInstructionsList ?? [])
    .map((item) => String(item ?? "").trim())
    .filter(Boolean);

  return {
    contactTitle,
    contactSubtitle: contactTitle ? "Delivery partner may call this number" : null,
    addressTitle,
    addressLine,
    instructionItems,
  };
}

export function buildOrderSelfPickupDetailsView(order: OrderDetail): OrderDeliveryDetailsView {
  const contactTitle = contactTitleFromOrder(order);
  const restaurantName = order.merchantPublicName ?? order.merchantName ?? "Restaurant";
  const addressLine = order.merchantAddress?.trim() || order.deliveryAddress?.trim() || null;

  return {
    contactTitle,
    contactSubtitle: contactTitle ? "Restaurant may call this number" : null,
    addressTitle: `Self-Pick-Up at ${restaurantName}`,
    addressLine,
    instructionItems: [],
    bannerText: "All your Self-Pick-Up details in one place 👇",
    addressIcon: "store",
    addressAction: "directions",
  };
}
