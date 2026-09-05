import React, { useState } from "react";
import {
  View,
  Text,
  Image,
  Pressable,
  Modal,
  StyleSheet,
  useWindowDimensions,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { toAbsoluteImageUrl } from "@/src/utils/mediaUrl";

type Props = {
  uri?: string | null;
  label: string;
  compact?: boolean;
  /** Small square card for a row (tap opens the full image modal). */
  inline?: boolean;
};

export function OrderLocationPhotoBox({
  uri,
  label,
  compact = false,
  inline = false,
}: Props) {
  const [open, setOpen] = useState(false);
  const { width, height } = useWindowDimensions();
  const trimmed = typeof uri === "string" ? uri.trim() : "";
  const abs = toAbsoluteImageUrl(trimmed) ?? (trimmed || null);
  if (!abs) return null;

  const thumb = (
    <Pressable
      onPress={() => setOpen(true)}
      style={({ pressed }) => [
        inline ? styles.thumbInline : styles.thumb,
        !inline && compact && styles.thumbCompact,
        pressed && styles.thumbPressed,
      ]}
      accessibilityRole="imagebutton"
      accessibilityLabel={label}
    >
      <Image source={{ uri: abs }} style={styles.thumbImage} resizeMode="cover" />
      {inline ? (
        <View style={styles.thumbExpandHint} pointerEvents="none">
          <Ionicons name="expand-outline" size={12} color="#FFFFFF" />
        </View>
      ) : (
        <View style={styles.thumbCaption} pointerEvents="none">
          <Ionicons name="expand-outline" size={12} color="#FFFFFF" />
          <Text style={styles.thumbCaptionText} numberOfLines={1}>
            {label}
          </Text>
        </View>
      )}
    </Pressable>
  );

  return (
    <View style={inline ? styles.inlineHost : undefined} collapsable={false}>
      {thumb}
      {open ? (
        <Modal
          visible
          transparent
          animationType="fade"
          statusBarTranslucent
          onRequestClose={() => setOpen(false)}
        >
          <View style={styles.modalRoot}>
            <Pressable
              style={styles.backdrop}
              onPress={() => setOpen(false)}
              accessibilityRole="button"
              accessibilityLabel="Close"
            />
            <Image
              source={{ uri: abs }}
              style={{ width: width - 24, height: Math.min(height * 0.78, width * 1.2) }}
              resizeMode="contain"
            />
            <Pressable
              onPress={() => setOpen(false)}
              style={styles.closeBtn}
              accessibilityRole="button"
              accessibilityLabel="Close"
            >
              <Ionicons name="close" size={22} color="#FFFFFF" />
            </Pressable>
          </View>
        </Modal>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  inlineHost: {
    width: 48,
    height: 48,
    borderRadius: 10,
    overflow: "hidden",
    flexShrink: 0,
  },
  thumb: {
    marginTop: 12,
    width: "100%",
    height: 112,
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: "#EEF1F4",
    borderWidth: 1,
    borderColor: "#E8EAED",
  },
  thumbPressed: {
    opacity: 0.88,
  },
  thumbCompact: {
    height: 72,
    marginTop: 8,
    marginBottom: 4,
  },
  thumbInline: {
    width: 48,
    height: 48,
    borderRadius: 10,
    overflow: "hidden",
    backgroundColor: "#EEF1F4",
    borderWidth: 1,
    borderColor: "#E8EAED",
  },
  thumbExpandHint: {
    position: "absolute",
    right: 4,
    bottom: 4,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "rgba(15, 23, 42, 0.62)",
    alignItems: "center",
    justifyContent: "center",
  },
  thumbImage: {
    width: "100%",
    height: "100%",
  },
  thumbCaption: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: "rgba(15, 23, 42, 0.62)",
  },
  thumbCaptionText: {
    flex: 1,
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "700",
  },
  modalRoot: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.92)",
    alignItems: "center",
    justifyContent: "center",
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  closeBtn: {
    position: "absolute",
    top: 48,
    right: 16,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(15, 23, 42, 0.55)",
    alignItems: "center",
    justifyContent: "center",
  },
});
