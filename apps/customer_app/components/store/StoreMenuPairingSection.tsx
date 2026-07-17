import React, { useMemo, useState } from "react";
import { AppText } from "@/components/AppText";

import { View, ScrollView, StyleSheet } from "react-native";
import { Image } from "expo-image";
import type { MenuItem } from "@/services/merchant.service";
import { StoreTheme } from "@/constants/storeTheme";
import { DietIndicator } from "./DietIndicator";
import { MenuItemImagePlaceholder } from "./MenuItemImagePlaceholder";
import { StoreMenuInstantCartControl } from "./StoreMenuCartControls";
import { getItemDiet, getSellingPrice } from "./storeMenuUtils";
import { toAbsoluteImageUrl } from "@/utils/mediaUrl";
import { useMenuItemCartQty } from "@/hooks/useMenuItemCartQty";

export const PAIRING_SECTION_TITLE = "Perfect with your favourite side";

const CARD_W = 132;
const IMAGE_H = 88;

export type StoreMenuPairingSectionProps = {
  companions: MenuItem[];
  merchantId: string;
  onAdd: (item: MenuItem) => void;
  onIncrement: (itemId: string, menuItemId?: number) => void;
  onDecrement: (itemId: string, menuItemId?: number) => void;
  isStoreClosed?: boolean;
  showDivider?: boolean;
};

function PairingCard({
  item,
  merchantId,
  onAdd,
  onIncrement,
  onDecrement,
  isStoreClosed,
}: {
  item: MenuItem;
  merchantId: string;
  onAdd: (item: MenuItem) => void;
  onIncrement: (itemId: string, menuItemId?: number) => void;
  onDecrement: (itemId: string, menuItemId?: number) => void;
  isStoreClosed: boolean;
}) {
  const cartQty = useMenuItemCartQty(item.id, item.menuItemId, merchantId);
  const [imageFailed, setImageFailed] = useState(false);
  const imageUri = useMemo(() => {
    const raw = item.imageUrl?.trim();
    if (!raw) return null;
    return toAbsoluteImageUrl(raw) ?? raw;
  }, [item.imageUrl]);
  const diet = getItemDiet(item);
  const price = getSellingPrice(item);
  const showImage = !!imageUri && !imageFailed;
  const isCustomisable = !!(item.hasVariants || item.hasAddons || item.hasCustomizations);

  return (
    <View style={styles.card}>
      <View style={styles.imageStack}>
        <View style={styles.imageWrap}>
          {showImage ? (
            <Image
              source={{ uri: imageUri! }}
              style={styles.image}
              contentFit="cover"
              cachePolicy="memory-disk"
              transition={0}
              onError={() => setImageFailed(true)}
            />
          ) : (
            <MenuItemImagePlaceholder size="sm" />
          )}
          <View style={styles.dietBadge}>
            <DietIndicator type={diet} />
          </View>
        </View>
        <View style={styles.addSlot}>
          <StoreMenuInstantCartControl
            itemKey={`${merchantId}:${item.listRowKey ?? item.id}`}
            quantity={cartQty}
            disabled={isStoreClosed}
            onAdd={() => onAdd(item)}
            onIncrement={() => onIncrement(item.id, item.menuItemId)}
            onDecrement={() => onDecrement(item.id, item.menuItemId)}
            accessibilityLabel={`${item.name} quantity`}
          />
        </View>
      </View>
      <AppText style={styles.name} numberOfLines={2}>
        {item.name}
      </AppText>
      <AppText style={styles.price}>₹{Math.round(price)}</AppText>
    </View>
  );
}

export const StoreMenuPairingSection = React.memo(function StoreMenuPairingSection({
  companions,
  merchantId,
  onAdd,
  onIncrement,
  onDecrement,
  isStoreClosed = false,
  showDivider = true,
}: StoreMenuPairingSectionProps) {
  if (companions.length === 0) return null;

  return (
    <View style={styles.wrap}>
      <AppText style={styles.title}>{PAIRING_SECTION_TITLE}</AppText>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="always"
      >
        {companions.map((item) => (
          <PairingCard
            key={item.id}
            item={item}
            merchantId={merchantId}
            onAdd={onAdd}
            onIncrement={onIncrement}
            onDecrement={onDecrement}
            isStoreClosed={isStoreClosed}
          />
        ))}
      </ScrollView>
      {showDivider ? <View style={styles.divider} /> : null}
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: {
    paddingTop: 4,
    paddingBottom: 6,
    backgroundColor: StoreTheme.background,
  },
  title: {
    fontSize: 16,
    fontWeight: "800",
    color: StoreTheme.textPrimary,
    letterSpacing: -0.3,
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  scrollContent: {
    paddingHorizontal: 16,
    gap: 12,
    paddingRight: 20,
  },
  card: {
    width: CARD_W,
  },
  imageStack: {
    width: CARD_W,
    alignItems: "stretch",
    marginBottom: 8,
  },
  imageWrap: {
    width: CARD_W,
    height: IMAGE_H,
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: "#F3F4F6",
  },
  image: {
    width: "100%",
    height: "100%",
  },
  dietBadge: {
    position: "absolute",
    left: 6,
    bottom: 6,
    backgroundColor: "rgba(255,255,255,0.92)",
    borderRadius: 4,
    padding: 2,
  },
  addSlot: {
    marginTop: 6,
    width: "100%",
    zIndex: 4,
    elevation: 4,
  },
  name: {
    fontSize: 13,
    fontWeight: "700",
    color: StoreTheme.textPrimary,
    lineHeight: 17,
    minHeight: 34,
  },
  price: {
    marginTop: 2,
    fontSize: 13,
    fontWeight: "700",
    color: StoreTheme.textPrimary,
  },
  divider: {
    marginTop: 16,
    marginHorizontal: 16,
    borderBottomWidth: 1,
    borderStyle: "dotted",
    borderColor: StoreTheme.borderDotted,
  },
});
