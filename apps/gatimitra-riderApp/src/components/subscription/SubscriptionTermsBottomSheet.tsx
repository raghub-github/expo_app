import React from "react";
import { ScrollView, StyleSheet, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { DismissibleBottomSheetShell } from "@/src/components/language/DismissibleBottomSheetShell";
import { SubscriptionTermsSection } from "@/src/components/subscription/SubscriptionTermsSection";

type SubscriptionTermsBottomSheetProps = {
  visible: boolean;
  onClose: () => void;
};

export function SubscriptionTermsBottomSheet({
  visible,
  onClose,
}: SubscriptionTermsBottomSheetProps) {
  const { bottom: safeBottom } = useSafeAreaInsets();
  const sheetBottomPad = Math.max(safeBottom, Platform.OS === "android" ? 12 : 8) + 16;

  return (
    <DismissibleBottomSheetShell
      visible={visible}
      onDismiss={onClose}
      maxHeightRatio={0.62}
      sheetBottomPadding={sheetBottomPad}
      sheetStyle={styles.sheet}
    >
      <ScrollView showsVerticalScrollIndicator={false} bounces={false}>
        <SubscriptionTermsSection />
      </ScrollView>
    </DismissibleBottomSheetShell>
  );
}

const styles = StyleSheet.create({
  sheet: {
    paddingHorizontal: 16,
    paddingTop: 4,
  },
});
