import React, { useEffect } from "react";
import { View, Text, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { useTranslation } from "react-i18next";
import { useOnboardingStore } from "@/src/stores/onboardingStore";
import { useRiderStatus } from "@/src/hooks/useOnboarding";
import { Button } from "@/src/components/ui/Button";
import { colors } from "@/src/theme";

export default function PendingScreen() {
  const { t } = useTranslation();
  const { data, hydrate } = useOnboardingStore();
  const { data: riderStatus } = useRiderStatus(data.riderId);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  // Check if rider is approved
  useEffect(() => {
    if (riderStatus?.onboardingStatus === "approved") {
      // Rider approved - redirect to home
      router.replace("/(tabs)/orders");
    }
  }, [riderStatus]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#FFFFFF" }}>
      <ScrollView
        contentContainerStyle={{ flexGrow: 1, paddingHorizontal: 24, paddingTop: 48, paddingBottom: 32 }}
        showsVerticalScrollIndicator={false}
      >
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
          <View style={{ alignItems: "center", marginBottom: 32 }}>
            <Text style={{ fontSize: 64, marginBottom: 16 }}>⏳</Text>
            <Text style={{ fontSize: 30, fontWeight: "bold", color: "#111827", marginBottom: 8, textAlign: "center" }}>
              Pending Approval
            </Text>
            <Text style={{ fontSize: 16, color: "#4B5563", textAlign: "center", paddingHorizontal: 24 }}>
              Your documents have been submitted and payment has been received. Our team is reviewing your application.
            </Text>
          </View>

          <View
            style={{
              backgroundColor: "#FEF3C7",
              borderRadius: 12,
              padding: 16,
              marginBottom: 24,
              width: "100%",
            }}
          >
            <Text style={{ fontSize: 14, fontWeight: "600", color: "#92400E", marginBottom: 8 }}>
              What happens next?
            </Text>
            <Text style={{ fontSize: 14, color: "#78350F" }}>
              • Our team will verify your documents{"\n"}
              • You'll receive a notification once approved{"\n"}
              • You can start accepting orders after approval
            </Text>
          </View>

          <Button
            variant="outline"
            onPress={() => router.replace("/(tabs)/orders")}
            size="lg"
          >
            Check Status
          </Button>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
