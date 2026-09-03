/**
 * Full-screen Food Search – opens when user taps search in Food Delivery.
 * Sticky header, recent searches (horizontal), category grid or search results.
 * Slide-from-right transition, keyboard auto-focus, debounced search, voice support.
 */

import React, { useRef, useEffect, useMemo, useCallback, memo } from "react";
import { AppText } from "@/components/AppText";

import { View, TextInput, TouchableOpacity, Pressable, StyleSheet, ScrollView, KeyboardAvoidingView, Platform, ActivityIndicator, Dimensions, Vibration } from "react-native";
import { Image } from "expo-image";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
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
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { VoiceInputButton } from "@/components/VoiceInputButton";
import { AndroidBackHandler } from "@/components/AndroidBackHandler";
import { BrandingFooter } from "@/components/BrandingFooter";
import { RestaurantListSkeleton } from "@/components/ShimmerSkeleton";
import { UserAppCategoryImage } from "@/components/category/UserAppCategoryImage";
import {
  fetchUserAppCategoriesWithCache,
  getUserAppCategoriesCachedAt,
  prefetchUserAppCategoryImagesAwait,
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
import { merchantService, type MerchantSummary } from "@/services/merchant.service";
import { useDietaryPreferenceStore } from "@/store/dietaryPreferenceStore";

const { width, height } = Dimensions.get("window");
const PAD = 16;
/** Circular mind grid — 3 columns like polished discovery UIs. */
const GRID_COLS = 3;
const GRID_GAP = 14;
const CARD_WIDTH = (width - PAD * 2 - GRID_GAP * (GRID_COLS - 1)) / GRID_COLS;
const CARD_IMAGE_SIZE = CARD_WIDTH;
const PLACEHOLDER = "Restaurant name or a dish...";
const GROCERY_PLACEHOLDER = "Grocery store or item...";
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
  const params = useLocalSearchParams<{
    voice?: string;
    q?: string | string[];
    storeType?: string | string[];
  }>();
  const insets = useSafeAreaInsets();
  const voiceMode = params.voice === "1";
  const searchStoreType = useMemo(() => {
    const raw = Array.isArray(params.storeType) ? params.storeType[0] : params.storeType;
    const st = String(raw ?? "FOOD").trim().toUpperCase();
    return st === "GROCERY" ? "GROCERY" : "FOOD";
  }, [params.storeType]);

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
  const { results, isLoading, isError, errorMessage, refetch } = useDebouncedSearch(
    query,
    coords?.latitude,
    coords?.longitude,
    vegOnly,
    searchStoreType
  );

  const debouncedSuggestQ = useDebouncedValue(query.trim(), 150);
  const { data: suggestData } = useQuery({
    queryKey: [
      "food-search-suggest",
      debouncedSuggestQ,
      coords?.latitude,
      coords?.longitude,
      searchStoreType,
    ],
    queryFn: ({ signal }) =>
      merchantService.searchSuggest({
        q: debouncedSuggestQ,
        limit: 8,
        lat: coords?.latitude,
        lng: coords?.longitude,
        storeType: searchStoreType,
        signal,
      }),
    enabled: debouncedSuggestQ.length >= 2,
    staleTime: 8_000,
  });
  const suggestions = suggestData?.suggestions ?? [];
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
    queryKey: userAppCategoriesQueryKey(searchStoreType),
    queryFn: () => fetchUserAppCategoriesWithCache(searchStoreType),
    ...USER_APP_CATEGORIES_QUERY_OPTIONS,
    initialData: () => readSyncUserAppCategories(searchStoreType),
    initialDataUpdatedAt: () => getUserAppCategoriesCachedAt(searchStoreType),
    placeholderData: (previousData) => previousData,
  });

  const apiMindCategories = mindCategoriesResponse?.items ?? [];

  React.useEffect(() => {
    if (apiMindCategories.length > 0 || mindCategoriesResponse?.allTab?.imageUrl) {
      void prefetchUserAppCategoryImagesAwait(apiMindCategories, mindCategoriesResponse?.allTab?.imageUrl);
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
    router.push({
      pathname: `/home/category/${slug}`,
      params: { storeType: searchStoreType },
    });
  };

  const handleCategoryPress = (slug: string) => {
    router.push({
      pathname: `/home/category/${slug}`,
      params: { storeType: searchStoreType },
    });
  };

  // `query` changes on every keystroke; reading it via a ref (instead of as a
  // dependency) keeps these callbacks referentially stable across typing, so
  // React.memo on DishRow/RestaurantRow below actually prevents re-renders
  // while the user types in the search box.
  const queryRef = useRef(query);
  queryRef.current = query;

  const handleCategoryResultPress = useCallback(
    (slug: string) => {
      addRecentSearch(queryRef.current.trim());
      router.push({
        pathname: `/home/category/${slug}`,
        params: { storeType: searchStoreType },
      });
    },
    [router, addRecentSearch, searchStoreType]
  );

  const handleDishPress = useCallback(
    (dish: SearchDish) => {
      addRecentSearch(queryRef.current.trim());
      if (dish.storeId) {
        navigateToMerchant(router, queryClient, dish.storeId);
      }
    },
    [router, queryClient, addRecentSearch]
  );

  const handleRestaurantPress = useCallback(
    (id: string) => {
      addRecentSearch(queryRef.current.trim());
      navigateToMerchant(router, queryClient, id);
    },
    [router, queryClient, addRecentSearch]
  );

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
            placeholder={searchStoreType === "GROCERY" ? GROCERY_PLACEHOLDER : PLACEHOLDER}
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
          ) : isError ? (
            <View style={styles.emptyStateOuter}>
              <AppText style={styles.resultSectionTitle}>Couldn’t search</AppText>
              <AppText style={styles.resultSectionEmpty}>
                {errorMessage ?? "Something went wrong. Please try again."}
              </AppText>
              <TouchableOpacity
                style={styles.retryBtn}
                onPress={() => void refetch()}
                activeOpacity={0.85}
              >
                <AppText style={styles.retryBtnText}>Retry</AppText>
              </TouchableOpacity>
            </View>
          ) : results ? (
            <SearchResultsList
              results={results}
              storeType={searchStoreType}
              suggestions={suggestions}
              onSuggestionPress={(text) => {
                setQuery(text);
                addRecentSearch(text);
              }}
              onDidYouMeanPress={(text) => {
                setQuery(text);
                addRecentSearch(text);
              }}
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
  storeType = "FOOD",
  suggestions = [],
  onSuggestionPress,
  onDidYouMeanPress,
  onCategoryPress,
  onDishPress,
  onRestaurantPress,
  onExplorePopular,
}: {
  results: SearchResults;
  storeType?: string;
  suggestions?: Array<{ type: string; text: string; storeId?: string; itemId?: string }>;
  onSuggestionPress?: (text: string) => void;
  onDidYouMeanPress?: (text: string) => void;
  onCategoryPress: (slug: string) => void;
  onDishPress: (dish: SearchDish) => void;
  onRestaurantPress: (id: string) => void;
  onExplorePopular?: () => void;
}) {
  const { category, dishes, restaurants } = results;
  const hasAny = !!(category || dishes.length > 0 || restaurants.length > 0);
  const isGrocery = storeType === "GROCERY";
  const itemsLabel = isGrocery ? "Items" : "Dishes";
  const storesLabel = isGrocery ? "Stores" : "Restaurants";
  const defaultCategoryImage = useAppAssetSource(CX.search.default);
  const categoryImageUrl = category ? searchCategoryImageUrl(category.slug) : null;
  const categoryImageSource = categoryImageUrl
    ? { uri: categoryImageUrl }
    : defaultCategoryImage;

  const typoBanner =
    results.searchInsteadOriginal && results.correctedQuery ? (
      <View style={styles.typoBanner}>
        <AppText style={styles.typoBannerText}>
          Showing results for{" "}
          <AppText style={styles.typoBannerEmph}>{results.correctedQuery}</AppText>
        </AppText>
        <TouchableOpacity
          onPress={() => onDidYouMeanPress?.(results.searchInsteadOriginal!)}
          hitSlop={8}
        >
          <AppText style={styles.typoBannerLink}>
            Search instead for {results.searchInsteadOriginal}
          </AppText>
        </TouchableOpacity>
      </View>
    ) : results.didYouMean ? (
      <View style={styles.typoBanner}>
        <TouchableOpacity onPress={() => onDidYouMeanPress?.(results.didYouMean!)} hitSlop={8}>
          <AppText style={styles.typoBannerText}>
            Did you mean{" "}
            <AppText style={styles.typoBannerEmph}>{results.didYouMean}</AppText>?
          </AppText>
        </TouchableOpacity>
      </View>
    ) : null;

  if (!hasAny) {
    return (
      <View style={styles.emptyStateOuter}>
        {typoBanner}
        {suggestions.length > 0 ? (
          <View style={styles.suggestWrap}>
            {suggestions.map((s) => (
              <TouchableOpacity
                key={`${s.type}:${s.text}`}
                style={styles.suggestRow}
                onPress={() => onSuggestionPress?.(s.text)}
                activeOpacity={0.85}
              >
                <Ionicons name="search-outline" size={16} color={GatiMitraColors.textSecondary} />
                <AppText style={styles.suggestText}>{s.text}</AppText>
              </TouchableOpacity>
            ))}
          </View>
        ) : null}
        <SearchEmptyState
          variant="no-results"
          onExplorePopular={onExplorePopular}
        />
      </View>
    );
  }

  const dishSection =
    dishes.length > 0 ? (
      <>
        <AppText style={styles.resultSectionTitle}>{itemsLabel}</AppText>
        {dishes.slice(0, 12).map((d) => (
          <DishRow key={d.id} dish={d} onPress={onDishPress} />
        ))}
      </>
    ) : null;

  const storeSection =
    restaurants.length > 0 ? (
      <>
        <AppText style={styles.resultSectionTitle}>
          {isGrocery ? "Stores based on your search" : "Restaurants based on your search"}
        </AppText>
        {restaurants.map((r) => (
          <SearchRestaurantCard key={r.id} restaurant={r} onPress={onRestaurantPress} />
        ))}
      </>
    ) : null;

  return (
    <View style={styles.resultsWrap}>
      {typoBanner}
      {category && (
        <TouchableOpacity
          style={[styles.categoryCard, GatiMitraColors.searchShadow]}
          onPress={() => onCategoryPress(category.slug)}
          activeOpacity={0.85}
        >
          <Image
            source={categoryImageSource ?? undefined}
            style={styles.categoryCardImage}
            contentFit="cover"
            cachePolicy="memory-disk"
          />
          <View style={styles.categoryCardContent}>
            <AppText style={styles.categoryCardName}>{category.name}</AppText>
            <AppText style={styles.categoryCardCta}>
              See all {storesLabel.toLowerCase()}
            </AppText>
          </View>
          <Ionicons name="chevron-forward" size={20} color={GatiMitraColors.textSecondary} />
        </TouchableOpacity>
      )}
      {restaurants.length > 0 ? (
        <>
          {storeSection}
          {dishSection}
        </>
      ) : (
        <>
          {dishSection}
          {storeSection}
        </>
      )}
    </View>
  );
}

