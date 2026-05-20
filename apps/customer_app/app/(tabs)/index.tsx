/**
 * Home – GatiMitra reference UI: location header, hero offer, Services grid, branding.
 */

import { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  Image,
  RefreshControl,
} from "react-native";
import { useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useLocationStore } from "@/store/locationStore";
import { BrandingFooter } from "@/components/BrandingFooter";
import { HEADER_PADDING_TOP, HEADER_VERTICAL_PADDING } from "@/constants/layout";

const CATEGORY_IMAGES: Record<string, ReturnType<typeof require>> = {
  food: require("../../public/img/food.png"),
  ride: require("../../public/img/ridecard.png"),
  parcels: require("../../public/img/parcelcard.png"),
  ecom: require("../../public/img/ecomer.png"),
  vouchers: require("../../public/img/voucher.png"),
  "near-me": require("../../public/img/loc.png"),
};

const { width: SCREEN_W } = Dimensions.get("window");
const PAD = 16;
const GAP = 10;
const COLS = 2;
const CARD_W = (SCREEN_W - PAD * 2 - GAP) / COLS;

const BG = "#F3F4F6";
const CARD_BG = "#FFFFFF";
const TITLE_DARK = "#111827";
const TEXT_GRAY = "#6B7280";
const TEAL = "#14B8A6";
const TEAL_DARK = "#0D9488";
const BORDER = "#E5E7EB";

const SHADOW_CARD = {
  shadowColor: "#0f172a",
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.06,
  shadowRadius: 8,
  elevation: 3,
};

/** Food-only launch: faded + disabled; UI still matches reference. */
const ACTIVE_SERVICE_IDS = new Set<string>(["food"]);

type CategoryTheme = {
  pillBg: string;
  pillText: string;
  arrowBg: string;
  imageWash: string;
  pillIcon?: keyof typeof Ionicons.glyphMap;
};

const CATEGORY_THEMES: Record<string, CategoryTheme> = {
  food: {
    pillBg: "#EDE9FE",
    pillText: "#6D28D9",
    arrowBg: "#7C3AED",
    imageWash: "#F5F3FF",
    pillIcon: "flash",
  },
  ride: {
    pillBg: "#DCFCE7",
    pillText: "#15803D",
    arrowBg: "#16A34A",
    imageWash: "#ECFDF5",
  },
  parcels: {
    pillBg: "#DCFCE7",
    pillText: "#15803D",
    arrowBg: "#16A34A",
    imageWash: "#ECFDF5",
  },
  ecom: {
    pillBg: "#DBEAFE",
    pillText: "#1D4ED8",
    arrowBg: "#2563EB",
    imageWash: "#EFF6FF",
  },
  vouchers: {
    pillBg: "#FFEDD5",
    pillText: "#C2410C",
    arrowBg: "#EA580C",
    imageWash: "#FFF7ED",
  },
  "near-me": {
    pillBg: "#FCE7F3",
    pillText: "#BE185D",
    arrowBg: "#DB2777",
    imageWash: "#FDF2F8",
  },
};

const CATEGORIES = [
  {
    id: "food",
    title: "Order Food",
    pill: "Fresh & Fast Delivery",
    route: "/home" as const,
  },
  {
    id: "ride",
    title: "Book a Ride",
    pill: "Going Out",
    route: "/home/service/ride" as const,
  },
  {
    id: "parcels",
    title: "Courier Service",
    pill: "Send Parcels",
    route: "/home/service/parcels" as const,
  },
  {
    id: "ecom",
    title: "E-Commerce",
    pill: "Elect & Ecom",
    route: "/home/shop" as const,
  },
  {
    id: "vouchers",
    title: "Online Vouchers",
    pill: "Offers",
    route: "/home/service/vouchers" as const,
  },
  {
    id: "near-me",
    title: "Explore Nearby",
    pill: "Near Me",
    route: "/home/service/near-me" as const,
  },
] as const;

