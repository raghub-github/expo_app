/**
 * Checkout “Recently Removed” — compact collapsible row(s).
 * Header matches “Complete your meal with”: [icon box] title … chevron.
 */

import React, { memo, useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  useWindowDimensions,
} from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { DietIndicator } from "@/components/store/DietIndicator";
import { toAbsoluteImageUrl } from "@/utils/mediaUrl";
import { useRecentlyRemovedStore } from "@/store/recentlyRemovedStore";
import {
  formatRecentlyRemovedVariantSummary,
  recentlyRemovedBaseMenuId,
  type RecentlyRemovedEntry,
} from "@/lib/recentlyRemoved";
import { restoreRecentlyRemovedEntry } from "@/lib/restoreRecentlyRemoved";
import type { MenuItem } from "@/services/merchant.service";
import { DiscoveryColors } from "@/features/discovery-home/discoveryTheme";

const MINT = "#2DB5A0";
const CARD_GAP = 12;
const EMPTY_ENTRIES: RecentlyRemovedEntry[] = [];

type Props = {
  merchantId: string | null;
  menu?: MenuItem[] | undefined;
  isDark?: boolean;
};

function formatInr(n: number): string {
  const v = Number.isFinite(n) ? n : 0;
  return Number.isInteger(v) ? `₹${v}` : `₹${v.toFixed(2)}`;
}

function findMenuImage(menu: MenuItem[] | undefined, baseId: string): string | null {
  if (!menu?.length || !baseId) return null;
  const row = menu.find(
    (m) =>
      m.id === baseId ||
      (m.menuItemId != null && String(m.menuItemId) === baseId) ||
      String((m as { item_id?: string }).item_id ?? "") === baseId
  );
  if (!row) return null;
  const raw =
    row.imageUrl ??
    (row as { item_image_url?: string }).item_image_url ??
    (row as { displayImage?: string }).displayImage;
  return typeof raw === "string" && raw.trim() ? raw.trim() : null;
}

const RecentlyRemovedCard = memo(function RecentlyRemovedCard({
  entry,
  imageUrl,
  isDark,
  restoring,
  fixedWidth,
  onAddBack,
  onDismiss,
}: {
  entry: RecentlyRemovedEntry;
  imageUrl: string | null;
  isDark: boolean;
  restoring: boolean;
  fixedWidth?: number;
  onAddBack: (entry: RecentlyRemovedEntry) => void;
  onDismiss: (entryKey: string) => void;
}) {
  const imageUri = imageUrl ? toAbsoluteImageUrl(imageUrl) ?? imageUrl : null;
  const variantSummary = formatRecentlyRemovedVariantSummary(entry.line);
  const meta = `${formatInr(entry.line.price)}${
    entry.quantity > 1 ? ` · Qty ${entry.quantity}` : ""
  } · Previously in cart`;

  return (
    <View
      style={[
        styles.card,
        fixedWidth != null ? { width: fixedWidth } : styles.cardFluid,
      ]}
      accessibilityLabel={`${entry.line.name}, previously in cart, ${formatInr(entry.line.price)}`}
    >
      <View style={[styles.thumbWrap, isDark && styles.thumbWrapDark]}>
        {imageUri ? (
          <Image
            source={{ uri: imageUri }}
            style={styles.thumb}
            contentFit="cover"
            cachePolicy="memory-disk"
            priority="high"
            recyclingKey={imageUri}
            transition={0}
          />
        ) : (
          <View style={[styles.thumbPlaceholder, isDark && styles.thumbPlaceholderDark]}>
            <Ionicons
              name="restaurant"
              size={18}
              color={isDark ? DiscoveryColors.textDim : "#9CA3AF"}
            />
          </View>
        )}
      </View>

      <View style={styles.cardBody}>
        <View style={styles.nameRow}>
          <View style={styles.dietWrap}>
            <DietIndicator type={entry.line.isVeg ? "veg" : "nonveg"} />
          </View>
          <Text
            style={[styles.itemName, isDark && styles.textDark]}
            numberOfLines={1}
            ellipsizeMode="tail"
          >
            {entry.line.name}
          </Text>
        </View>
        {variantSummary ? (
          <Text style={[styles.meta, isDark && styles.metaDark]} numberOfLines={1}>
            {variantSummary}
          </Text>
        ) : null}
        <Text style={[styles.meta, isDark && styles.metaDark]} numberOfLines={1}>
          {meta}
        </Text>
      </View>

      <TouchableOpacity
        onPress={() => onAddBack(entry)}
        disabled={restoring}
        activeOpacity={0.75}
        accessibilityRole="button"
        accessibilityLabel={`Add ${entry.line.name} back to cart`}
        accessibilityState={{ busy: restoring, disabled: restoring }}
        hitSlop={4}
        style={[
          styles.addBackBtn,
          isDark && styles.addBackBtnDark,
          restoring && styles.addBackBtnDisabled,
        ]}
      >
        {restoring ? (
          <ActivityIndicator size="small" color={MINT} />
        ) : (
          <Text style={styles.addBackText} numberOfLines={1}>
            + Add back
          </Text>
        )}
      </TouchableOpacity>

      <TouchableOpacity
        onPress={() => onDismiss(entry.entryKey)}
        hitSlop={12}
        disabled={restoring}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={`Dismiss ${entry.line.name} from recently removed`}
        style={styles.dismissBtn}
      >
        <Ionicons
          name="close"
          size={18}
          color={isDark ? DiscoveryColors.textMuted : "#9CA3AF"}
        />
      </TouchableOpacity>
    </View>
  );
});

