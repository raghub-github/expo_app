import React, { useEffect, useState } from "react";
import {
  View,
  Modal,
  Pressable,
  StyleSheet,
  Platform,
  Keyboard,
  KeyboardAvoidingView,
  useWindowDimensions,
  type KeyboardEvent,
  type ViewStyle,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRiderBottomInset } from "@/src/hooks/useRiderBottomInset";

type DismissibleBottomSheetShellProps = {
  visible: boolean;
  onDismiss: () => void;
  children: React.ReactNode;
  maxHeightRatio?: number;
  minHeightRatio?: number;
  sheetStyle?: ViewStyle;
  /** When false, only the sheet's own handle should be used (avoids double handle). */
  showOuterHandle?: boolean;
  /**
   * Inner bottom padding for sheet content (e.g. tab bar + system nav) so controls stay
   * tappable while the sheet background stays flush with the screen bottom edge.
   */
  bottomOffset?: number;
  /** Overrides `bottomOffset` for inner padding when both are set. */
  sheetBottomPadding?: number;
  /**
   * Shrink the sheet above the software keyboard (OTP / text fields).
   * Avoid extra marginBottom on the sheet — Android uses resize layout mode.
   */
  keyboardAware?: boolean;
};

export function DismissibleBottomSheetShell({
  visible,
  onDismiss,
  children,
  maxHeightRatio = 0.88,
  minHeightRatio,
  sheetStyle,
  showOuterHandle = true,
  bottomOffset = 0,
  sheetBottomPadding,
  keyboardAware = false,
}: DismissibleBottomSheetShellProps) {
  const insets = useSafeAreaInsets();
  const systemBottom = useRiderBottomInset();
  const { height: winH } = useWindowDimensions();
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  useEffect(() => {
    if (!keyboardAware || !visible) {
      setKeyboardHeight(0);
      return;
    }

    const onShow = (event: KeyboardEvent) => {
      setKeyboardHeight(event.endCoordinates.height);
    };
    const onHide = () => setKeyboardHeight(0);

    const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";

    const showSub = Keyboard.addListener(showEvent, onShow);
    const hideSub = Keyboard.addListener(hideEvent, onHide);
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, [keyboardAware, visible]);

  const ratioMaxH = Math.round(winH * maxHeightRatio);
  const keyboardOpen = keyboardAware && keyboardHeight > 0;
  const maxH = keyboardOpen
    ? Math.max(240, winH - keyboardHeight - insets.top - 12)
    : ratioMaxH;
  const minH = minHeightRatio != null ? Math.round(winH * minHeightRatio) : undefined;
  const innerPad =
    sheetBottomPadding ?? (bottomOffset > 0 ? bottomOffset : systemBottom);
  const keyboardLift =
    keyboardOpen && Platform.OS === "android" ? keyboardHeight : 0;

  const sheetNode = (
    <View style={styles.root}>
      <Pressable style={styles.backdrop} onPress={onDismiss} accessibilityLabel="Close" />
      <View
        style={[
          styles.anchor,
          { maxHeight: maxH, minHeight: minH, marginBottom: keyboardLift },
        ]}
      >
        {showOuterHandle ? <View style={styles.handle} /> : null}
        <View style={[styles.sheet, { maxHeight: maxH, paddingBottom: innerPad }, sheetStyle]}>
          {children}
        </View>
      </View>
    </View>
  );

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      statusBarTranslucent
      presentationStyle="overFullScreen"
      onRequestClose={onDismiss}
    >
      {keyboardAware ? (
        <KeyboardAvoidingView
          style={styles.keyboardRoot}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          enabled={Platform.OS === "ios"}
          keyboardVerticalOffset={insets.top}
        >
          {sheetNode}
        </KeyboardAvoidingView>
      ) : (
        sheetNode
      )}
    </Modal>
  );
}

const styles = StyleSheet.create({
  keyboardRoot: {
    flex: 1,
  },
  root: {
    flex: 1,
    justifyContent: "flex-end",
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(15, 23, 42, 0.55)",
  },
  anchor: {
    width: "100%",
    flexShrink: 0,
  },
  handle: {
    alignSelf: "center",
    width: 44,
    height: 5,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.85)",
    marginBottom: 8,
  },
  sheet: {
    width: "100%",
    backgroundColor: "#ffffff",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    ...(Platform.OS === "android"
      ? { elevation: 16 }
      : {
          shadowColor: "#000",
          shadowOffset: { width: 0, height: -4 },
          shadowOpacity: 0.12,
          shadowRadius: 12,
        }),
  },
});
