/**
 * Premium Restaurant Details & Menu – GatiMitra.
 * Smart header, offers, filters, sectioned menu, floating nav, persistent cart.
 * Data from merchant_menu_items via GET /v1/merchants/:id/menu.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  SectionList,
  StyleSheet,
  Dimensions,
  Platform,
  Vibration,
  Modal,
  Pressable,
  ScrollView,
  TextInput,
  Share,
  Alert,
  useWindowDimensions,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import Animated, {
  cancelAnimation,
  runOnJS,
  useAnimatedScrollHandler,
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  withRepeat,
  withSequence,
  interpolate,
  Extrapolation,
  FadeIn,
  FadeInDown,
  createAnimatedComponent,
} from "react-native-reanimated";

const AnimatedSectionList = createAnimatedComponent(SectionList<MenuItem>) as typeof SectionList;
import { merchantService, type MenuItem, type MerchantSummary } from "@/services/merchant.service";
import { toAbsoluteImageUrl } from "@/utils/mediaUrl";
import { getRoute } from "@/services/distance.service";
import { useCartStore } from "@/store/cartStore";
import { useLocationStore } from "@/store/locationStore";
import { useStoreStatusStore } from "@/store/storeStatusStore";
import { useMerchantScrollStore } from "@/store/merchantScrollStore";
import { MerchantHeaderSkeleton, MenuListSkeleton } from "@/components/ShimmerSkeleton";
import { GroupOrderStartSheet } from "@/components/GroupOrderStartSheet";
import { ItemCustomizationSheet } from "@/components/ItemCustomizationSheet";
import { GatiMitraColors } from "@/constants/gatimitra";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const HEADER_IMAGE_HEIGHT = 220;
const HEADER_COLLAPSED_THRESHOLD = 120;
const CARD_RADIUS = 18;
const FILTER_PILL_HEIGHT = 40;
const OFFER_CARD_WIDTH = 160;

const DEFAULT_IMAGE = require("../../../public/img/ndf.png");
const BANNER_SLIDE_INTERVAL_MS = 3500;
const BANNER_CROSSFADE_MS = 600;
const BANNER_ZOOM_DURATION_MS = 6000;
const BANNER_RESUME_AFTER_MS = 3000;
const FILTER_BAR_HEIGHT = 56;
const CART_BAR_HEIGHT = 64;
const MENU_FAB_HEIGHT = 48;

type FilterId = "all" | "veg" | "nonveg" | "bestseller" | "quickprep";

function haversineKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/** Group menu by category_id / categoryName from DB. Section title = categoryName or fallback. */
function groupMenuByCategory(menu: MenuItem[]): { title: string; data: MenuItem[] }[] {
  const byKey = new Map<string, { title: string; data: MenuItem[] }>();
  menu.forEach((item) => {
    const name = (item.categoryName ?? item.category ?? "").trim() || "Other";
    const key = item.categoryId != null ? `id:${item.categoryId}` : `name:${name}`;
    if (!byKey.has(key)) byKey.set(key, { title: name, data: [] });
    byKey.get(key)!.data.push(item);
  });
  const sections = Array.from(byKey.values()).filter((s) => s.data.length > 0);
  if (sections.length === 0 && menu.length > 0) return [{ title: "Menu", data: menu }];
  return sections;
}

/** Build menu sections: smart sections (Recommended, Best in category) first, then DB categories. All from API/DB. */
function buildMenuSections(menu: MenuItem[]): { title: string; data: MenuItem[]; isSmart?: boolean }[] {
  const out: { title: string; data: MenuItem[]; isSmart?: boolean }[] = [];
  const recommended = menu.filter((m) => m.isRecommended);
  const popular = menu.filter((m) => m.isPopular);
  if (recommended.length > 0) {
    out.push({ title: "Recommended for you", data: recommended, isSmart: true });
  }
  if (popular.length > 0) {
    out.push({ title: "Best in category", data: popular, isSmart: true });
  }
  const categorySections = groupMenuByCategory(menu);
  categorySections.forEach((s) => out.push({ ...s, isSmart: false }));
  return out;
}

