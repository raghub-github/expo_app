import { useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { GatiMitraMerchant, H_PADDING, CARD_RADIUS } from "@/constants/theme";
import { useAuth } from "@/context/AuthContext";
import { useSelectedStore } from "@/context/SelectedStoreContext";

type HelpSectionId =
  | "outlet_status"
  | "orders"
  | "restaurant"
  | "address"
  | "menu"
  | "payments"
  | "taxes"
  | "ads"
  | "branding"
  | "hygiene_audit"
  | "reports"
  | "other";

type HelpSection = {
  id: HelpSectionId;
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle: string;
};

const SECTIONS: HelpSection[] = [
  {
    id: "outlet_status",
    icon: "power-outline",
    title: "Outlet online / offline status",
    subtitle: "Current status, visibility and restrictions",
  },
  {
    id: "orders",
    icon: "document-text-outline",
    title: "Order related issues",
    subtitle: "Cancellations, delays and delivery concerns",
  },
  {
    id: "restaurant",
    icon: "business-outline",
    title: "Restaurant profile",
    subtitle: "Timings, contacts, FSSAI, bank details etc.",
  },
  {
    id: "address",
    icon: "location-outline",
    title: "Address & location",
    subtitle: "Outlet address, map location and coverage",
  },
  {
    id: "menu",
    icon: "fast-food-outline",
    title: "Menu & pricing",
    subtitle: "Items, photos, prices and charges",
  },
  {
    id: "payments",
    icon: "wallet-outline",
    title: "Payments & payouts",
    subtitle: "Statements, invoices and settlement issues",
  },
  {
    id: "taxes",
    icon: "receipt-outline",
    title: "Taxes & compliance",
    subtitle: "GST, TCS, TDS and reports",
  },
  {
    id: "ads",
    icon: "megaphone-outline",
    title: "Promotions & visibility",
    subtitle: "Boosts, offers and campaigns",
  },
  {
    id: "branding",
    icon: "pricetag-outline",
    title: "Branding & materials",
    subtitle: "Standees, stickers and other creatives",
  },
  {
    id: "reports",
    icon: "stats-chart-outline",
    title: "Analytics & reports",
    subtitle: "Performance, ratings and insights",
  },
  {
    id: "hygiene_audit",
    icon: "medkit-outline",
    title: "Kitchen hygiene audit report",
    subtitle: "Upload or request hygiene audit report",
  },
  {
    id: "other",
    icon: "chatbubbles-outline",
    title: "Need help with something else",
    subtitle: "Raise a ticket and our team will assist you",
  },
];

export default function ContactUsScreen() {
  const router = useRouter();
  const { token } = useAuth();
  const { selectedStore } = useSelectedStore();

  const groups = useMemo(() => {
    return [
      SECTIONS.slice(0, 2),
      SECTIONS.slice(2, 5),
      SECTIONS.slice(5),
    ];
  }, []);

  const onSectionPress = async (section: HelpSection) => {
    if (!token || !selectedStore?.id) {
      return;
    }
    router.push({
      pathname: "/support/chat/[ticketId]",
      params: {
        ticketId: "new",
        sectionId: section.id,
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

      {groups.map((group, idx) => (
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
      ))}

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

