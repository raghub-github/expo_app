/**
 * Sign up — opens partner.gatimitra.com in the same app (Zomato-style in-app browser).
 */

import { AppText as Text } from "@/components/AppText";
import { View, StyleSheet, Pressable } from "react-native";
import { useRouter } from "expo-router";
import { WebView } from "react-native-webview";
import { useState } from "react";
import { GatiMitraMerchant } from "@/constants/theme";

const PARTNER_SIGNUP_URL = "https://partner.gatimitra.com";

export default function SignupWebViewScreen() {
  const router = useRouter();
  const [key, setKey] = useState(0);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.closeBtn}>
          <Text style={styles.closeText}>← Back</Text>
        </Pressable>
        <Text style={styles.title} numberOfLines={1}>
          Partner sign up
        </Text>
      </View>
      <WebView
        key={key}
        source={{ uri: PARTNER_SIGNUP_URL }}
        style={styles.webview}
        startInLoadingState
        javaScriptEnabled
        domStorageEnabled
        sharedCookiesEnabled
        incognito={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: GatiMitraMerchant.background },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    paddingTop: 48,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: GatiMitraMerchant.border,
  },
  closeBtn: { padding: 8, marginRight: 8 },
  closeText: { fontSize: 16, color: GatiMitraMerchant.primary, fontWeight: "600" },
  title: { flex: 1, fontSize: 18, fontWeight: "600", color: GatiMitraMerchant.textPrimary },
  webview: { flex: 1 },
});
