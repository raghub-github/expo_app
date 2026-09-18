import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  Image,
  Pressable,
  StyleSheet,
  Modal,
  Linking,
  ActivityIndicator,
  useWindowDimensions,
  Platform,
  Alert,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as WebBrowser from "expo-web-browser";
import { colors } from "@/src/theme";
import {
  ensureLocalFileUri,
  isLocalMediaUri,
  toAbsoluteImageUrl,
} from "@/src/utils/mediaUrl";
import { OnboardingRemoveConfirmModal } from "@/src/components/onboarding/OnboardingRemoveConfirmModal";

const ACCENT = "#39d353";
const ACCENT_DARK = "#22a745";

/** Open PDF without Android file:// Intent crash (must use content://). */
async function openUploadedPdf(uri: string): Promise<void> {
  const raw = String(uri || "").trim();
  if (!raw) return;

  const absolute = isLocalMediaUri(raw)
    ? ensureLocalFileUri(raw)
    : toAbsoluteImageUrl(raw) ?? raw;

  if (/^https?:\/\//i.test(absolute)) {
    await WebBrowser.openBrowserAsync(absolute);
    return;
  }

  if (Platform.OS === "android" && isLocalMediaUri(absolute)) {
    const FS = await import("expo-file-system/legacy");
    const IntentLauncher = await import("expo-intent-launcher");
    const contentUri = await FS.getContentUriAsync(ensureLocalFileUri(absolute));
    await IntentLauncher.startActivityAsync("android.intent.action.VIEW", {
      data: contentUri,
      flags: 1, // FLAG_GRANT_READ_URI_PERMISSION
      type: "application/pdf",
    });
    return;
  }

  // iOS / other — Linking can open local PDFs into Quick Look.
  const can = await Linking.canOpenURL(absolute);
  if (can) {
    await Linking.openURL(absolute);
    return;
  }
  throw new Error("No app available to open this PDF");
}

