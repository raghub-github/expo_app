/**
 * In-app DigiLocker browser — Modal + WebView so riders never leave the Rider app.
 * Intercepts Cashfree / DigiLocker HTTPS return + gatimitra-rider:// deep links,
 * then hands control back to the Aadhaar verification screen.
 */
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  BackHandler,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { WebView, type WebViewNavigation } from "react-native-webview";
import { Ionicons } from "@expo/vector-icons";
import { isDigilockerReturnUrl } from "@/src/lib/digilocker";

const ACCENT = "#22a745";

export type DigilockerInAppResult = "returned" | "cancelled" | "error";

type Props = {
  visible: boolean;
  url: string | null;
  /** Shown under the title while the page loads / user consents. */
  subtitle?: string;
  onComplete: (result: DigilockerInAppResult, detail?: string) => void;
};

export function DigilockerInAppBrowser({ visible, url, subtitle, onComplete }: Props) {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const completedRef = useRef(false);

  const finish = useCallback(
    (result: DigilockerInAppResult, detail?: string) => {
      if (completedRef.current) return;
      completedRef.current = true;
      onComplete(result, detail);
    },
    [onComplete]
  );

  useEffect(() => {
    if (!visible) {
      completedRef.current = false;
      setLoading(true);
      setLoadError(null);
      return;
    }
    completedRef.current = false;
  }, [visible, url]);

  useEffect(() => {
    if (!visible) return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      finish("cancelled");
      return true;
    });
    return () => sub.remove();
  }, [visible, finish]);

  const handleMaybeReturn = useCallback(
    (navUrl: string) => {
      if (!navUrl || !isDigilockerReturnUrl(navUrl)) return false;
      finish("returned", navUrl);
      return true;
    },
    [finish]
  );

  const onNavChange = useCallback(
    (nav: WebViewNavigation) => {
      handleMaybeReturn(nav.url);
    },
    [handleMaybeReturn]
  );

  const onShouldStart = useCallback(
    (req: { url: string }) => {
      const next = String(req.url || "");
      if (handleMaybeReturn(next)) return false;

      // Keep http(s) DigiLocker / Cashfree / UIDAI pages inside the WebView.
      if (next.startsWith("https://") || next.startsWith("http://")) {
        return true;
      }

      // about:blank / data: — allow
      if (next.startsWith("about:") || next.startsWith("data:")) {
        return true;
      }

      // Block intent:// / market:// / external app handoff (would leave the Rider app).
      return false;
    },
    [handleMaybeReturn]
  );

  if (!visible || !url) return null;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={() => finish("cancelled")}
    >
      <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
        <View style={styles.header}>
          <Pressable
            onPress={() => finish("cancelled")}
            style={styles.headerBtn}
            accessibilityRole="button"
            accessibilityLabel="Close DigiLocker"
          >
            <Ionicons name="close" size={22} color="#111827" />
          </Pressable>
          <View style={styles.headerCopy}>
            <Text style={styles.title}>DigiLocker verification</Text>
            <Text style={styles.subtitle} numberOfLines={1}>
              {subtitle || "Complete OTP consent, then you will return here"}
            </Text>
          </View>
          <View style={styles.headerBtnSpacer} />
        </View>

        <View style={styles.webWrap}>
          {loadError ? (
            <View style={styles.errorBox}>
              <Ionicons name="alert-circle" size={28} color="#be123c" />
              <Text style={styles.errorTitle}>Could not load DigiLocker</Text>
              <Text style={styles.errorBody}>{loadError}</Text>
              <Pressable style={styles.retryBtn} onPress={() => finish("error", loadError)}>
                <Text style={styles.retryBtnText}>Close and retry</Text>
              </Pressable>
            </View>
          ) : (
            <WebView
              source={{ uri: url }}
              style={styles.web}
              onNavigationStateChange={onNavChange}
              onShouldStartLoadWithRequest={onShouldStart}
              onLoadStart={() => {
                setLoading(true);
                setLoadError(null);
              }}
              onLoadEnd={() => setLoading(false)}
              onError={(e) => {
                setLoading(false);
                setLoadError(e.nativeEvent?.description || "Failed to load DigiLocker page.");
              }}
              onHttpError={(e) => {
                // DigiLocker/Cashfree intermediate pages may 3xx; only hard-fail on return URL 404-ish
                // is handled by intercept. Ignore transient HTTP errors on other hosts.
                if (e.nativeEvent?.statusCode >= 500) {
                  setLoadError(`DigiLocker page error (${e.nativeEvent.statusCode}).`);
                }
              }}
              startInLoadingState
              javaScriptEnabled
              domStorageEnabled
              sharedCookiesEnabled
              thirdPartyCookiesEnabled
              setSupportMultipleWindows={false}
              allowsBackForwardNavigationGestures
              originWhitelist={["https://*", "http://*", "gatimitra-rider://*"]}
            />
          )}

          {loading && !loadError ? (
            <View style={styles.loadingOverlay} pointerEvents="none">
              <ActivityIndicator size="large" color={ACCENT} />
              <Text style={styles.loadingText}>Opening DigiLocker…</Text>
            </View>
          ) : null}
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#fff" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#e5e7eb",
    backgroundColor: "#f8fafc",
  },
  headerBtn: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
  },
  headerBtnSpacer: { width: 40 },
  headerCopy: { flex: 1, alignItems: "center", paddingHorizontal: 4 },
  title: { fontSize: 15, fontWeight: "700", color: "#111827" },
  subtitle: { marginTop: 2, fontSize: 11, color: "#6b7280" },
  webWrap: { flex: 1, backgroundColor: "#fff" },
  web: { flex: 1 },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.72)",
    gap: 10,
  },
  loadingText: { fontSize: 13, color: "#374151", fontWeight: "600" },
  errorBox: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    gap: 8,
  },
  errorTitle: { fontSize: 16, fontWeight: "700", color: "#9f1239" },
  errorBody: { fontSize: 13, color: "#6b7280", textAlign: "center", lineHeight: 18 },
  retryBtn: {
    marginTop: 12,
    backgroundColor: ACCENT,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
  },
  retryBtnText: { color: "#fff", fontWeight: "700", fontSize: 14 },
});
