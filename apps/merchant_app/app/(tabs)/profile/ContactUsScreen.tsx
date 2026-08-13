import { useEffect, useMemo, useState } from "react";
import { AppText as Text } from "@/components/AppText";
import {
  View,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { GatiMitraMerchant, H_PADDING, CARD_RADIUS } from "@/constants/theme";
import { MerchantFonts } from "@/constants/typography";
import { MerchantBottomSheetShell } from "@/components/order/MerchantBottomSheetShell";
import { useAuth } from "@/context/AuthContext";
import { useSelectedStore } from "@/context/SelectedStoreContext";
import { fetchMerchantHelpSections } from "@/services/ticketApi";
import { MerchantTicketOrderPickSheet } from "@/components/support/MerchantTicketOrderPickSheet";
import type { ApiFoodOrder } from "@/services/ordersApi";
import { topicRequiresOrderSelection } from "@/lib/supportOrderRequiredTopics";

type HelpSection = {
  id: string;
  ticketTitleId: number;
  sectionCode: string;
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle: string;
  quickOptions: string[];
};

type PendingChatDraft = {
  section: HelpSection;
  selectedIssue: string;
};

/** True when this section (or any of its quick options) needs an order pick. */
function sectionNeedsOrderPick(section: HelpSection): boolean {
  if (topicRequiresOrderSelection(section.title)) return true;
  return section.quickOptions.some((opt) => topicRequiresOrderSelection(opt));
}

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
  const [optionsSection, setOptionsSection] = useState<HelpSection | null>(null);
  const [orderPickVisible, setOrderPickVisible] = useState(false);
  const [pendingDraft, setPendingDraft] = useState<PendingChatDraft | null>(null);

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
            quickOptions: r.quickOptions ?? [],
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

  const openChat = (section: HelpSection, order?: ApiFoodOrder, selectedIssue?: string) => {
    router.push({
      pathname: "/support/chat/[ticketId]",
      params: {
        ticketId: "new",
        sectionId: section.sectionCode,
        ...(section.ticketTitleId > 0
          ? { ticketTitleId: String(section.ticketTitleId) }
          : {}),
        sectionTitle: section.title,
        ...(order
          ? {
              orderCoreId: String(order.orders_core_id),
              ...(order.orders_food_id
                ? { ordersFoodId: String(order.orders_food_id) }
                : {}),
              formattedOrderId:
                order.formatted_order_id?.trim() || String(order.orders_core_id),
            }
          : {}),
        ...(selectedIssue ? { autoSendMessage: selectedIssue } : {}),
        ...(section.quickOptions.length > 0
          ? { quickOptionsJson: JSON.stringify(section.quickOptions) }
          : {}),
      },
    });
  };

  const onSectionPress = (section: HelpSection) => {
    if (!token || !selectedStore?.id) return;
    if (!sectionNeedsOrderPick(section)) {
      openChat(section);
      return;
    }
    const orderRequiredOptions = section.quickOptions.filter((opt) =>
      topicRequiresOrderSelection(opt)
    );
    if (orderRequiredOptions.length > 0) {
      // Show only order-required options; other quick options go straight to chat.
      setOptionsSection({ ...section, quickOptions: orderRequiredOptions });
      return;
    }
    if (topicRequiresOrderSelection(section.title)) {
      setPendingDraft({ section, selectedIssue: section.title });
      setOrderPickVisible(true);
      return;
    }
    openChat(section);
  };

  const onQuickOptionPress = (section: HelpSection, option: string) => {
    setOptionsSection(null);
    if (!topicRequiresOrderSelection(option)) {
      openChat(section, undefined, option);
      return;
    }
    setPendingDraft({ section, selectedIssue: option });
    setOrderPickVisible(true);
  };

  const onOrderPicked = (order: ApiFoodOrder) => {
    if (!pendingDraft) return;
    setOrderPickVisible(false);
    openChat(pendingDraft.section, order, pendingDraft.selectedIssue);
    setPendingDraft(null);
  };

  return (
    <>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
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

      <MerchantBottomSheetShell
        visible={optionsSection != null}
        onClose={() => setOptionsSection(null)}
        hideCloseFab
        maxHeightPercent="70%"
      >
        <Text variant="brand" style={styles.optionsTitle}>
          Select an option to proceed
        </Text>
        {optionsSection?.quickOptions.map((option, idx) => (
          <Pressable
            key={`${idx}-${option.slice(0, 24)}`}
            onPress={() => onQuickOptionPress(optionsSection, option)}
            style={({ pressed }) => [
              styles.optionRow,
              idx !== (optionsSection?.quickOptions.length ?? 0) - 1 &&
                styles.optionRowDivider,
              pressed && styles.rowPressed,
            ]}
          >
            <Text style={styles.optionText}>{option}</Text>
            <Ionicons
              name="chevron-forward"
              size={18}
              color={GatiMitraMerchant.textTertiary}
            />
          </Pressable>
        ))}
      </MerchantBottomSheetShell>

      <MerchantTicketOrderPickSheet
        visible={orderPickVisible}
        storeId={selectedStore?.id ?? null}
        token={token}
        onClose={() => {
          setOrderPickVisible(false);
          setPendingDraft(null);
        }}
        onSelectOrder={onOrderPicked}
      />
    </>
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
    fontFamily: MerchantFonts.loraBold,
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
  optionsTitle: {
    fontSize: 14,
    fontWeight: "700",
    fontFamily: MerchantFonts.loraBold,
    color: GatiMitraMerchant.textPrimary,
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: GatiMitraMerchant.surfaceSubtle,
  },
  optionRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 8,
  },
  optionRowDivider: {
    borderBottomWidth: 1,
    borderBottomColor: GatiMitraMerchant.divider,
  },
  optionText: {
    flex: 1,
    fontSize: 14,
    fontWeight: "500",
    color: GatiMitraMerchant.textPrimary,
  },
});
