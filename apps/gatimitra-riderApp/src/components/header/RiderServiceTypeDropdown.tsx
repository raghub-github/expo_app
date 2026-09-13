import React, { useCallback, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  useWindowDimensions,
  Platform,
  ActivityIndicator,
} from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useTranslation } from "react-i18next";
import { useRiderDutyServiceFilter } from "@/src/hooks/useRiderDutyServiceFilter";
import { selectionMatchesPool } from "@/src/lib/rider-duty-service-types";
import type { RiderServiceTypeValue } from "@/src/lib/rider-vehicle-form";
import { useRiderServiceEligibilityStatus } from "@/src/hooks/useRiderServiceEligibilityStatus";
import {
  buildServiceEligibilityRows,
  type EligibilityReason,
} from "@/src/lib/rider-service-eligibility-rows";
import { ServiceEligibilityReasonSheet } from "@/src/components/header/ServiceEligibilityReasonSheet";
import { headerControlText } from "@/src/theme/headerFonts";
import { useResponsiveLayout } from "@/src/hooks/useResponsiveLayout";
import {
  focusToDocumentUpdateCode,
  useDocumentUpdateSheetStore,
} from "@/src/stores/documentUpdateSheetStore";

const GREEN = "#16A34A";
const POPOVER_WIDTH = 188;
const GAP_BELOW_HEADER = 18;
const BEAK_WIDTH = 12;
const BEAK_HEIGHT = 7;
const FALLBACK_HEADER_HEIGHT = 52;
const FALLBACK_TRIGGER_WIDTH = 48;
/** Keep room for duty + trailing actions; long multi-select labels ellipsize. */
const CHIP_MAX_WIDTH_RATIO = 0.42;
const CHIP_PAD_H = 10;
const CHIP_MIN_WIDTH = 72;
const WIDTH_ANIM = {
  duration: 240,
  easing: Easing.out(Easing.cubic),
};

type MenuAnchor = {
  top: number;
  left: number;
  width: number;
  triggerCenterX: number;
};

type RiderServiceTypeDropdownProps = {
  headerAnchorRef?: React.RefObject<View | null>;
  /** Narrow / zoomed header — fill remaining space, allow ellipsis. */
  compact?: boolean;
};

type ServiceMeta = {
  labelKey: string;
  fallback: string;
  icon: keyof typeof Ionicons.glyphMap;
  tone: string;
  chipBg: string;
};

const SERVICE_ORDER: RiderServiceTypeValue[] = ["food", "parcel", "person_ride"];
/** Only show "All Services" when the full catalog is eligible + selected. */
const ALL_CATALOG_COUNT = SERVICE_ORDER.length;

const SERVICE_META: Record<RiderServiceTypeValue, ServiceMeta> = {
  food: {
    labelKey: "topbar.serviceFood",
    fallback: "Food",
    icon: "restaurant-outline",
    tone: "#15803D",
    chipBg: "#DCFCE7",
  },
  parcel: {
    labelKey: "topbar.serviceParcel",
    fallback: "Parcel",
    icon: "cube-outline",
    tone: "#2563EB",
    chipBg: "#DBEAFE",
  },
  person_ride: {
    labelKey: "topbar.servicePerson",
    fallback: "Person",
    icon: "person-outline",
    tone: "#EA580C",
    chipBg: "#FFEDD5",
  },
};

const popoverShadow = Platform.select({
  ios: {
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.14,
    shadowRadius: 14,
  },
  android: { elevation: 12 },
  default: {},
});

const ALL_SERVICES_META = {
  icon: "apps-outline" as keyof typeof Ionicons.glyphMap,
  tone: GREEN,
  toneOff: "#64748B",
  chipBg: "#DCFCE7",
  chipBgOff: "#F1F5F9",
};

function ServiceCheckbox({ checked }: { checked: boolean }) {
  return (
    <View style={[styles.checkbox, checked ? styles.checkboxChecked : styles.checkboxUnchecked]}>
      {checked ? <Ionicons name="checkmark" size={11} color="#FFFFFF" /> : null}
    </View>
  );
}

