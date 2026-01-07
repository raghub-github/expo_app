/**
 * Advanced wrapper for expo-notifications to completely prevent errors
 * Uses dynamic import with error suppression to avoid Expo Go issues
 */

// Check if we're in Expo Go (development mode)
const isExpoGo = () => {
  try {
    // In Expo Go, Constants.executionEnvironment is 'storeClient'
    // In development builds, it's 'standalone'
    const Constants = require("expo-constants").default;
    return Constants.executionEnvironment === "storeClient";
  } catch {
    // If we can't determine, assume we're in Expo Go to be safe
    return true;
  }
};

export async function requestNotificationPermissions() {
  // If in Expo Go, skip notifications entirely to prevent errors
  if (isExpoGo()) {
    return {
      status: "denied" as const,
      canAskAgain: false,
    };
  }
  
  try {
    const Notifications = await import("expo-notifications");
    const { requestPermissionsAsync, setNotificationHandler } = Notifications;
    
    // Configure notification handler with sound and vibration
    setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: true,
      }),
    });
    
    // Request permissions with sound and vibration enabled
    // Android automatically includes sound and vibration when permission is granted
    // iOS requires explicit permission for sound
    const result = await requestPermissionsAsync({
      ios: {
        allowAlert: true,
        allowBadge: true,
        allowSound: true, // Enable sound on iOS
        allowAnnouncements: false,
      },
      android: {
        // Android notification permissions include sound and vibration by default
        // User can configure these in settings after granting permission
      },
    });
    
    return {
      status: result.status as "granted" | "denied" | "undetermined",
      canAskAgain: result.status !== "denied",
    };
  } catch (error: any) {
    // Return denied instead of throwing - app continues to work
    return {
      status: "denied" as const,
      canAskAgain: false,
    };
  }
}

export async function getNotificationPermissions() {
  // If in Expo Go, skip notifications entirely to prevent errors
  if (isExpoGo()) {
    return {
      status: "undetermined" as const,
    };
  }
  
  try {
    const Notifications = await import("expo-notifications");
    const { getPermissionsAsync } = Notifications;
    const result = await getPermissionsAsync();
    return {
      status: result.status as "granted" | "denied" | "undetermined",
    };
  } catch (error: any) {
    // Return undetermined - app continues to work
    return {
      status: "undetermined" as const,
    };
  }
}
