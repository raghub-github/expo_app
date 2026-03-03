/**
 * Placeholder for profile sub-routes (e.g. edit-store, business-details).
 * No in-app back button — user returns via device back (gesture / Android back).
 */

import { View, Text, StyleSheet } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { GatiMitraMerchant, H_PADDING } from "@/constants/theme";

const SLUG_TITLES: Record<string, string> = {
  "edit-store": "Edit Store",
  "business-details": "Business Details",
  address: "Address & Delivery Area",
  hours: "Business Hours",
  bank: "Bank Account",
  gst: "GST Information",
  documents: "Documents & Verification",
  staff: "Staff Management",
  status: "Store Status",
  "pause-store": "Pause Store",
  vacation: "Vacation Mode",
  "preparation-time": "Preparation Time",
  "auto-accept": "Auto Accept Orders",
  earnings: "Earnings Summary",
  settlements: "Settlement History",
  commission: "Commission Details",
  "tax-reports": "Tax Reports",
  notifications: "Notifications",
  language: "Language",
  help: "Help Centre",
  contact: "Contact Us",
};

const CONTENT_TOP = 18;

export default function ProfileSlugScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const title = (slug && SLUG_TITLES[slug]) || slug || "Settings";

  return (
    <View style={[styles.container, { paddingTop: CONTENT_TOP }]}>
      <View style={styles.header}>
        <Text style={styles.title} numberOfLines={1}>{title}</Text>
      </View>
      <View style={styles.body}>
        <Text style={styles.placeholder}>This screen will be implemented here.</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: GatiMitraMerchant.background },
  header: {
    paddingHorizontal: H_PADDING,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: GatiMitraMerchant.border,
  },
  title: { fontSize: 18, fontWeight: "600", color: GatiMitraMerchant.textPrimary },
  body: { flex: 1, padding: H_PADDING, justifyContent: "center" },
  placeholder: { fontSize: 15, color: GatiMitraMerchant.textSecondary, textAlign: "center" },
});
