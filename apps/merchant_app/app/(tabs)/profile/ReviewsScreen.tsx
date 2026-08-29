import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppText as Text } from "@/components/AppText";
import { View, StyleSheet, FlatList, Pressable, TextInput, RefreshControl, Platform } from "react-native";
import { StatusBar } from "expo-status-bar";
import { useFocusEffect, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSelectedStore } from "@/context/SelectedStoreContext";
import { useAuth } from "@/context/AuthContext";
import { GatiMitraMerchant, H_PADDING } from "@/constants/theme";
import {
  fetchStoreReviews,
  deleteStoreReviewReply,
  type StoreReview as ApiStoreReview,
} from "@/services/ratingsApi";
import { ReviewsComplaintsSkeleton } from "@/components/ReviewsComplaintsSkeleton";
import { FeedbackTabs } from "@/components/FeedbackTabs";
import { FeedbackCard } from "@/components/FeedbackCard";
import { setFeedbackReplySnapshot } from "@/lib/feedbackReplyCache";
import { MerchantBottomSheetShell } from "@/components/order/MerchantBottomSheetShell";

type StoreReview = ApiStoreReview;

type FilterKey = "all" | "5plus" | "4plus" | "3plus" | "2plus" | "1plus";

export default function ReviewsScreen() {
  const router = useRouter();
  const { selectedStore } = useSelectedStore();
  const { token } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<StoreReview[]>([]);
  const [filter, setFilter] = useState<FilterKey>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [fromDate, setFromDate] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() - 21);
    return d.toISOString();
  });
  const [toDate, setToDate] = useState<string>(() => new Date().toISOString());
  const [isFilterSheetOpen, setIsFilterSheetOpen] = useState(false);
  const [tempRangeKey, setTempRangeKey] = useState<"7" | "21" | "30" | "all">("21");
  const [tempFilter, setTempFilter] = useState<FilterKey>("all");
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [confirmMode, setConfirmMode] = useState<null | "delete">(null);
  const [confirmTarget, setConfirmTarget] = useState<StoreReview | null>(null);
  const [isSavingReply, setIsSavingReply] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const skipFocusReload = useRef(true);

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

  useFocusEffect(
    useCallback(() => {
      if (skipFocusReload.current) {
        skipFocusReload.current = false;
        return;
      }
      setRefreshNonce((n) => n + 1);
    }, [])
  );

  const storeHeading = [selectedStore?.store_name?.trim(), selectedStore?.city?.trim()]
    .filter(Boolean)
    .join(", ") || "Store";

  const handleOpenReply = (review: StoreReview) => {
    setFeedbackReplySnapshot({
      id: Number(review.id),
      overallRating: review.overallRating,
      reviewTitle: review.reviewTitle,
      reviewText: review.reviewText,
      createdAt: review.createdAt,
      replyText: review.replyText,
      repliedAt: review.repliedAt,
      replies: review.replies,
      customerName: review.customerName,
      customerAvatarUrl: review.customerAvatarUrl,
      formattedOrderId: review.formattedOrderId,
      orderId: review.orderId,
      foodOrderId: review.foodOrderId,
      orderCount: review.orderCount,
      source: "rating",
      reviewImages: review.reviewImages,
    });
    router.push({
      pathname: "/feedback-reply/[id]",
      params: { id: String(review.id), kind: "review" },
    } as never);
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
          ? rounded === 4
          : filter === "3plus"
          ? rounded === 3
          : filter === "2plus"
          ? rounded === 2
          : rounded === 1;

      if (!passesRating) return false;
      if (!text) return true;

      const haystack = `${c.reviewTitle ?? ""} ${c.reviewText ?? ""} ${c.customerName ?? ""} ${c.formattedOrderId ?? ""}`.toLowerCase();
      return haystack.includes(text);
    });
  }, [items, filter, searchQuery]);

  const renderHeader = () => (
    <View>
      <Text style={styles.countLine}>
        {filtered.length} review{filtered.length === 1 ? "" : "s"}
      </Text>

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
            underlineColorAndroid="transparent"
          />
        </View>
        <Pressable
          style={({ pressed }) => [
            styles.searchFilterBtn,
            pressed && { opacity: 0.85 },
            GatiMitraMerchant.cursorPointer,
          ]}
          onPress={() => {
            setTempFilter(filter);
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
    </View>
  );

  if (loading && !hasLoadedOnce) {
    return (
      <View style={styles.screen}>
        <StatusBar style="dark" />
        <View style={styles.stickyTabs}>
          <FeedbackTabs active="reviews" />
        </View>
        <ReviewsComplaintsSkeleton variant="reviews" hideTabs />
      </View>
    );
  }

  if (error && !hasLoadedOnce) {
    return (
      <View style={styles.screen}>
        <StatusBar style="dark" />
        <View style={styles.stickyTabs}>
          <FeedbackTabs active="reviews" />
        </View>
        <View style={styles.centered}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <StatusBar style="dark" />
      <View style={styles.stickyTabs}>
        <FeedbackTabs active="reviews" />
      </View>
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
            colors={[GatiMitraMerchant.navy]}
            tintColor={GatiMitraMerchant.navy}
          />
        }
        renderItem={({ item }) => (
          <FeedbackCard
            item={item}
            token={token}
            storeHeading={storeHeading}
            onReply={() => handleOpenReply(item)}
          />
        )}
      />

      <MerchantBottomSheetShell
        visible={isFilterSheetOpen}
        onClose={() => setIsFilterSheetOpen(false)}
        hideCloseFab
      >
        <View style={styles.sheetInner}>
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

            <Text style={styles.sheetSectionLabel}>Rating</Text>
            <View style={styles.sheetChipRow}>
              {(
                [
                  { key: "all" as const, label: "All" },
                  { key: "5plus" as const, label: "5★" },
                  { key: "4plus" as const, label: "4★" },
                  { key: "3plus" as const, label: "3★" },
                  { key: "2plus" as const, label: "2★" },
                  { key: "1plus" as const, label: "1★" },
                ] as const
              ).map((opt) => (
                <Pressable
                  key={opt.key}
                  onPress={() => setTempFilter(opt.key)}
                  style={[
                    styles.sheetPill,
                    tempFilter === opt.key && styles.sheetPillActive,
                  ]}
                >
                  <Text
                    style={[
                      styles.sheetPillText,
                      tempFilter === opt.key && styles.sheetPillTextActive,
                    ]}
                  >
                    {opt.label}
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
                  setTempFilter("all");
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
                    setFromDate,
                    setToDate,
                  });
                  setFilter(tempFilter);
                  setIsFilterSheetOpen(false);
                }}
              >
                <Text style={styles.sheetPrimaryButtonText}>Done</Text>
              </Pressable>
            </View>
        </View>
      </MerchantBottomSheetShell>

      {confirmMode && confirmTarget && (
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Delete reply?</Text>
            <Text style={styles.modalBody}>
              Once deleted, this reply will be permanently removed and cannot be recovered.
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
                  { backgroundColor: GatiMitraMerchant.error },
                ]}
                onPress={handleConfirmDelete}
                disabled={isSavingReply}
              >
                <Text style={styles.sheetPrimaryButtonText}>
                  {isSavingReply ? "Deleting…" : "Delete reply"}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      )}
    </View>
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
  setFromDate: (v: string) => void;
  setToDate: (v: string) => void;
}) {
  const { tempRangeKey, setFromDate, setToDate } = args;
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
}

