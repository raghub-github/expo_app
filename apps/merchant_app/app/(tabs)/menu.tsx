/**
 * Catalog — multi-category product/inventory (food, pharmacy, grocery, retail, etc.).
 */

import { View, Text, ScrollView, StyleSheet, TouchableOpacity } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { GatiMitraMerchant, H_PADDING, TAB_BAR_HEIGHT, SCROLL_BOTTOM_SAFE } from "@/constants/theme";

const CATEGORIES = ["All", "Starters", "Main", "Beverages", "Desserts"];

function MenuItemCard({
  name,
  price,
  status,
  category,
}: {
  name: string;
  price: string;
  status: "Available" | "Unavailable";
  category: string;
}) {
  return (
    <View style={styles.itemCard}>
      <View style={styles.itemLeft}>
        <View style={styles.itemIconWrap}>
          <Ionicons name="restaurant-outline" size={22} color={GatiMitraMerchant.primary} />
        </View>
        <View>
          <Text style={styles.itemName}>{name}</Text>
          <Text style={styles.itemCategory}>{category} • {price}</Text>
        </View>
      </View>
      <View style={[styles.itemBadge, status === "Unavailable" && styles.itemBadgeOff]}>
        <Text style={[styles.itemBadgeText, status === "Unavailable" && styles.itemBadgeTextOff]}>
          {status}
        </Text>
      </View>
    </View>
  );
}

export default function MenuScreen() {
  const insets = useSafeAreaInsets();
  const scrollBottomPadding = TAB_BAR_HEIGHT + SCROLL_BOTTOM_SAFE + insets.bottom;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.content, { paddingBottom: scrollBottomPadding }]}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.addRow}>
        <TouchableOpacity style={[styles.addButton, GatiMitraMerchant.cursorPointer]}>
          <Ionicons name="add" size={22} color="#fff" />
          <Text style={styles.addButtonText}>Add item</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.catScroll}
        contentContainerStyle={styles.catRow}
      >
        {CATEGORIES.map((c, i) => (
          <TouchableOpacity
            key={c}
            style={[styles.catChip, i === 0 && styles.catChipActive, GatiMitraMerchant.cursorPointer]}
            activeOpacity={0.7}
          >
            <Text style={[styles.catChipText, i === 0 && styles.catChipTextActive]}>{c}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>All items (12)</Text>
        <MenuItemCard name="Veg Burger" price="₹199" status="Available" category="Main" />
        <MenuItemCard name="Margherita Pizza" price="₹299" status="Available" category="Main" />
        <MenuItemCard name="Cold Coffee" price="₹99" status="Unavailable" category="Beverages" />
        <MenuItemCard name="Chocolate Brownie" price="₹149" status="Available" category="Desserts" />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: GatiMitraMerchant.background },
  content: { paddingHorizontal: H_PADDING },
  addRow: { marginBottom: 16 },
  addButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: GatiMitraMerchant.primary,
    paddingVertical: 12,
    borderRadius: 10,
    ...GatiMitraMerchant.shadowSm,
  },
  addButtonText: { color: "#fff", fontWeight: "700", fontSize: 15 },
  catScroll: { marginBottom: 20 },
  catRow: { flexDirection: "row", gap: 8, paddingRight: 16 },
  catChip: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    backgroundColor: GatiMitraMerchant.cardBg,
    borderWidth: 1,
    borderColor: GatiMitraMerchant.border,
  },
  catChipActive: {
    backgroundColor: GatiMitraMerchant.primary,
    borderColor: GatiMitraMerchant.primary,
  },
  catChipText: { fontSize: 13, fontWeight: "600", color: GatiMitraMerchant.textSecondary },
  catChipTextActive: { color: "#fff" },
  section: { gap: 10 },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: GatiMitraMerchant.textPrimary,
    marginBottom: 4,
  },
  itemCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: GatiMitraMerchant.cardBg,
    padding: 14,
    borderRadius: 12,
    ...GatiMitraMerchant.shadowSm,
  },
  itemLeft: { flexDirection: "row", alignItems: "center", flex: 1 },
  itemIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: GatiMitraMerchant.surfaceWarm,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  itemName: { fontSize: 15, fontWeight: "700", color: GatiMitraMerchant.textPrimary },
  itemCategory: { fontSize: 13, color: GatiMitraMerchant.textSecondary, marginTop: 2 },
  itemBadge: {
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: "#d1fae5",
  },
  itemBadgeOff: { backgroundColor: "#fee2e2" },
  itemBadgeText: { fontSize: 12, fontWeight: "600", color: GatiMitraMerchant.success },
  itemBadgeTextOff: { color: GatiMitraMerchant.error },
});
