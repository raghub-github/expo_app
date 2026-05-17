/**
 * Orders filter bottom sheet — Zomato-style two-pane layout (light mode).
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Pressable,
  ScrollView,
  TextInput,
  Platform,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { GatiMitraMerchant } from "@/constants/theme";
import type { OrderStage } from "@/hooks/useOrders";
import {
  type OrdersFilters,
  type OrdersSheetCategory,
  EMPTY_ORDERS_FILTERS,
} from "@/components/order/ordersFilterTypes";

const CATEGORIES: { id: OrdersSheetCategory; label: string }[] = [
  { id: "status", label: "Order status" },
  { id: "ratings", label: "Ratings" },
  { id: "kpt", label: "KPT delay" },
  { id: "complaints", label: "Complaints" },
  { id: "order_type", label: "Order type" },
];

const STATUS_OPTIONS: { id: OrderStage; label: string }[] = [
  { id: "preparing", label: "Preparing" },
  { id: "ready", label: "Ready" },
  { id: "picked_up", label: "Out for delivery" },
  { id: "delivered", label: "Delivered" },
  { id: "rejected", label: "Rejected" },
  { id: "rto", label: "Cancelled" },
];

const ORDER_TYPE_OPTIONS = [
  { id: "self_delivery" as const, label: "Self Delivery" },
  { id: "bulk" as const, label: "Bulk order" },
  { id: "veg_only" as const, label: "Veg only" },
  { id: "gatimitra" as const, label: "GatiMitra Delivery" },
];

const RATING_OPTIONS = ["5★ or less", "4★ or less", "3★ or less", "2★ or less", "1★"];
const KPT_OPTIONS = ["0-10 mins", "10-20 mins", "20-30 mins", "30+ mins"];
const COMPLAINT_OPTIONS = [
  "Order delayed",
  "Wrong item(s) delivered",
  "Item(s) missing or not delivered",
  "Poor taste or quality",
  "Poor packaging or spillage",
  "Item(s) out of stock",
  "Order not delivered",
];

const SIDEBAR_WIDTH_RATIO = 0.35;
const PANE_HEIGHT = 400;

function countForCategory(cat: OrdersSheetCategory, draft: OrdersFilters): number {
  switch (cat) {
    case "status":
      return draft.statuses.length;
    case "order_type":
      return draft.orderTypes.length;
    case "ratings":
      return draft.ratings.length;
    case "kpt":
      return draft.kptDelays.length;
    case "complaints":
      return draft.complaints.length;
    default:
      return 0;
  }
}

type Props = {
  visible: boolean;
  value: OrdersFilters;
  onClose: () => void;
  onApply: (next: OrdersFilters) => void;
};

function optionsForCategory(cat: OrdersSheetCategory): string[] {
  switch (cat) {
    case "status":
      return STATUS_OPTIONS.map((o) => o.label);
    case "order_type":
      return ORDER_TYPE_OPTIONS.map((o) => o.label);
    case "ratings":
      return RATING_OPTIONS;
    case "kpt":
      return KPT_OPTIONS;
    case "complaints":
      return COMPLAINT_OPTIONS;
    default:
      return [];
  }
}

function CheckboxRow({
  label,
  checked,
  onToggle,
}: {
  label: string;
  checked: boolean;
  onToggle: () => void;
}) {
  return (
    <Pressable
      onPress={onToggle}
      style={({ pressed }) => [styles.optionRow, pressed && styles.optionRowPressed]}
    >
      <View style={[styles.checkbox, checked && styles.checkboxOn]}>
        {checked ? <Ionicons name="checkmark" size={14} color="#FFFFFF" /> : null}
      </View>
      <Text style={styles.optionLabel}>{label}</Text>
    </Pressable>
  );
}

export function OrdersFilterSheet({ visible, value, onClose, onApply }: Props) {
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const sidebarWidth = Math.max(120, Math.round(windowWidth * SIDEBAR_WIDTH_RATIO));
  const [category, setCategory] = useState<OrdersSheetCategory>("order_type");
  const [draft, setDraft] = useState<OrdersFilters>(value);
  const [optionSearch, setOptionSearch] = useState("");

  const activeCategoryLabel =
    CATEGORIES.find((c) => c.id === category)?.label ?? "Filters";

  const syncFromValue = useCallback(() => {
    setDraft(value);
    setOptionSearch("");
  }, [value]);

  useEffect(() => {
    if (visible) syncFromValue();
  }, [visible, syncFromValue]);

  const options = useMemo(() => {
    const list = optionsForCategory(category);
    const q = optionSearch.trim().toLowerCase();
    if (!q) return list;
    return list.filter((l) => l.toLowerCase().includes(q));
  }, [category, optionSearch]);

  const isStatusChecked = (stage: OrderStage) => draft.statuses.includes(stage);
  const toggleStatus = (stage: OrderStage) => {
    setDraft((d) => ({
      ...d,
      statuses: isStatusChecked(stage)
        ? d.statuses.filter((s) => s !== stage)
        : [...d.statuses, stage],
    }));
  };

  const isOrderTypeChecked = (id: (typeof ORDER_TYPE_OPTIONS)[number]["id"]) =>
    draft.orderTypes.includes(id);
  const toggleOrderType = (id: (typeof ORDER_TYPE_OPTIONS)[number]["id"]) => {
    setDraft((d) => ({
      ...d,
      orderTypes: isOrderTypeChecked(id)
        ? d.orderTypes.filter((t) => t !== id)
        : [...d.orderTypes, id],
    }));
  };

  const toggleStringList = (
    key: "ratings" | "kptDelays" | "complaints",
    label: string
  ) => {
    setDraft((d) => {
      const arr = d[key];
      return {
        ...d,
        [key]: arr.includes(label) ? arr.filter((x) => x !== label) : [...arr, label],
      };
    });
  };

  const renderOptions = () => {
    if (category === "status") {
      return STATUS_OPTIONS.filter(
        (o) =>
          !optionSearch.trim() ||
          o.label.toLowerCase().includes(optionSearch.trim().toLowerCase())
      ).map((o) => (
        <CheckboxRow
          key={o.id}
          label={o.label}
          checked={isStatusChecked(o.id)}
          onToggle={() => toggleStatus(o.id)}
        />
      ));
    }
    if (category === "order_type") {
      return ORDER_TYPE_OPTIONS.filter(
        (o) =>
          !optionSearch.trim() ||
          o.label.toLowerCase().includes(optionSearch.trim().toLowerCase())
      ).map((o) => (
        <CheckboxRow
          key={o.id}
          label={o.label}
          checked={isOrderTypeChecked(o.id)}
          onToggle={() => toggleOrderType(o.id)}
        />
      ));
    }
    const key =
      category === "ratings" ? "ratings" : category === "kpt" ? "kptDelays" : "complaints";
    return options.map((label) => (
      <CheckboxRow
        key={label}
        label={label}
        checked={draft[key].includes(label)}
        onToggle={() => toggleStringList(key, label)}
      />
    ));
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <Pressable style={styles.dismissArea} onPress={onClose} accessibilityLabel="Close filters" />
        <View style={styles.sheetWrap}>
          <Pressable
            onPress={onClose}
            style={styles.closeFab}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Close"
          >
            <Ionicons name="close" size={22} color={GatiMitraMerchant.textPrimary} />
          </Pressable>

          <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 12) }]}>
            <Text style={styles.sheetTitle}>Filters</Text>

            <View style={[styles.paneRow, { height: PANE_HEIGHT }]}>
              <View style={[styles.sidebar, { width: sidebarWidth }]}>
                <ScrollView
                  style={styles.sidebarScroll}
                  showsVerticalScrollIndicator={false}
                  bounces={false}
                >
                  {CATEGORIES.map((cat) => {
                    const active = cat.id === category;
                    const selectedCount = countForCategory(cat.id, draft);
                    return (
                      <Pressable
                        key={cat.id}
                        onPress={() => {
                          setCategory(cat.id);
                          setOptionSearch("");
                        }}
                        style={[styles.sidebarItem, active && styles.sidebarItemActive]}
                      >
                        {active ? <View style={styles.sidebarAccent} /> : null}
                        <Text
                          style={[styles.sidebarLabel, active && styles.sidebarLabelActive]}
                          numberOfLines={2}
                        >
                          {cat.label}
                        </Text>
                        {selectedCount > 0 ? (
                          <View style={styles.sidebarBadge}>
                            <Text style={styles.sidebarBadgeText}>{selectedCount}</Text>
                          </View>
                        ) : null}
                      </Pressable>
                    );
                  })}
                </ScrollView>
              </View>

              <View style={styles.contentPane}>
                <Text style={styles.contentCategoryTitle}>{activeCategoryLabel}</Text>
                <View style={styles.optionSearchWrap}>
                  <Ionicons name="search" size={18} color={GatiMitraMerchant.textTertiary} />
                  <TextInput
                    style={styles.optionSearchInput}
                    placeholder="Search"
                    placeholderTextColor={GatiMitraMerchant.textTertiary}
                    value={optionSearch}
                    onChangeText={setOptionSearch}
                  />
                </View>
                <ScrollView
                  style={styles.optionsList}
                  contentContainerStyle={styles.optionsListContent}
                  showsVerticalScrollIndicator={false}
                  keyboardShouldPersistTaps="handled"
                >
                  {renderOptions()}
                </ScrollView>
              </View>
            </View>

            <View style={styles.footer}>
              <Pressable
                onPress={() => setDraft(EMPTY_ORDERS_FILTERS)}
                style={({ pressed }) => [styles.clearBtn, pressed && { opacity: 0.7 }]}
              >
                <Text style={styles.clearBtnText}>Clear all</Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  onApply(draft);
                  onClose();
                }}
                style={({ pressed }) => [styles.applyBtn, pressed && { opacity: 0.92 }]}
              >
                <Text style={styles.applyBtnText}>Apply</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.45)",
    justifyContent: "flex-end",
  },
  dismissArea: {
    flex: 1,
  },
  sheetWrap: {
    maxHeight: "92%",
  },
  closeFab: {
    alignSelf: "center",
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.12,
        shadowRadius: 6,
      },
      android: { elevation: 4 },
      default: {},
    }),
  },
  sheet: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    overflow: "hidden",
    minHeight: 520,
    maxHeight: "92%",
  },
  sheetTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: GatiMitraMerchant.textPrimary,
    textAlign: "center",
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: GatiMitraMerchant.border,
  },
  paneRow: {
    flexDirection: "row",
    width: "100%",
  },
  sidebar: {
    flexShrink: 0,
    flexGrow: 0,
    backgroundColor: "#F1F5F9",
    borderRightWidth: 1,
    borderRightColor: GatiMitraMerchant.border,
  },
  sidebarScroll: {
    flex: 1,
  },
  sidebarItem: {
    paddingVertical: 14,
    paddingLeft: 14,
    paddingRight: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: GatiMitraMerchant.border,
    flexDirection: "row",
    alignItems: "center",
    minHeight: 52,
    gap: 6,
  },
  sidebarItemActive: {
    backgroundColor: "#FFFFFF",
  },
  sidebarAccent: {
    position: "absolute",
    left: 0,
    top: 8,
    bottom: 8,
    width: 3,
    borderRadius: 2,
    backgroundColor: GatiMitraMerchant.primary,
  },
  sidebarLabel: {
    flex: 1,
    fontSize: 13,
    fontWeight: "500",
    color: GatiMitraMerchant.textSecondary,
  },
  sidebarLabelActive: {
    fontWeight: "700",
    color: GatiMitraMerchant.textPrimary,
  },
  sidebarBadge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: GatiMitraMerchant.primary,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 5,
  },
  sidebarBadgeText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  contentPane: {
    flex: 1,
    minWidth: 0,
    backgroundColor: "#FFFFFF",
  },
  contentCategoryTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: GatiMitraMerchant.textPrimary,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 4,
  },
  optionSearchWrap: {
    flexDirection: "row",
    alignItems: "center",
    margin: 12,
    paddingHorizontal: 12,
    height: 40,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: GatiMitraMerchant.border,
    backgroundColor: "#F8FAFC",
    gap: 8,
  },
  optionSearchInput: {
    flex: 1,
    fontSize: 14,
    color: GatiMitraMerchant.textPrimary,
    paddingVertical: 0,
  },
  optionsList: {
    flex: 1,
  },
  optionsListContent: {
    paddingHorizontal: 8,
    paddingBottom: 16,
  },
  optionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRadius: 8,
  },
  optionRowPressed: {
    backgroundColor: "#F1F5F9",
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: "#CBD5E1",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
  },
  checkboxOn: {
    backgroundColor: GatiMitraMerchant.primary,
    borderColor: GatiMitraMerchant.primary,
  },
  optionLabel: {
    flex: 1,
    fontSize: 15,
    fontWeight: "500",
    color: GatiMitraMerchant.textPrimary,
  },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: GatiMitraMerchant.border,
  },
  clearBtn: {
    paddingVertical: 14,
    paddingHorizontal: 8,
  },
  clearBtnText: {
    fontSize: 15,
    fontWeight: "600",
    color: GatiMitraMerchant.textPrimary,
  },
  applyBtn: {
    flex: 1,
    backgroundColor: GatiMitraMerchant.textPrimary,
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: "center",
  },
  applyBtnText: {
    fontSize: 16,
    fontWeight: "800",
    color: "#FFFFFF",
  },
});
