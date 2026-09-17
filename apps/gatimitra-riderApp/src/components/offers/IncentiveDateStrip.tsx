import React, { useMemo } from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { buildCurrentWeekDates, formatStripDay, todayIst } from "@/src/hooks/useRiderIncentives";
import { colors } from "@/src/theme";
import { LORA_BOLD, POPPINS_BOLD, POPPINS_SEMIBOLD } from "@/src/theme/headerFonts";

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

export function IncentiveDateStrip({
  selectedDate,
  onSelectDate,
  dateBadges,
  specialDates,
  weekAnchor,
}: Props) {
  const { t } = useTranslation();
  const today = weekAnchor ?? todayIst();
  const dates = useMemo(() => buildCurrentWeekDates(today), [today]);

  const showBadges = useMemo(() => {
    if (specialDates && specialDates.size > 0) return true;
    if (!dateBadges) return false;
    return Object.values(dateBadges).some((v) => Boolean(String(v || "").trim()));
  }, [dateBadges, specialDates]);

  return (
    <View style={styles.shell}>
      <View style={styles.row}>
        {dates.map((dateStr) => {
          const { dow, day, isToday } = formatStripDay(dateStr, today);
          const selected = dateStr === selectedDate;
          const badgeLabel =
            dateBadges?.[dateStr] ??
            (specialDates?.has(dateStr) ? t("offers.special", "Special") : null);
          const label = isToday ? t("offers.today", "Today") : dow;

          return (
            <Pressable
              key={dateStr}
              onPress={() => onSelectDate(dateStr)}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              accessibilityLabel={`${label} ${day}`}
              style={[styles.item, selected && styles.itemSelected]}
            >
              {showBadges ? (
                badgeLabel ? (
                  <View style={styles.specialBadge}>
                    <Ionicons name="star" size={7} color={colors.primary[700]} />
                    <Text style={styles.specialText} numberOfLines={1}>
                      {badgeLabel}
                    </Text>
                  </View>
                ) : (
                  <View style={styles.specialSpacer} />
                )
              ) : null}
              <Text
                style={[styles.dow, selected && styles.dowSelected]}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.7}
              >
                {label}
              </Text>
              <Text style={[styles.day, selected && styles.daySelected]} numberOfLines={1}>
                {day}
              </Text>
              <View style={[styles.dot, selected ? styles.dotSelected : styles.dotIdle]} />
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    marginHorizontal: 16,
    marginTop: 2,
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.primary[100],
    overflow: "hidden",
  },
  row: {
    flexDirection: "row",
    alignItems: "stretch",
    paddingHorizontal: 4,
    paddingVertical: 4,
  },
  item: {
    flex: 1,
    minWidth: 0,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 2,
    paddingVertical: 4,
    borderRadius: 8,
  },
  itemSelected: {
    backgroundColor: colors.primary[50],
  },
  specialBadge: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
    backgroundColor: colors.primary[100],
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 999,
    marginBottom: 2,
    maxWidth: "100%",
  },
  specialText: {
    fontSize: 8,
    fontFamily: POPPINS_SEMIBOLD,
    fontWeight: "700",
    color: colors.primary[800],
    flexShrink: 1,
  },
  specialSpacer: { height: 12, marginBottom: 2 },
  dow: {
    fontSize: 10,
    lineHeight: 12,
    fontFamily: LORA_BOLD,
    fontWeight: "700",
    color: "#94A3B8",
    textAlign: "center",
    includeFontPadding: false,
  },
  dowSelected: { color: colors.primary[800] },
  day: {
    marginTop: 1,
    fontSize: 14,
    lineHeight: 17,
    fontFamily: POPPINS_BOLD,
    fontWeight: "800",
    color: "#64748B",
    textAlign: "center",
    includeFontPadding: false,
  },
  daySelected: { color: colors.primary[900] },
  dot: {
    marginTop: 3,
    height: 2,
    width: 12,
    borderRadius: 999,
  },
  dotSelected: { backgroundColor: colors.primary[500] },
  dotIdle: { backgroundColor: "transparent" },
});
