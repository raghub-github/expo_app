import React, { useCallback, useMemo, useState } from "react";
import { AppText } from "@/components/AppText";

import { View, TextInput, Pressable, Image, StyleSheet, Alert, TouchableOpacity, ActivityIndicator, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";

const GREEN = "#22C55E";
const GREEN_LIGHT = "#DCFCE7";
const GREEN_BORDER = "#86EFAC";
const TEXT = "#1C1C1C";
const MUTED = "#828282";
const MAX_CHARS = 10000;
const MAX_PHOTOS = 3;
const MIN_DESC_CHARS = 10;

export type CustomerSupportTicketIntakePayload = {
  description: string;
  photoUris: string[];
};

type Props = {
  issueTitle: string;
  initialDescription?: string;
  submitting?: boolean;
  onSubmit: (payload: CustomerSupportTicketIntakePayload) => void;
};

export function CustomerSupportTicketIntakeForm({
  issueTitle,
  initialDescription = "",
  submitting = false,
  onSubmit,
}: Props) {
  const [description, setDescription] = useState(initialDescription);
  const [photos, setPhotos] = useState<(string | undefined)[]>(
    Array.from({ length: MAX_PHOTOS }, () => undefined)
  );

  const photoUris = useMemo(() => photos.filter((uri): uri is string => Boolean(uri)), [photos]);
  const remainingPhotoSlots = MAX_PHOTOS - photoUris.length;
  const canSubmit = description.trim().length >= MIN_DESC_CHARS && !submitting;

  const fillPhotoSlots = useCallback((uris: string[]) => {
    if (uris.length === 0) return;
    setPhotos((prev) => {
      const next = [...prev];
      let slot = 0;
      for (const uri of uris) {
        while (slot < MAX_PHOTOS && next[slot]) slot += 1;
        if (slot >= MAX_PHOTOS) break;
        next[slot] = uri;
        slot += 1;
      }
      return next;
    });
  }, []);

  const pickPhotos = async (replaceSlot?: number) => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert("Permission needed", "Allow photo access to attach proof.");
      return;
    }

    const limit =
      replaceSlot != null ? 1 : Math.max(1, remainingPhotoSlots);

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.85,
      allowsEditing: false,
      allowsMultipleSelection: replaceSlot == null && limit > 1,
      selectionLimit: limit,
    });

    if (result.canceled || !result.assets?.length) return;

    const picked = result.assets
      .map((asset) => asset.uri)
      .filter((uri): uri is string => Boolean(uri))
      .slice(0, limit);

    if (replaceSlot != null && picked[0]) {
      setPhotos((prev) => {
        const next = [...prev];
        next[replaceSlot] = picked[0];
        return next;
      });
      return;
    }

    fillPhotoSlots(picked);
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
      void pickPhotos();
      return;
    }
    Alert.alert("Photo", undefined, [
      { text: "Cancel", style: "cancel" },
      { text: "Replace", onPress: () => void pickPhotos(slot) },
      { text: "Remove", style: "destructive", onPress: () => removePhoto(slot) },
    ]);
  };

  return (
    <>
      <View style={styles.wrap}>
        <View style={styles.topicChip}>
          <Ionicons name="checkmark-circle" size={16} color={GREEN} />
          <AppText style={styles.topicChipText} numberOfLines={2}>
            {issueTitle}
          </AppText>
        </View>

        <AppText style={styles.fieldLabel}>Tell us what happened</AppText>
        <TextInput
          value={description}
          onChangeText={(value) => setDescription(value.slice(0, MAX_CHARS))}
          style={styles.textArea}
          placeholder={description.length > 0 ? undefined : "Describe the issue in detail"}
          placeholderTextColor={MUTED}
          multiline
          textAlignVertical="top"
          underlineColorAndroid="transparent"
          {...(Platform.OS === "android" ? { includeFontPadding: false } : null)}
        />
        <AppText style={styles.counter}>
          {description.length}/{MAX_CHARS}
        </AppText>

        <AppText style={styles.photosLabel}>Add supporting photos (optional)</AppText>
        {remainingPhotoSlots > 0 ? (
          <TouchableOpacity
            style={styles.addPhotosBtn}
            activeOpacity={0.85}
            onPress={() => void pickPhotos()}
          >
            <Ionicons name="images-outline" size={18} color={GREEN} />
            <AppText style={styles.addPhotosBtnText}>
              Select up to {remainingPhotoSlots} photo{remainingPhotoSlots > 1 ? "s" : ""} at once
            </AppText>
          </TouchableOpacity>
        ) : null}
        <View style={styles.photoRow}>
          {Array.from({ length: MAX_PHOTOS }).map((_, index) => {
            const uri = photos[index];
            return (
              <Pressable
                key={index}
                onPress={() => onPhotoSlotPress(index)}
                style={styles.photoSlot}
                accessibilityLabel="Add photo"
              >
                {uri ? (
                  <View style={styles.photoFilled}>
                    <Image source={{ uri }} style={styles.photoImg} />
                    <View style={styles.photoBadge}>
                      <Ionicons name="checkmark-circle" size={18} color={GREEN} />
                    </View>
                  </View>
                ) : (
                  <View style={styles.photoPlaceholder}>
                    <Ionicons name="camera-outline" size={26} color={GREEN} />
                    <Ionicons name="add" size={12} color={GREEN} style={styles.photoAddIcon} />
                  </View>
                )}
              </Pressable>
            );
          })}
        </View>
        <AppText style={styles.photosCaption}>
          {photoUris.length > 0
            ? `${photoUris.length}/${MAX_PHOTOS} photos added · tap a photo to replace or remove`
            : "Up to 3 photos as proof for your claim"}
        </AppText>

        <TouchableOpacity
          disabled={!canSubmit}
          onPress={() =>
            onSubmit({
              description: description.trim(),
              photoUris,
            })
          }
          style={[styles.submitBtn, !canSubmit && styles.submitBtnDisabled]}
          activeOpacity={0.9}
        >
          {submitting ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Ionicons name="headset" size={18} color="#fff" />
              <AppText style={styles.submitText}>Submit ticket</AppText>
            </>
          )}
        </TouchableOpacity>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginTop: 8,
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#E8E8E8",
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 14,
  },
  topicChip: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    backgroundColor: GREEN_LIGHT,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginBottom: 12,
  },
  topicChipText: { flex: 1, fontSize: 13, fontWeight: "600", color: TEXT, lineHeight: 18 },
  fieldLabel: { fontSize: 13, fontWeight: "700", color: TEXT, marginBottom: 8 },
  textArea: {
    borderWidth: 1,
    borderColor: "#E8E8E8",
    borderRadius: 10,
    minHeight: 110,
    paddingHorizontal: 12,
    paddingTop: Platform.OS === "android" ? 14 : 12,
    paddingBottom: 12,
    fontSize: 15,
    lineHeight: 22,
    color: TEXT,
    backgroundColor: "#FAFAFA",
  },
  counter: { alignSelf: "flex-end", marginTop: 4, fontSize: 11, color: MUTED },
  photosLabel: { marginTop: 14, fontSize: 13, fontWeight: "700", color: TEXT },
  addPhotosBtn: {
    marginTop: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 11,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: GREEN_BORDER,
    backgroundColor: GREEN_LIGHT,
  },
  addPhotosBtnText: {
    fontSize: 13,
    fontWeight: "700",
    color: GREEN,
  },
  photoRow: { flexDirection: "row", gap: 10, marginTop: 10 },
  photoSlot: {
    flex: 1,
    aspectRatio: 1,
    maxWidth: 96,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: GREEN_BORDER,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    backgroundColor: GREEN_LIGHT,
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
    borderRadius: 10,
  },
  photosCaption: { marginTop: 8, fontSize: 11, color: MUTED, lineHeight: 16 },
  submitBtn: {
    marginTop: 14,
    backgroundColor: GREEN,
    borderRadius: 12,
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  submitBtnDisabled: { opacity: 0.55 },
  submitText: { color: "#FFFFFF", fontSize: 15, fontWeight: "700" },
});
