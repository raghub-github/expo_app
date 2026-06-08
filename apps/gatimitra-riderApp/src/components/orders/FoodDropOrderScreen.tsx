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
import { FoodSlideToReachStore } from "@/src/components/orders/FoodSlideToReachStore";
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
  onEmergencyPress: () => void;
  onDirectionsPress: () => void;
  onHelpPress: () => void;
  onCallCustomer: () => void;
  onChatCustomer: () => void;
  onOpenMaps: () => void;
  onDelivered: () => void;
  deliverLoading?: boolean;
  customerRating?: number | null;
};

export function FoodDropOrderScreen({
  visible,
  order,
  orderIdLabel,
  deliveryAddress,
  restaurantName,
  onBack,
  onEmergencyPress,
  onDirectionsPress,
  onHelpPress,
  onCallCustomer,
  onChatCustomer,
  onOpenMaps,
  onDelivered,
  deliverLoading = false,
  customerRating,
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
  const [customerOpen, setCustomerOpen] = useState(true);
  const [orderDetailsOpen, setOrderDetailsOpen] = useState(false);

  const customerName =
    order.customerName?.trim() || t("orders.activeFood.customerFallback", "Customer");
  const customerPhone = order.customerPhone?.trim();
  const itemCount = order.itemCount ?? order.foodItems?.length ?? 0;
  const firstItemName = order.foodItems?.[0]?.name?.trim() || restaurantName;
  const orderDetailSubtitle =
    itemCount > 0
      ? `${restaurantName}${firstItemName !== restaurantName ? ` · ${firstItemName}` : ""}`
      : restaurantName;

  const ratingLabel = useMemo(() => {
    if (customerRating == null || !Number.isFinite(customerRating)) return null;
    return customerRating.toFixed(2);
  }, [customerRating]);

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
            <Pressable onPress={onBack} hitSlop={10} style={styles.headerHit}>
              <Ionicons name="chevron-down" size={22} color="#202124" />
            </Pressable>
            <Text style={styles.headerTitle}>
              {t("orders.activeFood.dropOrderHeader", "Drop order")}
            </Text>
            <View style={styles.headerRight}>
              <Pressable onPress={onEmergencyPress} hitSlop={8} style={styles.headerHit}>
                <MaterialCommunityIcons name="alarm-light" size={22} color={EMERGENCY_PINK} />
              </Pressable>
              <Pressable onPress={onDirectionsPress} hitSlop={8} style={styles.headerHit}>
                <Ionicons name="navigate-circle-outline" size={26} color="#202124" />
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

          <Pressable
            style={styles.expandCard}
            onPress={() => setCustomerOpen((v) => !v)}
          >
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
                ) : null}
              </View>
              <Ionicons
                name={customerOpen ? "chevron-up" : "chevron-down"}
                size={18}
                color="#5F6368"
              />
            </View>
            {customerOpen && customerPhone ? (
              <Text style={styles.expandBody}>{customerPhone}</Text>
            ) : null}
          </Pressable>

          <View style={styles.addressCard}>
            <View style={styles.addressTopRow}>
              <Text style={styles.addressText} numberOfLines={4}>
                {deliveryAddress}
              </Text>
              <Pressable
                onPress={onCallCustomer}
                disabled={!customerPhone}
                style={[styles.phoneFab, !customerPhone && styles.phoneFabDisabled]}
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
                <Ionicons name="chatbubble-outline" size={18} color={REF_BLUE} />
                <Text style={styles.outlineActionText}>
                  {t("orders.activeRide.chat", "Message")}
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
            onPress={() => setOrderDetailsOpen((v) => !v)}
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
              <Ionicons
                name={orderDetailsOpen ? "chevron-up" : "chevron-down"}
                size={18}
                color="#5F6368"
              />
            </View>
            {orderDetailsOpen ? (
              <View style={styles.itemsBlock}>
                {(order.foodItems ?? []).slice(0, 8).map((item, idx) => (
                  <Text key={`${item.name}-${idx}`} style={styles.itemLine} numberOfLines={2}>
                    {item.quantity}× {item.name}
                    {item.variantName ? ` (${item.variantName})` : ""}
                  </Text>
                ))}
                {order.deliveryInstructions?.trim() ? (
                  <Text style={styles.instructionLine} numberOfLines={3}>
                    {order.deliveryInstructions.trim()}
                  </Text>
                ) : null}
              </View>
            ) : null}
          </Pressable>
        </ScrollView>

        <View style={[styles.footer, { paddingBottom: Math.max(bottomInset, 12) }]}>
          <FoodSlideToReachStore
            label={t("orders.activeFood.slideDelivered", "Order delivered")}
            onComplete={onDelivered}
            loading={deliverLoading}
            completed={false}
            completedLabel={t("orders.activeFood.deliveredDone", "Delivered ✓")}
          />
        </View>
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
    marginLeft: 4,
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
  expandBody: {
    marginTop: 8,
    marginLeft: 42,
    fontSize: 13,
    fontWeight: "500",
    color: "#5F6368",
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
  outlineActionText: {
    fontSize: 14,
    fontWeight: "600",
    color: REF_BLUE,
  },
  itemsBlock: {
    marginTop: 10,
    marginLeft: 42,
    gap: 4,
  },
  itemLine: {
    fontSize: 13,
    fontWeight: "500",
    color: "#3C4043",
    lineHeight: 18,
  },
  instructionLine: {
    marginTop: 6,
    fontSize: 12,
    fontWeight: "500",
    color: "#5F6368",
    fontStyle: "italic",
  },
  footer: {
    paddingHorizontal: 16,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#E8EAED",
    backgroundColor: "#ffffff",
  },
});
