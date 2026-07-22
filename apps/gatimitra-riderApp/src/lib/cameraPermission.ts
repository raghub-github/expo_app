import { Camera } from "expo-camera";

export type CameraPermissionSnapshot = {
  granted: boolean;
  canAskAgain: boolean;
};

/** Authoritative read — always fresh from the OS, not hook cache. */
export async function readCameraPermission(): Promise<CameraPermissionSnapshot> {
  const result = await Camera.getCameraPermissionsAsync();
  return {
    granted: result.granted === true,
    canAskAgain: result.canAskAgain !== false,
  };
}

/** Request system camera permission when needed; re-read after prompt. */
export async function requestCameraPermission(): Promise<CameraPermissionSnapshot> {
  const current = await readCameraPermission();
  if (current.granted) return current;

  const result = await Camera.requestCameraPermissionsAsync();
  if (result.granted) {
    return { granted: true, canAskAgain: result.canAskAgain !== false };
  }

  // Hook/state can lag on Android — verify once more before treating as denied.
  return readCameraPermission();
}
