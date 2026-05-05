import { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { LinearGradient } from "expo-linear-gradient";
import { usePathname, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSelectedStore } from "@/context/SelectedStoreContext";
import { useAuth } from "@/context/AuthContext";
import { GatiMitraMerchant, H_PADDING } from "@/constants/theme";
import {
  fetchStoreReviews,
  replyToStoreReview,
  deleteStoreReviewReply,
} from "@/services/ratingsApi";
import { ReviewsComplaintsSkeleton } from "@/components/ReviewsComplaintsSkeleton";

type StoreReview = {
  id: number;
  overallRating: number;
  reviewTitle: string | null;
  reviewText: string | null;
  createdAt: string;
  replyText?: string | null;
  repliedAt?: string | null;
};

type FilterKey = "all" | "5plus" | "4plus" | "3plus" | "2plus" | "1plus";

export default function ReviewsScreen() {
  const { selectedStore } = useSelectedStore();
  const { token } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<StoreReview[]>([]);
  const [filter, setFilter] = useState<FilterKey>("all");
  const [minRating, setMinRating] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [fromDate, setFromDate] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() - 21);
    return d.toISOString();
  });
  const [toDate, setToDate] = useState<string>(() => new Date().toISOString());
  const [isFilterSheetOpen, setIsFilterSheetOpen] = useState(false);
  const [tempRangeKey, setTempRangeKey] = useState<"7" | "21" | "30" | "all">("21");
  const [tempMinRating, setTempMinRating] = useState<number | null>(null);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [confirmMode, setConfirmMode] = useState<null | "edit" | "delete">(null);
  const [confirmTarget, setConfirmTarget] = useState<StoreReview | null>(null);
  const [activeReplyId, setActiveReplyId] = useState<number | null>(null);
  const [activeReplyReview, setActiveReplyReview] = useState<StoreReview | null>(null);
  const [replyText, setReplyText] = useState("");
  const [isSavingReply, setIsSavingReply] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    const load = async () => {
      if (!selectedStore?.id || !token) {
        setItems([]);
        setLoading(false);
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const data = await fetchStoreReviews({
          token,
          storeId: selectedStore.id,
          from: fromDate,
          to: toDate,
        });
        setItems(data.data ?? []);
        setHasLoadedOnce(true);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not load reviews.");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    };
    void load();
  }, [selectedStore?.id, token, fromDate, toDate, refreshNonce]);

  const handleOpenReply = (review: StoreReview) => {
    // If there's already a reply, ask for confirmation before editing.
    if (review.replyText) {
      setConfirmMode("edit");
      setConfirmTarget(review);
      return;
    }
    // Fresh reply – open composer directly with no warning modal.
    setActiveReplyId(review.id);
    setActiveReplyReview(review);
    setReplyText("");
  };

  const handleSaveReply = async () => {
    if (!selectedStore?.id || !token || activeReplyId == null || !replyText.trim()) {
      return;
    }
    try {
      setIsSavingReply(true);
      await replyToStoreReview({
        token,
        storeId: selectedStore.id,
        reviewId: activeReplyId,
        replyText: replyText.trim(),
      });
      setItems((prev) =>
        prev.map((r) =>
          r.id === activeReplyId
            ? {
                ...r,
                replyText: replyText.trim(),
                repliedAt: new Date().toISOString(),
              }
            : r
        )
      );
      setActiveReplyId(null);
      setActiveReplyReview(null);
      setReplyText("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save reply.");
    } finally {
      setIsSavingReply(false);
    }
  };

  const handleConfirmEdit = () => {
    if (!confirmTarget) return;
    setActiveReplyId(confirmTarget.id);
    setActiveReplyReview(confirmTarget);
    setReplyText(confirmTarget.replyText ?? "");
    setConfirmMode(null);
    setConfirmTarget(null);
  };

  const handleConfirmDelete = async () => {
    if (!selectedStore?.id || !token || !confirmTarget) return;
    try {
      setIsSavingReply(true);
      await deleteStoreReviewReply({
        token,
        storeId: selectedStore.id,
        reviewId: confirmTarget.id,
      });
      setItems((prev) =>
        prev.map((r) =>
          r.id === confirmTarget.id
            ? {
                ...r,
                replyText: null,
                repliedAt: null,
              }
            : r
        )
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not delete reply.");
    } finally {
      setIsSavingReply(false);
      setConfirmMode(null);
      setConfirmTarget(null);
    }
  };

  const onRefresh = () => {
    if (loading) return;
    setRefreshing(true);
    setRefreshNonce((n) => n + 1);
  };

  const filtered = useMemo(() => {
    const text = searchQuery.trim().toLowerCase();
    return items.filter((c) => {
      const rounded = Math.round(c.overallRating);
      const passesRating =
        filter === "all"
          ? true
          : filter === "5plus"
          ? rounded === 5
          : filter === "4plus"
          ? rounded >= 4
          : filter === "3plus"
          ? rounded >= 3
          : filter === "2plus"
          ? rounded >= 2
          : rounded >= 1;

      if (!passesRating) return false;
      if (!text) return true;

      const haystack = `${c.reviewTitle ?? ""} ${c.reviewText ?? ""}`.toLowerCase();
      return haystack.includes(text);
    });
  }, [items, filter, searchQuery]);

  const avgRating =
    items.length === 0
      ? null
      : items.reduce((sum, r) => sum + r.overallRating, 0) / items.length;

  const distribution = useMemo(() => {
    const buckets: Record<number, number> = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
    for (const r of items) {
      const star = Math.min(5, Math.max(1, Math.round(r.overallRating || 0)));
      buckets[star] += 1;
    }
    const total = items.length || 1;
    return Object.keys(buckets)
      .map((key) => Number(key))
      .sort((a, b) => b - a)
      .map((star) => ({
        star,
        count: buckets[star],
        percent: (buckets[star] / total) * 100,
      }));
  }, [items]);

  const renderHeader = () => (
    <View>
      <PageTabs active="reviews" />

      {/* Header: title + store name */}
      <View style={styles.headerBlock}>
        <Text style={styles.headerEyebrow}>INSIGHTS</Text>
        <View style={styles.headerTitleRow}>
          <View style={styles.headerLeft}>
            <LinearGradient
              colors={["#7dd3fc", "#4ade80"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.headerAvatar}
            >
              <View style={styles.headerAvatarInner}>
                <Ionicons
                  name="chatbubble-ellipses-outline"
                  size={18}
                  color="#ffffff"
                />
              </View>
            </LinearGradient>
            <View style={styles.headerTextCol}>
              <Text style={styles.headerTitle}>Customer Reviews</Text>
              <Text style={styles.headerSubtitle} numberOfLines={1}>
                {selectedStore?.store_name ?? "Your Gatimitra outlet"}
              </Text>
            </View>
          </View>
          <LinearGradient
            colors={["#e0f7f0", "#d1fae5"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.headerPill}
          >
            <Ionicons
              name="star-outline"
              size={14}
              color={GatiMitraMerchant.navy}
              style={{ marginRight: 4 }}
            />
            <Ionicons
              name="chatbubbles-outline"
              size={14}
              color={GatiMitraMerchant.navy}
              style={{ marginRight: 4 }}
            />
            <Text style={styles.headerPillText}>Store Feedback</Text>
          </LinearGradient>
        </View>
      </View>

      {/* Rating summary + distribution */}
      <View style={styles.summaryCard}>
        <View style={styles.summaryRow}>
          <View style={styles.summaryLeft}>
            <Text style={styles.summaryValue}>
              {avgRating != null ? avgRating.toFixed(1) : "—"}
            </Text>
            <View style={styles.summaryStarsRow}>
              {Array.from({ length: 5 }).map((_, idx) => (
                <Ionicons
                  key={idx}
                  name="star"
                  size={14}
                  color={
                    avgRating != null && idx < Math.round(avgRating)
                      ? GatiMitraMerchant.statusCompleted
                      : GatiMitraMerchant.surfaceSubtle
                  }
                  style={{ marginRight: 2 }}
                />
              ))}
            </View>
            <Text style={styles.summaryMeta}>
              {items.length} review{items.length === 1 ? "" : "s"}
            </Text>
            <Text style={styles.summaryMetaSmall}>
              {getFilterSummary({ fromDate, toDate, minRating })}
            </Text>
          </View>
          <View style={styles.summaryRight}>
            {distribution.map((b) => (
              <View key={b.star} style={styles.distRow}>
                <Text style={styles.distLabel}>{b.star}★</Text>
                <View style={styles.distBarTrack}>
                  <View
                    style={[
                      styles.distBarFill,
                      { width: `${Math.max(5, b.percent)}%` },
                    ]}
                  />
                </View>
                <Text style={styles.distCount}>{b.count}</Text>
              </View>
            ))}
          </View>
        </View>
      </View>

      {/* Search + filter row */}
      <View style={styles.searchRow}>
        <View style={styles.searchInputWrap}>
          <Ionicons
            name="search-outline"
            size={18}
            color={GatiMitraMerchant.textTertiary}
          />
          <TextInput
            style={styles.searchInput}
            placeholder="Search reviews"
            placeholderTextColor={GatiMitraMerchant.textTertiary}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
        </View>
        <Pressable
          style={({ pressed }) => [
            styles.searchFilterBtn,
            pressed && { opacity: 0.85 },
            GatiMitraMerchant.cursorPointer,
          ]}
          onPress={() => {
            // Sync temporary state from currently applied filters
            setTempMinRating(minRating);
            setTempRangeKey(deriveRangeKey(fromDate));
            setIsFilterSheetOpen(true);
          }}
        >
          <Ionicons
            name="options-outline"
            size={18}
            color={GatiMitraMerchant.textSecondary}
          />
        </Pressable>
      </View>

      {/* Rating filter chips */}
      <View style={styles.filterChipsRow}>
        {[
          { key: "all", label: "All" },
          { key: "5plus", label: "5+" },
          { key: "4plus", label: "4+" },
          { key: "3plus", label: "3+" },
          { key: "2plus", label: "2+" },
          { key: "1plus", label: "1+" },
        ].map((opt) => {
          const isActive = filter === opt.key;
          return (
            <Pressable
              key={opt.key}
              onPress={() => setFilter(opt.key as FilterKey)}
              style={({ pressed }) => [
                pressed && styles.filterChipPressed,
              ]}
            >
              {isActive ? (
                <LinearGradient
                  colors={["#16a34a", "#22c55e"]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={{
                    borderRadius: 999,
                    paddingHorizontal: 14,
                    paddingVertical: 6,
                  }}
                >
                  <Text style={styles.filterChipTextActive}>{opt.label}</Text>
                </LinearGradient>
              ) : (
                <View
                  style={{
                    borderRadius: 999,
                    paddingHorizontal: 12,
                    paddingVertical: 6,
                    backgroundColor: GatiMitraMerchant.surfaceSubtle,
                  }}
                >
                  <Text style={styles.filterChipText}>{opt.label}</Text>
                </View>
              )}
            </Pressable>
          );
        })}
      </View>
    </View>
  );

  if (loading && !hasLoadedOnce) {
    return <ReviewsComplaintsSkeleton variant="reviews" />;
  }

  if (error && !hasLoadedOnce) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>{error}</Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={120}
    >
      <StatusBar style="dark" />
      <FlatList
        style={styles.list}
        contentContainerStyle={styles.listContent}
        data={filtered}
        keyExtractor={(item) => String(item.id)}
        ListHeaderComponent={renderHeader}
        ListEmptyComponent={() => (
          <View style={styles.centered}>
            <Text style={styles.muted}>No reviews yet.</Text>
          </View>
        )}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={[GatiMitraMerchant.primary]}
            tintColor={GatiMitraMerchant.primary}
          />
        }
        renderItem={({ item }) => {
          const rounded = Math.round(item.overallRating);
          const isHigh = rounded >= 4;
          const isLow = rounded <= 2;
          return (
            <View style={styles.card}>
              <View style={styles.cardHeaderRow}>
                <View
                  style={[
                    styles.ratingPill,
                    isHigh && styles.ratingPillHigh,
                    isLow && styles.ratingPillLow,
                  ]}
                >
                  <Ionicons
                    name="star"
                    size={12}
                    color="#FFFFFF"
                    style={{ marginRight: 4 }}
                  />
                  <Text style={styles.ratingPillText}>
                    {item.overallRating.toFixed(1)}
                  </Text>
                </View>
                <Text style={styles.title} numberOfLines={1}>
                  {item.reviewTitle || "Great experience"}
                </Text>
              </View>
              {item.reviewText ? (
                <Text style={styles.body} numberOfLines={3}>
                  {item.reviewText}
                </Text>
              ) : null}
              <View style={styles.cardFooterRow}>
                <Text style={styles.date}>{formatDateTime(item.createdAt)}</Text>
                <View style={styles.cardFooterRight}>
                  {item.replyText ? (
                    <Text style={styles.repliedTag}>Replied</Text>
                  ) : null}
                  <Pressable
                    onPress={() => handleOpenReply(item)}
                    style={({ pressed }) => [
                      styles.replyButton,
                      pressed && styles.replyButtonPressed,
                      GatiMitraMerchant.cursorPointer,
                    ]}
                  >
                    <Ionicons
                      name="chatbubble-ellipses-outline"
                      size={13}
                      color={GatiMitraMerchant.primary}
                      style={{ marginRight: 4 }}
                    />
                    <Text style={styles.replyButtonLabel}>
                      {item.replyText ? "Edit reply" : "Reply"}
                    </Text>
                  </Pressable>
                  {item.replyText ? (
                    <Pressable
                      onPress={() => {
                        setConfirmMode("delete");
                        setConfirmTarget(item);
                      }}
                      style={({ pressed }) => [
                        styles.iconButton,
                        pressed && styles.replyButtonPressed,
                        GatiMitraMerchant.cursorPointer,
                      ]}
                    >
                      <Ionicons
                        name="trash-outline"
                        size={16}
                        color={GatiMitraMerchant.error}
                      />
                    </Pressable>
                  ) : null}
                </View>
              </View>
              {item.replyText ? (
                <View style={styles.replyBubble}>
                  <Text style={styles.replyLabel}>Your reply</Text>
                  <Text style={styles.replyText}>{item.replyText}</Text>
                </View>
              ) : null}
            </View>
          );
        }}
      />

      {isFilterSheetOpen && (
        <View style={styles.sheetBackdrop}>
          <Pressable
            style={styles.sheetBackdropTouch}
            onPress={() => setIsFilterSheetOpen(false)}
          />
          <View style={styles.sheetCard}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>Filters</Text>

            <Text style={styles.sheetSectionLabel}>Date range</Text>
            <View style={styles.sheetChipRow}>
              <Pressable
                onPress={() => {
                  setTempRangeKey("7");
                }}
                style={[
                  styles.sheetPill,
                  tempRangeKey === "7" && styles.sheetPillActive,
                ]}
              >
                <Text
                  style={[
                    styles.sheetPillText,
                    tempRangeKey === "7" && styles.sheetPillTextActive,
                  ]}
                >
                  Last 7 days
                </Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  setTempRangeKey("21");
                }}
                style={[
                  styles.sheetPill,
                  tempRangeKey === "21" && styles.sheetPillActive,
                ]}
              >
                <Text
                  style={[
                    styles.sheetPillText,
                    tempRangeKey === "21" && styles.sheetPillTextActive,
                  ]}
                >
                  Last 21 days
                </Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  setTempRangeKey("30");
                }}
                style={[
                  styles.sheetPill,
                  tempRangeKey === "30" && styles.sheetPillActive,
                ]}
              >
                <Text
                  style={[
                    styles.sheetPillText,
                    tempRangeKey === "30" && styles.sheetPillTextActive,
                  ]}
                >
                  Last 30 days
                </Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  setTempRangeKey("all");
                }}
                style={[
                  styles.sheetPill,
                  tempRangeKey === "all" && styles.sheetPillActive,
                ]}
              >
                <Text
                  style={[
                    styles.sheetPillText,
                    tempRangeKey === "all" && styles.sheetPillTextActive,
                  ]}
                >
                  All time
                </Text>
              </Pressable>
            </View>

            <Text style={styles.sheetSectionLabel}>Minimum rating</Text>
            <View style={styles.sheetChipRow}>
              {[5, 4, 3, 2, 1].map((star) => (
                <Pressable
                  key={star}
                  onPress={() => {
                    setTempMinRating(star);
                  }}
                  style={[
                    styles.sheetPill,
                    tempMinRating === star && styles.sheetPillActive,
                  ]}
                >
                  <Text
                    style={[
                      styles.sheetPillText,
                      tempMinRating === star && styles.sheetPillTextActive,
                    ]}
                  >
                    {star}+
                  </Text>
                </Pressable>
              ))}
            </View>

            <View style={styles.sheetActionsRow}>
              <Pressable
                style={styles.sheetSecondaryButton}
                onPress={() => {
                  const to = new Date();
                  const from = new Date();
                  from.setDate(to.getDate() - 21);
                  setTempRangeKey("21");
                  setTempMinRating(null);
                  setFilter("all");
                  setFromDate(from.toISOString());
                  setToDate(to.toISOString());
                  setIsFilterSheetOpen(false);
                }}
              >
                <Text style={styles.sheetSecondaryButtonText}>Reset</Text>
              </Pressable>
              <Pressable
                style={styles.sheetPrimaryButton}
                onPress={() => {
                  applyTempFilters({
                    tempRangeKey,
                    tempMinRating,
                    setFromDate,
                    setToDate,
                    setMinRating,
                  });
                  setIsFilterSheetOpen(false);
                }}
              >
                <Text style={styles.sheetPrimaryButtonText}>Done</Text>
              </Pressable>
            </View>
          </View>
        </View>
      )}

      {activeReplyId != null && (
        <View style={styles.sheetBackdrop}>
          <Pressable
            style={styles.sheetBackdropTouch}
            onPress={() => {
              setActiveReplyId(null);
              setActiveReplyReview(null);
              setReplyText("");
            }}
          />
          <View style={styles.sheetCard}>
            <View style={styles.sheetHandle} />
            <View style={styles.sheetHeaderRow}>
              <View style={styles.sheetHeaderLeft}>
                <Text style={styles.sheetTitle}>Reply to Review</Text>
                {activeReplyReview && (
                  <View style={styles.sheetReviewMetaRow}>
                    <View style={styles.sheetRatingChip}>
                      <Ionicons
                        name="star"
                        size={11}
                        color="#FFFFFF"
                        style={{ marginRight: 3 }}
                      />
                      <Text style={styles.sheetRatingText}>
                        {activeReplyReview.overallRating.toFixed(1)}
                      </Text>
                    </View>
                    <Text style={styles.sheetSubtitle} numberOfLines={1}>
                      {activeReplyReview.reviewTitle || "Customer review"}
                    </Text>
                    <Text style={styles.sheetDateInline}>
                      {formatDateOnly(activeReplyReview.createdAt)}
                    </Text>
                  </View>
                )}
              </View>
              <Pressable
                style={styles.sheetCloseButton}
                onPress={() => {
                  setActiveReplyId(null);
                  setActiveReplyReview(null);
                  setReplyText("");
                }}
              >
                <Ionicons name="close" size={18} color={GatiMitraMerchant.textSecondary} />
              </Pressable>
            </View>
            <Text style={styles.sheetHint}>
              Your reply will be visible to the customer on their order details.
            </Text>
            <TextInput
              style={styles.replyInput}
              placeholder="Write your reply to the customer"
              placeholderTextColor={GatiMitraMerchant.textTertiary}
              multiline
              value={replyText}
              onChangeText={setReplyText}
            />
            <View style={styles.replyActionsRow}>
              <Pressable
                style={styles.sheetSecondaryButton}
                onPress={() => {
                  setActiveReplyId(null);
                  setActiveReplyReview(null);
                  setReplyText("");
                }}
              >
                <Text style={styles.sheetSecondaryButtonText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={styles.sheetPrimaryButtonOuter}
                disabled={!replyText.trim() || isSavingReply}
                onPress={handleSaveReply}
              >
                <LinearGradient
                  colors={["#34d399", "#22c55e"]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={[
                    styles.sheetPrimaryButton,
                    (!replyText.trim() || isSavingReply) && { opacity: 0.6 },
                  ]}
                >
                  <Text style={styles.sheetPrimaryButtonText}>
                    {isSavingReply ? "Saving…" : "Send Reply"}
                  </Text>
                </LinearGradient>
              </Pressable>
            </View>
          </View>
        </View>
      )}

      {confirmMode && confirmTarget && (
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>
              {confirmMode === "edit" ? "Edit reply?" : "Delete reply?"}
            </Text>
            <Text style={styles.modalBody}>
              {confirmMode === "edit"
                ? "You are about to edit this review.\nMake sure the updated information is correct before saving."
                : "Once deleted, this review will be permanently removed and cannot be recovered."}
            </Text>
            <View style={styles.modalActionsRow}>
              <Pressable
                style={styles.sheetSecondaryButton}
                onPress={() => {
                  setConfirmMode(null);
                  setConfirmTarget(null);
                }}
              >
                <Text style={styles.sheetSecondaryButtonText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[
                  styles.sheetPrimaryButton,
                  confirmMode === "delete" && { backgroundColor: GatiMitraMerchant.error },
                ]}
                onPress={confirmMode === "edit" ? handleConfirmEdit : handleConfirmDelete}
                disabled={isSavingReply}
              >
                <Text style={styles.sheetPrimaryButtonText}>
                  {confirmMode === "edit"
                    ? "Continue"
                    : isSavingReply
                    ? "Deleting…"
                    : "Delete reply"}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      )}
    </KeyboardAvoidingView>
  );
}

