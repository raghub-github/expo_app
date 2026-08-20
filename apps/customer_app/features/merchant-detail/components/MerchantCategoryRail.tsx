import React, { useCallback, useMemo } from "react";
import { AppText } from "@/components/AppText";
import {
  View,
  Pressable,
  StyleSheet,
  ScrollView,
  Platform,
} from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { CATEGORY_RAIL_WIDTH } from "../constants/layout";
import type { MerchantCategoryChip } from "../types";
import { MerchantDarkPalette, useMerchantUiDark } from "../merchantUiTheme";
import { toAbsoluteImageUrl } from "@/utils/mediaUrl";

const RAIL_BG = "#134E3A";
const RAIL_ACTIVE_TEXT = "#14532D";
const THUMB = 40;
const THUMB_DARK = 48;
const RAIL_SIDE_PAD = 8;

function absUrl(raw?: string | null): string | null {
  const t = raw?.trim();
  if (!t) return null;
  return toAbsoluteImageUrl(t) ?? t;
}

export type MerchantCategoryRailProps = {
  categories: MerchantCategoryChip[];
  activeCategoryId: string | null;
  onSelect: (chip: MerchantCategoryChip) => void;
};

export const MerchantCategoryRail = React.memo(function MerchantCategoryRail({
  categories,
  activeCategoryId,
  onSelect,
}: MerchantCategoryRailProps) {
  const dark = useMerchantUiDark();
  const handlePress = useCallback(
    (chip: MerchantCategoryChip) => () => onSelect(chip),
    [onSelect]
  );

  const items = useMemo(
    () =>
      categories
        .map((chip) => ({
          chip,
          imageUrl: absUrl(chip.imageUrl),
          isAll: chip.id === "cat-all" || chip.title.trim().toLowerCase() === "all",
        }))
        .filter((row) => !(dark && row.isAll)),
    [categories, dark]
  );

  if (items.length === 0) return null;

  const thumb = dark ? THUMB_DARK : THUMB;

  return (
    <View style={[styles.shell, dark && styles.shellDark]}>
      <ScrollView
        style={styles.scrollView}
        nestedScrollEnabled
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        delaysContentTouches={false}
        bounces={false}
        {...(Platform.OS === "android" ? { overScrollMode: "never" as const } : null)}
        contentContainerStyle={[styles.scroll, dark && styles.scrollDark]}
      >
        {items.map(({ chip, imageUrl, isAll }) => {
          const active = activeCategoryId === chip.id;
          return (
            <Pressable
              key={chip.id}
              onPress={handlePress(chip)}
              style={({ pressed }) => [
                styles.item,
                dark && styles.itemDark,
                !dark && active && styles.itemActive,
                pressed && !active && styles.itemPressed,
              ]}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              accessibilityLabel={chip.title}
            >
              <View style={dark ? styles.thumbWrapDark : undefined}>
                <View
                  style={
                    dark
                      ? [
                          styles.thumbBoxDark,
                          { width: thumb, height: thumb, borderRadius: thumb / 2 },
                        ]
                      : [
                          styles.thumbRing,
                          { width: thumb + 6, height: thumb + 6, borderRadius: (thumb + 6) / 2 },
                          active && styles.thumbRingActive,
                        ]
                  }
                >
                  {imageUrl && !isAll ? (
                    <Image
                      source={{ uri: imageUrl }}
                      style={{ width: thumb, height: thumb, borderRadius: thumb / 2 }}
                      contentFit="cover"
                      cachePolicy="memory-disk"
                      recyclingKey={chip.id}
                      allowDownscaling
                      transition={0}
                    />
                  ) : (
                    <View
                      style={[
                        styles.thumbFallback,
                        { width: thumb, height: thumb, borderRadius: thumb / 2 },
                        dark && styles.thumbFallbackDark,
                        !dark && active && styles.thumbFallbackActive,
                      ]}
                    >
                      <Ionicons
                        name={isAll ? "grid" : "restaurant"}
                        size={18}
                        color={
                          active
                            ? dark
                              ? MerchantDarkPalette.accent
                              : RAIL_ACTIVE_TEXT
                            : dark
                              ? MerchantDarkPalette.textMuted
                              : "#FFFFFF"
                        }
                      />
                    </View>
                  )}
                  {dark && active ? (
                    <View
                      pointerEvents="none"
                      style={[
                        styles.thumbActiveRing,
                        { borderRadius: thumb / 2 },
                      ]}
                    />
                  ) : null}
                </View>
              </View>
              <View style={dark ? styles.labelBoxDark : styles.labelBox}>
                <AppText
                  style={[
                    styles.label,
                    dark && styles.labelDark,
                    active && (dark ? styles.labelActiveDark : styles.labelActive),
                  ]}
                  numberOfLines={2}
                  ellipsizeMode="tail"
                >
                  {chip.title}
                </AppText>
              </View>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
});

const styles = StyleSheet.create({
  shell: {
    width: CATEGORY_RAIL_WIDTH,
    flex: 1,
    height: "100%",
    minHeight: 0,
    backgroundColor: RAIL_BG,
    borderTopRightRadius: 22,
    borderBottomRightRadius: 22,
    overflow: "hidden",
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 2, height: 0 },
        shadowOpacity: 0.12,
        shadowRadius: 6,
      },
      android: { elevation: 4 },
      default: {},
    }),
  },
  shellDark: {
    backgroundColor: MerchantDarkPalette.bg,
    borderTopRightRadius: 0,
    borderBottomRightRadius: 0,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: MerchantDarkPalette.border,
    elevation: 0,
    shadowOpacity: 0,
  },
  scrollView: {
    flex: 1,
  },
  scroll: {
    paddingVertical: 10,
    paddingLeft: 12,
    paddingRight: 8,
    gap: 4,
  },
  scrollDark: {
    paddingTop: 12,
    paddingBottom: 20,
    paddingHorizontal: RAIL_SIDE_PAD,
    gap: 12,
    alignItems: "stretch",
  },
  item: {
    alignItems: "center",
    justifyContent: "flex-start",
    paddingVertical: 8,
    paddingHorizontal: 2,
    borderRadius: 16,
    gap: 6,
  },
  itemDark: {
    width: "100%",
    backgroundColor: "transparent",
    borderRadius: 0,
    alignItems: "center",
    paddingVertical: 2,
    paddingHorizontal: 0,
    gap: 6,
  },
  itemActive: {
    backgroundColor: "rgba(255,255,255,0.16)",
  },
  itemPressed: {
    opacity: 0.78,
  },
  thumbRing: {
    padding: 2,
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.22)",
    overflow: "hidden",
    backgroundColor: "rgba(0,0,0,0.18)",
    alignItems: "center",
    justifyContent: "center",
  },
  thumbPlain: {
    overflow: "hidden",
    backgroundColor: "transparent",
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "center",
  },
  thumbBoxDark: {
    overflow: "hidden",
    alignSelf: "center",
    backgroundColor: MerchantDarkPalette.elevated,
  },
  thumbActiveRing: {
    ...StyleSheet.absoluteFillObject,
    borderWidth: 2,
    borderColor: MerchantDarkPalette.accent,
    backgroundColor: "transparent",
  },
  thumbRingActive: {
    borderColor: "#FFFFFF",
    backgroundColor: "#FFFFFF",
  },
  thumbFallback: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.12)",
  },
  thumbFallbackDark: {
    backgroundColor: "transparent",
  },
  thumbFallbackActive: {
    backgroundColor: "transparent",
  },
  labelBox: {
    width: "100%",
    alignItems: "center",
  },
  thumbWrapDark: {
    width: "100%",
    alignItems: "center",
    justifyContent: "center",
  },
  labelBoxDark: {
    width: "100%",
    alignItems: "center",
    justifyContent: "flex-start",
    paddingHorizontal: 0,
    minHeight: 26,
  },
  label: {
    fontSize: 9,
    fontWeight: "800",
    color: "#F8FAF9",
    textAlign: "center",
    lineHeight: 11,
    width: "100%",
    letterSpacing: 0.1,
  },
  labelDark: {
    width: "100%",
    color: MerchantDarkPalette.textMuted,
    fontSize: 10,
    lineHeight: 13,
    fontWeight: "700",
    textAlign: "center",
    includeFontPadding: false,
    paddingHorizontal: 0,
  },
  labelActive: {
    color: "#FFFFFF",
  },
  labelActiveDark: {
    color: MerchantDarkPalette.accent,
  },
});
