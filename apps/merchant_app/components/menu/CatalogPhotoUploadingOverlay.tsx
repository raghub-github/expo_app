import { AppText as Text } from "@/components/AppText";
import { View, Image, StyleSheet } from "react-native";
import { GatiMitraMerchant } from "@/constants/theme";

type Props = {
  previewUri: string;
  progress: number;
  useProxy?: boolean;
  token?: string | null;
};

export function CatalogPhotoUploadingOverlay({ previewUri, progress }: Props) {
  const pct = Math.max(0, Math.min(1, progress));

  return (
    <View style={styles.wrap} pointerEvents="none">
      <Image source={{ uri: previewUri }} style={StyleSheet.absoluteFillObject} resizeMode="cover" />
      <View style={styles.dim} />
      <Text style={styles.label}>Uploading...</Text>
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${Math.round(pct * 100)}%` }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 4,
    borderRadius: 10,
    overflow: "hidden",
  },
  dim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.55)",
  },
  label: {
    position: "absolute",
    left: 0,
    right: 0,
    top: "38%",
    textAlign: "center",
    fontSize: 13,
    fontWeight: "700",
    color: "#FFFFFF",
    letterSpacing: 0.2,
  },
  progressTrack: {
    position: "absolute",
    left: 8,
    right: 8,
    bottom: 8,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.35)",
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: 2,
    backgroundColor: GatiMitraMerchant.primary,
  },
});
