/**
 * Bottom sheet when opening a shared address deep link.
 * Shows preview + Save, or "Already saved in your address book".
 */

import { View, StyleSheet, ActivityIndicator, TouchableOpacity } from "react-native";
import { AppText } from "@/components/AppText";
import { Ionicons } from "@expo/vector-icons";
import { StoreBottomSheetShell } from "@/components/store/StoreBottomSheetShell";
import type { AddressSharePreview } from "@/services/addressShare.service";

const BRAND = "#14b8a6";
const TITLE_DARK = "#0f172a";
const TEXT_GRAY = "#64748b";

type Props = {
  visible: boolean;
  loading?: boolean;
  saving?: boolean;
  preview: AddressSharePreview | null;
  alreadySaved: boolean;
  errorText?: string | null;
  onClose: () => void;
  onSave: () => void;
};

export function SharedAddressSaveSheet({
  visible,
  loading = false,
  saving = false,
  preview,
  alreadySaved,
  errorText,
  onClose,
  onSave,
}: Props) {
  const title = preview?.label?.trim() || "Shared Address";

  return (
    <StoreBottomSheetShell visible={visible} onClose={onClose} maxHeightRatio={0.72}>
      <View style={styles.content}>
        <View style={styles.headerRow}>
          <View style={styles.iconWrap}>
            <Ionicons name="location-outline" size={22} color={BRAND} />
          </View>
          <View style={styles.headerText}>
          <AppText style={styles.heading}>Shared Address</AppText>
          <AppText style={styles.subheading}>
            {alreadySaved
              ? "Already saved in your address book"
              : "Save this address to your GatiMitra account?"}
          </AppText>
          </View>
        </View>

        {loading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator size="small" color={BRAND} />
            <AppText style={styles.loadingText}>Loading address…</AppText>
          </View>
        ) : errorText ? (
          <AppText style={styles.errorText}>{errorText}</AppText>
        ) : preview ? (
          <View style={styles.previewCard}>
            <AppText style={styles.previewTitle}>{title}</AppText>
            <AppText style={styles.previewAddress} numberOfLines={4}>
              {preview.fullAddress}
            </AppText>
            {preview.contactName ? (
              <AppText style={styles.previewMeta} numberOfLines={1}>
                {preview.contactName}
              </AppText>
            ) : null}
          </View>
        ) : null}

        {!loading && !errorText && preview ? (
          alreadySaved ? (
            <View style={styles.savedBanner}>
              <Ionicons name="checkmark-circle" size={20} color="#15803D" />
              <AppText style={styles.savedBannerText}>Already saved in your address book</AppText>
            </View>
          ) : (
            <TouchableOpacity
              style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
              onPress={onSave}
              disabled={saving}
              activeOpacity={0.88}
            >
              {saving ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <AppText style={styles.saveBtnText}>Save Address</AppText>
              )}
            </TouchableOpacity>
          )
        ) : null}

        <TouchableOpacity style={styles.dismissBtn} onPress={onClose} activeOpacity={0.85}>
          <AppText style={styles.dismissBtnText}>
            {alreadySaved || errorText ? "Done" : "Cancel"}
          </AppText>
        </TouchableOpacity>
      </View>
    </StoreBottomSheetShell>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 24,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    marginBottom: 16,
  },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: "#E0F2F1",
    alignItems: "center",
    justifyContent: "center",
  },
  headerText: { flex: 1 },
  heading: {
    fontSize: 18,
    fontWeight: "700",
    color: TITLE_DARK,
    marginBottom: 4,
  },
  subheading: {
    fontSize: 14,
    color: TEXT_GRAY,
    lineHeight: 20,
  },
  loadingWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 24,
    justifyContent: "center",
  },
  loadingText: { fontSize: 14, color: TEXT_GRAY },
  errorText: {
    fontSize: 15,
    color: TITLE_DARK,
    textAlign: "center",
    paddingVertical: 16,
    lineHeight: 22,
  },
  previewCard: {
    backgroundColor: "#f8fafc",
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: "#f1f5f9",
    marginBottom: 16,
  },
  previewTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: TITLE_DARK,
    marginBottom: 6,
  },
  previewAddress: {
    fontSize: 14,
    color: TEXT_GRAY,
    lineHeight: 20,
  },
  previewMeta: {
    fontSize: 13,
    color: TEXT_GRAY,
    marginTop: 8,
  },
  savedBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#DCFCE7",
    borderRadius: 10,
    padding: 14,
    marginBottom: 12,
  },
  savedBannerText: {
    flex: 1,
    fontSize: 14,
    fontWeight: "600",
    color: "#15803D",
  },
  saveBtn: {
    backgroundColor: BRAND,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    marginBottom: 10,
  },
  saveBtnDisabled: { opacity: 0.7 },
  saveBtnText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
  },
  dismissBtn: {
    paddingVertical: 12,
    alignItems: "center",
  },
  dismissBtnText: {
    fontSize: 15,
    fontWeight: "600",
    color: TEXT_GRAY,
  },
});
