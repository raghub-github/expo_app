/**
 * Renders the backend-authoritative onboarding service impact (§7, §32): which services the
 * rider can do now and which are unavailable until specific documents are verified. The exact
 * list + reasons come from the backend summary — nothing is hard-coded here (§37).
 */
import React, { useMemo } from "react";
import { View, Text, StyleSheet } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import type { RiderOnboardingSummary } from "@/src/services/api/riderApi";

const SERVICE_ORDER = ["food", "parcel", "person_ride"] as const;

const SERVICE_LABEL: Record<string, string> = {
  food: "Food",
  parcel: "Parcel",
  person_ride: "Person Ride",
};

const SERVICE_ICON: Record<string, keyof typeof Ionicons.glyphMap> = {
  food: "fast-food-outline",
  parcel: "cube-outline",
  person_ride: "bicycle-outline",
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
      return { title: "Ready to complete onboarding", tone: "#166534" };
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
  /** Payment-page layout: per-service rows explaining what the fee unlocks. */
  variant = "default",
}: {
  summary: RiderOnboardingSummary | null;
  showTitle?: boolean;
  /** Tighter layout for payment screen above sticky CTA */
  compact?: boolean;
  variant?: "default" | "requiredFor";
}) {
  const rows = useMemo(() => {
    if (!summary) return [];
    const ob = summary.onboarding;
    const eligible = new Set(ob.eligibleServices);
    const blockedMap = new Map(ob.blockedServices.map((b) => [b.service, b]));
    const allServices = orderedServices(
      ob.eligibleServices,
      ob.blockedServices.map((b) => b.service),
    );
    return allServices.map((s) => {
      const blocked = blockedMap.get(s);
      const isBlocked = Boolean(blocked);
      return {
        service: s,
        label: SERVICE_LABEL[s] ?? s,
        icon: SERVICE_ICON[s] ?? "ellipse-outline",
        isBlocked,
        detail: isBlocked
          ? blocked
            ? blockedSlogan(blocked)
            : "Locked until documents are verified"
          : "Available after you pay this fee",
      };
    });
  }, [summary]);

  if (!summary) return null;
  const ob = summary.onboarding;
  const head = statusHeadline(ob.status);
  const blocked = ob.blockedServices;

  if (variant === "requiredFor") {
    const uniqueFootnotes = Array.from(
      new Set(blocked.map((b) => blockedSlogan(b)).filter(Boolean)),
    );

    return (
      <View style={styles.reqCard}>
        <LinearGradient
          colors={["#ECFDF5", "#FFFFFF"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.reqCardInner}
        >
          <View style={styles.reqHeader}>
            <View style={styles.reqIconWrap}>
              <Ionicons name="key-outline" size={18} color="#166534" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.reqEyebrow}>This fee is required for</Text>
              <Text style={styles.reqTitle}>Unlocking your rider services</Text>
            </View>
          </View>

          <Text style={styles.reqLead}>
            Paying completes registration. Eligible services go live after payment; locked ones
            need extra docs from Profile later.
          </Text>

          <View style={styles.reqList}>
            {rows.length === 0 ? (
              <Text style={styles.noneText}>No service is available yet.</Text>
            ) : (
              rows.map((row) => (
                <View
                  key={row.service}
                  style={[styles.reqRow, row.isBlocked ? styles.reqRowBlocked : styles.reqRowOk]}
                >
                  <View
                    style={[
                      styles.reqRowIcon,
                      row.isBlocked ? styles.reqRowIconBlocked : styles.reqRowIconOk,
                    ]}
                  >
                    <Ionicons
                      name={row.icon}
                      size={18}
                      color={row.isBlocked ? "#B91C1C" : "#166534"}
                    />
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <View style={styles.reqRowTitleLine}>
                      <Text style={styles.reqRowLabel} numberOfLines={1}>
                        {row.label}
                      </Text>
                      <View
                        style={[
                          styles.reqStatusPill,
                          row.isBlocked ? styles.reqStatusPillBlocked : styles.reqStatusPillOk,
                        ]}
                      >
                        <Text
                          style={[
                            styles.reqStatusPillText,
                            row.isBlocked && styles.reqStatusPillTextBlocked,
                          ]}
                        >
                          {row.isBlocked ? "Later" : "After pay"}
                        </Text>
                      </View>
                    </View>
                    <Text style={styles.reqRowDetail} numberOfLines={2}>
                      {row.detail}
                    </Text>
                  </View>
                </View>
              ))
            )}
          </View>

          {uniqueFootnotes.length > 0 ? (
            <Text style={styles.reqFoot}>
              {uniqueFootnotes.join(" ")} Add missing docs later from Profile to unlock.
            </Text>
          ) : (
            <Text style={styles.reqFoot}>
              All listed services unlock once payment succeeds and verification finishes.
            </Text>
          )}
        </LinearGradient>
      </View>
    );
  }

  if (rows.length === 0) {
    return (
      <View style={[styles.card, compact && styles.cardCompact]}>
        {showTitle ? (
          <View style={styles.headerRow}>
            <Ionicons name="shield-checkmark-outline" size={16} color={head.tone} />
            <Text
              style={[styles.headerText, { color: head.tone }, compact && styles.headerTextCompact]}
            >
              {head.title}
            </Text>
          </View>
        ) : null}
        <Text style={styles.noneText}>No service is available yet.</Text>
      </View>
    );
  }

  const uniqueSlogans = Array.from(
    new Set(blocked.map((b) => blockedSlogan(b)).filter(Boolean)),
  );

  return (
    <View style={[styles.card, compact && styles.cardCompact]}>
      {showTitle ? (
        <View style={styles.headerRow}>
          <Ionicons name="shield-checkmark-outline" size={16} color={head.tone} />
          <Text
            style={[styles.headerText, { color: head.tone }, compact && styles.headerTextCompact]}
          >
            {head.title}
          </Text>
        </View>
      ) : null}

      <View style={styles.chipRow}>
        {rows.map((row) => (
          <View
            key={row.service}
            style={[styles.chip, row.isBlocked ? styles.chipBlocked : styles.chipOk]}
          >
            <Ionicons
              name={row.isBlocked ? "close-circle" : "checkmark-circle"}
              size={14}
              color={row.isBlocked ? "#DC2626" : "#16A34A"}
            />
            <Text
              style={[styles.chipText, row.isBlocked && styles.chipTextBlocked]}
              numberOfLines={1}
            >
              {row.label}
            </Text>
          </View>
        ))}
      </View>

      {uniqueSlogans.length > 0 ? (
        <View style={styles.sloganBlock}>
          {uniqueSlogans.map((slogan) => (
            <Text key={slogan} style={styles.sloganText}>
              {slogan}
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

  reqCard: {
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "#A7F3D0",
    overflow: "hidden",
    shadowColor: "#065F46",
    shadowOpacity: 0.1,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
    backgroundColor: "#FFFFFF",
  },
  reqCardInner: {
    padding: 16,
    gap: 12,
  },
  reqHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  reqIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: "#DCFCE7",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#BBF7D0",
  },
  reqEyebrow: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.6,
    textTransform: "uppercase",
    color: "#059669",
    marginBottom: 2,
  },
  reqTitle: {
    fontSize: 17,
    fontWeight: "800",
    color: "#0F172A",
    letterSpacing: -0.2,
  },
  reqLead: {
    fontSize: 13,
    lineHeight: 19,
    color: "#64748B",
  },
  reqList: {
    gap: 8,
  },
  reqRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
  },
  reqRowOk: {
    backgroundColor: "rgba(240, 253, 244, 0.95)",
    borderColor: "#86EFAC",
  },
  reqRowBlocked: {
    backgroundColor: "rgba(255, 247, 237, 0.95)",
    borderColor: "#FDBA74",
  },
  reqRowIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  reqRowIconOk: { backgroundColor: "#BBF7D0" },
  reqRowIconBlocked: { backgroundColor: "#FED7AA" },
  reqRowTitleLine: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 2,
  },
  reqRowLabel: {
    flex: 1,
    fontSize: 15,
    fontWeight: "700",
    color: "#0F172A",
  },
  reqStatusPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  reqStatusPillOk: { backgroundColor: "#166534" },
  reqStatusPillBlocked: { backgroundColor: "#9A3412" },
  reqStatusPillText: {
    fontSize: 10,
    fontWeight: "800",
    color: "#FFFFFF",
    letterSpacing: 0.2,
  },
  reqStatusPillTextBlocked: { color: "#FFF7ED" },
  reqRowDetail: {
    fontSize: 12.5,
    lineHeight: 17,
    color: "#57534E",
  },
  reqFoot: {
    fontSize: 12,
    lineHeight: 17,
    color: "#64748B",
  },
});
