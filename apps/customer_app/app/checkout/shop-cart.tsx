/**
 * Shop / Marketplace cart – list items, quantity controls, proceed to checkout.
 */

import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Image,
} from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useShopCartStore } from "@/store/shopCartStore";
import { GatiMitraColors } from "@/constants/gatimitra";
import { BrandingFooter } from "@/components/BrandingFooter";
import { PRODUCT_IMAGES } from "@/features/shop/data";

const PAD = 20;
const SHADOW = GatiMitraColors.elevationShadow;

export default function ShopCartScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { items, updateQuantity, clearCart } = useShopCartStore();

  const subtotal = items.reduce((s, i) => s + i.price * i.quantity, 0);

  if (items.length === 0) {
    return (
      <View style={[styles.screen, { paddingBottom: insets.bottom + 24 }]}>
        <View style={styles.emptyCard}>
          <View style={styles.emptyIconWrap}>
            <Ionicons name="cart-outline" size={48} color={GatiMitraColors.textSecondary} />
          </View>
          <Text style={styles.emptyTitle}>Your cart is empty</Text>
          <Text style={styles.emptySub}>Add products from the Shop</Text>
          <TouchableOpacity
            onPress={() => router.back()}
            style={styles.browseBtn}
            activeOpacity={0.85}
          >
            <Text style={styles.browseBtnText}>Browse Shop</Text>
            <Ionicons name="arrow-forward" size={18} color="#fff" />
          </TouchableOpacity>
        </View>
        <BrandingFooter />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 100 }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.itemsCard, SHADOW]}>
          {items.map((item) => (
            <View
              key={item.productId}
              style={[
                styles.itemRow,
                items.indexOf(item) < items.length - 1 && styles.itemRowBorder,
              ]}
            >
              <Image
                source={PRODUCT_IMAGES[item.imageKey] ?? PRODUCT_IMAGES.p1}
                style={styles.itemImage}
                resizeMode="cover"
              />
              <View style={styles.itemInfo}>
                <Text style={styles.itemName} numberOfLines={2}>{item.name}</Text>
                <Text style={styles.itemPrice}>₹{item.price}</Text>
                <View style={styles.qtyWrap}>
                  <TouchableOpacity
                    onPress={() => updateQuantity(item.productId, -1)}
                    style={styles.qtyBtn}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="remove" size={18} color={GatiMitraColors.textPrimary} />
                  </TouchableOpacity>
                  <Text style={styles.qtyText}>{item.quantity}</Text>
                  <TouchableOpacity
                    onPress={() => updateQuantity(item.productId, 1)}
                    style={styles.qtyBtn}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="add" size={18} color={GatiMitraColors.textPrimary} />
                  </TouchableOpacity>
                </View>
              </View>
              <Text style={styles.rowTotal}>₹{item.price * item.quantity}</Text>
            </View>
          ))}
        </View>
        <View style={[styles.summaryCard, SHADOW]}>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Subtotal</Text>
            <Text style={styles.summaryValue}>₹{subtotal}</Text>
          </View>
          <View style={[styles.summaryRow, styles.totalRow]}>
            <Text style={styles.totalLabel}>Total</Text>
            <Text style={styles.totalValue}>₹{subtotal}</Text>
          </View>
        </View>
        <TouchableOpacity onPress={() => clearCart()} style={styles.clearBtn} activeOpacity={0.8}>
          <Ionicons name="trash-outline" size={18} color="#dc2626" />
          <Text style={styles.clearBtnText}>Clear cart</Text>
        </TouchableOpacity>

        <BrandingFooter />
      </ScrollView>
      <View style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}>
        <TouchableOpacity
          onPress={() => {}}
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
  screen: { flex: 1, backgroundColor: "#F8F8F8" },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: PAD, paddingTop: 20 },
  emptyCard: {
    backgroundColor: GatiMitraColors.cardBg,
    borderRadius: 20,
    padding: 32,
    alignItems: "center",
    marginTop: 48,
    ...SHADOW,
  },
  emptyIconWrap: { marginBottom: 16 },
  emptyTitle: { fontSize: 18, fontWeight: "700", color: GatiMitraColors.textPrimary },
  emptySub: { fontSize: 14, color: GatiMitraColors.textSecondary, marginTop: 8 },
  browseBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: GatiMitraColors.emerald,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 14,
    marginTop: 24,
  },
  browseBtnText: { fontSize: 15, fontWeight: "700", color: "#fff" },
  itemsCard: {
    backgroundColor: GatiMitraColors.cardBg,
    borderRadius: 16,
    overflow: "hidden",
    marginBottom: 16,
  },
  itemRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
  },
  itemRowBorder: { borderBottomWidth: 1, borderBottomColor: GatiMitraColors.border },
  itemImage: { width: 64, height: 64, borderRadius: 12, backgroundColor: GatiMitraColors.mintSoft },
  itemInfo: { flex: 1, marginLeft: 14 },
  itemName: { fontSize: 15, fontWeight: "600", color: GatiMitraColors.textPrimary },
  itemPrice: { fontSize: 13, color: GatiMitraColors.textSecondary, marginTop: 2 },
  qtyWrap: { flexDirection: "row", alignItems: "center", marginTop: 8, gap: 10 },
  qtyBtn: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: GatiMitraColors.mintSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  qtyText: { fontSize: 15, fontWeight: "700", color: GatiMitraColors.textPrimary, minWidth: 20, textAlign: "center" },
  rowTotal: { fontSize: 15, fontWeight: "700", color: GatiMitraColors.textPrimary },
  summaryCard: {
    backgroundColor: GatiMitraColors.cardBg,
    borderRadius: 16,
    padding: 18,
    marginBottom: 16,
  },
  summaryRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  summaryLabel: { fontSize: 14, color: GatiMitraColors.textSecondary },
  summaryValue: { fontSize: 14, fontWeight: "600", color: GatiMitraColors.textPrimary },
  totalRow: { marginTop: 8, marginBottom: 0, paddingTop: 8, borderTopWidth: 1, borderTopColor: GatiMitraColors.border },
  totalLabel: { fontSize: 16, fontWeight: "700", color: GatiMitraColors.textPrimary },
  totalValue: { fontSize: 18, fontWeight: "800", color: GatiMitraColors.emerald },
  clearBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 12 },
  clearBtnText: { fontSize: 14, fontWeight: "600", color: "#dc2626" },
  footer: { paddingHorizontal: PAD, paddingTop: 16, backgroundColor: GatiMitraColors.background, borderTopWidth: 1, borderTopColor: GatiMitraColors.border },
  checkoutBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    backgroundColor: GatiMitraColors.emerald,
    paddingVertical: 16,
    borderRadius: 14,
  },
  checkoutBtnText: { fontSize: 16, fontWeight: "700", color: "#fff" },
});
