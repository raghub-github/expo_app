import React, { useCallback, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  Dimensions,
  Platform,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { useRiderDutyServiceFilter } from "@/src/hooks/useRiderDutyServiceFilter";
import { selectionMatchesPool } from "@/src/lib/rider-duty-service-types";
import type { RiderServiceTypeValue } from "@/src/lib/rider-vehicle-form";

const GREEN = "#16A34A";
const POPOVER_WIDTH = 188;
const GAP_BELOW_HEADER = 18;
const BEAK_WIDTH = 12;
const BEAK_HEIGHT = 7;
const FALLBACK_HEADER_HEIGHT = 52;
const FALLBACK_TRIGGER_WIDTH = 48;

type MenuAnchor = {
  top: number;
  left: number;
  width: number;
  triggerCenterX: number;
};

type RiderServiceTypeDropdownProps = {
  headerAnchorRef?: React.RefObject<View | null>;
};

type ServiceMeta = {
  labelKey: string;
  fallback: string;
  icon: keyof typeof Ionicons.glyphMap;
  tone: string;
  chipBg: string;
};

const SERVICE_ORDER: RiderServiceTypeValue[] = ["food", "parcel", "person_ride"];

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
): MenuAnchor {
  const width = triggerWidth > 0 ? triggerWidth : FALLBACK_TRIGGER_WIDTH;
  const triggerCenterX = triggerX + width / 2;
  const screenW = Dimensions.get("window").width;
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
}: RiderServiceTypeDropdownProps) {
  const { t } = useTranslation();
  const {
    selectedServices,
    eligibleServices,
    toggleService,
    setSelectedServices,
    isUpdating,
    visible,
  } = useRiderDutyServiceFilter();
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState<MenuAnchor | null>(null);
  const triggerRef = useRef<View>(null);

  const allServicesLabel = t("topbar.allServices", "All Services");

  const allSelected = useMemo(
    () => selectionMatchesPool(selectedServices, eligibleServices),
    [selectedServices, eligibleServices],
  );

  const triggerLabel = useMemo(() => {
    if (allSelected && eligibleServices.length > 1) {
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
    return allServicesLabel;
  }, [allSelected, eligibleServices.length, selectedServices, allServicesLabel, t]);

  const menuServices = useMemo(
    () => SERVICE_ORDER.filter((s) => eligibleServices.includes(s)),
    [eligibleServices],
  );

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
            resolve(computeAnchor(headerBottom, tx, tw));
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
          resolve(computeAnchor(ty + triggerHeight, tx, _tw));
        });
      });
    });
  }, [headerAnchorRef]);

  const openMenu = useCallback(async () => {
    if (!eligibleServices.length || isUpdating) return;
    const nextAnchor = await measureAndAnchor();
    if (!nextAnchor) return;
    setAnchor(nextAnchor);
    setOpen(true);
  }, [eligibleServices.length, isUpdating, measureAndAnchor]);

  const closeMenu = useCallback(() => {
    setOpen(false);
    setAnchor(null);
  }, []);

  if (!visible) {
    // Keep header chrome stable while eligibility loads — no missing gap.
    return (
      <View style={[styles.trigger, styles.triggerPlaceholder]} pointerEvents="none">
        <View style={styles.triggerRow}>
          <Text style={styles.triggerText} numberOfLines={1}>
            {allServicesLabel}
          </Text>
          <Ionicons name="chevron-down" size={14} color={GREEN} />
        </View>
      </View>
    );
  }

  const canOpen = eligibleServices.length > 0 && !isUpdating;
  const showAllRow = eligibleServices.length > 1;

  const beakLeft = anchor
    ? Math.min(
        Math.max(BEAK_WIDTH, anchor.triggerCenterX - anchor.left - BEAK_WIDTH / 2),
        anchor.width - BEAK_WIDTH * 2,
      )
    : BEAK_WIDTH;

  return (
    <View style={styles.wrap} collapsable={false}>
      <View
        ref={triggerRef}
        collapsable={false}
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
              <Text style={styles.triggerText} numberOfLines={1}>
                {triggerLabel}
              </Text>
              {eligibleServices.length > 1 ? (
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
                        {allServicesLabel}
                      </Text>
                      <ServiceCheckbox checked={allSelected} />
                    </TouchableOpacity>
                    <View style={styles.divider} />
                  </>
                ) : null}

                {menuServices.map((service, index) => {
                  const meta = SERVICE_META[service];
                  const isChecked = selectedServices.includes(service);
                  const isLast = index === menuServices.length - 1;
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
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexShrink: 0,
  },
  trigger: {
    minHeight: 36,
    justifyContent: "center",
    paddingHorizontal: 10,
    paddingVertical: 6,
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
    gap: 3,
  },
  triggerText: {
    fontSize: 13,
    fontWeight: "700",
    color: GREEN,
    includeFontPadding: false,
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
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: "#E5E7EB",
    marginHorizontal: 14,
  },
});