function formatDateTime(value: string): string {
  const formatted = formatDateOnly(value);
  if (formatted === "—") return "—";
  return formatted;
}

function formatDateOnly(value: string): string {
  if (!value) return "—";
  const raw = String(value).trim();
  const [datePart] = raw.split(/[ T]/);
  if (!datePart) return "—";
  const parts = datePart.split("-");
  if (parts.length !== 3) return raw;
  const [y, m, d] = parts;
  return `${Number(d)} ${monthShortName(Number(m))} ${y}`;
}

function getFilterSummary(params: {
  fromDate: string;
  toDate: string;
  minRating: number | null;
}): string {
  const { fromDate, minRating } = params;
  const defaultFrom = (() => {
    const d = new Date();
    d.setDate(d.getDate() - 21);
    return d.toISOString().slice(0, 10);
  })();
  const fromShort = formatDateOnly(fromDate);

  if (!minRating && fromDate.slice(0, 10) === defaultFrom) {
    return "Recent reviews (last 21 days)";
  }

  if (minRating && fromShort) {
    return `Filtered from ${fromShort}, rating ${minRating}★+`;
  }
  if (minRating) {
    return `Filtered by rating ${minRating}★+`;
  }
  if (fromShort) {
    return `Filtered from ${fromShort}`;
  }
  return "Filtered reviews";
}

