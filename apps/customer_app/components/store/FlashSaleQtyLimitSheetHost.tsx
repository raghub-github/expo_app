/**
 * Root overlay host for Flash Sale qty-limit sheet.
 * Mounted above tab bar / floating cart so footer CTAs cannot be covered.
 */

import { useEffect } from "react";
import { View, StyleSheet } from "react-native";
import { FlashSaleQtyLimitSheet } from "@/components/store/FlashSaleQtyLimitSheet";
import { useFlashSaleQtyLimitSheetStore } from "@/store/flashSaleQtyLimitSheetStore";
import { useFlashSaleQtyLimitAckStore } from "@/store/flashSaleQtyLimitAckStore";
import { useCartStore } from "@/store/cartStore";
import { computeFlashSaleSplitPricing } from "@/lib/itemOfferDisplay";

export function FlashSaleQtyLimitSheetHost() {
  const payload = useFlashSaleQtyLimitSheetStore((s) => s.payload);
  const handlers = useFlashSaleQtyLimitSheetStore((s) => s.handlers);
  const close = useFlashSaleQtyLimitSheetStore((s) => s.close);
  const setQuantity = useFlashSaleQtyLimitSheetStore((s) => s.setQuantity);

  const lineQty = useCartStore((s) => {
    const lineId = payload?.lineId;
    if (!lineId) return 0;
    return s.items.find((i) => i.lineId === lineId)?.quantity ?? 0;
  });

  const lineUnitPrice = useCartStore((s) => {
    const lineId = payload?.lineId;
    if (!lineId) return payload?.unitPrice ?? 0;
    return s.items.find((i) => i.lineId === lineId)?.price ?? payload?.unitPrice ?? 0;
  });

  useEffect(() => {
    if (!payload) return;
    if (lineQty !== payload.quantity) setQuantity(lineQty);
  }, [lineQty, payload, setQuantity]);

  if (!payload || !handlers) return null;

  const quantity = lineQty > 0 ? lineQty : payload.quantity;
  const flashUnit = lineUnitPrice > 0 ? lineUnitPrice : payload.unitPrice;
  const regularUnit =
    payload.regularUnit > flashUnit ? payload.regularUnit : Math.max(payload.regularUnit, flashUnit);
  const split = computeFlashSaleSplitPricing({
    quantity,
    flashUnit,
    regularUnit,
    maxFlashQuantity: payload.maxFlashQuantity,
  });

  const markAckedAndClose = () => {
    useFlashSaleQtyLimitAckStore.getState().markAcked(payload.lineId);
    handlers.onGotIt();
    close();
  };

  return (
    <View style={styles.host} pointerEvents="box-none" collapsable={false}>
      <FlashSaleQtyLimitSheet
        visible
        maxFlashQuantity={payload.maxFlashQuantity}
        itemName={payload.itemName}
        itemSubtitle={payload.itemSubtitle}
        imageUri={payload.imageUri}
        diet={payload.diet}
        quantity={quantity}
        lineTotal={split.lineTotal}
        onGotIt={markAckedAndClose}
        onWantMore={handlers.onWantMore}
        onIncrement={handlers.onIncrement}
        onDecrement={handlers.onDecrement}
        onClose={() => {
          useFlashSaleQtyLimitAckStore.getState().markAcked(payload.lineId);
          close();
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  host: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 400,
    elevation: 400,
  },
});