export const RecentlyRemovedSection = memo(function RecentlyRemovedSection({
  merchantId,
  menu,
  isDark = false,
}: Props) {
  const { width: windowWidth } = useWindowDimensions();
  const [expanded, setExpanded] = useState(true);

  const allEntries = useRecentlyRemovedStore((s) => s.entries);
  const restoringKeys = useRecentlyRemovedStore((s) => s.restoringKeys);
  const dismissEntry = useRecentlyRemovedStore((s) => s.dismissEntry);
  const beginRestore = useRecentlyRemovedStore((s) => s.beginRestore);
  const endRestore = useRecentlyRemovedStore((s) => s.endRestore);
  const removeAfterSuccessfulRestore = useRecentlyRemovedStore(
    (s) => s.removeAfterSuccessfulRestore
  );

  const entries = useMemo(() => {
    if (!merchantId) return EMPTY_ENTRIES;
    const filtered = allEntries.filter((e) => e.merchantId === merchantId);
    return filtered.length === 0 ? EMPTY_ENTRIES : filtered;
  }, [allEntries, merchantId]);

  const imageByEntryKey = useMemo(() => {
    const map: Record<string, string | null> = {};
    const prefetchUris: string[] = [];
    for (const entry of entries) {
      const fromLine = entry.line.imageUrl?.trim() || null;
      const fromMenu = findMenuImage(menu, recentlyRemovedBaseMenuId(entry.line));
      const raw = fromLine || fromMenu;
      const abs = raw ? toAbsoluteImageUrl(raw) ?? raw : null;
      map[entry.entryKey] = abs;
      if (abs) prefetchUris.push(abs);
    }
    if (prefetchUris.length > 0) {
      void Image.prefetch(prefetchUris).catch(() => {});
    }
    return map;
  }, [entries, menu]);

  // Backfill missing snapshot images from menu so the next cold start paints instantly.
  useEffect(() => {
    if (!menu?.length || entries.length === 0) return;
    const store = useRecentlyRemovedStore.getState();
    let next = store.entries;
    let changed = false;
    for (const entry of entries) {
      if (entry.line.imageUrl?.trim()) continue;
      const fromMenu = findMenuImage(menu, recentlyRemovedBaseMenuId(entry.line));
      if (!fromMenu) continue;
      const abs = toAbsoluteImageUrl(fromMenu) ?? fromMenu;
      next = next.map((e) => {
        if (e.entryKey !== entry.entryKey || e.line.imageUrl?.trim()) return e;
        changed = true;
        return { ...e, line: { ...e.line, imageUrl: abs } };
      });
    }
    if (!changed) return;
    useRecentlyRemovedStore.setState({ entries: next });
    void store.persist();
  }, [entries, menu]);

  const multiCardWidth = useMemo(() => {
    const track = Math.max(280, windowWidth - 48);
    return Math.min(320, Math.max(280, Math.round(track * 0.9)));
  }, [windowWidth]);

  const handleAddBack = useCallback(
    async (entry: RecentlyRemovedEntry) => {
      if (!beginRestore(entry.entryKey)) return;
      try {
        const result = await restoreRecentlyRemovedEntry({
          entry,
          menu,
          activeMerchantId: merchantId,
        });
        if (!result.ok) {
          Alert.alert("Couldn't add back", result.message, [
            {
              text: "Dismiss item",
              style: "destructive",
              onPress: () => dismissEntry(entry.entryKey),
            },
            { text: "OK" },
          ]);
          return;
        }
        removeAfterSuccessfulRestore(entry.entryKey);
        if (result.priceChanged) {
          Alert.alert(
            "Price updated",
            `${entry.line.name} is now ${formatInr(result.currentPrice)} (was ${formatInr(result.previousPrice)}).`,
            [{ text: "OK" }]
          );
        }
      } catch {
        Alert.alert("Couldn't add back", "Something went wrong. Please try again.", [
          { text: "OK" },
        ]);
      } finally {
        endRestore(entry.entryKey);
      }
    },
    [
      beginRestore,
      dismissEntry,
      endRestore,
      menu,
      merchantId,
      removeAfterSuccessfulRestore,
    ]
  );

  if (!merchantId || entries.length === 0) return null;

  const count = entries.length;
  const useHorizontalList = count > 1;

  return (
    <View style={styles.section}>
      {/*
        Use View (not Pressable) for the row — NativeWind css-interop on Pressable
        was dropping flexDirection:"row", so icon/title/chevron stacked vertically.
        Mirrors checkout “Complete your meal with” header exactly.
      */}
      <TouchableOpacity
        onPress={() => setExpanded((v) => !v)}
        activeOpacity={0.75}
        accessibilityRole="button"
        accessibilityLabel={`${expanded ? "Collapse" : "Expand"} recently removed`}
        accessibilityState={{ expanded }}
      >
        <View style={styles.header}>
          <View style={[styles.headerIcon, isDark && styles.headerIconDark]}>
            <Ionicons
              name="time-outline"
              size={14}
              color={isDark ? DiscoveryColors.textDim : "#9CA3AF"}
            />
          </View>
          <Text style={[styles.headerTitle, isDark && styles.textDark]} numberOfLines={1}>
            {`Recently removed (${count})`}
          </Text>
          <Ionicons
            name={expanded ? "chevron-up" : "chevron-down"}
            size={16}
            color={isDark ? DiscoveryColors.textMuted : "#9CA3AF"}
          />
        </View>
      </TouchableOpacity>

      {expanded ? (
        useHorizontalList ? (
          <ScrollView
            horizontal
            nestedScrollEnabled
            directionalLockEnabled
            keyboardShouldPersistTaps="handled"
            showsHorizontalScrollIndicator={false}
            decelerationRate="fast"
            contentContainerStyle={styles.listContent}
            style={styles.list}
          >
            {entries.map((entry, index) => (
              <View
                key={entry.entryKey}
                style={index < entries.length - 1 ? { marginRight: CARD_GAP } : null}
              >
                <RecentlyRemovedCard
                  entry={entry}
                  imageUrl={imageByEntryKey[entry.entryKey] ?? null}
                  isDark={isDark}
                  restoring={!!restoringKeys[entry.entryKey]}
                  fixedWidth={multiCardWidth}
                  onAddBack={handleAddBack}
                  onDismiss={dismissEntry}
                />
              </View>
            ))}
          </ScrollView>
        ) : (
          <View style={styles.singleWrap}>
            <RecentlyRemovedCard
              entry={entries[0]!}
              imageUrl={imageByEntryKey[entries[0]!.entryKey] ?? null}
              isDark={isDark}
              restoring={!!restoringKeys[entries[0]!.entryKey]}
              onAddBack={handleAddBack}
              onDismiss={dismissEntry}
            />
          </View>
        )
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  section: {
    backgroundColor: "transparent",
    paddingTop: 12,
    paddingBottom: 10,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    width: "100%",
    paddingHorizontal: 16,
    marginBottom: 12,
    minHeight: 28,
  },
  headerIcon: {
    width: 28,
    height: 28,
    borderRadius: 6,
    backgroundColor: "#F3F4F6",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },
  headerIconDark: {
    backgroundColor: DiscoveryColors.cardElevated,
  },
  headerTitle: {
    flexGrow: 1,
    flexShrink: 1,
    fontSize: 14,
    fontWeight: "600",
    color: "#1C1C1C",
    letterSpacing: -0.2,
    marginRight: 8,
  },
  textDark: {
    color: DiscoveryColors.text,
  },
  list: {
    flexGrow: 0,
  },
  listContent: {
    paddingHorizontal: 16,
    alignItems: "center",
  },
  singleWrap: {
    paddingHorizontal: 16,
  },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minHeight: 64,
  },
  cardFluid: {
    width: "100%",
  },
  thumbWrap: {
    width: 56,
    height: 56,
    borderRadius: 10,
    overflow: "hidden",
    backgroundColor: "#F3F4F6",
    flexShrink: 0,
  },
  thumbWrapDark: {
    backgroundColor: DiscoveryColors.cardElevated,
  },
  thumb: {
    width: "100%",
    height: "100%",
  },
  thumbPlaceholder: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F3F4F6",
  },
  thumbPlaceholderDark: {
    backgroundColor: DiscoveryColors.cardElevated,
  },
  cardBody: {
    flex: 1,
    minWidth: 0,
  },
  nameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  dietWrap: {
    flexShrink: 0,
  },
  itemName: {
    flex: 1,
    minWidth: 0,
    fontSize: 14,
    fontWeight: "700",
    color: "#1A1A1A",
    lineHeight: 18,
  },
  meta: {
    marginTop: 2,
    fontSize: 12,
    fontWeight: "500",
    color: "#6B7280",
    lineHeight: 16,
  },
  metaDark: {
    color: DiscoveryColors.textMuted,
  },
  addBackBtn: {
    flexShrink: 0,
    height: 36,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: MINT,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  addBackBtnDark: {
    backgroundColor: DiscoveryColors.cardElevated,
    borderColor: MINT,
  },
  addBackBtnDisabled: {
    opacity: 0.65,
  },
  addBackText: {
    fontSize: 13,
    fontWeight: "700",
    color: MINT,
    includeFontPadding: false,
  },
  dismissBtn: {
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    marginLeft: 4,
  },
});
