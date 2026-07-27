/**
 * Inline month calendar with tap-to-select start/end range (IST day boundaries).
 */

import { useMemo, useState } from "react";
import { AppText as Text } from "@/components/AppText";
import { View, StyleSheet, Pressable, useWindowDimensions } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { GatiMitraMerchant } from "@/constants/theme";
import { formatRangeSubtitle } from "@/lib/orderDateRange";

const IST = "Asia/Kolkata";
const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];

function istYmd(d: Date): { y: number; m: number; day: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: IST,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  return {
    y: Number(parts.find((p) => p.type === "year")?.value ?? 0),
    m: Number(parts.find((p) => p.type === "month")?.value ?? 1),
    day: Number(parts.find((p) => p.type === "day")?.value ?? 1),
  };
}

function istWeekdayIndex(y: number, m: number, day: number): number {
  const wd = new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    timeZone: IST,
  }).format(new Date(`${y}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}T12:00:00+05:30`));
  const map: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  return map[wd] ?? 0;
}

function istDayStartMs(y: number, m: number, day: number): number {
  return new Date(
    `${y}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}T00:00:00+05:30`
  ).getTime();
}

function istDayEndMs(y: number, m: number, day: number): number {
  return new Date(
    `${y}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}T23:59:59.999+05:30`
  ).getTime();
}

function daysInMonth(y: number, m: number): number {
  return new Date(y, m, 0).getDate();
}

function monthLabel(y: number, m: number): string {
  const d = new Date(`${y}-${String(m).padStart(2, "0")}-15T12:00:00+05:30`);
  const month = new Intl.DateTimeFormat("en-IN", { month: "long", timeZone: IST }).format(d);
  return `${month.toUpperCase()} ${y}`;
}

type Props = {
  startMs: number;
  endMs: number;
  onChange: (startMs: number, endMs: number) => void;
  maxDate?: Date;
  /** Content width for 7-column grid (defaults to screen minus padding). */
  layoutWidth?: number;
};

