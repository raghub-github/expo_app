import React, { useState, useEffect } from "react";
import { View, Text, TextInput, ScrollView, KeyboardAvoidingView, Platform, Image, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import { useTranslation } from "react-i18next";
import { useOnboardingStore } from "@/src/stores/onboardingStore";
import { useSaveOnboardingStep } from "@/src/hooks/useOnboarding";
import { useSessionStore } from "@/src/stores/sessionStore";
import { uploadToR2, deleteFromR2 } from "@/src/services/storage/cloudflareR2";
import { Button } from "@/src/components/ui/Button";
import { colors } from "@/src/theme";

export default function RentalEvScreen() {
  const { t } = useTranslation();
  const session = useSessionStore((s) => s.session);
  const { data, setData, setStep, hydrate } = useOnboardingStore();
  const saveStep = useSaveOnboardingStep();

  const [documentType, setDocumentType] = useState<"rental" | "ev" | null>(
    data.rentalProofUri ? "rental" : data.evProofUri ? "ev" : null
  );
  const [documentUri, setDocumentUri] = useState<string | null>(
    data.rentalProofUri || data.evProofUri || null
  );
  const [maxSpeedDeclaration, setMaxSpeedDeclaration] = useState<string>(
    data.maxSpeedDeclaration?.toString() || ""
  );
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  const requestCameraPermission = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permission Required", "Camera permission is required to capture document");
      return false;
    }
    return true;
  };

  const handlePickDocument = async (type: "rental" | "ev") => {
    const hasPermission = await requestCameraPermission();
    if (!hasPermission) return;

    setDocumentType(type);
    setError(null);

    try {
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0]) {
        setDocumentUri(result.assets[0].uri);
      }
    } catch (e) {
      setError("Failed to capture image. Please try again.");
    }
  };

  const handleContinue = async () => {
    if (!documentType) {
      setError("Please select document type (Rental Agreement or EV Proof)");
      return;
    }

    if (!documentUri) {
      setError("Please capture the document image");
      return;
    }

    if (!maxSpeedDeclaration || isNaN(Number(maxSpeedDeclaration))) {
      setError("Please enter a valid maximum speed");
      return;
    }

    setError(null);
    setLoading(true);
    setUploading(true);

    const uploadedKeys: string[] = [];

    try {
      if (!session?.accessToken) {
        throw new Error("Not authenticated");
      }

      // Upload to R2
      const uploadResult = await uploadToR2(
        documentUri,
        "documents",
        session.accessToken,
        `${documentType}-${Date.now()}.jpg`
      );
      uploadedKeys.push(uploadResult.key);

      // Save to local store
      const updateData: any = {
        maxSpeedDeclaration: Number(maxSpeedDeclaration),
        currentStep: "rental_ev",
      };

      if (documentType === "rental") {
        updateData.rentalProofUri = documentUri;
        updateData.rentalProofSignedUrl = uploadResult.signedUrl;
      } else {
        updateData.evProofUri = documentUri;
        updateData.evProofSignedUrl = uploadResult.signedUrl;
      }

      await setData(updateData);

      // Save to backend if riderId exists
      if (data.riderId) {
        await saveStep.mutateAsync({
          riderId: data.riderId,
          step: "rental_ev",
          data: {
            rentalProofSignedUrl: documentType === "rental" ? uploadResult.signedUrl : undefined,
            evProofSignedUrl: documentType === "ev" ? uploadResult.signedUrl : undefined,
            maxSpeedDeclaration: Number(maxSpeedDeclaration),
          },
        });
      }

      // Move to PAN/Selfie step
      await setStep("pan_selfie");
      router.push("/(onboarding)/pan-selfie");
    } catch (e) {
      // Rollback: Delete uploaded files from R2 if save failed
      for (const key of uploadedKeys) {
        try {
          await deleteFromR2(key, session.accessToken);
        } catch (rollbackError) {
          console.error(`[Rollback] Failed to delete R2 file ${key}:`, rollbackError);
          // Don't throw - we want the original error to be shown
        }
      }
      setError(e instanceof Error ? e.message : "Failed to upload document. Please try again.");
    } finally {
      setLoading(false);
      setUploading(false);
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
                Rental/EV Proof
              </Text>
              <Text style={{ fontSize: 16, color: "#4B5563" }}>
                Upload your rental agreement or EV proof document
              </Text>
            </View>

            {/* Form */}
            <View style={{ flex: 1, justifyContent: "center" }}>
              <View style={{ marginBottom: 24 }}>
                <Text style={{ fontSize: 14, fontWeight: "500", color: "#374151", marginBottom: 12 }}>
                  Document Type
                </Text>
                <View style={{ flexDirection: "row", gap: 12, marginBottom: 24 }}>
                  <Button
                    variant={documentType === "rental" ? "primary" : "outline"}
                    onPress={() => setDocumentType("rental")}
                    style={{ flex: 1 }}
                  >
                    Rental Agreement
                  </Button>
                  <Button
                    variant={documentType === "ev" ? "primary" : "outline"}
                    onPress={() => setDocumentType("ev")}
                    style={{ flex: 1 }}
                  >
                    EV Proof
                  </Button>
                </View>

                {documentType && (
                  <>
                    <View style={{ marginBottom: 16 }}>
                      <Text style={{ fontSize: 14, fontWeight: "500", color: "#374151", marginBottom: 8 }}>
                        Capture {documentType === "rental" ? "Rental Agreement" : "EV Proof"}
                      </Text>
                      <Button
                        variant="outline"
                        onPress={() => handlePickDocument(documentType)}
                        disabled={uploading}
                      >
                        {documentUri ? "Retake Photo" : "Capture Document"}
                      </Button>
                      {documentUri && (
                        <View style={{ marginTop: 12 }}>
                          <Image
                            source={{ uri: documentUri }}
                            style={{ width: "100%", height: 200, borderRadius: 12 }}
                            resizeMode="contain"
                          />
                        </View>
                      )}
                    </View>

                    <View style={{ marginBottom: 16 }}>
                      <Text style={{ fontSize: 14, fontWeight: "500", color: "#374151", marginBottom: 8 }}>
                        Maximum Speed Declaration (km/h)
                      </Text>
                      <TextInput
                        value={maxSpeedDeclaration}
                        onChangeText={setMaxSpeedDeclaration}
                        placeholder="e.g., 60"
                        placeholderTextColor={colors.gray[400]}
                        keyboardType="number-pad"
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

