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
  /** Called when the number field is focused — unlock editing after verified state. */
  onTextFocus?: () => void;
  /** Clear the document number field. */
  onClearText?: () => void;
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
  /** Hide the green checklist rows (number entered / photo added). */
  hideChecklist?: boolean;
  /** Rendered between the number input and the photo slots (verify card). */
  afterTextSlot?: React.ReactNode;
  /** Override the photo field label (e.g. "Upload RC Image"). */
  photoFieldLabel?: string;
  /** Override the empty photo slot title. */
  photoBoxTitle?: string;
  /** When set (e.g. Cashfree DL/RC regex), overrides length-only text validation. */
  textFormatValid?: boolean;
  /** Faded placeholder inside the input (format example). */
  textPlaceholder?: string | null;
  /** Red inline error when entered value fails format validation. */
  formatErrorMessage?: string | null;
  /** Force front + back slots (e.g. DL after Instant Verify failed). */
  forceDualPhotos?: boolean;
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
  onTextFocus,
  onClearText,
  changePhotoLabel,
  frontPhotoLabel = "Front",
  backPhotoLabel = "Back",
  checkingDuplicate = false,
  alreadyRegistered = false,
  duplicateWarning,
  optional = false,
  skipped = false,
  hidePhotos = false,
  hideChecklist = false,
  afterTextSlot = null,
  photoFieldLabel,
  photoBoxTitle,
  textFormatValid,
  textPlaceholder = null,
  formatErrorMessage = null,
  forceDualPhotos = false,
}: Props) {
  const iconName = (doc.icon ?? "document-outline") as keyof typeof Ionicons.glyphMap;
  const needsBack = forceDualPhotos || docRequiresBackPhoto(doc);
  const textValid =
    textFormatValid !== undefined
      ? textFormatValid
      : !doc.requiresTextField || textValue.trim().length >= Math.max(doc.minTextLength, 1);
  const showFormatError =
    Boolean(formatErrorMessage) && textValue.trim().length > 0 && !textValid;
  const frontValid = Boolean(photoUri);
  const backValid = !needsBack || Boolean(backPhotoUri);
  const textVerified =
    textValid && !checkingDuplicate && !alreadyRegistered && textValue.trim().length > 0;
  const photoLabel = photoFieldLabel || (needsBack ? `${doc.label} photos` : `${doc.label} photo`);
  const singleBoxTitle = photoBoxTitle || `Add ${doc.label}`;
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

      {optional && skipped ? (
        <View style={styles.skippedBanner}>
          <Ionicons name="checkmark-circle" size={18} color="#047857" />
          <Text style={styles.skippedBannerText}>
            {doc.label} skipped — tap Continue to proceed
          </Text>
        </View>
      ) : null}

      {hideChecklist ? null : (
        <>
          <View style={[styles.checklist, !needsBack ? styles.checklistSingleRow : null]}>
            {doc.requiresTextField ? (
              <View style={!needsBack ? styles.checklistCell : null}>
                <ChecklistItem done={textDone} label={textChecklistLabel} />
              </View>
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
              <View style={styles.checklistCell}>
                <ChecklistItem done={photoDone} label={singlePhotoChecklistLabel} />
              </View>
            )}
          </View>
          <View style={form.divider} />
        </>
      )}

      {doc.requiresTextField ? (
        <View style={form.fieldGroup}>
          <FieldLabel
            label={doc.textFieldLabel ?? "Document number"}
            required={!optional}
          />
          <View
            style={[
              form.inputWrap,
              alreadyRegistered || showFormatError ? styles.inputErrorBorder : null,
              textVerified ? styles.inputSuccessBorder : null,
            ]}
          >
            <TextInput
              value={textValue}
              onChangeText={onTextChange}
              onFocus={onTextFocus}
              editable={!uploading}
              placeholder={
                textPlaceholder ?? doc.textFieldPlaceholder ?? "Enter document number"
              }
              placeholderTextColor={colors.gray[400]}
              autoCapitalize="characters"
              autoCorrect={false}
              autoComplete="off"
              textContentType="none"
              importantForAutofill="no"
              selectTextOnFocus={false}
              style={form.textInput}
            />
            {textValue.trim().length > 0 && onClearText && !uploading ? (
              <Pressable
                onPress={onClearText}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel="Clear document number"
                style={styles.clearBtn}
              >
                <Ionicons name="close-circle" size={20} color={colors.gray[400]} />
              </Pressable>
            ) : null}
            {textVerified ? (
              <Ionicons
                name="checkmark-circle"
                size={20}
                color={ACCENT_DARK}
                pointerEvents="none"
              />
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
          ) : showFormatError ? (
            <Text style={styles.inlineWarningText}>{formatErrorMessage}</Text>
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
                onChangePress={onPhotoPress}
                onRemove={onRemovePhoto}
                disabled={uploading}
                uploading={uploading}
                boxTitle="Add front"
                boxSub="Tap to capture or upload"
                icon={iconName}
                viewerTitle={`${doc.label} · Front`}
                changeLabel={changePhotoLabel}
                removeTitle="Remove document?"
                removeMessage="Your image will be removed and you need to upload a new one."
              />
            </View>

            <View style={styles.dualPhotoCol}>
              <Text style={styles.sideLabel}>{backPhotoLabel}</Text>
              <DocumentPhotoSlot
                uri={backPhotoUri}
                onPress={onBackPhotoPress ?? onPhotoPress}
                onChangePress={onBackPhotoPress ?? onPhotoPress}
                onRemove={onRemoveBackPhoto ?? (() => undefined)}
                disabled={uploading}
                uploading={uploading}
                boxTitle="Add back"
                boxSub="Tap to capture or upload"
                icon={iconName}
                viewerTitle={`${doc.label} · Back`}
                changeLabel={changePhotoLabel}
                removeTitle="Remove document?"
                removeMessage="Your image will be removed and you need to upload a new one."
              />
            </View>
          </View>
        ) : (
          <DocumentPhotoSlot
            uri={photoUri}
            onPress={onPhotoPress}
            onChangePress={onPhotoPress}
            onRemove={onRemovePhoto}
            disabled={uploading}
            uploading={uploading}
            boxTitle={singleBoxTitle}
            boxSub="Tap here to capture or upload"
            icon={iconName}
            viewerTitle={doc.label}
            changeLabel={changePhotoLabel}
            removeTitle="Remove document?"
            removeMessage="Your image will be removed and you need to upload a new one."
          />
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
  checklistSingleRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "nowrap",
    gap: 8,
  },
  checklistCell: {
    flex: 1,
    minWidth: 0,
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
  clearBtn: {
    padding: 2,
    marginLeft: 2,
  },
  skippedBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#ecfdf5",
    borderWidth: 1,
    borderColor: "#a7f3d0",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 4,
  },
  skippedBannerText: {
    flex: 1,
    fontSize: 13,
    fontWeight: "600",
    color: "#047857",
    lineHeight: 18,
  },
});
