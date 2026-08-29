import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import {
  Modal,
  View,
  Pressable,
  StyleSheet,
  Platform,
  Keyboard,
  type KeyboardEvent,
} from "react-native";
import { FullWindowOverlay } from "react-native-screens";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { GatiMitraMerchant, CARD_RADIUS } from "@/constants/theme";
import { acquireMerchantChromeDim } from "@/lib/merchantChromeDim";

/** Extra lift above keyboard so actions aren't clipped by suggestion/tool bars. */
const KEYBOARD_CLEARANCE_PX = 36;

type Props = {
  visible: boolean;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  /** Max height of sheet area, e.g. "94%" */
  maxHeightPercent?: `${number}%`;
  /** Hide the floating close button above the sheet (use an in-sheet close control). */
  hideCloseFab?: boolean;
  /** Lift sheet above the soft keyboard when an input is focused. */
  keyboardAware?: boolean;
};

export function MerchantBottomSheetShell({
  visible,
  onClose,
  children,
  footer,
  maxHeightPercent = "88%",
  hideCloseFab = false,
  keyboardAware = false,
}: Props) {
  const insets = useSafeAreaInsets();
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  useEffect(() => {
    if (!visible) return;
    return acquireMerchantChromeDim();
  }, [visible]);

  useEffect(() => {
    if (!keyboardAware || !visible) {
      setKeyboardHeight(0);
      return;
    }
    const onShow = (e: KeyboardEvent) => {
      setKeyboardHeight(e.endCoordinates?.height ?? 0);
    };
    const onHide = () => setKeyboardHeight(0);
    const showSub = Keyboard.addListener(
      Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow",
      onShow
    );
    const hideSub = Keyboard.addListener(
      Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide",
      onHide
    );
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, [keyboardAware, visible]);

  const sheet = (
    <View
      style={[
        styles.sheetWrap,
        { maxHeight: maxHeightPercent },
        keyboardAware && keyboardHeight > 0
          ? {
              marginBottom: Math.max(
                0,
                keyboardHeight -
                  (Platform.OS === "android" ? insets.bottom : 0) +
                  KEYBOARD_CLEARANCE_PX
              ),
            }
          : null,
      ]}
    >
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
  );

  const overlayBody = (
    <View style={styles.overlay}>
      <Pressable style={styles.dismissArea} onPress={onClose} accessibilityLabel="Close" />
      {sheet}
    </View>
  );

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
      presentationStyle="overFullScreen"
      {...(Platform.OS === "android" ? { navigationBarTranslucent: true } : null)}
    >
      {Platform.OS === "ios" ? (
        <FullWindowOverlay style={StyleSheet.absoluteFill}>{overlayBody}</FullWindowOverlay>
      ) : (
        overlayBody
      )}
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.55)",
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
