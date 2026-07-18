/**
 * Product card: image, name, price, discount, rating, COD, Add to Cart / quantity selector.
 * Smooth transition to quantity controls on add.
 */

import { View, Image, TouchableOpacity, StyleSheet, Dimensions } from "react-native";
import { AppText } from "@/components/AppText";

import { Ionicons } from "@expo/vector-icons";
import { GatiMitraColors } from "@/constants/gatimitra";
import { useShopCartStore } from "@/store/shopCartStore";
import { useAppAssetSource } from "@/components/AppAssetImage";
import { CX } from "@/lib/appAssetKeys";
import type { ShopProduct } from "./data";
import { getShopProductImage } from "./data";

const { width } = Dimensions.get("window");
const PAD = 16;
const GAP = 10;
const CARD_WIDTH = (width - PAD * 2 - GAP) / 2;

type ProductCardProps = {
  product: ShopProduct;
  imageKey: string;
};

export function ProductCard({ product, imageKey }: ProductCardProps) {
  const n = Number(String(imageKey).replace(/^p/, ""));
  const assetKey = CX.shop.product(Number.isFinite(n) && n >= 1 ? n : 1);
  const imageSource = useAppAssetSource(assetKey) ?? getShopProductImage(imageKey);
  const addItem = useShopCartStore((s) => s.addItem);
  const updateQuantity = useShopCartStore((s) => s.updateQuantity);
  const items = useShopCartStore((s) => s.items);
  const cartItem = items.find((i) => i.productId === product.id);
  const qty = cartItem?.quantity ?? 0;

  const addToCart = () => {
    addItem({
      productId: product.id,
      name: product.name,
      price: product.price,
      imageKey: product.imageKey,
      cod: product.cod,
    });
  };

  const discount =
    product.originalPrice != null && product.originalPrice > product.price
      ? Math.round(((product.originalPrice - product.price) / product.originalPrice) * 100)
      : null;

  return (
    <View style={styles.card}>
      <View style={styles.imageWrap}>
        {imageSource ? (
          <Image source={imageSource} style={styles.image} resizeMode="cover" />
        ) : null}
        {discount != null && (
          <View style={styles.discountBadge}>
            <AppText style={styles.discountText}>{discount}% OFF</AppText>
          </View>
        )}
        {product.popular && (
          <View style={styles.popularBadge}>
            <AppText style={styles.popularText}>Popular</AppText>
          </View>
        )}
      </View>
      <AppText style={styles.name} numberOfLines={2}>
        {product.name}
      </AppText>
      <View style={styles.priceRow}>
        <AppText style={styles.price}>₹{product.price}</AppText>
        {product.originalPrice != null && product.originalPrice > product.price && (
          <AppText style={styles.originalPrice}>₹{product.originalPrice}</AppText>
        )}
      </View>
      {product.rating != null && (
        <View style={styles.ratingRow}>
          <Ionicons name="star" size={12} color={GatiMitraColors.warmOrange} />
          <AppText style={styles.ratingText}>{product.rating}</AppText>
        </View>
      )}
      {product.cod && (
        <View style={styles.codBadge}>
          <AppText style={styles.codText}>COD</AppText>
        </View>
      )}
      {qty === 0 ? (
        <TouchableOpacity
          style={styles.addBtn}
          onPress={addToCart}
          activeOpacity={0.85}
        >
          <AppText style={styles.addBtnText}>Add to Cart</AppText>
        </TouchableOpacity>
      ) : (
        <View style={styles.qtyRow}>
          <TouchableOpacity
            style={styles.qtyBtn}
            onPress={() => updateQuantity(product.id, -1)}
            activeOpacity={0.8}
          >
            <Ionicons name="remove" size={18} color={GatiMitraColors.textPrimary} />
          </TouchableOpacity>
          <AppText style={styles.qtyText}>{qty}</AppText>
          <TouchableOpacity
            style={styles.qtyBtn}
            onPress={() => updateQuantity(product.id, 1)}
            activeOpacity={0.8}
          >
            <Ionicons name="add" size={18} color={GatiMitraColors.textPrimary} />
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const CARD_SHADOW = {
  shadowColor: "#000",
  shadowOffset: { width: 0, height: 1 },
  shadowOpacity: 0.04,
  shadowRadius: 4,
  elevation: 2,
};

const styles = StyleSheet.create({
  card: {
    width: CARD_WIDTH,
    backgroundColor: GatiMitraColors.cardBg,
    borderRadius: 14,
    overflow: "hidden",
    paddingBottom: 10,
    borderWidth: 1,
    borderColor: GatiMitraColors.border,
    ...CARD_SHADOW,
  },
  imageWrap: {
    width: "100%",
    height: CARD_WIDTH * 0.88,
    backgroundColor: GatiMitraColors.mintSoft,
    position: "relative",
  },
  image: { width: "100%", height: "100%" },
  discountBadge: {
    position: "absolute",
    top: 6,
    left: 6,
    backgroundColor: "#dc2626",
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 6,
  },
  discountText: { fontSize: 10, fontWeight: "700", color: "#fff" },
  popularBadge: {
    position: "absolute",
    top: 6,
    right: 6,
    backgroundColor: GatiMitraColors.emerald,
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 6,
  },
  popularText: { fontSize: 10, fontWeight: "700", color: "#fff" },
  name: {
    fontSize: 13,
    fontWeight: "600",
    color: GatiMitraColors.textPrimary,
    marginTop: 6,
    marginHorizontal: 8,
    lineHeight: 17,
  },
  priceRow: { flexDirection: "row", alignItems: "center", marginTop: 2, marginHorizontal: 8, gap: 4 },
  price: { fontSize: 15, fontWeight: "800", color: GatiMitraColors.textPrimary },
  originalPrice: {
    fontSize: 11,
    color: GatiMitraColors.textSecondary,
    textDecorationLine: "line-through",
  },
  ratingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    marginTop: 2,
    marginHorizontal: 8,
  },
  ratingText: { fontSize: 11, fontWeight: "600", color: GatiMitraColors.textSecondary },
  codBadge: {
    alignSelf: "flex-start",
    marginLeft: 8,
    marginTop: 2,
    backgroundColor: GatiMitraColors.mintSoft,
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 5,
  },
  codText: { fontSize: 9, fontWeight: "700", color: GatiMitraColors.emerald },
  addBtn: {
    marginHorizontal: 8,
    marginTop: 8,
    backgroundColor: GatiMitraColors.emerald,
    paddingVertical: 8,
    borderRadius: 10,
    alignItems: "center",
  },
  addBtnText: { fontSize: 12, fontWeight: "700", color: "#fff" },
  qtyRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginHorizontal: 8,
    marginTop: 8,
    gap: 10,
  },
  qtyBtn: {
    width: 30,
    height: 30,
    borderRadius: 8,
    backgroundColor: GatiMitraColors.mintSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  qtyText: { fontSize: 14, fontWeight: "700", color: GatiMitraColors.textPrimary, minWidth: 18, textAlign: "center" },
});
