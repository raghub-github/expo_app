import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  View,
  Text,
  Platform,
  AppState,
  Animated,
  StyleSheet,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { permissionManager } from "@/src/services/permissions/permissionManager";
import { usePermissionStore } from "@/src/stores/permissionStore";
import { useSessionStore } from "@/src/stores/sessionStore";
import { useOnboardingGate } from "@/src/hooks/useOnboardingGate";
import { Logo } from "@/src/components/Logo";
import { colors } from "@/src/theme";
import { PremiumAllowButton } from "@/src/components/permissions/PremiumAllowButton";
import {
  PermissionStepSheet,
  type LocationBlockingReason,
} from "@/src/components/permissions/PermissionStepSheet";
import { smartPermissionHandler, PermissionStepKey } from "@/src/services/permissions/smartPermissionHandler";
import {
  PERMISSION_ONBOARDING_STEPS,
  type PermissionOnboardingStep,
} from "@/src/constants/permissionOnboardingSteps";

export default function PermissionRequestScreen() {
  const setPermissions = usePermissionStore((s) => s.setPermissions);
  const setHasRequestedPermissions = usePermissionStore((s) => s.setHasRequestedPermissions);
  const hasRequestedPermissions = usePermissionStore((s) => s.hasRequestedPermissions);
  const permissionHydrated = usePermissionStore((s) => s.hydrated);
  const setPermissionStepGranted = usePermissionStore((s) => s.setPermissionStepGranted);
  const session = useSessionStore((s) => s.session);
  const { ready: onboardingGateReady, href: onboardingHref } = useOnboardingGate();
  const postPermissionReplaceRef = useRef<string | null>(null);

  const onboardingSteps: PermissionOnboardingStep[] = React.useMemo(
    () =>
      Platform.OS === "web"
        ? PERMISSION_ONBOARDING_STEPS.filter((s) => s.key === "notifications")
        : PERMISSION_ONBOARDING_STEPS,
    []
  );

  const [currentStep, setCurrentStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [locationIssue, setLocationIssue] = useState<LocationBlockingReason | null>(null);
  const progressAnim = useRef(new Animated.Value(0)).current;
  const pendingSettingsReturnRef = useRef(false);

  useEffect(() => {
    if (!hasRequestedPermissions || !permissionHydrated) return;
    if (session) {
      if (!onboardingGateReady) return;
      if (!onboardingHref) return;
      const target = onboardingHref as string;
      if (postPermissionReplaceRef.current === target) return;
      postPermissionReplaceRef.current = target;
      router.replace(onboardingHref);
      return;
    }
    if (postPermissionReplaceRef.current === "/(auth)/login") return;
    postPermissionReplaceRef.current = "/(auth)/login";
    router.replace("/(auth)/login");
  }, [
    hasRequestedPermissions,
    permissionHydrated,
    session,
    onboardingGateReady,
    onboardingHref,
  ]);

  const handleComplete = useCallback(async () => {
    try {
      const states = await permissionManager.getPermissionStates();
      setPermissions(states);
    } catch (error) {
      console.warn("Error saving permission states:", error);
    }

    await setHasRequestedPermissions(true);

    if (session) {
      router.replace("/");
    } else {
      router.replace("/(auth)/login");
    }
  }, [session, setPermissions, setHasRequestedPermissions]);

  const handleNextStep = useCallback(() => {
    if (currentStep < onboardingSteps.length - 1) {
      setCurrentStep((prev) => prev + 1);
    } else {
      void handleComplete();
    }
  }, [currentStep, onboardingSteps.length, handleComplete]);

  const handleSkip = useCallback(() => {
    const step = onboardingSteps[currentStep];
    if (step) {
      setPermissionStepGranted(step.key, false);
    }
    pendingSettingsReturnRef.current = false;
    handleNextStep();
  }, [currentStep, onboardingSteps, handleNextStep, setPermissionStepGranted]);

  const applyStepGranted = useCallback(
    (stepKey: PermissionStepKey) => {
      setPermissionStepGranted(stepKey, true);
      setTimeout(() => handleNextStep(), 400);
    },
    [handleNextStep, setPermissionStepGranted]
  );

  const applyLocationStatus = useCallback(
    async (advanceOnSuccess = true) => {
      const locationStatus = await smartPermissionHandler.isLocationFullyEnabled();
      if (locationStatus.enabled) {
        const step = onboardingSteps[currentStep];
        if (step?.key === "location") {
          setPermissionStepGranted("location", true);
        }
        setLocationIssue(null);
        if (advanceOnSuccess) {
          setTimeout(() => handleNextStep(), 400);
        }
        return true;
      }

      if (locationStatus.reason) {
        setLocationIssue(locationStatus.reason);
      }
      return false;
    },
    [currentStep, onboardingSteps, handleNextStep, setPermissionStepGranted]
  );

  const recheckCurrentStep = useCallback(async (): Promise<boolean> => {
    const step = onboardingSteps[currentStep];
    if (!step) return false;

    if (step.key === "location") {
      return applyLocationStatus(true);
    }

    const check = await smartPermissionHandler.checkPermission(step.key);
    if (check.status === "granted") {
      await smartPermissionHandler.markPermissionGranted(step.key);
      applyStepGranted(step.key);
      return true;
    }

    if (
      check.status === "undetermined" &&
      (step.key === "battery_optimization" ||
        step.key === "background_running" ||
        step.key === "display_over_apps")
    ) {
      setPermissionStepGranted(step.key, true);
      await smartPermissionHandler.markPermissionGranted(step.key);
      setTimeout(() => handleNextStep(), 400);
      return true;
    }

    if (
      step.key === "notifications" &&
      pendingSettingsReturnRef.current &&
      check.status !== "denied"
    ) {
      pendingSettingsReturnRef.current = false;
      applyStepGranted(step.key);
      return true;
    }

    pendingSettingsReturnRef.current = false;
    return false;
  }, [
    applyLocationStatus,
    applyStepGranted,
    currentStep,
    onboardingSteps,
    handleNextStep,
    setPermissionStepGranted,
  ]);

  const runLocationAllowFlow = useCallback(async () => {
    const step = onboardingSteps[currentStep];
    if (!step || step.key !== "location") return;

    setLoading(true);
    try {
      await smartPermissionHandler.handleLocationAllowAction();
      await new Promise((resolve) => setTimeout(resolve, 400));
      await applyLocationStatus(true);
    } catch (error) {
      console.warn("Error handling location allow:", error);
    } finally {
      setLoading(false);
    }
  }, [applyLocationStatus, currentStep, onboardingSteps]);

  useEffect(() => {
    setLocationIssue(null);
  }, [currentStep]);

  useEffect(() => {
    Animated.timing(progressAnim, {
      toValue: (currentStep + 1) / onboardingSteps.length,
      duration: 500,
      useNativeDriver: false,
    }).start();
  }, [currentStep, onboardingSteps.length, progressAnim]);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", async (nextAppState) => {
      if (nextAppState === "active" && currentStep < onboardingSteps.length) {
        await new Promise((resolve) => setTimeout(resolve, 800));
        try {
          await recheckCurrentStep();
        } catch (error) {
          console.warn("Error re-checking permission:", error);
        }
      }
    });

    return () => subscription.remove();
  }, [currentStep, onboardingSteps.length, recheckCurrentStep]);

  const handleAllow = async () => {
    const step = onboardingSteps[currentStep];
    if (!step) {
      void handleComplete();
      return;
    }

    if (step.key === "location") {
      await runLocationAllowFlow();
      return;
    }

    setLoading(true);
    try {
      const grantedNow = await smartPermissionHandler.handleAllow(step.key);
      if (grantedNow) {
        pendingSettingsReturnRef.current = false;
        applyStepGranted(step.key);
      } else {
        pendingSettingsReturnRef.current = true;
      }
    } catch (error) {
      console.warn("Error handling allow:", error);
    } finally {
      setLoading(false);
    }
  };

  if (!permissionHydrated) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centerContent}>
          <Logo size="large" vertical style={{ marginBottom: 24 }} />
          <Text style={styles.title}>Loading...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (hasRequestedPermissions) {
    if (session) {
      if (!onboardingGateReady) {
        return (
          <SafeAreaView style={styles.container}>
            <View style={styles.centerContent}>
              <Logo size="large" vertical style={{ marginBottom: 24 }} />
              <Text style={styles.title}>Loading...</Text>
            </View>
          </SafeAreaView>
        );
      }
      if (onboardingHref) {
        return (
          <SafeAreaView style={styles.container}>
            <View style={styles.centerContent}>
              <Logo size="large" vertical style={{ marginBottom: 24 }} />
              <Text style={styles.title}>Loading...</Text>
            </View>
          </SafeAreaView>
        );
      }
    }
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centerContent}>
          <Logo size="large" vertical style={{ marginBottom: 24 }} />
          <Text style={styles.title}>Loading...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (currentStep >= onboardingSteps.length) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centerContent}>
          <Logo size="large" vertical style={{ marginBottom: 24 }} />
          <Text style={styles.title}>All Set!</Text>
          <PremiumAllowButton onPress={() => void handleComplete()} />
        </View>
      </SafeAreaView>
    );
  }

  const step = onboardingSteps[currentStep];
  const progressWidth = progressAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ["0%", "100%"],
  });

  return (
    <View style={styles.screen}>
      <SafeAreaView style={styles.backdrop} edges={["top"]}>
        <View style={styles.header}>
          <Logo size="medium" />
        </View>

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
        </View>

        <Text style={styles.backdropHint}>Set up permissions to start delivering</Text>
      </SafeAreaView>

      <PermissionStepSheet
        visible
        step={step}
        stepIndex={currentStep}
        totalSteps={onboardingSteps.length}
        loading={loading}
        locationIssue={locationIssue}
        onAllow={step.key === "location" ? runLocationAllowFlow : handleAllow}
        onSkip={handleSkip}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#f1f5f9",
  },
  backdrop: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 12,
  },
  container: {
    flex: 1,
    backgroundColor: "#ffffff",
  },
  centerContent: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  header: {
    alignItems: "center",
    marginBottom: 24,
  },
  backdropHint: {
    fontSize: 15,
    color: colors.gray[500],
    textAlign: "center",
    marginTop: 8,
    paddingHorizontal: 16,
  },
  progressContainer: {
    marginBottom: 8,
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
  title: {
    fontSize: 28,
    fontWeight: "bold",
    color: colors.gray[900],
    marginBottom: 12,
    textAlign: "center",
  },
});