/** Cinematic banner: crossfade 600ms + slow zoom 6s, no frame jump. Lazy-loads next image before switch. */
function BannerCarousel({
  images,
  fallbackUri,
  height,
}: {
  images: string[];
  fallbackUri: string | null;
  height: number;
}) {
  const [index, setIndex] = useState(0);
  const indexRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const zoomScale = useSharedValue(1);
  const frontOpacity = useSharedValue(1);
  const backOpacity = useSharedValue(0);

  /** Same source as store card: `banner_url` hero first, then gallery — old order used gallery-only and ignored working fallbackUri. */
  const data = (() => {
    const seen = new Set<string>();
    const out: string[] = [];
    const add = (s: string | null | undefined) => {
      const t = typeof s === "string" ? s.trim() : "";
      if (!t || seen.has(t)) return;
      seen.add(t);
      out.push(t);
    };
    add(fallbackUri);
    for (const u of images ?? []) add(u);
    return out;
  })();
  const dataKey = data.join("|");
  const [remoteFailed, setRemoteFailed] = useState(false);
  useEffect(() => {
    setRemoteFailed(false);
  }, [dataKey]);

  const showCarousel = data.length > 1;
  indexRef.current = index;

  const runZoom = useCallback(() => {
    zoomScale.value = 1;
    zoomScale.value = withTiming(1.08, { duration: BANNER_ZOOM_DURATION_MS }, () => {
      zoomScale.value = 1;
    });
  }, [zoomScale]);

  const goToNext = useCallback(() => {
    if (data.length <= 1) return;
    const next = (indexRef.current + 1) % data.length;
    backOpacity.value = 1;
    frontOpacity.value = withTiming(0, { duration: BANNER_CROSSFADE_MS }, () => {
      indexRef.current = next;
      setIndex(next);
      zoomScale.value = 1;
      frontOpacity.value = 1;
      backOpacity.value = 0;
      runZoom();
    });
  }, [data.length, frontOpacity, backOpacity, zoomScale, runZoom]);

  useEffect(() => {
    runZoom();
  }, [runZoom]);

  useEffect(() => {
    if (!showCarousel || data.length <= 1) return;
    timerRef.current = setInterval(goToNext, BANNER_SLIDE_INTERVAL_MS);
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [showCarousel, data.length, goToNext]);

  const frontStyle = useAnimatedStyle(() => ({
    opacity: frontOpacity.value,
    transform: [{ scale: zoomScale.value }],
  }));
  const backStyle = useAnimatedStyle(() => ({
    opacity: backOpacity.value,
  }));

  if (data.length === 0 || remoteFailed) {
    return (
      <View style={[styles.headerImageWrap, { height }]}>
        <Image source={DEFAULT_IMAGE} style={[styles.headerImage, { height }]} resizeMode="cover" />
      </View>
    );
  }

  if (!showCarousel) {
    return (
      <View style={[styles.headerImageWrap, { height }]}>
        <Image
          source={{ uri: data[0] }}
          style={[styles.headerImage, { height }]}
          resizeMode="cover"
          onError={() => setRemoteFailed(true)}
        />
      </View>
    );
  }

  const currentUri = data[index];
  const nextUri = data[(index + 1) % data.length];

  return (
    <View style={[styles.headerImageWrap, { height }]}>
      <Animated.View style={[StyleSheet.absoluteFill, backStyle]}>
        <Image
          source={{ uri: nextUri }}
          style={[styles.headerImage, { width: SCREEN_WIDTH, height }]}
          resizeMode="cover"
          onError={() => setRemoteFailed(true)}
        />
      </Animated.View>
      <Animated.View style={[StyleSheet.absoluteFill, frontStyle]}>
        <Image
          source={{ uri: currentUri }}
          style={[styles.headerImage, { width: SCREEN_WIDTH, height }]}
          resizeMode="cover"
          onError={() => setRemoteFailed(true)}
        />
      </Animated.View>
      {nextUri !== currentUri && (
        <Image source={{ uri: nextUri }} style={styles.bannerPreload} resizeMode="cover" />
      )}
    </View>
  );
}

function formatNextOpenTime(ts: number): string {
  const d = new Date(ts);
  const today = new Date();
  const isTomorrow =
    d.getDate() !== today.getDate() ||
    d.getMonth() !== today.getMonth() ||
    d.getFullYear() !== today.getFullYear();
  const timeStr = d.toLocaleTimeString("en-IN", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
  return isTomorrow ? `Opens tomorrow ${timeStr}` : `Opens at ${timeStr}`;
}

function toTimestamp(v: string | number | null | undefined): number | null {
  if (v == null) return null;
  if (typeof v === "number") return v > 1e12 ? v : v * 1000;
  const t = Date.parse(String(v));
  return Number.isNaN(t) ? null : t;
}

const MemoizedMenuItemCard = React.memo(function MenuItemCard({
  item,
  quantity,
  merchantId,
  merchantName,
  onAdd,
  onIncrement,
  onDecrement,
  isStoreClosed,
}: {
  item: MenuItem;
  quantity: number;
  merchantId: string;
  merchantName: string;
  onAdd: (item: MenuItem) => void;
  onIncrement: (itemId: string, menuItemId?: number) => void;
  onDecrement: (itemId: string, menuItemId?: number) => void;
  isStoreClosed?: boolean;
}) {
  const [pressing, setPressing] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);
  const addScale = useSharedValue(1);
  const imageOpacity = useSharedValue(0);
  const shimmerOpacity = useSharedValue(0.4);
  const discountShimmer = useSharedValue(0.94);

  useEffect(() => {
    if (imageLoaded || !item.imageUrl) return;
    shimmerOpacity.value = withRepeat(
      withTiming(0.8, { duration: 600 }),
      -1,
      true
    );
    return () => {
      cancelAnimation(shimmerOpacity);
      shimmerOpacity.value = 0.4;
    };
  }, [item.imageUrl, imageLoaded, shimmerOpacity]);

  const hasDiscount = item.discountPercentage != null && item.discountPercentage > 0;
  useEffect(() => {
    if (!hasDiscount) return;
    discountShimmer.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 800 }),
        withTiming(0.94, { duration: 800 })
      ),
      -1,
      true
    );
    return () => {
      cancelAnimation(discountShimmer);
      discountShimmer.value = 0.94;
    };
  }, [hasDiscount, discountShimmer]);

  const shimmerStyle = useAnimatedStyle(() => ({ opacity: shimmerOpacity.value }));
  const discountStyle = useAnimatedStyle(() => ({
    opacity: discountShimmer.value,
  }));

  const handleAdd = useCallback(() => {
    if (isStoreClosed) return;
    if (Platform.OS === "android") Vibration.vibrate(15);
    addScale.value = withSpring(0.96, { damping: 15, stiffness: 320 }, () => {
      addScale.value = withSpring(1);
    });
    onAdd(item);
  }, [item, onAdd, addScale, isStoreClosed]);

  const addStyle = useAnimatedStyle(() => ({
    transform: [{ scale: addScale.value }],
  }));

  const imageStyle = useAnimatedStyle(() => ({
    opacity: imageOpacity.value,
  }));

  const tags: string[] = [];
  if (item.isRecommended) tags.push("Recommended");
  if (item.isPopular) tags.push("Popular");

  const prepText = item.prepTimeMinutes != null && item.prepTimeMinutes > 0
    ? `${item.prepTimeMinutes} mins`
    : null;

  return (
    <Animated.View entering={FadeInDown.duration(280).delay(0)} style={styles.itemCard}>
      <View style={styles.itemCardInner}>
        <View style={styles.itemCardLeft}>
          <View style={styles.itemCardTitleRow}>
            <View style={[styles.vegDot, !item.isVeg && styles.nonVegDot]} />
            <Text style={styles.itemName} numberOfLines={2}>{item.name}</Text>
          </View>
          {item.description ? (
            <Text style={styles.itemDesc} numberOfLines={2}>{item.description}</Text>
          ) : null}
          <View style={styles.itemTagsRow}>
            {tags.slice(0, 1).map((t) => (
              <View key={t} style={styles.itemTag}>
                <Text style={styles.itemTagText}>{t}</Text>
              </View>
            ))}
            {item.discountPercentage != null && item.discountPercentage > 0 && (
              <Animated.View style={[styles.discountTag, discountStyle]}>
                <Text style={styles.discountTagText}>{Math.round(item.discountPercentage)}% OFF</Text>
              </Animated.View>
            )}
          </View>
          {prepText ? (
            <View style={styles.prepRow}>
              <Ionicons name="time-outline" size={12} color={GatiMitraColors.textSecondary} />
              <Text style={styles.prepText}>{prepText}</Text>
            </View>
          ) : null}
          <View style={styles.itemPriceRow}>
            <Text style={styles.itemPriceEmphasis}>₹{item.price}</Text>
            <View style={styles.itemActions}>
              <TouchableOpacity hitSlop={8} style={styles.iconBtn}>
                <Ionicons name="bookmark-outline" size={18} color={GatiMitraColors.textSecondary} />
              </TouchableOpacity>
              <TouchableOpacity hitSlop={8} style={styles.iconBtn}>
                <Ionicons name="share-outline" size={18} color={GatiMitraColors.textSecondary} />
              </TouchableOpacity>
            </View>
          </View>
        </View>
        <View style={styles.itemCardRight}>
          <Animated.View style={[styles.itemImageWrap, addStyle]}>
            {item.imageUrl ? (
              <>
                <View style={[StyleSheet.absoluteFill, { backgroundColor: "#e5e7eb" }]} />
                <Animated.View style={[StyleSheet.absoluteFill, shimmerStyle]} pointerEvents="none">
                  <View style={[StyleSheet.absoluteFill, { backgroundColor: "#d1d5db" }]} />
                </Animated.View>
                <Animated.View style={[StyleSheet.absoluteFill, imageStyle]}>
                  <Image
                    source={{ uri: item.imageUrl }}
                    style={styles.itemImage}
                    resizeMode="cover"
                    onLoad={() => {
                      setImageLoaded(true);
                      cancelAnimation(shimmerOpacity);
                      shimmerOpacity.value = withTiming(0, { duration: 200 });
                      imageOpacity.value = withTiming(1, { duration: 280 });
                    }}
                  />
                </Animated.View>
                {isStoreClosed && (
                  <View style={styles.itemImageClosedOverlay} pointerEvents="none" />
                )}
              </>
            ) : (
              <>
                <Image source={DEFAULT_IMAGE} style={styles.itemImage} resizeMode="cover" />
                {isStoreClosed && (
                  <View style={styles.itemImageClosedOverlay} pointerEvents="none" />
                )}
              </>
            )}
            {quantity === 0 ? (
              <Pressable
                onPress={handleAdd}
                onPressIn={() => !isStoreClosed && setPressing(true)}
                onPressOut={() => setPressing(false)}
                style={[
                  styles.addBtnWrap,
                  pressing && !isStoreClosed && styles.addBtnPressed,
                  isStoreClosed && styles.addBtnDisabled,
                ]}
                disabled={isStoreClosed}
              >
                {isStoreClosed ? (
                  <View style={[styles.addBtn, styles.addBtnClosed]}>
                    <Text style={styles.addBtnTextDisabled}>Currently Closed</Text>
                  </View>
                ) : (
                  <LinearGradient
                    colors={GatiMitraColors.mintGradient}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={styles.addBtn}
                  >
                    <Text style={styles.addBtnText}>ADD</Text>
                    <Ionicons name="add" size={18} color="#fff" />
                  </LinearGradient>
                )}
              </Pressable>
            ) : (
              <View style={[styles.quantityWrap, isStoreClosed && styles.quantityWrapDisabled]}>
                <TouchableOpacity
                  onPress={() => {
                    if (isStoreClosed) return;
                    if (Platform.OS === "android") Vibration.vibrate(10);
                    onDecrement(item.id, item.menuItemId);
                  }}
                  style={styles.qtyBtn}
                  disabled={isStoreClosed}
                >
                  <Ionicons name="remove" size={18} color="#fff" />
                </TouchableOpacity>
                <Text style={styles.qtyText}>{quantity}</Text>
                <TouchableOpacity
                  onPress={() => {
                    if (isStoreClosed) return;
                    if (Platform.OS === "android") Vibration.vibrate(10);
                    onIncrement(item.id, item.menuItemId);
                  }}
                  style={styles.qtyBtn}
                  disabled={isStoreClosed}
                >
                  <Ionicons name="add" size={18} color="#fff" />
                </TouchableOpacity>
              </View>
            )}
          </Animated.View>
          {(item.hasVariants || item.hasAddons || item.hasCustomizations) ? (
            <View style={styles.customiseDropdown}>
              <Text style={styles.customisableText}>Customise</Text>
              <Ionicons name="chevron-down" size={14} color={GatiMitraColors.emerald} />
            </View>
          ) : null}
        </View>
      </View>
    </Animated.View>
  );
});

