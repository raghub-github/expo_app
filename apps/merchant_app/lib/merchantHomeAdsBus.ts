import { DeviceEventEmitter } from "react-native";

/** Fired when home_ads change (realtime / force refetch) so Home + Orders strips refresh. */
export const MERCHANT_HOME_ADS_REFRESH = "merchant-home-ads-refresh";

export function requestMerchantHomeAdsRefresh(): void {
  DeviceEventEmitter.emit(MERCHANT_HOME_ADS_REFRESH);
}

export function subscribeMerchantHomeAdsRefresh(cb: () => void): () => void {
  const sub = DeviceEventEmitter.addListener(MERCHANT_HOME_ADS_REFRESH, cb);
  return () => sub.remove();
}
