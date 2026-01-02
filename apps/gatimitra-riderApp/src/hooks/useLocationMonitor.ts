import { useEffect, useState } from "react";
import { Platform, AppState } from "react-native";
import { permissionManager } from "@/src/services/permissions/permissionManager";
import { Alert } from "react-native";

/**
 * Hook to monitor location services status
 * Shows popup if location is turned off (mandatory for riders)
 */
export function useLocationMonitor(enabled: boolean = true) {
  const [locationEnabled, setLocationEnabled] = useState<boolean | null>(null);
  const [showAlert, setShowAlert] = useState(false);

  useEffect(() => {
    if (!enabled || Platform.OS === "web") return;

    const checkLocation = async () => {
      try {
        const enabled = await permissionManager.checkLocationServicesEnabled();
        const granted = await permissionManager.isLocationGranted();
        const isEnabled = enabled && granted;
        
        setLocationEnabled(isEnabled);
        
        // Show alert if location is disabled (but only once per session)
        if (!isEnabled && !showAlert) {
          setShowAlert(true);
          Alert.alert(
            "Location Required",
            "Location services must be turned on to use GatiMitra. Please enable location/GPS in your device settings.",
            [
              {
                text: "Open Settings",
                onPress: async () => {
                  await permissionManager.openSettings("location_foreground");
                  setShowAlert(false);
                },
              },
              {
                text: "OK",
                onPress: () => setShowAlert(false),
              },
            ],
            { cancelable: false }
          );
        }
      } catch (error) {
        console.warn("Error checking location services:", error);
      }
    };

    // Check immediately
    checkLocation();

    // Check every 3 seconds when app is active
    const interval = setInterval(() => {
      if (AppState.currentState === "active") {
        checkLocation();
      }
    }, 3000);

    // Also check when app becomes active
    const subscription = AppState.addEventListener("change", (nextAppState) => {
      if (nextAppState === "active") {
        checkLocation();
      }
    });

    return () => {
      clearInterval(interval);
      subscription.remove();
    };
  }, [enabled, showAlert]);

  return { locationEnabled };
}


