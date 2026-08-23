import React, { useEffect, useImperativeHandle, useMemo, useState, forwardRef } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  Image,
  StyleSheet,
  Alert,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import * as ImagePicker from "expo-image-picker";
import type { RiderRecentOrder } from "@/src/services/riderSupport.service";
import { colors } from "@/src/theme";

const BRAND = colors.primary[600];
const BRAND_LIGHT = colors.primary[100];
const BRAND_BORDER = colors.primary[300];
const MAX_CHARS = 1000;
const MAX_PHOTOS = 3;
const MIN_DESC_CHARS = 3;

export type RaiseTicketSubmitPayload = {
  description: string;
  photoUris: string[];
  raisedByName?: string;
  raisedByMobile?: string;
  raisedByEmail?: string;
};

export type PhotoPreviewState = {
  uri: string | null;
  slot: number | null;
};

export type RaiseTicketSubmitFormHandle = {
  submitIfReady: () => void;
  confirmPhotoPreview: () => void;
  cancelPhotoPreview: () => void;
  pickAnotherPhoto: () => void;
};

type Props = {
  issueTitle: string;
  order?: RiderRecentOrder | null;
  isPreLogin?: boolean;
  onCanSubmitChange?: (canSubmit: boolean) => void;
  onSubmit: (payload: RaiseTicketSubmitPayload) => void;
  onPhotoPreviewChange?: (preview: PhotoPreviewState) => void;
  onDescriptionFocus?: () => void;
};

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function isValidMobile(value: string): boolean {
  const digits = value.replace(/\D/g, "");
  return digits.length >= 10 && digits.length <= 15;
}

