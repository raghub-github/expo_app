import { AppText as Text } from "@/components/AppText";
import { ActivityIndicator, Image, StyleSheet, View, useWindowDimensions } from "react-native";
import { StatusBar } from "expo-status-bar";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { GatiMitraMerchant } from "@/constants/theme";

/** Partner splash mark — GatiMitra / Partner Control. */
const APP_ICON = require("../assets/images/splash-logo.png");

const LORA_BOLD = "Lora_700Bold";
const LORA_REGULAR = "Lora_400Regular";

type Props = {
  statusMessage?: string | null;
};

/** Startup / session loading — icon + title + subtitle. */
export function MerchantBootstrapScreen({ statusMessage = null }: Props) {
  const insets = useSafeAreaInsets();
  const { height, width } = useWindowDimensions();
  const iconSize = Math.min(200, Math.round(width * 0.46));

  return (
    <View
      style={[styles.root, { minHeight: height }]}
      accessibilityLabel="GatiMitra Partner loading"
    >
      <StatusBar style="dark" backgroundColor="#FFFFFF" />
      <View style={styles.center}>
        <View
          style={[
            styles.iconShadow,
            { width: iconSize, height: iconSize, borderRadius: Math.round(iconSize * 0.18) },
          ]}
        >
          <Image
            source={APP_ICON}
            style={{
              width: iconSize,
              height: iconSize,
              borderRadius: Math.round(iconSize * 0.18),
            }}
            resizeMode="contain"
            accessibilityLabel="GatiMitra Partner app icon"
          />
        </View>
        <Text style={styles.title}>GatiMitra Partner</Text>
        <Text style={styles.subtitle}>Powering Local Businesses.</Text>
        <ActivityIndicator
          style={styles.spinner}
          size="small"
          color={GatiMitraMerchant.primary}
        />
      </View>
      {statusMessage ? (
        <View style={[styles.statusDock, { bottom: Math.max(insets.bottom, 16) + 12 }]}>
          <Text style={styles.statusText}>{statusMessage}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    width: "100%",
    backgroundColor: "#FFFFFF",
  },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 28,
  },
  iconShadow: {
    marginBottom: 20,
    backgroundColor: "#000000",
    overflow: "hidden",
    shadowColor: "#0F172A",
    shadowOpacity: 0.2,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  title: {
    fontFamily: LORA_BOLD,
    fontSize: 24,
    color: "#0F172A",
    letterSpacing: 0.2,
    textAlign: "center",
  },
  subtitle: {
    fontFamily: LORA_REGULAR,
    marginTop: 8,
    fontSize: 14,
    lineHeight: 20,
    color: "#475569",
    letterSpacing: 0.2,
    textAlign: "center",
    paddingHorizontal: 12,
  },
  spinner: {
    marginTop: 22,
  },
  statusDock: {
    position: "absolute",
    left: 24,
    right: 24,
  },
  statusText: {
    textAlign: "center",
    fontSize: 13,
    color: "#64748B",
  },
});
