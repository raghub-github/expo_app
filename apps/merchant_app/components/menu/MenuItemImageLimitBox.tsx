import { AppText as Text } from "@/components/AppText";
import { View, Image, StyleSheet, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { GatiMitraMerchant, CARD_RADIUS, H_PADDING } from "@/constants/theme";
import { AuthProxyImage } from "@/components/AuthProxyImage";
import type { MenuImageUploadStatus } from "@/services/menuApi";

type Props = {
  status: MenuImageUploadStatus;
  previewUri?: string | null;
  remoteImageUrl?: string | null;
  token?: string | null;
  compact?: boolean;
  onInfoPress?: () => void;
};

export function MenuItemImageLimitBox({
  status,
  previewUri,
  remoteImageUrl,
  token,
  compact = false,
  onInfoPress,
}: Props) {
  const limit = status.maxImageUploads;
  const limitLabel = limit != null ? `${limit}/${limit}` : "Limit";

  return (
    <View style={[styles.wrap, compact && styles.wrapCompact]}>
      {onInfoPress ? (
        <TouchableOpacity style={styles.infoBtn} onPress={onInfoPress} hitSlop={8}>
          <Ionicons name="information-circle" size={18} color="#D97706" />
        </TouchableOpacity>
      ) : null}
      <View style={styles.previewBox}>
        {previewUri ? (
          <Image source={{ uri: previewUri }} style={styles.preview} resizeMode="cover" />
        ) : remoteImageUrl && token ? (
          <AuthProxyImage uri={remoteImageUrl} token={token} style={styles.preview} resizeMode="cover" />
        ) : remoteImageUrl ? (
          <Image source={{ uri: remoteImageUrl }} style={styles.preview} resizeMode="cover" />
        ) : (
          <Ionicons name="image-outline" size={22} color="#9CA3AF" />
        )}
      </View>
      <Text style={styles.countText}>{limitLabel}</Text>
      <Text style={styles.limitText}>Limit Exceeded</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginHorizontal: H_PADDING,
    marginTop: 16,
    width: "auto",
    alignSelf: "stretch",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: CARD_RADIUS,
    borderWidth: 1,
    borderColor: "#FECACA",
    backgroundColor: "#F3F4F6",
    paddingVertical: 14,
    paddingHorizontal: 12,
    position: "relative",
  },
  wrapCompact: {
    paddingVertical: 10,
  },
  infoBtn: {
    position: "absolute",
    top: 8,
    right: 8,
    zIndex: 1,
  },
  previewBox: {
    width: 64,
    height: 64,
    borderRadius: 8,
    overflow: "hidden",
    backgroundColor: "#E5E7EB",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 6,
  },
  preview: {
    width: "100%",
    height: "100%",
  },
  countText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#4B5563",
  },
  limitText: {
    marginTop: 2,
    fontSize: 10,
    fontWeight: "700",
    color: GatiMitraMerchant.error,
  },
});