function ServiceCard({
  title,
  pill,
  theme,
  imageSource,
  onPress,
  disabled,
}: {
  title: string;
  pill: string;
  theme: CategoryTheme;
  imageSource: ReturnType<typeof require>;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      activeOpacity={disabled ? 1 : 0.88}
      style={[styles.serviceCard, disabled && styles.serviceCardDisabled]}
    >
      <View style={[styles.servicePill, { backgroundColor: theme.pillBg }]}>
        {theme.pillIcon ? (
          <Ionicons name={theme.pillIcon} size={10} color={theme.pillText} style={styles.servicePillIcon} />
        ) : null}
        <Text style={[styles.servicePillText, { color: theme.pillText }]} numberOfLines={1}>
          {pill}
        </Text>
      </View>

      <Text style={styles.serviceTitle} numberOfLines={2}>
        {title}
      </Text>

      <View style={[styles.serviceArrowBtn, { backgroundColor: theme.arrowBg }]}>
        <Ionicons name="chevron-forward" size={14} color="#fff" />
      </View>

      <View style={[styles.serviceImageWash, { backgroundColor: theme.imageWash }]}>
        <Image source={imageSource} style={styles.serviceImage} resizeMode="contain" />
      </View>
    </TouchableOpacity>
  );
}

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);
  const locationHydrated = useLocationStore((s) => s.locationHydrated);
  const locationSource = useLocationStore((s) => s.locationSource);
  const coords = useLocationStore((s) => s.coords);
  const { address, requestPermissionAndFetch, refetchLocation } = useLocationStore();

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["addresses"] }),
        queryClient.invalidateQueries({ queryKey: ["active-location"] }),
      ]);
      if (locationSource !== "selected") {
        await refetchLocation();
      }
    } finally {
      setRefreshing(false);
    }
  }, [queryClient, locationSource, refetchLocation]);

  useEffect(() => {
    if (!locationHydrated) return;
    if (locationSource === "selected" && coords) return;
    if (locationSource === "current" && coords) return;
    requestPermissionAndFetch();
  }, [locationHydrated, locationSource, coords, requestPermissionAndFetch]);

  const isPincode = (value?: string | null) => !!value && /^\d{6}$/.test(value.trim());
  const fullParts = (address?.fullAddress ?? "")
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  const secondaryParts = (address?.secondary ?? "")
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  const stateCandidate =
    address?.state ??
    [...fullParts].reverse().find((p) => !isPincode(p) && p.toLowerCase() !== "india");
  const normalizedState = stateCandidate?.toLowerCase() ?? "";
  const areaLocalityCandidates = [...secondaryParts, ...fullParts, address?.primary ?? ""]
    .map((p) => p.trim())
    .filter(
      (p) =>
        !!p &&
        !isPincode(p) &&
        p.toLowerCase() !== "india" &&
        p.toLowerCase() !== normalizedState
    );
  const dedupedAreaLocality = Array.from(new Set(areaLocalityCandidates));
  const locationPrimary = dedupedAreaLocality.slice(0, 2).join(", ") || "Current location";
  const locationSecondary = stateCandidate ?? "Turn on location for accurate address";

  return (
    <View style={styles.container}>
      <View
        style={[
          styles.header,
          { paddingTop: HEADER_PADDING_TOP, paddingBottom: HEADER_VERTICAL_PADDING },
        ]}
      >
        <TouchableOpacity
          style={styles.locationBlock}
          activeOpacity={0.8}
          onPress={() => router.push("/location")}
        >
          <View style={styles.locationPinCircle}>
            <Ionicons name="location" size={14} color="#FFFFFF" />
          </View>
          <View style={styles.locationTextBlock}>
            <View style={styles.locationRow}>
              <Text style={styles.locationPrimary} numberOfLines={1}>
                {locationPrimary}
              </Text>
              <Ionicons name="chevron-down" size={16} color={TEXT_GRAY} />
            </View>
            <Text style={styles.locationSecondary} numberOfLines={1}>
              {locationSecondary}
            </Text>
          </View>
        </TouchableOpacity>
        <View style={styles.headerIcons}>
          <TouchableOpacity style={styles.iconBtn} onPress={() => router.push("/search")}>
            <Ionicons name="search" size={22} color={TITLE_DARK} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.iconBtn} onPress={() => router.push("/notifications")}>
            <Ionicons name="notifications-outline" size={22} color={TITLE_DARK} />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 88 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={TEAL} colors={[TEAL]} />
        }
      >
        <TouchableOpacity style={styles.promoCard} activeOpacity={0.92} onPress={() => {}}>
          <LinearGradient
            colors={[TEAL_DARK, TEAL, "#2DD4BF"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
          <View style={styles.promoDecorA} pointerEvents="none" />
          <View style={styles.promoDecorB} pointerEvents="none" />
          <View style={styles.promoInner}>
            <View style={styles.promoContent}>
              <View style={styles.promoLimitedBadge}>
                <Text style={styles.promoLimitedText}>LIMITED TIME</Text>
              </View>
              <Text style={styles.promoTitle}>Offers for you</Text>
              <Text style={styles.promoSub}>Get 20% off on your first order</Text>
              <View style={styles.promoBtn}>
                <Text style={styles.promoBtnText}>Explore now</Text>
                <Ionicons name="chevron-forward" size={14} color={TEAL_DARK} />
              </View>
            </View>
            <View style={styles.promoImageWrap}>
              <Image
                source={require("../../public/img/fav.png")}
                style={styles.promoImage}
                resizeMode="contain"
              />
            </View>
          </View>
        </TouchableOpacity>

        <View style={styles.servicesTitleRow}>
          <Ionicons name="sparkles" size={14} color={TEAL} />
          <Text style={styles.servicesTitle}>Services</Text>
          <Ionicons name="sparkles" size={14} color={TEAL} />
        </View>

        <View style={styles.gridWrap}>
          {CATEGORIES.map((c) => {
            const active = ACTIVE_SERVICE_IDS.has(c.id);
            const theme = CATEGORY_THEMES[c.id];
            return (
              <ServiceCard
                key={c.id}
                title={c.title}
                pill={c.pill}
                theme={theme}
                imageSource={CATEGORY_IMAGES[c.id]}
                onPress={() => {
                  if (!active) return;
                  router.push(c.route as never);
                }}
                disabled={!active}
              />
            );
          })}
        </View>

        <BrandingFooter variant="home" />
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
  },
  locationBlock: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    marginRight: 6,
  },
  locationPinCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#EC4899",
    alignItems: "center",
    justifyContent: "center",
  },
  locationTextBlock: {
    marginLeft: 8,
    flex: 1,
  },
  locationRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  locationPrimary: {
    fontSize: 15,
    fontWeight: "700",
    color: TITLE_DARK,
    flexShrink: 1,
  },
  locationSecondary: {
    fontSize: 12,
    color: TEXT_GRAY,
    marginTop: 1,
  },
  headerIcons: {
    flexDirection: "row",
    alignItems: "center",
  },
  iconBtn: {
    padding: 8,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: PAD,
    paddingTop: 12,
  },
  promoCard: {
    borderRadius: 16,
    minHeight: 128,
    overflow: "hidden",
    marginBottom: 14,
    ...SHADOW_CARD,
  },
  promoDecorA: {
    position: "absolute",
    top: -20,
    right: 40,
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "rgba(255,255,255,0.12)",
  },
  promoDecorB: {
    position: "absolute",
    bottom: -16,
    left: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  promoInner: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 16,
    minHeight: 128,
  },
  promoContent: {
    flex: 1,
    paddingRight: 8,
  },
  promoLimitedBadge: {
    alignSelf: "flex-start",
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    marginBottom: 8,
  },
  promoLimitedText: {
    fontSize: 9,
    fontWeight: "800",
    color: "#475569",
    letterSpacing: 0.4,
  },
  promoTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: "#FFFFFF",
    letterSpacing: -0.3,
  },
  promoSub: {
    fontSize: 13,
    fontWeight: "500",
    color: "rgba(255,255,255,0.95)",
    marginTop: 4,
  },
  promoBtn: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 4,
    marginTop: 10,
    paddingVertical: 8,
    paddingHorizontal: 14,
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
  },
  promoBtnText: {
    fontSize: 13,
    fontWeight: "700",
    color: TEAL_DARK,
  },
  promoImageWrap: {
    width: 88,
    height: 88,
    alignItems: "center",
    justifyContent: "center",
  },
  promoImage: {
    width: 80,
    height: 80,
  },
  servicesTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    marginBottom: 10,
  },
  servicesTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: TITLE_DARK,
  },
  gridWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: GAP,
  },
  serviceCard: {
    width: CARD_W,
    backgroundColor: CARD_BG,
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingTop: 10,
    paddingBottom: 10,
    minHeight: 132,
    ...SHADOW_CARD,
  },
  serviceCardDisabled: {
    opacity: 0.48,
  },
  servicePill: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 10,
    maxWidth: "92%",
  },
  servicePillIcon: {
    marginRight: 3,
  },
  servicePillText: {
    fontSize: 9,
    fontWeight: "700",
    flexShrink: 1,
  },
  serviceTitle: {
    fontSize: 14,
    fontWeight: "800",
    color: TITLE_DARK,
    marginTop: 6,
    marginRight: 72,
    lineHeight: 18,
  },
  serviceArrowBtn: {
    position: "absolute",
    left: 10,
    bottom: 10,
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
  },
  serviceImageWash: {
    position: "absolute",
    right: 6,
    bottom: 6,
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  serviceImage: {
    width: 56,
    height: 56,
  },
});
