import React, { useEffect } from "react";
import { View, Text, ScrollView, ActivityIndicator, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { router } from "expo-router";
import { useLocationCapture } from "@/src/hooks/useLocationCapture";
import { useOnboardingStore } from "@/src/stores/onboardingStore";
import { useSessionStore } from "@/src/stores/sessionStore";
import { Button } from "@/src/components/ui/Button";
import { colors } from "@/src/theme";

export default function LocationScreen() {
  const { t } = useTranslation();
  const { data, loading, error, retry } = useLocationCapture(true);
  const { setData } = useOnboardingStore();
  const session = useSessionStore((s) => s.session);

  // Save location data to store when captured
  useEffect(() => {
    if (data) {
      void setData({
        lat: data.lat,
        lon: data.lon,
        city: data.city,
        state: data.state,
        pincode: data.pincode,
        address: data.address,
      });
    }
  }, [data, setData]);

  const handleContinue = async () => {
    if (!data) {
      Alert.alert("Location Required", "Please wait for location to be captured or retry.");
      return;
    }

    // Location is already saved to store via useEffect
    // Navigate based on session status
    if (session) {
      // If user is logged in, go to orders
      router.replace("/(tabs)/orders");
    } else {
      // If no session, go to welcome screen to start onboarding
      router.replace("/(onboarding)/welcome");
    }
  };

  const handleRetry = async () => {
    await retry();
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#FFFFFF" }}>
      <ScrollView
        contentContainerStyle={{ flexGrow: 1, paddingHorizontal: 24, paddingTop: 48, paddingBottom: 32 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={{ alignItems: "center", marginBottom: 48 }}>
          <Text style={{ fontSize: 28, fontWeight: "bold", color: "#111827", marginBottom: 8, textAlign: "center" }}>
            Capture Your Location
          </Text>
          <Text style={{ fontSize: 16, color: "#6B7280", textAlign: "center" }}>
            We need your location to provide accurate delivery services
          </Text>
        </View>

        {/* Content */}
        <View style={{ flex: 1, justifyContent: "center" }}>
          {loading && (
            <View style={{ alignItems: "center", marginBottom: 32 }}>
              <ActivityIndicator size="large" color={colors.primary[500]} />
              <Text style={{ fontSize: 16, color: "#6B7280", marginTop: 16, textAlign: "center" }}>
                Getting your location...
              </Text>
              <Text style={{ fontSize: 14, color: "#9CA3AF", marginTop: 8, textAlign: "center" }}>
                This may take a few seconds
              </Text>
            </View>
          )}

          {error && (
            <View
              style={{
                backgroundColor: "#FEF2F2",
                borderWidth: 1,
                borderColor: "#FECACA",
                borderRadius: 12,
                padding: 16,
                marginBottom: 24,
              }}
            >
              <Text style={{ fontSize: 16, fontWeight: "600", color: colors.error[700], marginBottom: 8 }}>
                Location Error
              </Text>
              <Text style={{ fontSize: 14, color: colors.error[600], marginBottom: 16 }}>{error}</Text>
              <Button onPress={handleRetry} variant="outline" size="sm">
                Retry
              </Button>
            </View>
          )}

          {data && !loading && (
            <View
              style={{
                backgroundColor: "#F9FAFB",
                borderRadius: 12,
                padding: 20,
                marginBottom: 24,
              }}
            >
              <Text style={{ fontSize: 18, fontWeight: "600", color: "#111827", marginBottom: 16 }}>
                Location Captured
              </Text>

              <View style={{ marginBottom: 12 }}>
                <Text style={{ fontSize: 14, color: "#6B7280", marginBottom: 4 }}>Address</Text>
                <Text style={{ fontSize: 16, fontWeight: "500", color: "#111827" }}>{data.address}</Text>
              </View>

              <View style={{ flexDirection: "row", marginBottom: 12 }}>
                <View style={{ flex: 1, marginRight: 8 }}>
                  <Text style={{ fontSize: 14, color: "#6B7280", marginBottom: 4 }}>City</Text>
                  <Text style={{ fontSize: 16, fontWeight: "500", color: "#111827" }}>{data.city}</Text>
                </View>
                <View style={{ flex: 1, marginLeft: 8 }}>
                  <Text style={{ fontSize: 14, color: "#6B7280", marginBottom: 4 }}>State</Text>
                  <Text style={{ fontSize: 16, fontWeight: "500", color: "#111827" }}>{data.state}</Text>
                </View>
              </View>

              {data.pincode && (
                <View style={{ marginBottom: 12 }}>
                  <Text style={{ fontSize: 14, color: "#6B7280", marginBottom: 4 }}>Pincode</Text>
                  <Text style={{ fontSize: 16, fontWeight: "500", color: "#111827" }}>{data.pincode}</Text>
                </View>
              )}

              <View style={{ marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: "#E5E7EB" }}>
                <Text style={{ fontSize: 12, color: "#9CA3AF", marginBottom: 4 }}>Coordinates</Text>
                <Text style={{ fontSize: 12, color: "#6B7280", fontFamily: "monospace" }}>
                  {data.lat.toFixed(8)}, {data.lon.toFixed(8)}
                </Text>
              </View>

              <Button onPress={handleRetry} variant="outline" size="sm" style={{ marginTop: 16 }}>
                Update Location
              </Button>
            </View>
          )}
        </View>

        {/* Continue Button */}
        <View style={{ marginTop: 32 }}>
          <Button
            onPress={handleContinue}
            loading={loading}
            disabled={!data || loading}
            size="lg"
          >
            Continue
          </Button>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
