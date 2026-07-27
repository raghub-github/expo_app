/**
 * Method-selection was removed from the rider journey.
 * Super Admin verification policy on the Aadhaar step decides the path:
 *   auto   → DigiLocker / Cashfree only
 *   manual → photo upload only
 *   hybrid → DigiLocker first, photo upload on fallback
 *
 * This screen only exists as a redirect safety net if an old deep-link lands here.
 */
import { useEffect } from "react";
import { View, ActivityIndicator, StyleSheet } from "react-native";
import { router } from "expo-router";
import { useOnboardingStore } from "@/src/stores/onboardingStore";
import { useRiderStatus, useVerificationModes } from "@/src/hooks/useOnboarding";
import { resolveOnboardingHref } from "@/src/lib/onboarding-routes";
import { colors } from "@/src/theme";

export default function MethodSelectionScreen() {
  const { data, setData } = useOnboardingStore();
  const { data: riderStatus } = useRiderStatus(data.riderId);
  const { data: modesData, isFetched } = useVerificationModes();

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      const aadhaarMode = String(
        modesData?.modes?.aadhaar_digilocker ?? modesData?.modes?.aadhaar ?? "manual"
      ).toLowerCase();
      const method =
        aadhaarMode === "auto" || aadhaarMode === "hybrid" ? "policy" : "manual";
      await setData({ onboardingMethod: method });

      if (cancelled) return;

      const href = resolveOnboardingHref(
        riderStatus?.onboardingStatus ?? "in_progress",
        data.currentStep ?? "aadhaar_name",
        (riderStatus?.nextOnboardingStep as "aadhaar_name" | null) ?? "aadhaar_name",
        {
          completedOnboardingSteps: riderStatus?.completedOnboardingSteps ?? [],
        }
      );
      router.replace(href === "/(onboarding)/method-selection" ? "/(onboarding)/aadhaar" : href);
    };

    // Wait for modes when possible so onboardingMethod matches policy; don't block forever.
    if (isFetched || !data.riderId) {
      void run();
    } else {
      const t = setTimeout(() => {
        void run();
      }, 800);
      return () => {
        cancelled = true;
        clearTimeout(t);
      };
    }

    return () => {
      cancelled = true;
    };
  }, [
    data.currentStep,
    data.riderId,
    isFetched,
    modesData?.modes,
    riderStatus?.completedOnboardingSteps,
    riderStatus?.nextOnboardingStep,
    riderStatus?.onboardingStatus,
    setData,
  ]);

  return (
    <View style={styles.root}>
      <ActivityIndicator size="large" color={colors.primary?.[500] ?? "#22a745"} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#f4fbf6",
  },
});
