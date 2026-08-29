import { normalizeMenuItemImageUri } from "@/lib/normalizeMenuItemImage";

export type PickStoreLogoPhotoOptions = {
  /**
   * Gallery slots (Outlet info) — skip crop UI.
   * Android Google Photos + allowsEditing often leaves the picker sheet stuck open.
   */
  purpose?: "logo" | "gallery";
};

export async function pickStoreLogoPhoto(
  source: "camera" | "gallery",
  options?: PickStoreLogoPhotoOptions,
): Promise<{ uri: string; type: string; name: string } | null> {
  const ImagePicker = await import("expo-image-picker");
  const forGallery = options?.purpose === "gallery";

  if (source === "camera") {
    const camPerm = await ImagePicker.requestCameraPermissionsAsync?.();
    if (camPerm && !camPerm.granted) {
      const { Alert } = await import("react-native");
      Alert.alert("Permission needed", "Allow camera access to take a photo.");
      return null;
    }
  } else {
    const libPerm = await ImagePicker.requestMediaLibraryPermissionsAsync?.();
    if (libPerm && !libPerm.granted) {
      const { Alert } = await import("react-native");
      Alert.alert("Permission needed", "Allow photo library access to choose an image.");
      return null;
    }
  }

  const pickerOpts = {
    mediaTypes:
      (ImagePicker as { MediaTypeOptions?: { Images: string } }).MediaTypeOptions?.Images ?? "images",
    // Crop/editor keeps Google Photos open on many Android builds after selection.
    allowsEditing: !forGallery,
    ...(forGallery ? {} : { aspect: [1, 1] as [number, number] }),
    quality: forGallery ? 0.85 : 0.9,
  } as unknown as Parameters<typeof ImagePicker.launchImageLibraryAsync>[0];

  const result =
    source === "camera"
      ? await ImagePicker.launchCameraAsync(pickerOpts)
      : await ImagePicker.launchImageLibraryAsync(pickerOpts);

  if (result.canceled || !result.assets?.[0]?.uri) return null;

  const normalized = await normalizeMenuItemImageUri(result.assets[0].uri);
  if (!normalized.ok) {
    const { Alert } = await import("react-native");
    Alert.alert("Invalid image", normalized.error);
    return null;
  }

  return {
    ...normalized.file,
    name: forGallery ? "gallery.jpg" : "store-logo.jpg",
  };
}
