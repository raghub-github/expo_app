/**
 * Food Delivery listing – premium GatiMitra experience.
 * Sticky header, pure white BG, soft shadows, horizontal scroll for offers/chips/categories,
 * vertical scroll for page. Wallet icon (no coin). Clear hierarchy, snap scrolling.
 */

import { useState } from "react";
import {
  View,
  Text,
  TextInput,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  Image,
  Switch,
  NativeSyntheticEvent,
  NativeScrollEvent,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { merchantService } from "@/services/merchant.service";
import { useCartStore } from "@/store/cartStore";
import { useLocationStore } from "@/store/locationStore";
import { HEADER_PADDING_TOP, HEADER_VERTICAL_PADDING } from "@/constants/layout";

const { width } = Dimensions.get("window");
/** Same horizontal gap from left and right screen edges for all sections */
const PAD = 24;
/** Slightly less left padding for category grid so cards sit a bit more left */
const CATEGORY_PAD_LEFT = 8;
const TEAL = "#14b8a6";
const PURPLE = "#7c3aed";
const TITLE_DARK = "#1A1A1A";
const TEXT_GRAY = "#6B7280";
const BORDER = "#E8E8E8";
const CARD_BG = "#FFFFFF";
const BG = "#FFFFFF";
const SHADOW = { shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 3 };

const OFFERS = [
  { id: "o1", title: "MIN ₹120 OFF", sub: "Free Delivery above ₹99" },
  { id: "o2", title: "50% OFF", sub: "On orders above ₹199" },
];

const QUICK_FILTERS = [
  { id: "deals", label: "Deals" },
  { id: "free", label: "Free Delivery" },
  { id: "fast", label: "Fast Delivery" },
  { id: "top", label: "Top Rated" },
];

const FOOD_CATEGORY_IMAGES: Record<string, ReturnType<typeof require>> = {
  "1": require("../../public/img/biryani.png"),
  "2": require("../../public/img/pizza.png"),
  "3": require("../../public/img/Cake.png"),
  "4": require("../../public/img/ndf.png"),
  "5": require("../../public/img/burger.png"),
  "6": require("../../public/img/thali.png"),
  "7": require("../../public/img/vegbiryani.png"),
  "8": require("../../public/img/Pav Bhaji.png"),
  "9": require("../../public/img/Paratha.png"),
  "10": require("../../public/img/Dosa.png"),
  "11": require("../../public/img/Noodles.png"),
  "12": require("../../public/img/gulabjamun.png"),
};

const FOOD_CATEGORIES = [
  { id: "1", name: "Biryani", slug: "biryani", icon: "restaurant" },
  { id: "2", name: "Pizza", slug: "pizza", icon: "pizza" },
  { id: "3", name: "Cake", slug: "cake", icon: "ice-cream" },
  { id: "4", name: "Kadai Paneer", slug: "kadai-paneer", icon: "restaurant" },
  { id: "5", name: "Burger", slug: "burger", icon: "fast-food" },
  { id: "6", name: "Thali", slug: "thali", icon: "restaurant" },
  { id: "7", name: "Butter Chicken", slug: "chicken", icon: "restaurant" },
  { id: "8", name: "Pav Bhaji", slug: "pav-bhaji", icon: "restaurant" },
  { id: "9", name: "North Indian", slug: "north-indian", icon: "restaurant" },
  { id: "10", name: "South Indian", slug: "south-indian", icon: "restaurant" },
  { id: "11", name: "Chinese", slug: "chinese", icon: "restaurant" },
  { id: "12", name: "Desserts", slug: "desserts", icon: "ice-cream" },
];
const CATEGORY_ROWS = 2;
const MAX_COLS_NO_SCROLL = 4; // up to 8 items in 2 rows without horizontal scroll

const CHIP_WIDTH = 120;
const CATEGORY_GAP = 12;
const COLS_SM = 4;
const COLS_LG = 5;
const BREAKPOINT = 400;

const DEFAULT_MERCHANT_IMAGE = require("../../public/img/ndf.png");

function MerchantCard({
  id,
  name,
  rating,
  deliveryTime,
  cuisines,
  costForTwo,
  isOpen,
  offerBadge,
  imageUrl,
}: {
  id: string;
  name: string;
  rating?: number;
  deliveryTime?: string;
  cuisines?: string[];
  costForTwo?: number;
  isOpen?: boolean;
  offerBadge?: string;
  imageUrl?: string;
}) {
  const router = useRouter();
  return (
    <TouchableOpacity
      onPress={() => router.push({ pathname: "/home/merchant/[id]", params: { id } })}
      style={styles.merchantCard}
      activeOpacity={0.8}
    >
      <View style={styles.merchantImagePlc}>
        {imageUrl ? (
          <Image source={{ uri: imageUrl }} style={styles.merchantImage} resizeMode="cover" />
        ) : (
          <Image source={DEFAULT_MERCHANT_IMAGE} style={styles.merchantImage} resizeMode="cover" />
        )}
        {offerBadge ? (
          <View style={styles.offerBadge}>
            <Text style={styles.offerBadgeText}>{offerBadge}</Text>
          </View>
        ) : null}
      </View>
      <View style={styles.merchantInfo}>
        <Text style={styles.merchantName} numberOfLines={1}>{name}</Text>
        {cuisines?.length ? (
          <Text style={styles.merchantCuisines} numberOfLines={1}>{cuisines.join(", ")}</Text>
        ) : null}
        <View style={styles.merchantMeta}>
          {rating != null && (
            <View style={styles.ratingBadge}>
              <Ionicons name="star" size={12} color="#fff" />
              <Text style={styles.ratingText}>{rating}</Text>
            </View>
          )}
          {deliveryTime ? <Text style={styles.metaText}>{deliveryTime}</Text> : null}
          {costForTwo != null ? <Text style={styles.metaText}>₹{costForTwo} for two</Text> : null}
        </View>
      </View>
      {isOpen === false && (
        <View style={styles.closedBadge}>
          <Text style={styles.closedText}>Closed</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

export default function FoodMerchantsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const cartCount = useCartStore((s) => s.items.reduce((n, i) => n + i.quantity, 0));
  const { address } = useLocationStore();
  const [vegOnly, setVegOnly] = useState(false);
  const [openNow, setOpenNow] = useState(false);
  const [selectedFilter, setSelectedFilter] = useState<string | null>(null);
  const [categoryPage, setCategoryPage] = useState(0);

  const { data: merchants = [], isLoading } = useQuery({
    queryKey: ["merchants"],
    queryFn: () => merchantService.getMerchants({ limit: 20 }),
  });

  return (
    <View style={styles.container}>
      <StatusBar style="dark" />
      {/* Sticky header – same status bar → header spacing as Home */}
      <View style={[styles.header, { paddingTop: HEADER_PADDING_TOP, paddingBottom: HEADER_VERTICAL_PADDING }, SHADOW]}>
        <TouchableOpacity onPress={() => router.replace("/(tabs)/")} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={TITLE_DARK} />
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.headerCenter}
          activeOpacity={0.8}
          onPress={() => router.push("/location")}
        >
          <View style={styles.titleRow}>
            <Text style={styles.headerTitle}>Food Delivery</Text>
            <Ionicons name="chevron-down" size={16} color={TEXT_GRAY} />
          </View>
          <View style={styles.locationRow}>
            <Text style={styles.locationText} numberOfLines={1} ellipsizeMode="tail">
              {address?.fullAddress ?? address?.primary ?? "Current location"}
            </Text>
          </View>
        </TouchableOpacity>
        <View style={styles.headerRight}>
          <TouchableOpacity onPress={() => router.push("/checkout/cart")} style={styles.cartBtn}>
            <Ionicons name="cart-outline" size={24} color={TITLE_DARK} />
            {cartCount > 0 && (
              <View style={styles.cartBadge}>
                <Text style={styles.cartBadgeText}>{cartCount > 99 ? "99+" : cartCount}</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>
      </View>

      {/* Vertical scroll – main content */}
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={{ paddingBottom: insets.bottom + 100 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Search section */}
        <View style={styles.searchSection}>
          <View style={[styles.searchBar, SHADOW]}>
            <TouchableOpacity
              style={styles.searchInputTouchable}
              onPress={() => router.push("/search")}
              activeOpacity={1}
            >
              <Ionicons name="search" size={20} color={TEXT_GRAY} />
              <TextInput
                style={styles.searchInput}
                placeholder="Search for delivery outlets near you. Tap mic to speak."
                placeholderTextColor={TEXT_GRAY}
                editable={false}
                pointerEvents="none"
              />
            </TouchableOpacity>
            <TouchableOpacity
              hitSlop={12}
              onPress={() => router.push("/search?voice=1")}
            >
              <Ionicons name="mic-outline" size={22} color={TITLE_DARK} />
            </TouchableOpacity>
          </View>
          <View style={styles.vegToggleWrap}>
            <Text style={styles.vegToggleLabel}>VEG</Text>
            <Switch
              value={vegOnly}
              onValueChange={setVegOnly}
              trackColor={{ false: BORDER, true: "#22c55e" }}
              thumbColor={Platform.OS === "android" ? "#fff" : undefined}
              ios_backgroundColor={BORDER}
            />
          </View>
        </View>

        {/* Offer banners – horizontal scroll */}
        <View style={styles.sectionHead} />
        <ScrollView
          horizontal
          pagingEnabled={false}
          snapToInterval={width - PAD * 2 + 12}
          snapToAlignment="start"
          decelerationRate="fast"
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.offersStrip}
        >
          {OFFERS.map((o) => (
            <TouchableOpacity key={o.id} style={styles.offerCardWrap} activeOpacity={0.9}>
              <LinearGradient
                colors={["#8B5CF6", "#7c3aed"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={[styles.offerCard, SHADOW]}
              >
                <View style={styles.offerContent}>
                  <Text style={styles.offerTitle}>{o.title}</Text>
                  <Text style={styles.offerSub}>{o.sub}</Text>
                  <View style={styles.orderNowBtn}>
                    <Text style={styles.orderNowText}>Order now</Text>
                    <Ionicons name="arrow-forward" size={18} color={PURPLE} />
                  </View>
                </View>
                <View style={styles.offerDeco}>
                  <Ionicons name="gift" size={36} color="rgba(255,255,255,0.4)" />
                </View>
              </LinearGradient>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Quick filters – horizontal, snap */}
        <View style={styles.sectionHead} />
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          snapToInterval={CHIP_WIDTH + 10}
          snapToAlignment="start"
          decelerationRate="fast"
          contentContainerStyle={styles.chipsStrip}
        >
          {QUICK_FILTERS.map((f) => (
            <TouchableOpacity
              key={f.id}
              style={[styles.chip, selectedFilter === f.id && styles.chipSelected]}
              onPress={() => setSelectedFilter(selectedFilter === f.id ? null : f.id)}
              activeOpacity={0.8}
            >
              <Text style={[styles.chipText, selectedFilter === f.id && styles.chipTextSelected]}>
                {f.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Craving something delicious! – max 2 rows; horizontal scroll when > 8 items */}
        <Text style={[styles.sectionTitle, { marginLeft: CATEGORY_PAD_LEFT }]}>Craving something delicious!</Text>
        {(() => {
          const cols = Math.ceil(FOOD_CATEGORIES.length / CATEGORY_ROWS);
          const needsHorizontalScroll = cols > MAX_COLS_NO_SCROLL;
          const categoryHorizontalTotal = width - CATEGORY_PAD_LEFT - PAD;
          const itemWidth = needsHorizontalScroll
            ? (categoryHorizontalTotal - CATEGORY_GAP * (MAX_COLS_NO_SCROLL - 1)) / MAX_COLS_NO_SCROLL
            : (categoryHorizontalTotal - CATEGORY_GAP * (cols - 1)) / cols;
          const contentWidth = cols * itemWidth + (cols - 1) * CATEGORY_GAP;
          const viewWidth = categoryHorizontalTotal;
          const numDots = needsHorizontalScroll ? Math.max(2, Math.ceil(contentWidth / viewWidth)) : 0;
          const row0 = FOOD_CATEGORIES.slice(0, cols);
          const row1 = FOOD_CATEGORIES.slice(cols, cols * 2);
          const renderItem = (f: (typeof FOOD_CATEGORIES)[0]) => (
            <TouchableOpacity
              key={f.id}
              style={[styles.categoryGridItem, { width: itemWidth }]}
              activeOpacity={0.8}
              onPress={() => router.push(`/home/category/${f.slug}`)}
            >
              <View style={[styles.categoryIconWrap, SHADOW]}>
                <Image
                  source={FOOD_CATEGORY_IMAGES[f.id]}
                  style={styles.foodCategoryImage}
                  resizeMode="contain"
                />
              </View>
              <Text style={styles.categoryName} numberOfLines={1}>{f.name}</Text>
            </TouchableOpacity>
          );
          const gridContent = (
            <View style={[styles.categoryGridTwoRows, needsHorizontalScroll && { width: contentWidth }]}>
              <View style={[styles.categoryRow, { marginBottom: row0.length ? CATEGORY_GAP : 0 }]}>
                {row0.map(renderItem)}
              </View>
              <View style={styles.categoryRow}>
                {row1.map(renderItem)}
              </View>
            </View>
          );
          if (needsHorizontalScroll) {
            return (
              <View style={styles.categorySectionWrap}>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.categoryScrollContent}
                  style={styles.categoryScroll}
                  onScroll={(e: NativeSyntheticEvent<NativeScrollEvent>) => {
                    const x = e.nativeEvent.contentOffset.x;
                    const index = Math.round(x / viewWidth);
                    setCategoryPage(Math.min(index, numDots - 1));
                  }}
                  scrollEventThrottle={32}
                >
                  {gridContent}
                </ScrollView>
                <View style={styles.paginationDots}>
                  {Array.from({ length: numDots }).map((_, i) => (
                    <View
                      key={i}
                      style={[
                        styles.paginationDot,
                        categoryPage === i && styles.paginationDotActive,
                      ]}
                    />
                  ))}
                </View>
              </View>
            );
          }
          return (
            <View style={styles.categoryScrollContent}>
              {gridContent}
            </View>
          );
        })()}

        {/* Explore Restaurants */}
        <View style={styles.exploreSection}>
          <View style={styles.exploreRow}>
            <Text style={styles.exploreTitle}>Explore Restaurants</Text>
            <View style={styles.exploreLine} />
          </View>
          <View style={styles.exploreActions}>
            <TouchableOpacity
              style={[styles.openNowBtn, openNow && styles.openNowBtnOn]}
              onPress={() => setOpenNow((v) => !v)}
            >
              <Ionicons name="storefront-outline" size={18} color={openNow ? "#fff" : TEAL} />
              <Text style={[styles.openNowText, openNow && styles.openNowTextOn]}>Open Now</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.sortBtn}>
              <Ionicons name="swap-vertical" size={18} color={TITLE_DARK} />
              <Text style={styles.sortBtnText}>Sort</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.filterBtn}>
              <Ionicons name="options-outline" size={18} color={TITLE_DARK} />
              <Text style={styles.filterBtnText}>Filters</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Restaurant list – vertical (part of main scroll) */}
        <Text style={styles.sectionTitle}>Restaurants near you</Text>
        {isLoading ? (
          <View style={styles.skeletonList}>
            {[1, 2, 3, 4].map((i) => (
              <View key={i} style={[styles.skeletonCard, SHADOW]} />
            ))}
          </View>
        ) : merchants.length === 0 ? (
          <View style={styles.emptyWrap}>
            <Ionicons name="restaurant-outline" size={48} color={BORDER} />
            <Text style={styles.emptyText}>No restaurants nearby. Check back later.</Text>
          </View>
        ) : (
          merchants.map((m) => (
            <MerchantCard
              key={m.id}
              id={m.id}
              name={m.name}
              rating={m.rating}
              deliveryTime={m.deliveryTime}
              cuisines={m.cuisines}
              costForTwo={m.costForTwo}
              isOpen={m.isOpen}
              offerBadge="20% OFF"
              imageUrl={m.imageUrl}
            />
          ))
        )}
      </ScrollView>

      {cartCount > 0 && (
        <TouchableOpacity
          onPress={() => router.push("/checkout/cart")}
          style={[styles.cartFab, { bottom: insets.bottom + 24 }, SHADOW]}
          activeOpacity={0.9}
        >
          <Ionicons name="cart" size={22} color="#fff" />
          <Text style={styles.cartFabText}>Cart · {cartCount}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG },
  header: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: CARD_BG,
    paddingHorizontal: PAD,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  backBtn: { padding: 6, marginRight: 4 },
  headerCenter: { flex: 1, minWidth: 0 },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  headerTitle: { fontSize: 20, fontWeight: "700", color: TITLE_DARK },
  locationRow: { flexDirection: "row", alignItems: "center", marginTop: 6 },
  locationText: { fontSize: 13, color: TEXT_GRAY, flex: 1 },
  headerRight: { flexDirection: "row", alignItems: "center", gap: 16 },
  cartBtn: { padding: 6, position: "relative" },
  cartBadge: {
    position: "absolute",
    top: 2,
    right: 2,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: "#dc2626",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  cartBadgeText: { color: "#fff", fontSize: 10, fontWeight: "700" },
  scroll: { flex: 1 },
  searchSection: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: PAD,
    paddingTop: 20,
    gap: 12,
  },
  searchBar: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: CARD_BG,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: BORDER,
  },
  searchInputTouchable: { flex: 1, flexDirection: "row", alignItems: "center" },
  searchInput: { flex: 1, marginLeft: 12, fontSize: 15, color: TITLE_DARK, paddingVertical: 0 },
  vegToggleWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  vegToggleLabel: {
    fontSize: 14,
    fontWeight: "700",
    color: TITLE_DARK,
  },
  sectionHead: { height: 24 },
  offersStrip: { paddingHorizontal: PAD, gap: 12, paddingBottom: 8 },
  offerCardWrap: { width: width - PAD * 2, marginRight: 0 },
  offerCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderRadius: 20,
    padding: 22,
    overflow: "hidden",
  },
  offerContent: { flex: 1 },
  offerTitle: { fontSize: 24, fontWeight: "800", color: "#fff", letterSpacing: 0.3 },
  offerSub: { fontSize: 14, color: "rgba(255,255,255,0.9)", marginTop: 6 },
  orderNowBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    alignSelf: "flex-start",
    marginTop: 14,
    backgroundColor: "#fff",
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 12,
  },
  orderNowText: { fontSize: 15, fontWeight: "700", color: PURPLE },
  offerDeco: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignItems: "center",
    justifyContent: "center",
  },
  chipsStrip: { paddingHorizontal: PAD, gap: 10, paddingBottom: 8 },
  chip: {
    width: CHIP_WIDTH,
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: CARD_BG,
    borderWidth: 1,
    borderColor: BORDER,
    alignItems: "center",
    justifyContent: "center",
  },
  chipSelected: { backgroundColor: TEAL, borderColor: TEAL },
  chipText: { fontSize: 14, fontWeight: "600", color: TITLE_DARK },
  chipTextSelected: { color: "#fff" },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: TITLE_DARK,
    marginHorizontal: PAD,
    marginTop: 24,
    marginBottom: 14,
  },
  categoryGridTwoRows: {
    flexDirection: "column",
    paddingLeft: CATEGORY_PAD_LEFT,
    paddingRight: PAD,
  },
  categoryRow: {
    flexDirection: "row",
    gap: CATEGORY_GAP,
  },
  categoryGridItem: {
    alignItems: "center",
    justifyContent: "flex-start",
    paddingVertical: 4,
  },
  categoryIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 16,
    backgroundColor: "#E8F5F3",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  categoryName: { fontSize: 12, fontWeight: "600", color: TITLE_DARK, textAlign: "center" },
  categoryScroll: { marginBottom: 4 },
  categoryScrollContent: {
    paddingLeft: CATEGORY_PAD_LEFT,
    paddingRight: PAD,
    paddingVertical: 8,
    marginBottom: 4,
  },
  categorySectionWrap: { marginBottom: 8 },
  paginationDots: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
    marginTop: 12,
    marginBottom: 4,
  },
  paginationDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: BORDER,
  },
  paginationDotActive: {
    backgroundColor: TEAL,
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  exploreSection: { marginTop: 8 },
  exploreRow: { flexDirection: "row", alignItems: "center", marginHorizontal: PAD },
  exploreTitle: { fontSize: 18, fontWeight: "700", color: TITLE_DARK },
  exploreLine: { flex: 1, height: 2, backgroundColor: PURPLE, marginLeft: 12, borderRadius: 1, opacity: 0.6 },
  exploreActions: { flexDirection: "row", alignItems: "center", marginHorizontal: PAD, marginTop: 14, gap: 10 },
  openNowBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: "#E8F5F3",
    borderWidth: 1,
    borderColor: "transparent",
  },
  openNowBtnOn: { backgroundColor: TEAL, borderColor: TEAL },
  openNowText: { fontSize: 14, fontWeight: "600", color: TEAL },
  openNowTextOn: { color: "#fff" },
  sortBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: CARD_BG,
    borderWidth: 1,
    borderColor: BORDER,
  },
  sortBtnText: { fontSize: 14, fontWeight: "600", color: TITLE_DARK },
  filterBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: CARD_BG,
    borderWidth: 1,
    borderColor: BORDER,
  },
  filterBtnText: { fontSize: 14, fontWeight: "600", color: TITLE_DARK },
  merchantCard: {
    flexDirection: "row",
    backgroundColor: CARD_BG,
    marginHorizontal: PAD,
    marginBottom: 16,
    borderRadius: 20,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: BORDER,
    ...SHADOW,
  },
  merchantImagePlc: { width: 110, height: 110, backgroundColor: "#F0F0F0", position: "relative", overflow: "hidden" },
  merchantImage: { width: "100%", height: "100%" },
  foodCategoryImage: { width: 36, height: 36 },
  offerBadge: {
    position: "absolute",
    top: 10,
    left: 10,
    backgroundColor: TEAL,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  offerBadgeText: { fontSize: 11, fontWeight: "700", color: "#fff" },
  merchantInfo: { flex: 1, padding: 16 },
  merchantName: { fontSize: 17, fontWeight: "700", color: TITLE_DARK },
  merchantCuisines: { fontSize: 13, color: TEXT_GRAY, marginTop: 4 },
  merchantMeta: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 8, flexWrap: "wrap" },
  ratingBadge: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: TEAL, paddingHorizontal: 6, paddingVertical: 3, borderRadius: 6 },
  ratingText: { fontSize: 12, fontWeight: "700", color: "#fff" },
  metaText: { fontSize: 12, color: TEXT_GRAY },
  closedBadge: { position: "absolute", top: 14, right: 14, backgroundColor: "#fef2f2", paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10 },
  closedText: { fontSize: 12, fontWeight: "600", color: "#dc2626" },
  skeletonList: { paddingHorizontal: PAD },
  skeletonCard: {
    height: 120,
    backgroundColor: "#F0F0F0",
    borderRadius: 20,
    marginBottom: 16,
    width: "100%",
  },
  emptyWrap: { paddingVertical: 48, alignItems: "center", marginHorizontal: PAD },
  emptyText: { fontSize: 15, color: TEXT_GRAY, marginTop: 12 },
  cartFab: {
    position: "absolute",
    right: PAD,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: TEAL,
    paddingVertical: 14,
    paddingHorizontal: 22,
    borderRadius: 14,
  },
  cartFabText: { fontSize: 16, fontWeight: "700", color: "#fff" },
});
