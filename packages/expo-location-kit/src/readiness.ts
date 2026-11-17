import * as Location from "expo-location";
import { withTimeout } from "./coords";
import type { DeviceLocationReadiness, LocationPermissionStatus } from "./types";

const READINESS_TTL_MS = 5_000;
const PERM_CHECK_MS = 300;
const SERVICES_CHECK_MS = 400;
let readinessCache: { at: number; value: DeviceLocationReadiness } | null = null;

function mapPermissionStatus(status: string): LocationPermissionStatus {
  return status === "granted" ? "granted" : status === "denied" ? "denied" : "undetermined";
}

/** Drop cached permission/services state after OS dialogs or Settings returns. */
export function invalidateDeviceLocationReadiness(): void {
  readinessCache = null;
}

/**
 * App foreground permission + device GPS/location toggle.
 * `force: true` skips the short TTL cache (use after Enable / Settings).
 */
export async function getDeviceLocationReadiness(options?: {
  force?: boolean;
}): Promise<DeviceLocationReadiness> {
  if (!options?.force && readinessCache && Date.now() - readinessCache.at < READINESS_TTL_MS) {
    return readinessCache.value;
  }
  let permissionStatus: LocationPermissionStatus =
    readinessCache?.value.permissionStatus ?? "undetermined";
  try {
    const perm = await withTimeout(Location.getForegroundPermissionsAsync(), PERM_CHECK_MS);
    permissionStatus = mapPermissionStatus(perm.status);
  } catch {
    // Expo Go / bridge can stall — keep last known status rather than hanging callers.
  }
  let servicesEnabled = readinessCache?.value.servicesEnabled ?? permissionStatus === "granted";
  try {
    servicesEnabled = await withTimeout(Location.hasServicesEnabledAsync(), SERVICES_CHECK_MS);
  } catch {
    // Android can stall here — reuse last known / assume on if permission is granted.
  }
  const value: DeviceLocationReadiness = {
    permissionStatus,
    servicesEnabled,
    isReady: permissionStatus === "granted" && servicesEnabled,
  };
  readinessCache = { at: Date.now(), value };
  return value;
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
