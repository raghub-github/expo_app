import React from "react";
import { View, Text, Image, Pressable, StyleSheet, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "@/src/theme";

const ACCENT = "#39d353";
const ACCENT_DARK = "#22a745";

export function DocumentPhotoSlot({
  uri,
  onPress,
  onRemove,
  disabled,
  boxTitle,
  boxSub,
  icon = "camera-outline",
}: {
  uri: string | null;
  onPress: () => void;
  onRemove: () => void;
  disabled?: boolean;
  boxTitle: string;
  boxSub: string;
  icon?: keyof typeof Ionicons.glyphMap;
}) {
  return (
    <View style={styles.slot}>
      <Pressable
        onPress={onPress}
        disabled={disabled || Boolean(uri)}
        accessibilityRole="button"
        accessibilityLabel={boxTitle}
        style={({ pressed }) => [
          styles.dropBox,
          uri ? styles.dropBoxFilled : null,
          !uri && pressed && !disabled && styles.dropBoxPressed,
          disabled && styles.disabled,
        ]}
      >
        {uri ? (
          <Image source={{ uri }} style={styles.preview} resizeMode="cover" />
        ) : (
          <View style={styles.emptyContent}>
            <View style={styles.emptyIconCircle}>
              <Ionicons name={icon} size={26} color={ACCENT_DARK} />
            </View>
            <Text style={styles.title}>{boxTitle}</Text>
            <Text style={styles.sub}>{boxSub}</Text>
          </View>
        )}

        {uri ? (
          <Pressable
            onPress={(e) => {
              e.stopPropagation?.();
              onRemove();
            }}
            style={styles.removeBtn}
            hitSlop={8}
          >
            <Ionicons name="close-circle" size={22} color="#ffffff" />
          </Pressable>
        ) : null}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  slot: {
    gap: 8,
  },
  dropBox: {
    width: "100%",
    minHeight: 140,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: colors.gray[300],
    borderStyle: "dashed",
    backgroundColor: colors.gray[50],
    overflow: "hidden",
    position: "relative",
    alignItems: "center",
    justifyContent: "center",
  },
  dropBoxFilled: {
    borderStyle: "solid",
    borderColor: ACCENT,
    backgroundColor: "#ffffff",
  },
  dropBoxPressed: {
    opacity: 0.92,
    backgroundColor: "#eefbf1",
    borderColor: ACCENT,
  },
  disabled: {
    opacity: 0.5,
  },
  emptyContent: {
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
    paddingVertical: 16,
    width: "100%",
  },
  emptyIconCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: "#e8fced",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "rgba(57, 211, 83, 0.25)",
  },
  preview: {
    width: "100%",
    height: 140,
    backgroundColor: colors.gray[100],
  },
  title: {
    fontSize: 15,
    color: colors.gray[800],
    fontWeight: "700",
    textAlign: "center",
    marginBottom: 4,
  },
  sub: {
    fontSize: 13,
    color: colors.gray[500],
    textAlign: "center",
    lineHeight: 18,
  },
  removeBtn: {
    position: "absolute",
    top: 8,
    right: 8,
    backgroundColor: "rgba(0,0,0,0.45)",
    borderRadius: 14,
    zIndex: 2,
  },
});
