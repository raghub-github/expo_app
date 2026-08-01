import type { ReactNode } from "react";
import { Modal, View, Pressable, StyleSheet, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { GatiMitraMerchant, CARD_RADIUS } from "@/constants/theme";

type Props = {
  visible: boolean;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  /** Max height of sheet area, e.g. "94%" */
  maxHeightPercent?: `${number}%`;
  /** Hide the floating close button above the sheet (use an in-sheet close control). */
  hideCloseFab?: boolean;
};

export function MerchantBottomSheetShell({
  visible,
  onClose,
  children,
  footer,
  maxHeightPercent = "88%",
  hideCloseFab = false,
}: Props) {
  const insets = useSafeAreaInsets();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
      {...(Platform.OS === "android" ? { navigationBarTranslucent: true } : null)}
    >
      <View style={styles.overlay}>
        <Pressable style={styles.dismissArea} onPress={onClose} accessibilityLabel="Close" />
        <View style={[styles.sheetWrap, { maxHeight: maxHeightPercent }]}>
          {!hideCloseFab ? (
            <Pressable
              onPress={onClose}
              style={styles.closeFab}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel="Close"
            >
              <Ionicons name="close" size={22} color={GatiMitraMerchant.textPrimary} />
            </Pressable>
          ) : null}

          {/* Sheet bg must paint to the physical bottom; safe-area is inner padding only. */}
          <View style={styles.sheet}>
            <View style={{ paddingBottom: Math.max(insets.bottom, 8) }}>
              {children}
              {footer}
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.45)",
    justifyContent: "flex-end",
  },
  dismissArea: {
    flex: 1,
  },
  sheetWrap: {
    maxHeight: "88%",
    width: "100%",
    marginBottom: 0,
  },
  closeFab: {
    alignSelf: "center",
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.14,
        shadowRadius: 8,
      },
      android: { elevation: 5 },
      default: {},
    }),
  },
  sheet: {
    backgroundColor: GatiMitraMerchant.cardBg,
    borderTopLeftRadius: CARD_RADIUS + 4,
    borderTopRightRadius: CARD_RADIUS + 4,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    maxHeight: "100%",
    overflow: "hidden",
    width: "100%",
    marginBottom: 0,
  },
});
