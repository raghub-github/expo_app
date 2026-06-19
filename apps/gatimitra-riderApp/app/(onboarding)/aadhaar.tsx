// @ts-nocheck — pending strict-mode cleanup; tracked in follow-up issue.
import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  View,
  Text,
  TextInput,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Image,
  Alert,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  BackHandler,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useTranslation } from "react-i18next";
import * as ImagePicker from "expo-image-picker";
import { useOnboardingStore } from "@/src/stores/onboardingStore";
import { useSaveOnboardingStep } from "@/src/hooks/useOnboarding";
import { useRiderStatus } from "@/src/hooks/useOnboarding";
import { useOnboardingEstablishedRedirect } from "@/src/hooks/useOnboardingEstablishedRedirect";
import { onboardingStepToRoute } from "@/src/lib/onboarding-routes";
import { goBackOrReplace } from "@/src/lib/onboarding-navigation";
import { useSessionStore } from "@/src/stores/sessionStore";
import { uploadToR2, deleteFromR2, buildRiderDocumentKey } from "@/src/services/storage/cloudflareR2";
import { useSaveDocument, useUpdateRiderStage } from "@/src/hooks/useDocuments";
import { colors } from "@/src/theme";

let DateTimePicker: React.ComponentType<any> | null = null;
try {
  DateTimePicker = require("@react-native-community/datetimepicker").default;
} catch {
  // Expo Go or env without native datetimepicker
}

const ACCENT = "#39d353";
const ACCENT_DARK = "#22a745";
const BG = "#f4fbf6";
const MIN_RIDER_AGE = 18;

const AADHAAR_COPY = {
  stepLabel: "Step 1 · Aadhaar",
  title: "Aadhaar Verification",
  subtitle: "Enter details exactly as printed on your Aadhaar card",
  aadhaarLabel: "Aadhaar Number",
  masked: "Masked",
  nameLabel: "Full Name (as per Aadhaar)",
  namePlaceholder: "Enter your full name",
  dobLabel: "Date of Birth (as per Aadhaar)",
  dobPlaceholder: "Select date of birth",
  dobHint: "You must be at least 18 years old to join as a delivery partner",
  underAgeTitle: "Not eligible — minimum age is 18",
  underAgeMessage:
    "Delivery partners must be 18 years or older. Please check your date of birth or contact support if this is incorrect.",
  ageEligible: "Age verified · {{age}} years old",
  photoLabel: "Aadhaar Photos",
  frontLabel: "Front",
  backLabel: "Back",
  frontHint: "Front side",
  backHint: "Back side",
  continue: "Continue",
  invalidAadhaar: "Please enter a valid 12-digit Aadhaar number",
  invalidName: "Please enter your full name (minimum 3 characters)",
  dobRequired: "Please select your date of birth",
  photoRequired: "Please add both front and back photos of your Aadhaar",
  riderNotFound: "Rider ID not found. Please try again.",
  notAuthenticated: "Not authenticated. Please login again.",
  uploadError: "Failed to upload. Please try again.",
  captureFailed: "Failed to capture photo. Please try again.",
  uploadFailed: "Failed to pick photo. Please try again.",
  cameraPermissionTitle: "Permission Required",
  cameraPermissionMessage: "Camera permission is required to capture your Aadhaar photo",
  galleryPermissionTitle: "Gallery access needed",
  galleryPermissionMessage: "Allow photo access to upload your Aadhaar image from gallery",
} as const;

type AadhaarSide = "front" | "back";

function formatAadhaar(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 12);
  if (digits.length <= 4) return digits;
  if (digits.length <= 8) return `${digits.slice(0, 4)}-${digits.slice(4)}`;
  return `${digits.slice(0, 4)}-${digits.slice(4, 8)}-${digits.slice(8)}`;
}

