/**
 * Group Order start bottom sheet – same style as ItemCustomizationSheet.
 * Full width, 60% height, floating close, section/option styling, sticky CTA.
 */

import React, { useState } from "react";
import { AppText } from "@/components/AppText";

import { View, TouchableOpacity, StyleSheet, Modal, Pressable, TextInput, useWindowDimensions, ScrollView, Platform } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { BiPencilSquareIcon } from "@/components/icons/BiPencilSquareIcon";
import { GatiMitraColors } from "@/constants/gatimitra";
import { MerchantDarkPalette, useMerchantUiDark } from "@/features/merchant-detail/merchantUiTheme";
import { useLocationStore } from "@/store/locationStore";
import { useProfile } from "@/hooks/useProfile";

const MAX_GROUP_MEMBERS = 30;

const TIMER_OPTIONS = [
  { value: 15, label: "15 mins" },
  { value: 30, label: "30 mins" },
  { value: 45, label: "45 mins" },
  { value: 60, label: "60 mins" },
];

export type GroupOrderStartSheetProps = {
  visible: boolean;
  onClose: () => void;
  storeId: string;
  storeName: string;
  onStarted: (groupOrderId: string) => void;
};

/** Generate a short unique id for shareable link (e.g. go_abc12xyz) */
function generateGroupOrderId(): string {
  const chars = "abcdefghjkmnpqrstuvwxyz23456789";
  let id = "go_";
  for (let i = 0; i < 10; i++) id += chars[Math.floor(Math.random() * chars.length)];
  return id;
}

const SHEET_HEIGHT_PERCENT = 0.6;
const SHEET_TOP_RADIUS = 22;
const SECTION_SPACING = 12;

