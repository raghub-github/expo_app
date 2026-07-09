import React from "react";
import { View, Text, TextInput, Pressable, StyleSheet, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { DocumentPhotoSlot } from "@/src/components/onboarding/DocumentPhotoSlot";
import {
  ChecklistItem,
  FieldLabel,
  StepProgress,
  onboardingFormStyles as form,
} from "@/src/components/onboarding/OnboardingFormUi";
import { colors } from "@/src/theme";
import {
  docRequiresBackPhoto,
  type OnboardingDocumentTypeDef,
} from "@/src/lib/onboarding-document-types";

const ACCENT = "#39d353";
const ACCENT_DARK = "#22a745";

type Props = {
  doc: OnboardingDocumentTypeDef;
  stepLabels: string[];
  currentStepIndex: number;
  textValue: string;
  photoUri: string | null;
  backPhotoUri?: string | null;
  uploading: boolean;
  onTextChange: (value: string) => void;
  onPhotoPress: () => void;
  onBackPhotoPress?: () => void;
  onRemovePhoto: () => void;
  onRemoveBackPhoto?: () => void;
  changePhotoLabel: string;
  frontPhotoLabel?: string;
  backPhotoLabel?: string;
  checkingDuplicate?: boolean;
  alreadyRegistered?: boolean;
  duplicateWarning?: string;
  /** From vehicle type document_requirements.optional_docs in DB */
  optional?: boolean;
  skipped?: boolean;
  /** Electronic-verification modes hide the photo slots until the hybrid fallback. */
  hidePhotos?: boolean;
  /** Rendered between the number input and the photo slots (verify card). */
  afterTextSlot?: React.ReactNode;
};

export function VehicleDocumentCaptureStep({
  doc,
  stepLabels,
  currentStepIndex,
  textValue,
  photoUri,
  backPhotoUri = null,
  uploading,
  onTextChange,
  onPhotoPress,
  onBackPhotoPress,
  onRemovePhoto,
  onRemoveBackPhoto,
  changePhotoLabel,
  frontPhotoLabel = "Front",
  backPhotoLabel = "Back",
  checkingDuplicate = false,
  alreadyRegistered = false,
  duplicateWarning,
  optional = false,
  skipped = false,
  hidePhotos = false,
  afterTextSlot = null,
}: Props) {
  const iconName = (doc.icon ?? "document-outline") as keyof typeof Ionicons.glyphMap;
  const needsBack = docRequiresBackPhoto(doc);
  const textValid =
    !doc.requiresTextField || textValue.trim().length >= Math.max(doc.minTextLength, 1);
  const frontValid = Boolean(photoUri);
  const backValid = !needsBack || Boolean(backPhotoUri);
  const textVerified =
    textValid && !checkingDuplicate && !alreadyRegistered && textValue.trim().length > 0;
  const photoLabel = needsBack ? `${doc.label} photos` : `${doc.label} photo`;
  const textDone = textValid && !alreadyRegistered;
  const photoSkipped = optional && skipped && !frontValid;
  const photoDone = frontValid || photoSkipped;

  const textChecklistLabel = textDone
    ? `${doc.textFieldLabel ?? "Document number"} entered`
    : `Enter ${(doc.textFieldLabel ?? "document number").toLowerCase()}`;

  const singlePhotoChecklistLabel = photoSkipped
    ? `${doc.label} skipped`
    : frontValid
      ? `${doc.label} photo added`
      : `Add ${doc.label.toLowerCase()} photo`;

  const dualPhotoChecklistLabel = (side: string, valid: boolean) =>
    valid
      ? `${doc.label} (${side}) photo added`
      : `Add ${doc.label.toLowerCase()} (${side}) photo`;

  return (
    <>
      {stepLabels.length > 1 ? (
        <StepProgress steps={stepLabels} currentIndex={currentStepIndex} />
      ) : null}

      <View style={form.divider} />

      <View style={styles.checklist}>
        {doc.requiresTextField ? (
          <ChecklistItem done={textDone} label={textChecklistLabel} />
        ) : null}
        {needsBack ? (
          <>
            <ChecklistItem
              done={frontValid}
              label={dualPhotoChecklistLabel(frontPhotoLabel.toLowerCase(), frontValid)}
            />
            <ChecklistItem
              done={backValid}
              label={dualPhotoChecklistLabel(backPhotoLabel.toLowerCase(), backValid)}
            />
          </>
        ) : (
          <ChecklistItem done={photoDone} label={singlePhotoChecklistLabel} />
        )}
      </View>

      <View style={form.divider} />

      {doc.requiresTextField ? (
        <View style={form.fieldGroup}>
          <FieldLabel
            label={doc.textFieldLabel ?? "Document number"}
            required={!optional}
          />
          <View
            style={[
              form.inputWrap,
              alreadyRegistered ? styles.inputErrorBorder : null,
              textVerified ? styles.inputSuccessBorder : null,
            ]}
          >
            <TextInput
              value={textValue}
              onChangeText={onTextChange}
              placeholder={doc.textFieldPlaceholder ?? "Enter document number"}
              placeholderTextColor={colors.gray[400]}
              autoCapitalize="characters"
              style={form.textInput}
            />
            {textVerified ? (
              <Ionicons name="checkmark-circle" size={20} color={ACCENT_DARK} />
            ) : null}
          </View>
          {checkingDuplicate ? (
            <View style={styles.checkRow}>
              <ActivityIndicator size="small" color={ACCENT} />
              <Text style={styles.hintText}>Checking {doc.label}…</Text>
            </View>
          ) : alreadyRegistered ? (
            <Text style={styles.inlineWarningText}>
              {duplicateWarning ?? `${doc.label} Already Registered , Please try with Diff one .`}
            </Text>
          ) : null}
        </View>
      ) : null}

      {afterTextSlot}

      {hidePhotos ? null : (
      <View style={form.fieldGroup}>
        <FieldLabel label={photoLabel} required={!optional} />
        {doc.hint ? <Text style={form.sectionHint}>{doc.hint}</Text> : null}

        {needsBack ? (
          <View style={styles.dualPhotoRow}>
            <View style={styles.dualPhotoCol}>
              <Text style={styles.sideLabel}>{frontPhotoLabel}</Text>
              <DocumentPhotoSlot
                uri={photoUri}
                onPress={onPhotoPress}
                onRemove={onRemovePhoto}
                disabled={uploading}
                boxTitle="Add front"
                boxSub="Tap to capture or upload"
                icon={iconName}
              />
              {photoUri ? (
                <Pressable onPress={onPhotoPress} style={form.changePhotoLink}>
                  <Ionicons name="refresh-outline" size={14} color={ACCENT_DARK} />
                  <Text style={form.changePhotoText}>{changePhotoLabel}</Text>
                </Pressable>
              ) : null}
            </View>

            <View style={styles.dualPhotoCol}>
              <Text style={styles.sideLabel}>{backPhotoLabel}</Text>
              <DocumentPhotoSlot
                uri={backPhotoUri}
                onPress={onBackPhotoPress ?? onPhotoPress}
                onRemove={onRemoveBackPhoto ?? (() => undefined)}
                disabled={uploading}
                boxTitle="Add back"
                boxSub="Tap to capture or upload"
                icon={iconName}
              />
              {backPhotoUri ? (
                <Pressable onPress={onBackPhotoPress} style={form.changePhotoLink}>
                  <Ionicons name="refresh-outline" size={14} color={ACCENT_DARK} />
                  <Text style={form.changePhotoText}>{changePhotoLabel}</Text>
                </Pressable>
              ) : null}
            </View>
          </View>
        ) : (
          <>
            <DocumentPhotoSlot
              uri={photoUri}
              onPress={onPhotoPress}
              onRemove={onRemovePhoto}
              disabled={uploading}
              boxTitle={`Add ${doc.label}`}
              boxSub="Tap here to capture or upload"
              icon={iconName}
            />
            {photoUri ? (
              <Pressable onPress={onPhotoPress} style={form.changePhotoLink}>
                <Ionicons name="refresh-outline" size={14} color={ACCENT_DARK} />
                <Text style={form.changePhotoText}>{changePhotoLabel}</Text>
              </Pressable>
            ) : null}
          </>
        )}
      </View>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  checklist: {
    gap: 10,
  },
  dualPhotoRow: {
    flexDirection: "row",
    gap: 12,
  },
  dualPhotoCol: {
    flex: 1,
    gap: 6,
    minWidth: 0,
  },
  sideLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.gray[700],
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  inputErrorBorder: {
    borderColor: colors.error[500],
    backgroundColor: "#fef2f2",
  },
  inputSuccessBorder: {
    borderColor: ACCENT_DARK,
    backgroundColor: "#f0fdf4",
  },
  checkRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 4,
  },
  hintText: {
    fontSize: 12,
    color: colors.gray[500],
  },
  inlineWarningText: {
    fontSize: 12,
    color: colors.error[600],
    fontWeight: "600",
    marginTop: 4,
    lineHeight: 17,
  },
});
