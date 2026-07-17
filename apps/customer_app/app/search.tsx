/**
 * Full-screen Food Search – opens when user taps search in Food Delivery.
 * Sticky header, recent searches (horizontal), category grid or search results.
 * Slide-from-right transition, keyboard auto-focus, debounced search, voice support.
 */

import React, { useRef, useEffect, useMemo } from "react";
import { AppText } from "@/components/AppText";

import { View, TextInput, TouchableOpacity, Pressable, StyleSheet, ScrollView, Image, KeyboardAvoidingView, Platform, ActivityIndicator, Dimensions, Vibration } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  Easing,
} from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { navigateToMerchant } from "@/lib/navigateToMerchant";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { GatiMitraColors } from "@/constants/gatimitra";
import {
  type UserAppCategoryItem,
} from "@/services/userAppCategory.service";
import { HEADER_PADDING_TOP, HEADER_VERTICAL_PADDING } from "@/constants/layout";
import { useRecentSearchStore } from "@/store/recentSearchStore";
import { useLocationStore } from "@/store/locationStore";
import { useDebouncedSearch, type SearchResults } from "@/hooks/useDebouncedSearch";
import { VoiceInputButton } from "@/components/VoiceInputButton";
import { AndroidBackHandler } from "@/components/AndroidBackHandler";
import { BrandingFooter } from "@/components/BrandingFooter";
import { RestaurantListSkeleton } from "@/components/ShimmerSkeleton";
import { UserAppCategoryImage } from "@/components/category/UserAppCategoryImage";
import {
  fetchUserAppCategoriesWithCache,
  getUserAppCategoriesCachedAt,
  prefetchUserAppCategoryImages,
  readSyncUserAppCategories,
  USER_APP_CATEGORIES_QUERY_OPTIONS,
  userAppCategoriesQueryKey,
} from "@/lib/userAppCategoryCache";
import {
  searchCategoryImageUrl,
  MOCK_DISHES,
  type SearchDish,
} from "@/constants/search";
import { useAppAssetSource } from "@/components/AppAssetImage";
import { CX } from "@/lib/appAssetKeys";
import type { MerchantSummary } from "@/services/merchant.service";
import { useDietaryPreferenceStore } from "@/store/dietaryPreferenceStore";

const { width, height } = Dimensions.get("window");
const PAD = 16;
/** Circular mind grid — 3 columns like polished discovery UIs. */
const GRID_COLS = 3;
const GRID_GAP = 14;
const CARD_WIDTH = (width - PAD * 2 - GRID_GAP * (GRID_COLS - 1)) / GRID_COLS;
const CARD_IMAGE_SIZE = CARD_WIDTH;
const SEARCH_CATEGORY_STORE_TYPE = "FOOD";

const PLACEHOLDER = "Restaurant name or a dish...";
const ACCENT_RED = "#E23744";
const SLOGAN_PINK = "#E11D8C";
const CHIP_BORDER = "#E9D5FF";
const CHIP_ICON = "#C026D3";
/** Max discovery chips under the search slogan (from live categories). */
const DISCOVERY_CHIP_LIMIT = 10;

/**
 * Mood-style chip copy — still routes to the same category.
 * Keys match category name fragments (case-insensitive).
 */
const DISCOVERY_CHIP_LABEL_BY_CATEGORY: { match: string; label: string }[] = [
  { match: "biryani", label: "Craving biryani?" },
  { match: "pizza", label: "Pizza night?" },
  { match: "momo", label: "Steam & dunk momos" },
  { match: "burger", label: "Stacked burgers" },
  { match: "thali", label: "Full thali vibes" },
  { match: "paratha", label: "Hot stuffed parathas" },
  { match: "rasgulla", label: "Something sweet" },
  { match: "idli", label: "Soft idli mornings" },
  { match: "vada", label: "Crispy vada fix" },
  { match: "kheer", label: "Bowl of kheer" },
  { match: "cake", label: "Slice of cake" },
  { match: "falooda", label: "Chilled falooda" },
  { match: "pancake", label: "Fluffy pancakes" },
  { match: "mousse", label: "Silky mousse" },
  { match: "sabudana", label: "Sabudana comfort" },
  { match: "mutton", label: "Rich mutton moods" },
  { match: "chicken", label: "Chicken cravings" },
  { match: "dosa", label: "Crispy dosa run" },
  { match: "noodle", label: "Noodle bowl time" },
  { match: "pasta", label: "Pasta please" },
  { match: "sandwich", label: "Grab a sandwich" },
  { match: "roll", label: "Wrapped & ready" },
  { match: "chaat", label: "Kuch chatpata" },
  { match: "sweet", label: "Dessert detour" },
  { match: "ice cream", label: "Cold & creamy" },
  { match: "juice", label: "Fresh sips" },
  { match: "coffee", label: "Coffee break" },
  { match: "tea", label: "Chai time" },
];

