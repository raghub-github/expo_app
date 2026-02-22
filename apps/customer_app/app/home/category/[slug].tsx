/**
 * Category browse – Zomato-style inner page for GatiMitra.
 * Header with search, horizontal category chips, filter/offer pills,
 * Recommended For You grid, All Restaurants section.
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
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { merchantService } from "@/services/merchant.service";
import { useLocationStore } from "@/store/locationStore";
import { useDebouncedCoords } from "@/hooks/useDebouncedCoords";
import { BrandingFooter } from "@/components/BrandingFooter";
import { RestaurantListSkeleton } from "@/components/ShimmerSkeleton";
import { EmptyRestaurantsNearby } from "@/components/EmptyRestaurantsNearby";

const { width } = Dimensions.get("window");
const PAD = 16;
const TEAL = "#14b8a6";
const TITLE_DARK = "#1A1A1A";
const TEXT_GRAY = "#6B7280";
const BORDER = "#E5E7EB";
const CARD_BG = "#FFFFFF";
const BG = "#F8F8F8";
const SHADOW = { shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 3 };

const BROWSE_CATEGORIES = [
  { id: "all", name: "All", image: require("../../../public/img/ndf.png") },
  { id: "biryani", name: "Biryani", image: require("../../../public/img/biryani.png") },
  { id: "pizza", name: "Pizza", image: require("../../../public/img/pizza.png") },
  { id: "chicken", name: "Chicken", image: require("../../../public/img/vegbiryani.png") },
  { id: "paneer", name: "Paneer", image: require("../../../public/img/ndf.png") },
  { id: "burger", name: "Burger", image: require("../../../public/img/burger.png") },
  { id: "thali", name: "Thali", image: require("../../../public/img/thali.png") },
];

const OFFER_PILLS = [
  { id: "fast", label: "Near & Fast", icon: "flash" },
  { id: "meals", label: "Meals under ₹250", tag: "New" },
  { id: "flat50", label: "Flat 50% OFF" },
  { id: "hyderabadi", label: "Hyderabadi" },
];

const DEFAULT_MERCHANT_IMAGE = require("../../../public/img/ndf.png");

function DishCard({
  id,
  name,
  rating,
  deliveryTime,
  offerBadge,
  imageUrl,
  onPress,
}: {
  id: string;
  name: string;
  rating?: number;
  deliveryTime?: string;
  offerBadge?: string;
  imageUrl?: string;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity style={styles.dishCard} onPress={onPress} activeOpacity={0.9}>
      <View style={styles.dishImageWrap}>
        {imageUrl ? (
          <Image source={{ uri: imageUrl }} style={styles.dishImage} resizeMode="cover" />
        ) : (
          <Image source={DEFAULT_MERCHANT_IMAGE} style={styles.dishImage} resizeMode="cover" />
        )}
        {offerBadge ? (
          <View style={[styles.offerTag, offerBadge.includes("50") && styles.offerTagBlue]}>
            <Text style={styles.offerTagText}>{offerBadge}</Text>
          </View>
        ) : null}
        <View style={styles.ratingBadge}>
          <Ionicons name="star" size={12} color="#fff" />
          <Text style={styles.ratingText}>{rating ?? "—"}</Text>
        </View>
      </View>
      <Text style={styles.dishName} numberOfLines={1}>{name}</Text>
      <View style={styles.dishMeta}>
        {deliveryTime ? (
          <View style={styles.metaRow}>
            <Ionicons name="time-outline" size={12} color={TEXT_GRAY} />
            <Text style={styles.metaText}>{deliveryTime}</Text>
          </View>
        ) : (
          <View style={styles.metaRow}>
            <Ionicons name="flash" size={12} color={TEAL} />
            <Text style={[styles.metaText, { color: TEAL }]}>Near & Fast</Text>
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
}

export default function CategoryBrowseScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const router = useRouter();
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");

  const { coords } = useLocationStore();
  const debouncedCoords = useDebouncedCoords(coords, 400);
  const { data, isLoading } = useQuery({
    queryKey: ["merchants", slug, debouncedCoords?.latitude, debouncedCoords?.longitude],
    queryFn: () =>
      merchantService.getMerchants({
        limit: 20,
        ...(debouncedCoords?.latitude != null && debouncedCoords?.longitude != null
          ? { lat: debouncedCoords.latitude, lng: debouncedCoords.longitude }
          : {}),
      }),
    staleTime: 60 * 1000,
    placeholderData: (prev) => prev,
  });

  const merchants = Array.isArray(data) ? data : [];
  const recommended = merchants.slice(0, 6);
  const allRestaurants = merchants;

  return (
    <View style={styles.container}>
      {/* Header: back, search (no cart on food) */}
      <View style={[styles.header, SHADOW]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={TITLE_DARK} />
        </TouchableOpacity>
        <View style={styles.searchWrap}>
          <Ionicons name="search" size={20} color={TEXT_GRAY} />
          <TextInput
            style={styles.searchInput}
            placeholder="Restaurant name or a dish..."
            placeholderTextColor={TEXT_GRAY}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          <TouchableOpacity style={styles.micBtn} hitSlop={8}>
            <Ionicons name="mic-outline" size={22} color={TEAL} />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Category chips – horizontal */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.categoryChipsWrap}
          style={styles.categoryChipsScroll}
        >
          {BROWSE_CATEGORIES.map((c) => (
            <TouchableOpacity
              key={c.id}
              onPress={() => setSelectedCategory(c.id)}
              style={styles.categoryChip}
              activeOpacity={0.8}
            >
              <Image source={c.image} style={styles.categoryChipImage} resizeMode="contain" />
              <Text
                style={[
                  styles.categoryChipText,
                  selectedCategory === c.id && styles.categoryChipTextActive,
                ]}
                numberOfLines={1}
              >
                {c.name}
              </Text>
              {selectedCategory === c.id && <View style={styles.categoryChipUnderline} />}
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Filter / offer pills */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.pillsWrap}
        >
          <TouchableOpacity style={styles.filterBtn} activeOpacity={0.8}>
            <Ionicons name="options-outline" size={18} color={TITLE_DARK} />
            <Text style={styles.filterBtnText}>Filters</Text>
            <Ionicons name="chevron-down" size={14} color={TEXT_GRAY} />
          </TouchableOpacity>
          {OFFER_PILLS.map((p) => (
            <TouchableOpacity
              key={p.id}
              style={[styles.pill, p.tag && styles.pillNew]}
              activeOpacity={0.8}
            >
              {p.tag ? (
                <View style={styles.pillNewTag}><Text style={styles.pillNewTagText}>{p.tag}</Text></View>
              ) : null}
              {p.icon === "flash" ? (
                <Ionicons name="flash" size={14} color={TEAL} />
              ) : null}
              <Text style={[styles.pillText, p.tag && styles.pillTextNew]} numberOfLines={1}>
                {p.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Recommended For You */}
        <Text style={styles.sectionHeading}>RECOMMENDED FOR YOU</Text>
        {isLoading ? (
          <View style={styles.skeletonListWrap}>
            <RestaurantListSkeleton count={3} />
          </View>
        ) : (
          <View style={styles.dishGrid}>
            {recommended.map((m) => (
              <DishCard
                key={m.id}
                id={m.id}
                name={m.name}
                rating={m.rating}
                deliveryTime={m.deliveryTime}
                offerBadge="FLAT 50% OFF"
                imageUrl={m.imageUrl}
                onPress={() => router.push({ pathname: "/home/merchant/[id]", params: { id: m.id } })}
              />
            ))}
          </View>
        )}

        {/* All Restaurants */}
        <Text style={styles.sectionHeading}>ALL RESTAURANTS</Text>
        <Text style={styles.sectionSub}>Featured</Text>
        {isLoading ? (
          <View style={styles.skeletonListWrap}>
            <RestaurantListSkeleton count={4} />
          </View>
        ) : allRestaurants.length === 0 ? (
          <EmptyRestaurantsNearby />
        ) : (
          allRestaurants.map((m) => (
            <TouchableOpacity
              key={m.id}
              style={styles.featuredCard}
              onPress={() => router.push({ pathname: "/home/merchant/[id]", params: { id: m.id } })}
              activeOpacity={0.9}
            >
              <View style={styles.featuredImageWrap}>
                {m.imageUrl ? (
                  <Image source={{ uri: m.imageUrl }} style={styles.featuredImage} resizeMode="cover" />
                ) : (
                  <Image source={DEFAULT_MERCHANT_IMAGE} style={styles.featuredImage} resizeMode="cover" />
                )}
                <View style={styles.featuredOfferTag}>
                  <Text style={styles.featuredOfferText}>Flat 50% OFF</Text>
                </View>
                <View style={styles.featuredOverlay}>
                  <Text style={styles.featuredTitle} numberOfLines={1}>{m.name}</Text>
                  <Text style={styles.featuredPrice}>₹{m.costForTwo ?? 299} for two</Text>
                </View>
              </View>
            </TouchableOpacity>
          ))
        )}

        <BrandingFooter />
      </ScrollView>
    </View>
  );
}

const CARD_WIDTH = (width - PAD * 2 - 12) / 2;
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG },
  header: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: CARD_BG,
    paddingHorizontal: PAD,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
    gap: 10,
  },
  backBtn: { padding: 6 },
  searchWrap: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: BG,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: BORDER,
  },
  searchInput: {
    flex: 1,
    marginLeft: 10,
    fontSize: 15,
    color: TITLE_DARK,
    paddingVertical: 0,
  },
  micBtn: { padding: 4 },
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
  scrollContent: { paddingBottom: 40 },
  categoryChipsScroll: { marginBottom: 8 },
  categoryChipsWrap: {
    paddingHorizontal: PAD,
    paddingVertical: 12,
    gap: 16,
  },
  categoryChip: {
    alignItems: "center",
    width: 72,
  },
  categoryChipImage: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: CARD_BG,
    marginBottom: 6,
    ...SHADOW,
  },
  categoryChipText: {
    fontSize: 12,
    fontWeight: "600",
    color: TEXT_GRAY,
  },
  categoryChipTextActive: {
    color: TEAL,
    fontWeight: "700",
  },
  categoryChipUnderline: {
    position: "absolute",
    bottom: -4,
    left: 8,
    right: 8,
    height: 2,
    backgroundColor: TEAL,
    borderRadius: 1,
  },
  pillsWrap: {
    paddingHorizontal: PAD,
    paddingBottom: 16,
    gap: 10,
  },
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
  pill: {
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
  pillNew: { backgroundColor: "#fef2f2", borderColor: "#fecaca" },
  pillNewTag: {
    backgroundColor: "#dc2626",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  pillNewTagText: { fontSize: 10, fontWeight: "700", color: "#fff" },
  pillText: { fontSize: 13, fontWeight: "600", color: TITLE_DARK },
  pillTextNew: { color: "#991b1b" },
  sectionHeading: {
    fontSize: 14,
    fontWeight: "800",
    color: TEXT_GRAY,
    letterSpacing: 0.5,
    marginHorizontal: PAD,
    marginTop: 20,
    marginBottom: 6,
  },
  sectionSub: {
    fontSize: 13,
    color: TEXT_GRAY,
    marginHorizontal: PAD,
    marginBottom: 12,
  },
  dishGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: PAD,
    gap: 12,
  },
  dishCard: {
    width: CARD_WIDTH,
    backgroundColor: CARD_BG,
    borderRadius: 16,
    overflow: "hidden",
    ...SHADOW,
  },
  dishCardSkeleton: { height: 180, backgroundColor: BORDER },
  dishImageWrap: {
    width: "100%",
    height: 120,
    backgroundColor: "#eee",
    position: "relative",
  },
  dishImage: { width: "100%", height: "100%" },
  offerTag: {
    position: "absolute",
    top: 8,
    left: 8,
    backgroundColor: TEAL,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  offerTagBlue: { backgroundColor: "#3b82f6" },
  offerTagText: { fontSize: 10, fontWeight: "700", color: "#fff" },
  ratingBadge: {
    position: "absolute",
    bottom: 8,
    left: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(0,0,0,0.6)",
    paddingHorizontal: 6,
    paddingVertical: 4,
    borderRadius: 6,
  },
  ratingText: { fontSize: 12, fontWeight: "700", color: "#fff" },
  dishName: {
    fontSize: 15,
    fontWeight: "700",
    color: TITLE_DARK,
    marginTop: 8,
    marginHorizontal: 10,
  },
  dishMeta: { marginHorizontal: 10, marginBottom: 10, marginTop: 4 },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  metaText: { fontSize: 12, color: TEXT_GRAY },
  gridPlaceholder: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: PAD,
    gap: 12,
  },
  skeletonListWrap: { marginBottom: 16 },
  emptyWrap: {
    paddingVertical: 32,
    alignItems: "center",
    marginHorizontal: PAD,
  },
  emptyText: { fontSize: 15, color: TEXT_GRAY, marginTop: 8 },
  featuredCard: {
    marginHorizontal: PAD,
    marginBottom: 16,
    borderRadius: 16,
    overflow: "hidden",
    ...SHADOW,
    backgroundColor: CARD_BG,
  },
  featuredImageWrap: {
    height: 160,
    position: "relative",
    backgroundColor: "#eee",
  },
  featuredImage: { width: "100%", height: "100%" },
  featuredOfferTag: {
    position: "absolute",
    top: 12,
    left: 12,
    backgroundColor: "#3b82f6",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  featuredOfferText: { fontSize: 12, fontWeight: "700", color: "#fff" },
  featuredOverlay: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    padding: 12,
    backgroundColor: "rgba(0,0,0,0.5)",
  },
  featuredTitle: { fontSize: 16, fontWeight: "700", color: "#fff" },
  featuredPrice: { fontSize: 13, color: "rgba(255,255,255,0.9)", marginTop: 2 },
});
