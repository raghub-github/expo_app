import type { ImageSourcePropType } from "react-native";
import { appAssetSource } from "@/components/AppAssetImage";
import { CX } from "@/lib/appAssetKeys";
import { resolveRideCatalogImageKey, resolveRideVehicleImage } from "@/lib/ride-order-display";
import { resolveRideImage } from "@/features/ride/rideOptionAssets";

/** Normalize booked ride catalog id / parcel category / imageKey for the dock thumb. */
export function resolveDockVehicleImageKey(raw: string | null | undefined): string {
  const v = (raw ?? "").trim().toLowerCase();
  if (!v) return "bike";
  if (v === "van" || v === "4_wheeler_non_ac" || v === "4_wheeler") return "van";
  if (v === "auto" || v === "3_wheeler") return "auto";
  if (v === "2_wheeler") return "bike";
  if (v === "travel") return "travel";
  return resolveRideCatalogImageKey(v);
}

/** Image for floating track card circle (bike / auto / van / cab…). */
export function resolveDockVehicleImage(raw: string | null | undefined): ImageSourcePropType | null {
  const key = resolveDockVehicleImageKey(raw);
  if (key === "van") {
    return (
      appAssetSource(CX.home.serviceParcel) ??
      resolveRideImage("cab") ??
      resolveRideVehicleImage("cab-economy")
    );
  }
  return resolveRideImage(key) ?? resolveRideVehicleImage(key);
}
