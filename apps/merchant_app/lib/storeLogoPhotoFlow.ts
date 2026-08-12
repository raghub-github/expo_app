import { normalizeMenuItemImageUri } from "@/lib/normalizeMenuItemImage";

export async function pickStoreLogoPhoto(
  source: "camera" | "gallery",
): Promise<{ uri: string; type: string; name: string } | null> {
  const ImagePicker = await import("expo-image-picker");

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
    allowsEditing: true,
    aspect: [1, 1] as [number, number],
    quality: 0.9,
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
    name: "store-logo.jpg",
  };
}
