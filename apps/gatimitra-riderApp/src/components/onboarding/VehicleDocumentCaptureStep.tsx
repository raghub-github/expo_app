import React from "react";
import { View, Text, TextInput, Pressable, StyleSheet } from "react-native";
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
}: Props) {
  const iconName = (doc.icon ?? "document-outline") as keyof typeof Ionicons.glyphMap;
  const needsBack = docRequiresBackPhoto(doc);
  const textValid =
    !doc.requiresTextField || textValue.trim().length >= Math.max(doc.minTextLength, 1);
  const frontValid = Boolean(photoUri);
  const backValid = !needsBack || Boolean(backPhotoUri);

  return (
    <>
      {stepLabels.length > 1 ? (
        <StepProgress steps={stepLabels} currentIndex={currentStepIndex} />
      ) : null}

      <View style={form.divider} />

      <View style={styles.checklist}>
        {doc.requiresTextField ? (
          <ChecklistItem
            done={textValid}
            label={`${doc.textFieldLabel ?? "Document number"} entered`}
          />
        ) : null}
        {needsBack ? (
          <>
            <ChecklistItem
              done={frontValid}
              label={`${doc.label} (${frontPhotoLabel.toLowerCase()}) photo added`}
            />
            <ChecklistItem
              done={backValid}
              label={`${doc.label} (${backPhotoLabel.toLowerCase()}) photo added`}
            />
          </>
        ) : (
          <ChecklistItem done={frontValid} label={`${doc.label} photo added`} />
        )}
      </View>

      <View style={form.divider} />

      {doc.requiresTextField ? (
        <View style={form.fieldGroup}>
          <FieldLabel label={doc.textFieldLabel ?? "Document number"} required />
          <View style={form.inputWrap}>
            <Ionicons
              name="create-outline"
              size={20}
              color={colors.gray[400]}
              style={form.inputIcon}
            />
            <TextInput
              value={textValue}
              onChangeText={onTextChange}
              placeholder={doc.textFieldPlaceholder ?? "Enter document number"}
              placeholderTextColor={colors.gray[400]}
              autoCapitalize="characters"
              style={form.textInput}
            />
            {textValid ? (
              <Ionicons name="checkmark-circle" size={20} color={ACCENT_DARK} />
            ) : null}
          </View>
        </View>
      ) : null}

      <View style={form.fieldGroup}>
        <FieldLabel
          label={needsBack ? `${doc.label} photos` : `${doc.label} photo`}
          required
        />
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
});
