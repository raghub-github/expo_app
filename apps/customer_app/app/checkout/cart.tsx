/**
 * Cart screen – card-style layout, empty state and item list.
 */

import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
} from "react-native";
import { useRouter } from "expo-router";
import { useCartStore } from "@/store/cartStore";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";

const BG = "#F8F8F8";
const CARD_BG = "#FFFFFF";
const TITLE_DARK = "#1A1A1A";
const TEXT_GRAY = "#6B7280";
const BORDER = "#E5E7EB";
const TEAL = "#14b8a6";
const RED = "#dc2626";
const PAD = 20;
const CARD_RADIUS = 16;
const SHADOW = {
  shadowColor: "#000",
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.06,
  shadowRadius: 8,
  elevation: 3,
};

export default function CartScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { items, merchantName, updateQuantity, clearCart } = useCartStore();

  const subtotal = items.reduce((s, i) => s + i.price * i.quantity, 0);
  const deliveryFee = 40;
  const total = subtotal + deliveryFee;

  if (items.length === 0) {
    return (
      <View style={[styles.screen, { paddingBottom: insets.bottom + 24 }]}>
        <View style={styles.emptyCard}>
          <View style={styles.emptyIconWrap}>
            <Ionicons name="cart-outline" size={48} color={TEXT_GRAY} />
          </View>
          <Text style={styles.emptyTitle}>Your cart is empty</Text>
          <Text style={styles.emptySub}>
          Add items for quick pickup
          </Text>
          <TouchableOpacity
            onPress={() => router.replace("/home")}
            style={styles.browseBtn}
            activeOpacity={0.85}
          >
            <Text style={styles.browseBtnText}>Browse restaurants</Text>
            <Ionicons name="arrow-forward" size={18} color="#fff" />
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: insets.bottom + 100 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {merchantName ? (
          <View style={styles.merchantCard}>
            <Ionicons name="restaurant-outline" size={20} color={TEAL} />
            <Text style={styles.merchantName} numberOfLines={1}>
              {merchantName}
            </Text>
          </View>
        ) : null}

        <View style={[styles.itemsCard, SHADOW]}>
          {items.map((item) => (
            <View
              key={item.menuItemId}
              style={[
                styles.itemRow,
                items.indexOf(item) < items.length - 1 && styles.itemRowBorder,
              ]}
            >
              <View style={styles.itemLeft}>
                <View
                  style={[
                    styles.vegDot,
                    item.isVeg ? styles.vegDotGreen : styles.vegDotRed,
                  ]}
                />
                <View>
                  <Text style={styles.itemName}>{item.name}</Text>
                  <Text style={styles.itemPrice}>₹{item.price * item.quantity}</Text>
                </View>
              </View>
              <View style={styles.qtyWrap}>
                <TouchableOpacity
                  onPress={() => updateQuantity(item.menuItemId, -1)}
                  style={styles.qtyBtn}
                  activeOpacity={0.7}
                >
                  <Ionicons name="remove" size={18} color={TITLE_DARK} />
                </TouchableOpacity>
                <Text style={styles.qtyText}>{item.quantity}</Text>
                <TouchableOpacity
                  onPress={() => updateQuantity(item.menuItemId, 1)}
                  style={styles.qtyBtn}
                  activeOpacity={0.7}
                >
                  <Ionicons name="add" size={18} color={TITLE_DARK} />
                </TouchableOpacity>
              </View>
            </View>
          ))}
        </View>

        <View style={[styles.summaryCard, SHADOW]}>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Subtotal</Text>
            <Text style={styles.summaryValue}>₹{subtotal}</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Delivery fee</Text>
            <Text style={styles.summaryValue}>₹{deliveryFee}</Text>
          </View>
          <View style={[styles.summaryRow, styles.totalRow]}>
            <Text style={styles.totalLabel}>Total</Text>
            <Text style={styles.totalValue}>₹{total}</Text>
          </View>
        </View>

        <TouchableOpacity
          onPress={() => clearCart()}
          style={styles.clearBtn}
          activeOpacity={0.8}
        >
          <Ionicons name="trash-outline" size={18} color={RED} />
          <Text style={styles.clearBtnText}>Clear cart</Text>
        </TouchableOpacity>
      </ScrollView>

      <View
        style={[
          styles.footer,
          { paddingBottom: insets.bottom + 16 },
        ]}
      >
        <TouchableOpacity
          onPress={() => router.push("/checkout")}
          style={styles.checkoutBtn}
          activeOpacity={0.9}
        >
          <Text style={styles.checkoutBtnText}>Proceed to checkout</Text>
          <Ionicons name="arrow-forward" size={20} color="#fff" />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: BG,
  },
  scroll: { flex: 1 },
  scrollContent: {
    paddingHorizontal: PAD,
    paddingTop: 20,
  },

  // Empty state
  emptyCard: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: PAD,
  },
  emptyIconWrap: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: CARD_BG,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 20,
    ...SHADOW,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: TITLE_DARK,
    marginBottom: 8,
    textAlign: "center",
  },
  emptySub: {
    fontSize: 15,
    color: TEXT_GRAY,
    textAlign: "center",
    marginBottom: 24,
    lineHeight: 22,
  },
  browseBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: TEAL,
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 14,
  },
  browseBtnText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#fff",
  },

  // Merchant
  merchantCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: CARD_BG,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: CARD_RADIUS,
    marginBottom: 16,
    ...SHADOW,
  },
  merchantName: {
    fontSize: 16,
    fontWeight: "600",
    color: TITLE_DARK,
    flex: 1,
  },

  // Items card
  itemsCard: {
    backgroundColor: CARD_BG,
    borderRadius: CARD_RADIUS,
    overflow: "hidden",
    marginBottom: 16,
  },
  itemRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 16,
    paddingHorizontal: 16,
  },
  itemRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  itemLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flex: 1,
  },
  vegDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 1.5,
  },
  vegDotGreen: { borderColor: "#22c55e" },
  vegDotRed: { borderColor: RED },
  itemName: {
    fontSize: 16,
    fontWeight: "600",
    color: TITLE_DARK,
  },
  itemPrice: {
    fontSize: 14,
    color: TEXT_GRAY,
    marginTop: 2,
  },
  qtyWrap: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: BG,
    borderRadius: 12,
    paddingVertical: 4,
    paddingHorizontal: 4,
  },
  qtyBtn: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  qtyText: {
    fontSize: 15,
    fontWeight: "700",
    color: TITLE_DARK,
    minWidth: 28,
    textAlign: "center",
  },

  // Summary card
  summaryCard: {
    backgroundColor: CARD_BG,
    borderRadius: CARD_RADIUS,
    padding: 20,
    marginBottom: 16,
  },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 6,
  },
  summaryLabel: { fontSize: 15, color: TEXT_GRAY },
  summaryValue: { fontSize: 15, fontWeight: "600", color: TITLE_DARK },
  totalRow: {
    borderTopWidth: 1,
    borderTopColor: BORDER,
    marginTop: 8,
    paddingTop: 14,
  },
  totalLabel: { fontSize: 17, fontWeight: "700", color: TITLE_DARK },
  totalValue: { fontSize: 17, fontWeight: "700", color: TEAL },

  // Clear & footer
  clearBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
  },
  clearBtnText: { fontSize: 15, fontWeight: "600", color: RED },
  footer: {
    paddingHorizontal: PAD,
    paddingTop: 16,
    backgroundColor: CARD_BG,
    borderTopWidth: 1,
    borderTopColor: BORDER,
  },
  checkoutBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    backgroundColor: TEAL,
    paddingVertical: 16,
    borderRadius: 14,
    ...SHADOW,
  },
  checkoutBtnText: {
    fontSize: 17,
    fontWeight: "700",
    color: "#fff",
  },
});
