/**
 * Renders the backend-authoritative onboarding service impact (§7, §32): which services the
 * rider can do now and which are unavailable until specific documents are verified. The exact
 * list + reasons come from the backend summary — nothing is hard-coded here (§37).
 */
import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { RiderOnboardingSummary } from "@/src/services/api/riderApi";

const SERVICE_ORDER = ["food", "parcel", "person_ride"] as const;

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

function blockedSlogan(b: {
  service: string;
  missingDocuments: string[];
  reasons: string[];
}): string {
  const label = SERVICE_LABEL[b.service] ?? b.service;
  if (b.reasons[0]?.trim()) return b.reasons[0].trim();
  if (b.missingDocuments.length) {
    return `${label} needs ${b.missingDocuments.map(human).join(" + ")} to unlock.`;
  }
  return `${label} is unavailable until documents are verified.`;
}

function orderedServices(eligible: string[], blockedServices: string[]): string[] {
  const eligibleSet = new Set(eligible);
  const blockedSet = new Set(blockedServices);
  const seen = new Set<string>();
  const ordered: string[] = [];

  for (const s of SERVICE_ORDER) {
    if (eligibleSet.has(s) || blockedSet.has(s)) {
      ordered.push(s);
      seen.add(s);
    }
  }
  for (const s of eligible) {
    if (!seen.has(s)) {
      ordered.push(s);
      seen.add(s);
    }
  }
  for (const s of blockedServices) {
    if (!seen.has(s)) {
      ordered.push(s);
      seen.add(s);
    }
  }
  return ordered;
}

export function ServiceEligibilityNotice({
  summary,
  showTitle = true,
  compact = false,
}: {
  summary: RiderOnboardingSummary | null;
  showTitle?: boolean;
  /** Tighter layout for payment screen above sticky CTA */
  compact?: boolean;
}) {
  if (!summary) return null;
  const ob = summary.onboarding;
  const head = statusHeadline(ob.status);
  const eligible = ob.eligibleServices;
  const blocked = ob.blockedServices;
  const blockedMap = new Map(blocked.map((b) => [b.service, b]));
  const allServices = orderedServices(
    eligible,
    blocked.map((b) => b.service)
  );

  if (allServices.length === 0) {
    return (
      <View style={[styles.card, compact && styles.cardCompact]}>
        {showTitle ? (
          <View style={styles.headerRow}>
            <Ionicons name="shield-checkmark-outline" size={16} color={head.tone} />
            <Text style={[styles.headerText, { color: head.tone }, compact && styles.headerTextCompact]}>
              {head.title}
            </Text>
          </View>
        ) : null}
        <Text style={styles.noneText}>No service is available yet.</Text>
      </View>
    );
  }

  return (
    <View style={[styles.card, compact && styles.cardCompact]}>
      {showTitle ? (
        <View style={styles.headerRow}>
          <Ionicons name="shield-checkmark-outline" size={16} color={head.tone} />
          <Text style={[styles.headerText, { color: head.tone }, compact && styles.headerTextCompact]}>
            {head.title}
          </Text>
        </View>
      ) : null}

      <View style={styles.chipRow}>
        {allServices.map((s) => {
          const isBlocked = blockedMap.has(s);
          return (
            <View key={s} style={[styles.chip, isBlocked ? styles.chipBlocked : styles.chipOk]}>
              <Ionicons
                name={isBlocked ? "close-circle" : "checkmark-circle"}
                size={14}
                color={isBlocked ? "#DC2626" : "#16A34A"}
              />
              <Text
                style={[styles.chipText, isBlocked && styles.chipTextBlocked]}
                numberOfLines={1}
              >
                {SERVICE_LABEL[s] ?? s}
              </Text>
            </View>
          );
        })}
      </View>

      {blocked.length > 0 ? (
        <View style={styles.sloganBlock}>
          {blocked.map((b) => (
            <Text key={`${b.service}-slogan`} style={styles.sloganText}>
              {blockedSlogan(b)}
            </Text>
          ))}
          <Text style={styles.footerText}>
            {compact
              ? blocked.some((b) => b.missingDocuments.length > 0)
                ? "Add missing docs later from Profile to unlock."
                : "Update vehicle details from Profile to unlock."
              : blocked.some((b) => b.missingDocuments.length > 0)
                ? "You can submit the required documents later from your Profile to unlock these services."
                : "You can update your vehicle from Profile to unlock these services."}
          </Text>
        </View>
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
  cardCompact: {
    padding: 12,
    gap: 8,
  },
  headerRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  headerText: { flex: 1, flexShrink: 1, fontSize: 14, fontWeight: "700" },
  headerTextCompact: { fontSize: 13 },
  chipRow: {
    flexDirection: "row",
    flexWrap: "nowrap",
    alignItems: "center",
    gap: 6,
  },
  chip: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
    minWidth: 0,
  },
  chipOk: {
    backgroundColor: "#F0FDF4",
    borderColor: "#BBF7D0",
  },
  chipBlocked: {
    backgroundColor: "#FEF2F2",
    borderColor: "#FECACA",
  },
  chipText: {
    flexShrink: 1,
    fontSize: 12,
    fontWeight: "600",
    color: "#166534",
  },
  chipTextBlocked: {
    color: "#B91C1C",
  },
  sloganBlock: {
    gap: 4,
    paddingTop: 2,
  },
  sloganText: {
    fontSize: 12.5,
    lineHeight: 18,
    color: "#6B7280",
  },
  noneText: { fontSize: 13, color: "#6B7280" },
  footerText: { fontSize: 12, lineHeight: 17, color: "#475569", marginTop: 2 },
});
