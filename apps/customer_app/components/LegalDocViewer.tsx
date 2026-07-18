/**
 * Shared legal document viewer — used from auth login, onboarding, and profile.
 */

import { useCallback, useEffect, useState } from "react";
import { AppText } from "@/components/AppText";

import { View, ScrollView, ActivityIndicator, StyleSheet, Share, TouchableOpacity, Platform } from "react-native";
import { Stack, useRouter, type Href } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import {
  LEGAL_DOC_BY_ID,
  loadLegalDocBody,
  type LegalDoc,
} from "@/lib/legal-registry";
import MarkdownView from "@/components/MarkdownView";

const TEXT = "#111827";
const MUTED = "#6B7280";
const PAGE_BG = "#FFFFFF";

const SHARE_ICON = Platform.OS === "ios" ? "share-outline" : "share-social-outline";

type LegalDocViewerProps = {
  docId: string | undefined;
  /** Where to go when the stack cannot pop (e.g. opened from login). */
  backFallback?: Href;
};

export function LegalDocViewer({ docId, backFallback = "/(auth)/login" }: LegalDocViewerProps) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const doc: LegalDoc | undefined = docId ? LEGAL_DOC_BY_ID[docId] : undefined;

  const [body, setBody] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const onBack = useCallback(() => {
    if (typeof router.canGoBack === "function" && router.canGoBack()) {
      router.back();
      return;
    }
    router.replace(backFallback);
  }, [router, backFallback]);

  useEffect(() => {
    let alive = true;
    if (!doc) {
      setError("Policy not found.");
      return;
    }
    setBody(null);
    setError(null);
    loadLegalDocBody(doc)
      .then((text) => {
        if (alive) setBody(text);
      })
      .catch((e: unknown) => {
        if (alive) setError(e instanceof Error ? e.message : "Could not load the policy.");
      });
    return () => {
      alive = false;
    };
  }, [doc]);

  const headerTitle = doc?.title ?? "Policy";

  const onShare = async () => {
    if (!doc) return;
    try {
      await Share.share({
        message: `${doc.title} — GatiMitra\nhttps://gatimitra.com/legal/${doc.file}`,
      });
    } catch {
      /* ignore */
    }
  };

  if (!doc) {
    return (
      <View style={styles.center}>
        <Stack.Screen
          options={{
            title: "Not found",
            headerLeft: () => (
              <TouchableOpacity onPress={onBack} hitSlop={12} accessibilityLabel="Go back">
                <Ionicons name="chevron-back" size={26} color={TEXT} />
              </TouchableOpacity>
            ),
          }}
        />
        <Ionicons name="document-outline" size={36} color={MUTED} />
        <AppText style={styles.error}>This policy is not available.</AppText>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <Stack.Screen
        options={{
          title: headerTitle,
          headerBackVisible: false,
          headerLeft: () => (
            <TouchableOpacity
              onPress={onBack}
              hitSlop={12}
              style={styles.headerBtn}
              accessibilityLabel="Go back"
              accessibilityRole="button"
            >
              <Ionicons name="chevron-back" size={26} color={TEXT} />
            </TouchableOpacity>
          ),
          headerRight: () => (
            <TouchableOpacity
              onPress={() => void onShare()}
              hitSlop={12}
              style={styles.headerBtn}
              accessibilityLabel="Share"
              accessibilityRole="button"
            >
              <Ionicons name={SHARE_ICON} size={22} color={TEXT} />
            </TouchableOpacity>
          ),
        }}
      />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 32 }}>
        {body === null && !error ? (
          <View style={styles.center}>
            <ActivityIndicator color={MUTED} />
            <AppText style={styles.loading}>Loading {doc.title}…</AppText>
          </View>
        ) : error ? (
          <View style={styles.center}>
            <Ionicons name="warning-outline" size={32} color="#DC2626" />
            <AppText style={styles.error}>{error}</AppText>
          </View>
        ) : body ? (
          <MarkdownView source={body} />
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: PAGE_BG },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32, gap: 12 },
  loading: { fontSize: 13, color: MUTED },
  error: { fontSize: 14, color: MUTED, textAlign: "center" },
  headerBtn: { paddingHorizontal: 4, paddingVertical: 2 },
});
