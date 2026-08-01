import { DeviceEventEmitter } from "react-native";

/** Fired after accept / reject / advance / deliver so home KPI cards reload instantly. */
export const MERCHANT_DASHBOARD_STATS_REFRESH = "merchant-dashboard-stats-refresh";

export function requestMerchantDashboardStatsRefresh(): void {
  DeviceEventEmitter.emit(MERCHANT_DASHBOARD_STATS_REFRESH);
}

export function subscribeMerchantDashboardStatsRefresh(cb: () => void): () => void {
  const sub = DeviceEventEmitter.addListener(MERCHANT_DASHBOARD_STATS_REFRESH, cb);
  return () => sub.remove();
}