export const RaiseTicketSubmitForm = forwardRef<RaiseTicketSubmitFormHandle, Props>(
  function RaiseTicketSubmitForm({ issueTitle, order, isPreLogin = false, onCanSubmitChange, onSubmit, onPhotoPreviewChange, onDescriptionFocus }, ref) {
  const { t } = useTranslation();
  const [description, setDescription] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactMobile, setContactMobile] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [photos, setPhotos] = useState<(string | undefined)[]>(
    Array.from({ length: MAX_PHOTOS }, () => undefined),
  );
  const [previewUri, setPreviewUri] = useState<string | null>(null);
  const [previewSlot, setPreviewSlot] = useState<number | null>(null);

  const photoUris = useMemo(() => photos.filter((u): u is string => Boolean(u)), [photos]);

  const canSubmit = useMemo(() => {
    const hasContent = description.trim().length >= MIN_DESC_CHARS || photoUris.length >= 1;
    if (!isPreLogin) return hasContent;
    const nameOk = contactName.trim().length >= 2;
    const contactOk = isValidMobile(contactMobile) || isValidEmail(contactEmail);
    return hasContent && nameOk && contactOk;
  }, [description, photoUris.length, isPreLogin, contactName, contactMobile, contactEmail]);

  useEffect(() => {
    onCanSubmitChange?.(canSubmit);
  }, [canSubmit, onCanSubmitChange]);

  useEffect(() => {
    onPhotoPreviewChange?.({ uri: previewUri, slot: previewSlot });
  }, [previewUri, previewSlot, onPhotoPreviewChange]);

  const pickImage = async (slot: number, allowsEditing: boolean) => {
    // System Photo Picker — no media-library permission required (no `legacy`).
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.85,
      allowsEditing,
      allowsMultipleSelection: false,
    });
    if (result.canceled || !result.assets[0]?.uri) return;
    setPreviewSlot(slot);
    setPreviewUri(result.assets[0].uri);
  };

  const launchGallery = async (slot: number) => pickImage(slot, false);

  const confirmPreview = () => {
    if (previewSlot == null || !previewUri) return;
    const slot = previewSlot;
    const uri = previewUri;
    setPhotos((prev) => {
      const next = [...prev];
      next[slot] = uri;
      return next;
    });
    setPreviewUri(null);
    setPreviewSlot(null);
  };

  const cancelPreview = () => {
    setPreviewUri(null);
    setPreviewSlot(null);
  };

  const removePhoto = (slot: number) => {
    setPhotos((prev) => {
      const next = [...prev];
      next[slot] = undefined;
      return next;
    });
  };

  const onPhotoSlotPress = (slot: number) => {
    const uri = photos[slot];
    if (!uri) {
      void launchGallery(slot);
      return;
    }
    Alert.alert(
      t("profile.supportFlow.photoOptions", "Photo"),
      undefined,
      [
        { text: t("common.cancel", "Cancel"), style: "cancel" },
        {
          text: t("profile.supportFlow.replacePhoto", "Replace"),
          onPress: () => void launchGallery(slot),
        },
        {
          text: t("profile.supportFlow.removePhoto", "Remove"),
          style: "destructive",
          onPress: () => removePhoto(slot),
        },
      ],
    );
  };

  const handleSubmit = () => {
    if (!canSubmit) return;
    onSubmit({
      description: description.trim(),
      photoUris,
      ...(isPreLogin
        ? {
            raisedByName: contactName.trim(),
            raisedByMobile: isValidMobile(contactMobile)
              ? contactMobile.replace(/\D/g, "")
              : undefined,
            raisedByEmail: isValidEmail(contactEmail) ? contactEmail.trim().toLowerCase() : undefined,
          }
        : {}),
    });
  };

  useImperativeHandle(
    ref,
    () => ({
      submitIfReady: handleSubmit,
      confirmPhotoPreview: confirmPreview,
      cancelPhotoPreview: cancelPreview,
      pickAnotherPhoto: () => {
        const slot = previewSlot;
        cancelPreview();
        if (slot != null) void launchGallery(slot);
      },
    }),
    [handleSubmit, previewSlot, previewUri],
  );

  return (
    <>
    <View style={styles.wrap}>
      {order ? (
        <View style={styles.orderChip}>
          <Ionicons name="cube-outline" size={14} color={BRAND} />
          <Text style={styles.orderChipText} numberOfLines={1}>
            {order.formatted_order_id || order.order_id || `#${order.id}`}
            {order.merchant_store_name ? ` · ${order.merchant_store_name}` : ""}
          </Text>
        </View>
      ) : null}

      <Text style={styles.hint}>
        {t("profile.supportFlow.helpUnderstand", "Help us understand your problem better")}
      </Text>

      {isPreLogin ? (
        <View style={styles.preLoginBanner}>
          <Ionicons name="information-circle" size={18} color="#B45309" />
          <Text style={styles.preLoginBannerText}>
            {t(
              "profile.supportFlow.preLoginBanner",
              "Please share your name and mobile number or email so the GatiMitra team can assist you better when you raise a ticket before login.",
            )}
          </Text>
        </View>
      ) : null}

      {isPreLogin ? (
        <View style={styles.contactBlock}>
          <Text style={styles.fieldLabel}>
            {t("profile.supportFlow.contactName", "Your name")}
            <Text style={styles.required}> *</Text>
          </Text>
          <TextInput
            value={contactName}
            onChangeText={setContactName}
            placeholder={t("profile.supportFlow.contactNamePh", "Enter your full name")}
            placeholderTextColor="#94A3B8"
            style={styles.input}
            autoCapitalize="words"
          />

          <Text style={styles.fieldLabel}>
            {t("profile.supportFlow.contactMobile", "Mobile number")}
          </Text>
          <TextInput
            value={contactMobile}
            onChangeText={setContactMobile}
            placeholder={t("profile.supportFlow.contactMobilePh", "10-digit mobile number")}
            placeholderTextColor="#94A3B8"
            style={styles.input}
            keyboardType="phone-pad"
            maxLength={15}
          />

          <Text style={styles.orLabel}>{t("profile.supportFlow.contactOr", "OR")}</Text>

          <Text style={styles.fieldLabel}>
            {t("profile.supportFlow.contactEmail", "Email address")}
          </Text>
          <TextInput
            value={contactEmail}
            onChangeText={setContactEmail}
            placeholder={t("profile.supportFlow.contactEmailPh", "Enter your email")}
            placeholderTextColor="#94A3B8"
            style={styles.input}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
          />
          <Text style={styles.contactHint}>
            {t(
              "profile.supportFlow.contactHint",
              "Mobile or email — at least one is required so we can reach you.",
            )}
          </Text>
        </View>
      ) : null}

      <Text style={styles.fieldLabel}>
        {t("profile.supportFlow.issueDetails", "Describe your issue")}
      </Text>
      <TextInput
        value={description}
        onChangeText={(v) => setDescription(v.slice(0, MAX_CHARS))}
        onFocus={onDescriptionFocus}
        placeholder={t(
          "profile.supportFlow.messagePh",
          "You can share the issue you are facing here",
        )}
        placeholderTextColor="#94A3B8"
        style={styles.textArea}
        multiline
        textAlignVertical="top"
      />
      <Text style={styles.counter}>
        {description.length}/{MAX_CHARS}
      </Text>

      <Text style={styles.photosLabel}>
        {t("profile.supportFlow.photosLabel", "Add supporting photos")}
        <Text style={styles.required}> *</Text>
      </Text>
      <View style={styles.photoRow}>
        {Array.from({ length: MAX_PHOTOS }).map((_, i) => {
          const uri = photos[i];
          return (
            <Pressable
              key={i}
              onPress={() => onPhotoSlotPress(i)}
              style={styles.photoSlot}
              accessibilityLabel={t("profile.supportFlow.addPhoto", "Add photo")}
            >
              {uri ? (
                <View style={styles.photoFilled}>
                  <Image source={{ uri }} style={styles.photoImg} />
                  <View style={styles.photoBadge}>
                    <Ionicons name="checkmark-circle" size={20} color={BRAND} />
                  </View>
                </View>
              ) : (
                <View style={styles.photoPlaceholder}>
                  <Ionicons name="camera-outline" size={28} color={BRAND} />
                  <Ionicons name="add" size={14} color={BRAND} style={styles.photoAddIcon} />
                </View>
              )}
            </Pressable>
          );
        })}
      </View>
      <Text style={styles.photosCaption}>
        {t("profile.supportFlow.photosCaption", "These photos act as proof to support your claim")}
      </Text>
    </View>
    </>
  );
  },
);

