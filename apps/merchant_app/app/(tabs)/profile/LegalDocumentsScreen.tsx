import { View, StyleSheet, ScrollView } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { AppText as Text } from "@/components/AppText";
import { StaffSensitiveBlur } from "@/components/StaffSensitiveBlur";
import { GatiMitraMerchant, H_PADDING, CARD_RADIUS } from "@/constants/theme";
import { useAuth } from "@/context/AuthContext";
import { isStaffAccessRole, partnerHasPermission } from "@/lib/staffPermissions";
import { useRequirePartnerPermission } from "@/hooks/useRequirePartnerPermission";

export default function LegalDocumentsScreen() {
  const { partner } = useAuth();
  const staffLocked = isStaffAccessRole(partner);
  const allowed = useRequirePartnerPermission(
    "outlet",
    staffLocked ? false : "/(tabs)/profile"
  );

  if (!allowed && !staffLocked) {
    return <View style={styles.centered} />;
  }

  if (staffLocked) {
    return (
      <View style={styles.container}>
        <ScrollView contentContainerStyle={styles.content}>
          <StaffSensitiveBlur
            locked
            title="Legal documents locked"
            message="FSSAI, GST and other legal documents are hidden for staff. Ask the owner to view or renew them."
            minHeight={240}
          >
            <View style={styles.docCard}>
              <Text style={styles.docLabel}>FSSAI License</Text>
              <Text style={styles.docValue}>XXXXXXXXXXXXXX</Text>
            </View>
            <View style={styles.docCard}>
              <Text style={styles.docLabel}>GSTIN</Text>
              <Text style={styles.docValue}>XXAAAAA0000A1Z5</Text>
            </View>
            <View style={styles.docCard}>
              <Text style={styles.docLabel}>PAN</Text>
              <Text style={styles.docValue}>ABCDE1234F</Text>
            </View>
          </StaffSensitiveBlur>
        </ScrollView>
      </View>
    );
  }

  const canOutlet = partnerHasPermission(partner, "outlet");

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.infoCard}>
          <Ionicons name="shield-checkmark-outline" size={28} color={GatiMitraMerchant.primary} />
          <Text style={styles.infoTitle}>Legal documents</Text>
          <Text style={styles.infoBody}>
            {canOutlet
              ? "View and renew FSSAI, GST and related documents from Partner Site → Profile."
              : "You do not have permission to manage legal documents."}
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: GatiMitraMerchant.surfaceWarm },
  content: { padding: H_PADDING, paddingTop: 12, paddingBottom: 40 },
  centered: { flex: 1, backgroundColor: GatiMitraMerchant.surfaceWarm },
  docCard: {
    backgroundColor: "#fff",
    borderRadius: CARD_RADIUS,
    borderWidth: 1,
    borderColor: GatiMitraMerchant.border,
    padding: 14,
    marginBottom: 10,
  },
  docLabel: { fontSize: 12, color: GatiMitraMerchant.textSecondary, marginBottom: 4 },
  docValue: { fontSize: 15, fontWeight: "600", color: GatiMitraMerchant.textPrimary },
  infoCard: {
    backgroundColor: "#fff",
    borderRadius: CARD_RADIUS,
    borderWidth: 1,
    borderColor: GatiMitraMerchant.border,
    padding: 20,
    alignItems: "center",
    gap: 8,
  },
  infoTitle: { fontSize: 16, fontWeight: "700", color: GatiMitraMerchant.textPrimary },
  infoBody: {
    fontSize: 13,
    lineHeight: 18,
    color: GatiMitraMerchant.textSecondary,
    textAlign: "center",
  },
});
