/**
 * Profile → About — links to About Us, Open-Source Licenses, Accessibility,
 * plus app version info shown in a card.
 */

import { View, ScrollView, TouchableOpacity, StyleSheet, Platform, Alert } from "react-native";
import { AppText } from "@/components/AppText";

import { useRouter } from "expo-router";
import Constants from "expo-constants";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import {
  LEGAL_DOC_BY_ID,
  LEGAL_PACK_VERSION,
} from "@/lib/legal-registry";

const TEXT = "#111827";
const MUTED = "#6B7280";
const BORDER = "#E5E7EB";
const PAGE_BG = "#F3F4F6";
const GREEN = "#16A34A";

const ROWS = [
  { id: "about-us", icon: "information-circle-outline" as const },
  { id: "accessibility-statement", icon: "accessibility-outline" as const },
  { id: "open-source-licenses", icon: "git-branch-outline" as const },
] as const;

export default function AboutScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const appVersion = Constants.expoConfig?.version ?? "—";
  const buildNumber =
    (Platform.OS === "ios"
      ? Constants.expoConfig?.ios?.buildNumber
      : Constants.expoConfig?.android?.versionCode?.toString()) ?? "—";

  const copyVersion = async () => {
    const text = `GatiMitra v${appVersion} (${buildNumber}) — legal pack ${LEGAL_PACK_VERSION}`;
    await Clipboard.setStringAsync(text);
    Alert.alert("Copied", "Version info copied to clipboard.");
  };

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 32, paddingTop: 12 }}>
        <View style={styles.brandCard}>
          <View style={styles.brandIcon}>
            <Ionicons name="leaf-outline" size={28} color="#FFFFFF" />
          </View>
          <AppText style={styles.brandName}>GatiMitra</AppText>
          <AppText style={styles.brandTag}>Mobility. Food. Logistics. — for India</AppText>
        </View>

        <View style={styles.section}>
          <View style={styles.card}>
            {ROWS.map((row, idx) => {
              const doc = LEGAL_DOC_BY_ID[row.id];
              if (!doc) return null;
              return (
                <View key={row.id}>
                  <TouchableOpacity
                    style={styles.row}
                    activeOpacity={0.7}
                    onPress={() => router.push(`/profile/legal/${doc.id}` as never)}
                  >
                    <View style={styles.rowIcon}>
                      <Ionicons name={row.icon} size={20} color={GREEN} />
                    </View>
                    <View style={styles.rowText}>
                      <AppText style={styles.rowTitle}>{doc.title}</AppText>
                      <AppText style={styles.rowSubtitle} numberOfLines={1}>
                        {doc.subtitle}
                      </AppText>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color={MUTED} />
                  </TouchableOpacity>
                  {idx < ROWS.length - 1 ? <View style={styles.divider} /> : null}
                </View>
              );
            })}
          </View>
        </View>

        <View style={styles.section}>
          <AppText style={styles.sectionTitle}>App version</AppText>
          <TouchableOpacity style={styles.versionCard} activeOpacity={0.7} onPress={copyVersion}>
            <View style={{ flex: 1 }}>
              <AppText style={styles.versionTitle}>
                GatiMitra v{appVersion}{" "}
                <AppText style={styles.versionBuild}>({buildNumber})</AppText>
              </AppText>
              <AppText style={styles.versionMeta}>Legal pack: {LEGAL_PACK_VERSION}</AppText>
            </View>
            <Ionicons name="copy-outline" size={18} color={MUTED} />
          </TouchableOpacity>
        </View>

        <AppText style={styles.footer}>
          © {new Date().getFullYear()} GatiMitra Technologies Private Limited{"\n"}
          Made in India 🇮🇳
        </AppText>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: PAGE_BG },
  brandCard: {
    alignItems: "center",
    paddingVertical: 24,
    paddingHorizontal: 16,
    backgroundColor: "#FFFFFF",
    marginHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: BORDER,
  },
  brandIcon: {
    width: 64,
    height: 64,
    borderRadius: 16,
    backgroundColor: GREEN,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
  },
  brandName: { fontSize: 22, fontWeight: "700", color: TEXT },
  brandTag: { fontSize: 13, color: MUTED, marginTop: 4 },
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
  rowSubtitle: { fontSize: 12.5, color: MUTED, marginTop: 2 },
  divider: { height: 1, backgroundColor: BORDER, marginLeft: 62 },
  versionCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: BORDER,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  versionTitle: { fontSize: 15, fontWeight: "600", color: TEXT },
  versionBuild: { fontWeight: "400", color: MUTED },
  versionMeta: { fontSize: 12, color: MUTED, marginTop: 4 },
  footer: { marginTop: 28, fontSize: 11.5, color: MUTED, textAlign: "center", lineHeight: 17 },
});