function discoveryChipLabel(categoryName: string): string {
  const key = categoryName.trim().toLowerCase();
  if (!key) return categoryName;
  for (const row of DISCOVERY_CHIP_LABEL_BY_CATEGORY) {
    if (key === row.match || key.includes(row.match)) return row.label;
  }
  return `Try ${categoryName}`;
}
function dedupeUserAppCategories(rows: UserAppCategoryItem[]): UserAppCategoryItem[] {
  const byId = new Map<number, UserAppCategoryItem>();
  for (const r of rows) {
    if (!byId.has(r.id)) byId.set(r.id, r);
  }
  const byName = new Map<string, UserAppCategoryItem>();
  for (const r of byId.values()) {
    const key = r.name.trim().toLowerCase();
    const cur = byName.get(key);
    if (!cur || r.displayOrder < cur.displayOrder || (r.displayOrder === cur.displayOrder && r.id < cur.id)) {
      byName.set(key, r);
    }
  }
  return [...byName.values()].sort(
    (a, b) => a.displayOrder - b.displayOrder || a.id - b.id
  );
}

type MindGridRow = { id: string; name: string; slug: string; imageUrl: string | null };

function normalizeSearchParam(raw: string | string[] | undefined): string {
  if (typeof raw === "string") return raw;
  if (Array.isArray(raw)) return raw[0] ?? "";
  return "";
}