export function DocumentPhotoSlot({
  uri,
  onPress,
  onRemove,
  onChangePress,
  disabled,
  removing,
  uploading,
  boxTitle,
  boxSub,
  icon = "camera-outline",
  viewerTitle,
  fileKind,
  removeTitle,
  removeMessage,
  changeLabel = "Change file",
}: {
  uri: string | null;
  onPress: () => void;
  onRemove: () => void | Promise<void>;
  /** When set, shows Change in the same action row as View. */
  onChangePress?: () => void;
  disabled?: boolean;
  removing?: boolean;
  /** Show upload progress overlay inside the image box. */
  uploading?: boolean;
  boxTitle: string;
  boxSub: string;
  icon?: keyof typeof Ionicons.glyphMap;
  /** Full-screen modal title when tapping a filled preview. */
  viewerTitle?: string;
  /** When "pdf", show a PDF chip instead of an image preview. */
  fileKind?: "image" | "pdf";
  removeTitle?: string;
  removeMessage?: string;
  changeLabel?: string;
}) {
  const [viewerOpen, setViewerOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [imgFailed, setImgFailed] = useState(false);
  const [openingPdf, setOpeningPdf] = useState(false);
  const { width: winW, height: winH } = useWindowDimensions();

  const displayUri = (() => {
    const raw = String(uri || "").trim();
    if (!raw) return null;
    if (isLocalMediaUri(raw)) return ensureLocalFileUri(raw);
    return toAbsoluteImageUrl(raw) ?? raw;
  })();

  useEffect(() => {
    setImgFailed(false);
    setViewerOpen(false);
    setConfirmOpen(false);
  }, [displayUri]);

  const hasUri = Boolean(displayUri?.trim());
  const isPdf =
    fileKind === "pdf" ||
    Boolean(displayUri && /\.pdf(\?|#|$)/i.test(displayUri)) ||
    Boolean(displayUri && /application%2Fpdf|mime=pdf/i.test(displayUri));
  const showPreview = hasUri && !imgFailed && !isPdf;
  const showPdfChip = hasUri && isPdf;
  const busy = Boolean(disabled || removing || uploading);
  const showActionRow = hasUri && Boolean(onChangePress || showPdfChip || showPreview) && !uploading;

  const requestRemove = () => {
    if (busy) return;
    setViewerOpen(false);
    setConfirmOpen(true);
  };

  const confirmRemove = () => {
    void (async () => {
      try {
        await onRemove();
      } finally {
        setConfirmOpen(false);
      }
    })();
  };

  const handleViewPdf = () => {
    if (!displayUri || openingPdf || busy) return;
    setOpeningPdf(true);
    void openUploadedPdf(displayUri)
      .catch((err) => {
        console.warn("[DocumentPhotoSlot] open PDF failed", err);
        Alert.alert(
          "Could not open PDF",
          "Install a PDF viewer app, or re-upload the file and try again."
        );
      })
      .finally(() => setOpeningPdf(false));
  };

  const handleViewImage = () => {
    if (!showPreview || busy) return;
    setViewerOpen(true);
  };

  return (
    <View style={styles.slot}>
      <View
        style={[
          styles.dropBox,
          showPreview || showPdfChip ? styles.dropBoxFilled : null,
          busy && !showPreview && !showPdfChip && styles.disabled,
        ]}
      >
        {showPreview ? (
          <Pressable
            onPress={handleViewImage}
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel={`View ${viewerTitle || boxTitle} full screen`}
            style={styles.previewPress}
          >
            <Image
              key={displayUri!}
              source={{ uri: displayUri! }}
              style={styles.preview}
              resizeMode="cover"
              onError={() => setImgFailed(true)}
              onLoad={() => setImgFailed(false)}
              pointerEvents="none"
            />
          </Pressable>
        ) : showPdfChip ? (
          <View style={styles.emptyContent} pointerEvents="none">
            <View style={styles.emptyIconCircle}>
              <Ionicons name="document-text" size={26} color={ACCENT_DARK} />
            </View>
            <Text style={styles.title}>PDF attached</Text>
            <Text style={styles.sub}>Ready to submit · max 5 MB</Text>
          </View>
        ) : (
          <Pressable
            onPress={onPress}
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel={boxTitle}
            style={({ pressed }) => [
              styles.emptyPress,
              pressed && !busy && styles.dropBoxPressed,
            ]}
          >
            <View style={styles.emptyContent} pointerEvents="none">
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
                {hasUri && imgFailed ? "Choose camera, gallery, or PDF again" : boxSub}
              </Text>
            </View>
          </Pressable>
        )}

        {hasUri ? (
          <Pressable
            onPress={requestRemove}
            disabled={busy}
            style={styles.removeBtn}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Remove file"
          >
            {removing ? (
              <ActivityIndicator size="small" color={colors.gray[700]} />
            ) : (
              <Ionicons name="close" size={16} color={colors.gray[700]} />
            )}
          </Pressable>
        ) : null}

        {uploading ? (
          <View style={styles.uploadOverlay} pointerEvents="none">
            <ActivityIndicator size="large" color="#ffffff" />
            <Text style={styles.uploadOverlayText}>Uploading…</Text>
          </View>
        ) : null}
      </View>

      {showActionRow ? (
        <View style={styles.actionRow}>
          {showPdfChip ? (
            <Pressable
              onPress={handleViewPdf}
              disabled={busy || openingPdf}
              style={({ pressed }) => [
                styles.actionBtn,
                styles.actionBtnPrimary,
                (busy || openingPdf) && styles.actionBtnDisabled,
                pressed && !busy && !openingPdf && styles.actionBtnPressed,
              ]}
              accessibilityRole="button"
              accessibilityLabel="View uploaded PDF"
            >
              {openingPdf ? (
                <ActivityIndicator size="small" color={ACCENT_DARK} />
              ) : (
                <Ionicons name="eye-outline" size={16} color={ACCENT_DARK} />
              )}
              <Text style={styles.actionBtnText}>
                {openingPdf ? "Opening…" : "View PDF"}
              </Text>
            </Pressable>
          ) : showPreview ? (
            <Pressable
              onPress={handleViewImage}
              disabled={busy}
              style={({ pressed }) => [
                styles.actionBtn,
                styles.actionBtnPrimary,
                busy && styles.actionBtnDisabled,
                pressed && !busy && styles.actionBtnPressed,
              ]}
              accessibilityRole="button"
              accessibilityLabel="View photo"
            >
              <Ionicons name="eye-outline" size={16} color={ACCENT_DARK} />
              <Text style={styles.actionBtnText}>View</Text>
            </Pressable>
          ) : null}

          {onChangePress ? (
            <Pressable
              onPress={onChangePress}
              disabled={busy}
              style={({ pressed }) => [
                styles.actionBtn,
                styles.actionBtnSecondary,
                busy && styles.actionBtnDisabled,
                pressed && !busy && styles.actionBtnPressed,
              ]}
              accessibilityRole="button"
              accessibilityLabel={changeLabel}
            >
              <Ionicons name="refresh-outline" size={16} color={ACCENT_DARK} />
              <Text style={styles.actionBtnText}>{changeLabel}</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

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
          <View
            style={[
              styles.viewerCard,
              { maxHeight: winH * 0.88, width: Math.min(winW - 24, 520) },
            ]}
          >
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
            {displayUri ? (
              <Image
                key={`viewer-${displayUri}`}
                source={{ uri: displayUri }}
                style={styles.viewerImage}
                resizeMode="contain"
              />
            ) : null}
          </View>
        </View>
      </Modal>

      <OnboardingRemoveConfirmModal
        visible={confirmOpen}
        loading={removing}
        onCancel={() => {
          if (!removing) setConfirmOpen(false);
        }}
        onConfirm={confirmRemove}
        title={removeTitle || "Remove document?"}
        message={
          removeMessage ||
          "Your image will be removed and you need to upload a new one."
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  slot: {
    gap: 10,
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
  previewPress: {
    ...StyleSheet.absoluteFillObject,
  },
  emptyPress: {
    width: "100%",
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
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
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#ffffff",
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.gray[300],
    zIndex: 20,
    elevation: 8,
    shadowColor: "#000",
    shadowOpacity: 0.18,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
  },
  uploadOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(15, 23, 42, 0.55)",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    zIndex: 30,
  },
  uploadOverlayText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "700",
  },
  actionRow: {
    flexDirection: "row",
    alignItems: "stretch",
    gap: 10,
  },
  actionBtn: {
    flex: 1,
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1.5,
  },
  actionBtnPrimary: {
    backgroundColor: "#e8fced",
    borderColor: ACCENT,
  },
  actionBtnSecondary: {
    backgroundColor: "#ffffff",
    borderColor: "#b7ebc4",
  },
  actionBtnPressed: {
    opacity: 0.88,
  },
  actionBtnDisabled: {
    opacity: 0.5,
  },
  actionBtnText: {
    fontSize: 14,
    fontWeight: "700",
    color: ACCENT_DARK,
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
