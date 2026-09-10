import { Platform } from "react-native";

/** True for camera / picker URIs that can die after the picker closes. */
export function isEphemeralLocalPhotoUri(uri: string | null | undefined): boolean {
  if (!uri) return false;
  const u = uri.trim().toLowerCase();
  return (
    u.startsWith("file:") ||
    u.startsWith("content:") ||
    u.startsWith("ph://") ||
    u.startsWith("assets-library:") ||
    u.startsWith("/")
  );
}

/**
 * Copy camera/gallery picks into app cache so Image previews keep working after
 * the system picker / editor dismisses (Android content:// especially).
 */
export async function persistLocalOnboardingPhoto(
  uri: string,
  kind = "doc",
): Promise<string> {
  if (Platform.OS === "web" || !isEphemeralLocalPhotoUri(uri)) return uri;
  try {
    const FS = await import("expo-file-system/legacy");
    const dir = FS.cacheDirectory || FS.documentDirectory;
    if (!dir) return uri;
    const dest = `${dir}onboarding-${kind}-${Date.now()}.jpg`;
    await FS.copyAsync({ from: uri, to: dest });
    const info = await FS.getInfoAsync(dest);
    if (!info.exists || (typeof info.size === "number" && info.size < 32)) {
      throw new Error("copied photo missing");
    }
    return dest;
  } catch {
    return uri;
  }
}
