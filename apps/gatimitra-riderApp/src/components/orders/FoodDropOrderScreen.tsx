import React, { useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Pressable,
  ScrollView,
  Platform,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { resolveRiderBottomInset } from "@/src/hooks/useRiderBottomInset";
import { DismissibleBottomSheetShell } from "@/src/components/language/DismissibleBottomSheetShell";
import { RiderEmergencySosBottomSheet } from "@/src/components/orders/RiderEmergencySosBottomSheet";
import { FoodSlideToReachStore } from "@/src/components/orders/FoodSlideToReachStore";
import { PartnerChatUnreadBadge } from "@/src/components/orders/PartnerChatUnreadBadge";
import { colors } from "@/src/theme";
import type { RiderOrderSummary } from "@/src/services/api/riderApi";
import {
  formatRiderDropPaymentLabel,
  isCodPaymentMethod,
} from "@/src/lib/rider-payment-display";

const REF_BLUE = "#1A73E8";
const REF_GREEN = colors.success[600];
const EMERGENCY_PINK = "#E91E8C";

type Props = {
  visible: boolean;
  order: RiderOrderSummary;
  orderIdLabel: string;
  deliveryAddress: string;
  restaurantName: string;
  onBack: () => void;
  onEmergencyPress?: () => void;
  onDirectionsPress?: () => void;
  onHelpPress: () => void;
  onCallCustomer: () => void;
  onChatCustomer: () => void;
  onOpenMaps: () => void;
  onDelivered: () => void;
  deliverLoading?: boolean;
  /** Photo already captured + uploaded — slide reopens OTP, not camera. */
  deliverPhotoReady?: boolean;
  customerRating?: number | null;
  chatUnreadCount?: number;
};

type FoodItem = NonNullable<RiderOrderSummary["foodItems"]>[number];

type DropOrderItemsSheetProps = {
  visible: boolean;
  items: FoodItem[];
  itemCount: number;
  fallbackLine: string;
  specialNotes: string[];
  onDismiss: () => void;
};

function DropOrderItemsSheet({
  visible,
  items,
  itemCount,
  fallbackLine,
  specialNotes,
  onDismiss,
}: DropOrderItemsSheetProps) {
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

        <ScrollView
          style={styles.sheetScroll}
          contentContainerStyle={styles.sheetScrollContent}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.allItemsPanel}>
            {items.length > 0 ? (
              items.map((item, idx) => {
                const label = item.variantName
                  ? `${item.quantity} x ${item.name} (${item.variantName})`
                  : `${item.quantity} x ${item.name}`;
                return (
                  <View key={`${item.name}-${idx}`} style={styles.itemRow}>
                    <View style={styles.itemBullet} />
                    <Text style={styles.sheetItemLine}>{label}</Text>
                  </View>
                );
              })
            ) : (
              <View style={styles.itemRow}>
                <View style={styles.itemBullet} />
                <Text style={styles.sheetItemLine}>{fallbackLine}</Text>
              </View>
            )}
          </View>

          {specialNotes.length > 0 ? (
            <View style={styles.instructionBar}>
              <Ionicons name="information-circle" size={16} color={REF_GREEN} />
              <Text style={styles.instructionText}>{specialNotes.join(" | ")}</Text>
            </View>
          ) : null}
        </ScrollView>
      </View>
    </DismissibleBottomSheetShell>
  );
}

