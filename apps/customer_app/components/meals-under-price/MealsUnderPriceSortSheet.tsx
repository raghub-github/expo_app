import { useEffect, useState } from "react";
import { AppText } from "@/components/AppText";

import { StyleSheet, TouchableOpacity, View } from "react-native";
import { StoreBottomSheetShell } from "@/components/store/StoreBottomSheetShell";
import { GatiMitraColors } from "@/constants/gatimitra";
import { MerchantDarkPalette, useMerchantUiDark } from "@/features/merchant-detail/merchantUiTheme";
import type { MealsUnderPriceSortMode } from "./MealsUnderPriceFilterRow";

type Props = {
  visible: boolean;
  sortBy: MealsUnderPriceSortMode;
  onClose: () => void;
  onApply: (sort: MealsUnderPriceSortMode) => void;
};

const SORT_OPTIONS: { id: MealsUnderPriceSortMode; label: string }[] = [
  { id: "relevance", label: "Relevance" },
  { id: "rating", label: "Rating: High To Low" },
  { id: "delivery_time", label: "Delivery Time: Low To High" },
  { id: "distance", label: "Distance: Low To High" },
];

export function MealsUnderPriceSortSheet({ visible, sortBy, onClose, onApply }: Props) {
  const [draft, setDraft] = useState<MealsUnderPriceSortMode>(sortBy);
  const dark = useMerchantUiDark();

  useEffect(() => {
    if (visible) setDraft(sortBy);
  }, [visible, sortBy]);

  const hasChanges = draft !== sortBy;
  const canApply = hasChanges;

  return (
    <StoreBottomSheetShell visible={visible} onClose={onClose} maxHeightRatio={0.52}>
      <View style={styles.sheetBody}>
        <AppText style={[styles.title, dark && styles.titleDark]}>Sort</AppText>

        {SORT_OPTIONS.map((opt) => {
          const selected = draft === opt.id;
          return (
            <TouchableOpacity
              key={opt.id}
              style={[styles.optionRow, dark && styles.optionRowDark]}
              activeOpacity={0.85}
              onPress={() => setDraft(opt.id)}
            >
              <AppText style={[styles.optionLabel, dark && styles.optionLabelDark]}>{opt.label}</AppText>
              <View style={[styles.radioOuter, dark && styles.radioOuterDark, selected && styles.radioOuterSelected]}>
                {selected ? <View style={styles.radioInner} /> : null}
              </View>
            </TouchableOpacity>
          );
        })}
      </View>

      <View style={[styles.footer, dark && styles.footerDark]}>
        <TouchableOpacity
          onPress={() => setDraft("relevance")}
          hitSlop={12}
          disabled={draft === "relevance"}
        >
          <AppText style={[styles.clearText, draft === "relevance" && styles.clearTextDisabled]}>
            Clear all
          </AppText>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.applyBtn, !canApply && styles.applyBtnDisabled]}
          activeOpacity={0.88}
          disabled={!canApply}
          onPress={() => {
            onApply(draft);
            onClose();
          }}
        >
          <AppText style={[styles.applyText, !canApply && styles.applyTextDisabled]}>Apply</AppText>
        </TouchableOpacity>
      </View>
    </StoreBottomSheetShell>
  );
}

const styles = StyleSheet.create({
  sheetBody: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 12,
  },
  title: {
    fontSize: 18,
    fontWeight: "800",
    color: "#111827",
    marginBottom: 8,
  },
  optionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#E2E8F0",
  },
  optionLabel: {
    flex: 1,
    fontSize: 15,
    fontWeight: "600",
    color: "#1E293B",
    paddingRight: 12,
  },
  radioOuter: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: "#CBD5E1",
    alignItems: "center",
    justifyContent: "center",
  },
  radioOuterSelected: {
    borderColor: GatiMitraColors.primaryMint,
  },
  radioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: GatiMitraColors.primaryMint,
  },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#E2E8F0",
  },
  clearText: {
    fontSize: 15,
    fontWeight: "700",
    color: GatiMitraColors.deepMintStart,
  },
  clearTextDisabled: {
    color: "#86EFAC",
  },
  applyBtn: {
    minWidth: 120,
    paddingHorizontal: 28,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: GatiMitraColors.primaryMint,
    alignItems: "center",
  },
  applyBtnDisabled: {
    backgroundColor: "#E2E8F0",
  },
  applyText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  applyTextDisabled: {
    color: "#94A3B8",
  },
  titleDark: {
    color: MerchantDarkPalette.text,
  },
  optionRowDark: {
    borderBottomColor: MerchantDarkPalette.border,
  },
  optionLabelDark: {
    color: MerchantDarkPalette.text,
  },
  radioOuterDark: {
    borderColor: MerchantDarkPalette.chipBorder,
  },
  footerDark: {
    borderTopColor: MerchantDarkPalette.border,
  },
});
