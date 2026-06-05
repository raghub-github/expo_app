import { Alert } from "react-native";
import * as ImagePicker from "expo-image-picker";
import type { TFunction } from "i18next";

/** Opens device camera only (no gallery). Returns local file URI or null if cancelled/denied. */
export async function captureDeliveryProofPhoto(t: TFunction): Promise<string | null> {
  const { status } = await ImagePicker.requestCameraPermissionsAsync();
  if (status !== "granted") {
    Alert.alert(
      t("orders.activeFood.cameraRequiredTitle", "Camera required"),
      t(
        "orders.activeFood.cameraRequiredMessage",
        "Allow camera access to capture a live delivery photo."
      )
    );
    return null;
  }

  const result = await ImagePicker.launchCameraAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    allowsEditing: false,
    quality: 0.72,
    exif: false,
  });

  if (result.canceled || !result.assets[0]?.uri) {
    return null;
  }

  return result.assets[0].uri;
}
