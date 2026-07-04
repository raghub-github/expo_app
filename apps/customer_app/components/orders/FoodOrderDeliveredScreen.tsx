/**
 * Zomato-style post-delivery success screen (live tracking flow only).
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  Linking,
} from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { GatiMitraColors } from "@/constants/gatimitra";
import { DEFAULT_STATUS_BAR_HEIGHT, STATUS_BAR_TO_HEADER_GAP } from "@/constants/layout";
import { useScreenChromeStore } from "@/store/screenChromeStore";
import type { OrderDetail } from "@/services/order.service";
import { orderService } from "@/services/order.service";
import { toAbsoluteImageUrl } from "@/utils/mediaUrl";
import { DietIndicator } from "@/components/store/DietIndicator";
import { resolveOrderItemDiet } from "@/lib/reorderFromOrder";
import { buildOrderDeliveryDetailsView } from "@/lib/order-delivery-details";
import { ReceiptTornEdge } from "@/components/orders/ReceiptTornEdge";
import { DeliveryPartnerTrackingCard } from "@/components/orders/DeliveryPartnerTrackingCard";
import { DeliveryPartnerSafetyBottomSheet } from "@/components/orders/DeliveryPartnerSafetyBottomSheet";
import { FoodOrderTipSheet } from "@/components/orders/FoodOrderTipSheet";
import { RestaurantPostDeliveryRatingSheet } from "@/components/orders/RestaurantPostDeliveryRatingSheet";
import { DeliveryPartnerPostRatingSheet } from "@/components/orders/DeliveryPartnerPostRatingSheet";
import { usePartnerChatUnread } from "@/hooks/usePartnerChatUnread";
import {
  RESTAURANT_RATING_TAGS,
  defaultTagsForRating,
} from "@/lib/post-delivery-rating-tags";
import { AppAssetImage } from "@/components/AppAssetImage";
import { CX } from "@/lib/appAssetKeys";

const ZOMATO_GREEN_DARK = "#1C6A37";
const ZOMATO_GREEN = "#2D9547";
const ZOMATO_GREEN_LIGHT = "#3FAF62";
const HEADER_GREEN = ZOMATO_GREEN;
const ROLLER_MINT = GatiMitraColors.mintHighlight;
const ROLLER_WHITE = "#FFFFFF";
const PAGE_BG = GatiMitraColors.softBackground;
const CARD = GatiMitraColors.cardSurface;
const BORDER = GatiMitraColors.border;
const TEXT = GatiMitraColors.textPrimaryNew;
const MUTED = GatiMitraColors.textSecondary;
const ZOMATO_RED = "#E23744";
const CALL_BTN_BG = "#FFF0F0";
const CALL_BTN_BORDER = "#FFD6D6";

type FoodOrderDeliveredScreenProps = {
  order: OrderDetail;
  onBack: () => void;
  onOpenHelp: () => void;
  onOpenMerchant: () => void;
};

function getCompactAddressLine(address: string | null | undefined) {
  const raw = (address ?? "").trim();
  if (!raw) return "";
  const parts = raw.split(",").map((p) => p.trim()).filter(Boolean);
  if (parts.length >= 2) return `${parts[parts.length - 2]}, ${parts[parts.length - 1]}`;
  return raw;
}

function getDeliveredAtIso(order: OrderDetail): string | null {
  const fromHistory = order.statusHistory
    ?.slice()
    .reverse()
    .find((entry) => entry.status === "DELIVERED")?.at;
  return fromHistory ?? null;
}

function formatDeliveredTime(iso: string | undefined | null) {
  if (!iso) return null;
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });
  } catch {
    return null;
  }
}

function DashedDivider() {
  return (
    <View style={styles.dashedWrap}>
      <Text style={styles.dashed} numberOfLines={1}>
        - - - - - - - - - - - - - - - - - - - -
      </Text>
    </View>
  );
}

function InlineStars({
  value,
  onPress,
  size = 28,
}: {
  value: number;
  onPress: (n: number) => void;
  size?: number;
}) {
  return (
    <View style={styles.inlineStars}>
      {[1, 2, 3, 4, 5].map((n) => (
        <TouchableOpacity key={n} onPress={() => onPress(n)} hitSlop={6}>
          <Ionicons
            name={n <= value ? "star" : "star-outline"}
            size={size}
            color={n <= value ? "#F59E0B" : "#C4C4C4"}
          />
        </TouchableOpacity>
      ))}
    </View>
  );
}

function DeliveredDetailsCard({
  contactTitle,
  addressTitle,
  addressLine,
}: {
  contactTitle: string | null;
  addressTitle: string | null;
  addressLine: string | null;
}) {
  const hasContact = !!contactTitle;
  const hasAddress = !!addressTitle || !!addressLine;
  if (!hasContact && !hasAddress) return null;

  return (
    <View style={styles.detailsCard}>
      {hasContact ? (
        <View style={styles.detailRow}>
          <Ionicons name="call-outline" size={18} color={MUTED} style={styles.detailIcon} />
          <Text style={styles.detailContact}>{contactTitle}</Text>
        </View>
      ) : null}

      {hasContact && hasAddress ? <DashedDivider /> : null}

      {hasAddress ? (
        <View style={styles.detailRow}>
          <Ionicons name="location-outline" size={18} color={MUTED} style={styles.detailIcon} />
          <View style={styles.detailTextWrap}>
            {addressTitle ? <Text style={styles.detailTitle}>{addressTitle}</Text> : null}
            {addressLine ? (
              <Text style={styles.detailSub} numberOfLines={4}>
                {addressLine}
              </Text>
            ) : null}
          </View>
        </View>
      ) : null}
    </View>
  );
}

export function FoodOrderDeliveredScreen({
  order,
  onBack,
  onOpenHelp,
  onOpenMerchant,
}: FoodOrderDeliveredScreenProps) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const queryClient = useQueryClient();
  const setStatusBarBackground = useScreenChromeStore((s) => s.setStatusBarBackground);
  const resetStatusBarBackground = useScreenChromeStore((s) => s.resetStatusBarBackground);

  useFocusEffect(
    useCallback(() => {
      setStatusBarBackground(HEADER_GREEN, "light");
      return () => resetStatusBarBackground();
    }, [setStatusBarBackground, resetStatusBarBackground])
  );
  const { data: chatUnreadData } = usePartnerChatUnread(order.orderId);
  const chatUnreadCount = chatUnreadData?.unreadCount ?? 0;

  const [tipSheetVisible, setTipSheetVisible] = useState(false);
  const [safetySheetVisible, setSafetySheetVisible] = useState(false);
  const [storeRatingSheetOpen, setStoreRatingSheetOpen] = useState(false);
  const [deliveryRatingSheetOpen, setDeliveryRatingSheetOpen] = useState(false);
  const [storeSheetInitialRating, setStoreSheetInitialRating] = useState(0);
  const [deliverySheetInitialRating, setDeliverySheetInitialRating] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [feedbackSaving, setFeedbackSaving] = useState(false);
  const [packagingFeedback, setPackagingFeedback] = useState<"good" | "bad" | null>(() => {
    if (order.customerPackagingFeedback === "good") return "good";
    if (order.customerPackagingFeedback === "not_good") return "bad";
    return null;
  });
  const [riderUniformFeedback, setRiderUniformFeedback] = useState<boolean | null>(
    () => order.customerRiderInUniform ?? null
  );

  const serverStoreRating = order.storeRating ?? 0;
  const serverDeliveryRating = order.deliveryRating ?? 0;
  const storeRatedOnServer = serverStoreRating >= 1;
  const deliveryRatedOnServer = serverDeliveryRating >= 1;
  const alreadySubmitted = storeRatedOnServer;

  const [localStoreRating, setLocalStoreRating] = useState(serverStoreRating);
  const [localDeliveryRating, setLocalDeliveryRating] = useState(serverDeliveryRating);
  const [storeSelectedTags, setStoreSelectedTags] = useState<string[]>(
    () => order.storeReviewTags ?? []
  );
  const [riderSelectedTags, setRiderSelectedTags] = useState<string[]>(
    () => order.riderReviewTags ?? []
  );
  const [storeReviewNote, setStoreReviewNote] = useState(order.storeReviewText ?? "");
  const [riderReviewNote, setRiderReviewNote] = useState(order.riderReviewText ?? "");
  const [localTipAmount, setLocalTipAmount] = useState(() => {
    const tip = order.tipAmount != null && order.tipAmount > 0 ? order.tipAmount : 0;
    return tip > 0 ? tip : 0;
  });

  useEffect(() => {
    if (order.customerPackagingFeedback === "good") setPackagingFeedback("good");
    else if (order.customerPackagingFeedback === "not_good") setPackagingFeedback("bad");
    if (order.customerRiderInUniform === true || order.customerRiderInUniform === false) {
      setRiderUniformFeedback(order.customerRiderInUniform);
    }
    if (order.storeReviewTags?.length) setStoreSelectedTags(order.storeReviewTags);
    if (order.riderReviewTags?.length) setRiderSelectedTags(order.riderReviewTags);
    if (order.storeReviewText) setStoreReviewNote(order.storeReviewText);
    if (order.riderReviewText) setRiderReviewNote(order.riderReviewText);
    const tip = order.tipAmount != null && order.tipAmount > 0 ? order.tipAmount : 0;
    if (tip > 0) setLocalTipAmount(tip);
  }, [
    order.customerPackagingFeedback,
    order.customerRiderInUniform,
    order.storeReviewTags,
    order.riderReviewTags,
    order.storeReviewText,
    order.riderReviewText,
    order.tipAmount,
  ]);

  const deliveryLabel = order.deliveryAddressLabel?.trim() || "Other";
  const deliveryDetailsView = useMemo(() => {
    const base = buildOrderDeliveryDetailsView(order);
    return {
      contactTitle: base.contactTitle,
      addressTitle: `Delivered at ${deliveryLabel}`,
      addressLine: base.addressLine,
    };
  }, [order, deliveryLabel]);

  const restaurantName = order.merchantPublicName ?? order.merchantName ?? "Restaurant";
  const merchantArea = getCompactAddressLine(order.merchantAddress);
  const displayOrderId = order.formattedOrderId ?? order.orderId;
  const bannerUri = toAbsoluteImageUrl(order.merchantBannerUrl);
  const items = order.items ?? [];
  const itemsPreview = items.length
    ? `${items[0]!.quantity} x ${items[0]!.name}${items.length > 1 ? ` +${items.length - 1} more` : ""}`
    : "";
  const riderName = order.rider?.name?.trim() || "Delivery partner";
  const riderFirstName = riderName.split(" ")[0] ?? riderName;
  const riderPhotoUri = toAbsoluteImageUrl(order.rider?.photoUrl);
  const riderRating =
    order.rider?.rating != null && Number.isFinite(order.rider.rating)
      ? order.rider.rating.toFixed(1)
      : null;
  const existingTip = order.tipAmount != null && order.tipAmount > 0 ? order.tipAmount : 0;
  const displayTipAmount = Math.max(existingTip, localTipAmount);
  const paymentMethodLabel = (order.paymentMethod ?? "UPI").replace(/_/g, " ");
  const deliveredTime = formatDeliveredTime(getDeliveredAtIso(order));

  const displayStoreRating = alreadySubmitted ? serverStoreRating : localStoreRating;
  const displayDeliveryRating = deliveryRatedOnServer ? serverDeliveryRating : localDeliveryRating;

  const buildReviewText = useCallback((base?: string) => {
    const text = base?.trim();
    return text || undefined;
  }, []);

  const savePostDeliveryFeedback = useCallback(
    async (payload: { packagingFeedback?: "good" | "not_good"; riderInUniform?: boolean }) => {
      setFeedbackSaving(true);
      try {
        await orderService.submitPostDeliveryFeedback(order.orderId, payload);
        await queryClient.invalidateQueries({ queryKey: ["order", order.orderId] });
      } catch {
        Alert.alert("Could not save feedback", "Please try again.");
        throw new Error("feedback_failed");
      } finally {
        setFeedbackSaving(false);
      }
    },
    [order.orderId, queryClient]
  );

  const handlePackagingFeedback = useCallback(
    async (value: "good" | "bad") => {
      if (packagingFeedback != null || feedbackSaving) return;
      setPackagingFeedback(value);
      try {
        await savePostDeliveryFeedback({
          packagingFeedback: value === "good" ? "good" : "not_good",
        });
      } catch {
        setPackagingFeedback(null);
      }
    },
    [feedbackSaving, packagingFeedback, savePostDeliveryFeedback]
  );

  const handleRiderUniformFeedback = useCallback(
    async (inUniform: boolean) => {
      if (riderUniformFeedback != null || feedbackSaving) return;
      setRiderUniformFeedback(inUniform);
      try {
        await savePostDeliveryFeedback({ riderInUniform: inUniform });
      } catch {
        setRiderUniformFeedback(null);
      }
    },
    [feedbackSaving, riderUniformFeedback, savePostDeliveryFeedback]
  );

  const persistRatings = useCallback(
    async (payload: {
      storeRating?: number;
      deliveryRating?: number;
      reviewText?: string;
      riderReviewText?: string;
      storeReviewTags?: string[];
      riderReviewTags?: string[];
    }) => {
      const incomingStore =
        payload.storeRating != null && payload.storeRating >= 1 ? payload.storeRating : undefined;
      const incomingDelivery =
        payload.deliveryRating != null && payload.deliveryRating >= 1
          ? payload.deliveryRating
          : undefined;

      const isStoreUpdate = incomingStore != null && !storeRatedOnServer;
      const isDeliveryUpdate = incomingDelivery != null && !deliveryRatedOnServer;

      if (!isStoreUpdate && !isDeliveryUpdate) return;

      setSubmitting(true);
      try {
        await orderService.submitStoreRating(order.orderId, {
          storeRating: isStoreUpdate ? incomingStore : null,
          deliveryRating: isDeliveryUpdate ? incomingDelivery : null,
          reviewText: isStoreUpdate ? (payload.reviewText ?? null) : null,
          riderReviewText: isDeliveryUpdate ? (payload.riderReviewText ?? null) : null,
          storeReviewTags: isStoreUpdate ? (payload.storeReviewTags ?? storeSelectedTags) : undefined,
          riderReviewTags: isDeliveryUpdate
            ? (payload.riderReviewTags ?? riderSelectedTags)
            : undefined,
        });
        await queryClient.invalidateQueries({ queryKey: ["order", order.orderId] });
        await queryClient.invalidateQueries({ queryKey: ["my-orders"] });
      } catch (e) {
        const msg =
          (e as { response?: { data?: { message?: string } } })?.response?.data?.message ??
          "Could not submit rating. Please try again.";
        Alert.alert("Rating failed", msg);
        throw e;
      } finally {
        setSubmitting(false);
      }
    },
    [
      deliveryRatedOnServer,
      order.orderId,
      queryClient,
      storeRatedOnServer,
      storeSelectedTags,
      riderSelectedTags,
    ]
  );

  const handleStoreStarPress = useCallback(
    (stars: number) => {
      if (alreadySubmitted || submitting) return;
      setStoreSheetInitialRating(stars);
      setStoreRatingSheetOpen(true);
    },
    [alreadySubmitted, submitting]
  );

  const handleStoreSheetSubmit = useCallback(
    async (payload: {
      storeRating: number;
      reviewText?: string;
      recommendFriends: boolean;
    }) => {
      const defaults = defaultTagsForRating(RESTAURANT_RATING_TAGS, payload.storeRating);
      setLocalStoreRating(payload.storeRating);
      setStoreSelectedTags(defaults);
      setStoreReviewNote(payload.reviewText ?? "");
      try {
        await persistRatings({
          storeRating: payload.storeRating,
          storeReviewTags: defaults,
          reviewText: payload.reviewText,
        });
        setStoreRatingSheetOpen(false);
      } catch {
        setLocalStoreRating(serverStoreRating);
        setStoreSelectedTags(order.storeReviewTags ?? []);
      }
    },
    [persistRatings, serverStoreRating, order.storeReviewTags]
  );

  const handleDeliveryStarPress = useCallback(
    (stars: number) => {
      if (deliveryRatedOnServer || submitting) return;
      setDeliverySheetInitialRating(stars);
      setDeliveryRatingSheetOpen(true);
    },
    [deliveryRatedOnServer, submitting]
  );

  const handleDeliverySheetSubmit = useCallback(
    async (payload: { deliveryRating: number; tags: string[] }) => {
      setLocalDeliveryRating(payload.deliveryRating);
      setRiderSelectedTags(payload.tags);
      try {
        await persistRatings({
          deliveryRating: payload.deliveryRating,
          riderReviewTags: payload.tags,
          riderReviewText: riderReviewNote.trim() || undefined,
        });
        setDeliveryRatingSheetOpen(false);
      } catch {
        setLocalDeliveryRating(serverDeliveryRating);
        setRiderSelectedTags(order.riderReviewTags ?? []);
      }
    },
    [persistRatings, riderReviewNote, serverDeliveryRating, order.riderReviewTags]
  );

  const normalizeRiderPhone = useCallback(() => {
    const phone = order.rider?.phone?.replace(/\D/g, "");
    if (!phone) return null;
    return phone.length === 10 ? `+91${phone}` : phone.startsWith("+") ? phone : `+${phone}`;
  }, [order.rider?.phone]);

  const handleCallRider = useCallback(() => {
    const normalized = normalizeRiderPhone();
    if (!normalized) {
      Alert.alert("Unavailable", "Delivery partner contact is not available.");
      return;
    }
    Linking.openURL(`tel:${normalized}`).catch(() => {});
  }, [normalizeRiderPhone]);

  const handleCallRestaurant = useCallback(() => {
    const digits = order.merchantPhone?.replace(/\D/g, "") ?? "";
    if (!digits) {
      onOpenMerchant();
      return;
    }
    const tel = digits.length === 10 ? `+91${digits}` : digits.startsWith("+") ? digits : `+${digits}`;
    void Linking.openURL(`tel:${tel}`);
  }, [order.merchantPhone, onOpenMerchant]);

  const handleMessageRider = useCallback(() => {
    router.push({
      pathname: "/orders/partner-chat",
      params: {
        orderId: order.orderId,
        partnerName: riderName,
        restaurantName,
        ...(order.rider?.phone ? { partnerPhone: order.rider.phone } : {}),
        ...(order.rider?.photoUrl ? { partnerPhoto: order.rider.photoUrl } : {}),
      },
    });
  }, [router, order, riderName, restaurantName]);

  const handleTipPaid = useCallback(
    (amount: number) => {
      setLocalTipAmount(amount);
      void queryClient.invalidateQueries({ queryKey: ["order", order.orderId] });
    },
    [queryClient, order.orderId]
  );

  const riderRatingSection =
    deliveryRatedOnServer ? (
      <View style={styles.rateDoneRow}>
        <Ionicons name="hand-left-outline" size={18} color={MUTED} style={styles.rowIcon} />
        <View style={styles.rateDoneText}>
          <Text style={styles.rateDoneTitle}>Thank you for rating!</Text>
          <Text style={styles.rateDoneSub}>You rated {displayDeliveryRating} ★</Text>
        </View>
      </View>
    ) : (
      <View style={styles.rateRow}>
        <Ionicons name="hand-left-outline" size={18} color={MUTED} style={styles.rowIcon} />
        <View style={styles.rateTextWrap}>
          <Text style={styles.rateTitle}>Rate {riderFirstName}</Text>
          <InlineStars
            value={localDeliveryRating}
            onPress={(n) => handleDeliveryStarPress(n)}
          />
        </View>
      </View>
    );

  const headerTopPadding =
    (insets.top > 0 ? insets.top : DEFAULT_STATUS_BAR_HEIGHT) + STATUS_BAR_TO_HEADER_GAP;

  return (
    <View style={styles.screen}>
      <StatusBar style="light" backgroundColor={HEADER_GREEN} />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={{ paddingBottom: insets.bottom + 28 }}
        showsVerticalScrollIndicator={false}
      >
        <LinearGradient
          colors={[HEADER_GREEN, ZOMATO_GREEN, ZOMATO_GREEN_LIGHT, PAGE_BG]}
          locations={[0, 0.12, 0.42, 0.92]}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={[styles.receiptHeroBg, { paddingTop: headerTopPadding }]}
        >
          <View style={styles.heroTopRow}>
            <TouchableOpacity onPress={onBack} hitSlop={12} style={styles.heroSideBtnLeft}>
              <Ionicons name="arrow-back" size={22} color="#fff" />
            </TouchableOpacity>
            <Text style={styles.heroRestaurant} numberOfLines={1}>
              {restaurantName}
            </Text>
            <View style={styles.heroSideBtnRight} />
          </View>

          <View style={styles.receiptSlotOuter}>
            <View style={styles.receiptRollerWrap} pointerEvents="none">
              <View style={styles.receiptRollerOuter}>
                <View style={styles.receiptRollerInner} />
              </View>
            </View>
            <View style={styles.receiptCard}>
              <Text style={styles.receiptTitle}>
                Order delivered at{" "}
                <Text style={styles.receiptTitleBold}>{deliveryLabel}</Text>
              </Text>
              {deliveredTime ? (
                <Text style={styles.receiptSub}>Delivered at {deliveredTime}</Text>
              ) : null}
              <AppAssetImage
                assetKey={CX.orders.postDeliveryHero}
                style={styles.receiptHero}
                contentFit="contain"
              />
              <Text style={styles.receiptThanks}>Thank your delivery partner</Text>
              {displayTipAmount <= 0 ? (
                <TouchableOpacity
                  style={styles.tipCta}
                  onPress={() => setTipSheetVisible(true)}
                  activeOpacity={0.9}
                >
                  <Text style={styles.tipCtaText}>Leave them a tip</Text>
                </TouchableOpacity>
              ) : (
                <Text style={styles.tipDone}>You tipped ₹{displayTipAmount} — thank you!</Text>
              )}
            </View>
            <ReceiptTornEdge />
          </View>
        </LinearGradient>

        <View style={{ paddingHorizontal: 16 }}>
        <View style={styles.mainCard}>
          <View style={styles.restaurantRow}>
            <View style={styles.logo}>
              {bannerUri ? (
                <Image source={{ uri: bannerUri }} style={styles.logoImg} contentFit="cover" />
              ) : (
                <Text style={styles.logoInitial}>{restaurantName.slice(0, 1).toUpperCase()}</Text>
              )}
            </View>
            <View style={styles.restaurantInfo}>
              <Text style={styles.restaurantName} numberOfLines={1}>
                {restaurantName}
              </Text>
              {!!merchantArea && (
                <Text style={styles.restaurantArea} numberOfLines={1}>
                  {merchantArea}
                </Text>
              )}
            </View>
            <TouchableOpacity
              style={styles.callBtn}
              onPress={handleCallRestaurant}
              activeOpacity={0.85}
            >
              <Ionicons name="call" size={18} color={ZOMATO_RED} />
            </TouchableOpacity>
          </View>

          <DashedDivider />

          <TouchableOpacity style={styles.orderRow} activeOpacity={0.85}>
            <MaterialCommunityIcons
              name="receipt-text-outline"
              size={18}
              color={MUTED}
              style={styles.rowIcon}
            />
            <View style={styles.orderTextWrap}>
              <Text style={styles.orderIdLabel}>Order #{displayOrderId}</Text>
              {itemsPreview ? (
                <View style={styles.itemPreviewRow}>
                  {items[0]?.vegNonVeg ? (
                    <DietIndicator type={resolveOrderItemDiet(items[0].vegNonVeg) ?? "veg"} />
                  ) : null}
                  <Text style={styles.itemPreview} numberOfLines={1}>
                    {itemsPreview}
                  </Text>
                </View>
              ) : null}
            </View>
            <Ionicons name="chevron-forward" size={18} color="#C4C4C4" />
          </TouchableOpacity>

          <DashedDivider />

          {alreadySubmitted ? (
            <View style={styles.rateDoneRow}>
              <Ionicons name="hand-left-outline" size={18} color={MUTED} style={styles.rowIcon} />
              <View style={styles.rateDoneText}>
                <Text style={styles.rateDoneTitle}>Thank you for rating!</Text>
                <Text style={styles.rateDoneSub}>You rated {displayStoreRating} ★</Text>
              </View>
            </View>
          ) : (
            <View style={styles.rateRow}>
              <Ionicons name="hand-left-outline" size={18} color={MUTED} style={styles.rowIcon} />
              <View style={styles.rateTextWrap}>
                <Text style={styles.rateTitle}>Rate {restaurantName}</Text>
                <InlineStars
                  value={localStoreRating}
                  onPress={(n) => handleStoreStarPress(n)}
                />
              </View>
            </View>
          )}

          <DashedDivider />

          <TouchableOpacity style={styles.hearRow} activeOpacity={0.85}>
            <Ionicons name="storefront-outline" size={18} color={MUTED} style={styles.rowIcon} />
            <Text style={styles.hearText}>Hear from restaurants</Text>
            <Ionicons name="chevron-forward" size={18} color="#C4C4C4" />
          </TouchableOpacity>

          <DashedDivider />

          <View style={styles.packagingBlock}>
            <View style={styles.packagingHead}>
              <Ionicons name="bag-outline" size={18} color={MUTED} style={styles.rowIcon} />
              <Text style={styles.packagingTitle}>
                How was the restaurant&apos;s packaging?
                {packagingFeedback === "good" ? (
                  <Text style={styles.packagingAnswer}> Good</Text>
                ) : packagingFeedback === "bad" ? (
                  <Text style={styles.packagingAnswerBad}> Not good</Text>
                ) : null}
              </Text>
            </View>
            {packagingFeedback == null ? (
              <View style={styles.packagingBtns}>
                <TouchableOpacity
                  style={styles.packBtn}
                  onPress={() => void handlePackagingFeedback("good")}
                  activeOpacity={0.85}
                  disabled={feedbackSaving}
                >
                  <Text style={styles.packBtnText}>Good</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.packBtn}
                  onPress={() => void handlePackagingFeedback("bad")}
                  activeOpacity={0.85}
                  disabled={feedbackSaving}
                >
                  <Text style={styles.packBtnText}>Not good</Text>
                </TouchableOpacity>
              </View>
            ) : null}
          </View>
        </View>

        {order.rider ? (
          <DeliveryPartnerTrackingCard
            mode="delivered"
            riderName={riderName}
            riderFirstName={riderFirstName}
            riderPhotoUri={riderPhotoUri}
            riderRating={riderRating}
            deliveredOrdersCount={order.rider.deliveredOrdersCount}
            chatUnreadCount={chatUnreadCount}
            existingTipAmount={displayTipAmount}
            onMessage={handleMessageRider}
            onCall={handleCallRider}
            onTipPreset={() => setTipSheetVisible(true)}
            onSafetyPress={() => setSafetySheetVisible(true)}
            customerUniformFeedback={riderUniformFeedback}
            onCustomerUniformFeedback={(value) => void handleRiderUniformFeedback(value)}
            uniformFeedbackDisabled={riderUniformFeedback != null || feedbackSaving}
            extraSection={riderRatingSection}
          />
        ) : null}

        <DeliveredDetailsCard {...deliveryDetailsView} />

        <TouchableOpacity style={styles.helpCard} onPress={onOpenHelp} activeOpacity={0.85}>
          <AppAssetImage assetKey={CX.orders.support} style={styles.helpImage} contentFit="contain" />
          <View style={styles.helpTextWrap}>
            <Text style={styles.helpTitle}>Need help with your order?</Text>
            <Text style={styles.helpSub}>Get help & support</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color="#C4C4C4" />
        </TouchableOpacity>
        </View>
      </ScrollView>

      <DeliveryPartnerSafetyBottomSheet
        visible={safetySheetVisible}
        onClose={() => setSafetySheetVisible(false)}
      />

      {order.rider && displayTipAmount <= 0 ? (
        <FoodOrderTipSheet
          visible={tipSheetVisible}
          orderId={order.orderId}
          partnerName={riderName}
          partnerPhotoUri={riderPhotoUri}
          paymentMethodLabel={paymentMethodLabel}
          existingTipAmount={displayTipAmount}
          onClose={() => setTipSheetVisible(false)}
          onTipPaid={handleTipPaid}
        />
      ) : null}

      <RestaurantPostDeliveryRatingSheet
        visible={storeRatingSheetOpen}
        storeName={restaurantName}
        initialRating={storeSheetInitialRating}
        submitting={submitting}
        onClose={() => setStoreRatingSheetOpen(false)}
        onSubmit={(payload) => void handleStoreSheetSubmit(payload)}
      />

      <DeliveryPartnerPostRatingSheet
        visible={deliveryRatingSheetOpen}
        partnerName={riderFirstName}
        initialRating={deliverySheetInitialRating}
        submitting={submitting}
        onClose={() => setDeliveryRatingSheetOpen(false)}
        onSubmit={(payload) => void handleDeliverySheetSubmit(payload)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: PAGE_BG },
  receiptHeroBg: {
    paddingHorizontal: 16,
    paddingBottom: 0,
    overflow: "visible",
  },
  heroTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    minHeight: 36,
    position: "relative",
    marginBottom: 10,
  },
  heroSideBtnLeft: {
    position: "absolute",
    left: 0,
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  heroSideBtnRight: {
    position: "absolute",
    right: 0,
    width: 36,
    height: 36,
  },
  heroRestaurant: {
    maxWidth: "72%",
    textAlign: "center",
    fontSize: 16,
    fontWeight: "700",
    color: "#fff",
    paddingHorizontal: 8,
  },
  receiptSlotOuter: {
    marginTop: 2,
    marginBottom: 0,
    overflow: "visible",
  },
  receiptRollerWrap: {
    marginHorizontal: -6,
    zIndex: 3,
    elevation: 6,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 3,
  },
  receiptRollerOuter: {
    height: 22,
    borderRadius: 14,
    backgroundColor: ROLLER_WHITE,
    paddingHorizontal: 6,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.85)",
  },
  receiptRollerInner: {
    flex: 1,
    borderRadius: 10,
    backgroundColor: ROLLER_MINT,
  },
  receiptCard: {
    backgroundColor: "#fff",
    marginHorizontal: 8,
    marginTop: -9,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingHorizontal: 24,
    paddingTop: 22,
    paddingBottom: 16,
    alignItems: "center",
    zIndex: 2,
    ...GatiMitraColors.elevationShadow,
  },
  receiptTitle: {
    fontSize: 19,
    fontWeight: "600",
    color: TEXT,
    textAlign: "center",
    lineHeight: 26,
  },
  receiptTitleBold: { fontWeight: "800" },
  receiptSub: { fontSize: 13, color: MUTED, marginTop: 6, fontWeight: "500" },
  receiptHero: {
    width: 240,
    height: 168,
    marginTop: 8,
    marginBottom: 4,
    backgroundColor: "transparent",
  },
  receiptThanks: { fontSize: 16, fontWeight: "700", color: TEXT, marginBottom: 14 },
  tipCta: {
    backgroundColor: ZOMATO_RED,
    borderRadius: 999,
    paddingHorizontal: 34,
    paddingVertical: 14,
    minWidth: 210,
    alignItems: "center",
  },
  tipCtaText: { color: "#fff", fontSize: 15, fontWeight: "700" },
  tipDone: { fontSize: 13, color: MUTED, textAlign: "center" },
  scroll: { flex: 1 },
  mainCard: {
    backgroundColor: CARD,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 16,
    marginTop: 12,
    borderWidth: 1,
    borderColor: BORDER,
    ...GatiMitraColors.elevationShadow,
  },
  restaurantRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  logo: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: "#F3F4F6",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  logoImg: { width: 46, height: 46 },
  logoInitial: { fontSize: 18, fontWeight: "700", color: GatiMitraColors.emerald },
  restaurantInfo: { flex: 1, minWidth: 0 },
  restaurantName: { fontSize: 15, fontWeight: "700", color: TEXT },
  restaurantArea: { fontSize: 12, color: MUTED, marginTop: 3, fontWeight: "500" },
  callBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 1,
    borderColor: CALL_BTN_BORDER,
    backgroundColor: CALL_BTN_BG,
    alignItems: "center",
    justifyContent: "center",
  },
  dashedWrap: { marginVertical: 12, overflow: "hidden" },
  dashed: { fontSize: 10, color: "#E5E7EB", letterSpacing: 1 },
  rowIcon: { width: 20 },
  orderRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  orderTextWrap: { flex: 1, minWidth: 0 },
  orderIdLabel: { fontSize: 14, fontWeight: "700", color: TEXT },
  itemPreviewRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 5 },
  itemPreview: { flex: 1, fontSize: 12, color: MUTED, fontWeight: "500" },
  rateRow: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  rateDoneRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  rateTextWrap: { flex: 1 },
  rateDoneText: { flex: 1 },
  rateTitle: { fontSize: 14, fontWeight: "700", color: TEXT, marginBottom: 8 },
  rateDoneTitle: { fontSize: 14, fontWeight: "700", color: TEXT },
  rateDoneSub: { fontSize: 12, color: MUTED, marginTop: 2, fontWeight: "500" },
  inlineStars: { flexDirection: "row", gap: 6 },
  tagsWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 12,
  },
  tagChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    backgroundColor: "#fff",
  },
  tagChipActive: {
    borderColor: ZOMATO_RED,
    backgroundColor: "#FFF0F0",
  },
  tagChipText: { fontSize: 12, fontWeight: "600", color: MUTED },
  tagChipTextActive: { color: ZOMATO_RED },
  reviewInput: {
    marginTop: 10,
    minHeight: 44,
    maxHeight: 88,
    borderWidth: 1,
    borderColor: "#EBEBEB",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13,
    color: TEXT,
    backgroundColor: "#FAFAFA",
  },
  hearRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  hearText: { flex: 1, fontSize: 14, fontWeight: "700", color: TEXT },
  packagingBlock: { gap: 14 },
  packagingHead: { flexDirection: "row", alignItems: "center", gap: 10 },
  packagingTitle: { flex: 1, fontSize: 14, fontWeight: "700", color: TEXT },
  packagingAnswer: { fontWeight: "700", color: ZOMATO_GREEN },
  packagingAnswerBad: { fontWeight: "700", color: ZOMATO_RED },
  packagingBtns: {
    flexDirection: "row",
    gap: 10,
    paddingLeft: 30,
  },
  packBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: ZOMATO_RED,
    borderRadius: 10,
    paddingVertical: 13,
    alignItems: "center",
    backgroundColor: "#fff",
  },
  packBtnActive: { backgroundColor: "#FFF0F0" },
  packBtnText: { fontSize: 14, fontWeight: "700", color: ZOMATO_RED },
  packBtnTextActive: { color: ZOMATO_RED },
  detailsCard: {
    backgroundColor: CARD,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 16,
    marginTop: 12,
    borderWidth: 1,
    borderColor: BORDER,
    ...GatiMitraColors.elevationShadow,
  },
  detailRow: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  detailIcon: { marginTop: 2 },
  detailContact: { flex: 1, fontSize: 14, fontWeight: "700", color: TEXT, lineHeight: 20 },
  detailTextWrap: { flex: 1, minWidth: 0 },
  detailTitle: { fontSize: 14, fontWeight: "700", color: TEXT, lineHeight: 20 },
  detailSub: { fontSize: 12, color: MUTED, marginTop: 4, lineHeight: 18, fontWeight: "500" },
  helpCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: CARD,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginTop: 12,
    borderWidth: 1,
    borderColor: BORDER,
    ...GatiMitraColors.elevationShadow,
  },
  helpImage: { width: 48, height: 48 },
  helpTextWrap: { flex: 1 },
  helpTitle: { fontSize: 14, fontWeight: "700", color: TEXT },
  helpSub: { fontSize: 12, color: MUTED, marginTop: 2, fontWeight: "500" },
});
