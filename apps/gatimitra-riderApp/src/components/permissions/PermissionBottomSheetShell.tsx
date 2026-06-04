import React from "react";
import {
  View,
  Modal,
  StyleSheet,
  Platform,
  useWindowDimensions,
  type ViewStyle,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type PermissionBottomSheetShellProps = {
  visible: boolean;
  children: React.ReactNode;
  maxHeightRatio?: number;
  sheetStyle?: ViewStyle;
};

/** Bottom sheet shell for mandatory permission prompts — no dismiss on backdrop tap. */
export function PermissionBottomSheetShell({
  visible,
  children,
  maxHeightRatio = 0.72,
  sheetStyle,
}: PermissionBottomSheetShellProps) {
  const insets = useSafeAreaInsets();
  const { height: winH } = useWindowDimensions();
  const maxH = Math.round(winH * maxHeightRatio);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      statusBarTranslucent
      presentationStyle="overFullScreen"
    >
      <View style={styles.root}>
        <View style={styles.backdrop} />
        <View style={[styles.anchor, { maxHeight: maxH }]}>
          <View style={styles.handle} />
          <View
            style={[
              styles.sheet,
              { paddingBottom: Math.max(insets.bottom, 16) },
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
    backgroundColor: "rgba(15, 23, 42, 0.55)",
  },
  anchor: {
    width: "100%",
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
    overflow: "hidden",
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
