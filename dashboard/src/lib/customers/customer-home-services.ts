/**
 * Customer app home page services — single source for dashboard block UI labels.
 * IDs match apps/customer_app/components/home/HomeServicesRow.tsx
 */

import type { CustomerServiceType } from "@/lib/db/operations/customer-service-blocks";

export type CustomerHomeServiceOption = {
  /** Home page card id (customer app) */
  homeId: string;
  /** DB enum value */
  serviceType: CustomerServiceType;
  label: string;
  pill?: string;
};

/** All six service cards shown on the customer app home screen. */
export const CUSTOMER_HOME_SERVICES: CustomerHomeServiceOption[] = [
  { homeId: "food", serviceType: "food", label: "Order Food", pill: "Fresh & Fast Delivery" },
  { homeId: "ride", serviceType: "person_ride", label: "Book a Ride", pill: "Going Out" },
  { homeId: "parcels", serviceType: "parcel", label: "Courier Service", pill: "Send Parcels" },
  { homeId: "ecom", serviceType: "ecommerce", label: "E-Commerce", pill: "Elect & Ecom" },
  { homeId: "vouchers", serviceType: "vouchers", label: "Online Vouchers", pill: "Offers" },
  { homeId: "near-me", serviceType: "near_me", label: "Explore Nearby", pill: "Near Me" },
];

export function customerServiceLabel(serviceType: CustomerServiceType): string {
  const match = CUSTOMER_HOME_SERVICES.find((s) => s.serviceType === serviceType);
  if (match) return match.label;
  return serviceType.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function formatBlockTimestamp(iso: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