/** Full-width primary CTA pinned at screen bottom. */
export function RaiseTicketSubmitFooter({
  canSubmit,
  submitting,
  onPress,
}: {
  canSubmit: boolean;
  submitting: boolean;
  onPress: () => void;
}) {
  const { t } = useTranslation();
  const active = canSubmit && !submitting;

  return (
    <TouchableOpacity
      activeOpacity={0.85}
      disabled={!active}
      onPress={onPress}
      style={[footerStyles.buttonOuter, !active && footerStyles.buttonOuterInactive]}
      accessibilityRole="button"
      accessibilityState={{ disabled: !active }}
      accessibilityLabel={t("profile.supportFlow.submit", "Submit")}
    >
      <View style={[footerStyles.buttonInner, !active && footerStyles.buttonInnerInactive]}>
        {submitting ? (
          <ActivityIndicator color="#FFFFFF" size="small" />
        ) : (
          <>
            <Text style={[footerStyles.buttonText, !active && footerStyles.buttonTextInactive]}>
              {t("profile.supportFlow.submit", "Submit")}
            </Text>
            <Ionicons
              name="arrow-forward"
              size={20}
              color={active ? "#FFFFFF" : colors.primary[700]}
            />
          </>
        )}
      </View>
    </TouchableOpacity>
  );
}

const footerStyles = StyleSheet.create({
  buttonOuter: {
    width: "100%",
    alignSelf: "stretch",
    borderRadius: 14,
    overflow: "hidden",
    ...Platform.select({
      ios: {
        shadowColor: BRAND,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.25,
        shadowRadius: 8,
      },
      android: { elevation: 4 },
      default: {},
    }),
  },
  buttonOuterInactive: {
    shadowOpacity: 0,
    elevation: 0,
  },
  buttonInner: {
    width: "100%",
    minHeight: 54,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 16,
    paddingHorizontal: 20,
    backgroundColor: BRAND,
    borderRadius: 14,
  },
  buttonInnerInactive: {
    backgroundColor: colors.primary[200],
    borderWidth: 1,
    borderColor: colors.primary[300],
  },
  buttonText: {
    fontSize: 17,
    fontWeight: "800",
    color: "#FFFFFF",
    letterSpacing: 0.3,
  },
  buttonTextInactive: {
    color: colors.primary[700],
    fontWeight: "700",
  },
});

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
  },
  orderChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    alignSelf: "flex-start",
    backgroundColor: BRAND_LIGHT,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    marginBottom: 12,
    maxWidth: "100%",
  },
  orderChipText: { fontSize: 12, fontWeight: "700", color: BRAND, flexShrink: 1 },
  hint: { fontSize: 14, color: "#334155", marginBottom: 12, fontWeight: "500" },
  preLoginBanner: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    backgroundColor: "#FEF9C3",
    borderWidth: 1,
    borderColor: "#FDE047",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    marginBottom: 16,
  },
  preLoginBannerText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 19,
    color: "#854D0E",
    fontWeight: "500",
  },
  contactBlock: { marginBottom: 16 },
  fieldLabel: { fontSize: 14, fontWeight: "700", color: "#0F172A", marginBottom: 8 },
  input: {
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
    fontSize: 15,
    color: "#0F172A",
    backgroundColor: "#FFFFFF",
    marginBottom: 12,
  },
  orLabel: {
    alignSelf: "center",
    fontSize: 12,
    fontWeight: "700",
    color: "#94A3B8",
    marginBottom: 12,
  },
  contactHint: {
    fontSize: 12,
    color: "#64748B",
    lineHeight: 18,
    marginTop: -4,
    marginBottom: 4,
  },
  textArea: {
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 12,
    minHeight: 160,
    padding: 14,
    fontSize: 15,
    color: "#0F172A",
    backgroundColor: "#FFFFFF",
  },
  counter: {
    alignSelf: "flex-end",
    marginTop: 6,
    fontSize: 12,
    color: "#94A3B8",
  },
  photosLabel: { marginTop: 20, fontSize: 15, fontWeight: "700", color: "#0F172A" },
  required: { color: "#DC2626" },
  photoRow: { flexDirection: "row", gap: 12, marginTop: 12 },
  photoSlot: {
    flex: 1,
    aspectRatio: 1,
    maxWidth: 108,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: BRAND_BORDER,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    backgroundColor: BRAND_LIGHT,
  },
  photoPlaceholder: { alignItems: "center", justifyContent: "center" },
  photoAddIcon: { position: "absolute", right: -4, bottom: -2 },
  photoFilled: { width: "100%", height: "100%", position: "relative" },
  photoImg: { width: "100%", height: "100%" },
  photoBadge: {
    position: "absolute",
    top: 4,
    right: 4,
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
  },
  photosCaption: { marginTop: 10, fontSize: 12, color: "#64748B", lineHeight: 18 },
});
