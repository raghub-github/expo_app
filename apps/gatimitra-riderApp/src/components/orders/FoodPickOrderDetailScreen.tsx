import React, { useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Pressable,
  ScrollView,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { resolveRiderBottomInset } from "@/src/hooks/useRiderBottomInset";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { DismissibleBottomSheetShell } from "@/src/components/language/DismissibleBottomSheetShell";
import { FoodSlideToReachStore } from "@/src/components/orders/FoodSlideToReachStore";
import { useEffectivePickupTimerStart } from "@/src/hooks/useEffectivePickupTimerStart";
import { useLiveSecondTicker } from "@/src/hooks/useLiveSecondTicker";
import {
  foodPrepCountdownFromOrder,
  formatDurationHhMmSs,
  formatPrepDelayedLabel,
  isFoodPrepDelayed,
  prepOverdueSeconds,
} from "@/src/lib/food-prep-delay";
import {
  formatPickupCountdownMmSs,
  PICKUP_TIMER_BUDGET_SECONDS,
  resolvePickupCountdownSeconds,
  resolvePickupSheetTimerMode,
  resolvePickupWaitSeconds,
} from "@/src/lib/food-pickup-wait";
import { colors } from "@/src/theme";
import { formatHistoryAddressLabel } from "@/src/lib/rider-ride-history-display";
import type { RiderOrderSummary } from "@/src/services/api/riderApi";

const REF_GREEN = colors.success[600];
const REF_BLUE = "#1A73E8";

type Props = {
  visible: boolean;
  order: RiderOrderSummary;
  orderIdLabel: string;
  restaurantName: string;
  restaurantAddress: string;
  merchantReady: boolean;
  onBack: () => void;
  onCall: () => void;
  onCallCustomer?: () => void;
  onHelp: () => void;
  onPickedOrder: () => void;
  pickUpLoading?: boolean;
};

type DetailSheetKind = "customer" | "merchant" | "items" | null;

const PREVIEW_ITEM_LIMIT = 6;
/** Partnersite FormattedOrderId — last 4 digits scale up per digit (lg sizes, mobile). */
const ORDER_ID_SUFFIX_DIGIT_SIZES = [17, 19, 21, 23];

function splitOrderIdParts(id: string): { prefix: string; suffix: string } {
  const trimmed = id.trim();
  if (trimmed.length <= 4) {
    return { prefix: "", suffix: trimmed };
  }
  return {
    prefix: trimmed.slice(0, -4),
    suffix: trimmed.slice(-4),
  };
}

function OrderIdHighlight({ orderId }: { orderId: string }) {
  const { prefix, suffix } = splitOrderIdParts(orderId);
  return (
    <View style={styles.orderIdValueRow}>
      {prefix ? <Text style={styles.orderIdPrefix}>{prefix}</Text> : null}
      <View style={styles.orderIdSuffixGroup}>
        {suffix.split("").map((digit, idx) => (
          <Text
            key={`order-id-digit-${idx}`}
            style={[
              styles.orderIdSuffixDigit,
              {
                fontSize:
                  ORDER_ID_SUFFIX_DIGIT_SIZES[idx] ??
                  ORDER_ID_SUFFIX_DIGIT_SIZES[ORDER_ID_SUFFIX_DIGIT_SIZES.length - 1],
              },
            ]}
          >
            {digit}
          </Text>
        ))}
      </View>
    </View>
  );
}

type FoodItem = NonNullable<RiderOrderSummary["foodItems"]>[number];

type AllItemsSheetProps = {
  visible: boolean;
  items: FoodItem[];
  itemCount: number;
  fallbackLine: string;
  specialNotes: string[];
  onDismiss: () => void;
};

function AllItemsSheet({
  visible,
  items,
  itemCount,
  fallbackLine,
  specialNotes,
  onDismiss,
}: AllItemsSheetProps) {
  const { t } = useTranslation();

  return (
    <DismissibleBottomSheetShell visible={visible} onDismiss={onDismiss} maxHeightRatio={0.72}>
      <View style={styles.sheetContent}>
        <View style={styles.sheetHeader}>
          <View style={styles.sheetTitleRow}>
            <View style={[styles.sheetIconWrap, styles.sheetIconWrapGreen]}>
              <Ionicons name="fast-food-outline" size={20} color={REF_GREEN} />
            </View>
            <View style={styles.sheetTitleCol}>
              <Text style={styles.sheetTitle}>
                {t("orders.activeFood.allOrderItems", "All order items")}
              </Text>
              <Text style={styles.sheetSubtitle}>
                {t("orders.activeFood.totalItemsCount", "{{count}} items total", {
                  count: itemCount,
                })}
              </Text>
            </View>
          </View>
          <Pressable onPress={onDismiss} hitSlop={10} style={styles.sheetCloseBtn}>
            <Ionicons name="close" size={22} color="#5F6368" />
          </Pressable>
        </View>

        <View style={styles.allItemsPanel}>
          {items.length > 0 ? (
            items.map((item, idx) => {
              const label = item.variantName
                ? `${item.quantity} x ${item.name} (${item.variantName})`
                : `${item.quantity} x ${item.name}`;
              return (
                <View key={`${item.name}-${idx}`} style={styles.itemRow}>
                  <View style={styles.itemBullet} />
                  <Text style={styles.itemLine}>{label}</Text>
                </View>
              );
            })
          ) : (
            <View style={styles.itemRow}>
              <View style={styles.itemBullet} />
              <Text style={styles.itemLine}>{fallbackLine}</Text>
            </View>
          )}
        </View>

        {specialNotes.length > 0 ? (
          <View style={styles.instructionBar}>
            <Ionicons name="information-circle" size={16} color={REF_GREEN} />
            <Text style={styles.instructionText}>{specialNotes.join(" | ")}</Text>
          </View>
        ) : null}
      </View>
    </DismissibleBottomSheetShell>
  );
}

function formatItemLabel(item: FoodItem): string {
  return item.variantName
    ? `${item.quantity} x ${item.name} (${item.variantName})`
    : `${item.quantity} x ${item.name}`;
}

type ContactDetailSheetProps = {
  visible: boolean;
  kind: "customer" | "merchant";
  title: string;
  name: string;
  phone?: string;
  address?: string;
  onDismiss: () => void;
  onCall?: () => void;
};

function ContactDetailSheet({
  visible,
  kind,
  title,
  name,
  phone,
  address,
  onDismiss,
  onCall,
}: ContactDetailSheetProps) {
  const { t } = useTranslation();
  const icon = kind === "customer" ? "person-outline" : "storefront-outline";

  return (
    <DismissibleBottomSheetShell
      visible={visible}
      onDismiss={onDismiss}
      maxHeightRatio={kind === "merchant" ? 0.72 : 0.55}
    >
      <View style={styles.sheetContent}>
        <View style={styles.sheetHeader}>
          <View style={styles.sheetTitleRow}>
            <View style={styles.sheetIconWrap}>
              <Ionicons name={icon} size={20} color={REF_BLUE} />
            </View>
            <Text style={styles.sheetTitle}>{title}</Text>
          </View>
          <Pressable onPress={onDismiss} hitSlop={10} style={styles.sheetCloseBtn}>
            <Ionicons name="close" size={22} color="#5F6368" />
          </Pressable>
        </View>

        <View style={styles.sheetBody}>
          <View style={styles.sheetField}>
            <Text style={styles.sheetFieldLabel}>
              {kind === "customer"
                ? t("orders.activeFood.customerNameLabel", "Name")
                : t("orders.activeFood.restaurantNameLabel", "Restaurant")}
            </Text>
            <Text style={styles.sheetFieldValue}>{name}</Text>
          </View>

          {phone ? (
            <View style={styles.sheetField}>
              <Text style={styles.sheetFieldLabel}>
                {t("orders.activeFood.phoneLabel", "Phone")}
              </Text>
              <Text style={styles.sheetFieldValue}>{phone}</Text>
            </View>
          ) : null}

          {address ? (
            <View style={styles.sheetField}>
              <Text style={styles.sheetFieldLabel}>
                {t("orders.activeFood.addressLabel", "Address")}
              </Text>
              <Text style={styles.sheetFieldValueMuted}>{address}</Text>
            </View>
          ) : null}
        </View>

        {phone && onCall ? (
          <Pressable
            onPress={onCall}
            style={({ pressed }) => [styles.sheetCallBtn, pressed && styles.sheetCallBtnPressed]}
          >
            <Ionicons name="call-outline" size={18} color="#ffffff" />
            <Text style={styles.sheetCallBtnText}>
              {t("orders.activeFood.callNow", "Call now")}
            </Text>
          </Pressable>
        ) : null}
      </View>
    </DismissibleBottomSheetShell>
  );
}

export function FoodPickOrderDetailScreen({
  visible,
  order,
  orderIdLabel,
  restaurantName,
  restaurantAddress,
  merchantReady,
  onBack,
  onCall,
  onCallCustomer,
  onHelp,
  onPickedOrder,
  pickUpLoading = false,
}: Props) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const bottomInset = resolveRiderBottomInset(insets.bottom);

  const timerMode = useMemo(() => {
    const mode = resolvePickupSheetTimerMode(order, merchantReady);
    if (mode === "none" && merchantReady && order.pickupWaitStartedAt) {
      return "pickup";
    }
    return mode;
  }, [order, merchantReady]);

  const effectivePickupTimerStart = useEffectivePickupTimerStart(
    orderIdLabel,
    order,
    merchantReady,
    timerMode
  );

  const nowMs = useLiveSecondTicker(timerMode !== "none" || visible);
  const [orderDetailsOpen, setOrderDetailsOpen] = useState(true);
  const [detailSheet, setDetailSheet] = useState<DetailSheetKind>(null);

  const prepOrder = useMemo(() => foodPrepCountdownFromOrder(order), [order]);
  const prepDelayed = isFoodPrepDelayed(prepOrder, nowMs, merchantReady);
  const overdueSec = prepDelayed ? prepOverdueSeconds(prepOrder, nowMs) : 0;
  const pickupWaitSec = resolvePickupWaitSeconds(
    order.pickupWaitStartedAt,
    timerMode === "waiting" ? null : order.pickupWaitSeconds,
    nowMs
  );
  const pickupCountdownSec = resolvePickupCountdownSeconds(
    effectivePickupTimerStart,
    order.pickupTimerBudgetSeconds ?? PICKUP_TIMER_BUDGET_SECONDS,
    nowMs
  );
  const timerDisplay =
    timerMode === "pickup"
      ? formatPickupCountdownMmSs(pickupCountdownSec)
      : formatDurationHhMmSs(pickupWaitSec);

  const items = order.foodItems ?? [];
  const itemCount = order.itemCount ?? items.length;
  const previewItems = items.slice(0, PREVIEW_ITEM_LIMIT);
  const hasMoreItems =
    itemCount > PREVIEW_ITEM_LIMIT || items.length > PREVIEW_ITEM_LIMIT;
  const firstItemName = items[0]?.name?.trim() || restaurantName;
  const orderSummaryLine = `${String(itemCount).padStart(2, "0")} item${itemCount === 1 ? "" : "s"} - ${firstItemName}`;

  const specialNotes = useMemo(() => {
    const parts: string[] = [];
    if (order.requiresUtensils === false) {
      parts.push(
        t("orders.activeFood.noCutlery", "Don't send cutlery, tissues and straws")
      );
    }
    if (order.deliveryInstructions?.trim()) {
      parts.push(order.deliveryInstructions.trim());
    }
    return parts;
  }, [order.requiresUtensils, order.deliveryInstructions, t]);

  const customerName =
    order.customerName?.trim() || t("orders.activeFood.customerFallback", "Customer");
  const customerPhone = order.customerPhone?.trim();
  const restaurantPhone = order.restaurantPhone?.trim();
  const customerAddress = order.delivery?.address?.trim();
  const merchantFullAddress = formatHistoryAddressLabel(
    [order.pickup?.address, order.pickupAddressGeocoded],
    restaurantName
  );

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      statusBarTranslucent
      onRequestClose={onBack}
    >
      <View style={styles.root}>
        <View style={[styles.topSafe, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <Pressable onPress={onBack} hitSlop={10} style={styles.headerIconBtn}>
            <Ionicons name="arrow-back" size={22} color="#202124" />
          </Pressable>
          <Text style={styles.headerTitle}>
            {t("orders.activeFood.pickOrderHeader", "Pick order")}
          </Text>
          <View style={styles.headerActions}>
            <Pressable onPress={onHelp} hitSlop={8} style={styles.headerIconBtn}>
              <Ionicons name="help-circle-outline" size={22} color="#202124" />
            </Pressable>
            <Pressable onPress={onHelp} hitSlop={8} style={styles.headerIconBtn}>
              <Ionicons name="chatbubble-ellipses-outline" size={21} color="#202124" />
            </Pressable>
            <Pressable onPress={onCall} hitSlop={8} style={styles.headerIconBtn}>
              <Ionicons name="call-outline" size={21} color="#202124" />
            </Pressable>
          </View>
        </View>

        {prepDelayed ? (
          <View style={styles.delayBanner}>
            <Ionicons name="hourglass-outline" size={14} color="#ffffff" />
            <Text style={styles.delayBannerText}>{formatPrepDelayedLabel(overdueSec)}</Text>
          </View>
        ) : null}
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <Pressable
            style={styles.statusCard}
            onPress={() => setOrderDetailsOpen(true)}
          >
            <View style={[styles.statusTimerBox, prepDelayed && styles.statusTimerDelayed]}>
              <Ionicons name="stopwatch-outline" size={14} color="#ffffff" />
              <Text style={styles.statusTimerText}>{timerDisplay}</Text>
            </View>
            <View style={styles.statusTextCol}>
              <Text style={styles.statusHeadline}>
                {merchantReady
                  ? t("orders.activeFood.orderReadyBanner", "Order is ready, click here...")
                  : t("orders.activeFood.underPreparation", "Order is under preparation")}
              </Text>
              <Text style={styles.statusSub} numberOfLines={2}>
                {merchantReady
                  ? t("orders.activeFood.verifyBeforePickup", "Verify order details before pickup")
                  : t(
                      "orders.activeFood.waitUntilReady",
                      "Please wait until the restaurant marks the order ready."
                    )}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#9AA0A6" />
          </Pressable>

          <View style={styles.orderIdCard}>
            <View style={styles.orderIdLeft}>
              <Text style={styles.orderIdLabel}>
                {t("orders.activeFood.orderIdCaps", "ORDER ID")}
              </Text>
              <OrderIdHighlight orderId={orderIdLabel} />
            </View>
            <View style={styles.deliveryBadge}>
              <Ionicons name="home-outline" size={13} color={REF_GREEN} />
              <Text style={styles.deliveryBadgeText}>
                {t("orders.activeFood.foodDeliveryBadge", "Food Delivery")}
              </Text>
            </View>
          </View>

          <View style={styles.orderDetailsCard}>
            <View style={styles.orderDetailsHeader}>
              <Pressable
                style={styles.orderDetailsHeaderMain}
                onPress={() => setOrderDetailsOpen((v) => !v)}
              >
                <Ionicons name="document-text-outline" size={20} color={REF_GREEN} />
                <View style={styles.orderDetailsTitleCol}>
                  <Text style={styles.orderDetailsTitle}>
                    {t("orders.activeFood.orderDetails", "Order details")}
                  </Text>
                  <Text style={styles.orderItemCount}>
                    {t("orders.activeFood.totalItemsCount", "{{count}} items total", {
                      count: itemCount,
                    })}
                  </Text>
                </View>
              </Pressable>
              {hasMoreItems ? (
                <Pressable
                  onPress={() => setDetailSheet("items")}
                  hitSlop={8}
                  style={({ pressed }) => [styles.viewAllBtn, pressed && styles.viewAllBtnPressed]}
                >
                  <Text style={styles.viewAllBtnText}>
                    {t("orders.activeFood.viewAllItems", "View all")}
                  </Text>
                </Pressable>
              ) : null}
              <Pressable onPress={() => setOrderDetailsOpen((v) => !v)} hitSlop={8}>
                <Ionicons
                  name={orderDetailsOpen ? "chevron-up" : "chevron-down"}
                  size={18}
                  color={REF_GREEN}
                />
              </Pressable>
            </View>

            {orderDetailsOpen ? (
              <View style={styles.itemsPanel}>
                <View style={styles.itemsList}>
                  {previewItems.length > 0 ? (
                    previewItems.map((item, idx) => (
                      <View key={`${item.name}-${idx}`} style={styles.itemRow}>
                        <View style={styles.itemBullet} />
                        <Text style={styles.itemLine}>{formatItemLabel(item)}</Text>
                      </View>
                    ))
                  ) : (
                    <View style={styles.itemRow}>
                      <View style={styles.itemBullet} />
                      <Text style={styles.itemLine}>{orderSummaryLine}</Text>
                    </View>
                  )}
                  {hasMoreItems ? (
                    <Text style={styles.moreItemsHint}>
                      {t(
                        "orders.activeFood.moreItemsHint",
                        "+{{count}} more — tap View all to see all {{total}} items",
                        {
                          count: Math.max(itemCount, items.length) - PREVIEW_ITEM_LIMIT,
                          total: itemCount,
                        }
                      )}
                    </Text>
                  ) : null}
                </View>

                {specialNotes.length > 0 ? (
                  <View style={styles.instructionBar}>
                    <Ionicons name="information-circle" size={16} color={REF_GREEN} />
                    <Text style={styles.instructionText}>{specialNotes.join(" | ")}</Text>
                  </View>
                ) : null}
              </View>
            ) : (
              <Text style={styles.orderDetailsCollapsed} numberOfLines={1}>
                {orderSummaryLine}
              </Text>
            )}
          </View>

          <Pressable
            style={styles.linkCard}
            onPress={() => setDetailSheet("customer")}
          >
            <Ionicons name="person-outline" size={20} color="#5F6368" />
            <View style={styles.linkCardText}>
              <Text style={styles.linkCardTitle}>
                {t("orders.activeFood.customerDetails", "Customer details")}
              </Text>
              <Text style={styles.linkCardSummary} numberOfLines={1}>
                {customerName}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#9AA0A6" />
          </Pressable>

          <Pressable
            style={styles.linkCard}
            onPress={() => setDetailSheet("merchant")}
          >
            <Ionicons name="storefront-outline" size={20} color="#5F6368" />
            <View style={styles.linkCardText}>
              <Text style={styles.linkCardTitle}>
                {t("orders.activeFood.restaurantDetails", "Restaurant details")}
              </Text>
              <Text style={styles.linkCardSummary} numberOfLines={1}>
                {restaurantName}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#9AA0A6" />
          </Pressable>
        </ScrollView>

        <View style={[styles.footer, { paddingBottom: bottomInset }]}>
          <FoodSlideToReachStore
            label={t("orders.activeFood.slidePickedOrder", "Picked order")}
            onComplete={onPickedOrder}
            disabled={!merchantReady}
            loading={pickUpLoading}
            completed={false}
            completedLabel={t("orders.activeFood.pickedUp", "Order picked up ✓")}
          />
        </View>

        <AllItemsSheet
          visible={detailSheet === "items"}
          items={items}
          itemCount={itemCount}
          fallbackLine={orderSummaryLine}
          specialNotes={specialNotes}
          onDismiss={() => setDetailSheet(null)}
        />

        <ContactDetailSheet
          visible={detailSheet === "customer"}
          kind="customer"
          title={t("orders.activeFood.customerDetails", "Customer details")}
          name={customerName}
          phone={customerPhone}
          address={customerAddress}
          onDismiss={() => setDetailSheet(null)}
          onCall={customerPhone ? (onCallCustomer ?? onCall) : undefined}
        />

        <ContactDetailSheet
          visible={detailSheet === "merchant"}
          kind="merchant"
          title={t("orders.activeFood.restaurantDetails", "Restaurant details")}
          name={restaurantName}
          phone={restaurantPhone}
          address={merchantFullAddress}
          onDismiss={() => setDetailSheet(null)}
          onCall={restaurantPhone ? onCall : undefined}
        />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#ffffff",
  },
  topSafe: {
    backgroundColor: "#ffffff",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#E8EAED",
  },
  headerTitle: {
    flex: 1,
    marginLeft: 4,
    fontSize: 18,
    fontWeight: "700",
    color: "#202124",
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  headerIconBtn: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  delayBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: "#8B0000",
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  delayBannerText: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "800",
    fontVariant: ["tabular-nums"],
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 0,
    paddingBottom: 12,
  },
  statusCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: "#E8F4FD",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#D2E8FC",
  },
  statusTimerBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: REF_BLUE,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 8,
    minWidth: 78,
    justifyContent: "center",
  },
  statusTimerDelayed: {
    backgroundColor: "#8B0000",
  },
  statusTimerText: {
    fontSize: 13,
    fontWeight: "800",
    color: "#ffffff",
    fontVariant: ["tabular-nums"],
  },
  statusTextCol: {
    flex: 1,
    minWidth: 0,
  },
  statusHeadline: {
    fontSize: 14,
    fontWeight: "700",
    color: "#202124",
    lineHeight: 18,
  },
  statusSub: {
    marginTop: 2,
    fontSize: 12,
    fontWeight: "500",
    color: "#5F6368",
    lineHeight: 16,
  },
  orderIdCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#ffffff",
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#E8EAED",
  },
  orderIdLeft: {
    flex: 1,
    minWidth: 0,
  },
  orderIdLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: "#9AA0A6",
    letterSpacing: 1,
    marginBottom: 2,
  },
  orderIdValueRow: {
    flexDirection: "row",
    alignItems: "baseline",
    flexWrap: "wrap",
  },
  orderIdPrefix: {
    fontSize: 18,
    fontWeight: "700",
    color: "#9CA3AF",
    letterSpacing: 0.1,
    fontVariant: ["tabular-nums"],
  },
  orderIdSuffixGroup: {
    flexDirection: "row",
    alignItems: "baseline",
    marginLeft: 8,
    gap: 1,
  },
  orderIdSuffixDigit: {
    fontWeight: "800",
    color: colors.brandOrange[600],
    fontVariant: ["tabular-nums"],
  },
  deliveryBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: colors.success[50],
    borderWidth: 1,
    borderColor: colors.success[200],
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginLeft: 8,
  },
  deliveryBadgeText: {
    fontSize: 11,
    fontWeight: "700",
    color: REF_GREEN,
  },
  orderDetailsCard: {
    backgroundColor: "#ffffff",
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#E8EAED",
  },
  orderDetailsHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  orderDetailsHeaderMain: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minWidth: 0,
  },
  orderDetailsTitleCol: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  orderDetailsTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#202124",
  },
  orderItemCount: {
    fontSize: 12,
    fontWeight: "600",
    color: "#80868B",
  },
  viewAllBtn: {
    borderWidth: 1,
    borderColor: colors.success[300],
    backgroundColor: colors.success[50],
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  viewAllBtnPressed: {
    opacity: 0.75,
  },
  viewAllBtnText: {
    fontSize: 12,
    fontWeight: "700",
    color: REF_GREEN,
  },
  moreItemsHint: {
    fontSize: 12,
    fontWeight: "600",
    color: "#80868B",
    marginTop: 2,
    paddingLeft: 17,
  },
  orderDetailsCollapsed: {
    marginTop: 10,
    fontSize: 13,
    fontWeight: "500",
    color: "#5F6368",
  },
  itemsPanel: {
    marginTop: 12,
    backgroundColor: "#F4F6F8",
    borderRadius: 10,
    padding: 12,
    gap: 10,
  },
  itemsList: {
    gap: 10,
  },
  itemRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  itemBullet: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: REF_GREEN,
    marginTop: 7,
  },
  itemLine: {
    flex: 1,
    fontSize: 14,
    fontWeight: "600",
    color: "#3C4043",
    lineHeight: 20,
  },
  instructionBar: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    backgroundColor: colors.success[50],
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: colors.success[100],
  },
  instructionText: {
    flex: 1,
    fontSize: 12,
    fontWeight: "600",
    color: colors.success[800],
    lineHeight: 17,
  },
  linkCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "#ffffff",
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#E8EAED",
  },
  linkCardText: {
    flex: 1,
    minWidth: 0,
  },
  linkCardTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#202124",
  },
  linkCardSummary: {
    marginTop: 2,
    fontSize: 13,
    fontWeight: "500",
    color: "#5F6368",
  },
  footer: {
    backgroundColor: "#ffffff",
    paddingHorizontal: 16,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#E8EAED",
  },
  allItemsPanel: {
    backgroundColor: "#F4F6F8",
    borderRadius: 12,
    padding: 14,
    gap: 12,
    marginBottom: 12,
  },
  sheetIconWrapGreen: {
    backgroundColor: colors.success[50],
  },
  sheetContent: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 8,
  },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  sheetTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flex: 1,
  },
  sheetIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#E8F4FD",
    alignItems: "center",
    justifyContent: "center",
  },
  sheetTitleCol: {
    flex: 1,
    gap: 2,
  },
  sheetTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: "#202124",
  },
  sheetSubtitle: {
    fontSize: 13,
    fontWeight: "600",
    color: "#80868B",
  },
  sheetCloseBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  sheetBody: {
    gap: 14,
    marginBottom: 16,
  },
  sheetField: {
    gap: 4,
  },
  sheetFieldLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: "#9AA0A6",
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },
  sheetFieldValue: {
    fontSize: 16,
    fontWeight: "700",
    color: "#202124",
    lineHeight: 22,
  },
  sheetFieldValueMuted: {
    fontSize: 15,
    fontWeight: "500",
    color: "#5F6368",
    lineHeight: 21,
  },
  sheetCallBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: REF_BLUE,
    borderRadius: 12,
    paddingVertical: 14,
    marginBottom: 4,
  },
  sheetCallBtnPressed: {
    opacity: 0.88,
  },
  sheetCallBtnText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#ffffff",
  },
});
