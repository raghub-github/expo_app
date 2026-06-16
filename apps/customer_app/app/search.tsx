/**
 * Full-screen Food Search – opens when user taps search in Food Delivery.
 * Sticky header, recent searches (horizontal), category grid or search results.
 * Slide-from-right transition, keyboard auto-focus, debounced search, voice support.
 */

import React, { useRef, useEffect, useMemo } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Pressable,
  StyleSheet,
  ScrollView,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Dimensions,
  Vibration,
} from "react-native";
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
import { useQuery } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { GatiMitraColors } from "@/constants/gatimitra";
import {
  fetchUserAppCategories,
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
  prefetchUserAppCategoryImages,
  USER_APP_CATEGORIES_QUERY_OPTIONS,
  userAppCategoriesQueryKey,
} from "@/lib/userAppCategoryCache";
import {
  SEARCH_CATEGORY_IMAGES,
  MOCK_DISHES,
  type SearchDish,
} from "@/constants/search";
import type { MerchantSummary } from "@/services/merchant.service";

const { width, height } = Dimensions.get("window");
const PAD = 16;
const GRID_COLS = 4;
const GRID_GAP = 8;
const CARD_WIDTH = (width - PAD * 2 - GRID_GAP * (GRID_COLS - 1)) / GRID_COLS;
const CARD_IMAGE_HEIGHT = CARD_WIDTH * 0.72;
const SEARCH_CATEGORY_STORE_TYPE = "FOOD";

const PLACEHOLDER = "Restaurant name or a dish...";
const ACCENT_RED = "#dc2626";

