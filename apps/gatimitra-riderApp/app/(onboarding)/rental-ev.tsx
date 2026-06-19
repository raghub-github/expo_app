// @ts-nocheck — pending strict-mode cleanup; tracked in follow-up issue.
import React, { useState, useEffect, useMemo } from "react";
import {
  View,
  Text,
  TextInput,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Alert,
  Pressable,
  StyleSheet,
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
import { useSaveOnboardingStep, useRiderStatus } from "@/src/hooks/useOnboarding";
import { useOnboardingEstablishedRedirect } from "@/src/hooks/useOnboardingEstablishedRedirect";
import { useSaveDocument } from "@/src/hooks/useDocuments";
import { useOnboardingVehicleTypes } from "@/src/hooks/useOnboardingVehicleTypes";
import { useOnboardingDocumentTypes } from "@/src/hooks/useOnboardingDocumentTypes";
import { useSessionStore } from "@/src/stores/sessionStore";
import { uploadToR2, deleteFromR2, buildRiderDocumentKey } from "@/src/services/storage/cloudflareR2";
import { DocumentPhotoSlot } from "@/src/components/onboarding/DocumentPhotoSlot";
import {
  ChecklistItem,
  ContinueButton,
  ErrorBanner,
  FieldLabel,
  onboardingFormStyles as form,
} from "@/src/components/onboarding/OnboardingFormUi";
import { goBackOrReplace } from "@/src/lib/onboarding-navigation";
import { onboardingStepToRoute, isVehicleOnboardingComplete, type ServerOnboardingStep } from "@/src/lib/onboarding-routes";
import {
  docUploadToStorePatch,
  findDocumentType,
  getDocUploadState,
  resolveDocIcon,
  resolveVehicleRequiredDocs,
} from "@/src/lib/onboarding-document-types";
import {
  findVehicleType,
  FALLBACK_ONBOARDING_VEHICLE_TYPES,
} from "@/src/lib/onboarding-vehicle-types";
import { colors } from "@/src/theme";

const ACCENT = "#39d353";
const ACCENT_DARK = "#22a745";
const BG = "#f4fbf6";

const COPY = {
  stepLabel: "Step 3 · Vehicle proof",
  title: "Upload vehicle proof",
  subtitle: "Add the document required for your selected vehicle",
  docTypeLabel: "Document type",
  photoLabel: "Document photo",
  boxSub: "Tap here to capture or upload",
  speedLabel: "Maximum speed (km/h)",
  speedPlaceholder: "e.g. 60",
  speedHint: "Declare the top speed of your rental or EV vehicle",
  pickerTitle: "Add document photo",
  pickerMessage: "Choose how you want to add this document",
  capture: "Capture",
  upload: "Upload from gallery",
  cancel: "Cancel",
  continue: "Continue",
  uploading: "Uploading…",
  changePhoto: "Change photo",
  docTypeRequired: "Please select a document type",
  photoRequired: "Please add a photo of your document",
  speedRequired: "Please enter a valid maximum speed",
  riderNotFound: "Rider ID not found. Please try again.",
  notAuthenticated: "Not authenticated. Please login again.",
  uploadError: "Failed to upload. Please try again.",
  captureFailed: "Failed to capture photo. Please try again.",
  uploadFailed: "Failed to pick photo. Please try again.",
  cameraPermissionTitle: "Permission Required",
  cameraPermissionMessage: "Camera permission is required to capture document photos",
  galleryPermissionTitle: "Gallery access needed",
  galleryPermissionMessage: "Allow photo access to upload from gallery",
} as const;

function DocTypeRow({
  selected,
  title,
  hint,
  icon,
  onPress,
}: {
  selected: boolean;
  title: string;
  hint: string;
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.docTypeOuter,
        selected && styles.docTypeOuterSelected,
        pressed && styles.docTypePressed,
      ]}
    >
      <View style={styles.docTypeRow}>
        <View style={styles.docTypeLeftCol}>
          <View style={[styles.docTypeIconWrap, selected && styles.docTypeIconWrapSelected]}>
            <Ionicons name={icon} size={22} color={selected ? ACCENT_DARK : colors.gray[500]} />
          </View>
        </View>
        <View style={styles.docTypeCenterCol}>
          <Text style={[styles.docTypeTitle, selected && styles.docTypeTitleSelected]} numberOfLines={1}>
            {title}
          </Text>
          <Text style={styles.docTypeHint} numberOfLines={2}>
            {hint}
          </Text>
        </View>
        <View style={styles.docTypeRightCol}>
          <View style={[styles.docTypeRadio, selected && styles.docTypeRadioSelected]}>
            {selected ? <View style={styles.docTypeRadioDot} /> : null}
          </View>
        </View>
      </View>
    </Pressable>
  );
}

