import { Modal, Pressable, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { AppText as Text } from "@/components/AppText";
import { GatiMitraMerchant } from "@/constants/theme";

type Props = {
  visible: boolean;
  onClose: () => void;
  onViewDetails: () => void;
};

/** Light-theme overflow menu — View order details. */
export function ViewOrderDetailsMenu({ visible, onClose, onViewDetails }: Props) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable
          style={styles.card}
          onPress={(e) => e.stopPropagation()}
          accessibilityRole="menu"
        >
          <Pressable
            onPress={() => {
              onClose();
              onViewDetails();
            }}
            style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
            accessibilityRole="menuitem"
            accessibilityLabel="View order details"
          >
            <Ionicons name="restaurant-outline" size={20} color="#1F2937" />
            <Text style={styles.label}>View order details</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.28)",
    alignItems: "flex-end",
    paddingTop: 56,
    paddingRight: 16,
  },
  card: {
    minWidth: 220,
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: GatiMitraMerchant.border,
    overflow: "hidden",
    ...GatiMitraMerchant.shadow,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  rowPressed: { backgroundColor: "#F8FAFC" },
  label: {
    fontSize: 15,
    fontWeight: "600",
    color: "#111827",
  },
});
