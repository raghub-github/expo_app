import type { ChildStore } from "@/context/AuthContext";
import type { OutletInfo } from "@/services/outletApi";
import { getConfig } from "@/config/env";
import { authFetch } from "@/services/authFetch";
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
  storeId?: number | null;
  authToken?: string | null;
};

function partnerBillAddress(outlet?: OutletInfo | null, fallbackAddress?: string | null): string | null {
  if (outlet) {
    const joined = [outlet.full_address, outlet.landmark, outlet.postal_code]
      .map((s) => (s ?? "").trim())
      .filter(Boolean)
      .join(", ");
    if (joined) return joined;
  }
  return fallbackAddress?.trim() || null;
}

export function buildKotPrintContext(
  ctx?: MerchantPrintStoreContext | null
): KotPrintContext {
  return {
    storeName: ctx?.storeName?.trim() || null,
    restaurantAddress: ctx?.restaurantAddress?.trim() || ctx?.fullAddress?.trim() || null,
    printerWidthMm: normalizeThermalPrinterWidthMm(ctx?.printerWidthMm ?? 80),
    storeId: ctx?.storeId ?? null,
    authToken: ctx?.authToken ?? null,
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

export async function fetchStoreFssaiNumber(
  storePublicId: string,
  token: string
): Promise<string | null> {
  const base = getConfig().apiBaseUrl.replace(/\/+$/, "");
  const res = await authFetch(
    `${base}/v1/merchants/${encodeURIComponent(storePublicId)}/about`,
    token
  );
  if (!res.ok) return null;
  const data = (await res.json()) as { fssai_number?: string | null };
  return data.fssai_number?.trim() || null;
}

export function printContextFromSelectedStore(
  store: ChildStore | null | undefined,
  opts?: {
    printerWidthMm?: ThermalPrinterWidthMm | number | null;
    outlet?: OutletInfo | null;
    fssaiNumber?: string | null;
    authToken?: string | null;
  }
): MerchantPrintStoreContext {
  const outlet = opts?.outlet;
  const fallbackAddress = outlet?.full_address?.trim() || store?.full_address?.trim() || null;
  const formattedKotAddress =
    outlet != null
      ? formatKotRestaurantAddress({
          fullAddress: outlet.full_address,
          landmark: outlet.landmark,
          city: outlet.city,
          state: outlet.state,
          postalCode: outlet.postal_code,
        })
      : fallbackAddress;
  const billAddress = partnerBillAddress(outlet, fallbackAddress);

  return {
    storeName: outlet?.store_name ?? store?.store_name ?? null,
    restaurantAddress: formattedKotAddress || billAddress,
    fullAddress: billAddress || formattedKotAddress || fallbackAddress,
    city: outlet?.city ?? null,
    cuisineLabel: outlet?.cuisine_types?.[0] ?? null,
    fssaiNumber: opts?.fssaiNumber ?? null,
    printerWidthMm: opts?.printerWidthMm ?? 80,
    storeId: store?.id != null ? Number(store.id) : null,
    authToken: opts?.authToken ?? null,
  };
}
