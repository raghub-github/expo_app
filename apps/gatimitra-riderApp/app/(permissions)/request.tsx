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
import { RiderBootstrapScreen } from "@/src/components/RiderBootstrapScreen";
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

let notificationAsk: Promise<boolean> | null = null;

function askNotificationOnce(
  check: () => Promise<{ status: string }>,
  request: () => Promise<{ status: string }>
): Promise<boolean> {
  if (!notificationAsk) {
    notificationAsk = (async () => {
      const current = await check();
      if (current.status === "granted") return true;
      const asked = await request();
      return asked.status === "granted";
    })();
  }
  return notificationAsk;
}

export default function PermissionRequestScreen({ embedded = false }: { embedded?: boolean } = {}) {
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
  const [systemAttempt, setSystemAttempt] = useState(0);
  const [loading, setLoading] = useState(false);
  const [locationIssue, setLocationIssue] = useState<LocationBlockingReason | null>(null);
  const progressAnim = useRef(new Animated.Value(0)).current;
  const pendingSettingsReturnRef = useRef(false);
  /** Prevents Allow + AppState recheck from advancing the same step twice. */
  const advancingStepRef = useRef(false);
  /** One native system prompt per step. Do not reopen on every render. */
  const nativePromptedStepRef = useRef(-1);

  useEffect(() => {
    if (embedded) return;
    router.replace("/(auth)/login");
  }, [embedded]);

  useEffect(() => {
    if (embedded) return;
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

    // Sticky "wizard finished" only — never means OS location is granted.
    // Live FG location is owned by riderForegroundLocationGate.
    await setHasRequestedPermissions(true);

    if (embedded) return;

    if (session) {
      router.replace("/");
    } else {
      router.replace("/(auth)/login");
    }
  }, [embedded, session, setPermissions, setHasRequestedPermissions]);

  const lastAdvancedStepRef = useRef(-1);
  const handleNextStep = useCallback(() => {
    const from = currentStep;
    if (lastAdvancedStepRef.current >= from) return;
    lastAdvancedStepRef.current = from;
    advancingStepRef.current = false;
    pendingSettingsReturnRef.current = false;
    if (from < onboardingSteps.length - 1) {
      setCurrentStep(from + 1);
    } else {
      void handleComplete();
    }
  }, [currentStep, onboardingSteps.length, handleComplete]);

  const handleSkip = useCallback(() => {
    const step = onboardingSteps[currentStep];
    // Required system-gated steps — no skip (must open Settings / OS dialog).
    if (step?.key === "location") {
      return;
    }
    if (advancingStepRef.current) return;
    if (step) {
      setPermissionStepGranted(step.key, false);
    }
    pendingSettingsReturnRef.current = false;
    advancingStepRef.current = true;
    handleNextStep();
  }, [currentStep, onboardingSteps, handleNextStep, setPermissionStepGranted]);

  const applyStepGranted = useCallback(
    (stepKey: PermissionStepKey) => {
      if (advancingStepRef.current) return;
      advancingStepRef.current = true;
      pendingSettingsReturnRef.current = false;
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
      const updatedAtMs = useRiderLocationStore.getState().updatedAtMs;
      const fresh =
        existing &&
        updatedAtMs != null &&
        Date.now() - updatedAtMs <= 8_000;
      if (!fresh) {
        useRiderLocationStore.getState().clearFix();
        const acquisition = await acquireAndCommitRiderLocation({
          assumeReady: true,
          requireFresh: true,
        });
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
        if (!advancingStepRef.current) {
          advancingStepRef.current = true;
          setTimeout(() => handleNextStep(), 400);
        }
      }
      return true;
    },
    [currentStep, onboardingSteps, handleNextStep, setPermissionStepGranted]
  );

  const recheckCurrentStep = useCallback(async (): Promise<boolean> => {
    if (advancingStepRef.current) return false;
    const step = onboardingSteps[currentStep];
    if (!step) return false;

    if (step.key === "location") {
      return applyLocationStatus(true);
    }

    const check = await smartPermissionHandler.checkPermission(step.key);

    // OEM / settings-gated steps: expo-battery (and soft overlay cache) can
    // false-report granted. Only complete these after Allow sent the user to
    // Settings (pendingSettingsReturnRef), never on a random AppState flicker.
    const settingsGatedStep =
      step.key === "battery_optimization" ||
      step.key === "background_running" ||
      step.key === "display_over_apps";

    if (check.status === "granted") {
      if (settingsGatedStep && !pendingSettingsReturnRef.current) {
        return false;
      }
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

    // Notifications / other steps: keep waiting until OS reports granted.
    // Do not clear pendingSettingsReturnRef while the user may still be
    // enabling the toggle — only clear when we complete or leave the step.
    if (!settingsGatedStep && !pendingSettingsReturnRef.current) {
      return false;
    }

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
        if (!advancingStepRef.current) {
          advancingStepRef.current = true;
          setPermissionStepGranted("location", true);
          setLocationIssue(null);
          setTimeout(() => handleNextStep(), 400);
        }
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

  const advanceRef = useRef(handleNextStep);
  advanceRef.current = handleNextStep;

  const systemStep = onboardingSteps[currentStep]?.key;
  const isNativeDialogStep =
    systemStep === "location" || systemStep === "notifications";

  const promptedSystemStepRef = useRef(-1);

  useEffect(() => {
    if (!embedded || !permissionHydrated || hasRequestedPermissions) return;
    const step = onboardingSteps[currentStep];
    if (!step) return;
    if (step.key !== "location" && step.key !== "notifications") {
      return;
    }
    const stepIndex = currentStep;
    const stepKey = step.key;
    const batteryIndex = onboardingSteps.findIndex((item) => item.key === "battery_optimization");
    if (promptedSystemStepRef.current === currentStep && stepKey !== "notifications") return;
    promptedSystemStepRef.current = currentStep;

    void (async () => {
      let granted = false;
      try {
        if (stepKey === "location") {
          const { presentLocationPermissionDialog } = await import(
            "@/src/lib/riderForegroundLocationGate"
          );
          granted = await presentLocationPermissionDialog();
        } else {
          let sawDialog = false;
          let movedOn = false;
          const showBatterySheet = () => {
            if (movedOn || batteryIndex < 0) return;
            movedOn = true;
            setCurrentStep(batteryIndex);
          };
          const watch = AppState.addEventListener("change", (next) => {
            if (next === "inactive" || next === "background") sawDialog = true;
            if (next === "active" && sawDialog) showBatterySheet();
          });
          try {
            granted = await askNotificationOnce(
              () => smartPermissionHandler.checkPermission("notifications"),
              () => permissionManager.requestNotifications()
            );
          } finally {
            watch.remove();
          }
          showBatterySheet();
        }
      } catch (error) {
        console.warn("Error opening system permission:", error);
      }
      setPermissionStepGranted(stepKey, granted);
      if (stepKey === "notifications") return;
      // Location denied: do not advance the carousel into a blank native step.
      // Mark the soft wizard done and let RiderForegroundLocationGateHost own OS re-prompt.
      if (stepKey === "location" && !granted) {
        void handleComplete();
        return;
      }
      setCurrentStep((prev) => {
        if (prev !== stepIndex) return prev;
        return Math.min(stepIndex + 1, onboardingSteps.length - 1);
      });
    })();
  }, [
    currentStep,
    permissionHydrated,
    hasRequestedPermissions,
    onboardingSteps,
    setPermissionStepGranted,
    embedded,
    handleComplete,
  ]);

  useEffect(() => {
    Animated.timing(progressAnim, {
      toValue: (currentStep + 1) / onboardingSteps.length,
      duration: 500,
      useNativeDriver: false,
    }).start();
  }, [currentStep, onboardingSteps.length, progressAnim]);

  useEffect(() => {
    const step = onboardingSteps[currentStep];
    if (!step || step.key === "location" || step.key === "notifications") return;
    const subscription = AppState.addEventListener("change", async (nextAppState) => {
      if (nextAppState !== "active") return;
      await new Promise((resolve) => setTimeout(resolve, 800));
      try {
        await recheckCurrentStep();
      } catch (error) {
        console.warn("Error re-checking permission:", error);
      }
    });
    return () => subscription.remove();
  }, [currentStep, onboardingSteps, recheckCurrentStep]);

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
    // Mark before awaiting Intents so AppState "active" after Settings can complete the step.
    pendingSettingsReturnRef.current = true;
    try {
      const grantedNow = await smartPermissionHandler.handleAllow(step.key);
      if (grantedNow) {
        pendingSettingsReturnRef.current = false;
        applyStepGranted(step.key);
      } else {
        // Stay on this step until OS reports granted (or overlay soft-accept).
        pendingSettingsReturnRef.current = true;
      }
    } catch (error) {
      console.warn("Error handling allow:", error);
      // Still treat as settings-pending so a later return can re-check.
      pendingSettingsReturnRef.current = true;
    } finally {
      setLoading(false);
    }
  };

  if (!embedded) return null;

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

  const step = onboardingSteps[currentStep];
  if (!step || isNativeDialogStep) return null;

  return (
    <PermissionStepSheet
      visible
      step={step}
      stepIndex={currentStep}
      totalSteps={onboardingSteps.length}
      loading={loading}
      locationIssue={locationIssue}
      onAllow={handleAllow}
      onSkip={step.key === "location" ? undefined : handleSkip}
    />
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
