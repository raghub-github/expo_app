import React from "react";
import { ScrollView, Pressable, Text, View, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { IncentiveFilterChip } from "@/src/hooks/useRiderIncentives";
import { colors } from "@/src/theme";
import { POPPINS_SEMIBOLD } from "@/src/theme/headerFonts";

type Props = {
  filters: IncentiveFilterChip[];
  activeFilter: string;
  onChange: (key: string) => void;
};

function chipIcon(key: string, active: boolean): React.ComponentProps<typeof Ionicons>["name"] | null {
  const k = String(key || "").toLowerCase();
  if (k === "peak" || k.includes("peak")) return "flash";
  if (k === "surge" || k.includes("surge")) return "trending-up";
  if (k === "all") return null;
  return null;
}

function displayLabel(filter: IncentiveFilterChip): string {
  const key = String(filter.key || "").toLowerCase();
  const raw = String(filter.label || "").trim();
  if (key === "peak" || /^peak\s*inc\.?$/i.test(raw)) return "Peak";
  if (key === "surge") return "Surge";
  if (key === "all") return "All";
  if (key === "incentive") return raw || "Incentive";
  return raw || key;
}

export function IncentiveFilterChips({ filters, activeFilter, onChange }: Props) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
      {filters.map((f) => {
        const active = f.key === activeFilter;
        const icon = chipIcon(f.key, active);
        const label = displayLabel(f);
        return (
          <Pressable
            key={f.key}
            onPress={() => onChange(f.key)}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            style={[styles.chip, active && styles.chipActive]}
          >
            {icon ? (
              <Ionicons
                name={icon}
                size={13}
                color={active ? "#FFFFFF" : colors.primary[700]}
                style={styles.chipIcon}
              />
            ) : null}
            <Text style={[styles.chipText, active && styles.chipTextActive]} numberOfLines={1}>
              {label}
            </Text>
            <View style={[styles.countPill, active && styles.countPillActive]}>
              <Text style={[styles.countText, active && styles.countTextActive]}>{f.count}</Text>
            </View>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { paddingHorizontal: 16, gap: 8, paddingTop: 10, paddingBottom: 14 },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    paddingLeft: 12,
    paddingRight: 8,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.primary[200],
    backgroundColor: "#FFFFFF",
    gap: 6,
  },
  chipActive: {
    backgroundColor: colors.primary[600],
    borderColor: colors.primary[600],
  },
  chipIcon: { marginTop: 0.5 },
  chipText: {
    fontSize: 13,
    fontFamily: POPPINS_SEMIBOLD,
    fontWeight: "600",
    color: colors.primary[800],
  },
  chipTextActive: { color: "#FFFFFF" },
  countPill: {
    minWidth: 22,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: colors.primary[50],
    alignItems: "center",
    justifyContent: "center",
  },
  countPillActive: {
    backgroundColor: "rgba(255,255,255,0.22)",
  },
  countText: {
    fontSize: 11,
    fontFamily: POPPINS_SEMIBOLD,
    fontWeight: "700",
    color: colors.primary[800],
  },
  countTextActive: { color: "#FFFFFF" },
});