function deriveRangeKey(fromDate: string): "7" | "21" | "30" | "all" {
  if (!fromDate) return "all";
  const raw = String(fromDate).trim();
  const [datePart] = raw.split(/[ T]/);
  if (!datePart) return "all";
  const [y, m, d] = datePart.split("-").map((v) => Number(v));
  if (!y || !m || !d) return "all";
  const from = new Date(y, m - 1, d);
  const today = new Date();
  const msPerDay = 24 * 60 * 60 * 1000;
  const diff = Math.round(
    (today.setHours(0, 0, 0, 0) - from.setHours(0, 0, 0, 0)) / msPerDay
  );
  if (Math.abs(diff - 7) <= 1) return "7";
  if (Math.abs(diff - 21) <= 1) return "21";
  if (Math.abs(diff - 30) <= 1) return "30";
  return "all";
}

function applyTempFilters(args: {
  tempRangeKey: "7" | "21" | "30" | "all";
  tempMinRating: number | null;
  setFromDate: (v: string) => void;
  setToDate: (v: string) => void;
  setMinRating: (v: number | null) => void;
}) {
  const { tempRangeKey, tempMinRating, setFromDate, setToDate, setMinRating } = args;
  const to = new Date();
  let from: Date | null = null;

  if (tempRangeKey === "7") {
    from = new Date(to);
    from.setDate(to.getDate() - 7);
  } else if (tempRangeKey === "21") {
    from = new Date(to);
    from.setDate(to.getDate() - 21);
  } else if (tempRangeKey === "30") {
    from = new Date(to);
    from.setDate(to.getDate() - 30);
  } else {
    from = null;
  }

  setFromDate(from ? from.toISOString() : "");
  setToDate(to.toISOString());
  setMinRating(tempMinRating);
}

