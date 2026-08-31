import Constants from "expo-constants";

/** True when running inside the Expo Go host app (not a dev client or store build). */
export function isExpoGo(): boolean {
  return Constants.appOwnership === "expo";
}
