import * as Location from "expo-location";
import type { DeviceLocationReadiness, LocationPermissionStatus } from "./types";

/** App foreground permission + device GPS/location toggle. */
export async function getDeviceLocationReadiness(): Promise<DeviceLocationReadiness> {
  const [{ status }, servicesEnabled] = await Promise.all([
    Location.getForegroundPermissionsAsync(),
    Location.hasServicesEnabledAsync(),
  ]);
  const permissionStatus: LocationPermissionStatus =
    status === "granted" ? "granted" : status === "denied" ? "denied" : "undetermined";
  return {
    permissionStatus,
    servicesEnabled,
    isReady: permissionStatus === "granted" && servicesEnabled,
  };
}

/** Request foreground location permission when askable. */
export async function requestForegroundLocationPermission(): Promise<LocationPermissionStatus> {
  const current = await Location.getForegroundPermissionsAsync();
  if (current.status === "granted") return "granted";
  if (current.canAskAgain === false) return "denied";
  const next = await Location.requestForegroundPermissionsAsync();
  return next.status === "granted" ? "granted" : next.status === "denied" ? "denied" : "undetermined";
}
