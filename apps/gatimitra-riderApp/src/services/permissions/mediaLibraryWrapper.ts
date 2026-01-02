/**
 * Advanced wrapper for expo-media-library to handle errors gracefully
 * Prevents AUDIO permission errors by catching and handling them silently
 * Error suppression is handled globally in errorSuppression.ts
 */

export async function requestMediaLibraryPermissions() {
  try {
    const MediaLibrary = await import("expo-media-library");
    // Try to request permissions - if it fails due to AUDIO, we'll catch it
    const result = await MediaLibrary.requestPermissionsAsync();
    return {
      status: result.status as "granted" | "denied" | "undetermined",
      canAskAgain: result.canAskAgain ?? true,
    };
  } catch (error: any) {
    // Error is already suppressed by global error handler
    // Return denied instead of throwing - app continues to work
    return {
      status: "denied" as const,
      canAskAgain: false,
    };
  }
}

export async function getMediaLibraryPermissions() {
  try {
    const MediaLibrary = await import("expo-media-library");
    // getPermissionsAsync might also trigger the error, but we'll catch it
    const result = await MediaLibrary.getPermissionsAsync();
    return {
      status: result.status as "granted" | "denied" | "undetermined",
    };
  } catch (error: any) {
    // Error is already suppressed by global error handler
    // Return undetermined - app continues to work
    return {
      status: "undetermined" as const,
    };
  }
}

