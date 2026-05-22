import React from "react";
import {
  View,
  Modal,
  Pressable,
  TouchableOpacity,
  StyleSheet,
  Platform,
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
};

/** Shared bottom sheet shell — flush to device bottom edge, floating close above sheet. */
export function StoreBottomSheetShell({
  visible,
  onClose,
  children,
  maxHeightRatio = 0.88,
  sheetStyle,
  flushBottom = false,
}: StoreBottomSheetShellProps) {
  const insets = useSafeAreaInsets();
  const { height: winH } = useWindowDimensions();
  const maxH = Math.round(winH * maxHeightRatio);

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
        <View style={[styles.anchor, { maxHeight: maxH }]}>
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