function documentFileEntry(upload: { proxyUrl: string; key: string }) {
  return [
    {
      side: "single" as const,
      fileUrl: upload.proxyUrl,
      r2Key: upload.key,
      mimeType: "image/jpeg",
    },
  ];
}

export default function RentalEvScreen() {
  const { t } = useTranslation();
  const tx = (key: keyof typeof COPY) =>
    t(`onboarding.rentalEv.${key}`, { defaultValue: COPY[key] });

  const session = useSessionStore((s) => s.session);
  const { data, setData, hydrate } = useOnboardingStore();
  const saveStep = useSaveOnboardingStep();
  const saveDocument = useSaveDocument();
  const { data: riderStatus } = useRiderStatus(data.riderId);
  useOnboardingEstablishedRedirect(riderStatus);
  const { data: vehicleTypes = FALLBACK_ONBOARDING_VEHICLE_TYPES } = useOnboardingVehicleTypes();
  const { data: documentCatalog = [] } = useOnboardingDocumentTypes("rental_ev");

  const selectedVehicleType = useMemo(
    () => findVehicleType(vehicleTypes, data.vehicleChoice),
    [vehicleTypes, data.vehicleChoice]
  );

  const requiredDocs = useMemo(
    () => resolveVehicleRequiredDocs(selectedVehicleType, documentCatalog, "rental_ev"),
    [selectedVehicleType, documentCatalog]
  );

  const requiresMaxSpeed = Boolean(selectedVehicleType?.documentRequirements?.requires_max_speed);

  const [selectedDocCode, setSelectedDocCode] = useState<string | null>(() => {
    for (const doc of requiredDocs) {
      const state = getDocUploadState(data, doc.code);
      if (state.localUri || state.signedUrl) return doc.code;
    }
    return requiredDocs.length === 1 ? requiredDocs[0]?.code ?? null : null;
  });
  const [documentUri, setDocumentUri] = useState<string | null>(null);
  const [maxSpeedDeclaration, setMaxSpeedDeclaration] = useState<string>(
    data.maxSpeedDeclaration?.toString() || ""
  );
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedDocDef = useMemo(
    () => findDocumentType(documentCatalog, selectedDocCode),
    [documentCatalog, selectedDocCode]
  );

  useEffect(() => {
    if (requiredDocs.length === 1 && !selectedDocCode) {
      setSelectedDocCode(requiredDocs[0]!.code);
    }
  }, [requiredDocs, selectedDocCode]);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  useEffect(() => {
    const next = riderStatus?.nextOnboardingStep;
    if (
      next === "payment" ||
      (next === "rental_ev" &&
        isVehicleOnboardingComplete(
          next as ServerOnboardingStep,
          riderStatus?.completedOnboardingSteps,
          data.vehicleOnboardingFlow
        ))
    ) {
      router.replace("/(onboarding)/payment");
      return;
    }
    if (next && next !== "rental_ev") {
      router.replace(onboardingStepToRoute(next as ServerOnboardingStep));
      return;
    }
    if (data.vehicleOnboardingFlow === "payment" || data.vehicleOnboardingFlow === "dl_rc") {
      router.replace("/(onboarding)/dl-rc");
    }
  }, [
    riderStatus?.nextOnboardingStep,
    riderStatus?.completedOnboardingSteps,
    data.vehicleOnboardingFlow,
  ]);

  useEffect(() => {
    if (!selectedDocCode) return;
    const state = getDocUploadState(data, selectedDocCode);
    setDocumentUri(state.localUri ?? state.signedUrl);
  }, [selectedDocCode, data]);

  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      goBackOrReplace("/(onboarding)/dl-rc");
      return true;
    });
    return () => sub.remove();
  }, []);

  const speedValid =
    !requiresMaxSpeed ||
    (maxSpeedDeclaration.trim().length > 0 && !Number.isNaN(Number(maxSpeedDeclaration)));
  const photoValid = Boolean(documentUri);
  const canContinue =
    Boolean(selectedDocCode) && photoValid && speedValid && !uploading && !submitting;

  const handleBack = () => {
    goBackOrReplace("/(onboarding)/dl-rc");
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

  const pickPhoto = async (source: "camera" | "library"): Promise<string | null> => {
    if (source === "camera") {
      const ok = await requestCameraPermission();
      if (!ok) return null;
    } else {
      const ok = await requestGalleryPermission();
      if (!ok) return null;
    }

    try {
      const result =
        source === "camera"
          ? await ImagePicker.launchCameraAsync({
              mediaTypes: ["images"],
              allowsEditing: true,
              aspect: [4, 3],
              quality: 0.9,
            })
          : await ImagePicker.launchImageLibraryAsync({
              mediaTypes: ["images"],
              allowsEditing: true,
              aspect: [4, 3],
              quality: 0.9,
            });

      if (!result.canceled && result.assets[0]) {
        return result.assets[0].uri;
      }
    } catch {
      setError(source === "camera" ? tx("captureFailed") : tx("uploadFailed"));
    }
    return null;
  };

  const showPhotoOptions = () => {
    Alert.alert(tx("pickerTitle"), tx("pickerMessage"), [
      {
        text: tx("capture"),
        onPress: () => {
          void pickPhoto("camera").then((uri) => {
            if (!uri) return;
            setError(null);
            setDocumentUri(uri);
          });
        },
      },
      {
        text: tx("upload"),
        onPress: () => {
          void pickPhoto("library").then((uri) => {
            if (!uri) return;
            setError(null);
            setDocumentUri(uri);
          });
        },
      },
      { text: tx("cancel"), style: "cancel" },
    ]);
  };

  const selectDocumentType = (code: string) => {
    if (selectedDocCode !== code) {
      setSelectedDocCode(code);
      setDocumentUri(null);
    }
    setError(null);
  };

  const handleContinue = async () => {
    if (!selectedDocCode || !selectedDocDef) {
      setError(tx("docTypeRequired"));
      return;
    }
    if (!documentUri) {
      setError(tx("photoRequired"));
      return;
    }
    if (!speedValid) {
      setError(tx("speedRequired"));
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
      const riderId = parseInt(data.riderId, 10);
      const uploadResult = await uploadToR2(
        documentUri,
        "documents",
        session.accessToken,
        buildRiderDocumentKey(riderId, selectedDocCode, "single")
      );
      uploadedKeys.push(uploadResult.key);

      await saveDocument.mutateAsync({
        riderId,
        docType: selectedDocCode,
        fileUrl: uploadResult.proxyUrl,
        r2Key: uploadResult.key,
        files: documentFileEntry(uploadResult),
      });

      const legacyPatch = docUploadToStorePatch(data, selectedDocCode, {
        localUri: documentUri,
        signedUrl: uploadResult.proxyUrl,
      });

      await setData({
        ...legacyPatch,
        maxSpeedDeclaration: requiresMaxSpeed ? Number(maxSpeedDeclaration) : undefined,
        currentStep: "rental_ev",
        hasOwnVehicle: false,
        vehicleChoice: data.vehicleChoice ?? "rental_ev",
        vehicleOnboardingFlow: "rental_ev",
      });

      await saveStep.mutateAsync({
        riderId: data.riderId,
        step: "dl_rc",
        data: { hasOwnVehicle: false },
      });

      const stepData: Record<string, unknown> = {
        uploadedDocCode: selectedDocCode,
        uploadedDocSignedUrl: uploadResult.proxyUrl,
      };
      if (requiresMaxSpeed) {
        stepData.maxSpeedDeclaration = Number(maxSpeedDeclaration);
      }
      if (selectedDocCode === "rental_proof") {
        stepData.rentalProofSignedUrl = uploadResult.proxyUrl;
      }
      if (selectedDocCode === "ev_proof") {
        stepData.evProofSignedUrl = uploadResult.proxyUrl;
      }

      await saveStep.mutateAsync({
        riderId: data.riderId,
        step: "rental_ev",
        data: stepData,
      });

      router.push("/(onboarding)/payment");
    } catch (e) {
      for (const key of uploadedKeys) {
        try {
          await deleteFromR2(key, session.accessToken);
        } catch (rollbackError) {
          console.error(`[Rollback] Failed to delete R2 file ${key}:`, rollbackError);
        }
      }
      setError(e instanceof Error ? e.message : tx("uploadError"));
    } finally {
      setSubmitting(false);
      setUploading(false);
    }
  };

  if (data.vehicleOnboardingFlow !== "rental_ev") {
    return null;
  }

  return (
    <View style={form.root}>
      <StatusBar style="dark" backgroundColor={BG} translucent={false} />

      <SafeAreaView style={form.safeArea} edges={["top", "bottom"]}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={form.flex}
        >
          <ScrollView
            contentContainerStyle={form.scrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <LinearGradient
              colors={["#dff5e4", BG]}
              start={{ x: 0.5, y: 0 }}
              end={{ x: 0.5, y: 1 }}
              style={form.header}
            >
              <Pressable onPress={handleBack} style={form.backBtn} accessibilityRole="button">
                <Ionicons name="arrow-back" size={20} color={colors.gray[700]} />
              </Pressable>

              <View style={form.stepPill}>
                <Ionicons name="document-text-outline" size={14} color={ACCENT_DARK} />
                <Text style={form.stepPillText}>{tx("stepLabel")}</Text>
              </View>

              <Text style={form.title}>{tx("title")}</Text>
              <Text style={form.subtitle}>
                {selectedVehicleType?.infoMessage ?? tx("subtitle")}
              </Text>
            </LinearGradient>

            <View style={form.formCard}>
              <View style={styles.checklist}>
                <ChecklistItem done={Boolean(selectedDocCode)} label="Document type selected" />
                <ChecklistItem done={photoValid} label="Document photo added" />
                {requiresMaxSpeed ? (
                  <ChecklistItem done={speedValid} label="Max speed declared" />
                ) : null}
              </View>

              <View style={form.divider} />

              {requiredDocs.length > 1 ? (
                <View style={form.fieldGroup}>
                  <FieldLabel label={tx("docTypeLabel")} required />
                  <View style={styles.docTypeList}>
                    {requiredDocs.map((doc) => (
                      <DocTypeRow
                        key={doc.code}
                        selected={selectedDocCode === doc.code}
                        title={doc.label}
                        hint={doc.hint ?? ""}
                        icon={resolveDocIcon(doc.icon) as keyof typeof Ionicons.glyphMap}
                        onPress={() => selectDocumentType(doc.code)}
                      />
                    ))}
                  </View>
                </View>
              ) : null}

              {selectedDocDef ? (
                <>
                  <View style={form.fieldGroup}>
                    <FieldLabel label={tx("photoLabel")} required />
                    <Text style={form.sectionHint}>{selectedDocDef.hint ?? ""}</Text>
                    <DocumentPhotoSlot
                      uri={documentUri}
                      onPress={showPhotoOptions}
                      onRemove={() => setDocumentUri(null)}
                      disabled={uploading}
                      boxTitle={`Add ${selectedDocDef.label}`}
                      boxSub={tx("boxSub")}
                      icon={resolveDocIcon(selectedDocDef.icon) as keyof typeof Ionicons.glyphMap}
                    />
                    {documentUri ? (
                      <Pressable onPress={showPhotoOptions} style={form.changePhotoLink}>
                        <Ionicons name="refresh-outline" size={14} color={ACCENT_DARK} />
                        <Text style={form.changePhotoText}>{tx("changePhoto")}</Text>
                      </Pressable>
                    ) : null}
                  </View>

                  {requiresMaxSpeed ? (
                    <View style={form.fieldGroup}>
                      <FieldLabel label={tx("speedLabel")} required />
                      <Text style={form.sectionHint}>{tx("speedHint")}</Text>
                      <View style={form.inputWrap}>
                        <Ionicons
                          name="speedometer-outline"
                          size={20}
                          color={colors.gray[400]}
                          style={form.inputIcon}
                        />
                        <TextInput
                          value={maxSpeedDeclaration}
                          onChangeText={setMaxSpeedDeclaration}
                          placeholder={tx("speedPlaceholder")}
                          placeholderTextColor={colors.gray[400]}
                          keyboardType="number-pad"
                          style={form.textInput}
                        />
                        {speedValid ? (
                          <Ionicons name="checkmark-circle" size={20} color={ACCENT_DARK} />
                        ) : null}
                      </View>
                    </View>
                  ) : null}
                </>
              ) : null}

              {error ? <ErrorBanner message={error} /> : null}

              <ContinueButton
                label={uploading ? tx("uploading") : tx("continue")}
                onPress={() => void handleContinue()}
                disabled={!canContinue}
                loading={submitting || uploading || saveStep.isPending}
              />
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  checklist: { gap: 10 },
  docTypeList: { gap: 10 },
  docTypeOuter: {
    width: "100%",
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: colors.gray[200],
    backgroundColor: colors.gray[50],
    overflow: "hidden",
  },
  docTypeOuterSelected: { borderColor: ACCENT, backgroundColor: "#f0fdf4" },
  docTypePressed: { opacity: 0.92 },
  docTypeRow: {
    flexDirection: "row",
    alignItems: "center",
    width: "100%",
    minHeight: 68,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  docTypeLeftCol: { width: 44, flexShrink: 0, alignItems: "center", justifyContent: "center" },
  docTypeCenterCol: {
    flex: 1,
    flexShrink: 1,
    minWidth: 0,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 10,
  },
  docTypeRightCol: { width: 22, flexShrink: 0, alignItems: "center", justifyContent: "center" },
  docTypeIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: "#ffffff",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.gray[200],
  },
  docTypeIconWrapSelected: {
    borderColor: "rgba(57, 211, 83, 0.35)",
    backgroundColor: "#e8fced",
  },
  docTypeTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.gray[800],
    textAlign: "center",
    width: "100%",
    ...Platform.select({ android: { includeFontPadding: false } }),
  },
  docTypeTitleSelected: { color: ACCENT_DARK },
  docTypeHint: {
    fontSize: 12,
    color: colors.gray[500],
    lineHeight: 16,
    textAlign: "center",
    width: "100%",
    marginTop: 2,
    ...Platform.select({ android: { includeFontPadding: false } }),
  },
  docTypeRadio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: colors.gray[300],
    backgroundColor: "#ffffff",
    alignItems: "center",
    justifyContent: "center",
  },
  docTypeRadioSelected: { borderColor: ACCENT },
  docTypeRadioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: ACCENT,
  },
});
