import { useEffect } from "react";
import {
  Modal,
  View,
  Text,
  Pressable,
  StyleSheet,
  ScrollView,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { GatiMitraMerchant, H_PADDING } from "@/constants/theme";
import type { OrderRecord } from "@/hooks/useOrders";
import { formatOrderIdDisplay } from "@/components/order/orderFormatters";
import {
  callCustomer,
  printOrderBill,
  printOrderKot,
} from "@/lib/orderCardActions";

export type MerchantOrderMenuAction =
  | "support"
  | "timeline"
  | "call"
  | "customer"
  | "print_kot"
  | "print_order";

type Props = {
  visible: boolean;
  order: OrderRecord | null;
  storeName?: string | null;
  onClose: () => void;
  onOpenTimeline: () => void;
  onOpenCustomer: () => void;
};

const MENU: {
  id: MerchantOrderMenuAction;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
}[] = [
  { id: "support", label: "Live order support", icon: "chatbubble-ellipses-outline" },
  { id: "timeline", label: "Order timeline", icon: "time-outline" },
  { id: "call", label: "Call customer", icon: "call-outline" },
  { id: "customer", label: "Know your customer", icon: "person-outline" },
  { id: "print_kot", label: "Print KOT", icon: "print-outline" },
  { id: "print_order", label: "Print order", icon: "print-outline" },
];

export function MerchantOrderActionsSheet({
  visible,
  order,
  storeName,
  onClose,
  onOpenTimeline,
  onOpenCustomer,
}: Props) {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  useEffect(() => {
    if (!visible) return;
  }, [visible]);

  if (!order) return null;

  const orderLabel = formatOrderIdDisplay(order.formattedOrderId, order.ordersCoreId);

  const handleAction = async (id: MerchantOrderMenuAction) => {
    onClose();
    switch (id) {
      case "support":
        router.push("/(tabs)/profile/help" as any);
        break;
      case "timeline":
        onOpenTimeline();
        break;
      case "call":
        await callCustomer(order.customerPhone);
        break;
      case "customer":
        onOpenCustomer();
        break;
      case "print_kot":
        await printOrderKot(order, storeName);
        break;
      case "print_order":
        await printOrderBill(order, storeName);
        break;
      default:
        break;
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable
          style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) }]}
          onPress={(e) => e.stopPropagation()}
        >
          <Pressable onPress={onClose} style={styles.closeFloating} hitSlop={12}>
            <Ionicons name="close" size={22} color={GatiMitraMerchant.textPrimary} />
          </Pressable>

          <Text style={styles.title}>Order #{orderLabel.replace(/^#?/i, "")}</Text>

          <ScrollView style={styles.list} bounces={false}>
            {MENU.map((item) => (
              <Pressable
                key={item.id}
                onPress={() => void handleAction(item.id)}
                style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
              >
                <Ionicons name={item.icon} size={22} color="#444444" />
                <Text style={styles.rowLabel}>{item.label}</Text>
                <Ionicons name="chevron-forward" size={18} color="#9CA3AF" />
              </Pressable>
            ))}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 12,
    paddingHorizontal: H_PADDING,
    maxHeight: "78%",
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: -4 },
        shadowOpacity: 0.12,
        shadowRadius: 12,
      },
      android: { elevation: 16 },
      default: {},
    }),
  },
  closeFloating: {
    alignSelf: "center",
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
    marginTop: -36,
    borderWidth: 1,
    borderColor: GatiMitraMerchant.border,
  },
  title: {
    fontSize: 18,
    fontWeight: "800",
    color: GatiMitraMerchant.textPrimary,
    marginBottom: 8,
  },
  list: { flexGrow: 0 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#EEEEEE",
  },
  rowPressed: { backgroundColor: "#FAFAFA" },
  rowLabel: {
    flex: 1,
    fontSize: 16,
    fontWeight: "600",
    color: "#1A1A1A",
  },
});
