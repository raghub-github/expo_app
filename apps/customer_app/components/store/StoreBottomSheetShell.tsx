import React, { useEffect, useState } from "react";
import {
  View,
  Modal,
  Pressable,
  TouchableOpacity,
  StyleSheet,
  Platform,
  Keyboard,
  Dimensions,
  useWindowDimensions,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { useModalSheetBottomInset } from "@/hooks/useModalSheetBottomInset";
import { Ionicons } from "@expo/vector-icons";
import { MerchantDarkPalette, useMerchantUiDark } from "@/features/merchant-detail/merchantUiTheme";

export type StoreBottomSheetShellProps = {
  visible: boolean;
  onClose: () => void;
  children: React.ReactNode;
  /** Max fraction of screen height (0–1). Default 0.88 */
  maxHeightRatio?: number;
  sheetStyle?: StyleProp<ViewStyle>;
  /** Sheet + footer extend flush to device bottom; safe area applied by child footer only. */
  flushBottom?: boolean;
  /** Lift sheet above the software keyboard when a field inside is focused. */
  keyboardAvoiding?: boolean;
  /**
   * Backdrop dim (0–1). Default 0.5. Use a low value (e.g. 0.18) for
   * Magicpin-style payment prep sheets that should not black out checkout.
   */
  backdropOpacity?: number;
  /** Floating X above the sheet. Default true. */
  showCloseButton?: boolean;
  /** Tap dimmed area to dismiss. Default true. */
  closeOnBackdropPress?: boolean;
  /** Optional content stacked above the sheet card (below the floating X). */
  aboveSheet?: React.ReactNode;
};

/** Shared bottom sheet shell — flush to device bottom edge, floating close above sheet. */
export function StoreBottomSheetShell({
  visible,
  onClose,
  children,
  maxHeightRatio = 0.88,
  sheetStyle,
  flushBottom = false,
  keyboardAvoiding = false,
  backdropOpacity = 0.5,
  showCloseButton = true,
  closeOnBackdropPress = true,
  aboveSheet,
}: StoreBottomSheetShellProps) {
  const sheetBottom = useModalSheetBottomInset(12);
  const dark = useMerchantUiDark();
  const { height: winH } = useWindowDimensions();
  const maxH = Math.round(winH * maxHeightRatio);
  const [keyboardInset, setKeyboardInset] = useState(0);

  useEffect(() => {
    if (!visible || !keyboardAvoiding) {
      setKeyboardInset(0);
      return;
    }
    const showEvt = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvt = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const lockedScreenH = Dimensions.get("screen").height;
    const showSub = Keyboard.addListener(showEvt, (e) => {
      const kbH = Math.max(0, e.endCoordinates.height);
      const windowH = Dimensions.get("window").height;
      const alreadyResized = lockedScreenH - windowH >= kbH * 0.55;
      // Avoid double-counting when android resize already shrank the window.
      setKeyboardInset(alreadyResized ? 0 : kbH);
    });
    const hideSub = Keyboard.addListener(hideEvt, () => setKeyboardInset(0));
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, [visible, keyboardAvoiding]);

  const bottomLift = keyboardAvoiding ? keyboardInset : 0;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
      presentationStyle="overFullScreen"
    >
      <View style={styles.root}>
        <Pressable
          style={[
            styles.backdrop,
            {
              backgroundColor: `rgba(0,0,0,${Math.min(1, Math.max(0, backdropOpacity))})`,
            },
          ]}
          onPress={closeOnBackdropPress ? onClose : undefined}
          accessibilityRole={closeOnBackdropPress ? "button" : undefined}
        />
        <View style={[styles.anchor, { maxHeight: maxH, marginBottom: bottomLift }]}>
          {showCloseButton ? (
            <TouchableOpacity style={styles.closeBtn} onPress={onClose} hitSlop={12} activeOpacity={0.85}>
              <Ionicons name="close" size={22} color="#fff" />
            </TouchableOpacity>
          ) : null}
          {aboveSheet ? <View style={styles.aboveSheet}>{aboveSheet}</View> : null}
          <View
            style={[
              styles.sheet,
              dark && styles.sheetDark,
              flushBottom
                ? [
                    styles.sheetFlush,
                    {
                      maxHeight:
                        maxH - (showCloseButton ? 54 : 0) - (aboveSheet ? 72 : 0),
                    },
                  ]
                : { paddingBottom: sheetBottom },
              sheetStyle,
            ]}
          >
            {children}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: "flex-end",
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  anchor: {
    width: "100%",
    alignItems: "center",
  },
  closeBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(0,0,0,0.78)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
    ...(Platform.OS === "android"
      ? { elevation: 8 }
      : { shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.25, shadowRadius: 4 }),
  },
  aboveSheet: {
    width: "100%",
    paddingHorizontal: 12,
    marginBottom: 10,
  },
  sheet: {
    width: "100%",
    backgroundColor: "#fff",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    overflow: "hidden",
  },
  sheetDark: {
    backgroundColor: MerchantDarkPalette.surface,
  },
  sheetFlush: {
    paddingBottom: 0,
    marginBottom: 0,
    flexDirection: "column",
  },
});
