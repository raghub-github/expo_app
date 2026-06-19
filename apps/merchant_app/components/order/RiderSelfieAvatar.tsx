import { useEffect, useState } from "react";
import {
  View,
  Image,
  Pressable,
  StyleSheet,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { GatiMitraMerchant } from "@/constants/theme";

type Props = {
  selfieUrl?: string | null;
  riderName?: string | null;
  size?: number;
  onPress?: (url: string) => void;
  style?: StyleProp<ViewStyle>;
  borderColor?: string;
};

export function RiderSelfieAvatar({
  selfieUrl,
  riderName,
  size = 48,
  onPress,
  style,
  borderColor = "#BBF7D0",
}: Props) {
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const url = selfieUrl?.trim();
  const hasUrl = Boolean(url);

  useEffect(() => {
    setFailed(false);
    setLoaded(false);
  }, [url]);

  const showPhoto = hasUrl && !failed && loaded;
  const canOpen = showPhoto && Boolean(onPress);

  const radius = size / 2;
  const shellStyle = {
    width: size,
    height: size,
    borderRadius: radius,
    borderWidth: 2,
    borderColor,
  };

  const fallback = (
    <View style={styles.fallback}>
      <Ionicons
        name="bicycle"
        size={Math.round(size * 0.4)}
        color={GatiMitraMerchant.primaryDark}
      />
    </View>
  );

  const inner = (
    <>
      {hasUrl && !failed ? (
        <>
          <Image
            source={{ uri: url! }}
            style={StyleSheet.absoluteFill}
            resizeMode="cover"
            onLoad={() => setLoaded(true)}
            onError={() => setFailed(true)}
            accessibilityLabel={riderName ? `Photo of ${riderName}` : "Rider photo"}
          />
          {!loaded ? (
            <View style={styles.loadingOverlay}>
              {fallback}
            </View>
          ) : null}
        </>
      ) : (
        fallback
      )}
    </>
  );

  const shell = (
    <View style={[styles.shell, shellStyle, style]}>
      {inner}
    </View>
  );

  if (canOpen) {
    return (
      <Pressable
        onPress={() => onPress!(url!)}
        style={({ pressed }) => [pressed && styles.pressed]}
        accessibilityRole="button"
        accessibilityLabel={`View photo of ${riderName ?? "rider"}`}
      >
        {shell}
      </Pressable>
    );
  }

  return shell;
}

const styles = StyleSheet.create({
  shell: {
    overflow: "hidden",
    backgroundColor: GatiMitraMerchant.surfaceSubtle,
  },
  fallback: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: GatiMitraMerchant.surfaceSubtle,
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: GatiMitraMerchant.surfaceSubtle,
  },
  pressed: { opacity: 0.88 },
});
