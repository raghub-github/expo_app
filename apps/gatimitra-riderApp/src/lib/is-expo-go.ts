import Constants, { ExecutionEnvironment } from "expo-constants";

/** True when running inside the Expo Go app (no custom native modules). */
export function isExpoGo(): boolean {
  return Constants.executionEnvironment === ExecutionEnvironment.StoreClient;
}

export function isNativeMapboxSupported(): boolean {
  return !isExpoGo();
}
