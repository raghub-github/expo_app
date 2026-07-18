/**
 * Profile → Legal & Policies — lists every document grouped by category with
 * a search box that filters by title + tags.
 */

import { useMemo, useState } from "react";
import { AppText } from "@/components/AppText";

import { View, ScrollView, TouchableOpacity, TextInput, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import {
  LEGAL_DOCS_BY_CATEGORY,
  type LegalCategory,
  type LegalDoc,
} from "@/lib/legal-registry";

const TEXT = "#111827";
const MUTED = "#6B7280";
const BORDER = "#E5E7EB";
const PAGE_BG = "#F3F4F6";
const GREEN = "#16A34A";

const CATEGORY_LABEL: Record<LegalCategory, string> = {
  legal: "Legal documents",
  help: "Help & support",
  about: "About GatiMitra",
  safety: "Safety & inclusion",
  subscription: "Subscription",
};

// Map registry icon names → Ionicons (the only icon set already in the app).
function iconFor(iconName: string): keyof typeof Ionicons.glyphMap {
  const map: Record<string, keyof typeof Ionicons.glyphMap> = {
    FileText: "document-text-outline",
    ShieldCheck: "shield-checkmark-outline",
    ScrollText: "reader-outline",
    Cookie: "nutrition-outline",
    KeyRound: "key-outline",
    Trash2: "trash-outline",
    Banknote: "cash-outline",
    Truck: "car-outline",
    Receipt: "receipt-outline",
    TrendingUp: "trending-up-outline",
    Crown: "star-outline",
    FileEdit: "create-outline",
    Users: "people-outline",
    Ban: "ban-outline",
    ShieldAlert: "warning-outline",
    Scale: "git-compare-outline",
    PackageSearch: "search-outline",
    Accessibility: "accessibility-outline",
    Baby: "happy-outline",
    Gavel: "hammer-outline",
    Phone: "call-outline",
    Info: "information-circle-outline",
    GitBranch: "git-branch-outline",
    HelpCircle: "help-circle-outline",
  };
  return map[iconName] ?? "document-outline";
}

function PolicyRow({ doc }: { doc: LegalDoc }) {
  const router = useRouter();
  return (
    <TouchableOpacity
      style={styles.row}
      activeOpacity={0.7}
      onPress={() => router.push(`/profile/legal/${doc.id}` as never)}
    >
      <View style={styles.rowIcon}>
        <Ionicons name={iconFor(doc.icon)} size={20} color={GREEN} />
      </View>
      <View style={styles.rowText}>
        <AppText style={styles.rowTitle} numberOfLines={1}>
          {doc.title}
        </AppText>
        <AppText style={styles.rowSubtitle} numberOfLines={2}>
          {doc.subtitle}
        </AppText>
      </View>
      <Ionicons name="chevron-forward" size={18} color={MUTED} />
    </TouchableOpacity>
  );
}

function Section({ title, docs }: { title: string; docs: readonly LegalDoc[] }) {
  if (docs.length === 0) return null;
  return (
    <View style={styles.section}>
      <AppText style={styles.sectionTitle}>{title}</AppText>
      <View style={styles.card}>
        {docs.map((doc, idx) => (
          <View key={doc.id}>
            <PolicyRow doc={doc} />
            {idx < docs.length - 1 ? <View style={styles.divider} /> : null}
          </View>
        ))}
      </View>
    </View>
  );
}

export default function LegalIndexScreen() {
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return LEGAL_DOCS_BY_CATEGORY;
    const filter = (docs: readonly LegalDoc[]) =>
      docs.filter(
        (d) =>
          d.title.toLowerCase().includes(q) ||
          d.subtitle.toLowerCase().includes(q) ||
          (d.tags ?? []).some((tag) => tag.toLowerCase().includes(q))
      );
    return {
      legal: filter(LEGAL_DOCS_BY_CATEGORY.legal),
      help: filter(LEGAL_DOCS_BY_CATEGORY.help),
      about: filter(LEGAL_DOCS_BY_CATEGORY.about),
      safety: filter(LEGAL_DOCS_BY_CATEGORY.safety),
      subscription: filter(LEGAL_DOCS_BY_CATEGORY.subscription),
    };
  }, [query]);

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.searchWrap}>
          <Ionicons name="search-outline" size={18} color={MUTED} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search policies, FAQ, contact…"
            placeholderTextColor={MUTED}
            style={styles.searchInput}
            autoCorrect={false}
            autoCapitalize="none"
            returnKeyType="search"
          />
          {query ? (
            <TouchableOpacity onPress={() => setQuery("")} hitSlop={10}>
              <Ionicons name="close-circle" size={18} color={MUTED} />
            </TouchableOpacity>
          ) : null}
        </View>

        <Section title={CATEGORY_LABEL.safety} docs={filtered.safety} />
        <Section title={CATEGORY_LABEL.help} docs={filtered.help} />
        <Section title={CATEGORY_LABEL.legal} docs={filtered.legal} />
        <Section title={CATEGORY_LABEL.subscription} docs={filtered.subscription} />
        <Section title={CATEGORY_LABEL.about} docs={filtered.about} />

        <AppText style={styles.footer}>
          GatiMitra Technologies Private Limited{"\n"}
          For grievances: grievance.officer@gatimitra.com
        </AppText>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: PAGE_BG },
  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 16,
    marginTop: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: "#FFFFFF",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: BORDER,
    gap: 8,
  },
  searchInput: { flex: 1, fontSize: 15, color: TEXT, paddingVertical: 0 },
  section: { marginTop: 16, paddingHorizontal: 16 },
  sectionTitle: {
    fontSize: 12,
    fontWeight: "600",
    color: MUTED,
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginBottom: 8,
    paddingLeft: 4,
  },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: BORDER,
    overflow: "hidden",
  },
  row: { flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingVertical: 14, gap: 12 },
  rowIcon: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: "#F0FDF4",
    alignItems: "center",
    justifyContent: "center",
  },
  rowText: { flex: 1 },
  rowTitle: { fontSize: 15, fontWeight: "600", color: TEXT },
  rowSubtitle: { fontSize: 12.5, color: MUTED, marginTop: 2, lineHeight: 17 },
  divider: { height: 1, backgroundColor: BORDER, marginLeft: 62 },
  footer: {
    marginTop: 28,
    marginHorizontal: 16,
    fontSize: 11.5,
    color: MUTED,
    textAlign: "center",
    lineHeight: 17,
  },
});
