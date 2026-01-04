import React, { useState, useEffect, useRef } from "react";
import { 
  View, 
  Text, 
  ScrollView, 
  Platform, 
  AppState, 
  Animated, 
  Dimensions,
  StyleSheet,
  Image
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { router } from "expo-router";
import { permissionManager } from "@/src/services/permissions/permissionManager";
import { usePermissionStore } from "@/src/stores/permissionStore";
import { useSessionStore } from "@/src/stores/sessionStore";
import { Button } from "@/src/components/ui/Button";
import { Logo } from "@/src/components/Logo";
import { colors } from "@/src/theme";
import * as Location from "expo-location";
import { 
  openLocationPermissionSettings, 
  openNotificationPermissionSettings,
  openBatteryOptimizationSettings,
  openBackgroundRunningSettings,
} from "@/src/services/permissions/androidIntents";
import { getNotificationPermissions } from "@/src/services/permissions/notificationsWrapper";
import Constants from "expo-constants";
import { LinearGradient } from "expo-linear-gradient";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

type PermissionStep = {
  key: string;
  title: string;
  description: string;
  microText: string;
  icon: string;
  gradient: string[];
  mandatory: boolean;
  requestFn: () => Promise<{ status: string; canAskAgain: boolean }>;
  openSettingsFn: () => Promise<void>;
  checkStatusFn?: () => Promise<{ status: string; canAskAgain: boolean }>;
  showToggle?: boolean;
};

export default function PermissionRequestScreen() {
  const { t } = useTranslation();
  const setPermissions = usePermissionStore((s) => s.setPermissions);
  const setHasRequestedPermissions = usePermissionStore((s) => s.setHasRequestedPermissions);
  const session = useSessionStore((s) => s.session);
  const [currentStep, setCurrentStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [permissionResults, setPermissionResults] = useState<Record<string, { status: string; canAskAgain: boolean }>>({});
  const [locationEnabled, setLocationEnabled] = useState<boolean | null>(null);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;
  const scaleAnim = useRef(new Animated.Value(0.9)).current;
  const progressAnim = useRef(new Animated.Value(0)).current;

  const isWeb = Platform.OS === "web";
  const appName = Constants.expoConfig?.name || "GatiMitra";

  // Define permission steps with beautiful descriptions
  const steps: PermissionStep[] = React.useMemo(() => {
    try {
      return [
        {
          key: "location",
          title: "Location Access",
          description: "We need your location to show nearby orders, enable navigation, and track deliveries in real-time.",
          microText: "Please select 'Allow all the time' (not 'While using the app') for continuous order tracking. Location is required to use the app.",
          icon: "📍",
          gradient: ["#14b8a6", "#0d9488"],
          mandatory: true,
          requestFn: async () => {
            // Request both foreground and background location
            // This will trigger Android's "Allow all the time" option
            return await permissionManager.requestLocationPermissions();
          },
          openSettingsFn: () => openLocationPermissionSettings(),
          checkStatusFn: async () => {
            try {
              const foreground = await Location.getForegroundPermissionsAsync();
              const background = await Location.getBackgroundPermissionsAsync();
              const servicesEnabled = await Location.hasServicesEnabledAsync();
              
              if (foreground.status === "granted" && background?.status === "granted" && servicesEnabled) {
                return { status: "granted", canAskAgain: false };
              }
              return {
                status: foreground.status === "granted" ? "denied" : foreground.status,
                canAskAgain: foreground.canAskAgain ?? true,
              };
            } catch (error) {
              return { status: "undetermined", canAskAgain: true };
            }
          },
        },
        {
          key: "notifications",
          title: "Notifications",
          description: "Receive instant alerts about new orders, order updates, earnings, and important announcements.",
          microText: "Please enable sound and vibration in notification settings for better order management.",
          icon: "🔔",
          gradient: ["#0ea5e9", "#0284c7"],
          mandatory: false,
          requestFn: () => permissionManager.requestNotifications(),
          openSettingsFn: () => openNotificationPermissionSettings(),
          checkStatusFn: async () => {
            try {
              const result = await getNotificationPermissions();
              return {
                status: result.status === "granted" ? "granted" : result.status === "denied" ? "denied" : "undetermined",
                canAskAgain: result.status !== "denied",
              };
            } catch (error) {
              return { status: "undetermined", canAskAgain: true };
            }
          },
        },
        {
          key: "battery_optimization",
          title: "Battery Optimization",
          description: "Allow the app to run efficiently in the background to ensure you receive order notifications on time.",
          microText: "Disabling battery optimization ensures continuous location tracking and timely notifications.",
          icon: "🔋",
          gradient: ["#f59e0b", "#d97706"],
          mandatory: false,
          showToggle: true,
          requestFn: async () => {
            if (Platform.OS === "android") {
              await openBatteryOptimizationSettings();
            }
            return { status: "granted", canAskAgain: false };
          },
          openSettingsFn: () => openBatteryOptimizationSettings(),
        },
        {
          key: "background_running",
          title: "Background Running",
          description: "Allow the app to run in the background so you can receive orders even when the app is not active.",
          microText: "This ensures you never miss an order opportunity while the app runs in the background.",
          icon: "🔄",
          gradient: ["#8b5cf6", "#7c3aed"],
          mandatory: false,
          showToggle: true,
          requestFn: async () => {
            if (Platform.OS === "android") {
              await openBackgroundRunningSettings();
            }
            return { status: "granted", canAskAgain: false };
          },
          openSettingsFn: () => openBackgroundRunningSettings(),
        },
      ].filter(step => !isWeb || step.key === "notifications");
    } catch (error) {
      console.warn("Error initializing permission steps:", error);
      return [];
    }
  }, [isWeb]);

  // Animate progress bar
  useEffect(() => {
    Animated.timing(progressAnim, {
      toValue: (currentStep + 1) / steps.length,
      duration: 500,
      useNativeDriver: false,
    }).start();
  }, [currentStep, steps.length]);

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

  // Monitor location services
  useEffect(() => {
    if (Platform.OS === "web" || currentStep !== 0) return;

    const checkLocation = async () => {
      try {
        const enabled = await permissionManager.checkLocationServicesEnabled();
        setLocationEnabled(enabled);
      } catch (error) {
        console.warn("Error checking location services:", error);
      }
    };

    checkLocation();
    const interval = setInterval(checkLocation, 2000);
    return () => clearInterval(interval);
  }, [currentStep]);

  // Re-check permissions when app returns from settings
  useEffect(() => {
    const subscription = AppState.addEventListener("change", async (nextAppState) => {
      if (nextAppState === "active" && currentStep < steps.length) {
        const step = steps[currentStep];
        if (step?.checkStatusFn) {
          try {
            const result = await step.checkStatusFn();
            setPermissionResults((prev) => ({ ...prev, [step.key]: result }));
            
            if (result.status === "granted") {
              setTimeout(() => {
                handleNextStep();
              }, 1000);
            }
          } catch (error) {
            console.warn("Error re-checking permission:", error);
          }
        }
      }
    });

    return () => subscription.remove();
  }, [currentStep, steps]);

  const handleNextStep = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep((prev) => prev + 1);
    } else {
      handleComplete();
    }
  };

  const handleComplete = async () => {
    try {
      const states = await permissionManager.getPermissionStates();
      await setPermissions(states);
      await setHasRequestedPermissions(true);
      if (session) {
        // User already logged in - go to home
        router.replace("/(tabs)/orders");
      } else {
        // New user - start onboarding flow
        router.replace("/(onboarding)/welcome");
      }
    } catch (error) {
      console.warn("Error completing permissions:", error);
      await setHasRequestedPermissions(true);
      if (session) {
        router.replace("/(tabs)/orders");
      } else {
        // New user - start onboarding flow
        router.replace("/(onboarding)/welcome");
      }
    }
  };

  const handleAllow = async () => {
    if (currentStep >= steps.length) {
      handleComplete();
      return;
    }

    const step = steps[currentStep];
    if (!step) {
      handleComplete();
      return;
    }

    setLoading(true);

    try {
      // Handle location permission with GPS check
      if (step.key === "location" && !isWeb) {
        const enabled = await permissionManager.checkLocationServicesEnabled();
        setLocationEnabled(enabled);
        
        if (!enabled) {
          // GPS not enabled - open location settings
          await step.openSettingsFn();
          setLoading(false);
          return;
        }
      }

      // For battery optimization and background running, open settings directly
      if (step.key === "battery_optimization" || step.key === "background_running") {
        await step.openSettingsFn();
        // Auto-proceed after opening settings
        setTimeout(() => {
          handleNextStep();
        }, 1500);
        setLoading(false);
        return;
      }

      // Request permission for other types
      const result = await step.requestFn();
      setPermissionResults((prev) => ({ ...prev, [step.key]: result }));

      // Handle location permission result
      if (step.key === "location") {
        if (result.status === "granted") {
          const enabled = await permissionManager.checkLocationServicesEnabled();
          if (enabled) {
            // Both permission and GPS enabled - but still redirect to settings
            // to ensure user selects "Allow all the time" (not just "While using app")
            await step.openSettingsFn();
            // Wait a bit, then auto-proceed when user returns
            setLoading(false);
            return;
          } else {
            // Permission granted but GPS not enabled
            await step.openSettingsFn();
            setLoading(false);
            return;
          }
        } else if (result.status === "denied" && !result.canAskAgain) {
          // Permanently denied - open settings
          await step.openSettingsFn();
          setLoading(false);
          return;
        } else if (result.status === "denied") {
          // Denied but can ask again - open settings to change
          await step.openSettingsFn();
          setLoading(false);
          return;
        }
      }

      // Handle notification permission - always redirect to settings after request
      // so user can enable sound and vibration
      if (step.key === "notifications") {
        if (result.status === "granted") {
          // Even if granted, redirect to settings to ensure sound/vibration are enabled
          await step.openSettingsFn();
          setLoading(false);
          return;
        } else if (result.status === "denied") {
          // Denied - open settings
          await step.openSettingsFn();
          setLoading(false);
          return;
        }
      }

      // Auto-proceed if permission was granted (for other permission types)
      if (result.status === "granted") {
        setTimeout(() => {
          handleNextStep();
        }, 1000);
        setLoading(false);
        return;
      }

      // Handle denied permissions - show retry option
      if (result.status === "denied") {
        if (result.canAskAgain) {
          // Can ask again - user can retry
          setLoading(false);
          return;
        } else if (!step.mandatory) {
          // Non-mandatory and permanently denied - allow skip
          handleNextStep();
          setLoading(false);
          return;
        } else {
          // Mandatory and permanently denied - open settings
          await step.openSettingsFn();
          setLoading(false);
          return;
        }
      }

      // Default: proceed to next step
      handleNextStep();
    } catch (error) {
      console.warn("Error requesting permission:", error);
      if (!step.mandatory) {
        handleNextStep();
      }
    } finally {
      setLoading(false);
    }
  };

  // Safety checks
  if (!steps || steps.length === 0) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centerContent}>
          <Logo size="large" vertical style={{ marginBottom: 24 }} />
          <Text style={styles.title}>Loading Permissions...</Text>
          <Button 
            onPress={handleComplete} 
            size="lg"
            className="w-full max-w-sm"
          >
            Continue to App
          </Button>
        </View>
      </SafeAreaView>
    );
  }

  if (currentStep >= steps.length) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centerContent}>
          <Logo size="large" vertical style={{ marginBottom: 24 }} />
          <Text style={styles.title}>All Set! 🎉</Text>
          <Text style={styles.subtitle}>
            You're ready to start delivering orders.
          </Text>
          <Button 
            onPress={handleComplete} 
            size="lg"
            className="w-full max-w-sm"
          >
            Continue to App
          </Button>
        </View>
      </SafeAreaView>
    );
  }

  const step = steps[currentStep];
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

  const result = permissionResults[step.key];
  const isGranted = result?.status === "granted";
  const isDenied = result?.status === "denied";
  const cannotAskAgain = result && !result.canAskAgain;

  // Calculate progress width
  const progressWidth = progressAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ["0%", "100%"],
  });

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView 
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
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
                }
              ]} 
            />
          </View>
          <Text style={styles.progressText}>
            Step {currentStep + 1} of {steps.length}
          </Text>
        </View>

        {/* Permission Card - Animated */}
        <Animated.View 
          style={[
            styles.cardContainer,
            {
              opacity: fadeAnim,
              transform: [
                { translateY: slideAnim },
                { scale: scaleAnim },
              ],
            }
          ]}
        >
          {Platform.OS === "web" ? (
            <View style={[styles.gradientCard, { backgroundColor: step.gradient[0] }]}>
              {/* Icon */}
              <View style={styles.iconContainer}>
                <Text style={styles.icon}>{step.icon}</Text>
              </View>

              {/* Title */}
              <Text style={styles.cardTitle}>{step.title}</Text>
              
              {/* Description */}
              <Text style={styles.cardDescription}>{step.description}</Text>

              {/* Micro Text */}
              <View style={styles.microTextContainer}>
                <Text style={styles.microText}>{step.microText}</Text>
              </View>

              {/* Mandatory Badge */}
              {step.mandatory && (
                <View style={styles.mandatoryBadge}>
                  <Text style={styles.mandatoryText}>Required</Text>
                </View>
              )}

              {/* Denied State */}
              {isDenied && cannotAskAgain && (
                <View style={styles.deniedContainer}>
                  <Text style={styles.deniedTitle}>Permission Denied</Text>
                  <Text style={styles.deniedText}>
                    Please enable this permission in your device settings to continue.
                  </Text>
                  <Button 
                    variant="outline" 
                    onPress={async () => {
                      if (step.openSettingsFn) {
                        await step.openSettingsFn();
                      }
                    }} 
                    size="sm" 
                    className="bg-white mt-3"
                  >
                    Open Settings
                  </Button>
                </View>
              )}

              {/* Location Services Warning */}
              {step.key === "location" && locationEnabled === false && (
                <View style={styles.warningContainer}>
                  <Text style={styles.warningText}>
                    ⚠️ Please enable GPS/Location services in your device settings
                  </Text>
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
              {/* Icon */}
              <View style={styles.iconContainer}>
                <Text style={styles.icon}>{step.icon}</Text>
              </View>

              {/* Title */}
              <Text style={styles.cardTitle}>{step.title}</Text>
              
              {/* Description */}
              <Text style={styles.cardDescription}>{step.description}</Text>

              {/* Micro Text */}
              <View style={styles.microTextContainer}>
                <Text style={styles.microText}>{step.microText}</Text>
              </View>

              {/* Mandatory Badge */}
              {step.mandatory && (
                <View style={styles.mandatoryBadge}>
                  <Text style={styles.mandatoryText}>Required</Text>
                </View>
              )}

              {/* Denied State */}
              {isDenied && cannotAskAgain && (
                <View style={styles.deniedContainer}>
                  <Text style={styles.deniedTitle}>Permission Denied</Text>
                  <Text style={styles.deniedText}>
                    Please enable this permission in your device settings to continue.
                  </Text>
                  <Button 
                    variant="outline" 
                    onPress={async () => {
                      if (step.openSettingsFn) {
                        await step.openSettingsFn();
                      }
                    }} 
                    size="sm" 
                    className="bg-white mt-3"
                  >
                    Open Settings
                  </Button>
                </View>
              )}

              {/* Location Services Warning */}
              {step.key === "location" && locationEnabled === false && (
                <View style={styles.warningContainer}>
                  <Text style={styles.warningText}>
                    ⚠️ Please enable GPS/Location services in your device settings
                  </Text>
                </View>
              )}
            </LinearGradient>
          )}
        </Animated.View>

        {/* Action Button */}
        <View style={styles.buttonContainer}>
          <Button
            onPress={handleAllow}
            loading={loading}
            disabled={loading}
            size="lg"
            className="w-full max-w-sm"
            style={styles.allowButton}
          >
            <View style={styles.buttonContent}>
              <Text style={styles.buttonText}>
                {isGranted ? "Continue" : "Allow & Continue"}
              </Text>
              {!isGranted && (
                <Text style={styles.buttonArrow}>→</Text>
              )}
            </View>
          </Button>

          {/* Skip option for non-mandatory permissions */}
          {!step.mandatory && !isGranted && (
            <Button
              variant="ghost"
              onPress={handleNextStep}
              disabled={loading}
              size="md"
              className="mt-4"
            >
              Skip for now
            </Button>
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
    paddingBottom: 40,
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
  deniedContainer: {
    backgroundColor: "rgba(239, 68, 68, 0.2)",
    borderRadius: 16,
    padding: 16,
    marginTop: 20,
    width: "100%",
  },
  deniedTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#ffffff",
    marginBottom: 8,
    textAlign: "center",
  },
  deniedText: {
    fontSize: 14,
    color: "rgba(255, 255, 255, 0.9)",
    textAlign: "center",
    marginBottom: 12,
  },
  warningContainer: {
    backgroundColor: "rgba(251, 191, 36, 0.2)",
    borderRadius: 12,
    padding: 12,
    marginTop: 16,
    width: "100%",
  },
  warningText: {
    fontSize: 13,
    color: "#ffffff",
    textAlign: "center",
    fontWeight: "600",
  },
  buttonContainer: {
    alignItems: "center",
    width: "100%",
  },
  allowButton: {
    minHeight: 56,
  },
  buttonContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  buttonText: {
    color: "#ffffff",
    fontSize: 18,
    fontWeight: "700",
  },
  buttonArrow: {
    color: "#ffffff",
    fontSize: 20,
    fontWeight: "700",
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