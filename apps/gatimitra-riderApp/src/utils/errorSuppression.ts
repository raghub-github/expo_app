/**
 * Global error suppression for known Expo Go limitations
 * This must be imported FIRST, before any other modules that might trigger errors
 */

import { LogBox } from "react-native";

let isInstalled = false;

function isBenignKeepAwakeMessage(message: string): boolean {
  return (
    message.includes("Unable to activate keep awake") ||
    message.includes("Unable to deactivate keep awake")
  );
}

export function installErrorSuppression() {
  if (isInstalled) return;

  LogBox.ignoreLogs([
    "Unable to activate keep awake",
    "Unable to deactivate keep awake",
    "`setPositionAsync` is not supported with edge-to-edge enabled",
    "`setBackgroundColorAsync` is not supported with edge-to-edge enabled",
    "[expo-av]: Expo AV has been deprecated",
  ]);

  const rejectionHandler = (event: PromiseRejectionEvent) => {
    const reason = event?.reason;
    const message =
      reason instanceof Error
        ? reason.message
        : typeof reason === "string"
          ? reason
          : String(reason ?? "");
    if (isBenignKeepAwakeMessage(message)) {
      event.preventDefault?.();
    }
  };
  if (typeof globalThis.addEventListener === "function") {
    globalThis.addEventListener("unhandledrejection", rejectionHandler);
  }
  
  const originalError = console.error;
  const originalWarn = console.warn;
  
  // Override console.error to suppress known Expo Go errors
  console.error = (...args: any[]) => {
    const message = String(args[0] || "");

    if (isBenignKeepAwakeMessage(message)) {
      return;
    }
    
    // Suppress expo-notifications Expo Go errors
    if (
      message.includes("expo-notifications") &&
      (message.includes("Expo Go") || 
       message.includes("SDK 53") || 
       message.includes("development build") ||
       message.includes("remote notifications") ||
       message.includes("Android Push notifications"))
    ) {
      // Suppress - this is expected in Expo Go
      return;
    }
    
    // Suppress expo-media-library AUDIO permission errors
    if (
      message.includes("AUDIO permission") ||
      (message.includes("ExpoMediaLibrary") && message.includes("rejected")) ||
      (message.includes("AndroidManifest") && message.includes("AUDIO"))
    ) {
      // Suppress - we handle this gracefully
      return;
    }

    // Suppress BiometricAuth / MSG91 SDK native module errors (Expo Go or when native module not linked)
    if (
      message.includes("BiometricAuth is undefined") ||
      message.includes("Biometric check error") ||
      message.includes("Native module not linked properly")
    ) {
      return;
    }
    
    originalError.apply(console, args);
  };
  
  // Override console.warn for the same
  console.warn = (...args: any[]) => {
    const message = String(args[0] || "");
    
    // Suppress expo-notifications Expo Go warnings
    if (
      message.includes("expo-notifications") &&
      (message.includes("Expo Go") || 
       message.includes("not fully supported") ||
       message.includes("SDK 53"))
    ) {
      // Suppress - this is expected in Expo Go
      return;
    }
    
    // Suppress expo-media-library warnings about AUDIO
    if (
      message.includes("AUDIO permission") ||
      (message.includes("ExpoMediaLibrary") && message.includes("rejected")) ||
      (message.includes("AndroidManifest") && message.includes("AUDIO"))
    ) {
      // Suppress - we handle this gracefully
      return;
    }

    if (
      message.includes("SafeAreaView has been deprecated") ||
      message.includes("Require cycles are allowed") ||
      message.includes("[Worklets] Tried to modify key `current`") ||
      message.includes("VirtualizedList: You have a large list that is slow to update") ||
      isBenignKeepAwakeMessage(message) ||
      message.includes("setPositionAsync` is not supported with edge-to-edge") ||
      message.includes("setBackgroundColorAsync` is not supported with edge-to-edge") ||
      message.includes("[expo-av]: Expo AV has been deprecated")
    ) {
      return;
    }
    
    originalWarn.apply(console, args);
  };
  
  isInstalled = true;
}


