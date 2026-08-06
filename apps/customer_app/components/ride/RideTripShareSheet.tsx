/**
 * Live order share sheet — WhatsApp, SMS, Telegram, copy link.
 * Supports food delivery and person-ride with appropriate copy.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { AppText } from "@/components/AppText";

import { View, StyleSheet, TouchableOpacity, Modal, ActivityIndicator, Alert, Linking, Platform, Share } from "react-native";
import * as Clipboard from "expo-clipboard";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { createTripShareLink } from "@/services/tripShare.service";

type RideTripShareSheetProps = {
  visible: boolean;
  orderId: string;
  /** Food uses order/delivery wording; ride keeps trip wording. */
  shareKind?: "food" | "ride";
  onClose: () => void;
};

type ShareChannel = "whatsapp" | "sms" | "telegram" | "copy" | "more";

export function RideTripShareSheet({
  visible,
  orderId,
  shareKind = "ride",
  onClose,
}: RideTripShareSheetProps) {
  const insets = useSafeAreaInsets();
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const isFood = shareKind === "food";

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [shareMessage, setShareMessage] = useState<string | null>(null);
  const [fetchKey, setFetchKey] = useState(0);

  useEffect(() => {
    if (!visible) {
      setLoading(false);
      setError(null);
      setShareUrl(null);
      setShareMessage(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);
    setShareUrl(null);
    setShareMessage(null);

    void createTripShareLink(orderId)
      .then((res) => {
        if (cancelled) return;
        setShareUrl(res.url);
        setShareMessage(res.shareMessage);
      })
      .catch(() => {
        if (cancelled) return;
        setError("Could not create a live tracking link right now.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [visible, orderId, fetchKey]);

  const retry = useCallback(() => setFetchKey((k) => k + 1), []);

  const handleChannel = useCallback(
    async (channel: ShareChannel) => {
      if (!shareUrl || !shareMessage) return;
      const encodedText = encodeURIComponent(shareMessage);
      const encodedUrl = encodeURIComponent(shareUrl);
      const shortLabel = isFood ? "Track my GatiMitra order" : "Track my GatiMitra trip";
      const moreTitle = isFood ? "GatiMitra Live Order" : "GatiMitra Live Trip";

      try {
        if (channel === "copy") {
          await Clipboard.setStringAsync(shareMessage);
          Alert.alert("Link copied", isFood ? "Live order link copied to clipboard." : "Live trip link copied to clipboard.");
          return;
        }
        if (channel === "whatsapp") {
          const url = `whatsapp://send?text=${encodedText}`;
          const supported = await Linking.canOpenURL(url);
          if (supported) {
            await Linking.openURL(url);
            return;
          }
        }
        if (channel === "sms") {
          const sep = Platform.OS === "ios" ? "&" : "?";
          await Linking.openURL(`sms:${sep}body=${encodedText}`);
          return;
        }
        if (channel === "telegram") {
          await Linking.openURL(
            `https://t.me/share/url?url=${encodedUrl}&text=${encodeURIComponent(shortLabel)}`
          );
          return;
        }
        await Share.share({ message: shareMessage, url: shareUrl, title: moreTitle });
      } catch {
        Alert.alert("Could not share", "Please try another option.");
      }
    },
    [isFood, shareMessage, shareUrl]
  );

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={() => onCloseRef.current()}
      statusBarTranslucent
      navigationBarTranslucent
    >
      <View style={styles.overlay}>
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={() => onCloseRef.current()} />
        <View
          style={[
            styles.sheet,
            {
              paddingBottom: Math.max(insets.bottom, 8),
            },
          ]}
        >
          <View style={styles.handle} />
          <AppText style={styles.title}>
            {isFood ? "Share live order tracking" : "Share live trip"}
          </AppText>
          <AppText style={styles.subtitle}>
            {isFood
              ? "Friends and family can track your order in real time. Link expires when the order is delivered or cancelled."
              : "Friends and family can track your ride in real time. Link expires when the trip ends."}
          </AppText>

          {loading ? (
            <View style={styles.loadingWrap}>
              <ActivityIndicator color="#137333" />
              <AppText style={styles.loadingText}>Generating secure link…</AppText>
            </View>
          ) : error ? (
            <View style={styles.errorWrap}>
              <AppText style={styles.errorText}>{error}</AppText>
              <TouchableOpacity style={styles.retryBtn} onPress={retry} activeOpacity={0.85}>
                <AppText style={styles.retryBtnText}>Try again</AppText>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              {shareUrl ? (
                <View style={styles.urlBox}>
                  <AppText style={styles.urlText} numberOfLines={2}>
                    {shareUrl}
                  </AppText>
                </View>
              ) : null}

              <View style={styles.grid}>
                <ShareBtn icon="logo-whatsapp" label="WhatsApp" color="#25D366" onPress={() => handleChannel("whatsapp")} />
                <ShareBtn icon="chatbubble-outline" label="SMS" color="#4285F4" onPress={() => handleChannel("sms")} />
                <ShareBtn icon="paper-plane-outline" label="Telegram" color="#0088CC" onPress={() => handleChannel("telegram")} />
                <ShareBtn icon="copy-outline" label="Copy Link" color="#374151" onPress={() => handleChannel("copy")} />
              </View>

              <TouchableOpacity style={styles.moreBtn} onPress={() => handleChannel("more")} activeOpacity={0.85}>
                <Ionicons name="share-social-outline" size={18} color="#111827" />
                <AppText style={styles.moreBtnText}>More options</AppText>
              </TouchableOpacity>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

function ShareBtn({
  icon,
  label,
  color,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  color: string;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity style={styles.shareBtn} onPress={onPress} activeOpacity={0.85}>
      <View style={[styles.shareIconWrap, { backgroundColor: `${color}18` }]}>
        <Ionicons name={icon} size={22} color={color} />
      </View>
      <AppText style={styles.shareLabel}>{label}</AppText>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: "flex-end",
    zIndex: 100,
  },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(15,23,42,0.42)" },
  sheet: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    paddingHorizontal: 18,
    paddingTop: 10,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#D1D5DB",
    alignSelf: "center",
    marginBottom: 14,
  },
  title: { fontSize: 18, fontWeight: "800", color: "#111827" },
  subtitle: { marginTop: 6, fontSize: 13, lineHeight: 18, color: "#6B7280", fontWeight: "500" },
  loadingWrap: { alignItems: "center", paddingVertical: 28, gap: 10 },
  loadingText: { fontSize: 13, color: "#6B7280", fontWeight: "600" },
  errorWrap: { alignItems: "center", paddingVertical: 24, gap: 12 },
  errorText: { fontSize: 13, color: "#B45309", fontWeight: "600", textAlign: "center" },
  retryBtn: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: "#137333",
  },
  retryBtnText: { fontSize: 14, fontWeight: "700", color: "#FFFFFF" },
  urlBox: {
    marginTop: 14,
    backgroundColor: "#F3F4F6",
    borderRadius: 12,
    padding: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#E5E7EB",
  },
  urlText: { fontSize: 12, color: "#374151", fontWeight: "600" },
  grid: {
    marginTop: 16,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    justifyContent: "space-between",
  },
  shareBtn: { width: "47%", alignItems: "center", gap: 8, paddingVertical: 8 },
  shareIconWrap: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: "center",
    justifyContent: "center",
  },
  shareLabel: { fontSize: 12, fontWeight: "700", color: "#374151" },
  moreBtn: {
    marginTop: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 13,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    backgroundColor: "#FAFBFC",
  },
  moreBtnText: { fontSize: 14, fontWeight: "700", color: "#111827" },
});