export function RangeCalendarPicker({
  startMs,
  endMs,
  onChange,
  maxDate = new Date(),
  layoutWidth,
}: Props) {
  const { width: windowWidth } = useWindowDimensions();
  const gridWidth = layoutWidth ?? windowWidth - 32;
  const cellW = Math.floor(gridWidth / 7);
  const maxYmd = istYmd(maxDate);
  const maxEnd = istDayEndMs(maxYmd.y, maxYmd.m, maxYmd.day);
  const initial = istYmd(new Date(endMs));
  const [viewY, setViewY] = useState(initial.y);
  const [viewM, setViewM] = useState(initial.m);
  const [pickingEnd, setPickingEnd] = useState(false);

  const cells = useMemo(() => {
    const dim = daysInMonth(viewY, viewM);
    const pad = istWeekdayIndex(viewY, viewM, 1);
    const out: Array<{ y: number; m: number; day: number; inMonth: boolean }> = [];

    const prevM = viewM === 1 ? 12 : viewM - 1;
    const prevY = viewM === 1 ? viewY - 1 : viewY;
    const prevDim = daysInMonth(prevY, prevM);
    for (let i = pad - 1; i >= 0; i--) {
      out.push({ y: prevY, m: prevM, day: prevDim - i, inMonth: false });
    }
    for (let d = 1; d <= dim; d++) {
      out.push({ y: viewY, m: viewM, day: d, inMonth: true });
    }
    const nextM = viewM === 12 ? 1 : viewM + 1;
    const nextY = viewM === 12 ? viewY + 1 : viewY;
    let n = 1;
    while (out.length < 42) {
      out.push({ y: nextY, m: nextM, day: n++, inMonth: false });
    }
    return out;
  }, [viewY, viewM]);

  const lo = Math.min(startMs, endMs);
  const hi = Math.max(startMs, endMs);
  const rangeLabel = formatRangeSubtitle(new Date(startMs), new Date(endMs));

  const onDayPress = (y: number, m: number, day: number, inMonth: boolean) => {
    if (!inMonth) return;
    const dayStart = istDayStartMs(y, m, day);
    const dayEnd = istDayEndMs(y, m, day);
    if (dayStart > maxEnd) return;

    if (!pickingEnd) {
      onChange(dayStart, dayEnd);
      setPickingEnd(true);
      return;
    }
    onChange(Math.min(startMs, dayStart), Math.max(endMs, dayEnd));
    setPickingEnd(false);
  };

  const shiftMonth = (delta: number) => {
    let m = viewM + delta;
    let y = viewY;
    while (m < 1) {
      m += 12;
      y -= 1;
    }
    while (m > 12) {
      m -= 12;
      y += 1;
    }
    setViewY(y);
    setViewM(m);
  };

  return (
    <View style={styles.wrap}>
      <Text style={styles.kicker}>SELECT RANGE</Text>
      <Text style={styles.rangeLabel}>{rangeLabel}</Text>

      <View style={styles.monthRow}>
        <Text style={styles.monthTitle}>{monthLabel(viewY, viewM)}</Text>
        <View style={styles.monthNav}>
          <Pressable onPress={() => shiftMonth(-1)} hitSlop={8} style={styles.navBtn}>
            <Ionicons name="chevron-back" size={20} color={GatiMitraMerchant.textPrimary} />
          </Pressable>
          <Pressable onPress={() => shiftMonth(1)} hitSlop={8} style={styles.navBtn}>
            <Ionicons name="chevron-forward" size={20} color={GatiMitraMerchant.textPrimary} />
          </Pressable>
        </View>
      </View>

      <View style={styles.weekRow}>
        {WEEKDAYS.map((w, i) => (
          <Text key={`${w}-${i}`} style={[styles.weekCell, { width: cellW }]}>
            {w}
          </Text>
        ))}
      </View>

      <View style={styles.grid}>
        {cells.map((c, i) => {
          const cellStart = istDayStartMs(c.y, c.m, c.day);
          const cellEnd = istDayEndMs(c.y, c.m, c.day);
          const isStart = cellStart <= startMs && startMs <= cellEnd;
          const isEnd = cellStart <= endMs && endMs <= cellEnd;
          const inRange = cellEnd >= lo && cellStart <= hi && c.inMonth;
          const isFuture = cellStart > maxEnd;
          const disabled = !c.inMonth || isFuture;

          return (
            <Pressable
              key={`${c.y}-${c.m}-${c.day}-${i}`}
              disabled={disabled}
              onPress={() => onDayPress(c.y, c.m, c.day, c.inMonth)}
              style={[
                styles.dayCell,
                { width: cellW, height: cellW },
                inRange && styles.dayInRange,
                isStart && inRange && styles.dayEdgeStart,
                isEnd && inRange && styles.dayEdgeEnd,
              ]}
            >
              <View
                style={[
                  styles.dayInner,
                  (isStart || isEnd) && styles.dayInnerSelected,
                ]}
              >
                <Text
                  style={[
                    styles.dayText,
                    !c.inMonth && styles.dayTextMuted,
                    (isStart || isEnd) && styles.dayTextSelected,
                    disabled && styles.dayTextDisabled,
                  ]}
                >
                  {c.day}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </View>

      <Text style={styles.hint}>Tap start date, then end date</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, paddingTop: 4 },
  kicker: {
    fontSize: 11,
    fontWeight: "700",
    color: GatiMitraMerchant.primary,
    letterSpacing: 0.6,
    marginBottom: 4,
  },
  rangeLabel: {
    fontSize: 20,
    fontWeight: "800",
    color: GatiMitraMerchant.primary,
    marginBottom: 10,
  },
  monthRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  monthTitle: {
    fontSize: 13,
    fontWeight: "800",
    color: GatiMitraMerchant.textPrimary,
    letterSpacing: 0.3,
  },
  monthNav: { flexDirection: "row", gap: 2 },
  navBtn: { padding: 4 },
  weekRow: { flexDirection: "row", marginBottom: 2 },
  weekCell: {
    textAlign: "center",
    fontSize: 11,
    fontWeight: "600",
    color: GatiMitraMerchant.textTertiary,
  },
  grid: { flexDirection: "row", flexWrap: "wrap" },
  dayCell: {
    alignItems: "center",
    justifyContent: "center",
  },
  dayInRange: { backgroundColor: "#DBEAFE" },
  dayEdgeStart: {
    borderTopLeftRadius: 18,
    borderBottomLeftRadius: 18,
  },
  dayEdgeEnd: {
    borderTopRightRadius: 18,
    borderBottomRightRadius: 18,
  },
  dayInner: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
  },
  dayInnerSelected: { backgroundColor: GatiMitraMerchant.primary },
  dayText: {
    fontSize: 13,
    fontWeight: "600",
    color: GatiMitraMerchant.textPrimary,
  },
  dayTextMuted: { color: "#CBD5E1" },
  dayTextSelected: { color: "#FFFFFF", fontWeight: "800" },
  dayTextDisabled: { color: "#E2E8F0" },
  hint: {
    marginTop: 6,
    fontSize: 11,
    color: GatiMitraMerchant.textTertiary,
    textAlign: "center",
  },
});
