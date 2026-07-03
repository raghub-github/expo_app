import { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  Modal,
  StyleSheet,
  TouchableOpacity,
  Pressable,
  Image,
  Animated,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { GatiMitraMerchant, BUTTON_RADIUS, CARD_RADIUS } from "@/constants/theme";
import { ItemVegMark } from "@/components/order/ItemVegMark";
import type { MenuItemRow } from "@/services/menuApi";
import { resolveImageUrl } from "@/services/outletApi";

type Props = {
  visible: boolean;
  item: MenuItemRow | null;
  inStock: boolean;
  oosLabel: string | null;
  onClose: () => void;
  onUpdateStock: () => void;
  onEditItem: () => void;
};

export function CatalogItemEditSheet({
  visible,
  item,
  inStock,
  oosLabel,
  onClose,
  onUpdateStock,
  onEditItem,
}: Props) {
  const slideY = useRef(new Animated.Value(40)).current;
  const [imageError, setImageError] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setImageError(false);
    slideY.setValue(40);
    Animated.timing(slideY, {
      toValue: 0,
      duration: 220,
      useNativeDriver: true,
    }).start();
  }, [visible, item?.id, slideY]);

  if (!item) return null;

  const baseNum = Number(item.base_price);
  const sellingNum = Number(item.selling_price);
  const priceLabel = baseNum > 0 ? `₹${baseNum.toFixed(0)}` : `₹${sellingNum.toFixed(0)}`;
  const imageUri = resolveImageUrl(item.item_image_url);
  const showImage = Boolean(imageUri && !imageError);
  const photoRejected = item.approval_status === "REJECTED" && showImage;
  const primaryMod = String(item.primary_image_moderation_status ?? "").toUpperCase();
  const photoReviewing =
    (item.approval_status === "PENDING" || primaryMod === "PENDING") && showImage;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <Animated.View style={[styles.sheet, { transform: [{ translateY: slideY }] }]}>
          <TouchableOpacity onPress={onClose} style={styles.floatingClose} hitSlop={10}>
            <Ionicons name="close" size={18} color={GatiMitraMerchant.textPrimary} />
          </TouchableOpacity>

          <View style={styles.imageWrap}>
            {showImage ? (
              <Image
                source={{ uri: imageUri! }}
                style={styles.image}
                resizeMode="cover"
                onError={() => setImageError(true)}
              />
            ) : (
              <View style={styles.imagePlaceholder}>
                <Ionicons name="camera-outline" size={32} color={GatiMitraMerchant.primary} />
                <Text style={styles.addPhotoText}>Add photo</Text>
              </View>
            )}
            {photoReviewing ? (
              <View style={styles.reviewingBadge}>
                <Ionicons name="time-outline" size={14} color="#fff" />
                <Text style={styles.reviewingBadgeText}>Image in review</Text>
              </View>
            ) : null}
            {photoRejected ? (
              <View style={styles.rejectedBadge}>
                <Ionicons name="information-circle" size={14} color="#fff" />
                <Text style={styles.rejectedBadgeText}>Rejected</Text>
              </View>
            ) : null}
          </View>

          <View style={styles.bodyCard}>
            <View style={styles.titleRow}>
              <ItemVegMark vegNonveg={item.food_type} name={item.item_name} size={14} />
              <Text style={styles.itemName} numberOfLines={2}>
                {item.item_name}
              </Text>
              <Text style={styles.itemPrice}>{priceLabel}</Text>
            </View>
            {item.item_description?.trim() ? (
              <Text style={styles.description} numberOfLines={3}>
                {item.item_description.trim()}
              </Text>
            ) : null}

            <View style={styles.statusRow}>
              <Text style={[styles.stockStatus, inStock ? styles.stockOn : styles.stockOff]}>
                {inStock ? "In stock" : "Out of stock"}
              </Text>
              {oosLabel ? (
                <Text style={styles.oosHint} numberOfLines={1}>
                  {oosLabel}
                </Text>
              ) : null}
            </View>
          </View>

          <View style={styles.footer}>
            <TouchableOpacity style={styles.updateStockBtn} onPress={onUpdateStock} activeOpacity={0.9}>
              <Text style={styles.updateStockText}>Update stock</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.editItemBtn} onPress={onEditItem} activeOpacity={0.9}>
              <Text style={styles.editItemText}>Edit item</Text>
            </TouchableOpacity>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: "#F3F4F6",
    borderTopLeftRadius: CARD_RADIUS,
    borderTopRightRadius: CARD_RADIUS,
    paddingHorizontal: 16,
    paddingBottom: 20,
    maxHeight: "92%",
  },
  floatingClose: {
    position: "absolute",
    top: -22,
    alignSelf: "center",
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: GatiMitraMerchant.border,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 2,
    ...GatiMitraMerchant.shadowSm,
  },
  imageWrap: {
    marginTop: 14,
    borderRadius: 14,
    overflow: "hidden",
    backgroundColor: "#E5E7EB",
    minHeight: 200,
  },
  image: {
    width: "100%",
    height: 220,
  },
  imagePlaceholder: {
    height: 220,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  addPhotoText: {
    fontSize: 13,
    fontWeight: "600",
    color: GatiMitraMerchant.primary,
  },
  rejectedBadge: {
    position: "absolute",
    bottom: 10,
    right: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#DC2626",
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 8,
  },
  rejectedBadgeText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "700",
  },
  reviewingBadge: {
    position: "absolute",
    bottom: 10,
    right: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#F59E0B",
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 8,
  },
  reviewingBadgeText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "700",
  },
  bodyCard: {
    marginTop: 14,
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: GatiMitraMerchant.border,
    padding: 14,
    gap: 8,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
  },
  itemName: {
    flex: 1,
    fontSize: 17,
    fontWeight: "800",
    color: GatiMitraMerchant.textPrimary,
    lineHeight: 22,
  },
  itemPrice: {
    fontSize: 17,
    fontWeight: "800",
    color: "#0F766E",
  },
  description: {
    fontSize: 14,
    lineHeight: 20,
    color: GatiMitraMerchant.textSecondary,
    marginLeft: 22,
  },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 4,
    marginLeft: 22,
    flexWrap: "wrap",
  },
  stockStatus: {
    fontSize: 13,
    fontWeight: "700",
  },
  stockOn: {
    color: GatiMitraMerchant.success,
  },
  stockOff: {
    color: GatiMitraMerchant.error,
  },
  oosHint: {
    flex: 1,
    fontSize: 12,
    fontWeight: "600",
    color: GatiMitraMerchant.error,
  },
  footer: {
    flexDirection: "row",
    gap: 12,
    marginTop: 16,
  },
  updateStockBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: BUTTON_RADIUS,
    borderWidth: 1,
    borderColor: GatiMitraMerchant.border,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
  },
  updateStockText: {
    fontSize: 15,
    fontWeight: "800",
    color: GatiMitraMerchant.textPrimary,
  },
  editItemBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: BUTTON_RADIUS,
    backgroundColor: GatiMitraMerchant.textPrimary,
    alignItems: "center",
  },
  editItemText: {
    fontSize: 15,
    fontWeight: "800",
    color: "#FFFFFF",
  },
});
