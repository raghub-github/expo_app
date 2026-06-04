/**
 * Final cancellation confirmation while searching for a rider.
 */

import {
  View,
  Text,
  Modal,
  Pressable,
  TouchableOpacity,
  StyleSheet,
  Image,
  ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { GatiMitraColors } from "@/constants/gatimitra";
import { MAPBIKE_IMAGE } from "@/lib/customer-map-assets";

export type RideCancelConfirmSheetProps = {
  visible: boolean;
  loading?: boolean;
  onConfirm: () => void;
  onKeepSearching: () => void;
  onClose: () => void;
};

function DashedDivider() {
  return <View style={styles.dashedDivider} />;
}

export function RideCancelConfirmSheet({
  visible,
  loading = false,
  onConfirm,
  onKeepSearching,
  onClose,
}: RideCancelConfirmSheetProps) {
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.root}>
        <Pressable style={styles.backdrop} onPress={onClose} accessibilityRole="button" />

        <TouchableOpacity
          style={[styles.closeBtn, { top: insets.top + 8 }]}
          onPress={onClose}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel="Close"
        >
          <Ionicons name="close" size={22} color="#111827" />
        </TouchableOpacity>

        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) }]}>
          <View style={styles.handle} />

          <View style={styles.heroWrap}>
            <Image source={MAPBIKE_IMAGE} style={styles.heroImage} resizeMode="contain" />
          </View>

          <Text style={styles.title}>Are you sure you want to cancel this ride?</Text>

          <DashedDivider />

          <Text style={styles.message}>
            By cancelling this ride, you&apos;ll have to restart the search that may lead to
            delay in finding a rider.
          </Text>

          <TouchableOpacity
            style={[styles.confirmBtn, loading && styles.confirmBtnDisabled]}
            onPress={onConfirm}
            activeOpacity={0.9}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.confirmBtnText}>Cancel my ride</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.keepBtn}
            onPress={onKeepSearching}
            activeOpacity={0.9}
            disabled={loading}
          >
            <Text style={styles.keepBtnText}>Keep searching</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: "flex-end",
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(15, 23, 42, 0.45)",
  },
  closeBtn: {
    position: "absolute",
    right: 12,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.14,
    shadowRadius: 8,
    elevation: 6,
    zIndex: 2,
  },
  sheet: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 10,
  },
  handle: {
    alignSelf: "center",
    width: 44,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#D1D5DB",
    marginBottom: 14,
  },
  heroWrap: {
    borderRadius: 16,
    overflow: "hidden",
    backgroundColor: "#E0F2FE",
    marginBottom: 16,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    paddingHorizontal: 16,
    minHeight: 120,
  },
  heroImage: {
    width: "100%",
    height: 110,
    maxWidth: 220,
  },
  title: {
    fontSize: 18,
    fontWeight: "700",
    color: "#111827",
    textAlign: "center",
    lineHeight: 26,
    marginBottom: 14,
  },
  dashedDivider: {
    borderBottomWidth: 1,
    borderStyle: "dashed",
    borderColor: "#D1D5DB",
    marginBottom: 14,
  },
  message: {
    fontSize: 14,
    lineHeight: 21,
    color: "#4B5563",
    textAlign: "center",
    marginBottom: 20,
    paddingHorizontal: 8,
  },
  confirmBtn: {
    backgroundColor: GatiMitraColors.primaryMint,
    borderRadius: 28,
    paddingVertical: 16,
    alignItems: "center",
  },
  confirmBtnDisabled: {
    opacity: 0.7,
  },
  confirmBtnText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  keepBtn: {
    marginTop: 10,
    borderRadius: 28,
    paddingVertical: 16,
    alignItems: "center",
    borderWidth: 1.5,
    borderColor: "#D1D5DB",
    backgroundColor: "#FFFFFF",
  },
  keepBtnText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#111827",
  },
});
