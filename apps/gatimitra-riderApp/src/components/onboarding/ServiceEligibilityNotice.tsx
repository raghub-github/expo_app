/**
 * Renders the backend-authoritative onboarding service impact (§7, §32): which services the
 * rider can do now and which are unavailable until specific documents are verified. The exact
 * list + reasons come from the backend summary — nothing is hard-coded here (§37).
 */
import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { RiderOnboardingSummary } from "@/src/services/api/riderApi";

const SERVICE_LABEL: Record<string, string> = {
  food: "Food",
  parcel: "Parcel",
  person_ride: "Person Ride",
};
const DOC_LABEL: Record<string, string> = {
  DRIVING_LICENSE: "Driving Licence",
  REGISTRATION_CERTIFICATE: "Registration Certificate",
};

const human = (s: string) =>
  DOC_LABEL[s] ?? s.replaceAll("_", " ").toLowerCase().replace(/^./, (c) => c.toUpperCase());

function statusHeadline(status: string): { title: string; tone: string } {
  switch (status) {
    case "COMPLETE_FULL":
      return { title: "All services available", tone: "#15803D" };
    case "COMPLETE_LIMITED":
      return { title: "Onboarding complete — limited services", tone: "#B45309" };
    case "READY_FOR_PAYMENT":
      return { title: "Ready to complete onboarding", tone: "#B45309" };
    case "BLOCKED":
      return { title: "A required document is missing", tone: "#B91C1C" };
    case "MANUAL_REVIEW_REQUIRED":
      return { title: "Documents under review", tone: "#4338CA" };
    default:
      return { title: "Onboarding in progress", tone: "#475569" };
  }
}

export function ServiceEligibilityNotice({
  summary,
  showTitle = true,
}: {
  summary: RiderOnboardingSummary | null;
  showTitle?: boolean;
}) {
  if (!summary) return null;
  const ob = summary.onboarding;
  const head = statusHeadline(ob.status);
  const eligible = ob.eligibleServices;
  const blocked = ob.blockedServices;

  return (
    <View style={styles.card}>
      {showTitle ? (
        <View style={styles.headerRow}>
          <Ionicons name="shield-checkmark-outline" size={16} color={head.tone} />
          <Text style={[styles.headerText, { color: head.tone }]}>{head.title}</Text>
        </View>
      ) : null}

      {eligible.length > 0 ? (
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Available now</Text>
          {eligible.map((s) => (
            <View key={s} style={styles.row}>
              <Ionicons name="checkmark-circle" size={16} color="#16A34A" />
              <Text style={styles.rowText}>{SERVICE_LABEL[s] ?? s}</Text>
            </View>
          ))}
        </View>
      ) : (
        <Text style={styles.noneText}>No service is available yet.</Text>
      )}

      {blocked.length > 0 ? (
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Unavailable until documents are verified</Text>
          {blocked.map((b) => (
            <View key={b.service} style={styles.blockedRow}>
              <Ionicons name="close-circle" size={16} color="#DC2626" style={{ marginTop: 1 }} />
              <View style={{ flex: 1 }}>
                <Text style={styles.rowText}>{SERVICE_LABEL[b.service] ?? b.service}</Text>
                <Text style={styles.reasonText}>
                  {b.missingDocuments.length
                    ? `Requires ${b.missingDocuments.map(human).join(" + ")}`
                    : b.reasons[0] ?? "Not eligible"}
                </Text>
              </View>
            </View>
          ))}
        </View>
      ) : null}

      {blocked.length > 0 ? (
        <Text style={styles.footerText}>
          You can submit the required documents later from your Profile to unlock these services.
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 14,
    backgroundColor: "#FFFFFF",
    padding: 14,
    gap: 10,
  },
  headerRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  headerText: { fontSize: 14, fontWeight: "700" },
  section: { gap: 6 },
  sectionLabel: {
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.4,
    color: "#64748B",
  },
  row: { flexDirection: "row", alignItems: "center", gap: 8 },
  blockedRow: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  rowText: { fontSize: 14, fontWeight: "600", color: "#111827" },
  reasonText: { fontSize: 12.5, color: "#6B7280", marginTop: 1 },
  noneText: { fontSize: 13, color: "#6B7280" },
  footerText: { fontSize: 12, color: "#475569", fontStyle: "italic" },
});
