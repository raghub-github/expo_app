import { ActivityIndicator, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { StatusBar } from "expo-status-bar";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppAssetImage } from "@/components/AppAssetImage";
import { MX } from "@/lib/appAssetKeys";
import { GatiMitraMerchant } from "@/constants/theme";

const FALLBACK_APP_ICON = require("@/assets/mxappicon.png");

type Props = {
  statusMessage?: string | null;
};

/** Startup / session loading mark — uses Super Admin `merchant.brand.app_icon`. */
export function MerchantBootstrapScreen({ statusMessage = null }: Props) {
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();

  return (
    <View
      style={[styles.root, { minHeight: height }]}
      accessibilityLabel="GatiMitra Merchant loading"
    >
      <StatusBar style="dark" backgroundColor="#FFFFFF" />
      <View style={styles.center}>
        <View style={styles.iconShadow}>
          <AppAssetImage
            assetKey={MX.brand.appIcon}
            fallbackAssetKey={MX.auth.logo}
            fallbackSource={FALLBACK_APP_ICON}
            style={styles.appIcon}
            resizeMode="contain"
            accessibilityLabel="GatiMitra Merchant app icon"
          />
        </View>
        <Text style={styles.title}>GatiMitra Merchant</Text>
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
    borderRadius: 22,
    marginBottom: 18,
    backgroundColor: "#FFFFFF",
    shadowColor: "#0F172A",
    shadowOpacity: 0.18,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  appIcon: {
    width: 96,
    height: 96,
    borderRadius: 22,
  },
  title: {
    fontSize: 20,
    fontWeight: "700",
    color: "#0F172A",
    letterSpacing: 0.2,
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
