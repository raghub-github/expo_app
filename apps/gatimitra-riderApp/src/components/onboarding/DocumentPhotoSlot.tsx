import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  Image,
  Pressable,
  StyleSheet,
  Modal,
  useWindowDimensions,
} from "react-native";
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
  viewerTitle,
}: {
  uri: string | null;
  onPress: () => void;
  onRemove: () => void;
  disabled?: boolean;
  boxTitle: string;
  boxSub: string;
  icon?: keyof typeof Ionicons.glyphMap;
  /** Full-screen modal title when tapping a filled preview. */
  viewerTitle?: string;
}) {
  const [viewerOpen, setViewerOpen] = useState(false);
  const [imgFailed, setImgFailed] = useState(false);
  const { width: winW, height: winH } = useWindowDimensions();

  useEffect(() => {
    setImgFailed(false);
    setViewerOpen(false);
  }, [uri]);

  const hasUri = Boolean(uri?.trim());
  const showPreview = hasUri && !imgFailed;

  return (
    <View style={styles.slot}>
      <Pressable
        onPress={() => {
          if (disabled) return;
          if (showPreview) {
            setViewerOpen(true);
            return;
          }
          onPress();
        }}
        disabled={disabled && !showPreview}
        accessibilityRole="button"
        accessibilityLabel={
          showPreview ? `View ${viewerTitle || boxTitle} full screen` : boxTitle
        }
        style={({ pressed }) => [
          styles.dropBox,
          showPreview ? styles.dropBoxFilled : null,
          !showPreview && pressed && !disabled && styles.dropBoxPressed,
          disabled && !showPreview && styles.disabled,
        ]}
      >
        {showPreview ? (
          <>
            <Image
              key={uri!}
              source={{ uri: uri! }}
              style={styles.preview}
              resizeMode="cover"
              onError={() => setImgFailed(true)}
              onLoad={() => setImgFailed(false)}
            />
            <View style={styles.tapHint} pointerEvents="none">
              <Ionicons name="expand-outline" size={14} color="#fff" />
              <Text style={styles.tapHintText}>Tap to view</Text>
            </View>
          </>
        ) : (
          <View style={styles.emptyContent}>
            <View style={styles.emptyIconCircle}>
              <Ionicons
                name={hasUri && imgFailed ? "alert-circle-outline" : icon}
                size={26}
                color={ACCENT_DARK}
              />
            </View>
            <Text style={styles.title}>
              {hasUri && imgFailed ? "Preview failed — tap to re-upload" : boxTitle}
            </Text>
            <Text style={styles.sub}>
              {hasUri && imgFailed ? "Choose camera or gallery again" : boxSub}
            </Text>
          </View>
        )}

        {hasUri ? (
          <Pressable
            onPress={(e) => {
              e.stopPropagation?.();
              setViewerOpen(false);
              setImgFailed(false);
              onRemove();
            }}
            style={styles.removeBtn}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Remove photo"
          >
            <Ionicons name="close-circle" size={22} color="#ffffff" />
          </Pressable>
        ) : null}
      </Pressable>

      <Modal
        visible={viewerOpen && showPreview}
        transparent
        animationType="fade"
        onRequestClose={() => setViewerOpen(false)}
      >
        <View style={styles.viewerRoot}>
          <Pressable
            style={styles.viewerBackdrop}
            onPress={() => setViewerOpen(false)}
            accessibilityRole="button"
            accessibilityLabel="Close photo viewer"
          />
          <View style={[styles.viewerCard, { maxHeight: winH * 0.88, width: Math.min(winW - 24, 520) }]}>
            <View style={styles.viewerHeader}>
              <Text style={styles.viewerTitle} numberOfLines={1}>
                {viewerTitle || boxTitle}
              </Text>
              <Pressable
                onPress={() => setViewerOpen(false)}
                hitSlop={12}
                accessibilityRole="button"
                accessibilityLabel="Close"
              >
                <Ionicons name="close" size={24} color="#0f172a" />
              </Pressable>
            </View>
            {uri ? (
              <Image
                key={`viewer-${uri}`}
                source={{ uri }}
                style={styles.viewerImage}
                resizeMode="contain"
              />
            ) : null}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  slot: {
    gap: 8,
  },
  dropBox: {
    width: "100%",
    height: 168,
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
    ...StyleSheet.absoluteFillObject,
    width: "100%",
    height: "100%",
    backgroundColor: colors.gray[100],
  },
  tapHint: {
    position: "absolute",
    left: 10,
    bottom: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "rgba(15, 23, 42, 0.62)",
  },
  tapHintText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "700",
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
  viewerRoot: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.72)",
    alignItems: "center",
    justifyContent: "center",
    padding: 12,
  },
  viewerBackdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  viewerCard: {
    backgroundColor: "#fff",
    borderRadius: 16,
    overflow: "hidden",
    zIndex: 1,
  },
  viewerHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.gray[200],
    gap: 12,
  },
  viewerTitle: {
    flex: 1,
    fontSize: 16,
    fontWeight: "700",
    color: "#0f172a",
  },
  viewerImage: {
    width: "100%",
    height: 420,
    backgroundColor: "#0f172a",
  },
});
