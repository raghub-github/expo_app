import React, { useState, useEffect } from "react";
import { View, Text, TextInput, ScrollView, KeyboardAvoidingView, Platform, Image, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import { useTranslation } from "react-i18next";
import { useOnboardingStore } from "@/src/stores/onboardingStore";
import { useSaveOnboardingStep } from "@/src/hooks/useOnboarding";
import { useSessionStore } from "@/src/stores/sessionStore";
import { uploadToR2 } from "@/src/services/storage/cloudflareR2";
import { Button } from "@/src/components/ui/Button";
import { colors } from "@/src/theme";

/**
 * Format PAN: XXXXX1234X (show only last 5 chars)
 */
function formatPan(value: string): string {
  const alphanumeric = value.replace(/[^A-Z0-9]/gi, "").toUpperCase().slice(0, 10);
  return alphanumeric;
}

export default function PanSelfieScreen() {
  const { t } = useTranslation();
  const session = useSessionStore((s) => s.session);
  const { data, setData, setStep, hydrate } = useOnboardingStore();
  const saveStep = useSaveOnboardingStep();

  const [panNumber, setPanNumber] = useState(data.panNumber || "");
  const [selfieUri, setSelfieUri] = useState<string | null>(data.selfieUri || null);
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  const requestCameraPermission = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permission Required", "Camera permission is required to capture selfie");
      return false;
    }
    return true;
  };

  const handleCaptureSelfie = async () => {
    const hasPermission = await requestCameraPermission();
    if (!hasPermission) return;

    setError(null);

    try {
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1], // Square for selfie
        quality: 0.9,
      });

      if (!result.canceled && result.assets[0]) {
        setSelfieUri(result.assets[0].uri);
      }
    } catch (e) {
      setError("Failed to capture selfie. Please try again.");
    }
  };

  const handleContinue = async () => {
    if (!panNumber || panNumber.length !== 10) {
      setError("Please enter a valid 10-character PAN number");
      return;
    }

    if (!selfieUri) {
      setError("Please capture your selfie");
      return;
    }

    setError(null);
    setLoading(true);
    setUploading(true);

    try {
      if (!session?.accessToken) {
        throw new Error("Not authenticated");
      }

      // Upload selfie to R2
      const uploadResult = await uploadToR2(
        selfieUri,
        "selfies",
        session.accessToken,
        `selfie-${Date.now()}.jpg`
      );

      // Save to local store
      await setData({
        panNumber: panNumber.toUpperCase(),
        selfieUri,
        selfieSignedUrl: uploadResult.signedUrl,
        currentStep: "pan_selfie",
      });

      // Save to backend if riderId exists
      if (data.riderId) {
        await saveStep.mutateAsync({
          riderId: data.riderId,
          step: "pan_selfie",
          data: {
            panNumber: panNumber.toUpperCase(),
            selfieSignedUrl: uploadResult.signedUrl,
          },
        });
      }

      // Move to review step
      await setStep("review");
      router.push("/(onboarding)/review");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to upload selfie. Please try again.");
    } finally {
      setLoading(false);
      setUploading(false);
    }
  };

  const maskedPan = panNumber.length > 0 
    ? `XXXXX${panNumber.slice(-5)}` 
    : "";

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
                PAN & Selfie
              </Text>
              <Text style={{ fontSize: 16, color: "#4B5563" }}>
                Enter your PAN number and capture a live selfie
              </Text>
            </View>

            {/* Form */}
            <View style={{ flex: 1, justifyContent: "center" }}>
              <View style={{ marginBottom: 24 }}>
                <Text style={{ fontSize: 14, fontWeight: "500", color: "#374151", marginBottom: 8 }}>
                  PAN Number
                </Text>
                <TextInput
                  value={panNumber}
                  onChangeText={(text) => setPanNumber(formatPan(text))}
                  placeholder="ABCDE1234F"
                  placeholderTextColor={colors.gray[400]}
                  autoCapitalize="characters"
                  maxLength={10}
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
                {panNumber.length > 0 && (
                  <Text style={{ fontSize: 12, color: "#6B7280", marginTop: 4 }}>
                    Masked: {maskedPan}
                  </Text>
                )}
              </View>

              <View style={{ marginBottom: 24 }}>
                <Text style={{ fontSize: 14, fontWeight: "500", color: "#374151", marginBottom: 8 }}>
                  Live Selfie
                </Text>
                <Button
                  variant="outline"
                  onPress={handleCaptureSelfie}
                  disabled={uploading}
                >
                  {selfieUri ? "Retake Selfie" : "Capture Selfie"}
                </Button>
                {selfieUri && (
                  <View style={{ marginTop: 12 }}>
                    <Image
                      source={{ uri: selfieUri }}
                      style={{ width: "100%", height: 300, borderRadius: 12 }}
                      resizeMode="cover"
                    />
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
                loading={loading || uploading || saveStep.isPending}
                disabled={loading || uploading || saveStep.isPending}
                size="lg"
              >
                {uploading ? "Uploading..." : "Continue"}
              </Button>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

