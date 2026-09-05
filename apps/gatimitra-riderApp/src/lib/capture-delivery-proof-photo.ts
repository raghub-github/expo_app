import { Alert } from "react-native";
import * as ImagePicker from "expo-image-picker";
import type { TFunction } from "i18next";

let captureInFlight: Promise<string | null> | null = null;

function permissionDeniedAlert(t: TFunction) {
  Alert.alert(
    t("orders.activeFood.cameraRequiredTitle", "Camera required"),
    t(
      "orders.activeFood.cameraRequiredMessage",
      "Allow camera access to capture a live delivery photo."
    )
  );
}

async function captureOnce(t: TFunction): Promise<string | null> {
  const current = await ImagePicker.getCameraPermissionsAsync();
  let status = current.status;
  if (status !== "granted") {
    const asked = await ImagePicker.requestCameraPermissionsAsync();
    status = asked.status;
  }
  if (status !== "granted") {
    permissionDeniedAlert(t);
    return null;
  }

  const result = await ImagePicker.launchCameraAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    allowsEditing: false,
    quality: 0.72,
    exif: false,
    base64: false,
  });

  if (result.canceled || !result.assets[0]?.uri) {
    return null;
  }

  return result.assets[0].uri;
}

/** Opens device camera only (no gallery). Returns local file URI or null if cancelled/denied. */
export async function captureDeliveryProofPhoto(t: TFunction): Promise<string | null> {
  if (captureInFlight) return captureInFlight;
  captureInFlight = captureOnce(t).finally(() => {
    captureInFlight = null;
  });
  return captureInFlight;
}
