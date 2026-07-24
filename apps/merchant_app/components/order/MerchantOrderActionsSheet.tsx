import { useEffect, useState } from "react";
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
import { GatiMitraMerchant, H_PADDING } from "@/constants/theme";
import type { OrderRecord } from "@/hooks/useOrders";
import { MerchantOrderIdRow } from "@/components/order/MerchantOrderCardToolbar";
import {
  callCustomer,
  printOrderBill,
  printOrderKot,
} from "@/lib/orderCardActions";
import { LiveOrderSupportSheet } from "@/components/order/LiveOrderSupportSheet";
import { useMerchantPrintContext } from "@/hooks/useMerchantPrintContext";
import type { MerchantPrintStoreContext } from "@/lib/printContext";

export type MerchantOrderMenuAction =
  | "support"
  | "timeline"
  | "call"
  | "customer"
  | "print_kot"
  | "print_order"
  | "view_details";

type Props = {
  visible: boolean;
  order: OrderRecord | null;
  printContext?: MerchantPrintStoreContext | null;
  /** @deprecated use printContext */
  storeName?: string | null;
  /**
   * `compact` — Order timeline / Print KOT / Print order (completed 24h reference).
   * `full` — live-order menu with support, call, etc.
   */
  variant?: "full" | "compact";
  onClose: () => void;
  onOpenTimeline: () => void;
  onOpenCustomer: () => void;
  onViewDetails?: () => void;
};

const FULL_MENU: {
  id: MerchantOrderMenuAction;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
}[] = [
  { id: "view_details", label: "View order details", icon: "document-text-outline" },
  { id: "support", label: "Live order support", icon: "chatbubble-ellipses-outline" },
  { id: "timeline", label: "Order timeline", icon: "time-outline" },
  { id: "call", label: "Call customer", icon: "call-outline" },
  { id: "customer", label: "Know your customer", icon: "person-outline" },
  { id: "print_kot", label: "Print KOT", icon: "print-outline" },
  { id: "print_order", label: "Print order", icon: "print-outline" },
];

const COMPACT_MENU: {
  id: MerchantOrderMenuAction;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
}[] = [
  { id: "timeline", label: "Order timeline", icon: "time-outline" },
  { id: "print_kot", label: "Print KOT", icon: "print-outline" },
  { id: "print_order", label: "Print order", icon: "print-outline" },
];

export function MerchantOrderActionsSheet({
  visible,
  order,
  printContext,
  storeName,
  variant = "full",
  onClose,
  onOpenTimeline,
  onOpenCustomer,
  onViewDetails,
}: Props) {
  const insets = useSafeAreaInsets();
  const [liveSupportOpen, setLiveSupportOpen] = useState(false);
  const defaultPrintContext = useMerchantPrintContext();
  const ctx =
    printContext ??
    (storeName?.trim()
      ? { ...defaultPrintContext, storeName: storeName.trim() }
      : defaultPrintContext);

  const menu = variant === "compact" ? COMPACT_MENU : FULL_MENU;

  useEffect(() => {
    if (!visible) setLiveSupportOpen(false);
  }, [visible]);

  if (!order) return null;

  const handleAction = async (id: MerchantOrderMenuAction) => {
    switch (id) {
      case "view_details":
        onClose();
        onViewDetails?.();
        break;
      case "support":
        setLiveSupportOpen(true);
        return;
      case "timeline":
        onClose();
        onOpenTimeline();
        break;
      case "call":
        onClose();
        await callCustomer(order.customerPhone);
        break;
      case "customer":
        onClose();
        onOpenCustomer();
        break;
      case "print_kot":
        onClose();
        await printOrderKot(order, ctx);
        break;
      case "print_order":
        onClose();
        await printOrderBill(order, ctx);
        break;
      default:
        onClose();
        break;
    }
  };

  return (
    <>
      <Modal
        visible={visible && !liveSupportOpen}
        transparent
        animationType="slide"
        onRequestClose={onClose}
      >
        <Pressable style={styles.backdrop} onPress={onClose}>
          <Pressable
            style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) }]}
            onPress={(e) => e.stopPropagation()}
          >
            <Pressable onPress={onClose} style={styles.closeFloating} hitSlop={12}>
              <Ionicons name="close" size={22} color={GatiMitraMerchant.textPrimary} />
            </Pressable>

            <View style={styles.orderIdWrap}>
              <Text style={styles.orderPrefix}>Order </Text>
              <MerchantOrderIdRow
                formattedOrderId={order.formattedOrderId}
                fallbackOrderId={order.ordersCoreId}
              />
            </View>

            <ScrollView style={styles.list} bounces={false}>
              {menu.map((item) => (
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

      {order ? (
        <LiveOrderSupportSheet
          visible={liveSupportOpen}
          order={order}
          onClose={() => setLiveSupportOpen(false)}
          onFinished={() => {
            setLiveSupportOpen(false);
            onClose();
          }}
        />
      ) : null}
    </>
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
  orderIdWrap: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  orderPrefix: {
    fontSize: 17,
    fontWeight: "700",
    color: GatiMitraMerchant.textPrimary,
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
