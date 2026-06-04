import { resolveMapboxPublicToken } from "@/src/lib/mapbox-env";
import { isNativeMapboxSupported } from "@/src/lib/is-expo-go";

export function canUseNativeMapbox(): boolean {
  return isNativeMapboxSupported() && !!resolveMapboxPublicToken();
}

export function canUseMapboxWeb(): boolean {
  return !!resolveMapboxPublicToken();
}

export function shouldUseMapboxWebFallback(): boolean {
  return canUseMapboxWeb() && !isNativeMapboxSupported();
}
