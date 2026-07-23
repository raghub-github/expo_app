import { Modal, View, TouchableOpacity, Pressable, StyleSheet, Platform } from "react-native";
import { AppText } from "@/components/AppText";

import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { GatiMitraColors } from "@/constants/gatimitra";
import { DeliveryAddressText } from "@/components/address/DeliveryAddressText";
import type { Address } from "@/services/address.service";

const BRAND = GatiMitraColors.splashMint;
const BRAND_LIGHT = "#ECFDF5";
const TITLE_DARK = "#111827";
const TEXT_GRAY = "#6B7280";
const TEXT_MUTED = "#9CA3AF";
const BORDER = "rgba(0, 0, 0, 0.08)";

function addressIcon(saved: Address): { name: keyof typeof Ionicons.glyphMap; color: string } {
  const label = (saved.label ?? "").trim().toLowerCase();
  if (label === "current location") return { name: "locate", color: BRAND };
  if (label === "home") return { name: "home-outline", color: "#374151" };
  if (label === "work" || label === "office") return { name: "briefcase-outline", color: "#374151" };
  return { name: "location-outline", color: "#374151" };
}

type Props = {
  visible: boolean;
  address: Address | null;
  onConfirm: () => void;
  onCancel: () => void;
};

export function AddressConfirmBottomSheet({ visible, address, onConfirm, onCancel }: Props) {
  const insets = useSafeAreaInsets();
  if (!address) return null;

  const label = address.label?.trim() || "Address";
  const icon = addressIcon(address);

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={onCancel}>
      <View style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={onCancel} />
        <View style={styles.sheetWrap}>
          <TouchableOpacity style={styles.floatingClose} onPress={onCancel} hitSlop={10} activeOpacity={0.9}>
            <Ionicons name="close" size={20} color="#FFFFFF" />
          </TouchableOpacity>

          <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 14) + 10 }]}>
            <View style={styles.handle} />

            <AppText style={styles.title}>Switch delivery location?</AppText>
            <AppText style={styles.subtitle}>
              Your orders and delivery ETA will update for this address.
            </AppText>

            <View style={styles.addressCard}>
              <View style={styles.addressCardTop}>
                <View style={styles.iconWrap}>
                  <Ionicons name={icon.name} size={22} color={icon.color} />
                </View>
                <View style={styles.addressMeta}>
                  <View style={styles.labelPill}>
                    <AppText style={styles.labelPillText}>{label.toUpperCase()}</AppText>
                  </View>
                  <DeliveryAddressText address={address.fullAddress} style={styles.addressLine} />
                </View>
              </View>
              {address.contactMobile ? (
                <View style={styles.phoneRow}>
                  <Ionicons name="call-outline" size={14} color={TEXT_MUTED} />
                  <AppText style={styles.phoneText}>{address.contactMobile}</AppText>
                </View>
              ) : null}
            </View>

            <TouchableOpacity style={styles.primaryBtn} onPress={onConfirm} activeOpacity={0.88}>
              <AppText style={styles.primaryBtnText}>Confirm & use this address</AppText>
            </TouchableOpacity>

            <TouchableOpacity style={styles.secondaryBtn} onPress={onCancel} activeOpacity={0.75}>
              <AppText style={styles.secondaryBtnText}>Choose a different address</AppText>
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
    marginBottom: 18,
  },
  title: {
    fontSize: 20,
    fontWeight: "800",
    color: TITLE_DARK,
    letterSpacing: -0.3,
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 14,
    fontWeight: "500",
    color: TEXT_GRAY,
    lineHeight: 20,
    marginBottom: 18,
  },
  addressCard: {
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 14,
    backgroundColor: "#FAFAFA",
    padding: 14,
    marginBottom: 20,
  },
  addressCardTop: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  iconWrap: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: BRAND_LIGHT,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  addressMeta: {
    flex: 1,
    minWidth: 0,
  },
  labelPill: {
    alignSelf: "flex-start",
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginBottom: 8,
  },
  labelPillText: {
    fontSize: 10,
    fontWeight: "800",
    color: TITLE_DARK,
    letterSpacing: 0.6,
  },
  addressLine: {
    fontSize: 14,
    fontWeight: "600",
    color: TITLE_DARK,
    lineHeight: 20,
  },
  phoneRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: BORDER,
  },
  phoneText: {
    fontSize: 13,
    fontWeight: "500",
    color: TEXT_GRAY,
  },
  primaryBtn: {
    backgroundColor: BRAND,
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: "center",
    marginBottom: 10,
    ...Platform.select({
      ios: {
        shadowColor: BRAND,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.25,
        shadowRadius: 8,
      },
      android: { elevation: 3 },
    }),
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
