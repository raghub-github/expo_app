import type { MenuItemRow } from "@/services/menuApi";
import { uploadItemImage } from "@/services/menuApi";

export type CatalogPhotoUploadCallbacks = {
  onStart: (itemId: number, previewUri: string) => void;
  onProgress: (itemId: number, progress: number) => void;
  onSuccess: (itemId: number, previewUri: string, imageUrl?: string | null) => void;
  onError: (itemId: number) => void;
};

export async function pickCatalogPhoto(
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
      Alert.alert("Permission needed", "Allow photo library access to upload an image.");
      return null;
    }
  }

  const pickerOpts = {
    mediaTypes: (ImagePicker as { MediaTypeOptions?: { Images: string } }).MediaTypeOptions?.Images ?? "images",
    allowsEditing: true,
    aspect: [1, 1] as [number, number],
    quality: 0.85,
  };

  const result =
    source === "camera"
      ? await ImagePicker.launchCameraAsync(pickerOpts)
      : await ImagePicker.launchImageLibraryAsync(pickerOpts);

  if (result.canceled || !result.assets?.[0]?.uri) return null;
  const asset = result.assets[0];
  return {
    uri: asset.uri,
    type: asset.mimeType ?? "image/jpeg",
    name: asset.fileName ?? "image.jpg",
  };
}

export async function uploadCatalogPhotoWithProgress(
  item: MenuItemRow,
  storeId: string,
  token: string,
  file: { uri: string; type: string; name: string },
  callbacks: CatalogPhotoUploadCallbacks,
): Promise<boolean> {
  callbacks.onStart(item.id, file.uri);
  let progress = 0.05;
  callbacks.onProgress(item.id, progress);

  const timer = setInterval(() => {
    progress = Math.min(progress + 0.06 + Math.random() * 0.04, 0.92);
    callbacks.onProgress(item.id, progress);
  }, 180);

  try {
    const uploaded = await uploadItemImage(storeId, item.id, token, file);
    clearInterval(timer);
    callbacks.onProgress(item.id, 1);
    callbacks.onSuccess(item.id, file.uri, uploaded.image_url ?? null);
    return true;
  } catch (e) {
    clearInterval(timer);
    callbacks.onError(item.id);
    throw e;
  }
}
