/**
 * Bottom sheet: "Booking ride for" – Myself, Add a guest (no Kallua).
 * Add a guest opens contact list when permission granted; else parent shows permission modal.
 */

import { View, TouchableOpacity, Modal, StyleSheet, Pressable, useWindowDimensions, Platform } from "react-native";
import { AppText } from "@/components/AppText";

import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { GatiMitraColors } from "@/constants/gatimitra";

export type RiderOption = { id: string; label: string };

type BookingRiderSheetProps = {
  visible: boolean;
  onClose: () => void;
  selectedId?: string;
  onSelect?: (id: string) => void;
  /** Called when user taps "Add a guest" – parent should request contacts permission and open contact list or show permission modal */
  onAddGuest?: () => void;
};

export function BookingRiderSheet({
  visible,
  onClose,
  selectedId = "myself",
  onSelect,
  onAddGuest,
}: BookingRiderSheetProps) {
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const sheetHeight = Math.min(340, windowHeight * 0.45);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent={Platform.OS === "android"}
    >
      <View style={styles.modalWrap}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View
          style={[
            styles.sheet,
            {
              height: sheetHeight,
              paddingBottom: insets.bottom + 16,
            },
          ]}
          onStartShouldSetResponder={() => true}
        >
          <View style={styles.handle} />
          <AppText style={styles.title}>Booking ride for</AppText>

          <TouchableOpacity
            style={styles.optionRow}
            onPress={() => onSelect?.("myself")}
            activeOpacity={0.7}
          >
            <Ionicons
              name="person-outline"
              size={22}
              color={GatiMitraColors.textPrimary}
            />
            <AppText style={styles.optionLabel}>Myself</AppText>
            <View
              style={[
                styles.radio,
                selectedId === "myself" && styles.radioSelected,
              ]}
            >
              {selectedId === "myself" && (
                <Ionicons name="checkmark" size={14} color="#fff" />
              )}
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.addRow}
            onPress={onAddGuest}
            activeOpacity={0.7}
          >
            <Ionicons
              name="person-add-outline"
              size={22}
              color={GatiMitraColors.emerald}
            />
            <AppText style={styles.addLabel}>Add a guest</AppText>
          </TouchableOpacity>

          <View style={styles.privacyNote}>
            <Ionicons name="information-circle-outline" size={18} color={GatiMitraColors.textSecondary} />
            <AppText style={styles.privacyText}>
              Contact name won't be shared with captain.
            </AppText>
          </View>

          <TouchableOpacity
            style={styles.doneBtn}
            onPress={onClose}
            activeOpacity={0.9}
          >
            <AppText style={styles.doneBtnText}>Done</AppText>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalWrap: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "flex-end",
  },
  sheet: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: GatiMitraColors.background,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 24,
    paddingTop: 12,
    ...GatiMitraColors.elevationShadow,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: GatiMitraColors.border,
    alignSelf: "center",
    marginBottom: 20,
  },
  title: {
    fontSize: 18,
    fontWeight: "700",
    color: GatiMitraColors.textPrimary,
    marginBottom: 16,
  },
  optionRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: GatiMitraColors.border,
    gap: 12,
  },
  optionLabel: {
    flex: 1,
    fontSize: 16,
    fontWeight: "600",
    color: GatiMitraColors.textPrimary,
  },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: GatiMitraColors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  radioSelected: {
    backgroundColor: GatiMitraColors.emerald,
    borderColor: GatiMitraColors.emerald,
  },
  addRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    gap: 12,
  },
  addLabel: {
    fontSize: 16,
    fontWeight: "600",
    color: GatiMitraColors.emerald,
  },
  privacyNote: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 8,
    marginBottom: 16,
  },
  privacyText: {
    fontSize: 13,
    color: GatiMitraColors.textSecondary,
    flex: 1,
  },
  doneBtn: {
    backgroundColor: GatiMitraColors.warmOrange,
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  doneBtnText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#fff",
  },
});
