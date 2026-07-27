import { useEffect, useMemo, useState } from "react";
import { AppText as Text } from "@/components/AppText";
import { View, StyleSheet, ScrollView, Pressable, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { GatiMitraMerchant, H_PADDING, CARD_RADIUS } from "@/constants/theme";
import { useAuth } from "@/context/AuthContext";
import { useSelectedStore } from "@/context/SelectedStoreContext";
import { fetchMerchantHelpSections } from "@/services/ticketApi";

type HelpSection = {
  /** Stable list key / navigation id (ticket_titles.id). */
  id: string;
  ticketTitleId: number;
  /** Help hub section code (`merchant_section_id`) for API + quick options. */
  sectionCode: string;
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle: string;
};

/** Icon comes from API (`merchant_help_icon_name`); only validate against Ionicons. */
function resolveHelpHubIcon(fromDb: string | null): keyof typeof Ionicons.glyphMap {
  if (fromDb && fromDb in Ionicons.glyphMap) {
    return fromDb as keyof typeof Ionicons.glyphMap;
  }
  return "help-circle-outline";
}

export default function ContactUsScreen() {
  const router = useRouter();
  const { token } = useAuth();
  const { selectedStore } = useSelectedStore();
  const [sections, setSections] = useState<HelpSection[]>([]);
  const [loadingSections, setLoadingSections] = useState(false);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    if (!token) {
      setSections([]);
      setLoadError(false);
      return;
    }
    let cancelled = false;
    setLoadingSections(true);
    setLoadError(false);
    fetchMerchantHelpSections(token)
      .then((rows) => {
        if (cancelled) return;
        setSections(
          rows.map((r) => ({
            id: String(r.ticketTitleId),
            ticketTitleId: r.ticketTitleId,
            sectionCode: r.sectionId,
            icon: resolveHelpHubIcon(r.helpHubIcon),
            title: r.title,
            subtitle: r.subtitle ?? "",
          }))
        );
      })
      .catch(() => {
        if (!cancelled) {
          setSections([]);
          setLoadError(true);
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingSections(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  const groups = useMemo(() => {
    if (sections.length === 0) return [];
    if (sections.length < 3) return [sections];
    return [sections.slice(0, 2), sections.slice(2, 5), sections.slice(5)];
  }, [sections]);

  const onSectionPress = async (section: HelpSection) => {
    if (!token || !selectedStore?.id) {
      return;
    }
    router.push({
      pathname: "/support/chat/[ticketId]",
      params: {
        ticketId: "new",
        sectionId: section.sectionCode,
        ...(section.ticketTitleId > 0
          ? { ticketTitleId: String(section.ticketTitleId) }
          : {}),
        sectionTitle: section.title,
      },
    });
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.headerCard}>
        <Text style={styles.headerTitle}>How can we help you?</Text>
        <Text style={styles.headerSubtitle}>
          Tell us what you need help with. Our support team will review your
          request and get back to you on WhatsApp or phone.
        </Text>
      </View>

      {loadingSections ? (
        <View style={styles.loadingRow}>
          <ActivityIndicator color={GatiMitraMerchant.primary} />
        </View>
      ) : null}

      {!token ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>Sign in to see help topics</Text>
          <Text style={styles.emptySubtitle}>
            Help options are loaded from your account after you log in.
          </Text>
        </View>
      ) : loadError ? (
        <View style={styles.emptyCard}>
          <Ionicons
            name="cloud-offline-outline"
            size={28}
            color={GatiMitraMerchant.textTertiary}
            style={styles.emptyIcon}
          />
          <Text style={styles.emptyTitle}>Could not load help topics</Text>
          <Text style={styles.emptySubtitle}>
            Check your connection and try opening this screen again.
          </Text>
        </View>
      ) : !loadingSections && sections.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>No help topics yet</Text>
          <Text style={styles.emptySubtitle}>
            Your administrator has not published any contact options. Please try
            again later or reach out through another channel.
          </Text>
        </View>
      ) : (
        groups.map((group, idx) => (
          <View key={idx} style={styles.sectionCard}>
            {group.map((s, i) => (
              <Pressable
                key={s.id}
                onPress={() => onSectionPress(s)}
                style={({ pressed }) => [
                  styles.row,
                  i !== group.length - 1 && styles.rowDivider,
                  pressed && styles.rowPressed,
                ]}
              >
                <View style={styles.iconWrap}>
                  <Ionicons
                    name={s.icon}
                    size={20}
                    color={GatiMitraMerchant.primary}
                  />
                </View>
                <View style={styles.textWrap}>
                  <Text style={styles.rowTitle} numberOfLines={1}>
                    {s.title}
                  </Text>
                  <Text style={styles.rowSubtitle} numberOfLines={1}>
                    {s.subtitle}
                  </Text>
                </View>
                <Ionicons
                  name="chevron-forward"
                  size={18}
                  color={GatiMitraMerchant.textTertiary}
                />
              </Pressable>
            ))}
          </View>
        ))
      )}

      <View style={styles.footerCard}>
        <Ionicons
          name="headset-outline"
          size={20}
          color={GatiMitraMerchant.primary}
        />
        <View style={styles.footerTextWrap}>
          <Text style={styles.footerTitle}>Need urgent help?</Text>
          <Text style={styles.footerSubtitle}>
            For live order issues, use the Help option from the specific order
            screen so we can assist you faster.
          </Text>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: GatiMitraMerchant.surfaceWarm },
  content: { padding: H_PADDING, paddingBottom: 24 },
  loadingRow: { paddingVertical: 8, alignItems: "center" },
  emptyCard: {
    marginTop: 8,
    paddingHorizontal: 14,
    paddingVertical: 16,
    borderRadius: CARD_RADIUS,
    backgroundColor: GatiMitraMerchant.cardBg,
    borderWidth: 1,
    borderColor: GatiMitraMerchant.border,
    alignItems: "center",
  },
  emptyIcon: { marginBottom: 8 },
  emptyTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: GatiMitraMerchant.textPrimary,
    textAlign: "center",
  },
  emptySubtitle: {
    marginTop: 6,
    fontSize: 12,
    color: GatiMitraMerchant.textSecondary,
    lineHeight: 18,
    textAlign: "center",
  },
  headerCard: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 12,
    borderRadius: CARD_RADIUS,
    backgroundColor: GatiMitraMerchant.cardBg,
    borderWidth: 1,
    borderColor: GatiMitraMerchant.border,
    ...GatiMitraMerchant.shadowSm,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: GatiMitraMerchant.textPrimary,
    marginBottom: 4,
  },
  headerSubtitle: {
    fontSize: 12,
    color: GatiMitraMerchant.textSecondary,
    lineHeight: 18,
  },
  sectionCard: {
    marginTop: 10,
    backgroundColor: GatiMitraMerchant.cardBg,
    borderRadius: CARD_RADIUS,
    borderWidth: 1,
    borderColor: GatiMitraMerchant.border,
    overflow: "hidden",
    ...GatiMitraMerchant.shadowSm,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: GatiMitraMerchant.cardBg,
  },
  rowDivider: {
    borderBottomWidth: 1,
    borderBottomColor: GatiMitraMerchant.divider,
  },
  rowPressed: {
    backgroundColor: GatiMitraMerchant.surfaceSubtle,
  },
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: GatiMitraMerchant.surfaceSubtle,
    marginRight: 10,
  },
  textWrap: { flex: 1, minWidth: 0 },
  rowTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: GatiMitraMerchant.textPrimary,
  },
  rowSubtitle: {
    marginTop: 2,
    fontSize: 11,
    color: GatiMitraMerchant.textSecondary,
  },
  footerCard: {
    marginTop: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: CARD_RADIUS,
    backgroundColor: GatiMitraMerchant.surfaceSubtle,
    borderWidth: 1,
    borderColor: GatiMitraMerchant.border,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  footerTextWrap: { flex: 1 },
  footerTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: GatiMitraMerchant.textPrimary,
  },
  footerSubtitle: {
    marginTop: 2,
    fontSize: 11,
    color: GatiMitraMerchant.textSecondary,
    lineHeight: 16,
  },
});
