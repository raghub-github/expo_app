import { Platform, type ImageSourcePropType } from "react-native";
import { Asset } from "expo-asset";

const moduleUriCache = new Map<number, Promise<string | null>>();
const remoteUriCache = new Map<string, Promise<string | null>>();

async function toDataUri(localUri: string): Promise<string> {
  const response = await fetch(localUri);
  const buffer = await response.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  const base64 = globalThis.btoa(binary);
  const lower = localUri.toLowerCase();
  const ext = lower.includes(".webp")
    ? "webp"
    : lower.includes(".jpg") || lower.includes(".jpeg")
      ? "jpeg"
      : "png";
  return `data:image/${ext};base64,${base64}`;
}

async function resolveRemoteUriForWebView(uri: string): Promise<string | null> {
  const trimmed = uri.trim();
  if (!trimmed) return null;
  if (Platform.OS === "web") return trimmed;

  const cached = remoteUriCache.get(trimmed);
  if (cached) return cached;

  const pending = (async () => {
    try {
      return await toDataUri(trimmed);
    } catch {
      return trimmed;
    }
  })();

  remoteUriCache.set(trimmed, pending);
  return pending;
}

/** Data URI for Mapbox WebView HTML — Metro/http asset URLs fail inside WebView img tags. */
export async function resolveMapImageDataUri(
  imageModule: ImageSourcePropType | null | undefined
): Promise<string | null> {
  if (imageModule == null) return null;

  if (typeof imageModule === "number") {
    const cached = moduleUriCache.get(imageModule);
    if (cached) return cached;

    const pending = (async () => {
      const asset = Asset.fromModule(imageModule);
      await asset.downloadAsync();
      const localUri = asset.localUri ?? asset.uri;
      if (!localUri?.trim()) return null;
      if (Platform.OS === "web") return localUri;
      try {
        return await toDataUri(localUri);
      } catch {
        return localUri;
      }
    })();

    moduleUriCache.set(imageModule, pending);
    return pending;
  }

  const { Image } = await import("react-native");
  try {
    const resolved = Image.resolveAssetSource(imageModule)?.uri;
    if (!resolved?.trim()) return null;
    return resolveRemoteUriForWebView(resolved);
  } catch {
    return null;
  }
}
