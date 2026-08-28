import { CX } from "@/lib/appAssetKeys";

export type CustomerHomeServiceId =
  | "food"
  | "ride"
  | "parcels"
  | "grocery"
  | "ecom"
  | "vouchers"
  | "near-me";

export type CustomerHomeServiceMeta = {
  label: string;
  assetKey: string;
};

export const CUSTOMER_HOME_SERVICE_META: Record<CustomerHomeServiceId, CustomerHomeServiceMeta> = {
  food: { label: "Order Food", assetKey: CX.home.serviceFood },
  ride: { label: "Book a Ride", assetKey: CX.home.serviceRide },
  parcels: { label: "Courier Service", assetKey: CX.home.serviceParcel },
  grocery: { label: "Grocery", assetKey: CX.home.serviceVoucher },
  ecom: { label: "E-Commerce", assetKey: CX.home.serviceEcommerce },
  vouchers: { label: "Online Vouchers", assetKey: CX.home.serviceVoucher },
  "near-me": { label: "Explore Nearby", assetKey: CX.home.serviceLocation },
};

export function gateServiceToHomeId(
  gate: "food" | "ride" | "parcel" | "grocery" | "ecom" | "vouchers" | "near-me"
): CustomerHomeServiceId {
  if (gate === "parcel") return "parcels";
  return gate;
}
