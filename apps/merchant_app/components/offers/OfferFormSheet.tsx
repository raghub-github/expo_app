import { useEffect, useState, useMemo, useRef } from "react";
import { AppText as Text } from "@/components/AppText";
import { View, StyleSheet, ScrollView, Pressable, ActivityIndicator, TextInput, Modal, KeyboardAvoidingView, Platform, PanResponder, LayoutChangeEvent } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { GatiMitraMerchant } from "@/constants/theme";
import type { MenuCategory, MenuItemRow } from "@/services/menuApi";
import {
  OFFER_NAV_STEPS,
  WIZARD_STEPS,
  canProceedFromStep,
  nextStepBlockedReason,
  buildMerchantReviewSummary,
  buildReviewRows,
  computeAutoPriority,
  todayYmd,
  plusDaysYmd,
  type OfferFormValues,
  type OfferWizardStep,
} from "@/lib/offers/offer-form";
import { resolveMenuItemSelection } from "@/lib/offers/offer-utils";
import {
  OFFER_PROMO_CHOICES,
  RECOMMENDED_PERCENTAGE_OFFERS,
  RECOMMENDED_BOGO_OFFERS,
  DISCOUNT_SLIDER_MIN,
  DISCOUNT_SLIDER_MAX,
  DISCOUNT_SLIDER_STEP,
  BOOST_SLIDER_MAX,
  BOOST_SLIDER_STEP,
  BOOST_POPULAR_PERCENT,
} from "@/lib/offers/offer-form-constants";
import { OFFERS_UI } from "./offers-theme";
import { ItemVegMark } from "@/components/order/ItemVegMark";

let NativeDateTimePicker: React.ComponentType<any> | null = null;
try {
  NativeDateTimePicker = require("@react-native-community/datetimepicker").default;
} catch {
  NativeDateTimePicker = null;
}

const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function formatDayMonth(ymd: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd.trim());
  if (!m) return ymd || "Select date";
  const day = Number(m[3]);
  const month = Number(m[2]) - 1;
  if (!Number.isFinite(day) || month < 0 || month > 11) return ymd;
  return `${day} ${MONTH_SHORT[month]}`;
}

function parseYmdToDate(ymd: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd.trim());
  if (!m) return new Date();
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

function formatInrPrice(n: number): string {
  if (!Number.isFinite(n) || n < 0) return "₹0";
  const rounded = Math.round(n * 10) / 10;
  return `₹${Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1)}`;
}

function priceAfterPercentOffer(
  price: number,
  pct: number,
  maxCap: number | null
): number {
  if (!(price > 0) || !(pct > 0)) return price;
  let off = (price * pct) / 100;
  if (maxCap != null && maxCap > 0) off = Math.min(off, maxCap);
  return Math.max(0, Math.round((price - off) * 100) / 100);
}

/** Stable pseudo-random sample so preview doesn't flicker every render. */
function pickPreviewItems<T extends { item_id: string }>(items: T[], count: number): T[] {
  if (items.length <= count) return items;
  const arr = [...items];
  let seed = 0;
  for (const it of arr) {
    for (let i = 0; i < it.item_id.length; i++) {
      seed = (seed * 31 + it.item_id.charCodeAt(i)) >>> 0;
    }
  }
  const next = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 0xffffffff;
  };
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    const tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
  }
  return arr.slice(0, count);
}

export type OfferFormSheetProps = {
  visible: boolean;
  editing: boolean;
  /** When true (create with a preset type), skip the choose step. */
  skipChoose?: boolean;
  saving: boolean;
  uploadingImage: boolean;
  values: OfferFormValues;
  onChange: (patch: Partial<OfferFormValues>) => void;
  menuItems: MenuItemRow[];
  menuCategories?: MenuCategory[];
  menuLoading: boolean;
  menuSearch: string;
  onMenuSearchChange: (q: string) => void;
  onToggleMenuItem: (itemId: string) => void;
  isMenuItemDisabled?: (item: MenuItemRow) => boolean;
  onPickImage: () => void;
  onSave: () => void;
  onClose: () => void;
};

function DiscountTrackSlider({
  value,
  onChange,
}: {
  value: number;
  onChange: (n: number) => void;
}) {
  const widthRef = useRef(0);
  const clamp = (n: number) => {
    const stepped =
      Math.round(n / DISCOUNT_SLIDER_STEP) * DISCOUNT_SLIDER_STEP;
    return Math.min(DISCOUNT_SLIDER_MAX, Math.max(DISCOUNT_SLIDER_MIN, stepped));
  };
  const display = value > 0 ? clamp(value) : 0;
  const fillPct =
    display <= 0 ? 0 : (display / DISCOUNT_SLIDER_MAX) * 100;
  const isMin = display > 0 && display <= DISCOUNT_SLIDER_MIN;
  const accent = display <= 0 ? "#D1D5DB" : isMin ? "#EF4444" : "#22C55E";

  const setFromX = (x: number) => {
    const w = widthRef.current || 1;
    const ratio = Math.min(1, Math.max(0, x / w));
    const raw = ratio * DISCOUNT_SLIDER_MAX;
    onChange(clamp(raw));
  };

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (e) => setFromX(e.nativeEvent.locationX),
      onPanResponderMove: (e) => setFromX(e.nativeEvent.locationX),
    })
  ).current;

  const onLayout = (e: LayoutChangeEvent) => {
    widthRef.current = e.nativeEvent.layout.width;
  };

  return (
    <View style={styles.sliderWrap}>
      <Text style={styles.label}>Discount percentage</Text>
      {display > 0 ? (
        <View style={[styles.sliderBubble, { left: `${Math.min(92, Math.max(8, fillPct))}%` as `${number}%` }]}>
          <View style={[styles.sliderBubbleInner, { backgroundColor: accent }]}>
            <Text style={styles.sliderBubbleText}>{display}%</Text>
          </View>
        </View>
      ) : null}
      <View
        style={styles.sliderTrack}
        onLayout={onLayout}
        {...pan.panHandlers}
      >
        <View
          style={[
            styles.sliderFill,
            {
              width: `${fillPct}%` as `${number}%`,
              backgroundColor: accent,
            },
          ]}
        />
        <View
          style={[
            styles.sliderThumb,
            {
              left: `${fillPct}%` as `${number}%`,
              backgroundColor: display <= 0 ? "#9CA3AF" : accent,
            },
          ]}
        />
      </View>
      <View style={styles.sliderTicks}>
        {[0, 10, 20, 30, 40, 50, 60, 70, 80].map((t) => (
          <Text
            key={t}
            style={[styles.sliderTick, t > 0 && t < DISCOUNT_SLIDER_MIN && { color: "#D1D5DB" }]}
          >
            {t}
          </Text>
        ))}
      </View>
      <Text style={styles.hintMuted}>
        After selecting, minimum discount is {DISCOUNT_SLIDER_MIN}%
      </Text>
    </View>
  );
}

