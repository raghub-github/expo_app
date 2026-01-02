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

/**
 * Format Aadhaar number with dashes: XXXX-XXXX-1234
 */
function formatAadhaar(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 12);
  if (digits.length <= 4) return digits;
  if (digits.length <= 8) return `${digits.slice(0, 4)}-${digits.slice(4)}`;
  return `${digits.slice(0, 4)}-${digits.slice(4, 8)}-${digits.slice(8)}`;
}

export default function AadhaarScreen() {
  const { t } = useTranslation();
  const session = useSessionStore((s) => s.session);
  const { data, setData, setStep, hydrate } = useOnboardingStore();
  const saveStep = useSaveOnboardingStep();

  const [aadhaarNumber, setAadhaarNumber] = useState(data.aadhaarNumber || "");
  const [fullName, setFullName] = useState(data.fullName || "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  const handleAadhaarChange = (text: string) => {
    const formatted = formatAadhaar(text);
    setAadhaarNumber(formatted);
  };

  const handleContinue = async () => {
    if (aadhaarNumber.replace(/\D/g, "").length !== 12) {
      setError("Please enter a valid 12-digit Aadhaar number");
      return;
    }

    if (!fullName.trim() || fullName.trim().length < 3) {
      setError("Please enter your full name (minimum 3 characters)");
      return;
    }

    setError(null);
    setLoading(true);

    try {
      // Save to local store
      await setData({
        aadhaarNumber: aadhaarNumber.replace(/\D/g, ""),
        fullName: fullName.trim(),
        currentStep: "aadhaar_name",
      });

      // Save to backend if riderId exists
      if (data.riderId && session?.accessToken) {
        await saveStep.mutateAsync({
          riderId: data.riderId,
          step: "aadhaar_name",
          data: {
            aadhaarNumber: aadhaarNumber.replace(/\D/g, ""),
            fullName: fullName.trim(),
          },
        });
      }

      // Move to next step
      await setStep("dl_rc");
      router.push("/(onboarding)/dl-rc");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const maskedAadhaar = aadhaarNumber.replace(/\d(?=\d{4})/g, "X");

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
                Aadhaar Verification
              </Text>
              <Text style={{ fontSize: 16, color: "#4B5563" }}>
                Enter your Aadhaar number and full name as per Aadhaar card
              </Text>
            </View>

            {/* Form */}
            <View style={{ flex: 1, justifyContent: "center" }}>
              <View style={{ marginBottom: 24 }}>
                <Text style={{ fontSize: 14, fontWeight: "500", color: "#374151", marginBottom: 8 }}>
                  Aadhaar Number
                </Text>
                <TextInput
                  value={aadhaarNumber}
                  onChangeText={handleAadhaarChange}
                  placeholder="XXXX-XXXX-1234"
                  placeholderTextColor={colors.gray[400]}
                  keyboardType="number-pad"
                  maxLength={14} // 12 digits + 2 dashes
                  style={{
                    backgroundColor: "#F9FAFB",
                    borderWidth: 1,
                    borderColor: "#E5E7EB",
                    borderRadius: 12,
                    paddingHorizontal: 16,
                    paddingVertical: 16,
                    fontSize: 18,
                    color: "#111827",
                    letterSpacing: 2,
                  }}
                />
                {aadhaarNumber.length > 0 && (
                  <Text style={{ fontSize: 12, color: "#6B7280", marginTop: 4 }}>
                    Masked: {maskedAadhaar}
                  </Text>
                )}
              </View>

              <View style={{ marginBottom: 24 }}>
                <Text style={{ fontSize: 14, fontWeight: "500", color: "#374151", marginBottom: 8 }}>
                  Full Name (as per Aadhaar)
                </Text>
                <TextInput
                  value={fullName}
                  onChangeText={setFullName}
                  placeholder="Enter your full name"
                  placeholderTextColor={colors.gray[400]}
                  autoCapitalize="words"
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

