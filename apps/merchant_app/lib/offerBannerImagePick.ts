import { Alert, InteractionManager, Platform } from "react-native";

export type PickedOfferImageFile = {
  uri: string;
  type: string;
  name: string;
};

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function waitForInteractions(): Promise<void> {
  return new Promise((resolve) => {
    InteractionManager.runAfterInteractions(() => resolve());
  });
}

/**
 * Pick an offer banner image.
 * On Android, callers should hide any full-screen Modal first — stacking the
 * system picker under RN Modal leaves ActivityResultLauncher unregistered.
 */
export async function pickOfferBannerImage(): Promise<PickedOfferImageFile | null> {
  const ImagePicker = await import("expo-image-picker");

  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync?.();
  if (perm && perm.status !== "granted") {
    Alert.alert("Permission needed", "Allow access to photos to upload an offer image.");
    return null;
  }

  await waitForInteractions();
  if (Platform.OS === "android") {
    await wait(200);
  }

  const pickerOpts = {
    mediaTypes:
      (ImagePicker as { MediaTypeOptions?: { Images: string } }).MediaTypeOptions?.Images ??
      "images",
    // Crop UI + Modal stack commonly trips Android ActivityResultLauncher.
    allowsEditing: Platform.OS === "ios",
    aspect: [2, 1] as [number, number],
    quality: 0.85,
  } as unknown as Parameters<typeof ImagePicker.launchImageLibraryAsync>[0];

  const launch = () => ImagePicker.launchImageLibraryAsync(pickerOpts);

  let result: Awaited<ReturnType<typeof ImagePicker.launchImageLibraryAsync>>;
  try {
    result = await launch();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (!msg.includes("unregistered ActivityResultLauncher")) throw e;
    await waitForInteractions();
    await wait(400);
    result = await launch();
  }

  if (result.canceled || !result.assets?.[0]?.uri) return null;
  const asset = result.assets[0];
  return {
    uri: asset.uri,
    type: (asset as { mimeType?: string }).mimeType ?? "image/jpeg",
    name: (asset as { fileName?: string }).fileName ?? "offer.jpg",
  };
}