function serviceLabel(
  service: RiderServiceTypeValue,
  t: (key: string, fallback: string) => string,
): string {
  const meta = SERVICE_META[service];
  return t(meta.labelKey, meta.fallback);
}

function computeAnchor(
  headerBottom: number,
  triggerX: number,
  triggerWidth: number,
  screenW: number,
): MenuAnchor {
  const width = triggerWidth > 0 ? triggerWidth : FALLBACK_TRIGGER_WIDTH;
  const triggerCenterX = triggerX + width / 2;
  const popoverWidth = Math.min(POPOVER_WIDTH, screenW - 24);
  let left = triggerCenterX - popoverWidth / 2;
  // Keep the sheet from sliding left over the duty toggle.
  left = Math.max(left, triggerX);
  left = Math.min(Math.max(12, left), screenW - popoverWidth - 12);

  return {
    top: headerBottom + GAP_BELOW_HEADER,
    left,
    width: popoverWidth,
    triggerCenterX,
  };
}

export function RiderServiceTypeDropdown({
  headerAnchorRef,
  compact = false,
}: RiderServiceTypeDropdownProps) {
  const { t } = useTranslation();
  const { width: windowWidth } = useWindowDimensions();
  const { isCompactWidth } = useResponsiveLayout();
  const tight = compact || isCompactWidth;
  const chipMaxWidth = Math.round(windowWidth * CHIP_MAX_WIDTH_RATIO);
  const {
    selectedServices,
    eligibleServices,
    toggleService,
    setSelectedServices,
    isUpdating,
    visible,
  } = useRiderDutyServiceFilter();
  const { backend } = useRiderServiceEligibilityStatus();
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState<MenuAnchor | null>(null);
  const [reasonSheet, setReasonSheet] = useState<{
    service: RiderServiceTypeValue;
    reasons: EligibilityReason[];
  } | null>(null);
  const triggerRef = useRef<View>(null);
  const chipWidth = useSharedValue(CHIP_MIN_WIDTH);
  const hasMeasuredWidth = useRef(false);
  const lastTargetWidth = useRef(0);

  // All three services, each tagged selectable (checkbox) or blocked (with backend reasons).
  // Blocked services are shown — never silently hidden — so preference != eligibility.
  const serviceRows = useMemo(
    () => buildServiceEligibilityRows({ selectableServices: eligibleServices, backend }),
    [eligibleServices, backend],
  );

  const allServicesLabel = t("topbar.allServices", "All Services");

  const allSelected = useMemo(
    () => selectionMatchesPool(selectedServices, eligibleServices),
    [selectedServices, eligibleServices],
  );

  const triggerLabel = useMemo(() => {
    // "All Services" only when every catalog service is eligible and selected.
    // If only 2 are available, list those names — never say "All".
    if (allSelected && eligibleServices.length >= ALL_CATALOG_COUNT) {
      return allServicesLabel;
    }
    if (selectedServices.length === 1) {
      return serviceLabel(selectedServices[0]!, t);
    }
    if (selectedServices.length > 1) {
      return SERVICE_ORDER.filter((service) => selectedServices.includes(service))
        .map((service) => serviceLabel(service, t))
        .join(", ");
    }
    if (eligibleServices.length === 1) {
      return serviceLabel(eligibleServices[0]!, t);
    }
    return allServicesLabel;
  }, [allSelected, eligibleServices, selectedServices, allServicesLabel, t]);

  const applyMeasuredContentWidth = useCallback(
    (contentWidth: number) => {
      const next = Math.min(
        chipMaxWidth,
        Math.max(CHIP_MIN_WIDTH, Math.ceil(contentWidth + CHIP_PAD_H * 2)),
      );
      if (Math.abs(next - lastTargetWidth.current) < 0.5) return;
      lastTargetWidth.current = next;
      if (!hasMeasuredWidth.current) {
        chipWidth.value = next;
        hasMeasuredWidth.current = true;
        return;
      }
      chipWidth.value = withTiming(next, WIDTH_ANIM);
    },
    [chipMaxWidth, chipWidth],
  );

  const chipAnimStyle = useAnimatedStyle(() => ({
    width: chipWidth.value,
  }));

  const measureAndAnchor = useCallback(() => {
    return new Promise<MenuAnchor | null>((resolve) => {
      requestAnimationFrame(() => {
        const triggerNode = triggerRef.current;
        if (!triggerNode) {
          resolve(null);
          return;
        }

        const finish = (headerBottom: number) => {
          triggerNode.measureInWindow((tx, _ty, tw) => {
            resolve(computeAnchor(headerBottom, tx, tw, windowWidth));
          });
        };

        const headerNode = headerAnchorRef?.current;
        if (headerNode) {
          headerNode.measureInWindow((_hx, hy, _hw, hh) => {
            const headerHeight = hh > 0 ? hh : FALLBACK_HEADER_HEIGHT;
            finish(hy + headerHeight);
          });
          return;
        }

        triggerNode.measureInWindow((tx, ty, _tw, th) => {
          const triggerHeight = th > 0 ? th : 40;
          resolve(computeAnchor(ty + triggerHeight, tx, _tw, windowWidth));
        });
      });
    });
  }, [headerAnchorRef, windowWidth]);

  const openMenu = useCallback(async () => {
    if (!eligibleServices.length || isUpdating) return;
    // Open immediately so the first tap always works; refine anchor after measure.
    const fallbackWidth = Math.min(POPOVER_WIDTH, windowWidth - 24);
    setAnchor({
      top: FALLBACK_HEADER_HEIGHT + GAP_BELOW_HEADER,
      left: 12,
      width: fallbackWidth,
      triggerCenterX: 80,
    });
    setOpen(true);
    const nextAnchor = await measureAndAnchor();
    if (nextAnchor) setAnchor(nextAnchor);
  }, [eligibleServices.length, isUpdating, measureAndAnchor, windowWidth]);

  const closeMenu = useCallback(() => {
    setOpen(false);
    setAnchor(null);
  }, []);

  const hasBlocked = serviceRows.some((r) => r.state === "blocked");
  const canOpen = eligibleServices.length > 0 && !isUpdating;
  const showAllRow = eligibleServices.length > 1;
  const showChevron = eligibleServices.length > 1 || hasBlocked;
  const measureLabel = visible ? triggerLabel : allServicesLabel;

  const measureLayer = (
    <View style={styles.measureHost} pointerEvents="none">
      <View
        style={styles.measureRow}
        onLayout={(e) => applyMeasuredContentWidth(e.nativeEvent.layout.width)}
      >
        <Text style={styles.triggerText} numberOfLines={1} allowFontScaling={false}>
          {measureLabel}
        </Text>
        {(visible ? showChevron : true) ? (
          <Ionicons name="chevron-down" size={13} color={GREEN} />
        ) : null}
      </View>
    </View>
  );

  if (!visible) {
    return (
      <Animated.View
        style={[styles.wrap, styles.trigger, styles.triggerPlaceholder, chipAnimStyle]}
        pointerEvents="none"
      >
        {measureLayer}
        <View style={styles.triggerRow}>
          <Text style={styles.triggerText} numberOfLines={1} allowFontScaling={false}>
            {allServicesLabel}
          </Text>
          <Ionicons name="chevron-down" size={13} color={GREEN} />
        </View>
      </Animated.View>
    );
  }

  const beakLeft = anchor
    ? Math.min(
        Math.max(BEAK_WIDTH, anchor.triggerCenterX - anchor.left - BEAK_WIDTH / 2),
        anchor.width - BEAK_WIDTH * 2,
      )
    : BEAK_WIDTH;

  return (
    <Animated.View
      style={[styles.wrap, tight ? styles.chipTight : null, chipAnimStyle]}
      collapsable={false}
    >
      {measureLayer}
      <View
        ref={triggerRef}
        collapsable={false}
        style={styles.triggerHost}
        onLayout={() => {
          if (open) {
            void measureAndAnchor().then((next) => {
              if (next) setAnchor(next);
            });
          }
        }}
      >
        <TouchableOpacity
          activeOpacity={0.85}
          delayPressIn={0}
          onPress={() => (open ? closeMenu() : void openMenu())}
          disabled={!canOpen}
          style={styles.trigger}
          accessibilityRole="button"
          accessibilityState={{ expanded: open }}
          accessibilityLabel={triggerLabel}
        >
          {isUpdating ? (
            <ActivityIndicator size="small" color={GREEN} />
          ) : (
            <View style={styles.triggerRow}>
              <Text style={styles.triggerText} numberOfLines={1} allowFontScaling={false}>
                {triggerLabel}
              </Text>
              {showChevron ? (
                <Ionicons
                  name={open ? "chevron-up" : "chevron-down"}
                  size={13}
                  color={GREEN}
                />
              ) : null}
            </View>
          )}
        </TouchableOpacity>
      </View>

      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={closeMenu}
        statusBarTranslucent
      >
        <TouchableOpacity
          style={styles.modalBackdrop}
          activeOpacity={1}
          onPress={closeMenu}
        >
          {anchor ? (
            <View
              pointerEvents="box-none"
              style={[
                styles.popoverWrap,
                { top: anchor.top, left: anchor.left, width: anchor.width },
              ]}
            >
              <View
                style={[
                  styles.beak,
                  {
                    left: beakLeft,
                    borderBottomColor: "#FFFFFF",
                  },
                ]}
              />
              <View style={[styles.popover, popoverShadow]}>
                {showAllRow ? (
                  <>
                    <TouchableOpacity
                      activeOpacity={0.85}
                      onPress={() => {
                        void setSelectedServices(eligibleServices);
                        closeMenu();
                      }}
                      style={styles.menuRow}
                    >
                      <View
                        style={[
                          styles.leadingCircle,
                          {
                            backgroundColor: allSelected
                              ? ALL_SERVICES_META.chipBg
                              : ALL_SERVICES_META.chipBgOff,
                          },
                        ]}
                      >
                        <Ionicons
                          name={ALL_SERVICES_META.icon}
                          size={15}
                          color={allSelected ? ALL_SERVICES_META.tone : ALL_SERVICES_META.toneOff}
                        />
                      </View>
                      <Text
                        style={[
                          styles.menuText,
                          allSelected ? styles.menuTextAllOn : styles.menuTextDefault,
                        ]}
                      >
                        {eligibleServices.length >= ALL_CATALOG_COUNT
                          ? allServicesLabel
                          : t("topbar.allAvailableServices", "All available")}
                      </Text>
                      <ServiceCheckbox checked={allSelected} />
                    </TouchableOpacity>
                    <View style={styles.divider} />
                  </>
                ) : null}

                {serviceRows.map((row, index) => {
                  const service = row.service;
                  const meta = SERVICE_META[service];
                  const isLast = index === serviceRows.length - 1;

                  if (row.state === "blocked") {
                    // Shown, not hidden: greyed + lock, tap reveals WHY (backend reasons).
                    return (
                      <React.Fragment key={service}>
                        <TouchableOpacity
                          activeOpacity={0.85}
                          onPress={() => {
                            closeMenu();
                            setReasonSheet({ service, reasons: row.reasons });
                          }}
                          style={styles.menuRow}
                          accessibilityRole="button"
                          accessibilityLabel={`${serviceLabel(service, t)} not available — see why`}
                        >
                          <View style={[styles.leadingCircle, styles.leadingCircleBlocked]}>
                            <Ionicons name={meta.icon} size={15} color="#94A3B8" />
                          </View>
                          <Text style={[styles.menuText, styles.menuTextBlocked]}>
                            {serviceLabel(service, t)}
                          </Text>
                          <Ionicons name="lock-closed" size={14} color="#94A3B8" />
                        </TouchableOpacity>
                        {!isLast ? <View style={styles.divider} /> : null}
                      </React.Fragment>
                    );
                  }

                  const isChecked = selectedServices.includes(service);
                  return (
                    <React.Fragment key={service}>
                      <TouchableOpacity
                        activeOpacity={0.85}
                        onPress={() => void toggleService(service)}
                        style={styles.menuRow}
                      >
                        <View style={[styles.leadingCircle, { backgroundColor: meta.chipBg }]}>
                          <Ionicons name={meta.icon} size={15} color={meta.tone} />
                        </View>
                        <Text
                          style={[
                            styles.menuText,
                            isChecked ? styles.menuTextAllOn : styles.menuTextDefault,
                          ]}
                        >
                          {serviceLabel(service, t)}
                        </Text>
                        <ServiceCheckbox checked={isChecked} />
                      </TouchableOpacity>
                      {!isLast ? <View style={styles.divider} /> : null}
                    </React.Fragment>
                  );
                })}
              </View>
            </View>
          ) : null}
        </TouchableOpacity>
      </Modal>

      <ServiceEligibilityReasonSheet
        visible={reasonSheet != null}
        serviceLabel={reasonSheet ? serviceLabel(reasonSheet.service, t) : ""}
        reasons={reasonSheet?.reasons ?? []}
        onClose={() => setReasonSheet(null)}
        onCheckVehicles={() => {
          setReasonSheet(null);
          closeMenu();
          // Vehicles & Documents — never send riders who already have DL/RC into
          // onboarding to upload a second RC.
          router.push("/vehicles");
        }}
        onUploadMissingDoc={(target) => {
          setReasonSheet(null);
          closeMenu();
          const code = focusToDocumentUpdateCode(target.focus);
          if (code) {
            useDocumentUpdateSheetStore.getState().open(code);
            return;
          }
          router.push("/vehicles");
        }}
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexShrink: 1,
    minWidth: 0,
    alignSelf: "flex-start",
    justifyContent: "center",
    overflow: "hidden",
  },
  chipTight: {
    maxWidth: "100%",
  },
  measureHost: {
    position: "absolute",
    opacity: 0,
    left: 0,
    top: 0,
    zIndex: -1,
  },
  measureRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  triggerHost: {
    minWidth: 0,
    width: "100%",
  },
  trigger: {
    height: 36,
    width: "100%",
    minWidth: 0,
    justifyContent: "center",
    paddingHorizontal: CHIP_PAD_H,
    paddingVertical: 0,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(22, 163, 74, 0.35)",
    backgroundColor: "#FFFFFF",
  },
  triggerPlaceholder: {
    opacity: 0.9,
  },
  triggerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    flexShrink: 1,
    minWidth: 0,
  },
  triggerText: {
    ...headerControlText,
    flexShrink: 1,
    minWidth: 0,
    fontSize: 12,
    color: GREEN,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.08)",
  },
  popoverWrap: {
    position: "absolute",
  },
  beak: {
    position: "absolute",
    top: 0,
    width: 0,
    height: 0,
    borderLeftWidth: BEAK_WIDTH / 2,
    borderRightWidth: BEAK_WIDTH / 2,
    borderBottomWidth: BEAK_HEIGHT,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
  },
  popover: {
    marginTop: BEAK_HEIGHT,
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    overflow: "hidden",
    paddingVertical: 4,
  },
  menuRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    minHeight: 42,
  },
  checkbox: {
    width: 18,
    height: 18,
    borderRadius: 4,
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxChecked: {
    backgroundColor: GREEN,
    borderWidth: 0,
  },
  checkboxUnchecked: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1.5,
    borderColor: "#CBD5E1",
  },
  leadingCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  leadingCircleBlocked: {
    backgroundColor: "#F1F5F9",
  },
  menuText: {
    flex: 1,
    fontSize: 14,
    fontWeight: "600",
    includeFontPadding: false,
  },
  menuTextAllOn: {
    color: GREEN,
    fontWeight: "600",
  },
  menuTextDefault: {
    color: "#111827",
    fontWeight: "500",
  },
  menuTextBlocked: {
    color: "#94A3B8",
    fontWeight: "500",
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: "#E5E7EB",
    marginHorizontal: 14,
  },
});