export function GroupOrderStartSheet({
  visible,
  onClose,
  storeId,
  storeName,
  onStarted,
}: GroupOrderStartSheetProps) {
  const insets = useSafeAreaInsets();
  const dark = useMerchantUiDark();
  const { height: screenHeight } = useWindowDimensions();
  const sheetMaxHeight = Math.round(screenHeight * SHEET_HEIGHT_PERCENT);
  const safeBottom = insets.bottom;
  const router = useRouter();
  const address = useLocationStore((s) => s.address);
  const profile = useProfile().data;
  const displayName = profile?.full_name?.trim() || profile?.mobile_number || "You";
  const defaultOrderTitle = displayName === "You" ? "Your group order" : `${displayName}'s group order`;

  const [orderTitle, setOrderTitle] = useState(defaultOrderTitle);
  const [timerMins, setTimerMins] = useState(30);
  const [starting, setStarting] = useState(false);

  const deliveryLine = address?.primary ?? address?.fullAddress ?? "Select delivery address";
  const secondaryLine = address?.secondary ?? "";

  const handleStart = async () => {
    setStarting(true);
    const groupOrderId = generateGroupOrderId();
    onClose();
    onStarted(groupOrderId);
    setStarting(false);
    router.push({ pathname: "/group/[groupOrderId]", params: { groupOrderId, storeId, storeName } });
  };

  if (!visible) return null;

  return (
    <Modal visible={visible} transparent animationType="slide" statusBarTranslucent={Platform.OS === "android"}>
      <View style={styles.overlayWrap}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <TouchableOpacity
          style={[styles.closeBtnFloating, { bottom: sheetMaxHeight + 10 }]}
          onPress={onClose}
          hitSlop={12}
          activeOpacity={0.8}
        >
          <Ionicons name="close" size={22} color="#fff" />
        </TouchableOpacity>
        <View style={[styles.sheetAnchor, { height: sheetMaxHeight }]}>
          <Pressable
            style={[
              styles.sheet,
              styles.sheetFlex,
              dark && styles.sheetDark,
              { borderTopLeftRadius: SHEET_TOP_RADIUS, borderTopRightRadius: SHEET_TOP_RADIUS },
            ]}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={styles.handleWrap}>
              <View style={styles.handle} />
            </View>

            <View style={styles.contentWrap}>
              <View style={styles.header}>
                <View style={styles.headerImageWrap}>
                  <View style={styles.headerImagePlaceholder}>
                    <Ionicons name="people" size={32} color={GatiMitraColors.emerald} />
                  </View>
                </View>
                <View style={styles.headerRight}>
                  <AppText style={[styles.headerName, dark && styles.headerNameDark]} numberOfLines={1}>Group Order</AppText>
                  <AppText style={[styles.headerSub, dark && styles.headerSubDark]}>Invite friends to add items</AppText>
                  <View style={styles.titleRow}>
                    <TextInput
                      style={styles.titleInput}
                      value={orderTitle}
                      onChangeText={setOrderTitle}
                      placeholder="Your group order"
                      placeholderTextColor="#9ca3af"
                      maxLength={40}
                    />
                    <BiPencilSquareIcon size={16} color={GatiMitraColors.textSecondary} />
                  </View>
                  <AppText style={styles.memberLimitSub}>Up to {MAX_GROUP_MEMBERS} members can join</AppText>
                </View>
              </View>

              <View style={styles.scrollArea}>
                <ScrollView
                  style={styles.scroll}
                  contentContainerStyle={styles.scrollContent}
                  showsVerticalScrollIndicator={true}
                  keyboardShouldPersistTaps="handled"
                  bounces={true}
                >
                  <View style={styles.section}>
                    <AppText style={[styles.sectionTitle, dark && styles.headerNameDark]}>Delivery Location</AppText>
                    <AppText style={styles.sectionSub}>Required • Tap to change</AppText>
                    <TouchableOpacity
                      style={styles.optionRow}
                      onPress={() => router.push("/profile/addresses")}
                      activeOpacity={0.7}
                    >
                      <Ionicons name="location" size={20} color={GatiMitraColors.emerald} style={styles.optionRowIcon} />
                      <View style={styles.optionRowTextWrap}>
                      <AppText style={[styles.optionRowPrimary, dark && styles.headerNameDark]} numberOfLines={1}>{deliveryLine}</AppText>
                        {secondaryLine ? <AppText style={styles.optionRowSecondary} numberOfLines={1}>{secondaryLine}</AppText> : null}
                      </View>
                      <Ionicons name="chevron-forward" size={20} color={GatiMitraColors.textSecondary} />
                    </TouchableOpacity>
                  </View>

                  <View style={styles.section}>
                    <AppText style={[styles.sectionTitle, dark && styles.headerNameDark]}>Add items by</AppText>
                    <AppText style={styles.sectionSub}>Required • Select 1 option</AppText>
                    <View style={styles.optionList}>
                      {TIMER_OPTIONS.map((opt) => (
                        <TouchableOpacity
                          key={opt.value}
                          style={styles.radioRow}
                          onPress={() => setTimerMins(opt.value)}
                          activeOpacity={0.7}
                        >
                          <View style={[styles.radioOuter, timerMins === opt.value && styles.radioOuterSelected]}>
                            {timerMins === opt.value && <View style={styles.radioInner} />}
                          </View>
                          <AppText style={styles.radioLabel}>{opt.label}</AppText>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>

                  <View style={styles.section}>
                    <AppText style={styles.sectionTitle}>Payment</AppText>
                    <AppText style={styles.sectionSub}>You are paying for this order</AppText>
                    <View style={styles.optionRow}>
                      <Ionicons name="card" size={20} color={GatiMitraColors.emerald} style={styles.optionRowIcon} />
                      <AppText style={styles.optionRowPrimary}>You are paying for this order</AppText>
                    </View>
                  </View>

                  <View style={styles.scrollBottomSpacer} />
                </ScrollView>
              </View>
            </View>

            <View style={[styles.stickyBottom, { paddingBottom: safeBottom + 12 }]}>
              <TouchableOpacity
                onPress={handleStart}
                disabled={starting}
                style={styles.addBtnWrap}
                activeOpacity={0.9}
              >
                <LinearGradient
                  colors={GatiMitraColors.mintGradient as unknown as [string, string]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.addBtn}
                >
                  <AppText style={styles.addBtnText}>Start Group Order</AppText>
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const CARD_RADIUS = 12;

const styles = StyleSheet.create({
  overlayWrap: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.88)",
    justifyContent: "flex-end",
  },
  closeBtnFloating: {
    position: "absolute",
    left: "50%",
    marginLeft: -22,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(0,0,0,0.78)",
    alignItems: "center",
    justifyContent: "center",
    ...(Platform.OS === "android" ? { elevation: 8 } : { shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.25, shadowRadius: 4 }),
  },
  sheetAnchor: {
    width: "100%",
    alignSelf: "flex-end",
  },
  sheet: {
    width: "100%",
    backgroundColor: "#fff",
    overflow: "hidden",
  },
  sheetDark: {
    backgroundColor: MerchantDarkPalette.surface,
  },
  sheetFlex: {
    flex: 1,
    flexDirection: "column",
    ...(Platform.OS === "android"
      ? { elevation: 24, shadowColor: "#000" }
      : {
          shadowColor: "#000",
          shadowOffset: { width: 0, height: -4 },
          shadowOpacity: 0.12,
          shadowRadius: 16,
        }),
  },
  handleWrap: { alignItems: "center", paddingTop: 10, paddingBottom: 6 },
  handle: {
    width: 40,
    height: 4,
    backgroundColor: "rgba(0,0,0,0.18)",
    borderRadius: 2,
  },
  contentWrap: {
    flex: 1,
    minHeight: 0,
    flexDirection: "column",
  },
  header: {
    flexDirection: "row",
    paddingHorizontal: 14,
    paddingBottom: SECTION_SPACING,
    gap: 12,
    alignItems: "center",
  },
  headerImageWrap: {
    width: 72,
    height: 72,
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: GatiMitraColors.mintSoft,
  },
  headerImagePlaceholder: {
    width: "100%",
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
  },
  headerRight: { flex: 1, minWidth: 0 },
  headerName: { fontSize: 16, fontWeight: "700", color: GatiMitraColors.textPrimary },
  headerNameDark: { color: MerchantDarkPalette.text },
  headerSub: { fontSize: 13, color: GatiMitraColors.textSecondary, marginTop: 2 },
  headerSubDark: { color: MerchantDarkPalette.textMuted },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 6,
  },
  titleInput: {
    flex: 1,
    fontSize: 15,
    fontWeight: "600",
    color: GatiMitraColors.textPrimary,
    paddingVertical: 4,
  },
  memberLimitSub: { fontSize: 11, color: GatiMitraColors.textSecondary, marginTop: 2 },
  scrollArea: {
    flex: 1,
    minHeight: 120,
  },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 14, paddingBottom: 12 },
  scrollBottomSpacer: { height: 80 },
  section: {
    marginBottom: SECTION_SPACING,
  },
  sectionTitle: { fontSize: 14, fontWeight: "600", color: GatiMitraColors.textPrimary, marginBottom: 1 },
  sectionSub: { fontSize: 11, color: GatiMitraColors.textSecondary, marginBottom: 6 },
  optionList: { gap: 0 },
  optionRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 10,
    backgroundColor: "#f9fafb",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.06)",
  },
  optionRowIcon: { marginRight: 10 },
  optionRowTextWrap: { flex: 1, minWidth: 0 },
  optionRowPrimary: { fontSize: 13, fontWeight: "600", color: GatiMitraColors.textPrimary, flex: 1 },
  optionRowSecondary: { fontSize: 12, color: GatiMitraColors.textSecondary, marginTop: 1 },
  radioRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    paddingHorizontal: 10,
    backgroundColor: "#f9fafb",
    borderRadius: 8,
    marginBottom: 4,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.06)",
  },
  radioOuter: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: "#d1d5db",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },
  radioOuterSelected: { borderColor: GatiMitraColors.emerald },
  radioInner: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: GatiMitraColors.emerald,
  },
  radioLabel: { flex: 1, fontSize: 13, color: GatiMitraColors.textPrimary },
  stickyBottom: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingTop: 14,
    backgroundColor: "#fff",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#e5e7eb",
    ...(Platform.OS === "android"
      ? { elevation: 8 }
      : { shadowColor: "#000", shadowOffset: { width: 0, height: -2 }, shadowOpacity: 0.08, shadowRadius: 8 }),
  },
  addBtnWrap: { flex: 1, borderRadius: CARD_RADIUS, overflow: "hidden" },
  addBtn: { paddingVertical: 16, alignItems: "center", justifyContent: "center" },
  addBtnText: { fontSize: 17, fontWeight: "700", color: "#fff" },
});
