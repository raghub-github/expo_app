/**
 * Global error suppression for known Expo Go limitations
 * This must be imported FIRST, before any other modules that might trigger errors
 */

let isInstalled = false;

export function installErrorSuppression() {
  if (isInstalled) return;
  
  const originalError = console.error;
  const originalWarn = console.warn;
  
  // Override console.error to suppress known Expo Go errors
  console.error = (...args: any[]) => {
    const message = String(args[0] || "");
    
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
    
    originalWarn.apply(console, args);
  };
  
  isInstalled = true;
}


