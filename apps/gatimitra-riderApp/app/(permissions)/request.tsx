import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  Platform,
  AppState,
  Animated,
  Dimensions,
  StyleSheet,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { router } from "expo-router";
import { permissionManager } from "@/src/services/permissions/permissionManager";
import { usePermissionStore } from "@/src/stores/permissionStore";
import { useSessionStore } from "@/src/stores/sessionStore";
import { Logo } from "@/src/components/Logo";
import { colors } from "@/src/theme";
import * as Location from "expo-location";
import { LinearGradient } from "expo-linear-gradient";
import { PremiumAllowButton } from "@/src/components/permissions/PremiumAllowButton";
import { LocationBlockingModal } from "@/src/components/permissions/LocationBlockingModal";
import { smartPermissionHandler, PermissionStepKey } from "@/src/services/permissions/smartPermissionHandler";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

type PermissionStep = {
  key: PermissionStepKey;
  title: string;
  description: string;
  microText: string;
  icon: string;
  gradient: string[];
  mandatory: boolean;
};

export default function PermissionRequestScreen() {
  const { t } = useTranslation();
  const setPermissions = usePermissionStore((s) => s.setPermissions);
  const setHasRequestedPermissions = usePermissionStore((s) => s.setHasRequestedPermissions);
  const setPermissionStepGranted = usePermissionStore((s) => s.setPermissionStepGranted);
  const isPermissionStepGranted = usePermissionStore((s) => s.isPermissionStepGranted);
  const session = useSessionStore((s) => s.session);
  const [currentStep, setCurrentStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [filteredSteps, setFilteredSteps] = useState<PermissionStep[]>([]);
  const [isCheckingPermissions, setIsCheckingPermissions] = useState(true);
  const [locationBlockingModal, setLocationBlockingModal] = useState<{
    visible: boolean;
    reason: "denied" | "gps_off" | "background_denied";
  }>({ visible: false, reason: "denied" });
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;
  const scaleAnim = useRef(new Animated.Value(0.9)).current;
  const progressAnim = useRef(new Animated.Value(0)).current;

  const isWeb = Platform.OS === "web";

  // Define all possible permission steps
  const allSteps: PermissionStep[] = React.useMemo(() => {
    return [
      {
        key: "location",
        title: "Location Access",
        description: "We need your location to show nearby orders, enable navigation, and track deliveries in real-time.",
        microText: "After clicking Allow, you'll be taken to app settings. Navigate to Permissions → Location and select 'Allow all the time' (not 'While using the app') for continuous order tracking.",
        icon: "📍",
        gradient: ["#14b8a6", "#0d9488"],
        mandatory: true,
      },
      {
        key: "location_services",
        title: "Enable Location Services",
        description: "Please turn on GPS/Location services on your device to enable accurate location tracking for deliveries.",
        microText: "Go to Settings → Location and turn on Location Services. This is required for the app to work properly.",
        icon: "🛰️",
        gradient: ["#10b981", "#059669"],
        mandatory: true,
      },
      {
        key: "notifications",
        title: "Notifications",
        description: "Receive instant alerts about new orders, order updates, earnings, and important announcements.",
        microText: "After allowing, please enable SOUND and VIBRATION in notification settings for better order management.",
        icon: "🔔",
        gradient: ["#0ea5e9", "#0284c7"],
        mandatory: false,
      },
      {
        key: "battery_optimization",
        title: "Battery Optimization",
        description: "Allow the app to run efficiently in the background to ensure you receive order notifications on time.",
        microText: "Disabling battery optimization ensures continuous location tracking and timely notifications.",
        icon: "🔋",
        gradient: ["#f59e0b", "#d97706"],
        mandatory: false,
      },
      {
        key: "background_running",
        title: "Background Running",
        description: "Allow the app to run in the background so you can receive orders even when the app is not active.",
        microText: "After clicking Allow, navigate to Advanced → Background activity (or Battery → Background restrictions) and enable background running for this app.",
        icon: "🔄",
        gradient: ["#8b5cf6", "#7c3aed"],
        mandatory: false,
      },
      {
        key: "display_over_apps",
        title: "Display Over Other Apps",
        description: "Allow the app to display over other apps for important order notifications and updates.",
        microText: "After clicking Allow, navigate to Advanced → Display over other apps (or Special app access) and enable this permission for GatiMitra.",
        icon: "📱",
        gradient: ["#ec4899", "#db2777"],
        mandatory: false,
      },
    ].filter((step) => {
      // Filter out location_services and display_over_apps on web
      if (isWeb) {
        return step.key === "notifications";
      }
      return true;
    });
  }, [isWeb]);

  // Pre-check permissions and filter out already-granted ones
  useEffect(() => {
    const checkAndFilterPermissions = async () => {
      setIsCheckingPermissions(true);
      
      try {
        const stepsToShow: PermissionStep[] = [];
        
        for (const step of allSteps) {
          // Check if permission is already granted
          const check = await smartPermissionHandler.checkPermission(step.key);
          
          if (check.status === "granted") {
            // Permission is granted - mark it in store and skip
            setPermissionStepGranted(step.key, true);
            console.log(`[Permission] ${step.key} is already granted, skipping`);
          } else {
            // Permission not granted - include in flow
            stepsToShow.push(step);
            console.log(`[Permission] ${step.key} needs action, including in flow`);
          }
        }
        
        setFilteredSteps(stepsToShow);
        
        // If all mandatory permissions are granted, skip flow entirely
        const mandatorySteps = allSteps.filter(s => s.mandatory);
        const grantedMandatorySteps = mandatorySteps.filter(s => {
          // Check if it's in the filtered list (if not, it was granted)
          return !stepsToShow.some(fs => fs.key === s.key);
        });
        
        if (grantedMandatorySteps.length === mandatorySteps.length && mandatorySteps.length > 0) {
          console.log("[Permission] All mandatory permissions granted, skipping flow");
          // All mandatory permissions granted - complete immediately
          const completeFlow = async () => {
            try {
              const states = await permissionManager.getPermissionStates();
              await setPermissions(states);
              await setHasRequestedPermissions(true);
              const currentSession = useSessionStore.getState().session;
              if (currentSession) {
                router.replace("/(tabs)/orders");
              } else {
                router.replace("/(auth)/login");
              }
            } catch (error) {
              console.warn("Error completing permissions:", error);
              await setHasRequestedPermissions(true);
              const currentSession = useSessionStore.getState().session;
              if (currentSession) {
                router.replace("/(tabs)/orders");
              } else {
                router.replace("/(auth)/login");
              }
            }
          };
          setTimeout(completeFlow, 500);
          return;
        }
        
        // If no steps to show, complete
        if (stepsToShow.length === 0) {
          console.log("[Permission] No permissions need action, completing");
          const completeFlow = async () => {
            try {
              const states = await permissionManager.getPermissionStates();
              await setPermissions(states);
              await setHasRequestedPermissions(true);
              const currentSession = useSessionStore.getState().session;
              if (currentSession) {
                router.replace("/(tabs)/orders");
              } else {
                router.replace("/(auth)/login");
              }
            } catch (error) {
              console.warn("Error completing permissions:", error);
              await setHasRequestedPermissions(true);
              const currentSession = useSessionStore.getState().session;
              if (currentSession) {
                router.replace("/(tabs)/orders");
              } else {
                router.replace("/(auth)/login");
              }
            }
          };
          setTimeout(completeFlow, 500);
          return;
        }
        
        console.log(`[Permission] Showing ${stepsToShow.length} permission steps`);
      } catch (error) {
        console.warn("Error checking permissions:", error);
        // On error, show all steps
        setFilteredSteps(allSteps);
      } finally {
        setIsCheckingPermissions(false);
      }
    };
    
    checkAndFilterPermissions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allSteps]);

  // Use filtered steps instead of all steps
  const steps = filteredSteps;

  // Animate progress bar
  useEffect(() => {
    if (filteredSteps.length === 0) return;
    Animated.timing(progressAnim, {
      toValue: (currentStep + 1) / filteredSteps.length,
      duration: 500,
      useNativeDriver: false,
    }).start();
  }, [currentStep, filteredSteps.length]);

  // Animation on step change
  useEffect(() => {
    fadeAnim.setValue(0);
    slideAnim.setValue(30);
    scaleAnim.setValue(0.9);

    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 600,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 600,
        useNativeDriver: true,
      }),
      Animated.spring(scaleAnim, {
        toValue: 1,
        tension: 50,
        friction: 7,
        useNativeDriver: true,
      }),
    ]).start();
  }, [currentStep]);

  // Check location status on mount and when step changes
  useEffect(() => {
    const checkLocation = async () => {
      if (filteredSteps[currentStep]?.key === "location" || filteredSteps[currentStep]?.key === "location_services") {
        const locationStatus = await smartPermissionHandler.isLocationFullyEnabled();
        if (!locationStatus.enabled && locationStatus.reason) {
          setLocationBlockingModal({
            visible: true,
            reason: locationStatus.reason,
          });
        }
      }
    };
    checkLocation();
  }, [currentStep, filteredSteps]);

  const handleComplete = useCallback(async () => {
    try {
      const states = await permissionManager.getPermissionStates();
      await setPermissions(states);
      await setHasRequestedPermissions(true);
      if (session) {
        router.replace("/(tabs)/orders");
      } else {
        // After permissions, redirect to mobile/OTP verification
        router.replace("/(auth)/login");
      }
    } catch (error) {
      console.warn("Error completing permissions:", error);
      await setHasRequestedPermissions(true);
      if (session) {
        router.replace("/(tabs)/orders");
      } else {
        // After permissions, redirect to mobile/OTP verification
        router.replace("/(auth)/login");
      }
    }
  }, [session, setPermissions, setHasRequestedPermissions]);

  const handleNextStep = useCallback(() => {
    if (currentStep < filteredSteps.length - 1) {
      setCurrentStep((prev) => prev + 1);
    } else {
      handleComplete();
    }
  }, [currentStep, filteredSteps.length, handleComplete]);

  // Re-check permissions when app returns from settings
  useEffect(() => {
    const subscription = AppState.addEventListener("change", async (nextAppState) => {
      if (nextAppState === "active" && currentStep < filteredSteps.length) {
        const step = filteredSteps[currentStep];
        if (!step) return;

        // Wait a bit for permissions to update after returning from settings
        await new Promise((resolve) => setTimeout(resolve, 800));

        try {
          // Check location specially
          if (step.key === "location" || step.key === "location_services") {
            const locationStatus = await smartPermissionHandler.isLocationFullyEnabled();
            if (locationStatus.enabled) {
              // Location is enabled - mark as granted, close blocking modal and proceed
              setPermissionStepGranted(step.key, true);
              setLocationBlockingModal({ visible: false, reason: "denied" });
              setTimeout(() => handleNextStep(), 1000);
            } else if (locationStatus.reason) {
              // Still not enabled - show blocking modal
              setLocationBlockingModal({
                visible: true,
                reason: locationStatus.reason,
              });
            }
            return;
          }

          // Check other permissions
          const check = await smartPermissionHandler.checkPermission(step.key);
          if (check.status === "granted") {
            // Permission is granted - mark it and proceed
            setPermissionStepGranted(step.key, true);
            await smartPermissionHandler.markPermissionGranted(step.key);
            setTimeout(() => handleNextStep(), 1000);
          } else if (check.status === "denied") {
            // Permission was explicitly denied - invalidate cache so we ask again
            await smartPermissionHandler.markPermissionDenied(step.key);
            setPermissionStepGranted(step.key, false);
            // Don't auto-proceed - let user try again or skip if optional
          } else {
            // Permission status is undetermined - for battery/background/display, 
            // assume user may have enabled it after returning from settings
            // Mark as granted after timeout to allow progression
            if (step.key === "battery_optimization" || step.key === "background_running" || step.key === "display_over_apps") {
              // For these, we can't check easily, so mark as granted after user returns
              // This allows progression even if we can't verify
              // User can always manually disable and we'll ask again next time
              setPermissionStepGranted(step.key, true);
              await smartPermissionHandler.markPermissionGranted(step.key);
              setTimeout(() => handleNextStep(), 1500);
            }
          }
        } catch (error) {
          console.warn("Error re-checking permission:", error);
        }
      }
    });

    return () => subscription.remove();
  }, [currentStep, filteredSteps, setPermissionStepGranted, handleNextStep]);

  const handleAllow = async () => {
    if (currentStep >= filteredSteps.length) {
      handleComplete();
      return;
    }

    const step = filteredSteps[currentStep];
    if (!step) {
      handleComplete();
      return;
    }

    setLoading(true);

    try {
      // Use smart handler - it decides request vs settings
      await smartPermissionHandler.handleAllow(step.key);

      // For location steps, check if blocking modal should show
      if (step.key === "location" || step.key === "location_services") {
        // Wait a moment for permission dialog to appear/close
        await new Promise(resolve => setTimeout(resolve, 500));
        
        const locationStatus = await smartPermissionHandler.isLocationFullyEnabled();
        if (!locationStatus.enabled && locationStatus.reason) {
          setLocationBlockingModal({
            visible: true,
            reason: locationStatus.reason,
          });
        } else if (locationStatus.enabled) {
          // Location is already enabled - mark and proceed
          setPermissionStepGranted(step.key, true);
          setLocationBlockingModal({ visible: false, reason: "denied" });
          setTimeout(() => handleNextStep(), 1000);
        }
      } else {
        // For other permissions (battery, background, display), 
        // we can't easily check if they're enabled, so we rely on
        // the AppState listener to detect when user returns from settings
        // and mark as granted then
      }
    } catch (error) {
      console.warn("Error handling allow:", error);
    } finally {
      setLoading(false);
    }
  };

  // Safety checks
  if (isCheckingPermissions) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centerContent}>
          <Logo size="large" vertical style={{ marginBottom: 24 }} />
          <Text style={styles.title}>Checking Permissions...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!steps || steps.length === 0) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centerContent}>
          <Logo size="large" vertical style={{ marginBottom: 24 }} />
          <Text style={styles.title}>All Permissions Granted! 🎉</Text>
          <Text style={styles.subtitle}>You're ready to start delivering orders.</Text>
          <PremiumAllowButton onPress={handleComplete} />
        </View>
      </SafeAreaView>
    );
  }

  if (currentStep >= filteredSteps.length) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centerContent}>
          <Logo size="large" vertical style={{ marginBottom: 24 }} />
          <Text style={styles.title}>All Set! 🎉</Text>
          <Text style={styles.subtitle}>You're ready to start delivering orders.</Text>
          <PremiumAllowButton onPress={handleComplete} />
        </View>
      </SafeAreaView>
    );
  }

  const step = filteredSteps[currentStep];
  if (!step) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centerContent}>
          <Logo size="large" vertical style={{ marginBottom: 24 }} />
          <Text style={styles.title}>Loading...</Text>
        </View>
      </SafeAreaView>
    );
  }

  // Calculate progress width
  const progressWidth = progressAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ["0%", "100%"],
  });

  return (
    <SafeAreaView style={styles.container}>
      {/* Location Blocking Modal */}
      <LocationBlockingModal
        visible={locationBlockingModal.visible}
        reason={locationBlockingModal.reason}
        onAllow={() => {
          // Modal handles its own allow logic
        }}
      />

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        bounces={true}
      >
        {/* Header with Logo */}
        <View style={styles.header}>
          <Logo size="medium" style={{ marginBottom: 8 }} />
        </View>

        {/* Progress Indicator */}
        <View style={styles.progressContainer}>
          <View style={styles.progressBarBackground}>
            <Animated.View
              style={[
                styles.progressBarFill,
                {
                  width: progressWidth,
                  backgroundColor: step.gradient[0],
                },
              ]}
            />
          </View>
          <Text style={styles.progressText}>
            Step {currentStep + 1} of {filteredSteps.length}
          </Text>
        </View>

        {/* Permission Card - Animated */}
        <Animated.View
          style={[
            styles.cardContainer,
            {
              opacity: fadeAnim,
              transform: [{ translateY: slideAnim }, { scale: scaleAnim }],
            },
          ]}
        >
          {Platform.OS === "web" ? (
            <View style={[styles.gradientCard, { backgroundColor: step.gradient[0] }]}>
              <View style={styles.iconContainer}>
                <Text style={styles.icon}>{step.icon}</Text>
              </View>
              <Text style={styles.cardTitle}>{step.title}</Text>
              <Text style={styles.cardDescription}>{step.description}</Text>
              <View style={styles.microTextContainer}>
                <Text style={styles.microText}>{step.microText}</Text>
              </View>
              {step.mandatory && (
                <View style={styles.mandatoryBadge}>
                  <Text style={styles.mandatoryText}>Required</Text>
                </View>
              )}
            </View>
          ) : (
            <LinearGradient
              colors={[step.gradient[0], step.gradient[1]]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.gradientCard}
            >
              <View style={styles.iconContainer}>
                <Text style={styles.icon}>{step.icon}</Text>
              </View>
              <Text style={styles.cardTitle}>{step.title}</Text>
              <Text style={styles.cardDescription}>{step.description}</Text>
              <View style={styles.microTextContainer}>
                <Text style={styles.microText}>{step.microText}</Text>
              </View>
              {step.mandatory && (
                <View style={styles.mandatoryBadge}>
                  <Text style={styles.mandatoryText}>Required</Text>
                </View>
              )}
            </LinearGradient>
          )}
        </Animated.View>

        {/* Premium Allow Button */}
        <View style={styles.buttonContainer}>
          <PremiumAllowButton
            onPress={handleAllow}
            loading={loading}
            disabled={loading}
            mandatory={step.mandatory}
          />

          {/* Skip option for non-mandatory permissions */}
          {!step.mandatory && (
            <Text
              style={styles.skipText}
              onPress={handleNextStep}
            >
              Skip for now
            </Text>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#ffffff",
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 100,
    alignItems: "center",
  },
  centerContent: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  header: {
    alignItems: "center",
    marginBottom: 32,
  },
  progressContainer: {
    marginBottom: 40,
  },
  progressBarBackground: {
    height: 6,
    backgroundColor: "#e5e7eb",
    borderRadius: 3,
    overflow: "hidden",
    marginBottom: 12,
  },
  progressBarFill: {
    height: "100%",
    borderRadius: 3,
  },
  progressText: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.gray[600],
    textAlign: "center",
  },
  cardContainer: {
    marginBottom: 32,
  },
  gradientCard: {
    borderRadius: 24,
    padding: 32,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 8,
  },
  iconContainer: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 24,
  },
  icon: {
    fontSize: 56,
  },
  cardTitle: {
    fontSize: 28,
    fontWeight: "bold",
    color: "#ffffff",
    textAlign: "center",
    marginBottom: 16,
  },
  cardDescription: {
    fontSize: 16,
    color: "rgba(255, 255, 255, 0.95)",
    textAlign: "center",
    lineHeight: 24,
    marginBottom: 16,
  },
  microTextContainer: {
    backgroundColor: "rgba(255, 255, 255, 0.15)",
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
    marginTop: 8,
  },
  microText: {
    fontSize: 13,
    color: "rgba(255, 255, 255, 0.9)",
    textAlign: "center",
    lineHeight: 18,
  },
  mandatoryBadge: {
    backgroundColor: "rgba(255, 255, 255, 0.25)",
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 6,
    marginTop: 16,
  },
  mandatoryText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#ffffff",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  buttonContainer: {
    alignItems: "center",
    width: "100%",
    marginTop: 32,
    paddingBottom: 40,
  },
  skipText: {
    fontSize: 16,
    color: colors.gray[600],
    marginTop: 20,
    textDecorationLine: "underline",
  },
  title: {
    fontSize: 28,
    fontWeight: "bold",
    color: colors.gray[900],
    marginBottom: 12,
    textAlign: "center",
  },
  subtitle: {
    fontSize: 16,
    color: colors.gray[600],
    textAlign: "center",
    marginBottom: 32,
  },
});
