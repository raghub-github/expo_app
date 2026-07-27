/**
 * Expo-friendly stub for `react-native-device-info` (used by sp-react-native-in-app-updates).
 */
import Constants from "expo-constants";
import * as Application from "expo-application";

export const getBundleId = () => {
  return (
    Constants.expoConfig?.ios?.bundleIdentifier ??
    Constants.expoConfig?.android?.package ??
    Application.applicationId ??
    ""
  );
};

export const getVersion = () => {
  return (
    Application.nativeApplicationVersion ??
    Constants.expoConfig?.version ??
    "0.0.0"
  );
};

export default {
  getBundleId,
  getVersion,
};
