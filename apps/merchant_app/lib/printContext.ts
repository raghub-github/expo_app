import type { ChildStore } from "@/context/AuthContext";
import type { OutletInfo } from "@/services/outletApi";
import {
  formatKotRestaurantAddress,
  normalizeThermalPrinterWidthMm,
  type ThermalPrinterWidthMm,
} from "@gatimitra/kot-print";
import type { BillStoreInfo } from "@gatimitra/bill-print";
import type { KotPrintContext } from "@/lib/printKot";

export type MerchantPrintStoreContext = {
  storeName?: string | null;
  restaurantAddress?: string | null;
  printerWidthMm?: ThermalPrinterWidthMm | number | null;
  fullAddress?: string | null;
  city?: string | null;
  cuisineLabel?: string | null;
  fssaiNumber?: string | null;
};

export function buildKotPrintContext(
  ctx?: MerchantPrintStoreContext | null
): KotPrintContext {
  return {
    storeName: ctx?.storeName?.trim() || null,
    restaurantAddress: ctx?.restaurantAddress?.trim() || ctx?.fullAddress?.trim() || null,
    printerWidthMm: normalizeThermalPrinterWidthMm(ctx?.printerWidthMm ?? 80),
  };
}

export function buildBillStoreInfo(
  ctx?: MerchantPrintStoreContext | null
): BillStoreInfo | null {
  const storeName = ctx?.storeName?.trim();
  if (!storeName) return null;
  return {
    storeName,
    fullAddress: ctx?.fullAddress?.trim() || ctx?.restaurantAddress?.trim() || null,
    city: ctx?.city?.trim() || null,
    cuisineLabel: ctx?.cuisineLabel?.trim() || null,
    fssaiNumber: ctx?.fssaiNumber?.trim() || null,
  };
}

export function printContextFromSelectedStore(
  store: ChildStore | null | undefined,
  opts?: { printerWidthMm?: ThermalPrinterWidthMm | number | null; outlet?: OutletInfo | null }
): MerchantPrintStoreContext {
  const outlet = opts?.outlet;
  const address =
    outlet?.full_address?.trim() ||
    store?.full_address?.trim() ||
    null;
  const formattedAddress =
    outlet != null
      ? formatKotRestaurantAddress({
          fullAddress: outlet.full_address,
          landmark: outlet.landmark,
          city: outlet.city,
          state: outlet.state,
          postalCode: outlet.postal_code,
        })
      : address;

  return {
    storeName: outlet?.store_name ?? store?.store_name ?? null,
    restaurantAddress: formattedAddress || address,
    fullAddress: formattedAddress || address,
    city: outlet?.city ?? null,
    cuisineLabel:
      outlet?.cuisine_types?.length ? outlet.cuisine_types.slice(0, 3).join(", ") : null,
    printerWidthMm: opts?.printerWidthMm ?? 80,
  };
}
