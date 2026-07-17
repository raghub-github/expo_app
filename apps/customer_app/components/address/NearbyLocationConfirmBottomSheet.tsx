import { Modal, View, TouchableOpacity, Pressable, StyleSheet, Platform, ActivityIndicator } from "react-native";
import { AppText } from "@/components/AppText";

import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { GatiMitraColors } from "@/constants/gatimitra";
import type { EnrichedPlaceResult } from "@/services/location.service";

const BRAND = GatiMitraColors.splashMint;
const TITLE_DARK = "#111827";
const TEXT_GRAY = "#6B7280";
const BORDER = "rgba(0, 0, 0, 0.08)";

type Props = {
  visible: boolean;
  place: EnrichedPlaceResult | null;
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

export function NearbyLocationConfirmBottomSheet({
  visible,
  place,
  loading = false,
  onConfirm,
  onCancel,
}: Props) {
  const insets = useSafeAreaInsets();
  if (!place) return null;

  const displayAddress = place.fullAddress || place.primary;

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={onCancel}>
      <View style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={loading ? undefined : onCancel} />
        <View style={styles.sheetWrap}>
          <TouchableOpacity
            style={styles.floatingClose}
            onPress={onCancel}
            hitSlop={10}
            activeOpacity={0.9}
            disabled={loading}
          >
            <Ionicons name="close" size={20} color="#FFFFFF" />
          </TouchableOpacity>

          <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 14) + 10 }]}>
            <View style={styles.handle} />

            <View style={styles.iconRow}>
              <View style={styles.iconWrap}>
                <Ionicons name="location" size={22} color={BRAND} />
              </View>
            </View>

            <AppText style={styles.title}>Confirm only if you are familiar with this location.</AppText>

            <View style={styles.placeCard}>
              <AppText style={styles.placeText} numberOfLines={3}>
                {displayAddress}
              </AppText>
            </View>

            <TouchableOpacity
              style={[styles.primaryBtn, loading && styles.primaryBtnDisabled]}
              onPress={onConfirm}
              activeOpacity={0.88}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <AppText style={styles.primaryBtnText}>Yes, Confirm</AppText>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.secondaryBtn}
              onPress={onCancel}
              activeOpacity={0.75}
              disabled={loading}
            >
              <AppText style={styles.secondaryBtnText}>Cancel</AppText>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(15, 23, 42, 0.48)",
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  sheetWrap: {
    width: "100%",
    alignItems: "center",
  },
  floatingClose: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#111827",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.22,
        shadowRadius: 6,
      },
      android: { elevation: 6 },
    }),
  },
  sheet: {
    width: "100%",
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingHorizontal: 20,
    paddingTop: 10,
  },
  handle: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#E5E7EB",
    marginBottom: 16,
  },
  iconRow: {
    alignItems: "center",
    marginBottom: 14,
  },
  iconWrap: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#ECFDF5",
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontSize: 18,
    fontWeight: "700",
    color: TITLE_DARK,
    textAlign: "center",
    lineHeight: 26,
    marginBottom: 16,
    paddingHorizontal: 8,
  },
  placeCard: {
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 14,
    backgroundColor: "#FAFAFA",
    padding: 14,
    marginBottom: 20,
  },
  placeText: {
    fontSize: 14,
    fontWeight: "600",
    color: TITLE_DARK,
    lineHeight: 20,
    textAlign: "center",
  },
  primaryBtn: {
    backgroundColor: BRAND,
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: "center",
    marginBottom: 10,
    minHeight: 50,
    justifyContent: "center",
    ...Platform.select({
      ios: {
        shadowColor: BRAND,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.22,
        shadowRadius: 8,
      },
      android: { elevation: 3 },
    }),
  },
  primaryBtnDisabled: {
    opacity: 0.85,
  },
  primaryBtnText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "700",
  },
  secondaryBtn: {
    alignItems: "center",
    paddingVertical: 10,
  },
  secondaryBtnText: {
    color: TEXT_GRAY,
    fontSize: 15,
    fontWeight: "600",
  },
});
