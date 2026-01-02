import React, { useState, useEffect } from "react";
import { View, Text, TextInput, ScrollView, KeyboardAvoidingView, Platform } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { useTranslation } from "react-i18next";
import { useOnboardingStore } from "@/src/stores/onboardingStore";
import { useSaveOnboardingStep } from "@/src/hooks/useOnboarding";
import { useSessionStore } from "@/src/stores/sessionStore";
import { Button } from "@/src/components/ui/Button";
import { colors } from "@/src/theme";

export default function DlRcScreen() {
  const { t } = useTranslation();
  const session = useSessionStore((s) => s.session);
  const { data, setData, setStep, hydrate } = useOnboardingStore();
  const saveStep = useSaveOnboardingStep();

  const [dlNumber, setDlNumber] = useState(data.dlNumber || "");
  const [rcNumber, setRcNumber] = useState(data.rcNumber || "");
  const [hasOwnVehicle, setHasOwnVehicle] = useState<boolean | undefined>(
    data.hasOwnVehicle !== undefined ? data.hasOwnVehicle : true
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  const handleContinue = async () => {
    if (hasOwnVehicle === undefined) {
      setError("Please select whether you have your own vehicle");
      return;
    }

    if (hasOwnVehicle) {
      if (!dlNumber.trim()) {
        setError("Please enter your Driving License number");
        return;
      }
      if (!rcNumber.trim()) {
        setError("Please enter your RC (Registration Certificate) number");
        return;
      }
    }

    setError(null);
    setLoading(true);

    try {
      // Save to local store
      await setData({
        dlNumber: dlNumber.trim(),
        rcNumber: rcNumber.trim(),
        hasOwnVehicle,
        currentStep: "dl_rc",
      });

      // Save to backend if riderId exists
      if (data.riderId && session?.accessToken) {
        await saveStep.mutateAsync({
          riderId: data.riderId,
          step: "dl_rc",
          data: {
            dlNumber: dlNumber.trim(),
            rcNumber: rcNumber.trim(),
            hasOwnVehicle,
          },
        });
      }

      // Navigate based on vehicle ownership
      if (hasOwnVehicle) {
        // Has own vehicle - go to PAN/Selfie
        await setStep("pan_selfie");
        router.push("/(onboarding)/pan-selfie");
      } else {
        // Rental/EV - go to rental/EV screen
        await setStep("rental_ev");
        router.push("/(onboarding)/rental-ev");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#FFFFFF" }}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={{ flexGrow: 1 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={{ flex: 1, paddingHorizontal: 24, paddingTop: 48, paddingBottom: 32 }}>
            {/* Header */}
            <View style={{ marginBottom: 32 }}>
              <Text style={{ fontSize: 30, fontWeight: "bold", color: "#111827", marginBottom: 8 }}>
                Vehicle Documents
              </Text>
              <Text style={{ fontSize: 16, color: "#4B5563" }}>
                Do you have your own vehicle with DL and RC?
              </Text>
            </View>

            {/* Vehicle Ownership Selection */}
            <View style={{ flex: 1, justifyContent: "center" }}>
              <View style={{ marginBottom: 24 }}>
                <View style={{ flexDirection: "row", gap: 12, marginBottom: 24 }}>
                  <Button
                    variant={hasOwnVehicle === true ? "primary" : "outline"}
                    onPress={() => setHasOwnVehicle(true)}
                    style={{ flex: 1 }}
                  >
                    Yes, I have my own vehicle
                  </Button>
                  <Button
                    variant={hasOwnVehicle === false ? "primary" : "outline"}
                    onPress={() => setHasOwnVehicle(false)}
                    style={{ flex: 1 }}
                  >
                    No, Rental/EV
                  </Button>
                </View>

                {hasOwnVehicle === true && (
                  <>
                    <View style={{ marginBottom: 16 }}>
                      <Text style={{ fontSize: 14, fontWeight: "500", color: "#374151", marginBottom: 8 }}>
                        Driving License Number
                      </Text>
                      <TextInput
                        value={dlNumber}
                        onChangeText={setDlNumber}
                        placeholder="Enter DL number"
                        placeholderTextColor={colors.gray[400]}
                        autoCapitalize="characters"
                        style={{
                          backgroundColor: "#F9FAFB",
                          borderWidth: 1,
                          borderColor: "#E5E7EB",
                          borderRadius: 12,
                          paddingHorizontal: 16,
                          paddingVertical: 16,
                          fontSize: 16,
                          color: "#111827",
                        }}
                      />
                    </View>

                    <View style={{ marginBottom: 16 }}>
                      <Text style={{ fontSize: 14, fontWeight: "500", color: "#374151", marginBottom: 8 }}>
                        RC (Registration Certificate) Number
                      </Text>
                      <TextInput
                        value={rcNumber}
                        onChangeText={setRcNumber}
                        placeholder="Enter RC number"
                        placeholderTextColor={colors.gray[400]}
                        autoCapitalize="characters"
                        style={{
                          backgroundColor: "#F9FAFB",
                          borderWidth: 1,
                          borderColor: "#E5E7EB",
                          borderRadius: 12,
                          paddingHorizontal: 16,
                          paddingVertical: 16,
                          fontSize: 16,
                          color: "#111827",
                        }}
                      />
                    </View>
                  </>
                )}

                {hasOwnVehicle === false && (
                  <View
                    style={{
                      padding: 16,
                      backgroundColor: "#FEF3C7",
                      borderWidth: 1,
                      borderColor: "#FDE68A",
                      borderRadius: 12,
                    }}
                  >
                    <Text style={{ fontSize: 14, color: "#92400E" }}>
                      You will be asked to upload rental agreement or EV proof in the next step.
                    </Text>
                  </View>
                )}
              </View>

              {error && (
                <View
                  style={{
                    marginBottom: 16,
                    padding: 12,
                    backgroundColor: "#FEF2F2",
                    borderWidth: 1,
                    borderColor: "#FECACA",
                    borderRadius: 8,
                  }}
                >
                  <Text style={{ fontSize: 14, color: colors.error[600] }}>{error}</Text>
                </View>
              )}

              <Button
                onPress={handleContinue}
                loading={loading || saveStep.isPending}
                disabled={loading || saveStep.isPending}
                size="lg"
              >
                Continue
              </Button>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

