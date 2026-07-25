// @ts-nocheck — pending strict-mode cleanup; tracked in follow-up issue.
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
import { acquireAndCommitRiderLocation } from "@/src/services/location/riderLocationController";
import { useRiderLocationStore } from "@/src/stores/riderLocationStore";
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
    () => {
      if (Platform.OS === "web") {
        return PERMISSION_ONBOARDING_STEPS.filter((s) => s.key === "notifications");
      }
      // iOS has no per-app battery-optimization toggle — skip that step entirely
      // (treated as already satisfied; Background Running validates Always location).
      if (Platform.OS === "ios") {
        return PERMISSION_ONBOARDING_STEPS.filter((s) => s.key !== "battery_optimization");
      }
      return PERMISSION_ONBOARDING_STEPS;
    },
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
    // Required system-gated steps — no skip (must open Settings / OS dialog).
    if (
      step?.key === "location" ||
      step?.key === "background_running" ||
      step?.key === "battery_optimization"
    ) {
      return;
    }
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
      // Passive recheck (e.g. return from Settings): do not open settings again.
      const locationStatus = await smartPermissionHandler.isLocationFullyEnabled();
      if (!locationStatus.enabled) {
        if (locationStatus.reason) {
          setLocationIssue(locationStatus.reason);
        }
        return false;
      }

      const existing = useRiderLocationStore.getState().coords;
      if (!existing) {
        const acquisition = await acquireAndCommitRiderLocation({ assumeReady: true });
        if (!acquisition.ok) {
          setLocationIssue("denied");
          return false;
        }
      }

      const step = onboardingSteps[currentStep];
      if (step?.key === "location") {
        setPermissionStepGranted("location", true);
      }
      setLocationIssue(null);
      if (advanceOnSuccess) {
        setTimeout(() => handleNextStep(), 400);
      }
      return true;
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
      // Only persist granted when OS actually reports granted (no fake undetermined).
      await smartPermissionHandler.markPermissionGranted(step.key);
      applyStepGranted(step.key);
      pendingSettingsReturnRef.current = false;
      return true;
    }

    // Display-over-apps: Expo cannot read Settings.canDrawOverlays. After the
    // user returns from the real system screen, accept a soft completion once.
    if (
      step.key === "display_over_apps" &&
      pendingSettingsReturnRef.current &&
      Platform.OS === "android"
    ) {
      pendingSettingsReturnRef.current = false;
      await smartPermissionHandler.markPermissionGranted(step.key);
      applyStepGranted(step.key);
      return true;
    }

    if (
      step.key === "notifications" &&
      pendingSettingsReturnRef.current &&
      check.status !== "denied"
    ) {
      // Re-read after settings; only advance if truly granted (handled above).
      pendingSettingsReturnRef.current = false;
    }

    pendingSettingsReturnRef.current = false;
    return false;
  }, [
    applyLocationStatus,
    applyStepGranted,
    currentStep,
    onboardingSteps,
  ]);

  /** Skip steps that are already configured in the OS (never re-prompt). */
  // Chained via the currentStep effect below — when a step is already granted,
  // we auto-advance until we hit one that still needs user action.

  const runLocationAllowFlow = useCallback(async () => {
    const step = onboardingSteps[currentStep];
    if (!step || step.key !== "location") return;

    setLoading(true);
    try {
      const pipeline = await smartPermissionHandler.runLocationAllowPipeline({
        acquireFix: true,
      });
      await new Promise((resolve) => setTimeout(resolve, 200));

      if (pipeline.enabled && pipeline.fixAcquired) {
        setPermissionStepGranted("location", true);
        setLocationIssue(null);
        setTimeout(() => handleNextStep(), 400);
        return;
      }

      if (pipeline.reason === "fix_failed") {
        setLocationIssue("denied");
      } else if (pipeline.reason) {
        setLocationIssue(pipeline.reason);
      }
    } catch (error) {
      console.warn("Error handling location allow:", error);
    } finally {
      setLoading(false);
    }
  }, [currentStep, onboardingSteps, handleNextStep, setPermissionStepGranted]);

  useEffect(() => {
    setLocationIssue(null);
    let cancelled = false;
    // When landing on a step, auto-advance if the OS is already configured.
    void (async () => {
      const step = onboardingSteps[currentStep];
      if (!step || !permissionHydrated || hasRequestedPermissions) return;

      if (step.key === "location") {
        const ok = await smartPermissionHandler.isLocationFullyEnabled();
        if (cancelled || !ok.enabled) return;
        setPermissionStepGranted("location", true);
        setTimeout(() => {
          if (!cancelled) handleNextStep();
        }, 300);
        return;
      }

      // Only auto-advance steps we can read RELIABLY from the OS. Notifications
      // (and location, handled above) have trustworthy OS APIs. Battery,
      // background-running and display-over-apps rely on OEM-specific signals
      // that are unreliable — especially on MIUI, where expo-battery can report
      // "unrestricted" incorrectly and make battery + background (which share
      // that signal) both auto-skip. Never silently skip those: always show the
      // step and require an explicit Allow tap.
      if (step.key !== "notifications") return;

      const check = await smartPermissionHandler.checkPermission(step.key);
      if (cancelled || check.status !== "granted") return;
      setPermissionStepGranted(step.key, true);
      await smartPermissionHandler.markPermissionGranted(step.key);
      setTimeout(() => {
        if (!cancelled) handleNextStep();
      }, 300);
    })();
    return () => {
      cancelled = true;
    };
  }, [
    currentStep,
    permissionHydrated,
    hasRequestedPermissions,
    onboardingSteps,
    setPermissionStepGranted,
    handleNextStep,
  ]);

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
        onSkip={
          step.key === "location" ||
          step.key === "background_running" ||
          step.key === "battery_optimization"
            ? undefined
            : handleSkip
        }
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
