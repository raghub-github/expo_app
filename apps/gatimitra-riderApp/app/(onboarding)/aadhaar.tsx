import React, { useState, useEffect } from "react";
import { View, Text, TextInput, ScrollView, KeyboardAvoidingView, Platform, Image, Alert, Pressable } from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { useTranslation } from "react-i18next";
import * as ImagePicker from "expo-image-picker";
import { useOnboardingStore } from "@/src/stores/onboardingStore";
import { useSaveOnboardingStep } from "@/src/hooks/useOnboarding";
import { useSessionStore } from "@/src/stores/sessionStore";
import { uploadToR2, deleteFromR2 } from "@/src/services/storage/cloudflareR2";
import { useSaveDocument, useUpdateRiderStage } from "@/src/hooks/useDocuments";
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
  const saveDocument = useSaveDocument();
  const updateStage = useUpdateRiderStage();

  const [aadhaarNumber, setAadhaarNumber] = useState(data.aadhaarNumber || "");
  const [fullName, setFullName] = useState(data.fullName || "");
  const [dob, setDob] = useState(data.dob || "");
  const [dobDate, setDobDate] = useState<Date | null>(data.dob ? new Date(data.dob) : null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [aadhaarPhotoUri, setAadhaarPhotoUri] = useState<string | null>(data.aadhaarPhotoUri || null);
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  const handleAadhaarChange = (text: string) => {
    const formatted = formatAadhaar(text);
    setAadhaarNumber(formatted);
  };

  const requestCameraPermission = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permission Required", "Camera permission is required to capture Aadhaar photo");
      return false;
    }
    return true;
  };

  const handleCaptureAadhaarPhoto = async () => {
    const hasPermission = await requestCameraPermission();
    if (!hasPermission) return;

    setError(null);

    try {
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [3, 2], // Aadhaar card aspect ratio
        quality: 0.9,
      });

      if (!result.canceled && result.assets[0]) {
        setAadhaarPhotoUri(result.assets[0].uri);
      }
    } catch (e) {
      setError("Failed to capture photo. Please try again.");
    }
  };

  const handlePickAadhaarPhoto = async () => {
    setError(null);

    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [3, 2],
        quality: 0.9,
      });

      if (!result.canceled && result.assets[0]) {
        setAadhaarPhotoUri(result.assets[0].uri);
      }
    } catch (e) {
      setError("Failed to pick photo. Please try again.");
    }
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

    if (!dob) {
      setError("Please enter your date of birth");
      return;
    }

    if (!aadhaarPhotoUri) {
      setError("Please capture or upload your Aadhaar photo");
      return;
    }

    if (!data.riderId) {
      setError("Rider ID not found. Please try again.");
      return;
    }

    if (!session?.accessToken) {
      setError("Not authenticated. Please login again.");
      return;
    }

    setError(null);
    setLoading(true);
    setUploading(true);

    const uploadedKeys: string[] = [];

    try {
      // Upload Aadhaar photo to R2
      const uploadResult = await uploadToR2(
        aadhaarPhotoUri,
        "documents",
        session.accessToken,
        `aadhaar/${data.riderId}-${Date.now()}.jpg`
      );
      uploadedKeys.push(uploadResult.key);

      // Save document to database
      await saveDocument.mutateAsync({
        riderId: parseInt(data.riderId),
        docType: "aadhaar",
        fileUrl: uploadResult.signedUrl,
        r2Key: uploadResult.key, // Store R2 key for URL regeneration
        extractedName: fullName.trim(),
        extractedDob: dob, // ISO date string
        metadata: {
          aadhaarNumber: aadhaarNumber.replace(/\D/g, ""),
        },
      });

      // Update rider table with Aadhaar details
      await saveStep.mutateAsync({
        riderId: data.riderId,
        step: "aadhaar_name",
        data: {
          aadhaarNumber: aadhaarNumber.replace(/\D/g, ""),
          fullName: fullName.trim(),
        },
      });

      // Update onboarding stage to KYC
      await updateStage.mutateAsync({
        riderId: parseInt(data.riderId),
        stage: "KYC",
      });

      // Save to local store
      await setData({
        aadhaarNumber: aadhaarNumber.replace(/\D/g, ""),
        fullName: fullName.trim(),
        dob: dob,
        aadhaarPhotoUri,
        aadhaarPhotoSignedUrl: uploadResult.signedUrl,
        currentStep: "aadhaar_name",
      });

      // Move to next step (PAN-Selfie)
      await setStep("pan_selfie");
      router.push("/(onboarding)/pan-selfie");
    } catch (e) {
      // Rollback: Delete uploaded files from R2 if DB save failed
      for (const key of uploadedKeys) {
        try {
          await deleteFromR2(key, session.accessToken);
        } catch (rollbackError) {
          console.error(`[Rollback] Failed to delete R2 file ${key}:`, rollbackError);
          // Don't throw - we want the original error to be shown
        }
      }
      setError(e instanceof Error ? e.message : "Failed to upload. Please try again.");
    } finally {
      setLoading(false);
      setUploading(false);
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

              <View style={{ marginBottom: 24 }}>
                <Text style={{ fontSize: 14, fontWeight: "500", color: "#374151", marginBottom: 8 }}>
                  Date of Birth (as per Aadhaar)
                </Text>
                <Pressable
                  onPress={() => setShowDatePicker(true)}
                  style={{
                    backgroundColor: "#F9FAFB",
                    borderWidth: 1,
                    borderColor: "#E5E7EB",
                    borderRadius: 12,
                    paddingHorizontal: 16,
                    paddingVertical: 16,
                    flexDirection: "row",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <Text style={{ fontSize: 16, color: dob ? "#111827" : colors.gray[400] }}>
                    {dob || "Select date of birth"}
                  </Text>
                  <Text style={{ fontSize: 16, color: colors.gray[600] }}>📅</Text>
                </Pressable>
                {showDatePicker && (
                  <DateTimePicker
                    value={dobDate || new Date()}
                    mode="date"
                    display={Platform.OS === "ios" ? "spinner" : "default"}
                    onChange={(event, selectedDate) => {
                      setShowDatePicker(Platform.OS === "ios");
                      if (selectedDate) {
                        setDobDate(selectedDate);
                        // Format as YYYY-MM-DD
                        const year = selectedDate.getFullYear();
                        const month = String(selectedDate.getMonth() + 1).padStart(2, "0");
                        const day = String(selectedDate.getDate()).padStart(2, "0");
                        setDob(`${year}-${month}-${day}`);
                      }
                    }}
                    maximumDate={new Date()}
                    minimumDate={new Date(new Date().setFullYear(new Date().getFullYear() - 100))}
                  />
                )}
                {Platform.OS === "ios" && showDatePicker && (
                  <View style={{ flexDirection: "row", gap: 12, marginTop: 12 }}>
                    <Button
                      variant="outline"
                      onPress={() => {
                        setShowDatePicker(false);
                      }}
                      style={{ flex: 1 }}
                    >
                      Done
                    </Button>
                  </View>
                )}
              </View>

              <View style={{ marginBottom: 24 }}>
                <Text style={{ fontSize: 14, fontWeight: "500", color: "#374151", marginBottom: 8 }}>
                  Aadhaar Photo
                </Text>
                <View style={{ flexDirection: "row", gap: 12, marginBottom: 12 }}>
                  <Button
                    variant="outline"
                    onPress={handleCaptureAadhaarPhoto}
                    disabled={uploading}
                    style={{ flex: 1 }}
                  >
                    📷 Capture
                  </Button>
                  <Button
                    variant="outline"
                    onPress={handlePickAadhaarPhoto}
                    disabled={uploading}
                    style={{ flex: 1 }}
                  >
                    🖼️ Upload
                  </Button>
                </View>
                {aadhaarPhotoUri && (
                  <View style={{ marginTop: 12 }}>
                    <Image
                      source={{ uri: aadhaarPhotoUri }}
                      style={{ width: "100%", height: 200, borderRadius: 12 }}
                      resizeMode="contain"
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

