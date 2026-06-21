/**
 * Profile → Legal → [docId] — renders one policy document.
 */

import { useEffect, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  ActivityIndicator,
  StyleSheet,
  Share,
  TouchableOpacity,
} from "react-native";
import { Stack, useLocalSearchParams } from "expo-router";
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

export default function LegalDocScreen() {
  const insets = useSafeAreaInsets();
  const { docId } = useLocalSearchParams<{ docId: string }>();
  const doc: LegalDoc | undefined = docId ? LEGAL_DOC_BY_ID[docId] : undefined;

  const [body, setBody] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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
        <Stack.Screen options={{ title: "Not found" }} />
        <Ionicons name="document-outline" size={36} color={MUTED} />
        <Text style={styles.error}>This policy is not available.</Text>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <Stack.Screen
        options={{
          title: headerTitle,
          headerRight: () => (
            <TouchableOpacity onPress={onShare} hitSlop={10} style={{ paddingHorizontal: 4 }}>
              <Ionicons name="share-outline" size={22} color={TEXT} />
            </TouchableOpacity>
          ),
        }}
      />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 32 }}>
        {body === null && !error ? (
          <View style={styles.center}>
            <ActivityIndicator color={MUTED} />
            <Text style={styles.loading}>Loading {doc.title}…</Text>
          </View>
        ) : error ? (
          <View style={styles.center}>
            <Ionicons name="warning-outline" size={32} color="#DC2626" />
            <Text style={styles.error}>{error}</Text>
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
});
