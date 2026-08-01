import { useCallback, useMemo, useRef, useState, type ReactNode } from "react";
import { AppText as Text } from "@/components/AppText";
import { View, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { OrderRecord, LineItem } from "@/hooks/useOrders";
import {
  MerchantOrderCardToolbar,
  MerchantOrderIdRow,
} from "@/components/order/MerchantOrderCardToolbar";
import { OrderCardItemRow } from "@/components/order/OrderCardItemRow";
import { OrderLineAddImagePrompt } from "@/components/order/OrderLineAddImagePrompt";
import { OrderCardMerchantInstructions } from "@/components/order/OrderCardMerchantInstructions";
import { sliceOrderLineItems } from "@/lib/orderCardDisplay";
import { formatOrderCardCustomerLabel } from "@/components/order/orderFormatters";
import { formatMerchantRs } from "@/lib/merchant-line-total";
import { merchantOrderCardLayoutStyles as styles } from "@/components/order/merchantOrderCardLayoutStyles";
import { MerchantOrderBillBreakdown } from "@/components/order/MerchantOrderBillBreakdown";
import { MerchantAssignedRiderRow } from "@/components/order/MerchantAssignedRiderRow";
import { orderHasAssignedRider, riderStatusLabelFromOrder } from "@/lib/orderAssignedRider";

export type MerchantOrderCardLayoutProps = {
  order: OrderRecord;
  storeName?: string | null;
  placedAt: string;
  onViewDetail?: () => void;
  onItemPress?: (item: LineItem) => void;
  onCustomerPress?: () => void;
  showToolbar?: boolean;
  speakingActive?: boolean;
  onSpeak?: () => void;
  onPrint?: () => void;
  onMenu?: () => void;
  headerRight?: ReactNode;
  headerBelow?: ReactNode;
  outerBanner?: ReactNode;
  statusBadge?: ReactNode;
  showInstructions?: boolean;
  midContent?: ReactNode;
  riderContent?: ReactNode;
  footer?: ReactNode;
  detailsDefaultOpen?: boolean;
  showRider?: boolean;
  /**
   * Completed cards: tap anywhere on the card opens order details.
   * Details / Total bill section heads still only expand/collapse.
   */
  pressCardOpensDetail?: boolean;
  /**
   * Preparing/accepted cards: show Zomato-style “Add photo” under line items
   * that have no menu image yet (admin must approve before live).
   */
  showAddImagePrompt?: boolean;
};

export function MerchantOrderCardLayout({
  order,
  storeName,
  placedAt,
  onViewDetail,
  onItemPress,
  onCustomerPress,
  showToolbar = true,
  speakingActive,
  onSpeak,
  onPrint,
  onMenu,
  headerRight,
  headerBelow,
  outerBanner,
  statusBadge,
  showInstructions = true,
  midContent,
  riderContent,
  footer,
  detailsDefaultOpen = true,
  showRider = true,
  pressCardOpensDetail = false,
  showAddImagePrompt = false,
}: MerchantOrderCardLayoutProps) {
  const [detailsOpen, setDetailsOpen] = useState(detailsDefaultOpen);
  const [billOpen, setBillOpen] = useState(false);

  const itemCount = useMemo(
    () => order.lineItems.reduce((sum, it) => sum + it.qty, 0),
    [order.lineItems]
  );
  const { visible: visibleItems, moreCount } = useMemo(
    () => sliceOrderLineItems(order.lineItems),
    [order.lineItems]
  );

  const customerLabel = useMemo(
    () =>
      formatOrderCardCustomerLabel(order.customerName, order.customerStoreOrderOrdinal),
    [order.customerName, order.customerStoreOrderOrdinal]
  );

  const defaultRiderContent =
    order.deliveryType === "GATIMITRA_RIDER" ? (
      orderHasAssignedRider(order) ? (
        <MerchantAssignedRiderRow order={order} />
      ) : (
        <View style={styles.riderRow}>
          <View style={styles.riderAvatar}>
            <Ionicons name="bicycle" size={16} color="#888888" />
          </View>
          <Text style={styles.riderText}>{riderStatusLabelFromOrder(order)}</Text>
        </View>
      )
    ) : null;

  const detailNavLockRef = useRef(false);
  const openDetail = useCallback(() => {
    if (!onViewDetail || detailNavLockRef.current) return;
    detailNavLockRef.current = true;
    onViewDetail();
    setTimeout(() => {
      detailNavLockRef.current = false;
    }, 900);
  }, [onViewDetail]);

  const toolbar =
    headerRight ??
    (showToolbar ? (
      <MerchantOrderCardToolbar
        onPrint={onPrint ? () => onPrint() : undefined}
        onSpeak={() => onSpeak?.()}
        onMenu={() => onMenu?.()}
        speakingActive={speakingActive}
      />
    ) : null);

  const cardOpensDetail = pressCardOpensDetail && Boolean(onViewDetail);
  const CardShell = cardOpensDetail ? Pressable : View;
  const cardShellProps = cardOpensDetail
    ? {
        onPress: openDetail,
        accessibilityRole: "button" as const,
        accessibilityLabel: "Open order details",
      }
    : {};

  return (
    <View style={styles.wrap}>
      {outerBanner}

      <CardShell
        {...cardShellProps}
        style={[styles.card, outerBanner ? styles.cardUnderBanner : null]}
      >
        {statusBadge ? (
          <View style={styles.statusBadgeRow}>
            <View style={styles.statusBadgeLeft}>{statusBadge}</View>
            {toolbar}
          </View>
        ) : null}
        <View style={[styles.headerRow, statusBadge ? styles.headerRowAfterBadge : null]}>
          <Pressable
            onPress={openDetail}
            disabled={!onViewDetail}
            style={({ pressed }) => [
              styles.headerLeft,
              pressed && onViewDetail ? styles.pressed : null,
            ]}
            accessibilityRole={onViewDetail ? "button" : undefined}
            accessibilityLabel={onViewDetail ? "Open order details" : undefined}
          >
            <MerchantOrderIdRow
              formattedOrderId={order.formattedOrderId}
              fallbackOrderId={order.ordersCoreId}
            />
            {storeName ? (
              <Text style={styles.storeName} numberOfLines={1}>
                {storeName}
              </Text>
            ) : null}
          </Pressable>
          {!statusBadge ? toolbar : null}
        </View>

        {headerBelow}

        <Pressable
          onPress={() =>
            cardOpensDetail
              ? openDetail()
              : onCustomerPress
                ? onCustomerPress()
                : openDetail()
          }
          style={({ pressed }) => [styles.customerRow, pressed && styles.pressed]}
        >
          <Text style={styles.customerLabel} numberOfLines={2}>
            {customerLabel}
          </Text>
          <Text style={styles.placedAt}>{placedAt}</Text>
        </Pressable>

        <View style={styles.section}>
          <Pressable onPress={() => setDetailsOpen((v) => !v)} style={styles.sectionHead}>
            <Ionicons name="bag-handle-outline" size={18} color="#444444" />
            <Text style={styles.sectionTitle}>Details</Text>
            <Text style={styles.sectionMeta}>
              {itemCount} {itemCount === 1 ? "item" : "items"}
            </Text>
            <Ionicons
              name={detailsOpen ? "chevron-up" : "chevron-down"}
              size={18}
              color="#666666"
            />
          </Pressable>
          {detailsOpen ? (
            <View style={styles.itemsBox}>
              {visibleItems.map((item, idx) => (
                <View key={`${order.id}-${idx}`}>
                  <OrderCardItemRow
                    item={item}
                    orderVeg={order.vegNonVeg}
                    onItemNamePress={() => onItemPress?.(item)}
                    onRowPress={openDetail}
                  />
                  {showAddImagePrompt ? (
                    <OrderLineAddImagePrompt item={item} enabled />
                  ) : null}
                </View>
              ))}
              {moreCount > 0 ? (
                <Pressable onPress={openDetail}>
                  <Text style={styles.moreItems}>+{moreCount} more</Text>
                </Pressable>
              ) : null}
            </View>
          ) : null}
        </View>

        {showInstructions ? (
          <OrderCardMerchantInstructions
            merchantInstructionsList={order.merchantInstructionsList}
            requiresUtensils={order.requiresUtensils}
            style={styles.instructionsMargin}
          />
        ) : null}

        <View style={styles.section}>
          <Pressable onPress={() => setBillOpen((v) => !v)} style={styles.billSectionHead}>
            <Ionicons name="receipt-outline" size={18} color="#444444" />
            <Text style={styles.sectionTitle}>Total bill</Text>
            <Text style={styles.billAmount}>{formatMerchantRs(order.total)}</Text>
            <Ionicons
              name={billOpen ? "chevron-up" : "chevron-down"}
              size={18}
              color="#666666"
            />
          </Pressable>
          {billOpen ? <MerchantOrderBillBreakdown order={order} /> : null}
        </View>

        {midContent}

        {showRider ? riderContent ?? defaultRiderContent : null}

        {footer ? (
          <View
            style={styles.footer}
            onStartShouldSetResponder={() => true}
            onMoveShouldSetResponder={() => true}
          >
            {footer}
          </View>
        ) : null}
      </CardShell>
    </View>
  );
}
