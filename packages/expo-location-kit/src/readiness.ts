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

/**
 * Read foreground location permission (get-only).
 * Does NOT show the OS dialog — callers that need to prompt must use their app's
 * single permission coordinator so watchers/Home never race a native prompt.
 */
export async function requestForegroundLocationPermission(): Promise<LocationPermissionStatus> {
  const current = await Location.getForegroundPermissionsAsync();
  if (current.status === "granted") return "granted";
  if (current.canAskAgain === false) return "denied";
  return current.status === "denied" ? "denied" : "undetermined";
}
