/**
 * Full-page Outside Delivery Range gate — merchant header (banner + rating + address)
 * on top, then the out-of-range body + CTAs flush to the bottom safe edge.
 */

import React, { useEffect } from "react";
import {
  View,
  Modal,
  TouchableOpacity,
  StyleSheet,
  Platform,
  Image,
  ScrollView,
  StatusBar,
  BackHandler,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { AppText } from "@/components/AppText";
import { MerchantRatingBadge } from "@/components/home/MerchantRatingBadge";
import { GatiMitraColors } from "@/constants/gatimitra";
import { StoreTheme } from "@/constants/storeTheme";
import { HEADER_IMAGE_HEIGHT } from "@/features/merchant-detail/constants/layout";
import { toAbsoluteImageUrl } from "@/utils/mediaUrl";

const GREEN = "#22C55E";
const GREEN_LIGHT = "#4ADE80";
const GREEN_DARK = "#16A34A";
const RED_PILL = "#E11D48";
const PEACH_BG = "#FFF1E8";
const BIKE_HERO = require("@/assets/bikeride-phone.png");

export type CartOutsideRangeMerchant = {
  name?: string | null;
  bannerUrl?: string | null;
  avgRating?: number | null;
  totalReviews?: number | null;
  areaLabel?: string | null;
  addressLine?: string | null;
};

type Props = {
  visible: boolean;
  merchant?: CartOutsideRangeMerchant | null;
  onChangeAddress: () => void;
  onClearCart: () => void;
  /** Dismiss without clearing cart (UI back + Android system back). */
  onClose?: () => void;
};

export function CartOutsideDeliveryRangeScreen({
  visible,
  merchant,
  onChangeAddress,
  onClearCart,
  onClose,
}: Props) {
  const insets = useSafeAreaInsets();
  const bannerUri = merchant?.bannerUrl
    ? toAbsoluteImageUrl(merchant.bannerUrl) ?? merchant.bannerUrl
    : null;
  const areaText =
    merchant?.areaLabel?.trim() ||
    merchant?.addressLine?.trim() ||
    null;
  const displayName = merchant?.name?.trim() || "Restaurant";
  // Flush to physical bottom — only home-indicator / nav inset, no extra whitespace.
  const bottomPad = insets.bottom;

  useEffect(() => {
    if (!visible || !onClose) return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      onClose();
      return true;
    });
    return () => sub.remove();
  }, [visible, onClose]);

  useEffect(() => {
    if (!visible) return;
    StatusBar.setHidden(false, "none");
  }, [visible]);

  return (
    <Modal
      visible={visible}
      animationType="fade"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={styles.screen}>
        <StatusBar
          hidden={false}
          barStyle="light-content"
          backgroundColor="transparent"
          translucent
        />

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[styles.scrollContent, { paddingBottom: 128 + bottomPad }]}
          showsVerticalScrollIndicator={false}
          bounces={false}
        >
          <View style={[styles.heroWrap, { height: HEADER_IMAGE_HEIGHT + insets.top }]}>
            {bannerUri ? (
              <Image
                source={{ uri: bannerUri }}
                style={StyleSheet.absoluteFill}
                resizeMode="cover"
              />
            ) : (
              <LinearGradient
                colors={["#1F2937", "#374151"]}
                style={StyleSheet.absoluteFill}
              />
            )}
            <LinearGradient
              colors={["rgba(0,0,0,0.35)", "transparent", "rgba(0,0,0,0.15)"]}
              style={StyleSheet.absoluteFill}
            />
            {onClose ? (
              <TouchableOpacity
                style={[styles.backBtn, { top: Math.max(insets.top, 8) + 6 }]}
                onPress={onClose}
                hitSlop={14}
                accessibilityLabel="Go back"
                accessibilityRole="button"
              >
                <Ionicons name="chevron-back" size={24} color="#FFFFFF" />
              </TouchableOpacity>
            ) : null}
          </View>

          <View style={styles.infoCard}>
            <View style={styles.infoTopRow}>
              <View style={styles.nameBlock}>
                <AppText style={styles.storeName} numberOfLines={2}>
                  {displayName}
                </AppText>
              </View>
              <MerchantRatingBadge
                rating={merchant?.avgRating}
                totalReviews={merchant?.totalReviews}
                showReviewHint
                size="md"
              />
            </View>

            {areaText ? (
              <View style={styles.metaRow}>
                <Ionicons name="location-outline" size={15} color={StoreTheme.textSecondary} />
                <AppText style={styles.metaText} numberOfLines={2}>
                  {areaText}
                </AppText>
              </View>
            ) : null}
          </View>

          <View style={styles.body}>
            <View style={styles.peachBanner}>
              <View style={styles.badgePill}>
                <AppText style={styles.badgePillText}>OUTSIDE DELIVERY RANGE</AppText>
              </View>
              <AppText style={styles.peachCopy}>
                Not delivering from this restaurant as it is far away.
              </AppText>
              <View style={styles.peachPinWrap} pointerEvents="none">
                <Ionicons name="location" size={36} color={RED_PILL} />
              </View>
            </View>

            <AppText style={styles.title}>Outside Delivery Range</AppText>
            <AppText style={styles.description}>
              The restaurant in your cart doesn&apos;t deliver to your current location.
            </AppText>

            <View style={styles.illustrationWrap}>
              <Image source={BIKE_HERO} style={styles.heroImage} resizeMode="contain" fadeDuration={0} />
            </View>
          </View>
        </ScrollView>

        <View style={[styles.ctaDock, { paddingBottom: bottomPad }]}>
          <TouchableOpacity onPress={onChangeAddress} activeOpacity={0.9} style={styles.primaryTouchable}>
            <LinearGradient
              colors={[GREEN_LIGHT, GREEN, GREEN_DARK]}
              start={{ x: 0, y: 0.5 }}
              end={{ x: 1, y: 0.5 }}
              style={styles.primaryBtn}
            >
              <Ionicons name="location-outline" size={20} color="#fff" />
              <AppText style={styles.primaryBtnText}>Change Delivery Address</AppText>
            </LinearGradient>
          </TouchableOpacity>

          <TouchableOpacity onPress={onClearCart} activeOpacity={0.85} style={styles.secondaryBtn}>
            <AppText style={styles.secondaryBtnText}>Clear Cart</AppText>
          </TouchableOpacity>

          {onClose ? (
            <TouchableOpacity onPress={onClose} activeOpacity={0.85} style={styles.backLink} hitSlop={8}>
              <AppText style={styles.backLinkText}>Go back · keep cart</AppText>
            </TouchableOpacity>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
  scroll: { flex: 1 },
  scrollContent: {
    flexGrow: 1,
  },
  heroWrap: {
    width: "100%",
    backgroundColor: GatiMitraColors.mintSoft,
    overflow: "hidden",
  },
  backBtn: {
    position: "absolute",
    left: 14,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(17,24,39,0.62)",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 4,
  },
  infoCard: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    marginTop: -20,
    paddingHorizontal: 16,
    paddingTop: 18,
    paddingBottom: 14,
  },
  infoTopRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 8,
  },
  nameBlock: {
    flex: 1,
    minWidth: 0,
  },
  storeName: {
    fontSize: 22,
    fontWeight: "700",
    color: StoreTheme.textPrimary,
    lineHeight: 28,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 4,
  },
  metaText: {
    flex: 1,
    fontSize: 13,
    color: StoreTheme.textSecondary,
    fontWeight: "500",
  },
  body: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 4,
    alignItems: "center",
  },
  peachBanner: {
    width: "100%",
    backgroundColor: PEACH_BG,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 20,
    overflow: "hidden",
    minHeight: 88,
  },
  badgePill: {
    alignSelf: "flex-start",
    backgroundColor: RED_PILL,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    marginBottom: 8,
  },
  badgePillText: {
    fontSize: 10,
    fontWeight: "800",
    color: "#FFFFFF",
    letterSpacing: 0.8,
  },
  peachCopy: {
    fontSize: 14,
    fontWeight: "600",
    color: "#3F3F46",
    lineHeight: 20,
    maxWidth: "72%",
  },
  peachPinWrap: {
    position: "absolute",
    right: 18,
    top: 18,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "#FFE4E6",
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontSize: 22,
    fontWeight: "800",
    color: GatiMitraColors.textPrimaryNew,
    textAlign: "center",
    letterSpacing: -0.4,
    marginBottom: 8,
  },
  description: {
    fontSize: 15,
    fontWeight: "500",
    color: "#6B7280",
    textAlign: "center",
    lineHeight: 22,
    maxWidth: 320,
  },
  illustrationWrap: {
    marginTop: 16,
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
  },
  heroImage: {
    width: 220,
    height: 170,
  },
  ctaDock: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 20,
    paddingTop: 10,
    gap: 8,
    backgroundColor: "#FFFFFF",
  },
  primaryTouchable: {
    borderRadius: 999,
    overflow: "hidden",
  },
  primaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    minHeight: 52,
    paddingHorizontal: 24,
    borderRadius: 999,
  },
  primaryBtnText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  secondaryBtn: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 13,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    backgroundColor: "#FFFFFF",
  },
  secondaryBtnText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#374151",
  },
  backLink: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 8,
  },
  backLinkText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#6B7280",
  },
});
