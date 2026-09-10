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
import { OrderLocationPhotoBox } from "@/src/components/orders/OrderLocationPhotoBox";
import { PartnerChatUnreadBadge } from "@/src/components/orders/PartnerChatUnreadBadge";
import { ResponsiveSheetBody } from "@/src/components/ui/ResponsiveSheetBody";
import { useResponsiveLayout } from "@/src/hooks/useResponsiveLayout";
import { flexShrinkText, rowLayout } from "@/src/theme/responsiveText";
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
  /**
   * In-flight camera / OTP lock — slider stays completed without a spinner.
   */
  deliverLocked?: boolean;
  /** Photo already captured + uploaded — slide reopens OTP, not camera. */
  deliverPhotoReady?: boolean;
  customerRating?: number | null;
  chatUnreadCount?: number;
  children?: React.ReactNode;
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
  const { height, isShortHeight } = useResponsiveLayout();
  const bodyMaxH = Math.round(height * (isShortHeight ? 0.58 : 0.52));

  return (
    <DismissibleBottomSheetShell
      visible={visible}
      onDismiss={onDismiss}
      maxHeightRatio={isShortHeight ? 0.78 : 0.72}
    >
      <ResponsiveSheetBody
        maxHeight={bodyMaxH}
        contentContainerStyle={styles.sheetScrollContent}
        footerStyle={styles.sheetFooterSlot}
      >
        <View style={[rowLayout.row, styles.sheetHeader]}>
          <View style={[rowLayout.row, styles.sheetTitleRow, rowLayout.grow]}>
            <View style={[styles.sheetIconWrap, styles.sheetIconWrapGreen, rowLayout.noShrink]}>
              <Ionicons name="fast-food-outline" size={20} color={REF_GREEN} />
            </View>
            <View style={[styles.sheetTitleCol, rowLayout.grow]}>
              <Text style={[styles.sheetTitle, flexShrinkText]} numberOfLines={2}>
                {t("orders.activeFood.allOrderItems", "All order items")}
              </Text>
              <Text style={[styles.sheetSubtitle, flexShrinkText]} numberOfLines={1}>
                {t("orders.activeFood.totalItemsCount", "{{count}} items total", {
                  count: itemCount,
                })}
              </Text>
            </View>
          </View>
          <Pressable
            onPress={onDismiss}
            hitSlop={10}
            style={[styles.sheetCloseBtn, rowLayout.noShrink]}
          >
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
                <View key={`${item.name}-${idx}`} style={[rowLayout.rowStart, styles.itemRow]}>
                  <View style={[styles.itemBullet, rowLayout.noShrink]} />
                  <Text style={[styles.sheetItemLine, flexShrinkText]} numberOfLines={3}>
                    {label}
                  </Text>
                </View>
              );
            })
          ) : (
            <View style={[rowLayout.rowStart, styles.itemRow]}>
              <View style={[styles.itemBullet, rowLayout.noShrink]} />
              <Text style={[styles.sheetItemLine, flexShrinkText]} numberOfLines={3}>
                {fallbackLine}
              </Text>
            </View>
          )}
        </View>

        {specialNotes.length > 0 ? (
          <View style={[rowLayout.rowStart, styles.instructionBar]}>
            <Ionicons
              name="information-circle"
              size={16}
              color={REF_GREEN}
              style={rowLayout.noShrink}
            />
            <Text style={[styles.instructionText, flexShrinkText]} numberOfLines={4}>
              {specialNotes.join(" | ")}
            </Text>
          </View>
        ) : null}
      </ResponsiveSheetBody>
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
  deliverLocked = false,
  deliverPhotoReady = false,
  customerRating,
  chatUnreadCount = 0,
  children,
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
          <View style={[rowLayout.row, styles.headerRow]}>
            <Text style={[styles.headerTitle, flexShrinkText]} numberOfLines={1}>
              {t("orders.activeFood.dropOrderHeader", "Drop order")}
            </Text>
            <View style={[rowLayout.row, styles.headerRight, rowLayout.noShrink]}>
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
                <Text style={styles.helpBtnText} numberOfLines={1}>
                  {t("orders.activeFood.helpLabel", "HELP")}
                </Text>
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

          <View style={[rowLayout.row, styles.paymentCard]}>
            <View style={[styles.paymentIconWrap, rowLayout.noShrink]}>
              <Ionicons
                name={isCod ? "cash-outline" : "checkmark-circle"}
                size={22}
                color={isCod ? "#B45309" : "#9AA0A6"}
              />
            </View>
            <View style={[styles.paymentTextCol, rowLayout.grow]}>
              <Text style={[styles.paymentTitle, flexShrinkText]} numberOfLines={2}>
                {paymentLabel}
              </Text>
              <Text style={[styles.paymentOrderLine, flexShrinkText]} numberOfLines={1}>
                {t("orders.activeFood.orderPrefix", "Order")}: {orderIdLabel}
              </Text>
            </View>
          </View>

          <View style={styles.expandCard}>
            <View style={[rowLayout.row, styles.expandCardHeader]}>
              <View style={[styles.expandIconWrap, rowLayout.noShrink]}>
                <Ionicons name="person-outline" size={18} color="#5F6368" />
              </View>
              <View style={[styles.expandTextCol, rowLayout.grow]}>
                <Text style={[styles.expandTitle, flexShrinkText]} numberOfLines={2}>
                  {customerName}
                </Text>
                {ratingLabel ? (
                  <View style={[rowLayout.row, styles.ratingRow]}>
                    <Text style={[styles.ratingLabel, flexShrinkText]} numberOfLines={1}>
                      {t("orders.activeFood.customerRating", "Rating")} {ratingLabel}
                    </Text>
                    <Ionicons name="star" size={12} color="#F59E0B" style={rowLayout.noShrink} />
                  </View>
                ) : (
                  <View style={styles.newUserTag}>
                    <Text style={styles.newUserTagText} numberOfLines={1}>
                      {t("orders.activeFood.newUser", "New User")}
                    </Text>
                  </View>
                )}
              </View>
              <Pressable
                onPress={onCallCustomer}
                disabled={!hasCallablePhone}
                style={[
                  styles.phoneFab,
                  rowLayout.noShrink,
                  !hasCallablePhone && styles.phoneFabDisabled,
                ]}
                accessibilityRole="button"
                accessibilityLabel={t("orders.activeFood.call", "Call")}
              >
                <Ionicons name="call" size={20} color="#ffffff" />
              </Pressable>
            </View>
          </View>

          <View style={styles.addressCard}>
            <View style={[rowLayout.rowStart, styles.addressTopRow]}>
              <Text style={[styles.addressText, flexShrinkText]} numberOfLines={4}>
                {deliveryAddress}
              </Text>
              <OrderLocationPhotoBox
                inline
                uri={order.dropAddressImageUrl}
                label={t("orders.activeFood.addressPhoto", "Address photo")}
              />
            </View>
            <View style={[rowLayout.row, styles.verifiedRow]}>
              <Ionicons name="checkmark-circle" size={16} color={REF_GREEN} style={rowLayout.noShrink} />
              <Text style={[styles.verifiedText, flexShrinkText]} numberOfLines={1}>
                {t("orders.activeFood.verifiedLocation", "Verified location")}
              </Text>
            </View>
            <View style={[rowLayout.row, styles.dualActionRow]}>
              <Pressable style={[rowLayout.row, styles.outlineActionBtn]} onPress={onChatCustomer}>
                <View style={[styles.chatIconWrap, rowLayout.noShrink]}>
                  <Ionicons name="chatbubble-outline" size={18} color={REF_BLUE} />
                  <PartnerChatUnreadBadge count={chatUnreadCount} style={styles.chatUnreadBadge} />
                </View>
                <Text style={[styles.outlineActionText, flexShrinkText]} numberOfLines={1}>
                  {chatUnreadCount > 0
                    ? t("orders.partnerChat.newMessages", "{{count}} new", { count: chatUnreadCount })
                    : t("orders.activeRide.chat", "Message")}
                </Text>
              </Pressable>
              <Pressable style={[rowLayout.row, styles.outlineActionBtn]} onPress={onOpenMaps}>
                <Ionicons
                  name="navigate-outline"
                  size={18}
                  color={REF_BLUE}
                  style={rowLayout.noShrink}
                />
                <Text style={[styles.outlineActionText, flexShrinkText]} numberOfLines={1}>
                  {t("orders.activeFood.goToMap", "Go to map")}
                </Text>
              </Pressable>
            </View>
          </View>

          <Pressable
            style={styles.expandCard}
            onPress={() => setOrderItemsSheetOpen(true)}
          >
            <View style={[rowLayout.row, styles.expandCardHeader]}>
              <View style={[styles.expandIconWrap, rowLayout.noShrink]}>
                <Ionicons name="receipt-outline" size={18} color="#5F6368" />
              </View>
              <View style={[styles.expandTextCol, rowLayout.grow]}>
                <Text style={[styles.expandTitle, flexShrinkText]} numberOfLines={1}>
                  {t("orders.activeFood.orderDetails", "Order details")}
                </Text>
                <Text style={[styles.expandSub, flexShrinkText]} numberOfLines={1}>
                  {orderDetailSubtitle}
                </Text>
              </View>
              <Ionicons name="chevron-down" size={18} color="#5F6368" style={rowLayout.noShrink} />
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
            { paddingBottom: Math.max(bottomInset, 8) + 2 },
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
            locked={deliverLocked}
            completed={false}
            completedLabel={t("orders.activeFood.deliveredDone", "Delivered ✓")}
            actionName="delivered"
          />
        </View>

        <RiderEmergencySosBottomSheet
          visible={sosSheetOpen}
          onDismiss={() => setSosSheetOpen(false)}
        />
        {children}
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
    alignItems: "center",
    paddingHorizontal: 12,
    minHeight: 48,
    maxWidth: "100%",
  },
  headerHit: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    flex: 1,
    minWidth: 0,
    fontSize: 18,
    fontWeight: "700",
    color: "#202124",
  },
  headerRight: {
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
    flexShrink: 0,
  },
  helpBtnText: {
    fontSize: 11,
    fontWeight: "800",
    color: "#202124",
    letterSpacing: 0.4,
  },
  scroll: {
    flex: 1,
    minHeight: 0,
  },
  scrollContent: {
    paddingBottom: 16,
    flexGrow: 0,
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
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#E8EAED",
    maxWidth: "100%",
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
    alignItems: "center",
    gap: 10,
    maxWidth: "100%",
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
    alignItems: "center",
    gap: 4,
    marginTop: 2,
    maxWidth: "100%",
  },
  ratingLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: "#5F6368",
    flexShrink: 1,
    minWidth: 0,
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
    alignItems: "flex-start",
    gap: 10,
    maxWidth: "100%",
  },
  addressText: {
    flex: 1,
    minWidth: 0,
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
    alignItems: "center",
    gap: 6,
    marginTop: 10,
    maxWidth: "100%",
  },
  verifiedText: {
    fontSize: 13,
    fontWeight: "600",
    color: REF_GREEN,
    flexShrink: 1,
    minWidth: 0,
  },
  dualActionRow: {
    gap: 10,
    marginTop: 12,
    maxWidth: "100%",
  },
  outlineActionBtn: {
    flex: 1,
    minWidth: 0,
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    minHeight: 44,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: REF_BLUE,
    backgroundColor: "#ffffff",
    paddingHorizontal: 8,
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
    flexShrink: 1,
    minWidth: 0,
  },
  sheetHeader: {
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
    maxWidth: "100%",
  },
  sheetTitleRow: {
    alignItems: "center",
    gap: 10,
    flex: 1,
    minWidth: 0,
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
    minWidth: 0,
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
  sheetScrollContent: {
    paddingBottom: 8,
  },
  sheetFooterSlot: {
    borderTopWidth: 0,
    backgroundColor: "transparent",
  },
  allItemsPanel: {
    backgroundColor: "#F4F6F8",
    borderRadius: 12,
    padding: 14,
    gap: 12,
    marginBottom: 12,
  },
  itemRow: {
    alignItems: "flex-start",
    gap: 10,
    maxWidth: "100%",
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
    minWidth: 0,
    fontSize: 14,
    fontWeight: "600",
    color: "#3C4043",
    lineHeight: 20,
  },
  instructionBar: {
    alignItems: "flex-start",
    gap: 8,
    backgroundColor: colors.success[50],
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: colors.success[100],
    marginBottom: 8,
    maxWidth: "100%",
  },
  instructionText: {
    flex: 1,
    minWidth: 0,
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
    flexShrink: 0,
  },
});