export default function SearchScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const params = useLocalSearchParams<{ voice?: string; q?: string | string[] }>();
  const insets = useSafeAreaInsets();
  const voiceMode = params.voice === "1";

  const [query, setQuery] = React.useState(() => normalizeSearchParam(params.q));
  const inputRef = useRef<TextInput>(null);

  React.useEffect(() => {
    const next = normalizeSearchParam(params.q);
    if (next) setQuery(next);
  }, [params.q]);
  const { items: recentSearches, addRecentSearch, removeRecentSearch, clearRecentSearches, hydrate } = useRecentSearchStore();
  const { coords } = useLocationStore();
  const vegOnly = useDietaryPreferenceStore((s) => s.vegOnly);
  const hydrateDietaryPreferences = useDietaryPreferenceStore((s) => s.hydrate);
  const { results, isLoading } = useDebouncedSearch(
    query,
    coords?.latitude,
    coords?.longitude,
    vegOnly
  );
  const [showSkeleton, setShowSkeleton] = React.useState(false);
  useEffect(() => {
    if (!isLoading) {
      setShowSkeleton(false);
      return;
    }
    const t = setTimeout(() => setShowSkeleton(true), 200);
    return () => clearTimeout(t);
  }, [isLoading]);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  useEffect(() => {
    void hydrateDietaryPreferences();
  }, [hydrateDietaryPreferences]);

  const { data: mindCategoriesResponse, isPending: mindCategoriesPending } = useQuery({
    queryKey: userAppCategoriesQueryKey(SEARCH_CATEGORY_STORE_TYPE),
    queryFn: () => fetchUserAppCategoriesWithCache(SEARCH_CATEGORY_STORE_TYPE),
    ...USER_APP_CATEGORIES_QUERY_OPTIONS,
    initialData: () => readSyncUserAppCategories(SEARCH_CATEGORY_STORE_TYPE),
    initialDataUpdatedAt: () => getUserAppCategoriesCachedAt(SEARCH_CATEGORY_STORE_TYPE),
    placeholderData: (previousData) => previousData,
  });

  const apiMindCategories = mindCategoriesResponse?.items ?? [];

  React.useEffect(() => {
    if (apiMindCategories.length > 0 || mindCategoriesResponse?.allTab?.imageUrl) {
      prefetchUserAppCategoryImages(apiMindCategories, mindCategoriesResponse?.allTab?.imageUrl);
    }
  }, [apiMindCategories, mindCategoriesResponse?.allTab?.imageUrl]);

  const mindGridData = useMemo((): MindGridRow[] => {
    const deduped = dedupeUserAppCategories(apiMindCategories ?? []);
    return deduped.map((r) => ({
      id: String(r.id),
      name: r.name,
      slug: String(r.id),
      imageUrl: r.imageUrl,
    }));
  }, [apiMindCategories]);

  /** Discovery chips — mood copy, same category slug as mind grid. */
  const discoveryChips = useMemo(
    () =>
      mindGridData.slice(0, DISCOVERY_CHIP_LIMIT).map((c) => ({
        id: c.id,
        label: discoveryChipLabel(c.name),
        categoryName: c.name,
        slug: c.slug,
      })),
    [mindGridData]
  );

  useEffect(() => {
    if (!voiceMode) {
      const t = setTimeout(() => inputRef.current?.focus(), 400);
      return () => clearTimeout(t);
    }
  }, [voiceMode]);

  const showDefaultView = !query.trim();

  const handleClearInput = () => {
    setQuery("");
    inputRef.current?.focus();
  };

  const handleSelectRecent = (term: string) => {
    setQuery(term);
    addRecentSearch(term);
  };

  const handleRemoveRecent = (term: string) => {
    removeRecentSearch(term);
  };

  const handleDiscoveryChipPress = (slug: string, categoryName: string) => {
    addRecentSearch(categoryName);
    router.push(`/home/category/${slug}`);
  };

  const handleCategoryPress = (slug: string) => {
    router.push(`/home/category/${slug}`);
  };

  const handleCategoryResultPress = (slug: string) => {
    addRecentSearch(query.trim());
    router.push(`/home/category/${slug}`);
  };

  const handleDishPress = (dish: SearchDish) => {
    addRecentSearch(query.trim());
    if (dish.storeId) {
      navigateToMerchant(router, queryClient, dish.storeId);
    }
  };

  const handleRestaurantPress = (id: string) => {
    addRecentSearch(query.trim());
    navigateToMerchant(router, queryClient, id);
  };

  return (
    <>
      <AndroidBackHandler />
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={0}
      >
      {/* Sticky header */}
      <View style={[styles.header, { paddingTop: HEADER_PADDING_TOP, paddingBottom: HEADER_VERTICAL_PADDING }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} hitSlop={8}>
          <Ionicons name="arrow-back" size={22} color={GatiMitraColors.primaryMint} />
        </TouchableOpacity>
        <View style={styles.searchBar}>
          <TextInput
            ref={inputRef}
            style={styles.searchInput}
            placeholder={PLACEHOLDER}
            placeholderTextColor="#9CA3AF"
            value={query}
            onChangeText={setQuery}
            returnKeyType="search"
            autoCapitalize="none"
            autoCorrect={false}
            autoFocus={false}
          />
          {query.length > 0 && (
            <TouchableOpacity onPress={handleClearInput} style={styles.clearBtn} hitSlop={8}>
              <Ionicons name="close-circle" size={20} color="#9CA3AF" />
            </TouchableOpacity>
          )}
          <VoiceInputButton
            onTranscript={(text) => setQuery((prev) => (voiceMode ? prev + text : text))}
            color={ACCENT_RED}
            size={22}
            autoStart={voiceMode}
          />
        </View>
      </View>

      {showDefaultView ? (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.idleScrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {discoveryChips.length > 0 ? (
            <>
              <AppText style={styles.slogan}>Crave it, find it</AppText>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.moodChips}
                style={styles.moodChipsScroll}
              >
                {discoveryChips.map((chip) => (
                  <TouchableOpacity
                    key={chip.id}
                    style={styles.moodChip}
                    onPress={() => handleDiscoveryChipPress(chip.slug, chip.categoryName)}
                    activeOpacity={0.85}
                  >
                    <Ionicons name="sparkles" size={14} color={CHIP_ICON} />
                    <AppText style={styles.moodChipText}>{chip.label}</AppText>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </>
          ) : null}

          {recentSearches.length > 0 && (
            <View style={styles.recentSection}>
              <View style={styles.recentRow}>
                <AppText style={styles.sectionTitle}>YOUR RECENT SEARCHES</AppText>
                <TouchableOpacity onPress={clearRecentSearches} hitSlop={8}>
                  <AppText style={styles.clearText}>Clear</AppText>
                </TouchableOpacity>
              </View>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.recentChips}
              >
                {recentSearches.map((term, index) => (
                  <View key={`${term}-${index}`} style={styles.recentChip}>
                    <TouchableOpacity
                      style={styles.recentChipMain}
                      onPress={() => handleSelectRecent(term)}
                      activeOpacity={0.8}
                    >
                      <Ionicons
                        name="time-outline"
                        size={15}
                        color="#6B7280"
                        style={styles.recentChipIcon}
                      />
                      <AppText style={styles.recentChipText} numberOfLines={1}>
                        {term}
                      </AppText>
                    </TouchableOpacity>
                    <TouchableOpacity
                      hitSlop={8}
                      onPress={() => handleRemoveRecent(term)}
                      style={styles.recentChipRemove}
                    >
                      <Ionicons name="close" size={14} color="#9CA3AF" />
                    </TouchableOpacity>
                  </View>
                ))}
              </ScrollView>
            </View>
          )}

          <AppText style={[styles.sectionTitle, styles.categoryTitle]}>WHAT'S ON YOUR MIND?</AppText>
          {mindCategoriesPending && mindGridData.length === 0 ? (
            <View style={styles.mindGridLoading}>
              <ActivityIndicator size="small" color={GatiMitraColors.emerald} />
            </View>
          ) : (
            <View style={styles.mindGrid}>
              {mindGridData.map((cat) => (
                <TouchableOpacity
                  key={cat.id}
                  style={styles.gridItem}
                  onPress={() => handleCategoryPress(cat.slug)}
                  activeOpacity={0.85}
                >
                  <View style={styles.gridImageWrap}>
                    <UserAppCategoryImage
                      imageUrl={cat.imageUrl}
                      cacheKey={`category-${cat.id}`}
                      style={styles.gridImage}
                      contentFit="cover"
                    />
                  </View>
                  <AppText style={styles.gridLabel} numberOfLines={2}>
                    {cat.name}
                  </AppText>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </ScrollView>
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {showSkeleton ? (
            <View style={styles.skeletonWrap}>
              <RestaurantListSkeleton count={5} />
            </View>
          ) : results ? (
            <SearchResultsList
              results={results}
              onCategoryPress={handleCategoryResultPress}
              onDishPress={handleDishPress}
              onRestaurantPress={handleRestaurantPress}
              onExplorePopular={() => setQuery("")}
            />
          ) : null}
          <BrandingFooter />
        </ScrollView>
      )}
    </KeyboardAvoidingView>
    </>
  );
}

function SearchResultsList({
  results,
  onCategoryPress,
  onDishPress,
  onRestaurantPress,
  onExplorePopular,
}: {
  results: SearchResults;
  onCategoryPress: (slug: string) => void;
  onDishPress: (dish: SearchDish) => void;
  onRestaurantPress: (id: string) => void;
  onExplorePopular?: () => void;
}) {
  const { category, dishes, restaurants } = results;
  const hasAny = !!(category || dishes.length > 0 || restaurants.length > 0);
  const defaultCategoryImage = useAppAssetSource(CX.search.default);
  const categoryImageUrl = category ? searchCategoryImageUrl(category.slug) : null;
  const categoryImageSource = categoryImageUrl
    ? { uri: categoryImageUrl }
    : defaultCategoryImage;

  if (!hasAny) {
    return (
      <View style={styles.emptyStateOuter}>
        <SearchEmptyState
          variant="no-results"
          onExplorePopular={onExplorePopular}
        />
      </View>
    );
  }

  return (
    <View style={styles.resultsWrap}>
      {/* 1. Category result (if available) – fixed order */}
      {category && (
        <TouchableOpacity
          style={[styles.categoryCard, GatiMitraColors.searchShadow]}
          onPress={() => onCategoryPress(category.slug)}
          activeOpacity={0.85}
        >
          <Image
            source={categoryImageSource ?? undefined}
            style={styles.categoryCardImage}
            resizeMode="cover"
          />
          <View style={styles.categoryCardContent}>
            <AppText style={styles.categoryCardName}>{category.name}</AppText>
            <AppText style={styles.categoryCardCta}>See all restaurants</AppText>
          </View>
          <Ionicons name="chevron-forward" size={20} color={GatiMitraColors.textSecondary} />
        </TouchableOpacity>
      )}

      {/* 2. Dish results – section always present for consistent layout */}
      <AppText style={styles.resultSectionTitle}>Dishes</AppText>
      {dishes.length > 0 ? (
        dishes.map((d) => <DishRow key={d.id} dish={d} onPress={() => onDishPress(d)} />)
      ) : (
        <AppText style={styles.resultSectionEmpty}>No dishes found</AppText>
      )}

      {/* 3. Restaurant results – section always present for consistent layout */}
      <AppText style={styles.resultSectionTitle}>Restaurants</AppText>
      {restaurants.length > 0 ? (
        restaurants.map((r) => (
          <RestaurantRow key={r.id} restaurant={r} onPress={onRestaurantPress} />
        ))
      ) : (
        <AppText style={styles.resultSectionEmpty}>No restaurants found</AppText>
      )}
    </View>
  );
}

const EMPTY_IMAGE_HEIGHT = 268;
const EMPTY_STATE_PAD = 24;
const EMPTY_IMAGE_RADIUS = 22;
const ENTRANCE_DURATION = 360;
const EASE_OUT_CUBIC = Easing.bezier(0.33, 1, 0.68, 1);
const FLOAT_AMPLITUDE = 6;
const FLOAT_DURATION_MS = 2800;

function SearchEmptyState({
  variant = "default",
  onExplorePopular,
}: {
  variant?: "default" | "no-results";
  onExplorePopular?: () => void;
}) {
  const emptyImage = useAppAssetSource(CX.common.emptySearch);
  const imageOpacity = useSharedValue(0);
  const imageTranslateY = useSharedValue(24);
  const titleOpacity = useSharedValue(0);
  const titleTranslateY = useSharedValue(12);
  const subtitleOpacity = useSharedValue(0);
  const subtitleTranslateY = useSharedValue(10);
  const buttonScale = useSharedValue(0.92);
  const buttonOpacity = useSharedValue(0);
  const floatOffset = useSharedValue(0);
  const buttonPressScale = useSharedValue(1);

  React.useEffect(() => {
    imageOpacity.value = withTiming(1, { duration: ENTRANCE_DURATION, easing: EASE_OUT_CUBIC });
    imageTranslateY.value = withTiming(0, { duration: ENTRANCE_DURATION, easing: EASE_OUT_CUBIC });
    titleOpacity.value = withDelay(120, withTiming(1, { duration: 320, easing: EASE_OUT_CUBIC }));
    titleTranslateY.value = withDelay(120, withTiming(0, { duration: 320, easing: EASE_OUT_CUBIC }));
    subtitleOpacity.value = withDelay(200, withTiming(1, { duration: 320, easing: EASE_OUT_CUBIC }));
    subtitleTranslateY.value = withDelay(200, withTiming(0, { duration: 320, easing: EASE_OUT_CUBIC }));
    buttonOpacity.value = withDelay(280, withTiming(1, { duration: 320, easing: EASE_OUT_CUBIC }));
    buttonScale.value = withDelay(280, withSpring(1, { damping: 16, stiffness: 200 }));

    floatOffset.value = withRepeat(
      withSequence(
        withTiming(-FLOAT_AMPLITUDE, { duration: FLOAT_DURATION_MS / 2, easing: Easing.inOut(Easing.ease) }),
        withTiming(0, { duration: FLOAT_DURATION_MS / 2, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      true
    );
  });

  const imageAnimatedStyle = useAnimatedStyle(() => ({
    opacity: imageOpacity.value,
    transform: [
      { translateY: imageTranslateY.value },
      { translateY: floatOffset.value },
    ],
  }));

  const titleWrapAnimatedStyle = useAnimatedStyle(() => ({
    opacity: titleOpacity.value,
    transform: [{ translateY: titleTranslateY.value }],
  }));

  const subtitleWrapAnimatedStyle = useAnimatedStyle(() => ({
    opacity: subtitleOpacity.value,
    transform: [{ translateY: subtitleTranslateY.value }],
  }));

  const buttonAnimatedStyle = useAnimatedStyle(() => ({
    opacity: buttonOpacity.value,
    transform: [{ scale: buttonScale.value * buttonPressScale.value }],
  }));

  const onPressIn = () => {
    buttonPressScale.value = withSpring(0.96, { damping: 18, stiffness: 260 });
  };
  const onPressOut = () => {
    buttonPressScale.value = withSpring(1, { damping: 18, stiffness: 260 });
  };

  const handleExplorePress = () => {
    if (Platform.OS === "android") {
      Vibration.vibrate(15);
    }
    onExplorePopular?.();
  };

  return (
    <View style={styles.emptyStateWrap}>
      {/* Soft radial-style gradient glow behind illustration */}
      <View style={styles.emptyStateGlowWrap} pointerEvents="none">
        <LinearGradient
          colors={["transparent", GatiMitraColors.mintSoft + "35", GatiMitraColors.mintSoft + "18", "transparent"]}
          style={styles.emptyStateGlow}
        />
      </View>

      {/* Very subtle floating food icons (5–8% opacity) */}
      <View style={styles.emptyStateFloatingIcons} pointerEvents="none">
        <Ionicons name="pizza-outline" size={28} color={GatiMitraColors.emerald} style={[styles.floatingIcon, styles.floatingIcon1]} />
        <Ionicons name="ice-cream-outline" size={24} color={GatiMitraColors.emerald} style={[styles.floatingIcon, styles.floatingIcon2]} />
        <Ionicons name="restaurant-outline" size={26} color={GatiMitraColors.emerald} style={[styles.floatingIcon, styles.floatingIcon3]} />
      </View>

      <View style={styles.emptyStateContent}>
        <Animated.View style={[styles.emptyStateImageWrap, imageAnimatedStyle]}>
          {emptyImage ? (
            <Image
              source={emptyImage}
              style={[styles.emptyStateImage, { height: EMPTY_IMAGE_HEIGHT }]}
              resizeMode="contain"
            />
          ) : null}
        </Animated.View>

        <Animated.View style={[titleWrapAnimatedStyle, styles.emptyStateTitleWrap]}>
          <AppText style={styles.emptyStateTitle}>
            {variant === "no-results"
              ? "Nothing matched this search — try another craving!"
              : "Oops! Looks like you took a different turn."}
          </AppText>
        </Animated.View>
        <Animated.View style={[subtitleWrapAnimatedStyle, styles.emptyStateSubtitleWrap]}>
          <AppText style={styles.emptyStateSubtitle}>
            {variant === "no-results"
              ? "Try a different dish, restaurant, or category."
              : "We couldn't find what you're looking for.\nTry searching something else and explore more delicious options."}
          </AppText>
        </Animated.View>

        {onExplorePopular && (
          <Animated.View style={[buttonAnimatedStyle, styles.emptyStateButtonWrapOuter]}>
            <Pressable
              onPress={handleExplorePress}
              onPressIn={onPressIn}
              onPressOut={onPressOut}
              android_ripple={{ color: "rgba(255,255,255,0.25)", borderless: false }}
              style={({ pressed }) => [styles.emptyStateButtonWrap, pressed && styles.emptyStateButtonPressed]}
            >
              <LinearGradient
                colors={[GatiMitraColors.emerald, GatiMitraColors.emeraldLight, GatiMitraColors.warmOrangeLight]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.emptyStateButton}
              >
                <AppText style={styles.emptyStateButtonText}>Explore Popular Items</AppText>
              </LinearGradient>
            </Pressable>
          </Animated.View>
        )}

        {/* Thin soft divider above branding */}
        <View style={styles.emptyStateDivider} />
      </View>
    </View>
  );
}

function DishRow({ dish, onPress }: { dish: SearchDish; onPress: () => void }) {
  const fallback = useAppAssetSource(CX.search.default);
  const url = searchCategoryImageUrl(dish.imageKey);
  const source = url ? { uri: url } : fallback;
  return (
    <TouchableOpacity style={styles.resultRow} onPress={onPress} activeOpacity={0.8}>
      {source ? (
        <Image source={source} style={styles.resultRowImage} resizeMode="cover" />
      ) : (
        <View style={styles.resultRowImage} />
      )}
      <View style={styles.resultRowText}>
        <AppText style={styles.resultRowTitle} numberOfLines={1}>{dish.name}</AppText>
        <AppText style={styles.resultRowLabel}>Dish</AppText>
      </View>
      <Ionicons name="chevron-forward" size={18} color={GatiMitraColors.textSecondary} />
    </TouchableOpacity>
  );
}

function RestaurantRow({
  restaurant,
  onPress,
}: {
  restaurant: MerchantSummary;
  onPress: (id: string) => void;
}) {
  const defaultImg = useAppAssetSource(CX.common.defaultImage);
  const imageUrl = (restaurant as { imageUrl?: string }).imageUrl;
  const source = imageUrl ? { uri: imageUrl } : defaultImg;
  return (
    <TouchableOpacity
      style={styles.resultRow}
      onPress={() => onPress(restaurant.id)}
      activeOpacity={0.8}
    >
        {source ? (
        <Image
        source={source}
        style={styles.resultRowImage}
        resizeMode="cover"
      />
        ) : (
        <View style={styles.resultRowImage} />
        )}
      <View style={styles.resultRowText}>
        <AppText style={styles.resultRowTitle} numberOfLines={1}>{restaurant.name}</AppText>
        {(restaurant.avgRating != null || (restaurant as { rating?: number }).rating != null) && (
          <View style={styles.ratingRow}>
            <Ionicons name="star" size={14} color={GatiMitraColors.emerald} />
            <AppText style={styles.ratingText}>{restaurant.avgRating ?? (restaurant as { rating?: number }).rating}</AppText>
          </View>
        )}
      </View>
      <Ionicons name="chevron-forward" size={18} color={GatiMitraColors.textSecondary} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: GatiMitraColors.background,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: PAD,
    backgroundColor: GatiMitraColors.background,
    borderBottomWidth: 1,
    borderBottomColor: GatiMitraColors.border,
  },
  backBtn: {
    padding: 6,
    marginRight: 4,
  },
  searchBar: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 11,
    borderWidth: 1.5,
    borderColor: "#E5E7EB",
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: GatiMitraColors.textPrimary,
    paddingVertical: 2,
    paddingHorizontal: 4,
  },
  clearBtn: {
    padding: 4,
    marginLeft: 4,
  },
  scroll: {
    flex: 1,
  },
  idleScrollContent: {
    flexGrow: 0,
    paddingBottom: 8,
  },
  slogan: {
    marginTop: 12,
    marginBottom: 12,
    paddingHorizontal: PAD + 2,
    fontSize: 22,
    fontWeight: "700",
    fontStyle: "italic",
    color: SLOGAN_PINK,
    letterSpacing: -0.3,
  },
  moodChipsScroll: {
    marginBottom: 2,
  },
  moodChips: {
    paddingHorizontal: PAD,
    gap: 10,
    paddingBottom: 2,
  },
  moodChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: CHIP_BORDER,
    backgroundColor: "#FFFFFF",
  },
  moodChipText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#374151",
  },
  recentSection: {
    marginTop: 14,
  },
  recentRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: PAD,
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: "700",
    color: "#6B7280",
    letterSpacing: 0.6,
  },
  clearText: {
    fontSize: 14,
    fontWeight: "600",
    color: ACCENT_RED,
  },
  recentChips: {
    paddingHorizontal: PAD,
    gap: 8,
    paddingBottom: 4,
  },
  recentChip: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    paddingVertical: 8,
    paddingLeft: 12,
    paddingRight: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    maxWidth: 180,
  },
  recentChipMain: {
    flexDirection: "row",
    alignItems: "center",
    flexShrink: 1,
    gap: 6,
    minWidth: 0,
  },
  recentChipIcon: {
    marginRight: 0,
  },
  recentChipText: {
    fontSize: 13,
    fontWeight: "600",
    color: GatiMitraColors.textPrimary,
    flexShrink: 1,
  },
  recentChipRemove: {
    padding: 4,
    marginLeft: 2,
  },
  categoryTitle: {
    marginTop: 14,
    marginBottom: 12,
    paddingHorizontal: PAD,
  },
  mindGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: PAD,
    columnGap: GRID_GAP,
    rowGap: 14,
    paddingBottom: 4,
  },
  mindGridLoading: {
    paddingVertical: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  gridItem: {
    width: CARD_WIDTH,
    alignItems: "center",
  },
  gridImageWrap: {
    width: CARD_IMAGE_SIZE,
    height: CARD_IMAGE_SIZE,
    borderRadius: CARD_IMAGE_SIZE / 2,
    backgroundColor: "#FAFAFA",
    overflow: "hidden",
    marginBottom: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(0,0,0,0.04)",
  },
  gridImage: {
    width: "100%",
    height: "100%",
  },
  gridLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: GatiMitraColors.textPrimary,
    textAlign: "center",
    lineHeight: 17,
  },
  loadingWrap: {
    paddingVertical: 48,
    alignItems: "center",
  },
  skeletonWrap: {
    paddingTop: 16,
  },
  loadingText: {
    fontSize: 15,
    color: GatiMitraColors.textSecondary,
    marginTop: 12,
  },
  resultsWrap: {
    paddingHorizontal: PAD,
    paddingTop: 16,
  },
  categoryCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: GatiMitraColors.cardBg,
    borderRadius: 16,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: GatiMitraColors.border,
    marginBottom: 20,
  },
  categoryCardImage: {
    width: 80,
    height: 80,
    backgroundColor: "#F0F0F0",
  },
  categoryCardContent: {
    flex: 1,
    paddingHorizontal: 14,
  },
  categoryCardName: {
    fontSize: 17,
    fontWeight: "700",
    color: GatiMitraColors.textPrimary,
  },
  categoryCardCta: {
    fontSize: 14,
    color: GatiMitraColors.emerald,
    fontWeight: "600",
    marginTop: 4,
  },
  resultSectionTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: GatiMitraColors.textPrimary,
    marginBottom: 12,
    marginTop: 8,
  },
  resultSectionEmpty: {
    fontSize: 14,
    color: GatiMitraColors.textSecondary,
    marginBottom: 16,
  },
  emptyStateOuter: {
    flex: 1,
  },
  emptyStateWrap: {
    flex: 1,
    minHeight: height * 0.72,
    backgroundColor: GatiMitraColors.background,
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 48,
    paddingHorizontal: 24,
    overflow: "visible",
  },
  emptyStateGlowWrap: {
    position: "absolute",
    top: "50%",
    left: "50%",
    marginLeft: -width * 0.65,
    marginTop: -height * 0.38,
    width: width * 1.3,
    height: height * 0.55,
  },
  emptyStateGlow: {
    flex: 1,
    opacity: 0.7,
    borderRadius: width,
  },
  emptyStateFloatingIcons: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    opacity: 0.065,
  },
  floatingIcon: { position: "absolute" },
  floatingIcon1: { top: "20%", left: "6%" },
  floatingIcon2: { top: "26%", right: "8%" },
  floatingIcon3: { bottom: "36%", left: "10%" },
  emptyStateContent: {
    width: "100%",
    maxWidth: 340,
    alignItems: "center",
    zIndex: 1,
  },
  emptyStateImageWrap: {
    width: "100%",
    alignSelf: "stretch",
    borderRadius: EMPTY_IMAGE_RADIUS,
    overflow: "hidden",
    marginBottom: 32,
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.06,
        shadowRadius: 20,
      },
      android: { elevation: 6 },
      default: {},
    }),
  },
  emptyStateImage: {
    width: "100%",
    backgroundColor: GatiMitraColors.cardBg,
  },
  emptyStateTitleWrap: {
    marginBottom: 12,
  },
  emptyStateTitle: {
    fontSize: 23,
    fontWeight: "600",
    color: "#1F2937",
    textAlign: "center",
    paddingHorizontal: 12,
    lineHeight: 32,
    letterSpacing: 0.2,
  },
  emptyStateSubtitleWrap: {
    marginBottom: 32,
  },
  emptyStateSubtitle: {
    fontSize: 15,
    color: "#6B7280",
    textAlign: "center",
    lineHeight: 26,
    maxWidth: 300,
    paddingHorizontal: 16,
  },
  emptyStateButtonWrapOuter: {
    width: "100%",
    alignItems: "center",
    marginBottom: 4,
  },
  emptyStateButtonWrap: {
    borderRadius: 28,
    overflow: "hidden",
    minWidth: "100%",
    maxWidth: 320,
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.12,
        shadowRadius: 12,
      },
      android: { elevation: 4 },
      default: {},
    }),
  },
  emptyStateButtonPressed: {
    opacity: 0.97,
  },
  emptyStateButton: {
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyStateButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: GatiMitraColors.textOnGradient,
  },
  emptyStateDivider: {
    width: "72%",
    height: 1,
    backgroundColor: "rgba(0, 0, 0, 0.06)",
    marginTop: 36,
    marginBottom: 12,
  },
  resultRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: GatiMitraColors.cardBg,
    borderRadius: 14,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: GatiMitraColors.border,
    ...GatiMitraColors.searchShadow,
  },
  resultRowImage: {
    width: 56,
    height: 56,
    borderRadius: 12,
    backgroundColor: "#F0F0F0",
  },
  resultRowText: {
    flex: 1,
    marginLeft: 14,
  },
  resultRowTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: GatiMitraColors.textPrimary,
  },
  resultRowLabel: {
    fontSize: 13,
    color: GatiMitraColors.textSecondary,
    marginTop: 2,
  },
  ratingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 4,
  },
  ratingText: {
    fontSize: 13,
    fontWeight: "600",
    color: GatiMitraColors.textPrimary,
  },
});