/** Boost mode: 0–70% slider with Popular marker (matches partnersite). */
function BoostDiscountSlider({
  value,
  onChange,
}: {
  value: number;
  onChange: (n: number) => void;
}) {
  const trackRef = useRef<View>(null);
  const trackX = useRef(0);
  const trackW = useRef(1);
  const clamp = (n: number) => {
    const stepped = Math.round(n / BOOST_SLIDER_STEP) * BOOST_SLIDER_STEP;
    return Math.min(BOOST_SLIDER_MAX, Math.max(0, stepped));
  };
  const display = value > 0 ? clamp(value) : 0;
  const fillPct = display <= 0 ? 0 : (display / BOOST_SLIDER_MAX) * 100;
  const isMin = display > 0 && display <= DISCOUNT_SLIDER_MIN;
  const accent = display <= 0 ? "#D1D5DB" : isMin ? "#EF4444" : "#22C55E";
  const trackRest = display <= 0 ? "#E5E7EB" : isMin ? "#FECACA" : "#DCFCE7";
  const ticks = Array.from(
    { length: Math.floor(BOOST_SLIDER_MAX / BOOST_SLIDER_STEP) + 1 },
    (_, i) => i * BOOST_SLIDER_STEP
  );
  const popularLeftPct = (BOOST_POPULAR_PERCENT / BOOST_SLIDER_MAX) * 100;

  const setFromPageX = (pageX: number) => {
    const ratio = Math.min(1, Math.max(0, (pageX - trackX.current) / trackW.current));
    const stepped = Math.round((ratio * BOOST_SLIDER_MAX) / BOOST_SLIDER_STEP) * BOOST_SLIDER_STEP;
    onChange(Math.min(BOOST_SLIDER_MAX, Math.max(DISCOUNT_SLIDER_MIN, stepped)));
  };

  const measureTrack = () => {
    trackRef.current?.measureInWindow((x, _y, w) => {
      trackX.current = x;
      trackW.current = w || 1;
    });
  };

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (e) => {
        measureTrack();
        setFromPageX(e.nativeEvent.pageX);
      },
      onPanResponderMove: (e) => setFromPageX(e.nativeEvent.pageX),
    })
  ).current;

  return (
    <View style={styles.boostSliderWrap}>
      {display > 0 ? (
        <View
          style={[
            styles.sliderBubble,
            { left: `${Math.min(92, Math.max(8, fillPct))}%` as `${number}%` },
          ]}
        >
          <View style={[styles.sliderBubbleInner, { backgroundColor: accent }]}>
            <Text style={styles.sliderBubbleText}>{display}%</Text>
          </View>
          <View style={[styles.sliderBubbleCaret, { borderTopColor: accent }]} />
        </View>
      ) : null}
      <View
        ref={trackRef}
        style={[styles.boostSliderTrack, { backgroundColor: trackRest }]}
        onLayout={measureTrack}
        {...pan.panHandlers}
      >
        <View
          style={[
            styles.sliderFill,
            { width: `${fillPct}%` as `${number}%`, backgroundColor: accent },
          ]}
        />
        <View
          style={[
            styles.sliderThumb,
            {
              left: `${fillPct}%` as `${number}%`,
              backgroundColor: display <= 0 ? "#9CA3AF" : accent,
            },
          ]}
        />
      </View>
      <View style={styles.boostSliderTicks}>
        {ticks.map((t) => (
          <Text
            key={t}
            style={[
              styles.boostSliderTick,
              t > 0 && t < DISCOUNT_SLIDER_MIN && { color: "#D1D5DB" },
            ]}
          >
            {t}%
          </Text>
        ))}
      </View>
      <Pressable
        onPress={() => onChange(BOOST_POPULAR_PERCENT)}
        style={[styles.popularBadgeWrap, { left: `${popularLeftPct}%` as `${number}%` }]}
        hitSlop={8}
      >
        <View style={styles.popularBadge}>
          <Text style={styles.popularBadgeText}>🔥 Popular</Text>
        </View>
      </Pressable>
    </View>
  );
}