export default function MerchantDetailScreen() {
  const { id, openCart } = useLocalSearchParams<{ id: string; openCart?: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const merchantId = id ?? "";
  const sectionListRef = useRef<SectionList>(null);
  const [filter, setFilter] = useState<FilterId>("all");
  const [menuSheetVisible, setMenuSheetVisible] = useState(false);
  const [menuSearchQuery, setMenuSearchQuery] = useState("");
  const [optionsSheetVisible, setOptionsSheetVisible] = useState(false);
  const [groupOrderSheetVisible, setGroupOrderSheetVisible] = useState(false);
  const [reportSheetVisible, setReportSheetVisible] = useState(false);
  const [reportSubmitting, setReportSubmitting] = useState(false);
  const [customizationSheetVisible, setCustomizationSheetVisible] = useState(false);
  const [customizationItem, setCustomizationItem] = useState<MenuItem | null>(null);
  const [headerSearchExpanded, setHeaderSearchExpanded] = useState(false);
  const headerSearchInputRef = useRef<TextInput>(null);
  const { width: winWidth, height: winHeight } = useWindowDimensions();
  const menuSheetWidth = Math.round(winWidth * 0.8);
  const menuSheetHeight = Math.round(winHeight * 0.6);
  const scrollY = useSharedValue(0);

  const queryClient = useQueryClient();
  const { data: merchant, isLoading } = useQuery({
    queryKey: ["merchant", merchantId],
    queryFn: () => merchantService.getMerchantById(merchantId),
    enabled: !!merchantId,
    refetchOnWindowFocus: true,
    refetchInterval: 2 * 60 * 1000,
  });

  /** List screen often has displayImage already; detail payload can miss URLs — reuse for header banner. */
  const listCachedBanner = useMemo(() => {
    const entries = queryClient.getQueriesData<MerchantSummary[]>({ queryKey: ["merchants"] });
    for (const [, list] of entries) {
      if (!Array.isArray(list)) continue;
      const m = list.find((x) => x.id === merchantId);
      const u = m?.displayImage ?? m?.banner_url;
      if (u) return toAbsoluteImageUrl(u);
    }
    return null;
  }, [merchantId, queryClient]);

  useFocusEffect(
    useCallback(() => {
      if (merchantId) queryClient.invalidateQueries({ queryKey: ["merchant", merchantId] });
    }, [merchantId, queryClient])
  );

  const coords = useLocationStore((s) => s.coords);
  const hasOriginDest =
    coords &&
    merchant?.latitude != null &&
    merchant?.longitude != null;
  const { data: routeResult } = useQuery({
    queryKey: ["distance-route", coords?.latitude, coords?.longitude, merchant?.latitude, merchant?.longitude],
    queryFn: () =>
      getRoute({
        origin: { lat: coords!.latitude, lng: coords!.longitude },
        destination: { lat: merchant!.latitude!, lng: merchant!.longitude! },
        profile: "driving",
      }),
    enabled: !!hasOriginDest && !!merchant?.id,
    staleTime: 5 * 60 * 1000,
  });
  const addItem = useCartStore((s) => s.addItem);
  const updateQuantity = useCartStore((s) => s.updateQuantity);
  const cartItems = useCartStore((s) => s.items) ?? [];
  const cartMerchantId = useCartStore((s) => s.merchantId);
  const clearCart = useCartStore((s) => s.clearCart);

  const hasOtherRestaurantCart =
    cartMerchantId != null &&
    cartMerchantId !== merchantId &&
    cartItems.length > 0;

  const hasShownOtherRestaurantAlert = useRef(false);
  useFocusEffect(
    useCallback(() => {
      if (hasOtherRestaurantCart && !hasShownOtherRestaurantAlert.current) {
        hasShownOtherRestaurantAlert.current = true;
        Alert.alert(
          "Different restaurant",
          "Your cart contains items from another restaurant. Clear cart to continue?",
          [
            { text: "Cancel", style: "cancel", onPress: () => router.back() },
            { text: "Clear cart", style: "destructive", onPress: () => { clearCart(); } },
          ]
        );
      }
      if (!hasOtherRestaurantCart) hasShownOtherRestaurantAlert.current = false;
      return () => {};
    }, [hasOtherRestaurantCart, clearCart, router])
  );

  useEffect(() => {
    const sec = Array.isArray(sections) ? sections : [];
    if (openCart !== "1" || !merchantId || cartMerchantId !== merchantId || sec.length === 0) return;
    const t = setTimeout(() => {
      const lastSection = sec.length - 1;
      if (lastSection < 0) return;
      sectionListRef.current?.scrollToLocation({
        sectionIndex: lastSection,
        itemIndex: 0,
        viewPosition: 1,
        viewOffset: 0,
      });
    }, 600);
    return () => clearTimeout(t);
  }, [openCart, merchantId, cartMerchantId, (sections ?? []).length]);

  const getQty = useCallback(
    (itemId: string, menuItemId?: number) => {
      if (cartMerchantId !== merchantId) return 0;
      const numId = menuItemId != null ? String(menuItemId) : null;
      return cartItems.reduce((sum, i) => {
        if (i.menuItemId === itemId || i.menuItemId.startsWith(itemId + "_")) return sum + i.quantity;
        if (numId != null && (i.menuItemId === numId || i.menuItemId.startsWith(numId + "_"))) return sum + i.quantity;
        return sum;
      }, 0);
    },
    [cartMerchantId, merchantId, cartItems]
  );

  const handleAddItem = useCallback(
    (item: MenuItem) => {
      if (!merchant) return;
      const needsCustomization = !!(item.hasVariants || item.hasAddons || item.hasCustomizations);
      if (needsCustomization) {
        setCustomizationItem(item);
        setCustomizationSheetVisible(true);
      } else {
        addItem(merchantId, merchant.name, {
          menuItemId: String(item.menuItemId ?? item.id),
          name: item.name,
          price: item.price,
          isVeg: item.isVeg,
        });
      }
    },
    [merchantId, merchant?.name, merchant, addItem]
  );

  const handleCustomizationAdd = useCallback(
    (params: {
      menuItemId: string;
      name: string;
      price: number;
      quantity: number;
      isVeg: boolean;
      basePrice?: number;
      variantId?: string;
      variantName?: string;
      addons?: Array<{ addonId: string; addonName: string; addonPrice: number; quantity: number }>;
    }) => {
      if (!merchant) return;
      addItem(merchantId, merchant.name, {
        menuItemId: params.menuItemId,
        name: params.name,
        price: params.price,
        isVeg: params.isVeg,
        basePrice: params.basePrice,
        variantId: params.variantId,
        variantName: params.variantName,
        addons: params.addons,
      }, params.quantity);
      setCustomizationSheetVisible(false);
      setCustomizationItem(null);
    },
    [merchantId, merchant, addItem]
  );
  const getCartLineIdForItem = useCallback(
    (itemId: string, menuItemId?: number): string | null => {
      if (cartMerchantId !== merchantId) return null;
      const numId = menuItemId != null ? String(menuItemId) : null;
      const line = cartItems.find(
        (i) =>
          i.menuItemId === itemId ||
          i.menuItemId.startsWith(itemId + "_") ||
          (numId != null && (i.menuItemId === numId || i.menuItemId.startsWith(numId + "_")))
      );
      return line?.menuItemId ?? null;
    },
    [cartMerchantId, merchantId, cartItems]
  );

  const handleIncrement = useCallback(
    (itemId: string, menuItemId?: number) => {
      const lineId = getCartLineIdForItem(itemId, menuItemId);
      if (lineId) updateQuantity(lineId, 1);
    },
    [getCartLineIdForItem, updateQuantity]
  );
  const handleDecrement = useCallback(
    (itemId: string, menuItemId?: number) => {
      const lineId = getCartLineIdForItem(itemId, menuItemId);
      if (lineId) updateQuantity(lineId, -1);
    },
    [getCartLineIdForItem, updateQuantity]
  );

  const sections = useMemo(() => {
    const menu = merchant?.menu;
    if (!menu || !Array.isArray(menu) || menu.length === 0) return [];
    let list = menu;
    const q = menuSearchQuery.trim().toLowerCase();
    if (q) list = list.filter((m) => (m.name ?? "").toLowerCase().includes(q));
    if (filter === "veg") list = list.filter((m) => m.isVeg);
    else if (filter === "nonveg") list = list.filter((m) => !m.isVeg);
    else if (filter === "bestseller") list = list.filter((m) => m.isPopular || m.isRecommended);
    else if (filter === "quickprep") list = list.filter((m) => (m.prepTimeMinutes ?? 99) <= 15);
    return buildMenuSections(list);
  }, [merchant?.menu, filter, menuSearchQuery]);

  const setMerchantScrollY = useMerchantScrollStore((s) => s.setScrollY);
  useEffect(() => () => setMerchantScrollY(0), [setMerchantScrollY]);

  // NEVER update React/Zustand state during scroll frame – causes freeze/crash.
  // Only update scrollY (worklet) in onScroll; update store only when scroll ends.
  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (e) => {
      scrollY.value = e.contentOffset.y;
    },
    onEndDrag: (e) => {
      runOnJS(setMerchantScrollY)(e.contentOffset.y);
    },
    onMomentumScrollEnd: (e) => {
      runOnJS(setMerchantScrollY)(e.contentOffset.y);
    },
  });

  const headerImageStyle = useAnimatedStyle(() => {
    const translateY = interpolate(
      scrollY.value,
      [0, HEADER_IMAGE_HEIGHT],
      [0, -HEADER_IMAGE_HEIGHT / 2],
      Extrapolation.CLAMP
    );
    return { transform: [{ translateY }] };
  });

  const stickyTitleOpacity = useAnimatedStyle(() => {
    const opacity = interpolate(
      scrollY.value,
      [HEADER_COLLAPSED_THRESHOLD, HEADER_COLLAPSED_THRESHOLD + 40],
      [0, 1],
      Extrapolation.CLAMP
    );
    return { opacity };
  });

  const stickyHeaderVisible = useAnimatedStyle(() => {
    const opacity = interpolate(
      scrollY.value,
      [0, HEADER_COLLAPSED_THRESHOLD - 20, HEADER_COLLAPSED_THRESHOLD],
      [0, 0, 1],
      Extrapolation.CLAMP
    );
    return { opacity };
  });

  const stickyHeaderBgOpacity = useAnimatedStyle(() => {
    const opacity = interpolate(
      scrollY.value,
      [HEADER_COLLAPSED_THRESHOLD, HEADER_COLLAPSED_THRESHOLD + 30],
      [0.88, 1],
      Extrapolation.CLAMP
    );
    return { opacity };
  });

  const totalInCart = (cartItems ?? []).reduce((n, i) => n + i.quantity, 0);
  const cartTotal = (cartItems ?? []).reduce((n, i) => n + i.price * i.quantity, 0);

  const listContentContainerStyle = useMemo(
    () => ({
      paddingBottom:
        totalInCart > 0
          ? 56 + MENU_FAB_HEIGHT + 40 + insets.bottom + 14
          : MENU_FAB_HEIGHT + 88 + insets.bottom,
    }),
    [totalInCart, insets.bottom]
  );

  const scrollToSection = useCallback((sectionIndex: number, itemIndex: number = 0) => {
    setMenuSheetVisible(false);
    setTimeout(() => {
      sectionListRef.current?.scrollToLocation({
        sectionIndex,
        itemIndex,
        viewPosition: 0,
        viewOffset: HEADER_IMAGE_HEIGHT + 120,
      });
    }, 300);
  }, []);

  const openOptionsSheet = useCallback(() => setOptionsSheetVisible(true), []);
  const closeOptionsSheet = useCallback(() => setOptionsSheetVisible(false), []);
  const openReportSheet = useCallback(() => {
    setOptionsSheetVisible(false);
    setReportSheetVisible(true);
  }, []);
  const closeReportSheet = useCallback(() => setReportSheetVisible(false), []);

  const liveStatusFromStore = useStoreStatusStore((s) => s.getStatus(merchantId));
  useEffect(() => {
    if (merchant?.id != null && (merchant as { liveStatus?: "OPEN" | "CLOSED" }).liveStatus != null) {
      useStoreStatusStore.getState().setStatusFromApi(
        merchant.id,
        (merchant as { liveStatus?: "OPEN" | "CLOSED" }).liveStatus === "OPEN",
        (merchant as { liveStatus?: "OPEN" | "CLOSED" }).liveStatus
      );
    }
  }, [merchant?.id, (merchant as { liveStatus?: "OPEN" | "CLOSED" })?.liveStatus]);

  const handleShareRestaurant = useCallback(async () => {
    closeOptionsSheet();
    try {
      await Share.share({
        message: `${merchant?.name ?? "Restaurant"} – order on GatiMitra`,
        title: merchant?.name ?? "Restaurant",
      });
    } catch (_) {}
  }, [merchant?.name, closeOptionsSheet]);

  const handleReportSubmit = useCallback(
    async (reportType: string) => {
      if (!merchantId) return;
      setReportSubmitting(true);
      try {
        await merchantService.reportRestaurant(merchantId, { report_type: reportType });
        closeReportSheet();
        Alert.alert("Thank you", "Your report has been submitted.");
      } catch {
        Alert.alert("Error", "Could not submit report. Try again.");
      } finally {
        setReportSubmitting(false);
      }
    },
    [merchantId, closeReportSheet]
  );

  const REPORT_OPTIONS = [
    { id: "inaccurate_photos", label: "Inaccurate photos or descriptions" },
    { id: "pricing_issues", label: "Pricing related issues" },
    { id: "items_missing", label: "Items are missing in the menu" },
    { id: "other", label: "I have some other issue" },
  ] as const;

  if (!merchantId || (merchant == null && !isLoading)) {
    return (
      <View style={styles.centered}>
        <Text style={styles.centeredText}>Invalid merchant</Text>
      </View>
    );
  }

  if (isLoading || !merchant) {
    return (
      <View style={styles.container}>
        <MerchantHeaderSkeleton />
        <View style={{ paddingTop: 16, paddingBottom: 24 }}>
          <MenuListSkeleton count={6} />
        </View>
      </View>
    );
  }

  const distanceKm =
    routeResult != null
      ? routeResult.distanceKm
      : coords && merchant.latitude != null && merchant.longitude != null
        ? haversineKm(coords.latitude, coords.longitude, merchant.latitude, merchant.longitude)
        : null;
  const etaMinutes = routeResult?.etaMinutes ?? null;
  const prepMins = merchant.avgPreparationTimeMinutes != null && merchant.avgPreparationTimeMinutes > 0
    ? `${Math.round(merchant.avgPreparationTimeMinutes)} mins`
    : null;
  const hasOffers = Array.isArray((merchant as { offers?: unknown[] }).offers) && (merchant as { offers: unknown[] }).offers.length > 0;

  const merchantLiveStatus = (merchant as { liveStatus?: "OPEN" | "CLOSED" }).liveStatus;
  const isStoreClosed =
    (liveStatusFromStore ?? merchantLiveStatus ?? "CLOSED") === "CLOSED";
  const nextOpenTs = toTimestamp((merchant as { nextOpenAt?: string | number | null }).nextOpenAt);
  const closedStatusText =
    isStoreClosed && nextOpenTs != null
      ? `Closed • ${formatNextOpenTime(nextOpenTs)}`
      : isStoreClosed
        ? "Currently closed"
        : null;

  const filters: { id: FilterId; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
    { id: "all", label: "All", icon: "list" },
    { id: "veg", label: "Veg", icon: "leaf" },
    { id: "nonveg", label: "Non-veg", icon: "nutrition" },
    { id: "bestseller", label: "Bestseller", icon: "flame" },
    { id: "quickprep", label: "Quick prep", icon: "flash" },
  ];

  const safeSections = Array.isArray(sections) ? sections : [];

  return (
    <View style={styles.container}>
      {headerSearchExpanded ? (
        <View style={[styles.fixedSearchBar, { paddingTop: insets.top + 8, paddingBottom: 10 }]}>
          <View style={styles.fixedSearchInputWrap}>
            <Ionicons name="search" size={20} color={GatiMitraColors.textSecondary} />
            <TextInput
              ref={headerSearchInputRef}
              style={styles.fixedSearchInput}
              placeholder="Search menu items..."
              placeholderTextColor={GatiMitraColors.textSecondary}
              value={menuSearchQuery}
              onChangeText={setMenuSearchQuery}
              returnKeyType="search"
              autoFocus
              selectionColor={GatiMitraColors.emerald}
            />
          </View>
          <TouchableOpacity
            onPress={() => { setHeaderSearchExpanded(false); setMenuSearchQuery(""); }}
            style={styles.fixedSearchCloseBtn}
            hitSlop={8}
          >
            <Ionicons name="close" size={24} color={GatiMitraColors.textPrimary} />
          </TouchableOpacity>
        </View>
      ) : null}

      <Animated.View style={[styles.stickyHeaderBarWrap, stickyHeaderVisible]} pointerEvents="box-none">
        <Animated.View
          style={[styles.stickyHeaderBar, styles.stickyHeaderBarCompact, { paddingTop: insets.top + 8 }]}
          pointerEvents="box-none"
        >
          <Animated.View style={[StyleSheet.absoluteFill, styles.stickyHeaderBarBg, stickyHeaderBgOpacity]} />
          <Animated.View style={styles.stickyHeaderRowWrap} pointerEvents="box-none">
          <View style={styles.stickyHeaderRow}>
            <TouchableOpacity onPress={() => router.back()} style={styles.stickyBackBtn} hitSlop={8}>
              <Ionicons name="arrow-back" size={24} color={GatiMitraColors.textPrimary} />
            </TouchableOpacity>
            <Animated.View style={[styles.stickySearchWrap, { flex: 1 }, stickyTitleOpacity]}>
              <Ionicons name="search" size={18} color={GatiMitraColors.textSecondary} />
              <TextInput
                style={styles.stickySearchInput}
                placeholder={`Search in ${merchant.name}`}
                placeholderTextColor={GatiMitraColors.textSecondary}
                value={menuSearchQuery}
                onChangeText={setMenuSearchQuery}
                returnKeyType="search"
              />
            </Animated.View>
            <TouchableOpacity onPress={openOptionsSheet} style={styles.stickyMenuBtn} hitSlop={8}>
              <Ionicons name="ellipsis-vertical" size={22} color={GatiMitraColors.textPrimary} />
            </TouchableOpacity>
          </View>
        </Animated.View>
        </Animated.View>
      </Animated.View>

      <Animated.View
        style={[
          styles.stickyFilterBar,
          { top: insets.top + 62, paddingHorizontal: 16 },
          stickyHeaderVisible,
        ]}
        pointerEvents="box-none"
      >
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterScroll}
          snapToInterval={92}
          snapToAlignment="start"
          decelerationRate="fast"
        >
          {filters.map((f) => (
            <TouchableOpacity
              key={f.id}
              onPress={() => setFilter(f.id)}
              style={[styles.filterPill, filter === f.id && styles.filterPillActive]}
            >
              <Ionicons
                name={f.icon}
                size={16}
                color={filter === f.id ? "#fff" : GatiMitraColors.textSecondary}
              />
              <Text style={[styles.filterPillText, filter === f.id && styles.filterPillTextActive]}>
                {f.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </Animated.View>

      <AnimatedSectionList
        ref={sectionListRef}
        style={styles.sectionList}
        sections={safeSections}
        keyExtractor={(item) => item.id}
        extraData={{ cartMerchantId, cartCount: (cartItems ?? []).length }}
        stickySectionHeadersEnabled
        onScroll={scrollHandler}
        scrollEventThrottle={16}
        scrollEnabled={true}
        showsVerticalScrollIndicator={true}
        onScrollToIndexFailed={() => {
          if (safeSections.length === 0) return;
          setTimeout(() => {
            sectionListRef.current?.scrollToLocation({
              sectionIndex: safeSections.length - 1,
              itemIndex: 0,
              viewPosition: 0,
              viewOffset: HEADER_IMAGE_HEIGHT + 120,
            });
          }, 150);
        }}
        contentContainerStyle={listContentContainerStyle}
        removeClippedSubviews={true}
        initialNumToRender={8}
        maxToRenderPerBatch={10}
        windowSize={6}
        ListHeaderComponent={
          <>
            <Animated.View style={[styles.headerImageWrap, headerImageStyle]}>
              <BannerCarousel
                images={merchant.bannerImages ?? []}
                fallbackUri={
                  merchant.imageUrl ??
                  merchant.displayImage ??
                  merchant.banner_url ??
                  listCachedBanner ??
                  null
                }
                height={HEADER_IMAGE_HEIGHT}
              />
              <LinearGradient
                colors={["rgba(0,0,0,0.55)", "rgba(0,0,0,0.25)", "transparent"]}
                locations={[0, 0.4, 0.85]}
                style={StyleSheet.absoluteFill}
                pointerEvents="none"
              />
              <View style={[styles.headerIcons, { top: insets.top + 8 }]} pointerEvents="box-none">
                <TouchableOpacity onPress={() => router.back()} style={styles.headerIconBtn} hitSlop={8}>
                  <Ionicons name="arrow-back" size={24} color="#fff" />
                </TouchableOpacity>
                <View style={styles.headerIconsRight}>
                  <TouchableOpacity
                    style={styles.headerIconBtn}
                    onPress={() => { setHeaderSearchExpanded(true); setTimeout(() => headerSearchInputRef.current?.focus(), 150); }}
                    hitSlop={8}
                  >
                    <Ionicons name="search" size={20} color="#fff" />
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.headerIconBtn} onPress={openOptionsSheet} hitSlop={8}>
                    <Ionicons name="ellipsis-vertical" size={20} color="#fff" />
                  </TouchableOpacity>
                </View>
              </View>
              <View style={[styles.headerInfo, { paddingBottom: 14 }]} pointerEvents="box-none">
                <Text style={styles.headerName} numberOfLines={2}>{merchant.name}</Text>
                <View style={styles.headerMetaRowWrap} pointerEvents="none">
                  <View style={styles.headerMetaRow}>
                    <View style={styles.ratingBadge}>
                      <Ionicons name="star" size={14} color="#fff" />
                      <Text style={styles.ratingText}>{merchant.rating ?? "—"}</Text>
                    </View>
                    {distanceKm != null ? (
                      <Text style={styles.headerMetaText}> · {distanceKm < 1 ? `${Math.round(distanceKm * 1000)} m` : `${distanceKm.toFixed(1)} km`}</Text>
                    ) : null}
                    {etaMinutes != null ? (
                      <Text style={styles.headerMetaText}> · ~{etaMinutes} min</Text>
                    ) : null}
                    {merchant.city ? (
                      <Text style={styles.headerMetaText}> · {merchant.city}</Text>
                    ) : null}
                    {prepMins ? (
                      <Text style={styles.headerMetaText}> · {prepMins}</Text>
                    ) : null}
                  </View>
                </View>
                <View style={styles.headerStatusRow}>
                  <View style={styles.headerStatusRowLeft}>
                    <View style={[styles.headerStatusPill, isStoreClosed && styles.headerStatusPillClosed]}>
                      <Ionicons name={isStoreClosed ? "close-circle" : "checkmark-circle"} size={14} color="#fff" />
                      <Text style={styles.headerStatusPillText}>{isStoreClosed ? "CLOSED" : "OPEN"}</Text>
                    </View>
                    {isStoreClosed && closedStatusText ? (
                      <Text style={styles.trustText}>{closedStatusText}</Text>
                    ) : null}
                  </View>
                  <TouchableOpacity
                    onPress={() => setGroupOrderSheetVisible(true)}
                    style={styles.headerGroupOrderWrap}
                    activeOpacity={0.85}
                  >
                    <LinearGradient
                      colors={["#0d9488", "#14b8a6"]}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 0 }}
                      style={styles.headerGroupOrderBtn}
                    >
                      <Ionicons name="people" size={14} color="#fff" />
                      <Text style={styles.headerGroupOrderText}>Group Order</Text>
                    </LinearGradient>
                  </TouchableOpacity>
                </View>
              </View>
            </Animated.View>

            {isStoreClosed ? (
              <View style={styles.closedBanner}>
                <Ionicons name="time-outline" size={20} color="#fff" />
                <Text style={styles.closedBannerText}>Currently closed — you can explore the menu. Ordering will resume soon.</Text>
              </View>
            ) : null}

            {hasOffers ? (
              <View style={styles.offersSection}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.offersScroll}>
                  {(merchant as { offers: Array<{ label?: string }> }).offers.map((offer, idx) => (
                    <View key={idx} style={styles.offerCard}>
                      <Ionicons name="pricetag" size={18} color={GatiMitraColors.emerald} />
                      <Text style={styles.offerCardText}>{offer.label ?? "Offer"}</Text>
                    </View>
                  ))}
                </ScrollView>
              </View>
            ) : null}

            <View style={styles.filterBar}>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.filterScroll}
                snapToInterval={92}
                snapToAlignment="start"
                decelerationRate="fast"
              >
                {filters.map((f) => (
                  <TouchableOpacity
                    key={f.id}
                    onPress={() => setFilter(f.id)}
                    style={[styles.filterPill, filter === f.id && styles.filterPillActive]}
                  >
                    <Ionicons
                      name={f.icon}
                      size={16}
                      color={filter === f.id ? "#fff" : GatiMitraColors.textSecondary}
                    />
                    <Text style={[styles.filterPillText, filter === f.id && styles.filterPillTextActive]}>
                      {f.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>

            {safeSections.length > 0 && (
              <View style={styles.recommendSection}>
                <Text style={styles.recommendTitle}>Best in {safeSections[0]?.title ?? "Menu"}</Text>
                <Text style={styles.recommendSub}>Customers love these</Text>
              </View>
            )}
          </>
        }
        renderSectionHeader={({ section: { title } }) => (
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionHeaderText}>{title}</Text>
          </View>
        )}
        renderItem={({ item }) => (
          <MemoizedMenuItemCard
            item={item}
            quantity={getQty(item.id, item.menuItemId)}
            merchantId={merchantId}
            merchantName={merchant.name}
            onAdd={handleAddItem}
            onIncrement={handleIncrement}
            onDecrement={handleDecrement}
            isStoreClosed={isStoreClosed}
          />
        )}
        ListEmptyComponent={
          <View style={styles.emptyMenu}>
            <Text style={styles.emptyMenuText}>No items match the selected filters.</Text>
          </View>
        }
      />

      <TouchableOpacity
        onPress={() => setMenuSheetVisible(true)}
        style={[
          styles.menuFab,
          {
            bottom:
              (totalInCart > 0 ? CART_BAR_HEIGHT + 16 + insets.bottom : 24 + insets.bottom / 2),
          },
        ]}
        activeOpacity={0.9}
      >
        <Ionicons name="restaurant" size={22} color="#fff" />
        <Text style={styles.menuFabText}>Menu</Text>
      </TouchableOpacity>

      <Modal visible={menuSheetVisible} transparent animationType="slide">
        <Pressable style={styles.sheetOverlay} onPress={() => setMenuSheetVisible(false)}>
          <TouchableOpacity
            style={[styles.menuSheetCloseBtnFloating, { bottom: menuSheetHeight + 10 }]}
            onPress={() => setMenuSheetVisible(false)}
            hitSlop={12}
            activeOpacity={0.8}
          >
            <Ionicons name="close" size={22} color="#fff" />
          </TouchableOpacity>
          <View style={styles.menuSheetOuter} pointerEvents="box-none">
            <Pressable
              style={[styles.menuSheet, { width: menuSheetWidth, height: menuSheetHeight }]}
              onPress={(e) => e.stopPropagation()}
            >
              <View style={styles.menuSheetHandle} />
              <Text style={styles.menuSheetLabel}>Menu</Text>
              <View style={styles.menuSheetHeader}>
                <Text style={styles.menuSheetTitle}>Jump to section</Text>
                <View style={styles.menuSheetBadge}>
                  <Text style={styles.menuSheetBadgeText}>
                    {safeSections.reduce((n, s) => n + (Array.isArray(s.data) ? s.data.length : 0), 0)}
                  </Text>
                </View>
              </View>
              <ScrollView
                style={styles.menuSheetList}
                contentContainerStyle={styles.menuSheetListContent}
                showsVerticalScrollIndicator={true}
                bounces={true}
              >
                {safeSections.map((section, index) => {
                  const items = Array.isArray(section.data) ? section.data : [];
                  return (
                    <View key={`${section.title}-${index}`} style={styles.menuSheetSectionBlock}>
                      <View style={styles.menuSheetRow}>
                        <View style={styles.menuSheetRowLeft}>
                          <Text style={styles.menuSheetRowText} numberOfLines={1}>{section.title}</Text>
                          {section.isSmart && (
                            <View style={styles.menuSheetRowTag}>
                              <Ionicons name="sparkles" size={14} color={GatiMitraColors.emerald} />
                            </View>
                          )}
                        </View>
                        <View style={styles.menuSheetRowRight}>
                          <Text style={styles.menuSheetRowCount}>{items.length}</Text>
                          <TouchableOpacity
                            hitSlop={12}
                            onPress={() => { scrollToSection(index); setMenuSheetVisible(false); }}
                            style={styles.menuSheetGoBtn}
                          >
                            <Text style={styles.menuSheetGoText}>Go</Text>
                          </TouchableOpacity>
                          <Ionicons name="chevron-down" size={18} color={GatiMitraColors.textSecondary} style={styles.menuSheetExpandIcon} />
                        </View>
                      </View>
                      {items.length > 0 ? (
                        <View style={styles.menuSheetDropdown}>
                          {items.map((item, itemIndex) => (
                            <TouchableOpacity
                              key={item.id}
                              activeOpacity={0.7}
                              onPress={() => { scrollToSection(index, itemIndex); setMenuSheetVisible(false); }}
                              style={styles.menuSheetDropdownItem}
                            >
                              <Text style={styles.menuSheetDropdownItemText} numberOfLines={1}>{item.name}</Text>
                              <Ionicons name="chevron-forward" size={14} color={GatiMitraColors.textSecondary} />
                            </TouchableOpacity>
                          ))}
                        </View>
                      ) : null}
                    </View>
                  );
                })}
              </ScrollView>
            </Pressable>
          </View>
        </Pressable>
      </Modal>

      <Modal visible={optionsSheetVisible} transparent animationType="slide">
        <Pressable style={styles.sheetOverlay} onPress={closeOptionsSheet}>
          <Pressable style={[styles.optionsSheet, { paddingBottom: insets.bottom + 24 }]} onPress={(e) => e.stopPropagation()}>
            <View style={styles.sheetHandle} />
            <Text style={styles.optionsSheetTitle}>{merchant.name}</Text>
            <TouchableOpacity style={styles.optionRow} onPress={() => { closeOptionsSheet(); /* Add to Collection */ }}>
              <Ionicons name="bookmark-outline" size={22} color={GatiMitraColors.textPrimary} />
              <Text style={styles.optionRowText}>Add to Collection</Text>
              <Ionicons name="chevron-forward" size={20} color={GatiMitraColors.textSecondary} />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.optionRow}
              onPress={() => { closeOptionsSheet(); setGroupOrderSheetVisible(true); }}
            >
              <Ionicons name="people-outline" size={22} color={GatiMitraColors.textPrimary} />
              <Text style={styles.optionRowText}>Group Order</Text>
              <Ionicons name="chevron-forward" size={20} color={GatiMitraColors.textSecondary} />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.optionRow}
              onPress={() => { closeOptionsSheet(); router.push(`/home/merchant/about/${merchantId}`); }}
            >
              <Ionicons name="information-circle-outline" size={22} color={GatiMitraColors.textPrimary} />
              <Text style={styles.optionRowText}>See more about this restaurant</Text>
              <Ionicons name="chevron-forward" size={20} color={GatiMitraColors.textSecondary} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.optionRow} onPress={handleShareRestaurant}>
              <Ionicons name="share-outline" size={22} color={GatiMitraColors.textPrimary} />
              <Text style={styles.optionRowText}>Share this restaurant</Text>
              <Ionicons name="chevron-forward" size={20} color={GatiMitraColors.textSecondary} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.optionRow} onPress={closeOptionsSheet}>
              <Ionicons name="eye-off-outline" size={22} color={GatiMitraColors.textPrimary} />
              <Text style={styles.optionRowText}>Hide this restaurant</Text>
              <Ionicons name="chevron-forward" size={20} color={GatiMitraColors.textSecondary} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.optionRow} onPress={openReportSheet}>
              <Ionicons name="warning-outline" size={22} color={GatiMitraColors.textPrimary} />
              <Text style={styles.optionRowText}>Report fraud or bad practices</Text>
              <Ionicons name="chevron-forward" size={20} color={GatiMitraColors.textSecondary} />
            </TouchableOpacity>
            <Text style={styles.optionSheetFooter}>
              Menu items, prices, photos and descriptions are set by the restaurant. Report incorrect information.
            </Text>
          </Pressable>
        </Pressable>
      </Modal>

      <GroupOrderStartSheet
        visible={groupOrderSheetVisible}
        onClose={() => setGroupOrderSheetVisible(false)}
        storeId={merchantId}
        storeName={merchant?.name ?? ""}
        onStarted={() => setGroupOrderSheetVisible(false)}
      />

      {customizationItem && (
        <ItemCustomizationSheet
          visible={customizationSheetVisible}
          onClose={() => { setCustomizationSheetVisible(false); setCustomizationItem(null); }}
          storeId={merchantId}
          item={customizationItem}
          merchantName={merchant?.name ?? ""}
          isStoreClosed={isStoreClosed}
          onAdd={handleCustomizationAdd}
        />
      )}

      <Modal visible={reportSheetVisible} transparent animationType="slide">
        <Pressable style={styles.sheetOverlay} onPress={closeReportSheet}>
          <Pressable style={[styles.reportSheet, { paddingBottom: insets.bottom + 24 }]} onPress={(e) => e.stopPropagation()}>
            <View style={styles.sheetHandle} />
            <Text style={styles.reportSheetTitle}>Report an issue with the menu</Text>
            <Text style={styles.reportSheetSub}>This feedback will be shared directly with the restaurant.</Text>
            {REPORT_OPTIONS.map((opt) => (
              <TouchableOpacity
                key={opt.id}
                style={styles.reportOptionRow}
                onPress={() => handleReportSubmit(opt.id)}
                disabled={reportSubmitting}
              >
                <Text style={styles.reportOptionText}>{opt.label}</Text>
                <Ionicons name="chevron-forward" size={20} color={GatiMitraColors.textSecondary} />
              </TouchableOpacity>
            ))}
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: GatiMitraColors.background,
  },
  sectionList: {
    flex: 1,
  },
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  centeredText: {
    fontSize: 16,
    color: GatiMitraColors.textSecondary,
  },
  loadingBg: {
    backgroundColor: GatiMitraColors.background,
  },
  stickyHeaderBarWrap: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    zIndex: 10,
  },
  stickyHeaderBar: {
    position: "relative",
    left: 0,
    right: 0,
    paddingHorizontal: 12,
    paddingBottom: 10,
    ...GatiMitraColors.elevationShadow,
  },
  stickyHeaderBarCompact: {
    minHeight: 64,
  },
  stickyHeaderBarBg: {
    backgroundColor: "#fff",
    borderRadius: 0,
  },
  stickyHeaderRowWrap: {
    zIndex: 1,
  },
  stickyHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  stickyBackBtn: { padding: 6 },
  stickySearchWrap: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: GatiMitraColors.surfaceWarm,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
  },
  stickySearchInput: {
    flex: 1,
    fontSize: 15,
    color: GatiMitraColors.textPrimary,
    paddingVertical: 0,
  },
  stickyMenuBtn: { padding: 6 },
  optionsSheet: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: GatiMitraColors.background,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingTop: 8,
    maxHeight: "80%",
  },
  optionsSheetTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: GatiMitraColors.textPrimary,
    marginBottom: 16,
  },
  optionRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    gap: 14,
    borderBottomWidth: 1,
    borderBottomColor: GatiMitraColors.border,
  },
  optionRowText: { flex: 1, fontSize: 16, fontWeight: "600", color: GatiMitraColors.textPrimary },
  optionSheetFooter: {
    fontSize: 12,
    color: GatiMitraColors.textSecondary,
    marginTop: 16,
    lineHeight: 18,
  },
  reportSheet: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: GatiMitraColors.background,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingTop: 8,
    maxHeight: "70%",
  },
  reportSheetTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: GatiMitraColors.textPrimary,
    marginBottom: 6,
  },
  reportSheetSub: {
    fontSize: 14,
    color: GatiMitraColors.textSecondary,
    marginBottom: 16,
  },
  reportOptionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: GatiMitraColors.border,
  },
  reportOptionText: { fontSize: 16, fontWeight: "500", color: GatiMitraColors.textPrimary },
  headerImageWrap: {
    height: HEADER_IMAGE_HEIGHT,
    width: SCREEN_WIDTH,
    overflow: "hidden",
  },
  headerImage: {
    width: SCREEN_WIDTH,
    height: HEADER_IMAGE_HEIGHT,
  },
  bannerPreload: {
    position: "absolute",
    width: 1,
    height: 1,
    opacity: 0,
    left: -10,
  },
  headerIcons: {
    position: "absolute",
    left: 0,
    right: 0,
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    zIndex: 2,
  },
  headerIconBtn: {
    padding: 8,
  },
  headerIconsRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  fixedSearchBar: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 1000,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    gap: 10,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(0,0,0,0.08)",
    ...Platform.select({
      ios: { shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4 },
      android: { elevation: 4 },
    }),
  },
  fixedSearchInputWrap: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: GatiMitraColors.surfaceWarm,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
  },
  fixedSearchInput: {
    flex: 1,
    fontSize: 16,
    color: GatiMitraColors.textPrimaryNew,
    paddingVertical: 0,
    minWidth: 0,
  },
  fixedSearchCloseBtn: {
    padding: 6,
  },
  headerGroupOrderWrap: {
    borderRadius: 20,
    overflow: "hidden",
    backgroundColor: "rgba(255,255,255,0.2)",
  },
  headerGroupOrderBtn: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    paddingHorizontal: 12,
    gap: 6,
  },
  headerGroupOrderText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#fff",
  },
  headerInfo: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    padding: 16,
    zIndex: 2,
  },
  headerName: {
    fontSize: 22,
    fontWeight: "800",
    color: "#fff",
    marginBottom: 6,
    textShadowColor: "rgba(0,0,0,0.75)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  headerMetaRowWrap: {
    alignSelf: "flex-start",
    backgroundColor: "rgba(0,0,0,0.5)",
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginBottom: 6,
  },
  headerMetaRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  ratingBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.2)",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    gap: 4,
  },
  ratingText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#fff",
  },
  headerMetaText: {
    fontSize: 13,
    color: "#fff",
    marginLeft: 6,
  },
  headerStatusRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 6,
    gap: 8,
  },
  headerStatusRowLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flex: 1,
  },
  headerStatusPill: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: GatiMitraColors.emerald,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
    gap: 4,
  },
  headerStatusPillClosed: {
    backgroundColor: GatiMitraColors.closedRed,
  },
  headerStatusPillText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#fff",
  },
  trustText: {
    fontSize: 13,
    color: "rgba(255,255,255,0.95)",
    fontWeight: "600",
  },
  offersSection: {
    paddingVertical: 12,
    backgroundColor: GatiMitraColors.background,
  },
  offersScroll: {
    paddingHorizontal: 16,
    gap: 10,
  },
  offerCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: GatiMitraColors.cardBg,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 12,
    marginRight: 10,
    borderWidth: 1,
    borderColor: GatiMitraColors.border,
    gap: 8,
    minWidth: OFFER_CARD_WIDTH,
  },
  offerCardText: {
    fontSize: 14,
    fontWeight: "600",
    color: GatiMitraColors.textPrimary,
  },
  filterBar: {
    paddingVertical: 10,
    backgroundColor: GatiMitraColors.background,
    borderBottomWidth: 1,
    borderBottomColor: GatiMitraColors.border,
  },
  stickyFilterBar: {
    position: "absolute",
    left: 0,
    right: 0,
    height: FILTER_PILL_HEIGHT + 16,
    justifyContent: "center",
    backgroundColor: GatiMitraColors.background,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: GatiMitraColors.border,
    zIndex: 9,
    ...GatiMitraColors.elevationShadow,
  },
  filterScroll: {
    paddingHorizontal: 16,
    gap: 8,
  },
  filterPill: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 20,
    marginRight: 8,
    backgroundColor: GatiMitraColors.cardBg,
    borderWidth: 1,
    borderColor: GatiMitraColors.border,
    gap: 6,
  },
  filterPillActive: {
    backgroundColor: GatiMitraColors.emerald,
    borderColor: GatiMitraColors.emerald,
  },
  filterPillText: {
    fontSize: 14,
    fontWeight: "600",
    color: GatiMitraColors.textSecondary,
  },
  filterPillTextActive: {
    color: "#fff",
  },
  recommendSection: {
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 8,
  },
  recommendTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: GatiMitraColors.textPrimary,
  },
  recommendSub: {
    fontSize: 13,
    color: GatiMitraColors.textSecondary,
    marginTop: 2,
  },
  sectionHeader: {
    backgroundColor: GatiMitraColors.background,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: GatiMitraColors.border,
  },
  sectionHeaderText: {
    fontSize: 17,
    fontWeight: "800",
    color: GatiMitraColors.textPrimary,
  },
  itemCard: {
    backgroundColor: GatiMitraColors.cardBg,
    marginHorizontal: 16,
    marginBottom: 16,
    borderRadius: CARD_RADIUS,
    overflow: "hidden",
    ...GatiMitraColors.elevationShadow,
    shadowRadius: 12,
    shadowOpacity: 0.08,
  },
  itemCardInner: {
    flexDirection: "row",
    padding: 14,
  },
  itemCardLeft: {
    flex: 1,
    marginRight: 12,
    justifyContent: "space-between",
  },
  itemCardTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  vegDot: {
    width: 14,
    height: 14,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: GatiMitraColors.emerald,
    backgroundColor: "transparent",
  },
  nonVegDot: {
    borderColor: "#c2410c",
    backgroundColor: "#c2410c",
  },
  itemName: {
    flex: 1,
    fontSize: 16,
    fontWeight: "700",
    color: GatiMitraColors.textPrimary,
  },
  itemDesc: {
    fontSize: 13,
    color: GatiMitraColors.textSecondary,
    marginTop: 4,
    lineHeight: 18,
  },
  itemTagsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 6,
  },
  itemTag: {
    backgroundColor: GatiMitraColors.mintSoft,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  itemTagText: {
    fontSize: 11,
    fontWeight: "700",
    color: GatiMitraColors.emerald,
  },
  discountTag: {
    backgroundColor: "#fef9c3",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(245,158,11,0.3)",
  },
  discountTagText: {
    fontSize: 11,
    fontWeight: "800",
    color: "#b45309",
  },
  prepRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 6,
  },
  prepText: {
    fontSize: 12,
    color: GatiMitraColors.textSecondary,
  },
  itemPriceRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 8,
  },
  itemPrice: {
    fontSize: 16,
    fontWeight: "800",
    color: GatiMitraColors.textPrimary,
  },
  itemPriceEmphasis: {
    fontSize: 18,
    fontWeight: "800",
    color: GatiMitraColors.textPrimary,
  },
  itemImageClosedOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.35)",
    borderRadius: 14,
  },
  itemActions: {
    flexDirection: "row",
    gap: 4,
  },
  iconBtn: {
    padding: 4,
  },
  itemCardRight: {
    alignItems: "flex-end",
  },
  itemImageWrap: {
    width: 100,
    height: 100,
    borderRadius: 14,
    overflow: "hidden",
    backgroundColor: "#f3f4f6",
  },
  itemImage: {
    width: "100%",
    height: "100%",
  },
  addBtnWrap: {
    position: "absolute",
    bottom: 6,
    left: 6,
    right: 6,
    borderRadius: 16,
    overflow: "hidden",
    shadowColor: GatiMitraColors.emerald,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },
  addBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 16,
    paddingVertical: 8,
    gap: 4,
  },
  addBtnPressed: {
    opacity: 0.9,
  },
  addBtnDisabled: {
    opacity: 0.85,
  },
  addBtnClosed: {
    backgroundColor: "#9ca3af",
  },
  addBtnTextDisabled: {
    fontSize: 13,
    fontWeight: "700",
    color: "#fff",
  },
  addBtnText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#fff",
  },
  quantityWrap: {
    position: "absolute",
    bottom: 6,
    left: 6,
    right: 6,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: GatiMitraColors.emerald,
    borderRadius: 10,
    paddingVertical: 4,
    paddingHorizontal: 6,
  },
  quantityWrapDisabled: {
    backgroundColor: "#9ca3af",
    opacity: 0.9,
  },
  qtyBtn: {
    padding: 2,
  },
  qtyText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#fff",
  },
  customisableText: {
    fontSize: 11,
    color: GatiMitraColors.emerald,
    marginRight: 2,
  },
  customiseDropdown: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 4,
  },
  emptyMenu: {
    padding: 32,
    alignItems: "center",
  },
  emptyMenuText: {
    fontSize: 15,
    color: GatiMitraColors.textSecondary,
  },
  menuFab: {
    position: "absolute",
    right: 16,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#1f2937",
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 24,
    gap: 8,
    ...GatiMitraColors.elevationShadow,
  },
  menuFabText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#fff",
  },
  cartBar: {
    position: "absolute",
    left: 16,
    right: 16,
    bottom: 0,
    zIndex: 8,
  },
  cartBarCapsule: {
    borderRadius: 28,
    overflow: "hidden",
    ...GatiMitraColors.cardShadowSoft,
  },
  cartBarGlass: {
    backgroundColor: "rgba(255,255,255,0.92)",
    borderRadius: 28,
    borderWidth: 1,
    borderColor: "rgba(229,231,235,0.9)",
  },
  cartBarContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
    paddingHorizontal: 18,
  },
  cartBarLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  cartBarCount: {
    fontSize: 13,
    color: GatiMitraColors.textSecondary,
  },
  cartBarTotal: {
    fontSize: 18,
    fontWeight: "800",
    color: GatiMitraColors.textPrimary,
  },
  cartBarCta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  cartBarCtaText: {
    fontSize: 15,
    fontWeight: "700",
    color: GatiMitraColors.emerald,
  },
  cartBarCtaDisabled: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: "rgba(0,0,0,0.06)",
  },
  cartBarCtaTextDisabled: {
    fontSize: 14,
    fontWeight: "700",
    color: GatiMitraColors.textSecondary,
  },
  closedBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#6b7280",
    marginHorizontal: 16,
    marginTop: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
  },
  closedBannerText: {
    flex: 1,
    fontSize: 14,
    color: "#fff",
    lineHeight: 20,
  },
  sheetOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: GatiMitraColors.cardBg,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 10,
    paddingHorizontal: 20,
    maxHeight: "65%",
    ...GatiMitraColors.elevationShadow,
  },
  sheetHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: GatiMitraColors.border,
    alignSelf: "center",
    marginBottom: 14,
  },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  sheetTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: "700",
    color: GatiMitraColors.emerald,
    marginRight: 12,
  },
  sheetBadge: {
    minWidth: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: GatiMitraColors.emerald,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 8,
  },
  sheetBadgeText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#fff",
  },
  sheetList: {
    maxHeight: 340,
    marginBottom: 52,
  },
  sheetRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(229,231,235,0.9)",
  },
  sheetRowPressed: {
    backgroundColor: GatiMitraColors.mintSoft,
  },
  sheetRowLeft: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    marginRight: 12,
    minWidth: 0,
  },
  sheetRowText: {
    fontSize: 16,
    fontWeight: "600",
    color: GatiMitraColors.textPrimary,
    flex: 1,
  },
  sheetRowTag: {
    marginLeft: 6,
  },
  sheetRowCount: {
    fontSize: 15,
    fontWeight: "600",
    color: GatiMitraColors.textSecondary,
  },
  sheetCloseBtn: {
    position: "absolute",
    right: 20,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 20,
    backgroundColor: "rgba(0,0,0,0.06)",
  },
  sheetCloseText: {
    fontSize: 14,
    fontWeight: "600",
    color: GatiMitraColors.textSecondary,
  },

  // Menu sheet (80% width, 60% height, right edge connected, 0 right margin)
  menuSheetOuter: {
    flex: 1,
    justifyContent: "flex-end",
    alignItems: "flex-end",
  },
  menuSheet: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 12,
    paddingHorizontal: 20,
    alignItems: "stretch",
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: -4 },
        shadowOpacity: 0.12,
        shadowRadius: 16,
      },
      android: { elevation: 12 },
    }),
  },
  menuSheetHandle: {
    width: 36,
    height: 3,
    borderRadius: 2,
    backgroundColor: "rgba(0,0,0,0.15)",
    alignSelf: "center",
    marginBottom: 12,
  },
  menuSheetLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: GatiMitraColors.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 4,
  },
  menuSheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(0,0,0,0.06)",
  },
  menuSheetTitle: {
    flex: 1,
    fontSize: 17,
    fontWeight: "700",
    color: GatiMitraColors.textPrimaryNew,
    marginRight: 12,
  },
  menuSheetBadge: {
    minWidth: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: GatiMitraColors.emerald,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 6,
  },
  menuSheetBadgeText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#fff",
  },
  menuSheetList: {
    flex: 1,
    minHeight: 0,
  },
  menuSheetListContent: {
    paddingBottom: 24,
  },
  menuSheetCloseBtnFloating: {
    position: "absolute",
    left: "50%",
    marginLeft: -22,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(0,0,0,0.78)",
    alignItems: "center",
    justifyContent: "center",
    ...(Platform.OS === "android" ? { elevation: 8 } : { shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.25, shadowRadius: 4 }),
  },
  menuSheetRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 14,
    paddingHorizontal: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(0,0,0,0.06)",
    borderRadius: 10,
    marginBottom: 2,
  },
  menuSheetRowPressed: {
    backgroundColor: GatiMitraColors.mintSoft,
  },
  menuSheetRowLeft: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    marginRight: 12,
    minWidth: 0,
  },
  menuSheetRowText: {
    fontSize: 15,
    fontWeight: "600",
    color: GatiMitraColors.textPrimaryNew,
    flex: 1,
  },
  menuSheetRowTag: {
    marginLeft: 6,
  },
  menuSheetRowRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  menuSheetRowCount: {
    fontSize: 14,
    fontWeight: "600",
    color: GatiMitraColors.textSecondary,
  },
  menuSheetGoBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 8,
    backgroundColor: GatiMitraColors.mintSoft,
  },
  menuSheetGoText: {
    fontSize: 12,
    fontWeight: "700",
    color: GatiMitraColors.emerald,
  },
  menuSheetExpandIcon: {
    marginLeft: 2,
  },
  menuSheetSectionBlock: {
    marginBottom: 2,
  },
  menuSheetDropdown: {
    paddingLeft: 12,
    paddingRight: 8,
    paddingBottom: 8,
    paddingTop: 2,
    backgroundColor: "rgba(0,0,0,0.02)",
    borderLeftWidth: 2,
    borderLeftColor: GatiMitraColors.mintSoft,
    marginLeft: 8,
    marginBottom: 6,
  },
  menuSheetDropdownItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderRadius: 8,
  },
  menuSheetDropdownItemText: {
    flex: 1,
    fontSize: 14,
    color: GatiMitraColors.textPrimaryNew,
    marginRight: 8,
  },
});