function parseDobString(dob: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dob)) return null;
  const parsed = new Date(`${dob}T12:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function calculateAge(birthDate: Date): number {
  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
    age -= 1;
  }
  return age;
}

function isUnderMinimumAge(dob: string): boolean {
  const parsed = parseDobString(dob);
  if (!parsed) return false;
  return calculateAge(parsed) < MIN_RIDER_AGE;
}

function getMaxDobDate(): Date {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setFullYear(d.getFullYear() - MIN_RIDER_AGE);
  return d;
}

function formatDobDisplay(dob: string): string {
  const parsed = parseDobString(dob);
  if (!parsed) return dob;
  return parsed.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function ContinueButton({
  label,
  onPress,
  disabled,
  loading,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
}) {
  const inactive = Boolean(disabled || loading);

  return (
    <TouchableOpacity
      activeOpacity={inactive ? 1 : 0.85}
      onPress={() => {
        if (!inactive) onPress();
      }}
      accessibilityRole="button"
      accessibilityState={{ disabled: inactive }}
      style={[styles.continueBtn, inactive && styles.continueBtnDisabled]}
    >
      {loading ? (
        <ActivityIndicator color={ACCENT_DARK} />
      ) : (
        <>
          <Text style={[styles.continueBtnText, inactive && styles.continueBtnTextDisabled]}>
            {label}
          </Text>
          <Ionicons
            name="arrow-forward"
            size={18}
            color={inactive ? "#7cb889" : "#ffffff"}
          />
        </>
      )}
    </TouchableOpacity>
  );
}

function FieldLabel({ label, required }: { label: string; required?: boolean }) {
  return (
    <Text style={styles.fieldLabel}>
      {label}
      {required ? <Text style={styles.requiredMark}> *</Text> : null}
    </Text>
  );
}

function AadhaarPhotoSlot({
  sideLabel,
  uri,
  onCapture,
  onUpload,
  onRemove,
  onBoxPress,
  disabled,
}: {
  sideLabel: string;
  uri: string | null;
  onCapture: () => void;
  onUpload: () => void;
  onRemove: () => void;
  onBoxPress: () => void;
  disabled?: boolean;
}) {
  return (
    <View style={styles.photoSlot}>
      <Text style={styles.photoSlotLabel} numberOfLines={1}>
        {sideLabel}
      </Text>

      <View style={[styles.slotDropBox, uri ? styles.slotDropBoxFilled : null]}>
        <Pressable
          onPress={onBoxPress}
          disabled={disabled}
          style={({ pressed }) => [
            styles.slotDropBoxInner,
            !uri && styles.slotDropBoxInnerEmpty,
            pressed && !disabled && styles.slotBoxPressed,
            disabled && styles.slotActionBtnDisabled,
          ]}
        >
          {uri ? (
            <Image source={{ uri }} style={styles.slotPreview} resizeMode="cover" />
          ) : (
            <>
              <View style={styles.slotEmptyIcon}>
                <Ionicons name="id-card-outline" size={20} color={colors.gray[400]} />
              </View>
              <Text style={styles.slotTapHint} numberOfLines={1}>
                Tap to upload
              </Text>
            </>
          )}
        </Pressable>

        {uri ? (
          <Pressable onPress={onRemove} style={styles.slotRemoveBtn} hitSlop={8}>
            <Ionicons name="close-circle" size={20} color="#ffffff" />
          </Pressable>
        ) : null}
      </View>

      <View style={styles.slotActions}>
        <Pressable
          onPress={onCapture}
          disabled={disabled}
          style={({ pressed }) => [
            styles.slotActionBtn,
            pressed && styles.slotActionBtnPressed,
            disabled && styles.slotActionBtnDisabled,
          ]}
        >
          <View style={styles.slotActionInner}>
            <Ionicons name="camera-outline" size={14} color={ACCENT_DARK} />
            <Text style={styles.slotActionText} numberOfLines={1}>
              Capture
            </Text>
          </View>
        </Pressable>
        <Pressable
          onPress={onUpload}
          disabled={disabled}
          style={({ pressed }) => [
            styles.slotActionBtn,
            pressed && styles.slotActionBtnPressed,
            disabled && styles.slotActionBtnDisabled,
          ]}
        >
          <View style={styles.slotActionInner}>
            <Ionicons name="images-outline" size={14} color={ACCENT_DARK} />
            <Text style={styles.slotActionText} numberOfLines={1}>
              Upload
            </Text>
          </View>
        </Pressable>
      </View>
    </View>
  );
}

export default function AadhaarScreen() {
  const { t } = useTranslation();
  const tx = (key: keyof typeof AADHAAR_COPY, options?: Record<string, unknown>) =>
    t(`onboarding.aadhaar.${key}`, { defaultValue: AADHAAR_COPY[key], ...options });

  const session = useSessionStore((s) => s.session);
  const { data, setData, setStep, hydrate } = useOnboardingStore();
  const saveStep = useSaveOnboardingStep();
  const saveDocument = useSaveDocument();
  const updateStage = useUpdateRiderStage();
  const { data: riderStatus } = useRiderStatus(data.riderId);
  useOnboardingEstablishedRedirect(riderStatus);

  useEffect(() => {
    const next = riderStatus?.nextOnboardingStep;
    if (!next || next === "aadhaar_name" || next === "method_selection") return;
    router.replace(onboardingStepToRoute(next as "pan_selfie"));
  }, [riderStatus?.nextOnboardingStep]);

  const [aadhaarNumber, setAadhaarNumber] = useState(data.aadhaarNumber || "");
  const [fullName, setFullName] = useState(data.fullName || "");
  const [dob, setDob] = useState(data.dob || "");
  const [dobDate, setDobDate] = useState<Date | null>(
    data.dob ? parseDobString(data.dob) : null
  );
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [aadhaarFrontUri, setAadhaarFrontUri] = useState<string | null>(
    data.aadhaarFrontPhotoUri || data.aadhaarPhotoUri || null
  );
  const [aadhaarBackUri, setAadhaarBackUri] = useState<string | null>(
    data.aadhaarBackPhotoUri || null
  );
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const underAge = useMemo(() => isUnderMinimumAge(dob), [dob]);
  const maskedAadhaar = aadhaarNumber.replace(/\d(?=\d{4})/g, "X");
  const aadhaarValid = aadhaarNumber.replace(/\D/g, "").length === 12;
  const nameValid = fullName.trim().length >= 3;
  const dobValid = Boolean(dob) && !underAge;
  const photosValid = Boolean(aadhaarFrontUri && aadhaarBackUri);
  const canContinue =
    aadhaarValid && nameValid && dobValid && photosValid && !submitting && !uploading;

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  const handleBack = useCallback(() => {
    goBackOrReplace("/(onboarding)/method-selection");
  }, []);

  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      handleBack();
      return true;
    });
    return () => sub.remove();
  }, [handleBack]);

  const handleAadhaarChange = (text: string) => {
    setAadhaarNumber(formatAadhaar(text));
  };

  const handleDobChange = (selectedDate: Date) => {
    setDobDate(selectedDate);
    const year = selectedDate.getFullYear();
    const month = String(selectedDate.getMonth() + 1).padStart(2, "0");
    const day = String(selectedDate.getDate()).padStart(2, "0");
    setDob(`${year}-${month}-${day}`);
  };

  const requestCameraPermission = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== "granted") {
      Alert.alert(tx("cameraPermissionTitle"), tx("cameraPermissionMessage"));
      return false;
    }
    return true;
  };

  const requestGalleryPermission = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert(tx("galleryPermissionTitle"), tx("galleryPermissionMessage"));
      return false;
    }
    return true;
  };

  const pickImage = async (source: "camera" | "library", side: AadhaarSide) => {
    if (source === "camera") {
      const hasPermission = await requestCameraPermission();
      if (!hasPermission) return;
    } else {
      const hasPermission = await requestGalleryPermission();
      if (!hasPermission) return;
    }

    setError(null);

    try {
      const result =
        source === "camera"
          ? await ImagePicker.launchCameraAsync({
              mediaTypes: ImagePicker.MediaTypeOptions.Images,
              allowsEditing: true,
              aspect: [3, 2],
              quality: 0.9,
            })
          : await ImagePicker.launchImageLibraryAsync({
              mediaTypes: ImagePicker.MediaTypeOptions.Images,
              allowsEditing: true,
              aspect: [3, 2],
              quality: 0.9,
            });

      if (!result.canceled && result.assets[0]) {
        if (side === "front") {
          setAadhaarFrontUri(result.assets[0].uri);
        } else {
          setAadhaarBackUri(result.assets[0].uri);
        }
      }
    } catch {
      setError(source === "camera" ? tx("captureFailed") : tx("uploadFailed"));
    }
  };

  const handleContinue = async () => {
    if (!aadhaarValid) {
      setError(tx("invalidAadhaar"));
      return;
    }

    if (!nameValid) {
      setError(tx("invalidName"));
      return;
    }

    if (!dob) {
      setError(tx("dobRequired"));
      return;
    }

    if (underAge) {
      setError(tx("underAgeMessage"));
      return;
    }

    if (!photosValid) {
      setError(tx("photoRequired"));
      return;
    }

    if (!data.riderId) {
      setError(tx("riderNotFound"));
      return;
    }

    if (!session?.accessToken) {
      setError(tx("notAuthenticated"));
      return;
    }

    setError(null);
    setSubmitting(true);
    setUploading(true);

    const uploadedKeys: string[] = [];

    try {
      const frontUpload = await uploadToR2(
        aadhaarFrontUri!,
        "documents",
        session.accessToken,
        buildRiderDocumentKey(data.riderId, "aadhaar", "front")
      );
      uploadedKeys.push(frontUpload.key);

      const backUpload = await uploadToR2(
        aadhaarBackUri!,
        "documents",
        session.accessToken,
        buildRiderDocumentKey(data.riderId, "aadhaar", "back")
      );
      uploadedKeys.push(backUpload.key);

      await saveDocument.mutateAsync({
        riderId: parseInt(data.riderId, 10),
        docType: "aadhaar",
        fileUrl: frontUpload.proxyUrl,
        r2Key: frontUpload.key,
        extractedName: fullName.trim(),
        extractedDob: dob,
        metadata: {
          aadhaarNumber: aadhaarNumber.replace(/\D/g, ""),
        },
        files: [
          {
            side: "front",
            fileUrl: frontUpload.proxyUrl,
            r2Key: frontUpload.key,
            mimeType: "image/jpeg",
          },
          {
            side: "back",
            fileUrl: backUpload.proxyUrl,
            r2Key: backUpload.key,
            mimeType: "image/jpeg",
          },
        ],
      });

      await saveStep.mutateAsync({
        riderId: data.riderId,
        step: "aadhaar_name",
        data: {
          aadhaarNumber: aadhaarNumber.replace(/\D/g, ""),
          fullName: fullName.trim(),
          fileUrl: frontUpload.proxyUrl,
        },
      });

      await updateStage.mutateAsync({
        riderId: parseInt(data.riderId, 10),
        stage: "KYC",
      });

      await setData({
        aadhaarNumber: aadhaarNumber.replace(/\D/g, ""),
        fullName: fullName.trim(),
        dob,
        aadhaarFrontPhotoUri: aadhaarFrontUri,
        aadhaarBackPhotoUri: aadhaarBackUri,
        aadhaarFrontPhotoSignedUrl: frontUpload.proxyUrl,
        aadhaarBackPhotoSignedUrl: backUpload.proxyUrl,
        aadhaarPhotoUri: aadhaarFrontUri,
        aadhaarPhotoSignedUrl: frontUpload.proxyUrl,
        currentStep: "aadhaar_name",
      });

      await setStep("pan_selfie");
      router.replace("/(onboarding)/pan-selfie");
    } catch (e) {
      for (const key of uploadedKeys) {
        try {
          await deleteFromR2(key, session.accessToken);
        } catch (rollbackError) {
          console.error(`[Rollback] Failed to delete R2 file ${key}:`, rollbackError);
        }
      }
      const message = e instanceof Error ? e.message : tx("uploadError");
      setError(message);
      console.error("[Aadhaar] Continue failed:", e);
    } finally {
      setSubmitting(false);
      setUploading(false);
    }
  };

  return (
    <View style={styles.root}>
      <StatusBar style="dark" backgroundColor={BG} translucent={false} />

      <SafeAreaView style={styles.safeArea} edges={["top", "bottom"]}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={styles.flex}
        >
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <LinearGradient
              colors={["#dff5e4", BG]}
              start={{ x: 0.5, y: 0 }}
              end={{ x: 0.5, y: 1 }}
              style={styles.header}
            >
              <Pressable
                onPress={handleBack}
                style={styles.backBtn}
                hitSlop={12}
                accessibilityRole="button"
                accessibilityLabel={t("common.back", { defaultValue: "Back" })}
              >
                <Ionicons name="chevron-back" size={22} color={colors.gray[800]} />
              </Pressable>

              <View style={styles.stepPill}>
                <Ionicons name="card-outline" size={14} color={ACCENT_DARK} />
                <Text style={styles.stepPillText}>{tx("stepLabel")}</Text>
              </View>

              <Text style={styles.title}>{tx("title")}</Text>
              <Text style={styles.subtitle}>{tx("subtitle")}</Text>
            </LinearGradient>

            <View style={styles.formCard}>
              <View style={styles.fieldGroup}>
                <FieldLabel label={tx("aadhaarLabel")} required />
                <View style={styles.inputWrap}>
                  <Ionicons
                    name="finger-print-outline"
                    size={20}
                    color={colors.gray[400]}
                    style={styles.inputIcon}
                  />
                  <TextInput
                    value={aadhaarNumber}
                    onChangeText={handleAadhaarChange}
                    placeholder="XXXX-XXXX-1234"
                    placeholderTextColor={colors.gray[400]}
                    keyboardType="number-pad"
                    maxLength={14}
                    style={styles.inputWithIcon}
                  />
                </View>
                {aadhaarNumber.length > 0 ? (
                  <Text style={styles.hintText}>
                    {tx("masked")}: {maskedAadhaar}
                  </Text>
                ) : null}
              </View>

              <View style={styles.fieldGroup}>
                <FieldLabel label={tx("nameLabel")} required />
                <View style={styles.inputWrap}>
                  <Ionicons
                    name="person-outline"
                    size={20}
                    color={colors.gray[400]}
                    style={styles.inputIcon}
                  />
                  <TextInput
                    value={fullName}
                    onChangeText={setFullName}
                    placeholder={tx("namePlaceholder")}
                    placeholderTextColor={colors.gray[400]}
                    autoCapitalize="words"
                    style={styles.inputWithIcon}
                  />
                </View>
              </View>

              <View style={styles.fieldGroup}>
                <FieldLabel label={tx("dobLabel")} required />
                <Pressable
                  onPress={() => setShowDatePicker(true)}
                  style={[styles.inputWrap, styles.dobPressable, underAge && styles.inputErrorBorder]}
                >
                  <Ionicons
                    name="calendar-outline"
                    size={20}
                    color={underAge ? colors.error[500] : colors.gray[400]}
                    style={styles.inputIcon}
                  />
                  <Text style={[styles.dobText, !dob && styles.dobPlaceholder]}>
                    {dob ? formatDobDisplay(dob) : tx("dobPlaceholder")}
                  </Text>
                  <Ionicons name="chevron-down" size={18} color={colors.gray[400]} />
                </Pressable>

                {showDatePicker && DateTimePicker ? (
                  <DateTimePicker
                    value={dobDate || getMaxDobDate()}
                    mode="date"
                    display={Platform.OS === "ios" ? "spinner" : "default"}
                    onChange={(event, selectedDate) => {
                      if (Platform.OS === "android") {
                        setShowDatePicker(false);
                      }
                      if (selectedDate) {
                        handleDobChange(selectedDate);
                      }
                      if (Platform.OS === "android" && event.type === "dismissed") {
                        setShowDatePicker(false);
                      }
                    }}
                    maximumDate={new Date()}
                    minimumDate={new Date(new Date().setFullYear(new Date().getFullYear() - 100))}
                  />
                ) : null}

                {showDatePicker && !DateTimePicker ? (
                  <TextInput
                    placeholder="YYYY-MM-DD"
                    value={dob}
                    onChangeText={setDob}
                    style={[styles.fallbackDobInput, underAge && styles.inputErrorBorder]}
                  />
                ) : null}

                {Platform.OS === "ios" && showDatePicker && DateTimePicker ? (
                  <TouchableOpacity
                    onPress={() => setShowDatePicker(false)}
                    style={styles.dateDoneBtn}
                  >
                    <Text style={styles.dateDoneBtnText}>{t("common.done", { defaultValue: "Done" })}</Text>
                  </TouchableOpacity>
                ) : null}

                {underAge ? (
                  <View style={styles.underAgeBanner}>
                    <View style={styles.underAgeIconWrap}>
                      <Ionicons name="alert-circle" size={20} color={colors.error[600]} />
                    </View>
                    <View style={styles.underAgeCopy}>
                      <Text style={styles.underAgeTitle}>{tx("underAgeTitle")}</Text>
                      <Text style={styles.underAgeMessage}>{tx("underAgeMessage")}</Text>
                    </View>
                  </View>
                ) : dob ? (
                  <View style={styles.ageOkRow}>
                    <Ionicons name="checkmark-circle" size={15} color={ACCENT_DARK} />
                    <Text style={styles.ageOkText}>
                      {tx("ageEligible", { age: calculateAge(parseDobString(dob)!) })}
                    </Text>
                  </View>
                ) : (
                  <Text style={styles.hintText}>{tx("dobHint")}</Text>
                )}
              </View>

              <View style={styles.fieldGroup}>
                <FieldLabel label={tx("photoLabel")} required />
                <View style={styles.photoRow}>
                  <AadhaarPhotoSlot
                    sideLabel={tx("frontLabel")}
                    uri={aadhaarFrontUri}
                    onCapture={() => pickImage("camera", "front")}
                    onUpload={() => pickImage("library", "front")}
                    onBoxPress={() => pickImage("library", "front")}
                    onRemove={() => setAadhaarFrontUri(null)}
                    disabled={uploading}
                  />
                  <AadhaarPhotoSlot
                    sideLabel={tx("backLabel")}
                    uri={aadhaarBackUri}
                    onCapture={() => pickImage("camera", "back")}
                    onUpload={() => pickImage("library", "back")}
                    onBoxPress={() => pickImage("library", "back")}
                    onRemove={() => setAadhaarBackUri(null)}
                    disabled={uploading}
                  />
                </View>
              </View>

              {error ? (
                <View style={styles.errorBanner}>
                  <Ionicons name="warning-outline" size={18} color={colors.error[600]} />
                  <Text style={styles.errorText}>{error}</Text>
                </View>
              ) : null}

              <ContinueButton
                label={tx("continue")}
                onPress={handleContinue}
                disabled={!canContinue}
                loading={submitting}
              />
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: BG,
  },
  safeArea: {
    flex: 1,
    backgroundColor: BG,
  },
  flex: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingBottom: 28,
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 4,
    paddingBottom: 20,
    alignItems: "center",
  },
  backBtn: {
    alignSelf: "flex-start",
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.9)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.06)",
  },
  stepPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(255,255,255,0.85)",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(57, 211, 83, 0.25)",
    marginBottom: 12,
  },
  stepPillText: {
    fontSize: 12,
    fontWeight: "600",
    color: ACCENT_DARK,
  },
  title: {
    fontSize: 24,
    fontWeight: "800",
    color: colors.gray[900],
    textAlign: "center",
    marginBottom: 6,
    letterSpacing: -0.3,
  },
  subtitle: {
    fontSize: 14,
    lineHeight: 20,
    color: colors.gray[600],
    textAlign: "center",
    maxWidth: 320,
  },
  formCard: {
    marginHorizontal: 16,
    backgroundColor: "#ffffff",
    borderRadius: 20,
    padding: 20,
    gap: 20,
    borderWidth: 1,
    borderColor: "rgba(57, 211, 83, 0.15)",
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.06,
        shadowRadius: 12,
      },
      android: {
        elevation: 3,
      },
    }),
  },
  fieldGroup: {
    gap: 8,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.gray[700],
    letterSpacing: 0.2,
  },
  requiredMark: {
    color: colors.error[500],
  },
  inputWrap: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.gray[50],
    borderWidth: 1.5,
    borderColor: colors.gray[200],
    borderRadius: 14,
    paddingHorizontal: 14,
    minHeight: 52,
  },
  inputIcon: {
    marginRight: 10,
  },
  inputWithIcon: {
    flex: 1,
    fontSize: 16,
    color: colors.gray[900],
    paddingVertical: Platform.OS === "ios" ? 14 : 10,
    letterSpacing: 0.5,
  },
  inputErrorBorder: {
    borderColor: colors.error[400],
    backgroundColor: colors.error[50],
  },
  hintText: {
    fontSize: 12,
    color: colors.gray[500],
    marginLeft: 2,
  },
  dobPressable: {
    justifyContent: "space-between",
  },
  dobText: {
    flex: 1,
    fontSize: 16,
    color: colors.gray[900],
    fontWeight: "500",
  },
  dobPlaceholder: {
    color: colors.gray[400],
    fontWeight: "400",
  },
  fallbackDobInput: {
    backgroundColor: colors.gray[50],
    borderWidth: 1.5,
    borderColor: colors.gray[200],
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    marginTop: 8,
  },
  dateDoneBtn: {
    alignSelf: "flex-end",
    marginTop: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: ACCENT,
    borderRadius: 10,
  },
  dateDoneBtnText: {
    color: "#ffffff",
    fontWeight: "700",
    fontSize: 14,
  },
  underAgeBanner: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    marginTop: 4,
    padding: 12,
    backgroundColor: colors.error[50],
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.error[200],
  },
  underAgeIconWrap: {
    marginTop: 1,
  },
  underAgeCopy: {
    flex: 1,
    gap: 4,
  },
  underAgeTitle: {
    fontSize: 13,
    fontWeight: "800",
    color: colors.error[700],
  },
  underAgeMessage: {
    fontSize: 12,
    lineHeight: 18,
    color: colors.error[600],
  },
  ageOkRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 2,
  },
  ageOkText: {
    fontSize: 12,
    color: ACCENT_DARK,
    fontWeight: "600",
  },
  photoRow: {
    flexDirection: "row",
    gap: 12,
    width: "100%",
  },
  photoSlot: {
    flex: 1,
    minWidth: 0,
    overflow: "hidden",
  },
  photoSlotLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.gray[700],
    marginBottom: 6,
  },
  slotDropBox: {
    width: "100%",
    height: 84,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: colors.gray[300],
    borderStyle: "dashed",
    backgroundColor: colors.gray[50],
    overflow: "hidden",
    position: "relative",
  },
  slotDropBoxFilled: {
    borderStyle: "solid",
    borderColor: ACCENT,
    backgroundColor: "#ffffff",
  },
  slotDropBoxInner: {
    width: "100%",
    height: 84,
  },
  slotDropBoxInnerEmpty: {
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 8,
    paddingVertical: 10,
  },
  slotEmptyIcon: {
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 6,
  },
  slotPreview: {
    width: "100%",
    height: 84,
    backgroundColor: colors.gray[100],
  },
  slotRemoveBtn: {
    position: "absolute",
    top: 4,
    right: 4,
    backgroundColor: "rgba(0,0,0,0.45)",
    borderRadius: 12,
    zIndex: 2,
  },
  slotBoxPressed: {
    opacity: 0.92,
    backgroundColor: "#eefbf1",
  },
  slotTapHint: {
    fontSize: 10,
    lineHeight: 14,
    color: ACCENT_DARK,
    fontWeight: "700",
    textAlign: "center",
    ...(Platform.OS === "android" ? { includeFontPadding: false } : null),
  },
  slotActions: {
    flexDirection: "row",
    gap: 5,
    width: "100%",
    marginTop: 6,
  },
  slotActionBtn: {
    flex: 1,
    minWidth: 0,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 8,
    paddingHorizontal: 2,
    borderRadius: 8,
    backgroundColor: "#e8fced",
    borderWidth: 1,
    borderColor: "rgba(57, 211, 83, 0.35)",
  },
  slotActionInner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
  slotActionBtnPressed: {
    opacity: 0.85,
  },
  slotActionBtnDisabled: {
    opacity: 0.5,
  },
  slotActionText: {
    flexShrink: 1,
    fontSize: 10,
    fontWeight: "700",
    color: ACCENT_DARK,
    ...(Platform.OS === "android" ? { includeFontPadding: false } : null),
  },
  errorBanner: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    padding: 12,
    backgroundColor: colors.error[50],
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.error[200],
  },
  errorText: {
    flex: 1,
    fontSize: 13,
    color: colors.error[600],
    lineHeight: 18,
  },
  continueBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    backgroundColor: ACCENT,
    borderRadius: 14,
    paddingVertical: 16,
    marginTop: 4,
  },
  continueBtnDisabled: {
    backgroundColor: "#edf8f0",
    borderWidth: 1.5,
    borderColor: "rgba(57, 211, 83, 0.25)",
  },
  continueBtnText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#ffffff",
  },
  continueBtnTextDisabled: {
    color: "#7cb889",
  },
});
