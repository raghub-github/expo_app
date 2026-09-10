/**
 * Reusable sheet/modal body: scrollable content + sticky footer CTA.
 * Use inside DismissibleBottomSheetShell / Modal cards so CTAs never clip.
 */

import React from "react";
import {
  View,
  ScrollView,
  StyleSheet,
  type StyleProp,
  type ViewStyle,
  type ScrollViewProps,
} from "react-native";
import { useResponsiveLayout } from "@/src/hooks/useResponsiveLayout";

type Props = {
  children: React.ReactNode;
  footer?: React.ReactNode;
  maxHeight?: number;
  style?: StyleProp<ViewStyle>;
  contentContainerStyle?: StyleProp<ViewStyle>;
  footerStyle?: StyleProp<ViewStyle>;
  /** Extra space under sticky footer (system nav / home indicator). */
  footerBottomInset?: number;
  scrollProps?: Omit<ScrollViewProps, "children" | "style" | "contentContainerStyle">;
};

export function ResponsiveSheetBody({
  children,
  footer,
  maxHeight,
  style,
  contentContainerStyle,
  footerStyle,
  footerBottomInset = 0,
  scrollProps,
}: Props) {
  const { rs, isShortHeight } = useResponsiveLayout();
  const pad = rs(16);

  return (
    <View style={[styles.column, maxHeight != null ? { maxHeight } : null, style]}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingHorizontal: pad, paddingBottom: footer ? rs(8) : rs(16) },
          isShortHeight && styles.scrollCompact,
          contentContainerStyle,
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        bounces={false}
        {...scrollProps}
      >
        {children}
      </ScrollView>
      {footer ? (
        <View
          style={[
            styles.footer,
            {
              paddingHorizontal: pad,
              paddingTop: rs(8),
              paddingBottom: Math.max(rs(4), footerBottomInset),
            },
            footerStyle,
          ]}
        >
          {footer}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  column: {
    flexGrow: 1,
    flexShrink: 1,
    minHeight: 0,
    maxWidth: "100%",
  },
  scroll: {
    flexGrow: 1,
    flexShrink: 1,
    minHeight: 0,
  },
  scrollContent: {
    flexGrow: 1,
  },
  scrollCompact: {
    paddingTop: 8,
  },
  footer: {
    flexShrink: 0,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#F3F4F6",
    backgroundColor: "#FFFFFF",
    gap: 8,
  },
});
