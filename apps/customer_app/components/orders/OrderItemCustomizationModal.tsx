/**
 * Bottom sheet: variant + add-ons for one order line item.
 */

import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  StyleSheet,
  Pressable,
  ScrollView,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { GatiMitraColors } from "@/constants/gatimitra";
import { orderItemCustomizationLines } from "@/lib/order-item-customization-display";
import type { OrderDetailLineItem } from "@/lib/order-item-customization-display";

const GREEN = GatiMitraColors.primaryMint;
const TEXT = "#1C1C1C";
const MUTED = "#828282";
const BORDER = "#EBEBEB";

type Props = {
  visible: boolean;
  item: OrderDetailLineItem | null;
  onClose: () => void;
};

export function OrderItemCustomizationModal({ visible, item, onClose }: Props) {
  const insets = useSafeAreaInsets();
  if (!item) return null;

  const lines = orderItemCustomizationLines(item);
  const title = `${item.quantity} × ${item.name}`;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable
          style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) }]}
          onPress={(e) => e.stopPropagation()}
        >
          <View style={styles.handle} />
          <View style={styles.header}>
            <Text style={styles.title} numberOfLines={2}>
              Customizations
            </Text>
            <TouchableOpacity onPress={onClose} hitSlop={12} accessibilityLabel="Close">
              <Ionicons name="close" size={24} color={MUTED} />
            </TouchableOpacity>
          </View>
          <Text style={styles.itemTitle} numberOfLines={2}>
            {title}
          </Text>
          <ScrollView style={styles.list} showsVerticalScrollIndicator={false}>
            {lines.map((line, i) => (
              <View key={`${i}-${line}`} style={styles.lineRow}>
                <View style={styles.bullet} />
                <Text style={styles.lineText}>{line}</Text>
              </View>
            ))}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingTop: 8,
    maxHeight: "70%",
  },
  handle: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#D1D5DB",
    marginBottom: 12,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 6,
  },
  title: {
    flex: 1,
    fontSize: 18,
    fontWeight: "700",
    color: TEXT,
  },
  itemTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: MUTED,
    marginBottom: 14,
  },
  list: {
    maxHeight: 320,
  },
  lineRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: BORDER,
  },
  bullet: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: GREEN,
    marginTop: 6,
  },
  lineText: {
    flex: 1,
    fontSize: 15,
    fontWeight: "500",
    color: TEXT,
    lineHeight: 20,
  },
});
