import React, { useEffect, useState } from "react";
import {
  View,
  Modal,
  Pressable,
  TouchableOpacity,
  StyleSheet,
  Platform,
  Keyboard,
  useWindowDimensions,
  type ViewStyle,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";

export type StoreBottomSheetShellProps = {
  visible: boolean;
  onClose: () => void;
  children: React.ReactNode;
  /** Max fraction of screen height (0–1). Default 0.88 */
  maxHeightRatio?: number;
  sheetStyle?: ViewStyle;
  /** Sheet + footer extend flush to device bottom; safe area applied by child footer only. */
  flushBottom?: boolean;
  /** Lift sheet above the software keyboard when a field inside is focused. */
  keyboardAvoiding?: boolean;
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
}: StoreBottomSheetShellProps) {
  const insets = useSafeAreaInsets();
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
    const showSub = Keyboard.addListener(showEvt, (e) => {
      setKeyboardInset(e.endCoordinates.height);
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
        <Pressable style={styles.backdrop} onPress={onClose} accessibilityRole="button" />
        <View style={[styles.anchor, { maxHeight: maxH, marginBottom: bottomLift }]}>
          <TouchableOpacity style={styles.closeBtn} onPress={onClose} hitSlop={12} activeOpacity={0.85}>
            <Ionicons name="close" size={22} color="#fff" />
          </TouchableOpacity>
          <View
            style={[
              styles.sheet,
              flushBottom ? [styles.sheetFlush, { maxHeight: maxH - 54 }] : { paddingBottom: Math.max(insets.bottom, 12) },
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
    backgroundColor: "rgba(0,0,0,0.5)",
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
  sheet: {
    width: "100%",
    backgroundColor: "#fff",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    overflow: "hidden",
  },
  sheetFlush: {
    paddingBottom: 0,
    marginBottom: 0,
    flexDirection: "column",
  },
});
