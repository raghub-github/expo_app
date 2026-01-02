import React, { useState, useEffect } from "react";
import { View, Text, ScrollView, Image, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { useTranslation } from "react-i18next";
import { useOnboardingStore } from "@/src/stores/onboardingStore";
import { useSubmitOnboarding } from "@/src/hooks/useOnboarding";
import { useSessionStore } from "@/src/stores/sessionStore";
import { Button } from "@/src/components/ui/Button";
import { colors } from "@/src/theme";

export default function ReviewScreen() {
  const { t } = useTranslation();
  const session = useSessionStore((s) => s.session);
  const { data, hydrate, clear } = useOnboardingStore();
  const submitOnboarding = useSubmitOnboarding();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  const handleSubmit = async () => {
    if (!data.riderId) {
      setError("Rider ID not found. Please start over.");
      return;
    }

    // Validate all required fields
    if (!data.aadhaarNumber || !data.fullName) {
      setError("Aadhaar and name are required");
      return;
    }

    if (!data.panNumber || !data.selfieSignedUrl) {
      setError("PAN and selfie are required");
      return;
    }

    if (data.hasOwnVehicle === undefined) {
      setError("Vehicle information is required");
      return;
    }

    if (data.hasOwnVehicle && (!data.dlNumber || !data.rcNumber)) {
      setError("DL and RC are required for own vehicle");
      return;
    }

    if (!data.hasOwnVehicle && (!data.rentalProofSignedUrl && !data.evProofSignedUrl)) {
      setError("Rental/EV proof is required");
      return;
    }

    setError(null);
    setLoading(true);

    try {
      await submitOnboarding.mutateAsync({
        riderId: data.riderId,
        data: {
          aadhaarNumber: data.aadhaarNumber,
          fullName: data.fullName!,
          dlNumber: data.dlNumber,
          rcNumber: data.rcNumber,
          hasOwnVehicle: data.hasOwnVehicle,
          rentalProofSignedUrl: data.rentalProofSignedUrl,
          evProofSignedUrl: data.evProofSignedUrl,
          maxSpeedDeclaration: data.maxSpeedDeclaration,
          panNumber: data.panNumber,
          selfieSignedUrl: data.selfieSignedUrl,
        },
      });

      // Clear onboarding data
      await clear();

      // Navigate to payment screen (after document submission, before approval)
      router.replace("/(onboarding)/payment");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to submit. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const formatAadhaar = (num: string) => {
    if (num.length !== 12) return num;
    return `XXXX-XXXX-${num.slice(-4)}`;
  };

  const formatPan = (pan: string) => {
    if (pan.length !== 10) return pan;
    return `XXXXX${pan.slice(-5)}`;
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#FFFFFF" }}>
      <ScrollView
        contentContainerStyle={{ flexGrow: 1, paddingHorizontal: 24, paddingTop: 48, paddingBottom: 32 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={{ marginBottom: 32 }}>
          <Text style={{ fontSize: 30, fontWeight: "bold", color: "#111827", marginBottom: 8 }}>
            Review & Submit
          </Text>
          <Text style={{ fontSize: 16, color: "#4B5563" }}>
            Please review all your information before submitting
          </Text>
        </View>

        {/* Review Sections */}
        <View style={{ flex: 1 }}>
          {/* Aadhaar & Name */}
          <View
            style={{
              backgroundColor: "#F9FAFB",
              borderRadius: 12,
              padding: 16,
              marginBottom: 16,
            }}
          >
            <Text style={{ fontSize: 16, fontWeight: "600", color: "#111827", marginBottom: 12 }}>
              Personal Information
            </Text>
            <View style={{ marginBottom: 8 }}>
              <Text style={{ fontSize: 14, color: "#6B7280" }}>Aadhaar</Text>
              <Text style={{ fontSize: 16, fontWeight: "500", color: "#111827" }}>
                {data.aadhaarNumber ? formatAadhaar(data.aadhaarNumber) : "Not provided"}
              </Text>
            </View>
            <View>
              <Text style={{ fontSize: 14, color: "#6B7280" }}>Full Name</Text>
              <Text style={{ fontSize: 16, fontWeight: "500", color: "#111827" }}>
                {data.fullName || "Not provided"}
              </Text>
            </View>
          </View>

          {/* Vehicle Information */}
          <View
            style={{
              backgroundColor: "#F9FAFB",
              borderRadius: 12,
              padding: 16,
              marginBottom: 16,
            }}
          >
            <Text style={{ fontSize: 16, fontWeight: "600", color: "#111827", marginBottom: 12 }}>
              Vehicle Information
            </Text>
            <View style={{ marginBottom: 8 }}>
              <Text style={{ fontSize: 14, color: "#6B7280" }}>Vehicle Type</Text>
              <Text style={{ fontSize: 16, fontWeight: "500", color: "#111827" }}>
                {data.hasOwnVehicle ? "Own Vehicle" : "Rental/EV"}
              </Text>
            </View>
            {data.hasOwnVehicle ? (
              <>
                <View style={{ marginBottom: 8 }}>
                  <Text style={{ fontSize: 14, color: "#6B7280" }}>DL Number</Text>
                  <Text style={{ fontSize: 16, fontWeight: "500", color: "#111827" }}>
                    {data.dlNumber || "Not provided"}
                  </Text>
                </View>
                <View>
                  <Text style={{ fontSize: 14, color: "#6B7280" }}>RC Number</Text>
                  <Text style={{ fontSize: 16, fontWeight: "500", color: "#111827" }}>
                    {data.rcNumber || "Not provided"}
                  </Text>
                </View>
              </>
            ) : (
              <>
                <View style={{ marginBottom: 8 }}>
                  <Text style={{ fontSize: 14, color: "#6B7280" }}>Document Type</Text>
                  <Text style={{ fontSize: 16, fontWeight: "500", color: "#111827" }}>
                    {data.rentalProofSignedUrl ? "Rental Agreement" : data.evProofSignedUrl ? "EV Proof" : "Not provided"}
                  </Text>
                </View>
                {data.maxSpeedDeclaration && (
                  <View>
                    <Text style={{ fontSize: 14, color: "#6B7280" }}>Max Speed</Text>
                    <Text style={{ fontSize: 16, fontWeight: "500", color: "#111827" }}>
                      {data.maxSpeedDeclaration} km/h
                    </Text>
                  </View>
                )}
              </>
            )}
          </View>

          {/* PAN & Selfie */}
          <View
            style={{
              backgroundColor: "#F9FAFB",
              borderRadius: 12,
              padding: 16,
              marginBottom: 16,
            }}
          >
            <Text style={{ fontSize: 16, fontWeight: "600", color: "#111827", marginBottom: 12 }}>
              PAN & Selfie
            </Text>
            <View style={{ marginBottom: 8 }}>
              <Text style={{ fontSize: 14, color: "#6B7280" }}>PAN Number</Text>
              <Text style={{ fontSize: 16, fontWeight: "500", color: "#111827" }}>
                {data.panNumber ? formatPan(data.panNumber) : "Not provided"}
              </Text>
            </View>
            <View>
              <Text style={{ fontSize: 14, color: "#6B7280", marginBottom: 8 }}>Selfie</Text>
              {data.selfieUri ? (
                <Image
                  source={{ uri: data.selfieUri }}
                  style={{ width: "100%", height: 200, borderRadius: 12 }}
                  resizeMode="cover"
                />
              ) : (
                <Text style={{ fontSize: 14, color: "#EF4444" }}>Not provided</Text>
              )}
            </View>
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
            onPress={handleSubmit}
            loading={loading || submitOnboarding.isPending}
            disabled={loading || submitOnboarding.isPending}
            size="lg"
            style={{ marginTop: 8 }}
          >
            Submit for Approval
          </Button>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

