import React from "react";
import { StyleSheet, View } from "react-native";
import { DismissibleBottomSheetShell } from "@/src/components/language/DismissibleBottomSheetShell";
import { SubscriptionTermsSection } from "@/src/components/subscription/SubscriptionTermsSection";
import { ResponsiveSheetBody } from "@/src/components/ui/ResponsiveSheetBody";
import { useResponsiveLayout } from "@/src/hooks/useResponsiveLayout";
import { resolveRiderBottomInset } from "@/src/hooks/useRiderBottomInset";

type SubscriptionTermsBottomSheetProps = {
  visible: boolean;
  onClose: () => void;
};

export function SubscriptionTermsBottomSheet({
  visible,
  onClose,
}: SubscriptionTermsBottomSheetProps) {
  const { rs, insets, height, isShortHeight } = useResponsiveLayout();
  const sheetBottomPad = resolveRiderBottomInset(insets.bottom) + rs(16);
  const maxH = Math.round(height * (isShortHeight ? 0.72 : 0.62));

  return (
    <DismissibleBottomSheetShell
      visible={visible}
      onDismiss={onClose}
      maxHeightRatio={isShortHeight ? 0.72 : 0.62}
      sheetBottomPadding={sheetBottomPad}
      sheetStyle={styles.sheet}
    >
      <ResponsiveSheetBody
        maxHeight={maxH - sheetBottomPad}
        contentContainerStyle={styles.body}
        scrollProps={{ bounces: false }}
      >
        <View>
          <SubscriptionTermsSection />
        </View>
      </ResponsiveSheetBody>
    </DismissibleBottomSheetShell>
  );
}

const styles = StyleSheet.create({
  sheet: {
    paddingTop: 4,
    maxWidth: "100%",
    overflow: "hidden",
  },
  body: {
    paddingBottom: 8,
  },
});