const EASE_OUT_CUBIC = Easing.bezier(0.33, 1, 0.68, 1);

function SearchEmptyState({
  variant = "default",
  onExplorePopular,
}: {
  variant?: "default" | "no-results";
  onExplorePopular?: () => void;
}) {
  const titleOpacity = useSharedValue(0);
  const titleTranslateY = useSharedValue(12);
  const subtitleOpacity = useSharedValue(0);
  const subtitleTranslateY = useSharedValue(10);
  const buttonScale = useSharedValue(0.92);
  const buttonOpacity = useSharedValue(0);
  const buttonPressScale = useSharedValue(1);

  React.useEffect(() => {
    titleOpacity.value = withDelay(40, withTiming(1, { duration: 320, easing: EASE_OUT_CUBIC }));
    titleTranslateY.value = withDelay(40, withTiming(0, { duration: 320, easing: EASE_OUT_CUBIC }));
    subtitleOpacity.value = withDelay(120, withTiming(1, { duration: 320, easing: EASE_OUT_CUBIC }));
    subtitleTranslateY.value = withDelay(120, withTiming(0, { duration: 320, easing: EASE_OUT_CUBIC }));
    buttonOpacity.value = withDelay(200, withTiming(1, { duration: 320, easing: EASE_OUT_CUBIC }));
    buttonScale.value = withDelay(200, withSpring(1, { damping: 16, stiffness: 200 }));
  });

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
      <View style={styles.emptyStateContent}>
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

        <View style={styles.emptyStateDivider} />
      </View>
    </View>
  );
}

