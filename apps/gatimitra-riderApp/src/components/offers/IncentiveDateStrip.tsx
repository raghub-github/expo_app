import React, { useEffect, useMemo, useRef } from "react";
import { ScrollView, View, Text, Pressable, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { buildCurrentWeekDates, formatStripDay, todayIst } from "@/src/hooks/useRiderIncentives";

type Props = {
  selectedDate: string;
  onSelectDate: (date: string) => void;
  /** date (YYYY-MM-DD) → badge label from API */
  dateBadges?: Record<string, string>;
  /** @deprecated use dateBadges */
  specialDates?: Set<string>;
  /** Refreshes when screen refocuses so the strip rolls to the current IST week. */
  weekAnchor?: string;
};

const ITEM_WIDTH = 52;

export function IncentiveDateStrip({
  selectedDate,
  onSelectDate,
  dateBadges,
  specialDates,
  weekAnchor,
}: Props) {
  const { t } = useTranslation();
  const scrollRef = useRef<ScrollView>(null);
  const today = weekAnchor ?? todayIst();
  const dates = useMemo(() => buildCurrentWeekDates(today), [today]);

  useEffect(() => {
    const idx = dates.indexOf(selectedDate);
    if (idx >= 0) {
      scrollRef.current?.scrollTo({ x: Math.max(0, idx * ITEM_WIDTH - 80), animated: true });
    }
  }, [dates, selectedDate]);

  return (
    <ScrollView
      ref={scrollRef}
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
    >
      {dates.map((dateStr) => {
        const { dow, day, isToday } = formatStripDay(dateStr, today);
        const selected = dateStr === selectedDate;
        const badgeLabel = dateBadges?.[dateStr] ?? (specialDates?.has(dateStr) ? t("offers.special", "Special") : null);

        return (
          <Pressable key={dateStr} onPress={() => onSelectDate(dateStr)} style={styles.item}>
            {badgeLabel ? (
              <View style={styles.specialBadge}>
                <Ionicons name="star" size={8} color="#7C3AED" style={styles.starIcon} />
                <Text style={styles.specialText}>{badgeLabel}</Text>
              </View>
            ) : (
              <View style={styles.specialSpacer} />
            )}
            <Text style={[styles.dow, selected && styles.dowSelected]}>
              {isToday ? t("offers.today", "Today") : dow}
            </Text>
            <Text style={[styles.day, selected && styles.daySelected]}>{day}</Text>
            {selected ? <View style={styles.underline} /> : <View style={styles.underlineSpacer} />}
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { paddingHorizontal: 16, gap: 8, paddingBottom: 4 },
  item: { alignItems: "center", minWidth: ITEM_WIDTH, paddingHorizontal: 2 },
  specialBadge: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
    backgroundColor: "#F3E8FF",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    marginBottom: 4,
    alignSelf: "center",
  },
  starIcon: { flexShrink: 0 },
  specialText: { fontSize: 9, fontWeight: "700", color: "#7C3AED", flexShrink: 0 },
  specialSpacer: { height: 20 },
  dow: { fontSize: 12, color: "#9CA3AF", fontWeight: "600" },
  dowSelected: { color: "#111827" },
  day: { fontSize: 15, fontWeight: "700", color: "#6B7280", marginTop: 2 },
  daySelected: { color: "#111827" },
  underline: { marginTop: 6, height: 3, width: 28, borderRadius: 999, backgroundColor: "#EF4444" },
  underlineSpacer: { marginTop: 6, height: 3, width: 28 },
});
