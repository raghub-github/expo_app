import React, { useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Modal,
  Dimensions,
  Platform,
  StatusBar,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import type { RiderLedgerPeriod } from "@/src/services/api/riderApi";
import { LEDGER_TEAL } from "@/src/components/ledger/ledgerUiTokens";

type Props = {
  value: RiderLedgerPeriod;
  onChange: (period: RiderLedgerPeriod) => void;
};

const PERIODS: RiderLedgerPeriod[] = ["this_month", "last_month", "all"];

const ITEM_GAP = 10;
const OPTION_H = 32;
const TRIGGER_GAP = 6;
const MENU_WIDTH = ITEM_GAP * 2 + 152;

type MenuAnchor = {
  top: number;
  left: number;
};

export function LedgerPeriodDropdown({ value, onChange }: Props) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState<MenuAnchor | null>(null);
  const triggerRef = useRef<View>(null);

  const label = useMemo(() => {
    if (value === "this_month") return t("ledger.thisMonth", "This month");
    if (value === "last_month") return t("ledger.lastMonth", "Last month");
    return t("ledger.allTime", "All time");
  }, [value, t]);

  const optionLabel = (period: RiderLedgerPeriod) => {
    if (period === "this_month") return t("ledger.thisMonth", "This month");
    if (period === "last_month") return t("ledger.lastMonth", "Last month");
    return t("ledger.allTime", "All time");
  };

  const openMenu = () => {
    triggerRef.current?.measureInWindow((x, y, width, height) => {
      const screenW = Dimensions.get("window").width;
      const statusBarOffset =
        Platform.OS === "android" ? (StatusBar.currentHeight ?? 0) : 0;
      const left = Math.min(
        Math.max(8, x + width - MENU_WIDTH),
        screenW - MENU_WIDTH - 8,
      );
      setAnchor({
        top: y + height + TRIGGER_GAP + statusBarOffset,
        left,
      });
      setOpen(true);
    });
  };

  const closeMenu = () => {
    setOpen(false);
    setAnchor(null);
  };

  return (
    <View style={styles.wrap} collapsable={false}>
      <View ref={triggerRef} collapsable={false}>
        <Pressable
          onPress={() => (open ? closeMenu() : openMenu())}
          style={({ pressed }) => [styles.trigger, pressed && styles.triggerPressed]}
          accessibilityRole="button"
          accessibilityState={{ expanded: open }}
        >
        <View style={styles.triggerInner}>
          <Text style={styles.triggerText} numberOfLines={1}>
            {label}
          </Text>
          <Ionicons
            name={open ? "chevron-up" : "chevron-down"}
            size={14}
            color={LEDGER_TEAL}
            style={styles.chevron}
          />
        </View>
      </Pressable>
      </View>

      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={closeMenu}
        statusBarTranslucent
      >
        <Pressable style={styles.modalBackdrop} onPress={closeMenu}>
          {anchor ? (
            <Pressable
              style={[
                styles.menu,
                { top: anchor.top, left: anchor.left, width: MENU_WIDTH },
              ]}
              onPress={(event) => event.stopPropagation()}
            >
              <View style={styles.menuList}>
                {PERIODS.map((period) => {
                  const selected = period === value;
                  return (
                    <Pressable
                      key={period}
                      onPress={() => {
                        onChange(period);
                        closeMenu();
                      }}
                      style={({ pressed }) => [
                        styles.option,
                        pressed && !selected && styles.optionPressed,
                      ]}
                    >
                      <View style={styles.optionInner}>
                        <Text
                          style={[styles.optionText, selected && styles.optionTextSelected]}
                          numberOfLines={1}
                        >
                          {optionLabel(period)}
                        </Text>
                        {selected ? (
                          <Ionicons name="checkmark" size={18} color={LEDGER_TEAL} />
                        ) : (
                          <View style={styles.checkPlaceholder} />
                        )}
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            </Pressable>
          ) : null}
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexShrink: 0,
    alignItems: "flex-end",
  },
  trigger: {
    backgroundColor: "#FFFFFF",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    paddingHorizontal: 12,
    paddingVertical: 7,
    minHeight: 34,
  },
  triggerPressed: {
    backgroundColor: "#F9FAFB",
  },
  triggerInner: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "nowrap",
  },
  triggerText: {
    fontSize: 13,
    fontWeight: "600",
    color: LEDGER_TEAL,
    flexShrink: 0,
    marginRight: 4,
    includeFontPadding: false,
  },
  chevron: {
    flexShrink: 0,
    marginTop: 1,
  },
  modalBackdrop: {
    flex: 1,
  },
  menu: {
    position: "absolute",
    backgroundColor: "#FFFFFF",
    borderRadius: 0,
    borderWidth: 1,
    borderColor: "#D1D5DB",
    padding: ITEM_GAP,
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 6,
    elevation: 10,
    overflow: "hidden",
  },
  menuList: {
    gap: ITEM_GAP,
  },
  option: {
    height: OPTION_H,
    justifyContent: "center",
    borderRadius: 0,
  },
  optionInner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    flexWrap: "nowrap",
    width: "100%",
  },
  optionPressed: {
    opacity: 0.65,
  },
  optionText: {
    fontSize: 14,
    fontWeight: "500",
    color: "#374151",
    flex: 1,
    marginRight: 12,
    includeFontPadding: false,
    lineHeight: 20,
  },
  optionTextSelected: {
    fontWeight: "700",
    color: LEDGER_TEAL,
  },
  checkPlaceholder: {
    width: 18,
    height: 18,
  },
});