function monthShortName(m: number): string {
  return ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][
    Math.min(11, Math.max(0, m - 1))
  ];
}

function PageTabs({ active }: { active: "complaints" | "reviews" }) {
  const router = useRouter();
  const pathname = usePathname();
  const inProfile = pathname.includes("/profile/");
  const complaintsHref = inProfile ? "/(tabs)/profile/complaints" : "/(tabs)/complaints";
  const reviewsHref = inProfile ? "/(tabs)/profile/reviews" : "/(tabs)/reviews";
  return (
    <View style={styles.tabsWrap}>
      <View style={styles.tabsBackground}>
        <Pressable
          onPress={() => router.replace(complaintsHref as any)}
          style={({ pressed }) => [
            styles.tabButton,
            pressed && styles.chipPressed,
            GatiMitraMerchant.cursorPointer,
          ]}
        >
          <View
            style={[
              styles.tabInner,
              active === "complaints" && styles.tabInnerActive,
            ]}
          >
            <Text
              style={[
                styles.tabButtonLabel,
                active === "complaints" && styles.tabButtonLabelActive,
              ]}
            >
              Complaints
            </Text>
          </View>
        </Pressable>
        <Pressable
          onPress={() => router.replace(reviewsHref as any)}
          style={({ pressed }) => [
            styles.tabButton,
            pressed && styles.chipPressed,
            GatiMitraMerchant.cursorPointer,
          ]}
        >
          {active === "reviews" ? (
            <LinearGradient
              colors={["#22c55e", "#16a34a"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={[styles.tabInner, styles.tabInnerActive]}
            >
              <Ionicons
                name="star"
                size={13}
                color="#ffffff"
                style={{ marginRight: 4 }}
              />
              <Text
                style={[styles.tabButtonLabel, styles.tabButtonLabelActive]}
              >
                Reviews
              </Text>
            </LinearGradient>
          ) : (
            <View style={styles.tabInner}>
              <Text style={styles.tabButtonLabel}>Reviews</Text>
            </View>
          )}
        </Pressable>
      </View>
    </View>
  );
}

function FilterChip({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        active && styles.chipActive,
        pressed && styles.chipPressed,
        GatiMitraMerchant.cursorPointer,
      ]}
    >
      <Text style={[styles.chipLabel, active && styles.chipLabelActive]}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: GatiMitraMerchant.surfaceWarm,
  },
  list: { flex: 1 },
  listContent: { padding: H_PADDING, paddingTop: 8, paddingBottom: 24 },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: H_PADDING,
  },
  muted: {
    marginTop: 8,
    fontSize: 14,
    color: GatiMitraMerchant.textSecondary,
  },
  errorText: {
    fontSize: 14,
    color: GatiMitraMerchant.error,
    textAlign: "center",
  },
  card: {
    backgroundColor: GatiMitraMerchant.cardBg,
    borderRadius: 16,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: GatiMitraMerchant.border,
    ...GatiMitraMerchant.shadowSm,
  },
  cardHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 4,
  },
  title: {
    flex: 1,
    fontSize: 14,
    fontWeight: "600",
    color: GatiMitraMerchant.textPrimary,
  },
  body: {
    fontSize: 13,
    color: GatiMitraMerchant.textSecondary,
    marginBottom: 6,
  },
  date: {
    fontSize: 11,
    color: GatiMitraMerchant.textTertiary,
  },
  cardFooterRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 2,
  },
  cardFooterRight: {
    flexDirection: "row",
    alignItems: "center",
    columnGap: 8,
  },
  headerBlock: {
    marginBottom: 8,
  },
  headerEyebrow: {
    fontSize: 11,
    fontWeight: "600",
    color: GatiMitraMerchant.textTertiary,
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginBottom: 2,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: GatiMitraMerchant.textPrimary,
  },
  headerSubtitle: {
    marginTop: 2,
    fontSize: 12,
    color: GatiMitraMerchant.textSecondary,
  },
  headerTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  headerAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 10,
  },
  headerAvatarInner: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: "rgba(15,23,42,0.15)",
    justifyContent: "center",
    alignItems: "center",
  },
  headerTextCol: {
    flexShrink: 1,
  },
  headerPill: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 999,
    shadowColor: "#0F172A",
    shadowOpacity: 0.06,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  headerPillText: {
    fontSize: 12,
    fontWeight: "600",
    color: GatiMitraMerchant.navy,
  },
  summaryCard: {
    backgroundColor: GatiMitraMerchant.cardBg,
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: GatiMitraMerchant.border,
    ...GatiMitraMerchant.shadowSm,
  },
  summaryRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  summaryLeft: {
    marginRight: 16,
  },
  summaryLabel: {
    fontSize: 12,
    color: GatiMitraMerchant.textSecondary,
  },
  summaryValue: {
    marginTop: 2,
    fontSize: 26,
    fontWeight: "700",
    color: GatiMitraMerchant.textPrimary,
  },
  summaryRight: {
    flex: 1,
  },
  summaryMeta: {
    marginTop: 4,
    fontSize: 11,
    color: GatiMitraMerchant.textTertiary,
  },
  summaryStarsRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 4,
  },
  summaryMetaSmall: {
    marginTop: 2,
    fontSize: 11,
    color: GatiMitraMerchant.textTertiary,
  },
  distRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 4,
  },
  distLabel: {
    width: 32,
    fontSize: 11,
    color: GatiMitraMerchant.textSecondary,
  },
  distBarTrack: {
    flex: 1,
    height: 6,
    borderRadius: 999,
    backgroundColor: GatiMitraMerchant.surfaceSubtle,
    overflow: "hidden",
    marginHorizontal: 6,
  },
  distBarFill: {
    height: "100%",
    borderRadius: 999,
    backgroundColor: GatiMitraMerchant.primary,
  },
  distCount: {
    width: 22,
    fontSize: 11,
    textAlign: "right",
    color: GatiMitraMerchant.textSecondary,
  },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: H_PADDING,
    marginBottom: 10,
  },
  searchInputWrap: {
    flexGrow: 1,
    flexShrink: 1,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: GatiMitraMerchant.surfaceSubtle,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: GatiMitraMerchant.border,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    color: GatiMitraMerchant.textPrimary,
    marginLeft: 6,
  },
  searchFilterBtn: {
    width: 44,
    height: 40,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: GatiMitraMerchant.border,
    backgroundColor: GatiMitraMerchant.cardBg,
    alignItems: "center",
    justifyContent: "center",
  },
  tabsWrap: {
    paddingHorizontal: H_PADDING,
    paddingVertical: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  tabsBackground: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: GatiMitraMerchant.surfaceSubtle,
    borderRadius: 999,
    padding: 3,
    gap: 2,
  },
  tabButton: {
    flex: 1,
    borderRadius: 999,
  },
  tabInner: {
    borderRadius: 999,
    paddingVertical: 7,
    paddingHorizontal: 14,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
  },
  tabInnerActive: {
    backgroundColor: GatiMitraMerchant.primary,
  },
  tabButtonLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: GatiMitraMerchant.textSecondary,
  },
  tabButtonLabelActive: {
    color: "#FFFFFF",
  },
  filterChipsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    paddingHorizontal: H_PADDING,
    marginBottom: 8,
  },
  filterChipPressed: {
    opacity: 0.9,
  },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: GatiMitraMerchant.border,
    backgroundColor: GatiMitraMerchant.surfaceSubtle,
  },
  chipActive: {
    backgroundColor: GatiMitraMerchant.primary,
    borderColor: GatiMitraMerchant.primary,
  },
  chipPressed: {
    opacity: 0.85,
  },
  chipLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: GatiMitraMerchant.textSecondary,
  },
  chipLabelActive: {
    color: "#FFFFFF",
  },
  filterChipText: {
    fontSize: 12,
    fontWeight: "600",
    color: GatiMitraMerchant.textSecondary,
  },
  filterChipTextActive: {
    fontSize: 12,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  ratingPill: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: GatiMitraMerchant.surfaceSubtle,
    marginRight: 8,
  },
  ratingPillHigh: {
    backgroundColor: GatiMitraMerchant.statusCompleted,
  },
  ratingPillLow: {
    backgroundColor: GatiMitraMerchant.error,
  },
  ratingPillText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  replyButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: GatiMitraMerchant.primary,
    backgroundColor: "transparent",
  },
  replyButtonPressed: {
    opacity: 0.85,
  },
  replyButtonLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: GatiMitraMerchant.primary,
  },
  repliedTag: {
    fontSize: 11,
    fontWeight: "600",
    color: GatiMitraMerchant.success,
    marginRight: 4,
  },
  replyBubble: {
    marginTop: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: GatiMitraMerchant.surfaceSubtle,
  },
  replyLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: GatiMitraMerchant.textSecondary,
    marginBottom: 2,
  },
  replyText: {
    fontSize: 12,
    color: GatiMitraMerchant.textPrimary,
  },
  iconButton: {
    marginLeft: 4,
    padding: 4,
    borderRadius: 999,
  },
  inlineLoader: {
    position: "absolute",
    top: 44,
    left: 0,
    right: 0,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 10,
  },
  inlineLoaderText: {
    marginLeft: 6,
    fontSize: 11,
    color: GatiMitraMerchant.textTertiary,
  },
  sheetBackdrop: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "flex-end",
    backgroundColor: "rgba(15,23,42,0.35)",
  },
  sheetBackdropTouch: {
    ...StyleSheet.absoluteFillObject,
  },
  sheetCard: {
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 18,
    paddingTop: 10,
    paddingBottom: 22,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    borderTopWidth: 1,
    borderColor: GatiMitraMerchant.border,
    ...GatiMitraMerchant.shadowCard,
  },
  sheetHandle: {
    alignSelf: "center",
    width: 44,
    height: 4,
    borderRadius: 999,
    backgroundColor: GatiMitraMerchant.surfaceSubtle,
    marginBottom: 10,
  },
  sheetTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: GatiMitraMerchant.textPrimary,
    marginBottom: 2,
  },
  sheetSubtitle: {
    fontSize: 12,
    color: GatiMitraMerchant.textSecondary,
    marginBottom: 4,
  },
  sheetHint: {
    fontSize: 11,
    color: GatiMitraMerchant.textTertiary,
    marginBottom: 10,
  },
  sheetSectionLabel: {
    marginTop: 6,
    marginBottom: 4,
    fontSize: 12,
    fontWeight: "600",
    color: GatiMitraMerchant.textSecondary,
  },
  sheetChipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    columnGap: 8,
    rowGap: 6,
    marginBottom: 6,
  },
  sheetPill: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: GatiMitraMerchant.border,
    backgroundColor: GatiMitraMerchant.surfaceSubtle,
  },
  sheetPillActive: {
    backgroundColor: GatiMitraMerchant.primary,
    borderColor: GatiMitraMerchant.primary,
  },
  sheetPillText: {
    fontSize: 12,
    fontWeight: "500",
    color: GatiMitraMerchant.textSecondary,
  },
  sheetPillTextActive: {
    color: "#FFFFFF",
  },
  sheetHeaderRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  sheetHeaderLeft: {
    flex: 1,
    paddingRight: 8,
  },
  sheetReviewMetaRow: {
    marginTop: 2,
  },
  sheetRatingChip: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: GatiMitraMerchant.statusCompleted,
    marginBottom: 2,
  },
  sheetRatingText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#FFFFFF",
  },
  sheetDatePill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: GatiMitraMerchant.surfaceSubtle,
  },
  sheetDatePillText: {
    fontSize: 11,
    fontWeight: "500",
    color: GatiMitraMerchant.textSecondary,
  },
  sheetDateInline: {
    marginTop: 2,
    fontSize: 11,
    color: GatiMitraMerchant.textTertiary,
  },
  sheetCloseButton: {
    padding: 4,
  },
  sheetActionsRow: {
    marginTop: 10,
    flexDirection: "row",
    justifyContent: "flex-end",
    columnGap: 10,
  },
  sheetSecondaryButton: {
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: GatiMitraMerchant.border,
    backgroundColor: "#FFFFFF",
  },
  sheetSecondaryButtonText: {
    fontSize: 13,
    fontWeight: "500",
    color: GatiMitraMerchant.textSecondary,
  },
  sheetPrimaryButtonText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#FFFFFF",
  },
  replyInput: {
    marginTop: 4,
    minHeight: 80,
    maxHeight: 140,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: GatiMitraMerchant.surfaceSubtle,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 13,
    color: GatiMitraMerchant.textPrimary,
    textAlignVertical: "top",
  },
  replyActionsRow: {
    marginTop: 12,
    flexDirection: "row",
    justifyContent: "flex-end",
    columnGap: 10,
  },
  sheetPrimaryButtonOuter: {
    borderRadius: 999,
    overflow: "hidden",
    minWidth: 120,
  },
  sheetPrimaryButton: {
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: GatiMitraMerchant.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(15,23,42,0.4)",
    zIndex: 30,
  },
  modalCard: {
    width: "82%",
    borderRadius: 16,
    paddingHorizontal: 18,
    paddingVertical: 16,
    backgroundColor: "#FFFFFF",
    ...GatiMitraMerchant.shadowCard,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: GatiMitraMerchant.textPrimary,
    marginBottom: 6,
    textAlign: "center",
  },
  modalBody: {
    fontSize: 13,
    color: GatiMitraMerchant.textSecondary,
    textAlign: "center",
    marginBottom: 14,
  },
  modalActionsRow: {
    flexDirection: "row",
    justifyContent: "center",
    columnGap: 12,
  },
});

