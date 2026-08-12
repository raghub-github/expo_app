/**
 * Profile sub-routes. edit-store → full Outlet Info page (data from backend).
 * Others → placeholder until implemented.
 */

import { AppText as Text } from "@/components/AppText";
import { View, StyleSheet } from "react-native";
import { Redirect, useLocalSearchParams } from "expo-router";
import { GatiMitraMerchant, H_PADDING } from "@/constants/theme";
import OutletInfoScreen from "./OutletInfoScreen";
import BankAccountScreen from "./BankAccountScreen";
import AuditScreen from "./AuditScreen";
import BusinessHoursScreen from "./BusinessHoursScreen";
import ContactScreen from "./ContactScreen";
import StaffScreen from "./StaffScreen";
import NotificationsScreen from "./NotificationsScreen";
import ManageCommunicationsScreen from "./ManageCommunicationsScreen";
import DeliverySettingsScreen from "./DeliverySettingsScreen";
import PreparationTimeScreen from "./PreparationTimeScreen";
import VacationScreen from "./VacationScreen";
import ContactUsScreen from "./ContactUsScreen";
import HelpChatScreen from "./HelpChatScreen";
import MyTicketsScreen from "./MyTicketsScreen";
import StoreStatusScreen from "./StoreStatusScreen";
import OffersScreen from "./OffersScreen";
import ActivityFeedScreen from "./ActivityFeedScreen";
import AutoAcceptScreen from "./AutoAcceptScreen";
import PrinterSettingsScreen from "./PrinterSettingsScreen";

const SLUG_TITLES: Record<string, string> = {
  "edit-store": "Edit Store",
  "change-history": "Change history",
  "business-details": "Business Details",
  address: "Delivery settings",
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
  "printer-settings": "Thermal Printer",
  earnings: "Earnings Summary",
  settlements: "Settlement History",
  commission: "Commission Details",
  "tax-reports": "Tax Reports",
  offers: "Offers & Promotions",
  "activity-feed": "Recent Activity",
  preferences: "Preferences",
  notifications: "Notifications",
  language: "Language",
  help: "Help Centre",
  contact: "Contact Us",
};

const CONTENT_TOP = 18;

export default function ProfileSlugScreen() {
  const { slug, reopen_prompt } = useLocalSearchParams<{ slug: string; reopen_prompt?: string }>();

  if (slug === "edit-store") {
    return <OutletInfoScreen />;
  }
  if (slug === "change-history") {
    return <AuditScreen />;
  }
  if (slug === "hours") {
    return <BusinessHoursScreen />;
  }

  if (slug === "business-details") {
    return <ContactScreen />;
  }

  if (slug === "staff") {
    return <StaffScreen />;
  }

  if (slug === "status") {
    return <StoreStatusScreen reopenPromptFromNotification={reopen_prompt === "1"} />;
  }

  // Legacy profile slug → independent full-screen route (no tabs / MerchantHeader).
  if (slug === "restaurant-status") {
    return <Redirect href="/restaurant-status" />;
  }

  if (slug === "preferences" || slug === "notifications") {
    // Legacy `notifications` slug → Preferences (floating order pill + outlet prefs).
    return <NotificationsScreen />;
  }

  if (slug === "communications") {
    return <ManageCommunicationsScreen />;
  }

  if (slug === "address") {
    return <DeliverySettingsScreen />;
  }

  if (slug === "preparation-time") {
    return <PreparationTimeScreen />;
  }

  if (slug === "auto-accept") {
    return <AutoAcceptScreen />;
  }

  if (slug === "printer-settings") {
    return <PrinterSettingsScreen />;
  }

  if (slug === "vacation") {
    return <VacationScreen />;
  }

  if (slug === "bank") {
    return <BankAccountScreen />;
  }

  if (slug === "contact") {
    return <ContactUsScreen />;
  }

  if (slug === "help") {
    return <HelpChatScreen />;
  }

  if (slug === "tickets") {
    return <MyTicketsScreen />;
  }

  if (slug === "offers") {
    return <OffersScreen />;
  }

  if (slug === "activity-feed") {
    return <ActivityFeedScreen />;
  }

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
