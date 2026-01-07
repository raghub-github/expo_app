import React from "react";
import { View, Text, Modal, StyleSheet, Pressable } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors } from "@/src/theme";
import { PremiumAllowButton } from "./PremiumAllowButton";
import { openLocationPermissionSettings, openLocationServicesSettings } from "@/src/services/permissions/androidIntents";
import { Platform } from "react-native";
import * as Location from "expo-location";

interface LocationBlockingModalProps {
  visible: boolean;
  reason: "denied" | "gps_off" | "background_denied";
  onAllow: () => void;
}

/**
 * Blocking Location Modal
 * 
 * Shows when location is:
 * - Denied
 * - GPS turned OFF manually
 * - Background location revoked
 * 
 * Cannot be dismissed - rider must enable location to continue.
 */
export function LocationBlockingModal({
  visible,
  reason,
  onAllow,
}: LocationBlockingModalProps) {
  const handleAllow = async () => {
    try {
      if (reason === "gps_off") {
        // Open location services (GPS) settings
        await openLocationServicesSettings();
      } else if (reason === "background_denied") {
        // Open location permission settings
        await openLocationPermissionSettings();
      } else {
        // Open location permission settings
        await openLocationPermissionSettings();
      }
      // The modal will remain visible until user returns and location is enabled
      // AppState listener in parent will handle closing
    } catch (error) {
      console.error("Error opening location settings:", error);
    }
  };

  const getTitle = () => {
    switch (reason) {
      case "gps_off":
        return "Location Services Required";
      case "background_denied":
        return "Background Location Required";
      default:
        return "Location Permission Required";
    }
  };

  const getMessage = () => {
    switch (reason) {
      case "gps_off":
        return "Please turn on GPS/Location services on your device. Location is mandatory for receiving orders.";
      case "background_denied":
        return "Please enable 'Allow all the time' location permission. Background location is required for continuous order tracking.";
      default:
        return "Location permission is required to use the app. Please enable location access to continue.";
    }
  };

  return (
    <Modal
      visible={visible}
      transparent={false}
      animationType="fade"
      statusBarTranslucent
    >
      <SafeAreaView style={styles.container}>
        <View style={styles.content}>
          {/* Icon */}
          <View style={styles.iconContainer}>
            <Text style={styles.icon}>📍</Text>
          </View>

          {/* Title */}
          <Text style={styles.title}>{getTitle()}</Text>

          {/* Message */}
          <Text style={styles.message}>{getMessage()}</Text>

          {/* Instructions */}
          <View style={styles.instructionsContainer}>
            <Text style={styles.instructionsTitle}>What to do:</Text>
            {reason === "gps_off" ? (
              <>
                <Text style={styles.instruction}>1. Tap "Allow" below</Text>
                <Text style={styles.instruction}>2. Turn on Location Services</Text>
                <Text style={styles.instruction}>3. Return to the app</Text>
              </>
            ) : (
              <>
                <Text style={styles.instruction}>1. Tap "Allow" below</Text>
                <Text style={styles.instruction}>2. Select "Allow all the time"</Text>
                <Text style={styles.instruction}>3. Return to the app</Text>
              </>
            )}
          </View>

          {/* Allow Button */}
          <View style={styles.buttonContainer}>
            <PremiumAllowButton
              onPress={handleAllow}
              mandatory={true}
            />
          </View>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
  content: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
    paddingVertical: 40,
  },
  iconContainer: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: colors.error[50],
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 32,
  },
  icon: {
    fontSize: 64,
  },
  title: {
    fontSize: 28,
    fontWeight: "700",
    color: colors.gray[900],
    textAlign: "center",
    marginBottom: 16,
  },
  message: {
    fontSize: 16,
    color: colors.gray[600],
    textAlign: "center",
    lineHeight: 24,
    marginBottom: 32,
  },
  instructionsContainer: {
    backgroundColor: colors.primary[50],
    borderRadius: 16,
    padding: 20,
    width: "100%",
    marginBottom: 40,
  },
  instructionsTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.primary[700],
    marginBottom: 12,
  },
  instruction: {
    fontSize: 14,
    color: colors.gray[700],
    lineHeight: 22,
    marginBottom: 8,
  },
  buttonContainer: {
    width: "100%",
    maxWidth: 400,
  },
});