export function FoodDropOrderScreen({
  visible,
  order,
  orderIdLabel,
  deliveryAddress,
  restaurantName,
  onBack,
  onEmergencyPress,
  onHelpPress,
  onCallCustomer,
  onChatCustomer,
  onOpenMaps,
  onDelivered,
  deliverLoading = false,
  deliverPhotoReady = false,
  customerRating,
  chatUnreadCount = 0,
}: Props) {
  const { t } = useTranslation();
  const paymentLabel = formatRiderDropPaymentLabel(
    order.paymentMethod,
    order.paymentStatus,
    t
  );
  const isCod = isCodPaymentMethod(order.paymentMethod);
  const insets = useSafeAreaInsets();
  const bottomInset = resolveRiderBottomInset(insets.bottom);
  const [orderItemsSheetOpen, setOrderItemsSheetOpen] = useState(false);
  const [sosSheetOpen, setSosSheetOpen] = useState(false);

  const customerName =
    order.customerName?.trim() || t("orders.activeFood.customerFallback", "Customer");
  const resolvedRating = customerRating ?? order.customerRating ?? null;
  const customerPhone =
    order.customerPhone?.trim() ||
    order.customerAlternatePhone?.trim() ||
    order.customerPrimaryPhone?.trim() ||
    "";
  const hasCallablePhone = Boolean(customerPhone);
  const itemCount = order.itemCount ?? order.foodItems?.length ?? 0;
  const firstItemName = order.foodItems?.[0]?.name?.trim() || restaurantName;
  const orderDetailSubtitle =
    itemCount > 0
      ? `${restaurantName}${firstItemName !== restaurantName ? ` · ${firstItemName}` : ""}`
      : restaurantName;

  const ratingLabel = useMemo(() => {
    if (resolvedRating == null || !Number.isFinite(resolvedRating)) return null;
    return resolvedRating.toFixed(1);
  }, [resolvedRating]);

  const foodItems = order.foodItems ?? [];
  const specialNotes = useMemo(() => {
    const notes: string[] = [];
    if (order.deliveryInstructions?.trim()) {
      notes.push(order.deliveryInstructions.trim());
    }
    return notes;
  }, [order.deliveryInstructions]);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      statusBarTranslucent
      onRequestClose={onBack}
    >
      <View style={styles.root}>
        <View style={[styles.headerWrap, { paddingTop: insets.top }]}>
          <View style={styles.headerRow}>
            <Text style={styles.headerTitle}>
              {t("orders.activeFood.dropOrderHeader", "Drop order")}
            </Text>
            <View style={styles.headerRight}>
              <Pressable
                onPress={() => {
                  setSosSheetOpen(true);
                  onEmergencyPress?.();
                }}
                hitSlop={8}
                style={styles.headerHit}
              >
                <MaterialCommunityIcons name="alarm-light" size={22} color={EMERGENCY_PINK} />
              </Pressable>
              <Pressable onPress={onHelpPress} style={styles.helpBtn}>
                <Text style={styles.helpBtnText}>{t("orders.activeFood.helpLabel", "HELP")}</Text>
              </Pressable>
            </View>
          </View>
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.heroWrap}>
            <LinearGradient
              colors={["#E8F0FE", "#F1F8E9", "#FFFDE7"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.hero}
            >
              <MaterialCommunityIcons
                name="hand-heart"
                size={88}
                color="#5C6BC0"
                style={styles.heroIcon}
              />
            </LinearGradient>
            <View style={styles.heroCaptionBar}>
              <Text style={styles.heroCaption}>
                {t("orders.activeFood.sayThankYou", 'Say "thank you"')}
              </Text>
            </View>
          </View>

          <View style={styles.paymentCard}>
            <View style={styles.paymentIconWrap}>
              <Ionicons
                name={isCod ? "cash-outline" : "checkmark-circle"}
                size={22}
                color={isCod ? "#B45309" : "#9AA0A6"}
              />
            </View>
            <View style={styles.paymentTextCol}>
              <Text style={styles.paymentTitle}>{paymentLabel}</Text>
              <Text style={styles.paymentOrderLine}>
                {t("orders.activeFood.orderPrefix", "Order")}: {orderIdLabel}
              </Text>
            </View>
          </View>

          <View style={styles.expandCard}>
            <View style={styles.expandCardHeader}>
              <View style={styles.expandIconWrap}>
                <Ionicons name="person-outline" size={18} color="#5F6368" />
              </View>
              <View style={styles.expandTextCol}>
                <Text style={styles.expandTitle}>{customerName}</Text>
                {ratingLabel ? (
                  <View style={styles.ratingRow}>
                    <Text style={styles.ratingLabel}>
                      {t("orders.activeFood.customerRating", "Rating")} {ratingLabel}
                    </Text>
                    <Ionicons name="star" size={12} color="#F59E0B" />
                  </View>
                ) : (
                  <View style={styles.newUserTag}>
                    <Text style={styles.newUserTagText}>
                      {t("orders.activeFood.newUser", "New User")}
                    </Text>
                  </View>
                )}
              </View>
            </View>
          </View>

          <View style={styles.addressCard}>
            <View style={styles.addressTopRow}>
              <Text style={styles.addressText} numberOfLines={4}>
                {deliveryAddress}
              </Text>
              <Pressable
                onPress={onCallCustomer}
                disabled={!hasCallablePhone}
                style={[styles.phoneFab, !hasCallablePhone && styles.phoneFabDisabled]}
              >
                <Ionicons name="call" size={20} color="#ffffff" />
              </Pressable>
            </View>
            <View style={styles.verifiedRow}>
              <Ionicons name="checkmark-circle" size={16} color={REF_GREEN} />
              <Text style={styles.verifiedText}>
                {t("orders.activeFood.verifiedLocation", "Verified location")}
              </Text>
            </View>
            <View style={styles.dualActionRow}>
              <Pressable style={styles.outlineActionBtn} onPress={onChatCustomer}>
                <View style={styles.chatIconWrap}>
                  <Ionicons name="chatbubble-outline" size={18} color={REF_BLUE} />
                  <PartnerChatUnreadBadge count={chatUnreadCount} style={styles.chatUnreadBadge} />
                </View>
                <Text style={styles.outlineActionText}>
                  {chatUnreadCount > 0
                    ? t("orders.partnerChat.newMessages", "{{count}} new", { count: chatUnreadCount })
                    : t("orders.activeRide.chat", "Message")}
                </Text>
              </Pressable>
              <Pressable style={styles.outlineActionBtn} onPress={onOpenMaps}>
                <Ionicons name="navigate-outline" size={18} color={REF_BLUE} />
                <Text style={styles.outlineActionText}>
                  {t("orders.activeFood.goToMap", "Go to map")}
                </Text>
              </Pressable>
            </View>
          </View>

          <Pressable
            style={styles.expandCard}
            onPress={() => setOrderItemsSheetOpen(true)}
          >
            <View style={styles.expandCardHeader}>
              <View style={styles.expandIconWrap}>
                <Ionicons name="receipt-outline" size={18} color="#5F6368" />
              </View>
              <View style={styles.expandTextCol}>
                <Text style={styles.expandTitle}>
                  {t("orders.activeFood.orderDetails", "Order details")}
                </Text>
                <Text style={styles.expandSub} numberOfLines={1}>
                  {orderDetailSubtitle}
                </Text>
              </View>
              <Ionicons name="chevron-down" size={18} color="#5F6368" />
            </View>
          </Pressable>
        </ScrollView>

        <DropOrderItemsSheet
          visible={orderItemsSheetOpen}
          items={foodItems}
          itemCount={itemCount}
          fallbackLine={orderDetailSubtitle}
          specialNotes={specialNotes}
          onDismiss={() => setOrderItemsSheetOpen(false)}
        />

        <View
          style={[
            styles.footer,
            { paddingBottom: Math.max(bottomInset, 12) },
          ]}
        >
          <FoodSlideToReachStore
            label={
              deliverPhotoReady
                ? t("orders.activeFood.slideEnterDeliveryOtp", "Enter delivery OTP")
                : t("orders.activeFood.slideDelivered", "Order delivered")
            }
            onComplete={onDelivered}
            loading={deliverLoading}
            completed={false}
            completedLabel={t("orders.activeFood.deliveredDone", "Delivered ✓")}
          />
        </View>

        <RiderEmergencySosBottomSheet
          visible={sosSheetOpen}
          onDismiss={() => setSosSheetOpen(false)}
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
  headerWrap: {
    backgroundColor: "#ffffff",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#E8EAED",
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 3,
      },
      android: { elevation: 2 },
      default: {},
    }),
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    minHeight: 48,
  },
  headerHit: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: "700",
    color: "#202124",
  },
  headerRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  helpBtn: {
    marginLeft: 4,
    height: 28,
    paddingHorizontal: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#202124",
    alignItems: "center",
    justifyContent: "center",
  },
  helpBtnText: {
    fontSize: 11,
    fontWeight: "800",
    color: "#202124",
    letterSpacing: 0.4,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 16,
  },
  heroWrap: {
    backgroundColor: "#ffffff",
  },
  hero: {
    height: 168,
    alignItems: "center",
    justifyContent: "center",
  },
  heroIcon: {
    opacity: 0.92,
  },
  heroCaptionBar: {
    backgroundColor: "rgba(0,0,0,0.72)",
    paddingVertical: 10,
    paddingHorizontal: 16,
    alignItems: "center",
  },
  heroCaption: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "600",
    letterSpacing: 0.2,
  },
  paymentCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#E8EAED",
  },
  paymentIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#F1F3F4",
    alignItems: "center",
    justifyContent: "center",
  },
  paymentTextCol: {
    flex: 1,
    minWidth: 0,
  },
  paymentTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#202124",
  },
  paymentOrderLine: {
    marginTop: 2,
    fontSize: 13,
    fontWeight: "500",
    color: "#5F6368",
  },
  expandCard: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#E8EAED",
  },
  expandCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  expandIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#F1F3F4",
    alignItems: "center",
    justifyContent: "center",
  },
  expandTextCol: {
    flex: 1,
    minWidth: 0,
  },
  expandTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#202124",
  },
  expandSub: {
    marginTop: 2,
    fontSize: 12,
    fontWeight: "500",
    color: "#5F6368",
  },
  ratingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 2,
  },
  ratingLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: "#5F6368",
  },
  newUserTag: {
    alignSelf: "flex-start",
    marginTop: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: "#E8F0FE",
  },
  newUserTagText: {
    fontSize: 11,
    fontWeight: "700",
    color: REF_BLUE,
    letterSpacing: 0.2,
  },
  addressCard: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#E8EAED",
  },
  addressTopRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  addressText: {
    flex: 1,
    fontSize: 14,
    fontWeight: "500",
    color: "#3C4043",
    lineHeight: 20,
  },
  phoneFab: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: REF_BLUE,
    alignItems: "center",
    justifyContent: "center",
  },
  phoneFabDisabled: {
    opacity: 0.45,
  },
  verifiedRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 10,
  },
  verifiedText: {
    fontSize: 13,
    fontWeight: "600",
    color: REF_GREEN,
  },
  dualActionRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 12,
  },
  outlineActionBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    minHeight: 44,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: REF_BLUE,
    backgroundColor: "#ffffff",
  },
  chatIconWrap: {
    width: 22,
    height: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  chatUnreadBadge: {
    position: "absolute",
    top: -6,
    right: -8,
  },
  outlineActionText: {
    fontSize: 14,
    fontWeight: "600",
    color: REF_BLUE,
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
    marginBottom: 12,
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
  sheetIconWrapGreen: {
    backgroundColor: colors.success[50],
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
  sheetScroll: {
    maxHeight: 360,
  },
  sheetScrollContent: {
    paddingBottom: 8,
  },
  allItemsPanel: {
    backgroundColor: "#F4F6F8",
    borderRadius: 12,
    padding: 14,
    gap: 12,
    marginBottom: 12,
  },
  itemRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  itemBullet: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: REF_GREEN,
    marginTop: 7,
  },
  sheetItemLine: {
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
    marginBottom: 8,
  },
  instructionText: {
    flex: 1,
    fontSize: 12,
    fontWeight: "600",
    color: colors.success[800],
    lineHeight: 17,
  },
  footer: {
    paddingHorizontal: 16,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#E8EAED",
    backgroundColor: "#ffffff",
  },
});
