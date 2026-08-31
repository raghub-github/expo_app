/**
 * Grid-first food home header — reference layout (location, wallet, profile, search, veg).
 */

import { useEffect, useMemo, useState } from "react";
import { View, TouchableOpacity, StyleSheet, Platform } from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
  interpolate,
  Extrapolation,
  type SharedValue,
} from "react-native-reanimated";
import { useRouter } from "expo-router";
import { GatiCashHeaderPill } from "@/components/home/GatiCashHeaderPill";
import { useCurrentSubscription } from "@/hooks/useCustomerSubscription";
import { useProfile } from "@/hooks/useProfile";
import { isCustomProfileUploadUrl } from "@/lib/emailAvatar";
import { getNameInitials } from "@/lib/nameInitials";
import { toAbsoluteImageUrl } from "@/utils/mediaUrl";
import { useAuthStore } from "@/store/authStore";
import { GatiMitraColors } from "@/constants/gatimitra";
import { STATUS_BAR_TO_HEADER_GAP } from "@/constants/layout";
import { AppText } from "@/components/AppText";

/** Location row height in grid-first hero header (search sits below). */
export const GRID_FIRST_LOCATION_ROW_H = 56;
const PAD = 16;
const SEARCH_ICON = GatiMitraColors.primaryMint;
const PLACEHOLDERS = [
  'Search "comfort food"',
  "Search biryani…",
  "Search restaurants…",
  "Search dishes near you…",
];
export const GROCERY_SEARCH_PLACEHOLDERS = [
  'Search "milk & bread"',
  "Search snacks…",
  "Search groceries…",
  "Search items near you…",
];
const ROTATE_MS = 3500;

/** White label + dark halo — readable on light or dark hero media without a box. */
const HERO_OVERLAY_TEXT_SHADOW = {
  textShadowColor: "rgba(0, 0, 0, 0.82)",
  textShadowOffset: { width: 0, height: 1 },
  textShadowRadius: 5,
} as const;

type Props = {
  variant?: "full" | "location" | "search";
  topInset?: number;
  locationPrimary?: string;
  locationSecondary?: string;
  onLocationPress?: () => void;
  onSearchPress: () => void;
  vegOnly: boolean;
  onVegChange: (value: boolean) => void;
  /** Hide veg switch (e.g. grocery home). */
  showVegToggle?: boolean;
  /** Rotating search hints — defaults to food placeholders. */
  searchPlaceholders?: string[];
  /** Sticky overlay — clearer search pill border on white chrome. */
  highlightSearchPill?: boolean;
  /** Fade in-flow search when staged sticky search takes over. */
  stickyScrollY?: SharedValue<number>;
  searchStickAt?: SharedValue<number>;
  /** Fade location row with search when the pinned header includes location + wallet. */
  fadeLocationOnSticky?: boolean;
  /** Compact pre-hero state uses dark text on the page soft background. */
  heroReady?: boolean;
};

