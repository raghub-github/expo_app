import React, { useState, useEffect } from "react";
import { View, Text, TextInput, ScrollView, KeyboardAvoidingView, Platform, Image, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { useTranslation } from "react-i18next";
import * as ImagePicker from "expo-image-picker";
import { useOnboardingStore } from "@/src/stores/onboardingStore";
import { useSaveOnboardingStep } from "@/src/hooks/useOnboarding";
import { useSessionStore } from "@/src/stores/sessionStore";
import { uploadToR2 } from "@/src/services/storage/cloudflareR2";
import { useSaveDocument } from "@/src/hooks/useDocuments";
import { Button } from "@/src/components/ui/Button";
import { colors } from "@/src/theme";

export default function DlRcScreen() {
  const { t } = useTranslation();
  const session = useSessionStore((s) => s.session);
  const { data, setData, setStep, hydrate } = useOnboardingStore();
  const saveStep = useSaveOnboardingStep();
  const saveDocument = useSaveDocument();

  const [dlNumber, setDlNumber] = useState(data.dlNumber || "");
  const [dlPhotoUri, setDlPhotoUri] = useState<string | null>(data.dlPhotoUri || null);
  const [rcNumber, setRcNumber] = useState(data.rcNumber || "");
  const [rcPhotoUri, setRcPhotoUri] = useState<string | null>(data.rcPhotoUri || null);
  const [hasOwnVehicle, setHasOwnVehicle] = useState<boolean | undefined>(
    data.hasOwnVehicle !== undefined ? data.hasOwnVehicle : true
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
      Alert.alert("Permission Required", "Camera permission is required to capture document photos");
      return false;
    }
    return true;
  };

  const handleCaptureDlPhoto = async () => {
    const hasPermission = await requestCameraPermission();
    if (!hasPermission) return;

    setError(null);

    try {
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [3, 2],
        quality: 0.9,
      });

      if (!result.canceled && result.assets[0]) {
        setDlPhotoUri(result.assets[0].uri);
      }
    } catch (e) {
      setError("Failed to capture DL photo. Please try again.");
    }
  };

  const handlePickDlPhoto = async () => {
    setError(null);

    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [3, 2],
        quality: 0.9,
      });

      if (!result.canceled && result.assets[0]) {
        setDlPhotoUri(result.assets[0].uri);
      }
    } catch (e) {
      setError("Failed to pick DL photo. Please try again.");
    }
  };

  const handleCaptureRcPhoto = async () => {
    const hasPermission = await requestCameraPermission();
    if (!hasPermission) return;

    setError(null);

    try {
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [3, 2],
        quality: 0.9,
      });

      if (!result.canceled && result.assets[0]) {
        setRcPhotoUri(result.assets[0].uri);
      }
    } catch (e) {
      setError("Failed to capture RC photo. Please try again.");
    }
  };

  const handlePickRcPhoto = async () => {
    setError(null);

    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [3, 2],
        quality: 0.9,
      });

      if (!result.canceled && result.assets[0]) {
        setRcPhotoUri(result.assets[0].uri);
      }
    } catch (e) {
      setError("Failed to pick RC photo. Please try again.");
    }
  };

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
      if (!dlPhotoUri) {
        setError("Please capture or upload your DL photo");
        return;
      }
      if (!rcPhotoUri) {
        setError("Please capture or upload your RC photo");
        return;
      }
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

    try {
      const riderId = parseInt(data.riderId);

      if (hasOwnVehicle) {
        // Upload DL photo to R2
        const dlUploadResult = await uploadToR2(
          dlPhotoUri!,
          "documents",
          session.accessToken,
          `dl/${riderId}-${Date.now()}.jpg`
        );

        // Upload RC photo to R2
        const rcUploadResult = await uploadToR2(
          rcPhotoUri!,
          "documents",
          session.accessToken,
          `rc/${riderId}-${Date.now()}.jpg`
        );

        // Save DL document to database
        await saveDocument.mutateAsync({
          riderId,
          docType: "dl",
          fileUrl: dlUploadResult.signedUrl,
        });

        // Save RC document to database
        await saveDocument.mutateAsync({
          riderId,
          docType: "rc",
          fileUrl: rcUploadResult.signedUrl,
        });

        // Save to local store
        await setData({
          dlNumber: dlNumber.trim(),
          dlPhotoUri,
          dlPhotoSignedUrl: dlUploadResult.signedUrl,
          rcNumber: rcNumber.trim(),
          rcPhotoUri,
          rcPhotoSignedUrl: rcUploadResult.signedUrl,
          hasOwnVehicle,
          currentStep: "dl_rc",
        });

        // Save to backend
        await saveStep.mutateAsync({
          riderId: data.riderId,
          step: "dl_rc",
          data: {
            dlNumber: dlNumber.trim(),
            rcNumber: rcNumber.trim(),
            hasOwnVehicle,
          },
        });

        // Move to payment step
        router.push("/(onboarding)/payment");
      } else {
        // Rental/EV - save basic info and go to rental/EV screen
        await setData({
          hasOwnVehicle,
          currentStep: "rental_ev",
        });

        await setStep("rental_ev");
        router.push("/(onboarding)/rental-ev");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to upload. Please try again.");
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
                        DL Photo
                      </Text>
                      <View style={{ flexDirection: "row", gap: 12, marginBottom: 12 }}>
                        <Button
                          variant="outline"
                          onPress={handleCaptureDlPhoto}
                          disabled={uploading}
                          style={{ flex: 1 }}
                        >
                          📷 Capture
                        </Button>
                        <Button
                          variant="outline"
                          onPress={handlePickDlPhoto}
                          disabled={uploading}
                          style={{ flex: 1 }}
                        >
                          🖼️ Upload
                        </Button>
                      </View>
                      {dlPhotoUri && (
                        <View style={{ marginTop: 12 }}>
                          <Image
                            source={{ uri: dlPhotoUri }}
                            style={{ width: "100%", height: 200, borderRadius: 12 }}
                            resizeMode="contain"
                          />
                        </View>
                      )}
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

                    <View style={{ marginBottom: 16 }}>
                      <Text style={{ fontSize: 14, fontWeight: "500", color: "#374151", marginBottom: 8 }}>
                        RC Photo
                      </Text>
                      <View style={{ flexDirection: "row", gap: 12, marginBottom: 12 }}>
                        <Button
                          variant="outline"
                          onPress={handleCaptureRcPhoto}
                          disabled={uploading}
                          style={{ flex: 1 }}
                        >
                          📷 Capture
                        </Button>
                        <Button
                          variant="outline"
                          onPress={handlePickRcPhoto}
                          disabled={uploading}
                          style={{ flex: 1 }}
                        >
                          🖼️ Upload
                        </Button>
                      </View>
                      {rcPhotoUri && (
                        <View style={{ marginTop: 12 }}>
                          <Image
                            source={{ uri: rcPhotoUri }}
                            style={{ width: "100%", height: 200, borderRadius: 12 }}
                            resizeMode="contain"
                          />
                        </View>
                      )}
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

