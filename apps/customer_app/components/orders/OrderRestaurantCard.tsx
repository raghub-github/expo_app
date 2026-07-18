/**
 * Live tracking — restaurant info, order summary, cooking requests (Zomato-style).
 */

import { View, TouchableOpacity, StyleSheet, Image } from "react-native";
import { AppText } from "@/components/AppText";

import { CheckoutText } from "@/components/checkout/CheckoutText";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { GatiMitraColors } from "@/constants/gatimitra";
import { DietIndicator } from "@/components/store/DietIndicator";
import { resolveOrderItemDiet } from "@/lib/reorderFromOrder";
import type { OrderDetailLineItem } from "@/lib/order-item-customization-display";

const CARD = GatiMitraColors.cardSurface;
const BORDER = GatiMitraColors.border;
const TEXT = GatiMitraColors.textPrimaryNew;
const MUTED = GatiMitraColors.textSecondary;
const ACCENT = GatiMitraColors.emerald;
const ZOMATO_RED = "#E23744";
const CALL_BTN_BG = "#FFF0F0";
const CALL_BTN_BORDER = "#FFD6D6";

type OrderItem = {
  name: string;
  quantity: number;
  price: number;
  lineTotal?: number | null;
  vegNonVeg?: string | null;
  variantName?: string | null;
  customization?: string | null;
};

type Props = {
  restaurantName: string;
  merchantArea?: string;
  bannerUri?: string | null;
  displayOrderId: string;
  items: OrderItem[];
  itemsExpanded: boolean;
  itemsPreview: string;
  merchantInstructionsList: string[];
  canAddCookingRequest: boolean;
  onToggleItems: () => void;
  onCallRestaurant: () => void;
  onOpenCookingRequest: () => void;
  onItemPress?: (item: OrderDetailLineItem, index: number) => void;
  itemHasCustomizations?: (item: OrderDetailLineItem) => boolean;
};

function SolidDivider() {
  return <View style={styles.solidDivider} />;
}

function DashedDivider() {
  return (
    <View style={styles.dashedWrap}>
      <AppText style={styles.dashedLine} numberOfLines={1}>
        - - - - - - - - - - - - - - - - - - - -
      </AppText>
    </View>
  );
}