export function FoodHomeGridFirstHeader({
  variant = "full",
  topInset = STATUS_BAR_TO_HEADER_GAP,
  locationPrimary = "",
  locationSecondary = "",
  onLocationPress = () => {},
  onSearchPress,
  vegOnly,
  onVegChange,
  showVegToggle = true,
  searchPlaceholders = PLACEHOLDERS,
  highlightSearchPill = false,
  stickyScrollY,
  searchStickAt,
  fadeLocationOnSticky = false,
  heroReady = true,
}: Props) {
  const router = useRouter();
  const session = useAuthStore((s) => s.session);
  const hydrated = useAuthStore((s) => s.hydrated);
  const { data: profile } = useProfile();
  const { data: currentSubscription } = useCurrentSubscription(hydrated && !!session);
  const subscriptionName =
    currentSubscription?.active === true
      ? (
          currentSubscription.plan?.planName ||
          currentSubscription.subscription?.planName ||
          ""
        ).trim()
      : "";
  const [placeholderIndex, setPlaceholderIndex] = useState(0);
  const micScale = useSharedValue(1);

  const displayName = profile?.full_name?.trim() || "Customer";
  const initials = useMemo(() => getNameInitials(displayName), [displayName]);
  const profileImageUrl = profile?.profile_image_url?.trim() || null;
  const avatarUri = useMemo(() => {
    if (!isCustomProfileUploadUrl(profileImageUrl) || !profileImageUrl) return null;
    return toAbsoluteImageUrl(profileImageUrl);
  }, [profileImageUrl]);
  const [avatarReady, setAvatarReady] = useState(false);

  useEffect(() => {
    setAvatarReady(false);
    if (!avatarUri) return;
    let cancelled = false;
    void Image.prefetch(avatarUri, { cachePolicy: "memory-disk" })
      .then(() => {
        if (!cancelled) setAvatarReady(true);
      })
      .catch(() => {
        /* onLoad / onError on Image still handle paint */
      });
    return () => {
      cancelled = true;
    };
  }, [avatarUri]);

  useEffect(() => {
    if (searchPlaceholders.length <= 1) return;
    const id = setInterval(() => {
      setPlaceholderIndex((i) => {
        const next = (i + 1) % searchPlaceholders.length;
        return next === i ? i : next;
      });
    }, ROTATE_MS);
    return () => clearInterval(id);
  }, [searchPlaceholders]);

  useEffect(() => {
    micScale.value = withRepeat(
      withSequence(withTiming(1.08, { duration: 800 }), withTiming(1, { duration: 800 })),
      -1,
      true
    );
  }, [micScale]);

  const micStyle = useAnimatedStyle(() => ({
    transform: [{ scale: micScale.value }],
  }));

  const showLocation = variant === "full" || variant === "location";
  const showSearch = variant === "full" || variant === "search";

  const fallbackScrollY = useSharedValue(0);
  const fallbackStickAt = useSharedValue(Number.MAX_SAFE_INTEGER);
  const scrollYSv = stickyScrollY ?? fallbackScrollY;
  const stickAtSv = searchStickAt ?? fallbackStickAt;
  const stickyEnabled = Boolean(stickyScrollY && searchStickAt);

  const inFlowSearchFadeStyle = useAnimatedStyle(() => {
    if (!stickyEnabled) return { opacity: 1 };
    const stickAt = stickAtSv.value;
    return {
      opacity: interpolate(
        scrollYSv.value,
        [stickAt - 10, stickAt + 10],
        [1, 0],
        Extrapolation.CLAMP
      ),
    };
  });

  const locationRow = showLocation ? (
      <View style={styles.topRow}>
        <TouchableOpacity
          style={styles.locationBlock}
          activeOpacity={0.85}
          onPress={onLocationPress}
        >
          <View style={styles.locationTitleRow}>
            <AppText
              style={[styles.locationPrimary, !heroReady && styles.locationPrimaryCompact]}
              numberOfLines={1}
            >
              {locationPrimary}
            </AppText>
            <Ionicons
              name="chevron-down"
              size={16}
              color={heroReady ? "#FFFFFF" : "#334155"}
            />
          </View>
          <AppText
            style={[styles.locationSecondary, !heroReady && styles.locationSecondaryCompact]}
            numberOfLines={1}
          >
            {locationSecondary}
          </AppText>
        </TouchableOpacity>

        <View style={styles.topActions}>
          {subscriptionName ? (
            <TouchableOpacity
              style={styles.subscriptionPill}
              activeOpacity={0.85}
              onPress={() => router.push("/profile/subscription")}
              accessibilityRole="button"
              accessibilityLabel={`${subscriptionName} membership`}
            >
              <Ionicons name="ribbon" size={11} color="#B45309" />
              <AppText style={styles.subscriptionText} numberOfLines={1}>
                {subscriptionName}
              </AppText>
            </TouchableOpacity>
          ) : null}
          <GatiCashHeaderPill variant="gridFirst" fromFoodHome />
          <TouchableOpacity
            style={styles.avatarBtn}
            activeOpacity={0.85}
            onPress={() => router.push("/profile")}
            accessibilityLabel="Profile"
          >
            <AppText
              style={[styles.avatarInitials, avatarReady && avatarUri ? styles.avatarInitialsHidden : null]}
            >
              {initials}
            </AppText>
            {avatarUri ? (
              <Image
                source={{ uri: avatarUri }}
                style={[styles.avatarImg, !avatarReady && styles.avatarImgPending]}
                contentFit="cover"
                cachePolicy="memory-disk"
                recyclingKey={avatarUri}
                transition={0}
                onLoad={() => setAvatarReady(true)}
                onError={() => setAvatarReady(false)}
              />
            ) : null}
          </TouchableOpacity>
        </View>
      </View>
  ) : null;

  return (
    <View style={[styles.wrap, { paddingTop: topInset }]}>
      {locationRow ? (
        fadeLocationOnSticky ? (
          <Animated.View style={inFlowSearchFadeStyle}>{locationRow}</Animated.View>
        ) : (
          locationRow
        )
      ) : null}

      {showSearch ? (
      <Animated.View style={inFlowSearchFadeStyle}>
      <View style={styles.searchRow}>
        <TouchableOpacity
          style={[
            styles.searchPill,
            (highlightSearchPill || !heroReady) && styles.searchPillSticky,
          ]}
          activeOpacity={0.92}
          onPress={onSearchPress}
        >
          <Ionicons name="search" size={20} color={SEARCH_ICON} />
          <AppText style={styles.searchPlaceholder} numberOfLines={1}>
            {searchPlaceholders[placeholderIndex % searchPlaceholders.length]}
          </AppText>
          <Animated.View style={micStyle}>
            <Ionicons name="mic" size={18} color={SEARCH_ICON} />
          </Animated.View>
        </TouchableOpacity>

        {showVegToggle ? (
        <View style={styles.vegCol}>
          <View style={styles.vegLabelBadge}>
            <AppText style={styles.vegLabel}>VEG</AppText>
          </View>
          <TouchableOpacity
            style={[styles.vegToggle, vegOnly && styles.vegToggleOn]}
            onPress={() => onVegChange(!vegOnly)}
            activeOpacity={0.85}
            accessibilityRole="switch"
            accessibilityState={{ checked: vegOnly }}
          >
            <View style={[styles.vegThumb, vegOnly && styles.vegThumbOn]} />
          </TouchableOpacity>
        </View>
        ) : null}
      </View>
      </Animated.View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: PAD,
    paddingBottom: 0,
  },
  topRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 8,
    marginBottom: 10,
    zIndex: 3,
    elevation: 4,
  },
  locationBlock: {
    flex: 1,
    minWidth: 0,
    paddingTop: 2,
  },
  locationTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  locationPrimary: {
    fontSize: 17,
    fontWeight: "800",
    color: "#FFFFFF",
    letterSpacing: -0.3,
    flexShrink: 1,
    ...HERO_OVERLAY_TEXT_SHADOW,
  },
  locationSecondary: {
    marginTop: 2,
    fontSize: 12,
    fontWeight: "600",
    color: "rgba(255, 255, 255, 0.94)",
    lineHeight: 16,
    ...HERO_OVERLAY_TEXT_SHADOW,
  },
  locationPrimaryCompact: {
    color: "#0F172A",
    textShadowColor: "transparent",
    textShadowRadius: 0,
  },
  locationSecondaryCompact: {
    color: "#64748B",
    textShadowColor: "transparent",
    textShadowRadius: 0,
  },
  topActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexShrink: 0,
    paddingTop: 2,
    zIndex: 4,
    elevation: 5,
  },
  subscriptionPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    maxWidth: 88,
    paddingHorizontal: 7,
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: "#FFFBEB",
    borderWidth: 1,
    borderColor: "#FDE68A",
  },
  subscriptionText: {
    flexShrink: 1,
    fontSize: 9,
    fontWeight: "800",
    color: "#92400E",
    letterSpacing: 0.1,
  },
  avatarBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.9)",
    ...(Platform.OS === "ios" && {
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.1,
      shadowRadius: 3,
    }),
    elevation: 2,
  },
  avatarImg: {
    ...StyleSheet.absoluteFillObject,
  },
  avatarImgPending: {
    opacity: 0,
  },
  avatarInitials: {
    fontSize: 12,
    fontWeight: "800",
    color: GatiMitraColors.primaryMint,
  },
  avatarInitialsHidden: {
    opacity: 0,
  },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  searchPill: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    paddingVertical: 11,
    paddingHorizontal: 14,
  },
  searchPillSticky: {
    borderWidth: 1.5,
    borderColor: "#D1D5DB",
  },
  searchPlaceholder: {
    flex: 1,
    minWidth: 0,
    fontSize: 14,
    color: "#9CA3AF",
    fontWeight: "500",
  },
  vegCol: {
    alignItems: "center",
    justifyContent: "center",
    width: 38,
    gap: 4,
  },
  vegLabelBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: "rgba(255, 255, 255, 0.94)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.98)",
    ...(Platform.OS === "ios" && {
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.14,
      shadowRadius: 2,
    }),
    elevation: 2,
  },
  vegLabel: {
    fontSize: 10,
    fontWeight: "800",
    color: "#374151",
    letterSpacing: 0.4,
  },
  vegToggle: {
    width: 34,
    height: 18,
    borderRadius: 9,
    backgroundColor: "#D1D5DB",
    padding: 2,
    justifyContent: "center",
  },
  vegToggleOn: {
    backgroundColor: GatiMitraColors.primaryMint,
  },
  vegThumb: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: "#FFFFFF",
  },
  vegThumbOn: {
    alignSelf: "flex-end",
  },
});
