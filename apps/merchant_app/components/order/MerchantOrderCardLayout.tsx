import { useMemo, useState, type ReactNode } from "react";
import { View, Text, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { OrderRecord, LineItem } from "@/hooks/useOrders";
import {
  MerchantOrderCardToolbar,
  MerchantOrderIdRow,
} from "@/components/order/MerchantOrderCardToolbar";
import { OrderCardItemRow } from "@/components/order/OrderCardItemRow";
import { OrderCardMerchantInstructions } from "@/components/order/OrderCardMerchantInstructions";
import { sliceOrderLineItems } from "@/lib/orderCardDisplay";
import { formatOrderCardCustomerLabel } from "@/components/order/orderFormatters";
import { merchantOrderCardLayoutStyles as styles } from "@/components/order/merchantOrderCardLayoutStyles";

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
  onMenu?: () => void;
  headerRight?: ReactNode;
  headerBelow?: ReactNode;
  outerBanner?: ReactNode;
  showInstructions?: boolean;
  midContent?: ReactNode;
  riderContent?: ReactNode;
  footer?: ReactNode;
  detailsDefaultOpen?: boolean;
  showRider?: boolean;
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
  onMenu,
  headerRight,
  headerBelow,
  outerBanner,
  showInstructions = true,
  midContent,
  riderContent,
  footer,
  detailsDefaultOpen = true,
  showRider = true,
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

  const openDetail = () => onViewDetail?.();

  return (
    <View style={styles.wrap}>
      {outerBanner}

      <View style={[styles.card, outerBanner ? styles.cardUnderBanner : null]}>
        <View style={styles.headerRow}>
          <View style={styles.headerLeft}>
            <MerchantOrderIdRow
              formattedOrderId={order.formattedOrderId}
              fallbackOrderId={order.ordersCoreId}
            />
            {storeName ? (
              <Text style={styles.storeName} numberOfLines={1}>
                {storeName}
              </Text>
            ) : null}
          </View>
          {headerRight ??
            (showToolbar ? (
              <MerchantOrderCardToolbar
                onSpeak={() => onSpeak?.()}
                onMenu={() => onMenu?.()}
                speakingActive={speakingActive}
              />
            ) : null)}
        </View>

        {headerBelow}

        <Pressable
          onPress={() => (onCustomerPress ? onCustomerPress() : openDetail())}
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
                <OrderCardItemRow
                  key={`${order.id}-${idx}`}
                  item={item}
                  orderVeg={order.vegNonVeg}
                  onItemNamePress={() => onItemPress?.(item)}
                  onRowPress={openDetail}
                />
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
            deliveryInstructions={order.deliveryInstructions}
            style={styles.instructionsMargin}
          />
        ) : null}

        <View style={styles.section}>
          <Pressable onPress={() => setBillOpen((v) => !v)} style={styles.sectionHead}>
            <Ionicons name="receipt-outline" size={18} color="#444444" />
            <Text style={styles.sectionTitle}>Total bill</Text>
            <Text style={styles.billAmount}>₹{Math.round(order.total)}</Text>
            <Ionicons
              name={billOpen ? "chevron-up" : "chevron-down"}
              size={18}
              color="#666666"
            />
          </Pressable>
          {billOpen ? (
            <View style={styles.billBreakdown}>
              {order.lineItems.map((item, idx) => (
                <Pressable
                  key={`bill-${idx}`}
                  onPress={() => onItemPress?.(item)}
                  style={({ pressed }) => [styles.billRow, pressed && styles.pressed]}
                >
                  <Text style={styles.billItemLabel}>
                    {item.qty} x {item.name}
                  </Text>
                  <Text style={styles.billItemValue}>₹{item.price}</Text>
                </Pressable>
              ))}
            </View>
          ) : null}
        </View>

        {midContent}

        {showRider
          ? riderContent ?? (
              <View style={styles.riderRow}>
                <View style={styles.riderAvatar}>
                  <Ionicons name="bicycle" size={16} color="#888888" />
                </View>
                <Text style={styles.riderText}>Assigning delivery partner…</Text>
              </View>
            )
          : null}

        {footer ? <View style={styles.footer}>{footer}</View> : null}
      </View>
    </View>
  );
}
