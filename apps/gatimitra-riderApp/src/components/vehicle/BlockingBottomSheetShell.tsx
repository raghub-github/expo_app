import React, { useEffect, useState } from "react";
import {
  View,
  Modal,
  StyleSheet,
  Platform,
  Keyboard,
  useWindowDimensions,
  type ViewStyle,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRiderBottomInset } from "@/src/hooks/useRiderBottomInset";

type BlockingBottomSheetShellProps = {
  visible: boolean;
  children: React.ReactNode;
  maxHeightRatio?: number;
  sheetStyle?: ViewStyle;
};

/** Non-dismissible sheet — no backdrop tap, no Android back close. */
export function BlockingBottomSheetShell({
  visible,
  children,
  maxHeightRatio = 0.92,
  sheetStyle,
}: BlockingBottomSheetShellProps) {
  const insets = useSafeAreaInsets();
  const systemBottom = useRiderBottomInset();
  const { height: winH } = useWindowDimensions();
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  useEffect(() => {
    const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";

    const showSub = Keyboard.addListener(showEvent, (e) => {
      setKeyboardHeight(e.endCoordinates.height);
    });
    const hideSub = Keyboard.addListener(hideEvent, () => {
      setKeyboardHeight(0);
    });

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  const maxH = Math.round(winH * maxHeightRatio);
  const sheetMaxHeight =
    keyboardHeight > 0
      ? Math.max(280, winH - keyboardHeight - insets.top - 12)
      : maxH;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      statusBarTranslucent
      presentationStyle="overFullScreen"
      hardwareAccelerated
      onRequestClose={() => {}}
    >
      <View style={styles.root}>
        <View style={styles.backdrop} />
        <View
          style={[
            styles.sheet,
            {
              maxHeight: sheetMaxHeight,
              paddingBottom: Math.max(systemBottom, 12),
            },
            sheetStyle,
          ]}
        >
          <View style={styles.handle} />
          <View style={styles.body}>{children}</View>
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
    backgroundColor: "rgba(15, 23, 42, 0.65)",
  },
  sheet: {
    width: "100%",
    alignSelf: "stretch",
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    paddingTop: 8,
    paddingHorizontal: 20,
    overflow: "hidden",
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: -4 },
        shadowOpacity: 0.12,
        shadowRadius: 16,
      },
      android: { elevation: 24 },
    }),
  },
  handle: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#E2E8F0",
    marginBottom: 10,
  },
  body: {
    width: "100%",
    flexShrink: 1,
  },
});
