/**
 * Home – reference layout: location (2-line), search, cart, wallet balance, notifications.
 * Grid of category cards with pill tags. View More, promo banner, dismissible rewards.
 * Uses wallet icon for user balance (no coin).
 */

import { useState, useEffect } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  Image,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useLocationStore } from "@/store/locationStore";
import { HEADER_PADDING_TOP, HEADER_VERTICAL_PADDING } from "@/constants/layout";

const CATEGORY_IMAGES: Record<string, ReturnType<typeof require>> = {
  food: require("../../public/img/food.png"),
  ride: require("../../public/img/ridecard.png"),
  parcels: require("../../public/img/parcelcard.png"),
  ecom: require("../../public/img/ecomer.png"),
  vouchers: require("../../public/img/voucher.png"),
  "near-me": require("../../public/img/loc.png"),
};

const { width } = Dimensions.get("window");
const PAD = 16;
const GAP = 12;
const COLS_DEFAULT = 2; // match image: 2 columns × N rows for ≤8 items
const MAX_ITEMS_NO_SCROLL = 8; // when >8 items: 2 rows, horizontal scroll

const BG = "#F2F4F6";
const CARD_BG = "#FFFFFF";
const TITLE_DARK = "#1A1A1A";
const TEXT_GRAY = "#6B7280";
const TEAL = "#14b8a6";
const PURPLE = "#7c3aed";
const BORDER = "#E5E7EB";
const PILL_MINT = "#B8E4E0";
const PILL_PURPLE = "#DDD6FE";
const SHADOW_CARD = {
  shadowColor: "#000",
  shadowOffset: { width: 0, height: 1 },
  shadowOpacity: 0.04,
  shadowRadius: 6,
  elevation: 2,
};

const CATEGORIES = [
  {
    id: "food",
    title: "Order Food",
    pill: "Fresh & Fast Delivery",
    pillColor: PILL_PURPLE,
    icon: "restaurant" as const,
    route: "/home" as const,
  },
  {
    id: "ride",
    title: "Book a Ride",
    pill: "Going Out",
    pillColor: PILL_MINT,
    icon: "car" as const,
    route: "/home/service/ride" as const,
  },
  {
    id: "parcels",
    title: "Courier Service",
    pill: "Send Parcels",
    pillColor: PILL_MINT,
    icon: "cube" as const,
    route: "/home/service/parcels" as const,
  },
  {
    id: "ecom",
    title: "E-Commerce",
    pill: "Elect & Ecom",
    pillColor: PILL_MINT,
    icon: "phone-portrait" as const,
    route: "/home/shop" as const,
  },
  {
    id: "vouchers",
    title: "Online Vouchers",
    pill: "Offers",
    pillColor: PILL_PURPLE,
    icon: "pricetag" as const,
    route: "/home/service/vouchers" as const,
  },
  {
    id: "near-me",
    title: "Explore Nearby",
    pill: "Near Me",
    pillColor: PILL_MINT,
    icon: "location" as const,
    route: "/home/service/near-me" as const,
  },
] as const;