export function OfferFormSheet({
  visible,
  editing,
  skipChoose = false,
  saving,
  uploadingImage,
  values: v,
  onChange,
  menuItems,
  menuCategories = [],
  menuLoading,
  menuSearch,
  onMenuSearchChange,
  onToggleMenuItem,
  isMenuItemDisabled,
  onPickImage,
  onSave,
  onClose,
}: OfferFormSheetProps) {
  const insets = useSafeAreaInsets();
  const [navIndex, setNavIndex] = useState(0);
  const [selectedRecommendedId, setSelectedRecommendedId] = useState<string | null>(null);
  const [expandedCats, setExpandedCats] = useState<Record<string, boolean>>({});
  const [startDateMode, setStartDateMode] = useState<"today" | "tomorrow" | "custom">("today");
  const [showStartDatePicker, setShowStartDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState<"start" | "end" | null>(null);

  const conditionsMode = v.conditionsMode ?? "boost";
  const createPath = v.createPath ?? "boost";
  const isPrecisionPath = createPath === "precision" || conditionsMode === "precision";
  const setConditionsMode = (mode: "boost" | "precision") => onChange({ conditionsMode: mode });

  const steps = useMemo(() => {
    let base =
      editing || skipChoose
        ? OFFER_NAV_STEPS.filter((s) => s !== "choose")
        : [...OFFER_NAV_STEPS];
    if (isPrecisionPath) base = base.filter((s) => s !== "applicability");
    return base;
  }, [editing, skipChoose, isPrecisionPath]);

  const step: OfferWizardStep = steps[navIndex] ?? (editing || skipChoose ? "applicability" : "choose");
  const progressSteps = useMemo(
    () => WIZARD_STEPS.filter((s) => !(isPrecisionPath && s.id === "applicability")),
    [isPrecisionPath]
  );
  const progressIndex = progressSteps.findIndex((s) => s.id === step);

  useEffect(() => {
    if (visible) {
      setNavIndex(0);
      setSelectedRecommendedId(null);
      setExpandedCats({});
      setShowStartDatePicker(false);
      setShowTimePicker(null);
      const from = v.validFrom || todayYmd();
      if (from === todayYmd()) setStartDateMode("today");
      else if (from === plusDaysYmd(1)) setStartDateMode("tomorrow");
      else setStartDateMode("custom");
    }
  }, [visible, editing, skipChoose]);

  const filteredMenu = useMemo(() => {
    const term = menuSearch.trim().toLowerCase();
    return menuItems.filter((m) => {
      const selected = v.selectedItemIds.includes(m.item_id);
      if (!selected && isMenuItemDisabled?.(m)) return false;
      if (!term) return true;
      return (
        m.item_name.toLowerCase().includes(term) || m.item_id.toLowerCase().includes(term)
      );
    });
  }, [menuItems, menuSearch, isMenuItemDisabled, v.selectedItemIds]);

  const menuGrouped = useMemo(() => {
    const catNameById = new Map<number, string>();
    for (const c of menuCategories) {
      catNameById.set(c.id, c.category_name);
    }
    const map = new Map<string, { key: string; name: string; items: MenuItemRow[] }>();
    for (const item of filteredMenu) {
      const key = item.category_id != null ? `c-${item.category_id}` : "other";
      const name =
        (item.category_id != null && catNameById.get(item.category_id)) || "Other";
      const bucket = map.get(key) ?? { key, name, items: [] };
      if (bucket.name === "Other" && name !== "Other") bucket.name = name;
      bucket.items.push(item);
      map.set(key, bucket);
    }
    const ordered: { key: string; name: string; items: MenuItemRow[] }[] = [];
    for (const cat of menuCategories) {
      const bucket = map.get(`c-${cat.id}`);
      if (bucket) {
        bucket.name = cat.category_name || bucket.name;
        ordered.push(bucket);
        map.delete(`c-${cat.id}`);
      }
    }
    for (const bucket of map.values()) ordered.push(bucket);
    return ordered;
  }, [filteredMenu, menuCategories]);

  const resolvedSelectedIds = useMemo(
    () => resolveMenuItemSelection(v.selectedItemIds, menuItems),
    [v.selectedItemIds, menuItems]
  );
  const resolvedSelectedIdSet = useMemo(
    () => new Set(resolvedSelectedIds),
    [resolvedSelectedIds]
  );

  useEffect(() => {
    if (!v.applyToSpecificItems || menuItems.length === 0) return;
    if (v.selectedItemIds.length === 0) return;
    const resolved = resolveMenuItemSelection(v.selectedItemIds, menuItems);
    const prevSet = new Set(v.selectedItemIds.map((id) => String(id).trim()));
    const same =
      resolved.length === prevSet.size && resolved.every((id) => prevSet.has(id));
    if (same) return;
    onChange({ selectedItemIds: resolved });
  }, [menuItems, v.applyToSpecificItems, v.selectedItemIds, onChange]);

  const allMenuSelected =
    menuItems.length > 0 &&
    (v.applyToSpecificItems
      ? menuItems.every((m) => resolvedSelectedIdSet.has(m.item_id))
      : true);
  const selectedMenuCount = v.applyToSpecificItems
    ? resolvedSelectedIds.length
    : menuItems.length;

  const isItemSelected = (itemId: string) =>
    !v.applyToSpecificItems || resolvedSelectedIdSet.has(itemId);

  const selectAllMenuItems = () => {
    onChange({
      applyToSpecificItems: false,
      selectedItemIds: [],
    });
  };

  const unselectAllMenuItems = () => {
    onChange({ applyToSpecificItems: true, selectedItemIds: [] });
  };

  const toggleCategoryItems = (ids: string[], select: boolean) => {
    if (!v.applyToSpecificItems) {
      if (!select) {
        onChange({
          applyToSpecificItems: true,
          selectedItemIds: menuItems.map((m) => m.item_id).filter((id) => !ids.includes(id)),
        });
      }
      return;
    }
    if (select) {
      const set = new Set(v.selectedItemIds);
      ids.forEach((id) => set.add(id));
      const next = [...set];
      if (next.length === menuItems.length) {
        onChange({ applyToSpecificItems: false, selectedItemIds: [] });
      } else {
        onChange({ selectedItemIds: next });
      }
    } else {
      onChange({
        applyToSpecificItems: true,
        selectedItemIds: v.selectedItemIds.filter((id) => !ids.includes(id)),
      });
    }
  };

  const canProceed = canProceedFromStep(step, v);
  const blockedReason = nextStepBlockedReason(step, v);
  const reviewSummary = useMemo(
    () =>
      buildMerchantReviewSummary(v, {
        selectedCount: selectedMenuCount,
        menuItemCount: menuItems.length,
      }),
    [v, selectedMenuCount, menuItems.length]
  );
  const reviewRows = useMemo(
    () =>
      buildReviewRows(v, {
        conditionsMode,
        selectedCount: selectedMenuCount,
        menuItemCount: menuItems.length,
      }),
    [v, conditionsMode, selectedMenuCount, menuItems.length]
  );
  const autoPriority = useMemo(() => computeAutoPriority(v), [v]);
  const isBogo = ["BUY_X_GET_Y", "BUY_N_GET_M", "BOGO"].includes(v.offerType);
  const discountNum = parseFloat(v.discountValue || "0") || 0;
  const maxCapNum = (() => {
    const n = parseFloat(v.maxDiscountAmount || "");
    return Number.isFinite(n) && n > 0 ? n : null;
  })();

  const boostPreviewPool = useMemo(() => {
    const priced = menuItems.filter((m) => parseFloat(m.selling_price || m.base_price || "0") > 0);
    if (!v.applyToSpecificItems) return priced;
    if (resolvedSelectedIds.length === 0) return [];
    const idSet = new Set(resolvedSelectedIds);
    return priced.filter((m) => idSet.has(m.item_id));
  }, [menuItems, v.applyToSpecificItems, resolvedSelectedIds]);

  const boostPreviewItems = useMemo(
    () => pickPreviewItems(boostPreviewPool, 3),
    [boostPreviewPool]
  );

  const goNext = () => {
    if (!canProceed) return;
    if (navIndex < steps.length - 1) {
      const next = steps[navIndex + 1];
      if (next === "review") {
        const summary = buildMerchantReviewSummary(v);
        onChange({
          priority: String(autoPriority),
          title: v.title.trim() || summary.headline,
        });
      }
      setNavIndex((i) => i + 1);
    } else {
      onChange({ priority: String(autoPriority) });
      onSave();
    }
  };

  const goBack = () => {
    if (navIndex > 0) setNavIndex((i) => i - 1);
    else onClose();
  };

  const renderChoose = () => (
    <View style={{ gap: 12 }}>
      <Text style={styles.stepTitle}>Choose promo discount type</Text>
      <Text style={styles.stepHint}>
        Select how you want to discount. You can fine-tune details in the next steps.
      </Text>
      {OFFER_PROMO_CHOICES.map((choice) => {
        const selected =
          (choice.id === "precision" && createPath === "precision") ||
          (choice.id === "bogo" && createPath === "bogo") ||
          (choice.id === "percentage" && createPath === "boost" && !isBogo);
        return (
          <Pressable
            key={choice.id}
            onPress={() => {
              const path =
                choice.id === "precision" ? "precision" : choice.id === "bogo" ? "bogo" : "boost";
              onChange({
                offerType: choice.offerType,
                buyQty: choice.buyQuantity,
                getQty: choice.getQuantity,
                title: v.title.trim() || choice.title,
                discountValue: choice.id === "bogo" ? "" : v.discountValue,
                conditionsMode: path === "precision" ? "precision" : "boost",
                createPath: path,
                ...(path === "precision"
                  ? {
                      applyToSpecificItems: false,
                      selectedItemIds: [] as string[],
                    }
                  : {}),
              });
            }}
            style={[styles.promoCard, selected && styles.promoCardSelected]}
          >
            <View
              style={[
                styles.promoIcon,
                choice.id === "precision"
                  ? styles.promoIconPrecision
                  : choice.id === "bogo"
                    ? styles.promoIconBogo
                    : styles.promoIconPct,
              ]}
            >
              <Text style={styles.promoIconText}>
                {choice.id === "precision"
                  ? "PRECI\nSION"
                  : choice.id === "bogo"
                    ? "BUY 1\nGET 1"
                    : "30%\nOff"}
              </Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.promoTitle}>{choice.title}</Text>
              <Text style={styles.promoDesc}>{choice.description}</Text>
            </View>
            {selected ? (
              <Ionicons name="checkmark-circle" size={22} color={GatiMitraMerchant.primary} />
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );

  const renderApplicability = () => {
    if (isPrecisionPath) {
      return (
        <View style={styles.precisionLockCard}>
          <Text style={styles.precisionLockTitle}>Precision · whole menu</Text>
          <Text style={styles.precisionLockBody}>
            Precision offers apply at checkout / offer sheet on all menu items. Item selection is
            not available for this offer type.
          </Text>
          <Text style={styles.precisionLockMeta}>
            Applies to: All items ({menuItems.length} menu item{menuItems.length === 1 ? "" : "s"})
          </Text>
        </View>
      );
    }
    return (
    <View style={styles.applyFill}>
      <Text style={styles.stepHint}>All items or specific menu items only.</Text>
      <View style={styles.segment}>
        <Pressable
          onPress={() => onChange({ applyToSpecificItems: false, selectedItemIds: [] })}
          style={[styles.segBtn, !v.applyToSpecificItems && styles.segBtnActive]}
        >
          <Text style={[styles.segText, !v.applyToSpecificItems && styles.segTextActive]}>
            All items
          </Text>
        </Pressable>
        <Pressable
          onPress={() => onChange({ applyToSpecificItems: true })}
          style={[styles.segBtn, v.applyToSpecificItems && styles.segBtnActive]}
        >
          <Text style={[styles.segText, v.applyToSpecificItems && styles.segTextActive]}>
            Specific items
          </Text>
        </Pressable>
      </View>

      <TextInput
        style={[styles.input, { marginTop: 12 }]}
        value={menuSearch}
        onChangeText={onMenuSearchChange}
        placeholder="Search menu items…"
        placeholderTextColor={GatiMitraMerchant.textTertiary}
      />

      <View style={styles.countRow}>
        <Text style={styles.selectedCount}>
          {v.applyToSpecificItems
            ? `Total result: ${selectedMenuCount} selected of ${menuItems.length}`
            : `Total result: ${menuItems.length} menu items`}
        </Text>
        {menuItems.length > 0 ? (
          <Pressable
            onPress={() => (allMenuSelected ? unselectAllMenuItems() : selectAllMenuItems())}
            style={styles.selectAllBtn}
            hitSlop={8}
          >
            <Text style={styles.selectAllText}>
              {allMenuSelected ? "Unselect all" : "Select all"}
            </Text>
            <Ionicons
              name={allMenuSelected ? "checkbox" : "square-outline"}
              size={18}
              color={allMenuSelected ? GatiMitraMerchant.primary : GatiMitraMerchant.textTertiary}
            />
          </Pressable>
        ) : null}
      </View>

      {menuLoading ? (
        <ActivityIndicator style={{ marginTop: 16 }} color={GatiMitraMerchant.primary} />
      ) : (
        <View style={styles.menuListFill}>
          <ScrollView
            style={styles.menuListScroll}
            contentContainerStyle={
              menuGrouped.length === 0
                ? styles.menuListEmptyContent
                : styles.menuListContent
            }
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            nestedScrollEnabled
          >
            {menuGrouped.length === 0 ? (
              <Text style={styles.emptyMenu}>
                {menuItems.length === 0
                  ? "No menu items available for this store."
                  : "No items match your search."}
              </Text>
            ) : (
              menuGrouped.map((group) => {
                const expanded = expandedCats[group.key] ?? false;
                const ids = group.items.map((i) => i.item_id);
                const selectedInCat = ids.filter((id) => isItemSelected(id)).length;
                const allInCat = selectedInCat === ids.length && ids.length > 0;
                return (
                  <View key={group.key} style={styles.catBlock}>
                    <View style={styles.catHeader}>
                      <Pressable
                        onPress={() =>
                          setExpandedCats((prev) => ({ ...prev, [group.key]: !expanded }))
                        }
                        style={styles.catHeaderLeft}
                      >
                        <Ionicons
                          name={expanded ? "chevron-down" : "chevron-forward"}
                          size={16}
                          color={GatiMitraMerchant.textSecondary}
                        />
                        <Text style={styles.catName} numberOfLines={1}>
                          {group.name} ({group.items.length})
                        </Text>
                      </Pressable>
                      <Pressable
                        onPress={() => toggleCategoryItems(ids, !allInCat)}
                        style={styles.catSelect}
                        hitSlop={6}
                      >
                        <Text style={styles.catSelectText}>
                          {allInCat ? "Unselect all" : "Select all"}
                        </Text>
                        <Ionicons
                          name={allInCat ? "checkbox" : "square-outline"}
                          size={18}
                          color={
                            allInCat
                              ? GatiMitraMerchant.primary
                              : GatiMitraMerchant.textTertiary
                          }
                        />
                      </Pressable>
                    </View>
                    {expanded
                      ? group.items.map((item) => {
                          const selected = isItemSelected(item.item_id);
                          return (
                            <Pressable
                              key={item.item_id}
                              onPress={() => {
                                if (!v.applyToSpecificItems) {
                                  onChange({
                                    applyToSpecificItems: true,
                                    selectedItemIds: menuItems
                                      .map((m) => m.item_id)
                                      .filter((id) => id !== item.item_id),
                                  });
                                } else {
                                  onToggleMenuItem(item.item_id);
                                }
                              }}
                              style={[styles.menuRow, selected && styles.menuRowSelected]}
                            >
                              <View style={styles.menuTextCol}>
                                <Text style={styles.menuName} numberOfLines={1}>
                                  {item.item_name}
                                </Text>
                              </View>
                              <Ionicons
                                name={selected ? "checkbox" : "square-outline"}
                                size={20}
                                color={
                                  selected
                                    ? GatiMitraMerchant.primary
                                    : GatiMitraMerchant.textTertiary
                                }
                              />
                            </Pressable>
                          );
                        })
                      : null}
                  </View>
                );
              })
            )}
          </ScrollView>
        </View>
      )}
    </View>
  );
  };

  const calendarToday = todayYmd();
  const addDaysToYmd = (ymd: string, days: number) => {
    const d = parseYmdToDate(ymd);
    d.setDate(d.getDate() + days);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  };
  const addMonthsToYmd = (ymd: string, months: number) => {
    const d = parseYmdToDate(ymd);
    d.setMonth(d.getMonth() + months);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  };
  const tomorrowYmdVal = addDaysToYmd(calendarToday, 1);
  const dayAfterTomorrowYmd = addDaysToYmd(calendarToday, 2);

  const setStartDate = (mode: "today" | "tomorrow" | "custom", ymd?: string) => {
    if (mode === "today") {
      setStartDateMode("today");
      onChange({
        validFrom: calendarToday,
        validTill: tomorrowYmdVal,
      });
      setShowStartDatePicker(false);
      return;
    }
    if (mode === "tomorrow") {
      setStartDateMode("tomorrow");
      onChange({
        validFrom: tomorrowYmdVal,
        validTill: dayAfterTomorrowYmd,
      });
      setShowStartDatePicker(false);
      return;
    }
    setStartDateMode("custom");
    if (ymd) {
      onChange({
        validFrom: ymd,
        validTill: v.validTill && v.validTill >= ymd ? v.validTill : addDaysToYmd(ymd, 1),
      });
      return;
    }
    onChange({
      validFrom: calendarToday,
      validTill: addMonthsToYmd(calendarToday, 1),
    });
    setShowStartDatePicker(true);
  };

  const renderConditions = () => {
    if (createPath === "bogo" || (isBogo && createPath !== "boost" && createPath !== "precision")) {
      const buy = Math.max(1, parseInt(v.buyQty || "1", 10) || 1);
      const get = Math.max(1, parseInt(v.getQty || "1", 10) || 1);
      const equivPct = Math.round((get / (buy + get)) * 100);
      return (
        <View style={{ gap: 14 }}>
          <LinearGradient
            colors={["#7C3AED", "#9333EA", "#C026D3"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.bogoHero}
          >
            <Text style={styles.bogoHeroEyebrow}>Customer offer</Text>
            <Text style={styles.bogoHeroTitle}>
              Buy {buy} Get {get} Free
            </Text>
            <Text style={styles.bogoHeroBody}>
              Customers will get {get} item{get > 1 ? "s" : ""} free when they buy {buy}. This is
              equivalent to a {equivPct}% discount.
            </Text>
          </LinearGradient>

          <Text style={styles.sectionTitle}>Recommended BOGO offers</Text>
          <View style={styles.bogoGrid}>
            {RECOMMENDED_BOGO_OFFERS.map((p) => {
              const selected = buy === p.buy && get === p.get;
              return (
                <Pressable
                  key={p.id}
                  onPress={() =>
                    onChange({
                      buyQty: String(p.buy),
                      getQty: String(p.get),
                      title: v.title.trim() || p.label,
                    })
                  }
                  style={[styles.bogoPreset, selected && styles.bogoPresetSelected]}
                >
                  <Text style={styles.bogoPresetLabel}>{p.label}</Text>
                  <Text style={[styles.bogoPresetHint, selected && { color: "#6D28D9" }]}>
                    {p.hint}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <View style={styles.cardBox}>
            <View style={styles.rowBetween}>
              <Text style={styles.sectionTitle}>Customize quantities</Text>
              <Text style={styles.equivPill}>≈ {equivPct}% off</Text>
            </View>
            <View style={styles.row}>
              {(
                [
                  { key: "buyQty" as const, label: "Buy", value: buy },
                  { key: "getQty" as const, label: "Get free", value: get },
                ] as const
              ).map((row) => (
                <View key={row.key} style={[styles.half, styles.qtyBox]}>
                  <Text style={styles.qtyLabel}>{row.label}</Text>
                  <View style={styles.qtyControls}>
                    <Pressable
                      onPress={() =>
                        onChange({ [row.key]: String(Math.max(1, row.value - 1)) })
                      }
                      style={styles.qtyBtn}
                    >
                      <Ionicons name="remove" size={16} color={GatiMitraMerchant.textPrimary} />
                    </Pressable>
                    <Text style={styles.qtyValue}>{row.value}</Text>
                    <Pressable
                      onPress={() =>
                        onChange({ [row.key]: String(Math.min(10, row.value + 1)) })
                      }
                      style={styles.qtyBtn}
                    >
                      <Ionicons name="add" size={16} color={GatiMitraMerchant.textPrimary} />
                    </Pressable>
                  </View>
                </View>
              ))}
            </View>
            <Text style={styles.label}>Min order value (₹)</Text>
            <TextInput
              style={styles.input}
              value={v.minOrder}
              onChangeText={(t) => onChange({ minOrder: t })}
              keyboardType="decimal-pad"
              placeholder="Optional"
              placeholderTextColor={GatiMitraMerchant.textTertiary}
            />
          </View>
        </View>
      );
    }

    return (
      <View style={{ gap: 14 }}>
        {createPath !== "precision" ? (
          <View style={{ gap: 12 }}>
            <View style={styles.boostCard}>
              <View style={styles.boostCardHeader}>
                <View style={styles.boostCardIcon}>
                  <Text style={styles.boostCardIconText}>%</Text>
                </View>
                <View>
                  <Text style={styles.boostCardTitle}>Discount Value</Text>
                  <Text style={styles.boostModeLabel}>Boost</Text>
                </View>
              </View>
              <BoostDiscountSlider
                value={discountNum}
                onChange={(n) => {
                  setSelectedRecommendedId(null);
                  onChange({ offerType: "PERCENTAGE", discountValue: String(n) });
                }}
              />
            </View>

            {boostPreviewItems.length > 0 && discountNum > 0 ? (
              <View style={styles.previewItemsCard}>
                <Text style={styles.previewItemsTitle}>
                  Selected items ({boostPreviewPool.length})
                </Text>
                {boostPreviewItems.map((item) => {
                  const original = parseFloat(item.selling_price || item.base_price || "0") || 0;
                  const after = priceAfterPercentOffer(original, discountNum, maxCapNum);
                  return (
                    <View key={item.item_id} style={styles.previewItemRow}>
                      <View style={styles.previewItemLeft}>
                        <ItemVegMark
                          vegNonveg={item.food_type}
                          name={item.item_name}
                          size={14}
                        />
                        <Text style={styles.previewItemName} numberOfLines={2}>
                          {item.item_name}
                        </Text>
                      </View>
                      <View style={styles.previewItemPrices}>
                        <Text style={styles.previewItemOriginal}>{formatInrPrice(original)}</Text>
                        <Text style={styles.previewItemAfter}>{formatInrPrice(after)}</Text>
                      </View>
                    </View>
                  );
                })}
              </View>
            ) : discountNum > 0 ? (
              <Text style={styles.previewEmptyHint}>
                Select items in Applies to to preview discounted prices.
              </Text>
            ) : null}
          </View>
        ) : (
          <>
            <Text style={styles.sectionTitle}>Recommended Offers For You</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: 8 }}
            >
              {RECOMMENDED_PERCENTAGE_OFFERS.map((preset) => {
                const selected = selectedRecommendedId === preset.id;
                return (
                  <Pressable
                    key={preset.id}
                    onPress={() => {
                      setSelectedRecommendedId(preset.id);
                      onChange({
                        offerType: "PERCENTAGE",
                        discountValue: String(preset.discount),
                        maxDiscountAmount:
                          preset.maxDiscount != null ? String(preset.maxDiscount) : "",
                        minOrder: String(preset.mov),
                        title: v.title.trim() || preset.label,
                        conditionsMode: "precision",
                        createPath: "precision",
                        applyToSpecificItems: false,
                        selectedItemIds: [],
                      });
                    }}
                    style={[styles.recCard, selected && styles.recCardSelected]}
                  >
                    <View style={styles.recCardTop}>
                      <Text style={styles.recCardLabel}>{preset.label}</Text>
                    </View>
                    <View
                      style={[styles.recCardBottom, selected && styles.recCardBottomSelected]}
                    >
                      <Text style={[styles.recCardMov, selected && { color: "#fff" }]}>
                        MOV ₹{preset.mov}
                      </Text>
                    </View>
                  </Pressable>
                );
              })}
            </ScrollView>

            <View style={styles.rowBetween}>
              <Text style={styles.sectionTitle}>Create Custom Offers</Text>
              <Pressable
                onPress={() => {
                  setSelectedRecommendedId(null);
                  onChange({
                    discountValue: "",
                    maxDiscountAmount: "",
                    minOrder: "",
                  });
                }}
                style={styles.resetBtn}
              >
                <Ionicons
                  name="refresh-outline"
                  size={14}
                  color={GatiMitraMerchant.textSecondary}
                />
                <Text style={styles.resetText}>Reset All</Text>
              </Pressable>
            </View>

            <View style={styles.cardBox}>
              <View
                style={[
                  styles.previewBadge,
                  discountNum > 0 ? styles.previewBadgeActive : styles.previewBadgeIdle,
                ]}
              >
                <Text
                  style={[
                    styles.previewTitle,
                    {
                      color:
                        discountNum > 0 ? "#059669" : GatiMitraMerchant.textSecondary,
                    },
                  ]}
                >
                  {discountNum > 0
                    ? v.maxDiscountAmount
                      ? `${discountNum}% Off up to ₹${v.maxDiscountAmount}`
                      : `Flat ${discountNum}% Off`
                    : "Set your discount"}
                </Text>
                <Text style={styles.previewSub}>
                  {discountNum > 0
                    ? v.minOrder
                      ? `On minimum order value of ₹${v.minOrder}`
                      : "No minimum order value"
                    : "Pick a recommended offer or drag the slider"}
                </Text>
              </View>

              <DiscountTrackSlider
                value={discountNum}
                onChange={(n) => {
                  setSelectedRecommendedId(null);
                  onChange({ offerType: "PERCENTAGE", discountValue: String(n) });
                }}
              />

              <View style={styles.row}>
                <View style={styles.half}>
                  <Text style={styles.label}>Min order value (₹)</Text>
                  <TextInput
                    style={styles.input}
                    value={v.minOrder}
                    onChangeText={(t) => {
                      setSelectedRecommendedId(null);
                      onChange({ minOrder: t });
                    }}
                    keyboardType="decimal-pad"
                    placeholder="e.g. 149"
                    placeholderTextColor={GatiMitraMerchant.textTertiary}
                  />
                </View>
                <View style={styles.half}>
                  <Text style={styles.label}>Max discount (₹)</Text>
                  <TextInput
                    style={styles.input}
                    value={v.maxDiscountAmount}
                    onChangeText={(t) => {
                      setSelectedRecommendedId(null);
                      onChange({ maxDiscountAmount: t });
                    }}
                    keyboardType="decimal-pad"
                    placeholder="Optional cap"
                    placeholderTextColor={GatiMitraMerchant.textTertiary}
                  />
                </View>
              </View>
            </View>
          </>
        )}
      </View>
    );
  };

  const formatTimeDisplay = (t: string) => (t.trim() ? t.trim().slice(0, 5) : "--:--");

  const DAYS_OF_WEEK = [
    "MONDAY",
    "TUESDAY",
    "WEDNESDAY",
    "THURSDAY",
    "FRIDAY",
    "SATURDAY",
    "SUNDAY",
  ] as const;
  const WEEKDAY_KEYS = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY"];
  const WEEKEND_KEYS = ["SATURDAY", "SUNDAY"];
  const allDaysSelected =
    v.applicableOnDays.length === 0 || v.applicableOnDays.length === DAYS_OF_WEEK.length;
  const weekdaysSelected =
    WEEKDAY_KEYS.every((d) => v.applicableOnDays.includes(d)) &&
    v.applicableOnDays.length === WEEKDAY_KEYS.length;
  const weekendSelected =
    WEEKEND_KEYS.every((d) => v.applicableOnDays.includes(d)) &&
    v.applicableOnDays.length === WEEKEND_KEYS.length;

  const setScheduleDays = (days: string[]) => onChange({ applicableOnDays: days });
  const toggleDay = (day: string) => {
    const has = v.applicableOnDays.includes(day);
    onChange({
      applicableOnDays: has
        ? v.applicableOnDays.filter((d) => d !== day)
        : [...v.applicableOnDays, day],
    });
  };

  const renderSchedule = () => (
    <View style={{ gap: 10 }}>
      <Text style={styles.scheduleQuietSummary}>
        Starts {formatDayMonth(v.validFrom || calendarToday)}
        {" · "}
        {allDaysSelected && v.applicableOnDays.length === 0
          ? "Every day"
          : weekdaysSelected
            ? "Weekdays"
            : weekendSelected
              ? "Weekend"
              : v.applicableOnDays.map((d) => d.slice(0, 3)).join(", ") || "Every day"}
        {" · "}
        {v.applicableTimeStart && v.applicableTimeEnd
          ? `${formatTimeDisplay(v.applicableTimeStart)} – ${formatTimeDisplay(v.applicableTimeEnd)}`
          : "All day"}
      </Text>

      <View style={styles.cardBox}>
        <Text style={styles.sectionTitle}>Start date</Text>
        <View style={styles.startDateRow}>
          {(
            [
              { id: "today" as const, label: "Today", sub: formatDayMonth(calendarToday) },
              { id: "tomorrow" as const, label: "Tomorrow", sub: formatDayMonth(tomorrowYmdVal) },
              {
                id: "custom" as const,
                label: "Custom",
                sub:
                  startDateMode === "custom" && v.validFrom
                    ? formatDayMonth(v.validFrom)
                    : "Pick date",
              },
            ] as const
          ).map((opt) => {
            const selected = startDateMode === opt.id;
            return (
              <Pressable
                key={opt.id}
                onPress={() => setStartDate(opt.id)}
                style={[styles.startDateChip, selected && styles.startDateChipSelected]}
              >
                <Text style={[styles.startDateLabel, selected && styles.startDateLabelSelected]}>
                  {opt.label}
                </Text>
                <Text style={[styles.startDateSub, selected && styles.startDateSubSelected]}>
                  {opt.sub}
                </Text>
              </Pressable>
            );
          })}
        </View>
        {showStartDatePicker && NativeDateTimePicker ? (
          <NativeDateTimePicker
            value={parseYmdToDate(v.validFrom || calendarToday)}
            mode="date"
            display={Platform.OS === "ios" ? "spinner" : "default"}
            minimumDate={new Date()}
            onChange={(event: { type?: string }, date?: Date) => {
              if (Platform.OS === "android") setShowStartDatePicker(false);
              if (event?.type === "dismissed") {
                setShowStartDatePicker(false);
                return;
              }
              if (!date) return;
              const y = date.getFullYear();
              const m = String(date.getMonth() + 1).padStart(2, "0");
              const d = String(date.getDate()).padStart(2, "0");
              setStartDate("custom", `${y}-${m}-${d}`);
            }}
          />
        ) : null}
        <View style={[styles.row, { marginTop: 8 }]}>
          <View style={styles.half}>
            <Text style={styles.label}>Start</Text>
            <TextInput
              style={styles.input}
              value={v.validFrom}
              onChangeText={(t) => setStartDate("custom", t)}
              placeholder="YYYY-MM-DD"
              placeholderTextColor={GatiMitraMerchant.textTertiary}
            />
          </View>
          <View style={styles.half}>
            <Text style={styles.label}>End date *</Text>
            <TextInput
              style={styles.input}
              value={v.validTill}
              onChangeText={(t) => onChange({ validTill: t })}
              placeholder="YYYY-MM-DD"
              placeholderTextColor={GatiMitraMerchant.textTertiary}
            />
          </View>
        </View>
      </View>

      <View style={styles.cardBox}>
        <View style={styles.rowBetween}>
          <Text style={styles.sectionTitle}>Applicable days</Text>
          <Pressable onPress={() => setScheduleDays([])} hitSlop={8}>
            <Text style={styles.clearDaysText}>Clear</Text>
          </Pressable>
        </View>
        <View style={styles.dayPresetRow}>
          {(
            [
              {
                id: "all",
                label: "All days",
                active: allDaysSelected && v.applicableOnDays.length === 0,
                onPress: () => setScheduleDays([]),
              },
              {
                id: "weekdays",
                label: "Weekdays",
                active: weekdaysSelected,
                onPress: () => setScheduleDays([...WEEKDAY_KEYS]),
              },
              {
                id: "weekend",
                label: "Weekend",
                active: weekendSelected,
                onPress: () => setScheduleDays([...WEEKEND_KEYS]),
              },
            ] as const
          ).map((p) => (
            <Pressable
              key={p.id}
              onPress={p.onPress}
              style={[styles.dayPresetChip, p.active && styles.dayPresetChipActive]}
            >
              <Text style={[styles.dayPresetText, p.active && styles.dayPresetTextActive]}>
                {p.label}
              </Text>
            </Pressable>
          ))}
        </View>
        <View style={styles.dayGrid}>
          {DAYS_OF_WEEK.map((d) => {
            const explicitlySelected = v.applicableOnDays.includes(d);
            const isEmptyMeansAll = v.applicableOnDays.length === 0;
            const active = explicitlySelected || isEmptyMeansAll;
            return (
              <Pressable
                key={d}
                onPress={() => {
                  if (isEmptyMeansAll) setScheduleDays([d]);
                  else toggleDay(d);
                }}
                style={[styles.dayCell, active && styles.dayCellActive]}
              >
                <Text style={[styles.dayCellText, active && styles.dayCellTextActive]}>
                  {d.slice(0, 3)}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <View style={styles.cardBox}>
        <View style={styles.rowBetween}>
          <Text style={styles.sectionTitle}>Active hours</Text>
          <Text style={styles.hintMuted}>Optional</Text>
        </View>
        <View style={styles.row}>
          <Pressable
            style={[styles.half, styles.timeField]}
            onPress={() => setShowTimePicker("start")}
          >
            <Text style={styles.timeFieldLabel}>Starts</Text>
            <View style={styles.timeFieldValueRow}>
              <Text
                style={[
                  styles.timeFieldValue,
                  !v.applicableTimeStart && styles.timeFieldPlaceholder,
                ]}
              >
                {formatTimeDisplay(v.applicableTimeStart)}
              </Text>
              <Ionicons name="time-outline" size={16} color={GatiMitraMerchant.textTertiary} />
            </View>
          </Pressable>
          <Pressable
            style={[styles.half, styles.timeField]}
            onPress={() => setShowTimePicker("end")}
          >
            <Text style={styles.timeFieldLabel}>Ends</Text>
            <View style={styles.timeFieldValueRow}>
              <Text
                style={[
                  styles.timeFieldValue,
                  !v.applicableTimeEnd && styles.timeFieldPlaceholder,
                ]}
              >
                {formatTimeDisplay(v.applicableTimeEnd)}
              </Text>
              <Ionicons name="time-outline" size={16} color={GatiMitraMerchant.textTertiary} />
            </View>
          </Pressable>
        </View>
        {showTimePicker && NativeDateTimePicker ? (
          <NativeDateTimePicker
            value={(() => {
              const raw =
                showTimePicker === "start" ? v.applicableTimeStart : v.applicableTimeEnd;
              const d = new Date();
              const m = /^(\d{1,2}):(\d{2})/.exec(raw || "");
              if (m) d.setHours(Number(m[1]), Number(m[2]), 0, 0);
              else d.setHours(showTimePicker === "start" ? 9 : 22, 0, 0, 0);
              return d;
            })()}
            mode="time"
            is24Hour
            display={Platform.OS === "ios" ? "spinner" : "default"}
            onChange={(event: { type?: string }, date?: Date) => {
              if (Platform.OS === "android") setShowTimePicker(null);
              if (event?.type === "dismissed") {
                setShowTimePicker(null);
                return;
              }
              if (!date) return;
              const hh = String(date.getHours()).padStart(2, "0");
              const mm = String(date.getMinutes()).padStart(2, "0");
              const val = `${hh}:${mm}`;
              if (showTimePicker === "start") onChange({ applicableTimeStart: val });
              else onChange({ applicableTimeEnd: val });
            }}
          />
        ) : null}
      </View>
    </View>
  );

  const renderReview = () => (
    <View style={{ gap: 14 }}>
      <LinearGradient
        colors={
          isBogo
            ? ["#7C3AED", "#9333EA", "#C026D3"]
            : ["#F97316", "#F43F5E", "#EF4444"]
        }
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.reviewHero}
      >
        <Text style={styles.reviewHeroEyebrow}>What customers will see</Text>
        <Text style={styles.reviewHeroTitle}>{reviewSummary.headline}</Text>
        <Text style={styles.reviewHeroBody}>{reviewSummary.customerSees}</Text>
        {reviewSummary.equivalent ? (
          <Text style={styles.reviewHeroEquiv}>{reviewSummary.equivalent}</Text>
        ) : null}
      </LinearGradient>

      <View style={styles.cardBox}>
        <View style={styles.rowBetween}>
          <Text style={styles.sectionTitle}>Offer details</Text>
          <Text style={styles.equivPill}>Priority auto · {autoPriority}</Text>
        </View>
        {reviewRows.map((row) => (
          <View key={row.label} style={styles.reviewRow}>
            <Text style={styles.reviewLabel}>{row.label}</Text>
            <Text style={styles.reviewValue}>{row.value}</Text>
          </View>
        ))}
      </View>

      <View style={styles.cardBox}>
        <Text style={styles.label}>Offer title *</Text>
        <TextInput
          style={styles.input}
          value={v.title}
          onChangeText={(t) => onChange({ title: t })}
          placeholder="e.g. Flat 30% OFF"
          placeholderTextColor={GatiMitraMerchant.textTertiary}
        />
        <Text style={[styles.label, { marginTop: 10 }]}>Banner image</Text>
        <Pressable onPress={onPickImage} style={styles.imageBtn}>
          <Ionicons name="image-outline" size={18} color="#fff" />
          <Text style={styles.imageBtnText}>{v.imagePreview ? "Change image" : "Upload image"}</Text>
        </Pressable>
        {uploadingImage ? (
          <ActivityIndicator style={{ marginTop: 8 }} color={GatiMitraMerchant.primary} />
        ) : null}
      </View>
    </View>
  );

  const body = (() => {
    switch (step) {
      case "choose":
        return renderChoose();
      case "applicability":
        return renderApplicability();
      case "conditions":
        return renderConditions();
      case "schedule":
        return renderSchedule();
      case "review":
        return renderReview();
      default:
        return null;
    }
  })();

  const isLast = navIndex >= steps.length - 1;
  const isApplicability = step === "applicability";

  // Full-screen Android modals often report insets.bottom=0 even with gesture/3-button nav.
  // Pad enough that Close/Next never sit under the system navigation bar.
  const systemBottom = Math.max(
    insets.bottom,
    Platform.OS === "android" ? 28 : 0
  );
  const footerBottomPad = systemBottom + (Platform.OS === "ios" ? 8 : 16);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        style={[styles.modalRoot, { paddingTop: insets.top }]}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={styles.header}>
          <Text style={styles.headerTitle}>{editing ? "Edit Offer" : "Create Offer"}</Text>
          <Pressable onPress={onClose} hitSlop={12}>
            <Ionicons name="close" size={24} color={GatiMitraMerchant.textPrimary} />
          </Pressable>
        </View>

        {step !== "choose" ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.stepperScroll}
            contentContainerStyle={styles.stepperContent}
          >
            {progressSteps.map((s, i) => {
              const active = s.id === step;
              const done = progressIndex >= 0 && i < progressIndex;
              return (
                <Pressable
                  key={s.id}
                  onPress={() => {
                    const idx = steps.indexOf(s.id);
                    if (idx >= 0) setNavIndex(idx);
                  }}
                  style={[
                    styles.stepPill,
                    active && styles.stepPillActive,
                    done && !active && styles.stepPillDone,
                  ]}
                >
                  <Text
                    style={[
                      styles.stepPillText,
                      active && styles.stepPillTextActive,
                      done && !active && styles.stepPillTextDone,
                    ]}
                    numberOfLines={1}
                  >
                    {i + 1}. {s.label}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        ) : null}

        {isApplicability ? (
          body
        ) : (
          <ScrollView
            style={styles.body}
            contentContainerStyle={[
              styles.bodyContent,
              { paddingBottom: 24 + footerBottomPad },
            ]}
            keyboardShouldPersistTaps="handled"
          >
            {body}
          </ScrollView>
        )}

        <View style={[styles.footer, { paddingBottom: footerBottomPad }]}>
          <Pressable onPress={goBack} style={styles.prevBtn}>
            <Ionicons name="chevron-back" size={16} color={GatiMitraMerchant.textPrimary} />
            <Text style={styles.prevText}>{navIndex === 0 ? "Close" : "Previous"}</Text>
          </Pressable>

          <View style={styles.nextCol}>
            <Pressable
              onPress={goNext}
              disabled={!canProceed || saving}
              style={[styles.nextBtn, (!canProceed || saving) && styles.nextBtnDisabled]}
            >
              {saving ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Text style={styles.nextText}>
                    {isLast ? (editing ? "Update offer" : "Publish offer") : "Next"}
                  </Text>
                  {!isLast ? (
                    <Ionicons name="chevron-forward" size={16} color="#fff" />
                  ) : null}
                </>
              )}
            </Pressable>
            {blockedReason ? <Text style={styles.blockedHint}>{blockedReason}</Text> : null}
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalRoot: { flex: 1, backgroundColor: "#fff" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: OFFERS_UI.cardBorder,
  },
  headerTitle: { fontSize: 17, fontWeight: "800", color: OFFERS_UI.text },
  stepperScroll: { maxHeight: 48, borderBottomWidth: 1, borderBottomColor: "#F3F4F6" },
  stepperContent: { paddingHorizontal: 12, paddingVertical: 8, gap: 6 },
  stepPill: {
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 10,
    backgroundColor: "#F3F4F6",
    marginRight: 6,
  },
  stepPillActive: { backgroundColor: "#F97316" },
  stepPillDone: { backgroundColor: "#D1FAE5" },
  stepPillText: { fontSize: 11, fontWeight: "700", color: "#6B7280" },
  stepPillTextActive: { color: "#fff" },
  stepPillTextDone: { color: "#065F46" },
  body: { flex: 1 },
  bodyContent: { padding: 16, paddingBottom: 32 },
  stepTitle: { fontSize: 16, fontWeight: "800", color: OFFERS_UI.text },
  stepHint: { fontSize: 12, color: OFFERS_UI.textMuted, marginBottom: 8 },
  sectionTitle: { fontSize: 14, fontWeight: "800", color: OFFERS_UI.text },
  label: {
    fontSize: 12,
    fontWeight: "700",
    color: OFFERS_UI.text,
    marginBottom: 6,
    marginTop: 4,
  },
  input: {
    borderWidth: 1,
    borderColor: OFFERS_UI.cardBorder,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: OFFERS_UI.text,
    backgroundColor: "#fff",
  },
  promoCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderWidth: 1,
    borderColor: OFFERS_UI.cardBorder,
    borderRadius: 14,
    padding: 12,
    backgroundColor: "#fff",
  },
  promoCardSelected: { borderColor: "#A78BFA", backgroundColor: "#F5F3FF" },
  promoIcon: {
    width: 48,
    height: 48,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  promoIconBogo: { backgroundColor: "#6D28D9" },
  promoIconPct: { backgroundColor: "#F59E0B" },
  promoIconPrecision: { backgroundColor: "#4338CA" },
  precisionLockCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#C7D2FE",
    backgroundColor: "#EEF2FF",
    padding: 16,
    gap: 8,
  },
  precisionLockTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#1E1B4B",
  },
  precisionLockBody: {
    fontSize: 12,
    lineHeight: 18,
    color: "#3730A3",
  },
  precisionLockMeta: {
    fontSize: 12,
    fontWeight: "700",
    color: "#312E81",
  },
  promoIconText: {
    color: "#FEF08A",
    fontSize: 8,
    fontWeight: "900",
    textAlign: "center",
    lineHeight: 11,
  },
  promoTitle: { fontSize: 14, fontWeight: "800", color: OFFERS_UI.text },
  promoDesc: { fontSize: 11, color: OFFERS_UI.textMuted, marginTop: 2 },
  segment: { flexDirection: "row", gap: 8, marginTop: 4 },
  segBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: "#F3F4F6",
    alignItems: "center",
  },
  segBtnActive: { backgroundColor: GatiMitraMerchant.primary },
  segText: { fontSize: 13, fontWeight: "700", color: OFFERS_UI.textMuted },
  segTextActive: { color: "#fff" },
  applyFill: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 10,
    minHeight: 0,
  },
  countRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 8,
    marginBottom: 8,
    gap: 8,
  },
  selectAllBtn: { flexDirection: "row", alignItems: "center", gap: 6 },
  selectAllText: { fontSize: 12, fontWeight: "700", color: OFFERS_UI.text },
  menuListFill: {
    flex: 1,
    minHeight: 0,
    borderWidth: 1,
    borderColor: OFFERS_UI.cardBorder,
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: "#fff",
    marginBottom: 4,
  },
  menuListScroll: { flex: 1 },
  menuListContent: { paddingBottom: 12 },
  menuListEmptyContent: { flexGrow: 1, justifyContent: "center", paddingBottom: 16 },
  catBlock: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#E5E7EB",
  },
  catHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 10,
    gap: 8,
    backgroundColor: "#fff",
  },
  catHeaderLeft: { flex: 1, flexDirection: "row", alignItems: "center", gap: 6, minWidth: 0 },
  catName: { flex: 1, fontSize: 13, fontWeight: "700", color: OFFERS_UI.text },
  catSelect: { flexDirection: "row", alignItems: "center", gap: 6 },
  catSelectText: { fontSize: 11, fontWeight: "600", color: OFFERS_UI.textMuted },
  menuRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    paddingLeft: 34,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#F3F4F6",
    backgroundColor: "#FAFAFA",
  },
  menuRowSelected: { backgroundColor: "#F0FDF4" },
  menuTextCol: { flex: 1 },
  menuName: { fontSize: 13, fontWeight: "600", color: OFFERS_UI.text },
  emptyMenu: { padding: 16, textAlign: "center", color: OFFERS_UI.textMuted, fontSize: 13 },
  selectedCount: { flex: 1, fontSize: 12, color: OFFERS_UI.textMuted },
  footer: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: OFFERS_UI.cardBorder,
    backgroundColor: "#fff",
    gap: 12,
  },
  cardBox: {
    borderWidth: 1,
    borderColor: OFFERS_UI.cardBorder,
    borderRadius: 16,
    padding: 14,
    backgroundColor: "#fff",
    gap: 8,
  },
  row: { flexDirection: "row", gap: 10 },
  half: { flex: 1 },
  rowBetween: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  recCard: {
    width: 110,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    overflow: "hidden",
  },
  recCardSelected: { borderColor: "#7C3AED", borderWidth: 2 },
  recCardTop: {
    minHeight: 44,
    padding: 8,
    justifyContent: "center",
    backgroundColor: "#FAFAFA",
  },
  recCardLabel: { fontSize: 11, fontWeight: "800", color: OFFERS_UI.text },
  recCardBottom: { paddingHorizontal: 8, paddingVertical: 6, backgroundColor: "#F3F4F6" },
  recCardBottomSelected: { backgroundColor: "#7C3AED" },
  recCardMov: { fontSize: 10, fontWeight: "700", color: "#4B5563" },
  resetBtn: { flexDirection: "row", alignItems: "center", gap: 4 },
  resetText: { fontSize: 11, fontWeight: "700", color: OFFERS_UI.textMuted },
  previewBadge: {
    borderRadius: 12,
    borderWidth: 1,
    paddingVertical: 10,
    paddingHorizontal: 12,
    alignItems: "center",
  },
  previewBadgeActive: { borderColor: "#A7F3D0", backgroundColor: "#ECFDF5" },
  previewBadgeIdle: { borderColor: "#E5E7EB", backgroundColor: "#F9FAFB" },
  previewTitle: { fontSize: 15, fontWeight: "800" },
  previewSub: { fontSize: 11, color: OFFERS_UI.textMuted, marginTop: 2, textAlign: "center" },
  sliderWrap: { marginTop: 8, marginBottom: 4 },
  sliderBubble: { position: "absolute", top: 4, marginLeft: -18, zIndex: 2, alignItems: "center" },
  sliderBubbleInner: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  sliderBubbleText: { color: "#fff", fontSize: 10, fontWeight: "800" },
  sliderBubbleCaret: {
    width: 0,
    height: 0,
    borderLeftWidth: 5,
    borderRightWidth: 5,
    borderTopWidth: 5,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
  },
  sliderTrack: {
    marginTop: 28,
    height: 8,
    borderRadius: 999,
    backgroundColor: "#FCE7F3",
    justifyContent: "center",
  },
  sliderFill: { position: "absolute", left: 0, top: 0, bottom: 0, borderRadius: 999 },
  sliderThumb: {
    position: "absolute",
    width: 20,
    height: 20,
    borderRadius: 10,
    marginLeft: -10,
    borderWidth: 3,
    borderColor: "#fff",
    top: -6,
  },
  sliderTicks: { flexDirection: "row", justifyContent: "space-between", marginTop: 8 },
  sliderTick: { fontSize: 9, color: "#9CA3AF", width: 16, textAlign: "center" },
  hintMuted: { fontSize: 10, color: "#9CA3AF", marginTop: 6 },
  boostCard: {
    borderWidth: 1,
    borderColor: OFFERS_UI.cardBorder,
    borderRadius: 16,
    padding: 14,
    backgroundColor: "#fff",
    gap: 10,
  },
  boostCardHeader: { flexDirection: "row", alignItems: "center", gap: 10 },
  boostCardIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: OFFERS_UI.cardBorder,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FAFAFA",
  },
  boostCardIconText: { fontSize: 14, fontWeight: "800", color: OFFERS_UI.text },
  boostCardTitle: { fontSize: 15, fontWeight: "700", color: OFFERS_UI.text },
  boostModeLabel: { fontSize: 11, fontWeight: "700", color: "#047857", marginTop: 1 },
  boostSliderWrap: { marginTop: 4, marginBottom: 4, paddingBottom: 28 },
  boostSliderTrack: {
    marginTop: 28,
    height: 10,
    borderRadius: 999,
    backgroundColor: "#E8F8F1",
    justifyContent: "center",
  },
  boostSliderTicks: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 8,
  },
  boostSliderTick: {
    fontSize: 8,
    color: "#9CA3AF",
    width: 22,
    textAlign: "center",
    marginLeft: -4,
  },
  popularBadgeWrap: {
    position: "absolute",
    bottom: 0,
    marginLeft: -36,
  },
  popularBadge: {
    backgroundColor: "#FFEDD5",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  popularBadgeText: { fontSize: 10, fontWeight: "700", color: "#9A3412" },
  previewItemsCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: OFFERS_UI.cardBorder,
    backgroundColor: "#fff",
    padding: 14,
    gap: 10,
    ...GatiMitraMerchant.shadowSm,
  },
  previewItemsTitle: {
    fontSize: 13,
    fontWeight: "600",
    color: OFFERS_UI.textMuted,
    textAlign: "center",
    marginBottom: 2,
  },
  previewItemRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    paddingVertical: 4,
  },
  previewItemLeft: { flex: 1, flexDirection: "row", alignItems: "center", gap: 8, minWidth: 0 },
  previewItemName: { flex: 1, fontSize: 13, fontWeight: "600", color: OFFERS_UI.text },
  previewItemPrices: { flexDirection: "row", alignItems: "center", gap: 8 },
  previewItemOriginal: {
    fontSize: 12,
    color: OFFERS_UI.textFaint,
    textDecorationLine: "line-through",
  },
  previewItemAfter: { fontSize: 15, fontWeight: "800", color: "#DB2777" },
  previewEmptyHint: {
    fontSize: 12,
    color: OFFERS_UI.textMuted,
    textAlign: "center",
    paddingVertical: 8,
  },
  bogoHero: { borderRadius: 16, padding: 16 },
  bogoHeroEyebrow: {
    fontSize: 10,
    fontWeight: "700",
    color: "rgba(255,255,255,0.8)",
    textTransform: "uppercase",
  },
  bogoHeroTitle: { fontSize: 22, fontWeight: "900", color: "#fff", marginTop: 4 },
  bogoHeroBody: { fontSize: 12, color: "rgba(255,255,255,0.9)", marginTop: 8, lineHeight: 18 },
  bogoGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  bogoPreset: {
    width: "48%",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 12,
    padding: 12,
    backgroundColor: "#fff",
  },
  bogoPresetSelected: { borderColor: "#7C3AED", backgroundColor: "#F5F3FF" },
  bogoPresetLabel: { fontSize: 13, fontWeight: "800", color: OFFERS_UI.text },
  bogoPresetHint: { fontSize: 11, fontWeight: "600", color: OFFERS_UI.textMuted, marginTop: 2 },
  equivPill: {
    fontSize: 10,
    fontWeight: "700",
    color: "#6D28D9",
    backgroundColor: "#F5F3FF",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  qtyBox: {
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 12,
    padding: 10,
    backgroundColor: "#F9FAFB",
  },
  qtyLabel: {
    fontSize: 10,
    fontWeight: "700",
    color: OFFERS_UI.textMuted,
    textTransform: "uppercase",
    marginBottom: 8,
  },
  qtyControls: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  qtyBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },
  qtyValue: { fontSize: 18, fontWeight: "900", color: OFFERS_UI.text, minWidth: 24, textAlign: "center" },
  scheduleQuietSummary: { fontSize: 12, color: "#6B7280", marginBottom: 2 },
  scheduleCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 4,
  },
  startDateRow: { flexDirection: "row", gap: 6, marginTop: 8 },
  startDateChip: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 6,
    backgroundColor: "#fff",
    alignItems: "center",
  },
  startDateChipSelected: {
    borderColor: "#111827",
    backgroundColor: "#111827",
  },
  startDateLabel: { fontSize: 12, fontWeight: "700", color: OFFERS_UI.text },
  startDateLabelSelected: { color: "#fff" },
  startDateSub: { fontSize: 10, color: OFFERS_UI.textMuted, marginTop: 2 },
  startDateSubSelected: { color: "#D1D5DB" },
  clearDaysText: { fontSize: 11, fontWeight: "600", color: OFFERS_UI.textMuted },
  dayPresetRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 8 },
  dayPresetChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: "#F3F4F6",
  },
  dayPresetChipActive: { backgroundColor: "#111827" },
  dayPresetText: { fontSize: 10, fontWeight: "700", color: "#4B5563" },
  dayPresetTextActive: { color: "#fff" },
  dayGrid: { flexDirection: "row", gap: 4, marginTop: 8 },
  dayCell: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: "#F9FAFB",
    borderWidth: 1,
    borderColor: "#F3F4F6",
  },
  dayCellActive: {
    backgroundColor: "#111827",
    borderColor: "#111827",
  },
  dayCellText: { fontSize: 10, fontWeight: "700", color: "#6B7280" },
  dayCellTextActive: { color: "#fff" },
  hoursIcon: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: "#F3F4F6",
    alignItems: "center",
    justifyContent: "center",
  },
  timeField: {
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: "#fff",
  },
  timeFieldLabel: {
    fontSize: 10,
    fontWeight: "700",
    color: OFFERS_UI.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.4,
    marginBottom: 6,
  },
  timeFieldValueRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  timeFieldValue: { fontSize: 14, fontWeight: "700", color: OFFERS_UI.text },
  timeFieldPlaceholder: { color: "#9CA3AF", fontWeight: "600" },
  reviewHero: { borderRadius: 16, padding: 16 },
  reviewHeroEyebrow: {
    fontSize: 10,
    fontWeight: "700",
    color: "rgba(255,255,255,0.85)",
    textTransform: "uppercase",
  },
  reviewHeroTitle: { fontSize: 22, fontWeight: "900", color: "#fff", marginTop: 4 },
  reviewHeroBody: { fontSize: 13, color: "rgba(255,255,255,0.92)", marginTop: 8, lineHeight: 18 },
  reviewHeroEquiv: { fontSize: 12, fontWeight: "700", color: "#FEF08A", marginTop: 6 },
  reviewRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#E5E7EB",
  },
  reviewLabel: { fontSize: 12, color: OFFERS_UI.textMuted },
  reviewValue: { fontSize: 12, fontWeight: "700", color: OFFERS_UI.text, flexShrink: 1, textAlign: "right" },
  imageBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    alignSelf: "flex-start",
    backgroundColor: GatiMitraMerchant.navy,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
  },
  imageBtnText: { color: "#fff", fontWeight: "700", fontSize: 12 },
  prevBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderRadius: 12,
    backgroundColor: "#F3F4F6",
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  prevText: { fontSize: 12, fontWeight: "800", color: OFFERS_UI.text },
  nextCol: { alignItems: "flex-end", flex: 1 },
  nextBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 16,
    paddingVertical: 11,
    borderRadius: 12,
    backgroundColor: "#1F2937",
  },
  nextBtnDisabled: { backgroundColor: "#E5E7EB" },
  nextText: { fontSize: 12, fontWeight: "800", color: "#fff" },
  blockedHint: { fontSize: 10, color: "#9CA3AF", marginTop: 4, textAlign: "right", maxWidth: 200 },
});