export function OrderRestaurantCard({
  restaurantName,
  merchantArea,
  bannerUri,
  displayOrderId,
  items,
  itemsExpanded,
  itemsPreview,
  merchantInstructionsList,
  canAddCookingRequest,
  onToggleItems,
  onCallRestaurant,
  onOpenCookingRequest,
  onItemPress,
  itemHasCustomizations,
}: Props) {
  const hasInstructions = merchantInstructionsList.length > 0;

  return (
    <View style={styles.card}>
      <View style={styles.restaurantRow}>
        <View style={styles.restaurantLogo}>
          {bannerUri ? (
            <Image source={{ uri: bannerUri }} style={styles.restaurantLogoImg} resizeMode="cover" />
          ) : (
            <CheckoutText style={styles.restaurantInitial}>{restaurantName.slice(0, 1).toUpperCase()}</CheckoutText>
          )}
        </View>
        <View style={styles.restaurantInfo}>
          <CheckoutText style={styles.restaurantName} numberOfLines={1}>
            {restaurantName}
          </CheckoutText>
          {!!merchantArea && (
            <CheckoutText style={styles.restaurantArea} numberOfLines={1}>
              {merchantArea}
            </CheckoutText>
          )}
        </View>
        <TouchableOpacity style={styles.restaurantCallBtn} onPress={onCallRestaurant} activeOpacity={0.85}>
          <Ionicons name="call" size={20} color={ZOMATO_RED} />
        </TouchableOpacity>
      </View>

      <SolidDivider />

      <TouchableOpacity style={styles.orderRow} onPress={onToggleItems} activeOpacity={0.85}>
        <View style={styles.orderIconCircle}>
          <Ionicons name="document-text-outline" size={16} color={MUTED} />
        </View>
        <View style={styles.orderRowText}>
          <CheckoutText style={styles.orderIdLabel}>Order #{displayOrderId}</CheckoutText>
          {!itemsExpanded && itemsPreview ? (
            <View style={styles.itemPreviewRow}>
              {items[0]?.vegNonVeg ? (
                <DietIndicator type={resolveOrderItemDiet(items[0].vegNonVeg) ?? "veg"} />
              ) : null}
              <CheckoutText style={styles.itemPreviewText} numberOfLines={1}>
                {itemsPreview}
              </CheckoutText>
            </View>
          ) : null}
        </View>
        <Ionicons name={itemsExpanded ? "chevron-up" : "chevron-forward"} size={18} color="#C4C4C4" />
      </TouchableOpacity>

      {itemsExpanded
        ? items.map((item, index) => {
            const diet = resolveOrderItemDiet(item.vegNonVeg);
            const lineItem: OrderDetailLineItem = {
              name: item.name,
              quantity: item.quantity,
              variantName: item.variantName,
              customization: item.customization,
            };
            const hasCust = itemHasCustomizations?.(lineItem) ?? false;
            return (
              <View key={`${displayOrderId}-item-${index}`}>
                <SolidDivider />
                <TouchableOpacity
                  style={styles.itemRow}
                  disabled={!hasCust}
                  onPress={() => onItemPress?.(lineItem, index)}
                  activeOpacity={hasCust ? 0.7 : 1}
                >
                  <View style={styles.itemLeft}>
                    {diet != null && (
                      <View style={styles.dietWrap}>
                        <DietIndicator type={diet} />
                      </View>
                    )}
                    <CheckoutText style={styles.itemName} numberOfLines={2}>
                      {item.quantity} x {item.name}
                    </CheckoutText>
                  </View>
                </TouchableOpacity>
              </View>
            );
          })
        : null}

      <DashedDivider />

      <TouchableOpacity
        style={styles.cookingRow}
        onPress={onOpenCookingRequest}
        disabled={!canAddCookingRequest}
        activeOpacity={canAddCookingRequest ? 0.85 : 1}
      >
        <View style={styles.cookingIconCircle}>
          <MaterialCommunityIcons name="pot-steam-outline" size={16} color={MUTED} />
        </View>
        <View style={styles.cookingTextWrap}>
          {hasInstructions ? (
            <>
              <CheckoutText style={styles.cookingTitle}>Cooking requests added</CheckoutText>
              <View style={styles.instructionList}>
                {merchantInstructionsList.map((item) => (
                  <View key={item} style={styles.instructionChipRow}>
                    <Ionicons name="checkmark-circle" size={14} color={ACCENT} />
                    <CheckoutText style={styles.instructionChipText}>{item}</CheckoutText>
                  </View>
                ))}
              </View>
              {canAddCookingRequest ? (
                <CheckoutText style={styles.cookingAddMore}>Tap to add another request</CheckoutText>
              ) : null}
            </>
          ) : (
            <CheckoutText
              style={[styles.cookingPlaceholder, !canAddCookingRequest && styles.cookingPlaceholderDisabled]}
            >
              {canAddCookingRequest ? "Add cooking requests" : "Cooking requests closed for this order"}
            </CheckoutText>
          )}
        </View>
        {canAddCookingRequest ? (
          <Ionicons name="chevron-forward" size={18} color="#C4C4C4" />
        ) : null}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: CARD,
    borderRadius: 16,
    padding: 14,
    marginTop: 14,
    borderWidth: 1,
    borderColor: BORDER,
  },
  solidDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: "#ECECEC",
    marginVertical: 12,
  },
  dashedWrap: { marginVertical: 12, overflow: "hidden" },
  dashedLine: { fontSize: 10, color: "#E5E7EB", letterSpacing: 1 },
  restaurantRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  restaurantLogo: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: GatiMitraColors.mintSoft,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  restaurantLogoImg: { width: 44, height: 44 },
  restaurantInitial: { fontSize: 18, fontWeight: "700", color: ACCENT },
  restaurantInfo: { flex: 1, minWidth: 0 },
  restaurantName: { fontSize: 15, fontWeight: "700", color: TEXT },
  restaurantArea: { fontSize: 12, color: MUTED, marginTop: 2, fontWeight: "500" },
  restaurantCallBtn: {
    width: 46,
    height: 46,
    borderRadius: 23,
    borderWidth: 1,
    borderColor: CALL_BTN_BORDER,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: CALL_BTN_BG,
  },
  orderRow: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  orderIconCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#F3F4F6",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
  },
  orderRowText: { flex: 1, minWidth: 0, paddingTop: 2 },
  orderIdLabel: { fontSize: 14, fontWeight: "700", color: TEXT },
  itemPreviewRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4 },
  itemPreviewText: { flex: 1, fontSize: 12, color: MUTED, fontWeight: "500" },
  itemRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 4,
  },
  itemLeft: { flex: 1, flexDirection: "row", alignItems: "center", gap: 8 },
  dietWrap: { marginTop: 2 },
  itemName: { flex: 1, fontSize: 13, color: TEXT, fontWeight: "500" },
  cookingRow: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  cookingIconCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#F3F4F6",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
  },
  cookingTextWrap: { flex: 1, minWidth: 0, paddingTop: 4 },
  cookingTitle: { fontSize: 14, fontWeight: "700", color: TEXT },
  cookingPlaceholder: { fontSize: 14, color: "#9CA3AF", fontWeight: "500" },
  cookingPlaceholderDisabled: { color: MUTED },
  cookingAddMore: { fontSize: 12, color: MUTED, marginTop: 8, fontWeight: "500" },
  instructionList: { marginTop: 6, gap: 4 },
  instructionChipRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  instructionChipText: { fontSize: 12, fontWeight: "600", color: TEXT, flexShrink: 1 },
});