function CategoryCard({
  title,
  pill,
  pillColor,
  icon,
  imageSource,
  onPress,
  cardWidth,
}: {
  title: string;
  pill: string;
  pillColor: string;
  icon: keyof typeof Ionicons.glyphMap;
  imageSource?: ReturnType<typeof require>;
  onPress: () => void;
  cardWidth: number;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.85}
      style={[styles.categoryCard, { width: cardWidth }]}
    >
      {pill ? (
        <View style={[styles.pill, { backgroundColor: pillColor }]}>
          <Text style={styles.pillText} numberOfLines={1}>
            {pill}
          </Text>
        </View>
      ) : null}
      <Text style={styles.categoryTitle} numberOfLines={2}>
        {title}
      </Text>
      <View style={styles.categoryIconWrap}>
        {imageSource ? (
          <Image source={imageSource} style={styles.categoryImage} resizeMode="contain" />
        ) : (
          <Ionicons name={icon} size={36} color={TEAL} />
        )}
      </View>
    </TouchableOpacity>
  );
}

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { address, requestPermissionAndFetch } = useLocationStore();

  useEffect(() => {
    requestPermissionAndFetch();
  }, [requestPermissionAndFetch]);

  const locationPrimary = address?.primary ?? "Current location";
  const locationSecondary = address?.secondary ?? "Turn on location for accurate address";

  return (
    <View style={styles.container}>
      {/* Header – same status bar → header spacing as all app screens */}
      <View style={[styles.header, { paddingTop: HEADER_PADDING_TOP, paddingBottom: HEADER_VERTICAL_PADDING }]}>
        <TouchableOpacity
          style={styles.locationBlock}
          activeOpacity={0.8}
          onPress={() => router.push("/location")}
        >
          <Ionicons name="location" size={22} color="#ec4899" />
          <View style={styles.locationTextBlock}>
            <View style={styles.locationRow}>
              <Text style={styles.locationPrimary} numberOfLines={1}>
                {locationPrimary}
              </Text>
              <Ionicons name="chevron-down" size={18} color={TEXT_GRAY} />
            </View>
            <Text style={styles.locationSecondary} numberOfLines={1}>
              {locationSecondary}
            </Text>
          </View>
        </TouchableOpacity>
        <View style={styles.headerIcons}>
          <TouchableOpacity
            style={styles.iconBtn}
            onPress={() => router.push("/search")}
          >
            <Ionicons name="search" size={22} color={TITLE_DARK} />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.iconBtn}
            onPress={() => router.push("/notifications")}
          >
            <Ionicons name="notifications-outline" size={22} color={TITLE_DARK} />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 100 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero offer card – compact */}
        <TouchableOpacity style={styles.promoCard} activeOpacity={0.92} onPress={() => {}}>
          <View style={styles.promoContent}>
            <Text style={styles.promoTitle}>Offers for you</Text>
            <Text style={styles.promoSub}>Get 20% off on your first order</Text>
            <View style={styles.promoBtn}>
              <Text style={styles.promoBtnText}>Explore now</Text>
            </View>
          </View>
          <View style={styles.promoIconWrap}>
            <Image source={require("../../public/img/fav.png")} style={styles.promoImage} resizeMode="contain" />
          </View>
        </TouchableOpacity>

        {/* Section label */}
        <Text style={styles.sectionLabel}>Services</Text>

        {/* Category grid – compact cards */}
        {CATEGORIES.length <= MAX_ITEMS_NO_SCROLL ? (
          <View style={styles.gridWrap}>
            {CATEGORIES.map((c) => (
              <CategoryCard
                key={c.id}
                title={c.title}
                pill={c.pill}
                pillColor={c.pillColor}
                icon={c.icon}
                imageSource={CATEGORY_IMAGES[c.id]}
                onPress={() => router.push(c.route as any)}
                cardWidth={(width - PAD * 2 - GAP) / COLS_DEFAULT}
              />
            ))}
          </View>
        ) : (
          (() => {
            const rows = 2;
            const cols = Math.ceil(CATEGORIES.length / rows);
            const cardWidth = (width - PAD * 2 - (4 - 1) * GAP) / 4;
            const contentWidth = cols * cardWidth + (cols - 1) * GAP;
            const row0 = CATEGORIES.slice(0, cols);
            const row1 = CATEGORIES.slice(cols, cols * 2);
            const renderRow = (items: typeof CATEGORIES) => (
              <View style={[styles.categoryRow, { marginBottom: items.length ? GAP : 0 }]}>
                {items.map((c) => (
                  <CategoryCard
                    key={c.id}
                    title={c.title}
                    pill={c.pill}
                    pillColor={c.pillColor}
                    icon={c.icon}
                    imageSource={CATEGORY_IMAGES[c.id]}
                    onPress={() => router.push(c.route as any)}
                    cardWidth={cardWidth}
                  />
                ))}
              </View>
            );
            return (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.categoryScrollContainer}
              >
                <View style={[styles.gridTwoRows, { width: contentWidth }]}>
                  {renderRow(row0)}
                  {renderRow(row1)}
                </View>
              </ScrollView>
            );
          })()
        )}

      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: BG,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: CARD_BG,
    paddingHorizontal: PAD,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  locationBlock: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    marginRight: 8,
  },
  locationTextBlock: {
    marginLeft: 10,
    flex: 1,
  },
  locationRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  locationPrimary: {
    fontSize: 16,
    fontWeight: "700",
    color: TITLE_DARK,
  },
  locationSecondary: {
    fontSize: 13,
    color: TEXT_GRAY,
    marginTop: 2,
  },
  headerIcons: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  iconBtn: {
    padding: 8,
    position: "relative",
  },
  badge: {
    position: "absolute",
    top: 4,
    right: 4,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: "#dc2626",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  badgeText: {
    color: "#fff",
    fontSize: 10,
    fontWeight: "700",
  },
  walletWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  walletAmount: {
    fontSize: 14,
    fontWeight: "700",
    color: TITLE_DARK,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: PAD,
    paddingTop: 16,
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: TEXT_GRAY,
    letterSpacing: 0.3,
    marginBottom: 12,
    marginTop: 4,
  },
  categoryScrollContainer: {
    paddingHorizontal: PAD,
    paddingTop: 4,
  },
  gridWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: GAP,
  },
  gridTwoRows: {
    flexDirection: "column",
  },
  categoryRow: {
    flexDirection: "row",
    gap: GAP,
  },
  categoryCard: {
    backgroundColor: CARD_BG,
    borderRadius: 16,
    padding: 12,
    minHeight: 118,
    ...SHADOW_CARD,
  },
  pill: {
    alignSelf: "flex-start",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    marginBottom: 6,
    opacity: 1,
  },
  pillText: {
    fontSize: 10,
    fontWeight: "700",
    color: TITLE_DARK,
  },
  categoryTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: TITLE_DARK,
    marginBottom: 4,
  },
  categoryIconWrap: {
    position: "absolute",
    right: 8,
    bottom: 8,
    width: 58,
    height: 58,
    borderRadius: 14,
    backgroundColor: PILL_MINT,
    alignItems: "center",
    justifyContent: "center",
  },
  categoryImage: {
    width: 52,
    height: 52,
  },
  promoImage: {
    width: 36,
    height: 36,
  },
  promoCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: TEAL,
    borderRadius: 16,
    padding: 20,
    minHeight: 132,
    overflow: "hidden",
    marginBottom: 16,
    ...SHADOW_CARD,
  },
  promoContent: {
    flex: 1,
  },
  promoTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: "#fff",
  },
  promoSub: {
    fontSize: 13,
    color: "rgba(255,255,255,0.92)",
    marginTop: 2,
  },
  promoBtn: {
    alignSelf: "flex-start",
    marginTop: 8,
    paddingVertical: 6,
    paddingHorizontal: 14,
    backgroundColor: "rgba(255,255,255,0.28)",
    borderRadius: 8,
  },
  promoBtnText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#fff",
  },
  promoIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "rgba(255,255,255,0.28)",
    alignItems: "center",
    justifyContent: "center",
  },
});
