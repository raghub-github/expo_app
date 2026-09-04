/**
 * Near Me filters — two-pane bottom sheet, flush to the device bottom edge.
 * Options are driven by nearby merchants (no hardcoded cities/cuisines).
 */

import { useEffect, useMemo, useState } from "react";
import { View, ScrollView, TouchableOpacity, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { AppText } from "@/components/AppText";
import { StoreBottomSheetShell } from "@/components/store/StoreBottomSheetShell";
import { GatiMitraColors } from "@/constants/gatimitra";
import type { MerchantSummary } from "@/services/merchant.service";
import { formatCardOfferLine } from "@/lib/merchantOfferBadge";

const MINT = GatiMitraColors.splashMint;
const TEXT = "#111827";
const MUTED = "#6B7280";
const SIDEBAR_BG = "#F4F5F4";
const SIDEBAR_W = 128;

export type NearMeFilterPane =
  | "distance"
  | "save"
  | "rating"
  | "brands"
  | "cuisines"
  | "localities"
  | "events"
  | "more";

export type NearMeFilters = {
  maxDistanceKm: number | null;
  minSavePct: number | null;
  minRating: number | null;
  topBrandsOnly: boolean;
  cuisines: string[];
  localities: string[];
  eventOpen: boolean;
  eventRush: boolean;
  openNow: boolean;
  nearFast: boolean;
  hasOffers: boolean;
  pureVeg: boolean;
};

export const DEFAULT_NEAR_ME_FILTERS: NearMeFilters = {
  maxDistanceKm: null,
  minSavePct: null,
  minRating: null,
  topBrandsOnly: false,
  cuisines: [],
  localities: [],
  eventOpen: false,
  eventRush: false,
  openNow: false,
  nearFast: false,
  hasOffers: false,
  pureVeg: false,
};

const PANES: { id: NearMeFilterPane; label: string }[] = [
  { id: "distance", label: "Distance" },
  { id: "save", label: "Save %" },
  { id: "rating", label: "Rating" },
  { id: "brands", label: "Top Brands" },
  { id: "cuisines", label: "Cuisines" },
  { id: "localities", label: "Localities" },
  { id: "events", label: "Events" },
  { id: "more", label: "More Filters" },
];

const DISTANCE_OPTS: { label: string; value: number | null }[] = [
  { label: "Any distance", value: null },
  { label: "Within 1 km", value: 1 },
  { label: "Within 3 km", value: 3 },
  { label: "Within 5 km", value: 5 },
  { label: "Within 10 km", value: 10 },
];

const SAVE_OPTS: { label: string; value: number | null }[] = [
  { label: "Any offer", value: null },
  { label: "10% or more", value: 10 },
  { label: "20% or more", value: 20 },
  { label: "30% or more", value: 30 },
];

const RATING_OPTS: { label: string; value: number | null }[] = [
  { label: "Any rating", value: null },
  { label: "3.5+", value: 3.5 },
  { label: "4.0+", value: 4 },
  { label: "4.5+", value: 4.5 },
];

export function merchantPassesNearMeFilters(
  m: MerchantSummary,
  f: NearMeFilters
): boolean {
  if (f.maxDistanceKm != null) {
    if (m.distanceKm == null || !Number.isFinite(m.distanceKm) || m.distanceKm > f.maxDistanceKm) {
      return false;
    }
  }
  if (f.minSavePct != null) {
    const pct = parseOfferSavePercent(m.offerText);
    if (pct == null || pct < f.minSavePct) return false;
  }
  if (f.minRating != null) {
    if (m.avgRating == null || Number(m.avgRating) < f.minRating) return false;
  }
  if (f.localities.length > 0) {
    const loc = m.cuisines?.[0]?.trim();
    if (!loc || !f.localities.some((l) => l.toLowerCase() === loc.toLowerCase())) return false;
  }
  if (f.eventRush && m.rushActive !== true) return false;
  if (f.pureVeg && m.isPureVeg !== true) return false;
  return true;
}

export function parseOfferSavePercent(offerText: string | null | undefined): number | null {
  const line = formatCardOfferLine(offerText);
  if (!line) return null;
  const m = line.match(/(\d+)\s*%/);
  if (!m?.[1]) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function countNearMeFilters(f: NearMeFilters): number {
  let n = 0;
  if (f.maxDistanceKm != null) n += 1;
  if (f.minSavePct != null) n += 1;
  if (f.minRating != null) n += 1;
  if (f.topBrandsOnly) n += 1;
  n += f.cuisines.length;
  n += f.localities.length;
  if (f.eventOpen) n += 1;
  if (f.eventRush) n += 1;
  if (f.openNow) n += 1;
  if (f.nearFast) n += 1;
  if (f.hasOffers) n += 1;
  if (f.pureVeg) n += 1;
  return n;
}

function RadioRow({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity style={styles.optionRow} onPress={onPress} activeOpacity={0.8}>
      <View style={[styles.radio, selected && styles.radioOn]}>
        {selected ? <View style={styles.radioDot} /> : null}
      </View>
      <AppText style={[styles.optionLabel, selected && styles.optionLabelOn]}>{label}</AppText>
    </TouchableOpacity>
  );
}

function CheckRow({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity style={styles.optionRow} onPress={onPress} activeOpacity={0.8}>
      <View style={[styles.check, selected && styles.checkOn]}>
        {selected ? <Ionicons name="checkmark" size={13} color="#fff" /> : null}
      </View>
      <AppText style={[styles.optionLabel, selected && styles.optionLabelOn]}>{label}</AppText>
    </TouchableOpacity>
  );
}

function toggleIn(list: string[], value: string): string[] {
  return list.includes(value) ? list.filter((x) => x !== value) : [...list, value];
}

type Props = {
  visible: boolean;
  onClose: () => void;
  filters: NearMeFilters;
  onApply: (next: NearMeFilters) => void;
  merchants: MerchantSummary[];
  matchCount: (draft: NearMeFilters) => number;
};

export function NearMeFilterSheet({
  visible,
  onClose,
  filters,
  onApply,
  merchants,
  matchCount,
}: Props) {
  const insets = useSafeAreaInsets();
  const [pane, setPane] = useState<NearMeFilterPane>("distance");
  const [draft, setDraft] = useState<NearMeFilters>(filters);

  useEffect(() => {
    if (visible) {
      setDraft(filters);
      setPane("distance");
    }
  }, [visible, filters]);

  const cuisineOptions = useMemo(() => {
    const set = new Set<string>();
    for (const m of merchants) {
      for (const c of m.cuisines ?? []) {
        const t = c.trim();
        if (t) set.add(t);
      }
    }
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [merchants]);

  const localityOptions = useMemo(() => {
    const set = new Set<string>();
    for (const m of merchants) {
      const loc = m.cuisines?.[0]?.trim();
      if (loc) set.add(loc);
    }
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [merchants]);

  const matches = matchCount(draft);
  const activeCount = countNearMeFilters(draft);

  const paneHasValue = (id: NearMeFilterPane): boolean => {
    if (id === "distance") return draft.maxDistanceKm != null;
    if (id === "save") return draft.minSavePct != null;
    if (id === "rating") return draft.minRating != null;
    if (id === "brands") return draft.topBrandsOnly;
    if (id === "cuisines") return draft.cuisines.length > 0;
    if (id === "localities") return draft.localities.length > 0;
    if (id === "events") return draft.eventOpen || draft.eventRush;
    return draft.openNow || draft.nearFast || draft.hasOffers || draft.pureVeg;
  };

  const body = (() => {
    if (pane === "distance") {
      return DISTANCE_OPTS.map((o) => (
        <RadioRow
          key={String(o.value)}
          label={o.label}
          selected={draft.maxDistanceKm === o.value}
          onPress={() => setDraft((d) => ({ ...d, maxDistanceKm: o.value }))}
        />
      ));
    }
    if (pane === "save") {
      return SAVE_OPTS.map((o) => (
        <RadioRow
          key={String(o.value)}
          label={o.label}
          selected={draft.minSavePct === o.value}
          onPress={() => setDraft((d) => ({ ...d, minSavePct: o.value }))}
        />
      ));
    }
    if (pane === "rating") {
      return RATING_OPTS.map((o) => (
        <RadioRow
          key={String(o.value)}
          label={o.label}
          selected={draft.minRating === o.value}
          onPress={() => setDraft((d) => ({ ...d, minRating: o.value }))}
        />
      ));
    }
    if (pane === "brands") {
      return (
        <>
          <RadioRow
            label="All stores"
            selected={!draft.topBrandsOnly}
            onPress={() => setDraft((d) => ({ ...d, topBrandsOnly: false }))}
          />
          <RadioRow
            label="Top brands only"
            selected={draft.topBrandsOnly}
            onPress={() => setDraft((d) => ({ ...d, topBrandsOnly: true }))}
          />
        </>
      );
    }
    if (pane === "cuisines") {
      if (cuisineOptions.length === 0) {
        return <AppText style={styles.emptyPane}>No cuisines in nearby stores yet.</AppText>;
      }
      return cuisineOptions.map((c) => (
        <CheckRow
          key={c}
          label={c}
          selected={draft.cuisines.includes(c)}
          onPress={() => setDraft((d) => ({ ...d, cuisines: toggleIn(d.cuisines, c) }))}
        />
      ));
    }
    if (pane === "localities") {
      if (localityOptions.length === 0) {
        return (
          <AppText style={styles.emptyPane}>
            Stores near your pin don’t have locality tags yet.
          </AppText>
        );
      }
      return localityOptions.map((c) => (
        <CheckRow
          key={c}
          label={c}
          selected={draft.localities.includes(c)}
          onPress={() => setDraft((d) => ({ ...d, localities: toggleIn(d.localities, c) }))}
        />
      ));
    }
    if (pane === "events") {
      return (
        <>
          <CheckRow
            label="Open now"
            selected={draft.eventOpen}
            onPress={() => setDraft((d) => ({ ...d, eventOpen: !d.eventOpen }))}
          />
          <CheckRow
            label="Kitchen rush"
            selected={draft.eventRush}
            onPress={() => setDraft((d) => ({ ...d, eventRush: !d.eventRush }))}
          />
        </>
      );
    }
    return (
      <>
        <CheckRow
          label="Open now"
          selected={draft.openNow}
          onPress={() => setDraft((d) => ({ ...d, openNow: !d.openNow }))}
        />
        <CheckRow
          label="Near & fast"
          selected={draft.nearFast}
          onPress={() => setDraft((d) => ({ ...d, nearFast: !d.nearFast }))}
        />
        <CheckRow
          label="Offers"
          selected={draft.hasOffers}
          onPress={() => setDraft((d) => ({ ...d, hasOffers: !d.hasOffers }))}
        />
        <CheckRow
          label="Pure veg"
          selected={draft.pureVeg}
          onPress={() => setDraft((d) => ({ ...d, pureVeg: !d.pureVeg }))}
        />
      </>
    );
  })();

  return (
    <StoreBottomSheetShell
      visible={visible}
      onClose={onClose}
      maxHeightRatio={0.92}
      flushBottom
      sheetStyle={styles.sheet}
    >
      <AppText style={styles.heading}>Category Filters</AppText>

      <View style={styles.split}>
        <ScrollView
          style={styles.sidebar}
          contentContainerStyle={styles.sidebarContent}
          showsVerticalScrollIndicator={false}
        >
          {PANES.map((p) => {
            const active = pane === p.id;
            const marked = paneHasValue(p.id);
            return (
              <TouchableOpacity
                key={p.id}
                style={[styles.navItem, active && styles.navItemOn]}
                onPress={() => setPane(p.id)}
                activeOpacity={0.85}
              >
                <AppText style={[styles.navText, active && styles.navTextOn]} numberOfLines={1}>
                  {p.label}
                </AppText>
                {marked ? <View style={styles.navDot} /> : null}
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        <ScrollView
          style={styles.pane}
          contentContainerStyle={styles.paneContent}
          showsVerticalScrollIndicator={false}
        >
          {body}
        </ScrollView>
      </View>

      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 10) }]}>
        <TouchableOpacity
          onPress={() => setDraft({ ...DEFAULT_NEAR_ME_FILTERS })}
          hitSlop={8}
        >
          <AppText style={styles.clear}>Clear all</AppText>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.apply}
          onPress={() => {
            onApply(draft);
            onClose();
          }}
          activeOpacity={0.9}
        >
          <AppText style={styles.applyText}>
            {matches > 0 ? `Show ${matches}` : "Show stores"}
            {activeCount > 0 ? ` · ${activeCount}` : ""}
          </AppText>
        </TouchableOpacity>
      </View>
    </StoreBottomSheetShell>
  );
}

const styles = StyleSheet.create({
  sheet: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    minHeight: 460,
  },
  heading: {
    fontSize: 16,
    fontWeight: "800",
    color: MINT,
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 12,
    letterSpacing: 0.2,
  },
  split: {
    flexDirection: "row",
    flexGrow: 1,
    flexShrink: 1,
    minHeight: 320,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#E5E7EB",
  },
  sidebar: {
    width: SIDEBAR_W,
    backgroundColor: SIDEBAR_BG,
  },
  sidebarContent: {
    paddingVertical: 6,
  },
  navItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderLeftWidth: 3,
    borderLeftColor: "transparent",
  },
  navItemOn: {
    backgroundColor: "#FFFFFF",
    borderLeftColor: MINT,
  },
  navText: {
    fontSize: 13,
    fontWeight: "600",
    color: MUTED,
    flex: 1,
  },
  navTextOn: {
    color: TEXT,
    fontWeight: "800",
  },
  navDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: MINT,
    marginLeft: 6,
  },
  pane: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
  paneContent: {
    paddingVertical: 8,
    paddingBottom: 16,
  },
  optionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 13,
    paddingHorizontal: 16,
  },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: "#D1D5DB",
    alignItems: "center",
    justifyContent: "center",
  },
  radioOn: {
    borderColor: MINT,
  },
  radioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: MINT,
  },
  check: {
    width: 20,
    height: 20,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: "#D1D5DB",
    alignItems: "center",
    justifyContent: "center",
  },
  checkOn: {
    backgroundColor: MINT,
    borderColor: MINT,
  },
  optionLabel: {
    flex: 1,
    fontSize: 14,
    fontWeight: "600",
    color: TEXT,
  },
  optionLabelOn: {
    color: TEXT,
  },
  emptyPane: {
    paddingHorizontal: 18,
    paddingTop: 20,
    fontSize: 13,
    lineHeight: 19,
    color: MUTED,
  },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#E5E7EB",
    gap: 12,
    backgroundColor: "#FFFFFF",
  },
  clear: {
    fontSize: 14,
    fontWeight: "700",
    color: "#DC2626",
    paddingRight: 8,
  },
  apply: {
    flex: 1,
    backgroundColor: MINT,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
  },
  applyText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "800",
  },
});
