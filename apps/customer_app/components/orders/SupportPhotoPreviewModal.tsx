import React, { useMemo, useState } from "react";
import { AppText } from "@/components/AppText";

import { View, Modal, Image, Pressable, StyleSheet, Platform, SafeAreaView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";

const BRAND = "#22C55E";

type Props = {
  visible: boolean;
  uri: string | null;
  onCancel: () => void;
  onConfirm: () => void;
  onPickAnother: () => void;
};

export function SupportPhotoPreviewModal({
  visible,
  uri,
  onCancel,
  onConfirm,
  onPickAnother,
}: Props) {
  const insets = useSafeAreaInsets();
  if (!visible || !uri) return null;

  return (
    <Modal visible animationType="slide" presentationStyle="fullScreen" onRequestClose={onCancel}>
      <View style={styles.root}>
        <SafeAreaView style={styles.main}>
          <View style={styles.header}>
            <Pressable onPress={onCancel} style={styles.headerBtn} hitSlop={8}>
              <Ionicons name="close" size={24} color="#0F172A" />
            </Pressable>
            <AppText style={styles.headerTitle}>Preview photo</AppText>
            <Pressable onPress={onConfirm} style={styles.headerBtn} hitSlop={8}>
              <AppText style={styles.doneText}>Done</AppText>
            </Pressable>
          </View>
          <View style={styles.previewWrap}>
            <Image source={{ uri }} style={styles.previewImage} resizeMode="contain" />
          </View>
          <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 12) }]}>
            <Pressable onPress={onPickAnother} style={styles.secondaryBtn}>
              <AppText style={styles.secondaryBtnText}>Choose another</AppText>
            </Pressable>
          </View>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#0F172A" },
  main: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: "#FFFFFF",
  },
  headerBtn: { minWidth: 72 },
  headerTitle: {
    flex: 1,
    textAlign: "center",
    fontSize: 16,
    fontWeight: "700",
    color: "#0F172A",
  },
  doneText: { color: BRAND, fontWeight: "700", fontSize: 15, textAlign: "right" },
  previewWrap: { flex: 1, justifyContent: "center", backgroundColor: "#111827" },
  previewImage: { width: "100%", height: "100%" },
  footer: {
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 16,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#E2E8F0",
  },
  secondaryBtn: {
    borderWidth: 1,
    borderColor: BRAND,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
  },
  secondaryBtnText: { color: BRAND, fontWeight: "700", fontSize: 15 },
});