const EMPTY_IMAGE = require("../public/img/wrong.png");

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
  const { results, isLoading } = useDebouncedSearch(
    query,
    coords?.latitude,
    coords?.longitude
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

  const { data: apiMindCategories = [], isPending: mindCategoriesPending } = useQuery({
    queryKey: userAppCategoriesQueryKey(SEARCH_CATEGORY_STORE_TYPE),
    queryFn: () => fetchUserAppCategories({ storeType: SEARCH_CATEGORY_STORE_TYPE }),
    ...USER_APP_CATEGORIES_QUERY_OPTIONS,
    placeholderData: (previousData) => previousData,
  });

  React.useEffect(() => {
    if (apiMindCategories.length > 0) {
      prefetchUserAppCategoryImages(apiMindCategories);
    }
  }, [apiMindCategories]);

  const mindGridData = useMemo((): MindGridRow[] => {
    const deduped = dedupeUserAppCategories(apiMindCategories ?? []);
    return deduped.map((r) => ({
      id: String(r.id),
      name: r.name,
      slug: String(r.id),
      imageUrl: r.imageUrl,
    }));
  }, [apiMindCategories]);

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
      router.push({ pathname: "/home/merchant/[id]", params: { id: dish.storeId } });
    }
  };

  const handleRestaurantPress = (id: string) => {
    addRecentSearch(query.trim());
    router.push({ pathname: "/home/merchant/[id]", params: { id } });
  };

  return (
    <>
      <AndroidBackHandler />
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={0}
      >
      {/* Sticky header – same top spacing as Home (root layout provides status bar strip) */}
      <View style={[styles.header, { paddingTop: HEADER_PADDING_TOP, paddingBottom: HEADER_VERTICAL_PADDING }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} hitSlop={8}>
          <Ionicons name="arrow-back" size={24} color={GatiMitraColors.textPrimary} />
        </TouchableOpacity>
        <View style={[styles.searchBar, GatiMitraColors.searchShadow]}>
          <TextInput
            ref={inputRef}
            style={styles.searchInput}
            placeholder={PLACEHOLDER}
            placeholderTextColor={GatiMitraColors.textSecondary}
            value={query}
            onChangeText={setQuery}
            returnKeyType="search"
            autoCapitalize="none"
            autoCorrect={false}
            autoFocus={false}
          />
          {query.length > 0 && (
            <TouchableOpacity onPress={handleClearInput} style={styles.clearBtn} hitSlop={8}>
              <Ionicons name="close-circle" size={22} color={GatiMitraColors.textSecondary} />
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
          contentContainerStyle={{ paddingBottom: insets.bottom + 80 }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Recent searches */}
          {recentSearches.length > 0 && (
            <View style={styles.recentSection}>
              <View style={styles.recentRow}>
                <Text style={styles.sectionTitle}>YOUR RECENT SEARCHES</Text>
                <TouchableOpacity onPress={clearRecentSearches} hitSlop={8}>
                  <Text style={styles.clearText}>Clear</Text>
                </TouchableOpacity>
              </View>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={recentSearches.length > 4}
                contentContainerStyle={styles.recentChips}
              >
                {recentSearches.map((term, index) => (
                  <View key={`${term}-${index}`} style={styles.recentChip}>
                    <TouchableOpacity
                      style={styles.recentChipMain}
                      onPress={() => handleSelectRecent(term)}
                      activeOpacity={0.8}
                    >
                      <Ionicons name="time-outline" size={16} color={GatiMitraColors.textSecondary} style={styles.recentChipIcon} />
                      <Text style={styles.recentChipText}>{term}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      hitSlop={8}
                      onPress={() => handleRemoveRecent(term)}
                      style={styles.recentChipRemove}
                    >
                      <Ionicons name="close-circle" size={18} color={GatiMitraColors.textSecondary} />
                    </TouchableOpacity>
                  </View>
                ))}
              </ScrollView>
            </View>
          )}

          {/* Category grid – same user_app_category API as home / category browse */}
          <Text style={[styles.sectionTitle, styles.categoryTitle]}>WHAT'S ON YOUR MIND?</Text>
          {mindCategoriesPending ? (
            <View style={styles.mindGridLoading}>
              <ActivityIndicator size="small" color={GatiMitraColors.emerald} />
            </View>
          ) : (
          <FlatList
            data={mindGridData}
            keyExtractor={(item) => item.id}
            numColumns={GRID_COLS}
            scrollEnabled={false}
            columnWrapperStyle={styles.gridRow}
            contentContainerStyle={styles.gridListContent}
            renderItem={({ item: cat }) => (
              <TouchableOpacity
                style={styles.gridItem}
                onPress={() => handleCategoryPress(cat.slug)}
                activeOpacity={0.85}
              >
                <View style={styles.gridImageWrap}>
                  <UserAppCategoryImage
                    imageUrl={cat.imageUrl}
                    cacheKey={`category-${cat.id}`}
                    style={styles.gridImage}
                  />
                </View>
                <Text style={styles.gridLabel} numberOfLines={2}>
                  {cat.name}
                </Text>
              </TouchableOpacity>
            )}
          />
          )}
          <BrandingFooter />
        </ScrollView>
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={{ flexGrow: 1, paddingBottom: insets.bottom + 80 }}
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
            source={SEARCH_CATEGORY_IMAGES[category.slug] ?? SEARCH_CATEGORY_IMAGES.default}
            style={styles.categoryCardImage}
            resizeMode="cover"
          />
          <View style={styles.categoryCardContent}>
            <Text style={styles.categoryCardName}>{category.name}</Text>
            <Text style={styles.categoryCardCta}>See all restaurants</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={GatiMitraColors.textSecondary} />
        </TouchableOpacity>
      )}

      {/* 2. Dish results – section always present for consistent layout */}
      <Text style={styles.resultSectionTitle}>Dishes</Text>
      {dishes.length > 0 ? (
        dishes.map((d) => <DishRow key={d.id} dish={d} onPress={() => onDishPress(d)} />)
      ) : (
        <Text style={styles.resultSectionEmpty}>No dishes found</Text>
      )}

      {/* 3. Restaurant results – section always present for consistent layout */}
      <Text style={styles.resultSectionTitle}>Restaurants</Text>
      {restaurants.length > 0 ? (
        restaurants.map((r) => (
          <RestaurantRow key={r.id} restaurant={r} onPress={onRestaurantPress} />
        ))
      ) : (
        <Text style={styles.resultSectionEmpty}>No restaurants found</Text>
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
          <Image
            source={EMPTY_IMAGE}
            style={[styles.emptyStateImage, { height: EMPTY_IMAGE_HEIGHT }]}
            resizeMode="contain"
          />
        </Animated.View>

        <Animated.View style={[titleWrapAnimatedStyle, styles.emptyStateTitleWrap]}>
          <Text style={styles.emptyStateTitle}>
            {variant === "no-results"
              ? "Nothing matched this search — try another craving!"
              : "Oops! Looks like you took a different turn."}
          </Text>
        </Animated.View>
        <Animated.View style={[subtitleWrapAnimatedStyle, styles.emptyStateSubtitleWrap]}>
          <Text style={styles.emptyStateSubtitle}>
            {variant === "no-results"
              ? "Try a different dish, restaurant, or category."
              : "We couldn't find what you're looking for.\nTry searching something else and explore more delicious options."}
          </Text>
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
                <Text style={styles.emptyStateButtonText}>Explore Popular Items</Text>
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
  const img = SEARCH_CATEGORY_IMAGES[dish.imageKey] ?? SEARCH_CATEGORY_IMAGES.default;
  return (
    <TouchableOpacity style={styles.resultRow} onPress={onPress} activeOpacity={0.8}>
      <Image source={img} style={styles.resultRowImage} resizeMode="cover" />
      <View style={styles.resultRowText}>
        <Text style={styles.resultRowTitle} numberOfLines={1}>{dish.name}</Text>
        <Text style={styles.resultRowLabel}>Dish</Text>
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
  const defaultImg = require("../public/img/ndf.png");
  return (
    <TouchableOpacity
      style={styles.resultRow}
      onPress={() => onPress(restaurant.id)}
      activeOpacity={0.8}
    >
        <Image
        source={((restaurant as { imageUrl?: string }).imageUrl) ? { uri: (restaurant as { imageUrl?: string }).imageUrl } : defaultImg}
        style={styles.resultRowImage}
        resizeMode="cover"
      />
      <View style={styles.resultRowText}>
        <Text style={styles.resultRowTitle} numberOfLines={1}>{restaurant.name}</Text>
        {(restaurant.avgRating != null || (restaurant as { rating?: number }).rating != null) && (
          <View style={styles.ratingRow}>
            <Ionicons name="star" size={14} color={GatiMitraColors.emerald} />
            <Text style={styles.ratingText}>{restaurant.avgRating ?? (restaurant as { rating?: number }).rating}</Text>
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
    marginRight: 6,
  },
  searchBar: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: GatiMitraColors.cardBg,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: GatiMitraColors.border,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
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
  recentSection: {
    marginTop: 10,
  },
  recentRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: PAD,
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: GatiMitraColors.textSecondary,
    letterSpacing: 0.3,
  },
  clearText: {
    fontSize: 14,
    fontWeight: "600",
    color: ACCENT_RED,
  },
  recentChips: {
    paddingHorizontal: PAD,
    gap: 8,
    paddingBottom: 8,
  },
  recentChip: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F5F5F5",
    paddingVertical: 8,
    paddingLeft: 12,
    paddingRight: 4,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: GatiMitraColors.border,
  },
  recentChipMain: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    gap: 6,
    minWidth: 0,
  },
  recentChipIcon: {
    marginRight: 2,
  },
  recentChipText: {
    fontSize: 14,
    color: GatiMitraColors.textPrimary,
    flexShrink: 0,
  },
  recentChipRemove: {
    padding: 4,
    marginLeft: 2,
  },
  categoryTitle: {
    marginTop: 8,
    marginBottom: 14,
    paddingHorizontal: PAD,
  },
  gridListContent: {
    paddingHorizontal: PAD,
    paddingBottom: 24,
  },
  gridRow: {
    gap: GRID_GAP,
    marginBottom: GRID_GAP,
  },
  mindGridLoading: {
    paddingVertical: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  gridItem: {
    width: CARD_WIDTH,
    alignItems: "center",
    marginBottom: 2,
  },
  gridImageWrap: {
    width: CARD_WIDTH,
    height: CARD_IMAGE_HEIGHT,
    borderRadius: 12,
    backgroundColor: "transparent",
    overflow: "hidden",
    marginBottom: 6,
  },
  gridImage: {
    width: "100%",
    height: "100%",
  },
  gridLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: GatiMitraColors.textPrimary,
    textAlign: "center",
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
