/**
 * Custom order-history range: pick From / To explicitly (chip + calendar),
 * with an optional native date picker for either bound.
 * Calendar month follows the active chip (From → From month, To → To month).
 */

import { useEffect, useMemo, useState } from "react";
import { AppText as Text } from "@/components/AppText";
import {
  View,
  StyleSheet,
  Pressable,
  Platform,
  useWindowDimensions,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { GatiMitraMerchant } from "@/constants/theme";
import { applyBoundToRange, formatIstDayMonthYear } from "@/lib/orderDateRange";

let NativeDateTimePicker: React.ComponentType<any> | null = null;
try {
  NativeDateTimePicker = require("@react-native-community/datetimepicker").default;
} catch {
  NativeDateTimePicker = null;
}

const IST = "Asia/Kolkata";
const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];

type Bound = "start" | "end";

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
  }).format(
    new Date(
      `${y}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}T12:00:00+05:30`
    )
  );
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
  const month = new Intl.DateTimeFormat("en-IN", {
    month: "long",
    timeZone: IST,
  }).format(d);
  return `${month.toUpperCase()} ${y}`;
}

function clampToMaxDay(ms: number, maxEnd: number): number {
  return Math.min(ms, maxEnd);
}

type Props = {
  startMs: number | null;
  endMs: number | null;
  onChange: (startMs: number | null, endMs: number | null) => void;
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
  const todayYmd = istYmd(maxDate);
  const [viewY, setViewY] = useState(todayYmd.y);
  const [viewM, setViewM] = useState(todayYmd.m);
  const [activeBound, setActiveBound] = useState<Bound>("start");
  const [nativeBound, setNativeBound] = useState<Bound | null>(null);

  /**
   * From chip → From month; To chip → To month.
   * Empty side falls back to today so we never keep a stale prefilled month.
   * Only follows the active chip (not every day-tap) so month arrows still work.
   */
  useEffect(() => {
    const focusMs = activeBound === "start" ? startMs : endMs;
    const ymd = istYmd(new Date(focusMs != null ? Math.min(focusMs, maxEnd) : maxEnd));
    setViewY(ymd.y);
    setViewM(ymd.m);
    // Intentionally only when the active chip changes — not on every start/end update.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- month should track chip, not each day pick
  }, [activeBound]);

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

  const rangeReady = startMs != null && endMs != null;
  const lo = rangeReady ? Math.min(startMs, endMs) : null;
  const hi = rangeReady ? Math.max(startMs, endMs) : null;

  const commitDay = (y: number, m: number, day: number) => {
    const dayStart = clampToMaxDay(istDayStartMs(y, m, day), maxEnd);
    const dayEnd = clampToMaxDay(istDayEndMs(y, m, day), maxEnd);
    if (dayStart > maxEnd) return;
    const next = applyBoundToRange(activeBound, dayStart, dayEnd, startMs, endMs);
    onChange(next.startMs, next.endMs);
    setActiveBound(next.nextBound);
  };

  const onDayPress = (y: number, m: number, day: number, inMonth: boolean) => {
    if (!inMonth) return;
    if (istDayStartMs(y, m, day) > maxEnd) return;
    commitDay(y, m, day);
  };

  const selectBound = (bound: Bound) => {
    setActiveBound(bound);
  };

  const openNativeFor = (bound: Bound) => {
    setActiveBound(bound);
    if (!NativeDateTimePicker) return;
    setNativeBound(bound);
  };

  const onNativeChange = (event: { type?: string }, date?: Date) => {
    if (Platform.OS === "android") {
      setNativeBound(null);
    }
    if (event?.type === "dismissed" || !date) {
      if (Platform.OS === "ios") setNativeBound(null);
      return;
    }
    const ymd = istYmd(date);
    if (istDayStartMs(ymd.y, ymd.m, ymd.day) > maxEnd) {
      if (Platform.OS === "ios") setNativeBound(null);
      return;
    }
    const bound = nativeBound ?? activeBound;
    const dayStart = clampToMaxDay(istDayStartMs(ymd.y, ymd.m, ymd.day), maxEnd);
    const dayEnd = clampToMaxDay(istDayEndMs(ymd.y, ymd.m, ymd.day), maxEnd);
    const next = applyBoundToRange(bound, dayStart, dayEnd, startMs, endMs);
    onChange(next.startMs, next.endMs);
    setActiveBound(next.nextBound);
    if (Platform.OS === "ios") setNativeBound(null);
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
    const firstOfMonth = istDayStartMs(y, m, 1);
    if (delta > 0 && firstOfMonth > maxEnd) return;
    setViewY(y);
    setViewM(m);
  };

  const startLabel = startMs != null ? formatIstDayMonthYear(new Date(startMs)) : "Select date";
  const endLabel = endMs != null ? formatIstDayMonthYear(new Date(endMs)) : "Select date";
  // To picker must NOT default to From — that made Apply save a single-day range
  // (e.g. only 1 Feb) when the system dialog was confirmed without changing the day.
  const nativeFallback = maxDate.getTime();
  const nativeValue = new Date(
    nativeBound === "end"
      ? (endMs ?? nativeFallback)
      : (startMs ?? nativeFallback)
  );

  return (
    <View style={styles.wrap}>
      <Text style={styles.kicker}>CUSTOM RANGE</Text>
      <Text style={styles.hintTop}>
        Pehle <Text style={styles.hintEm}>From</Text> chunen, phir <Text style={styles.hintEm}>To</Text>{" "}
        — dono alag dates select karni hongi. Apply tabhi chalega.
      </Text>

      <View style={styles.boundRow}>
        <Pressable
          onPress={() => selectBound("start")}
          onLongPress={() => openNativeFor("start")}
          style={[styles.boundChip, activeBound === "start" && styles.boundChipActive]}
          accessibilityRole="button"
          accessibilityState={{ selected: activeBound === "start" }}
          accessibilityLabel={`From date ${startLabel}`}
        >
          <Text style={[styles.boundChipLabel, activeBound === "start" && styles.boundChipLabelActive]}>
            From
          </Text>
          <Text
            style={[
              styles.boundChipValue,
              activeBound === "start" && styles.boundChipValueActive,
              startMs == null && styles.boundChipPlaceholder,
              startMs == null && activeBound === "start" && styles.boundChipPlaceholderActive,
            ]}
          >
            {startLabel}
          </Text>
          {NativeDateTimePicker ? (
            <Pressable
              onPress={() => openNativeFor("start")}
              hitSlop={8}
              style={styles.boundChipIconBtn}
              accessibilityLabel="Open start date picker"
            >
              <Ionicons
                name="calendar-outline"
                size={16}
                color={activeBound === "start" ? "#FFFFFF" : GatiMitraMerchant.primary}
              />
            </Pressable>
          ) : null}
        </Pressable>

        <Ionicons name="arrow-forward" size={16} color={GatiMitraMerchant.textTertiary} />

        <Pressable
          onPress={() => selectBound("end")}
          onLongPress={() => openNativeFor("end")}
          style={[styles.boundChip, activeBound === "end" && styles.boundChipActive]}
          accessibilityRole="button"
          accessibilityState={{ selected: activeBound === "end" }}
          accessibilityLabel={`To date ${endLabel}`}
        >
          <Text style={[styles.boundChipLabel, activeBound === "end" && styles.boundChipLabelActive]}>
            To
          </Text>
          <Text
            style={[
              styles.boundChipValue,
              activeBound === "end" && styles.boundChipValueActive,
              endMs == null && styles.boundChipPlaceholder,
              endMs == null && activeBound === "end" && styles.boundChipPlaceholderActive,
            ]}
          >
            {endLabel}
          </Text>
          {NativeDateTimePicker ? (
            <Pressable
              onPress={() => openNativeFor("end")}
              hitSlop={8}
              style={styles.boundChipIconBtn}
              accessibilityLabel="Open end date picker"
            >
              <Ionicons
                name="calendar-outline"
                size={16}
                color={activeBound === "end" ? "#FFFFFF" : GatiMitraMerchant.primary}
              />
            </Pressable>
          ) : null}
        </Pressable>
      </View>

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
          const isStart = startMs != null && cellStart <= startMs && startMs <= cellEnd;
          const isEnd = endMs != null && cellStart <= endMs && endMs <= cellEnd;
          const inRange =
            rangeReady && lo != null && hi != null && cellEnd >= lo && cellStart <= hi && c.inMonth;
          const isFuture = cellStart > maxEnd;
          const disabled = !c.inMonth || isFuture;
          const sameDay = isStart && isEnd;

          return (
            <Pressable
              key={`${c.y}-${c.m}-${c.day}-${i}`}
              disabled={disabled}
              onPress={() => onDayPress(c.y, c.m, c.day, c.inMonth)}
              style={[
                styles.dayCell,
                { width: cellW, height: cellW },
                inRange && styles.dayInRange,
                isStart && (inRange || !rangeReady) && styles.dayEdgeStart,
                isEnd && (inRange || !rangeReady) && styles.dayEdgeEnd,
                sameDay && styles.dayEdgeSingle,
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

      <Text style={styles.hint}>
        {activeBound === "start"
          ? "Showing From month · tap a day to set start"
          : "Showing To month · tap a day to set end"}
      </Text>

      {nativeBound && NativeDateTimePicker ? (
        Platform.OS === "ios" ? (
          <View style={styles.iosPickerWrap}>
            <View style={styles.iosPickerHeader}>
              <Pressable onPress={() => setNativeBound(null)} hitSlop={8}>
                <Text style={styles.iosPickerAction}>Done</Text>
              </Pressable>
            </View>
            <NativeDateTimePicker
              value={nativeValue}
              mode="date"
              display="spinner"
              maximumDate={maxDate}
              onChange={onNativeChange}
            />
          </View>
        ) : (
          <NativeDateTimePicker
            value={nativeValue}
            mode="date"
            display="default"
            maximumDate={maxDate}
            onChange={onNativeChange}
          />
        )
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexGrow: 1, paddingTop: 4 },
  kicker: {
    fontSize: 11,
    fontWeight: "700",
    color: GatiMitraMerchant.primary,
    letterSpacing: 0.6,
    marginBottom: 4,
  },
  hintTop: {
    fontSize: 12,
    fontWeight: "500",
    color: GatiMitraMerchant.textSecondary,
    marginBottom: 12,
    lineHeight: 17,
  },
  hintEm: {
    fontWeight: "800",
    color: GatiMitraMerchant.textPrimary,
  },
  boundRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 14,
  },
  boundChip: {
    flex: 1,
    minWidth: 0,
    borderWidth: 1.5,
    borderColor: GatiMitraMerchant.border,
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  boundChipActive: {
    borderColor: GatiMitraMerchant.primary,
    backgroundColor: GatiMitraMerchant.primary,
  },
  boundChipLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: GatiMitraMerchant.textTertiary,
    letterSpacing: 0.4,
    textTransform: "uppercase",
    marginBottom: 2,
  },
  boundChipLabelActive: {
    color: "rgba(255,255,255,0.85)",
  },
  boundChipValue: {
    fontSize: 15,
    fontWeight: "800",
    color: GatiMitraMerchant.textPrimary,
    paddingRight: 22,
  },
  boundChipValueActive: {
    color: "#FFFFFF",
  },
  boundChipPlaceholder: {
    fontWeight: "600",
    color: GatiMitraMerchant.textTertiary,
  },
  boundChipPlaceholderActive: {
    color: "rgba(255,255,255,0.9)",
  },
  boundChipIconBtn: {
    position: "absolute",
    right: 10,
    bottom: 12,
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
  dayEdgeSingle: {
    borderRadius: 18,
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
    marginTop: 8,
    fontSize: 11,
    color: GatiMitraMerchant.textTertiary,
    textAlign: "center",
  },
  iosPickerWrap: {
    marginTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: GatiMitraMerchant.border,
  },
  iosPickerHeader: {
    alignItems: "flex-end",
    paddingHorizontal: 8,
    paddingTop: 8,
  },
  iosPickerAction: {
    fontSize: 15,
    fontWeight: "700",
    color: GatiMitraMerchant.primary,
  },
});