const DishRow = memo(function DishRow({
  dish,
  onPress,
}: {
  dish: SearchDish;
  onPress: (dish: SearchDish) => void;
}) {
  const fallback = useAppAssetSource(CX.search.default);
  const url = searchCategoryImageUrl(dish.imageKey);
  const source = url ? { uri: url } : fallback;
  return (
    <TouchableOpacity style={styles.resultRow} onPress={() => onPress(dish)} activeOpacity={0.8}>
      {source ? (
        <Image source={source} style={styles.resultRowImage} contentFit="cover" cachePolicy="memory-disk" />
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
});

const RestaurantRow = memo(function RestaurantRow({
  restaurant,
  onPress,
}: {
  restaurant: MerchantSummary;
  onPress: (id: string) => void;
}) {
  return <SearchRestaurantCard restaurant={restaurant} onPress={onPress} />;
});

const SearchRestaurantCard = memo(function SearchRestaurantCard({
  restaurant,
  onPress,
}: {
  restaurant: MerchantSummary;
  onPress: (id: string) => void;
}) {
  const defaultImg = useAppAssetSource(CX.common.defaultImage);
  const imageUrl =
    restaurant.displayImage ||
    restaurant.banner_url ||
    (restaurant as { imageUrl?: string }).imageUrl;
  const source = imageUrl ? { uri: imageUrl } : defaultImg;
  const cuisine = restaurant.cuisines?.filter(Boolean).slice(0, 2).join(" • ");
  const dist =
    restaurant.distanceKm != null && Number.isFinite(restaurant.distanceKm)
      ? `${restaurant.distanceKm < 10 ? restaurant.distanceKm.toFixed(1) : Math.round(restaurant.distanceKm)} km`
      : null;
  const rating =
    restaurant.avgRating != null && Number(restaurant.avgRating) > 0
      ? Number(restaurant.avgRating).toFixed(1)
      : null;

  return (
    <TouchableOpacity
      style={styles.searchStoreCard}
      onPress={() => onPress(restaurant.id)}
      activeOpacity={0.88}
    >
      {source ? (
        <Image
          source={source}
          style={styles.searchStoreImage}
          contentFit="cover"
          cachePolicy="memory-disk"
        />
      ) : (
        <View style={styles.searchStoreImage} />
      )}
      <View style={styles.searchStoreBody}>
        <AppText style={styles.searchStoreName} numberOfLines={1}>
          {restaurant.name}
        </AppText>
        {cuisine ? (
          <AppText style={styles.searchStoreMeta} numberOfLines={1}>
            {cuisine}
          </AppText>
        ) : null}
        <View style={styles.searchStoreMetaRow}>
          {rating ? (
            <View style={styles.searchStoreRating}>
              <Ionicons name="star" size={11} color="#fff" />
              <AppText style={styles.searchStoreRatingText}>{rating}</AppText>
            </View>
          ) : null}
          {dist ? (
            <AppText style={styles.searchStoreMeta}>{dist}</AppText>
          ) : null}
        </View>
      </View>
      <Ionicons name="chevron-forward" size={18} color={GatiMitraColors.textSecondary} />
    </TouchableOpacity>
  );
});

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
  typoBanner: {
    marginBottom: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    gap: 4,
  },
  typoBannerText: {
    fontSize: 14,
    color: "#475569",
  },
  typoBannerEmph: {
    fontWeight: "700",
    color: GatiMitraColors.textPrimary,
  },
  typoBannerLink: {
    fontSize: 13,
    fontWeight: "600",
    color: ACCENT_RED,
    marginTop: 2,
  },
  suggestWrap: {
    marginBottom: 14,
    gap: 2,
  },
  suggestRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#E5E7EB",
  },
  suggestText: {
    fontSize: 15,
    color: GatiMitraColors.textPrimary,
    flex: 1,
  },
  retryBtn: {
    marginTop: 16,
    alignSelf: "center",
    backgroundColor: ACCENT_RED,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 999,
  },
  retryBtnText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 14,
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
    minHeight: height * 0.55,
    backgroundColor: GatiMitraColors.background,
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 48,
    paddingHorizontal: 24,
  },
  emptyStateContent: {
    width: "100%",
    maxWidth: 340,
    alignItems: "center",
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
  searchStoreCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: GatiMitraColors.cardBg,
    borderRadius: 16,
    padding: 10,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: GatiMitraColors.border,
    ...GatiMitraColors.searchShadow,
  },
  searchStoreImage: {
    width: 88,
    height: 88,
    borderRadius: 12,
    backgroundColor: "#F0F0F0",
  },
  searchStoreBody: {
    flex: 1,
    marginLeft: 12,
    marginRight: 6,
    gap: 4,
  },
  searchStoreName: {
    fontSize: 16,
    fontWeight: "700",
    color: GatiMitraColors.textPrimary,
  },
  searchStoreMeta: {
    fontSize: 13,
    color: GatiMitraColors.textSecondary,
  },
  searchStoreMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 2,
  },
  searchStoreRating: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: "#16A34A",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  searchStoreRatingText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#fff",
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