function monthShortName(m: number): string {
  return ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][
    Math.min(11, Math.max(0, m - 1))
  ];
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: GatiMitraMerchant.surfaceWarm,
  },
  stickyTabs: {
    zIndex: 2,
    paddingHorizontal: H_PADDING,
    paddingTop: 8,
    paddingBottom: 4,
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
  countLine: {
    fontSize: 12,
    fontWeight: "600",
    color: GatiMitraMerchant.textSecondary,
    marginBottom: 10,
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
    gap: 8,
    marginBottom: 10,
  },
  searchInputWrap: {
    flexGrow: 1,
    flexShrink: 1,
    height: 36,
    overflow: "hidden",
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: GatiMitraMerchant.surfaceSubtle,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 0,
    borderWidth: 1,
    borderColor: GatiMitraMerchant.border,
  },
  searchInput: {
    flex: 1,
    height: 36,
    fontSize: 13,
    color: GatiMitraMerchant.textPrimary,
    marginLeft: 6,
    paddingVertical: 0,
    textAlignVertical: "center",
    ...Platform.select({ android: { includeFontPadding: false } }),
  },
  searchFilterBtn: {
    width: 36,
    height: 36,
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
    marginBottom: 8,
  },
  filterChip: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  filterChipIdle: {
    backgroundColor: GatiMitraMerchant.surfaceSubtle,
    borderWidth: 1,
    borderColor: GatiMitraMerchant.border,
  },
  filterChipActiveReviews: {
    backgroundColor: GatiMitraMerchant.navy,
    borderWidth: 1,
    borderColor: GatiMitraMerchant.navy,
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
    backgroundColor: GatiMitraMerchant.navy,
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
    borderColor: GatiMitraMerchant.navy,
    backgroundColor: "transparent",
  },
  replyButtonPressed: {
    opacity: 0.85,
  },
  replyButtonLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: GatiMitraMerchant.navy,
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
  sheetInner: {
    paddingHorizontal: 18,
    paddingTop: 10,
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
    backgroundColor: GatiMitraMerchant.navy,
    borderColor: GatiMitraMerchant.navy,
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
    backgroundColor: GatiMitraMerchant.primary,
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
    backgroundColor: GatiMitraMerchant.navy,
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

