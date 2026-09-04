// @ts-nocheck — pending strict-mode cleanup; tracked in follow-up issue.
import React from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import type { ComponentProps } from "react";
import { useTranslation } from "react-i18next";
import { router } from "expo-router";
import { useRiderOnboardingSummary } from "@/src/hooks/useRiderOnboardingSummary";
import { ServiceEligibilityNotice } from "@/src/components/onboarding/ServiceEligibilityNotice";
import {
  useRiderDocuments,
  type RiderKycDocStatus,
  type RiderKycDocumentItem,
} from "@/src/hooks/useRiderDocuments";
import { colors } from "@/src/theme";

const TEAL = colors.primary[600];
const TEAL_LIGHT = colors.primary[50];

type IoniconName = ComponentProps<typeof Ionicons>["name"];

function resolveIcon(name: string): IoniconName {
  const allowed: IoniconName[] = [
    "card-outline",
    "document-text-outline",
    "person-circle-outline",
    "flash-outline",
    "business-outline",
    "shield-outline",
  ];
  return (allowed.includes(name as IoniconName) ? name : "document-text-outline") as IoniconName;
}

function statusMeta(
  status: RiderKycDocStatus,
  t: (key: string, opts?: { defaultValue?: string }) => string,
) {
  switch (status) {
    case "verified":
      return {
        label: t("profile.kycDocuments.statusVerified", "Verified"),
        bg: "#D1FAE5",
        text: "#047857",
        border: "#A7F3D0",
        icon: "checkmark-circle" as IoniconName,
      };
    case "rejected":
      return {
        label: t("profile.kycDocuments.statusRejected", "Rejected"),
        bg: "#FEE2E2",
        text: "#B91C1C",
        border: "#FECACA",
        icon: "close-circle" as IoniconName,
      };
    case "pending":
      return {
        label: t("profile.kycDocuments.statusPending", "Under review"),
        bg: "#FEF3C7",
        text: "#B45309",
        border: "#FDE68A",
        icon: "time" as IoniconName,
      };
    default:
      return {
        label: t("profile.kycDocuments.statusNotVerified", "Not verified"),
        bg: "#F1F5F9",
        text: "#64748B",
        border: "#E2E8F0",
        icon: "alert-circle-outline" as IoniconName,
      };
  }
}

function StatusBadge({ status }: { status: RiderKycDocStatus }) {
  const { t } = useTranslation();
  const meta = statusMeta(status, t);
  return (
    <View style={[styles.badge, { backgroundColor: meta.bg, borderColor: meta.border }]}>
      <Ionicons name={meta.icon} size={14} color={meta.text} />
      <Text style={[styles.badgeText, { color: meta.text }]}>{meta.label}</Text>
    </View>
  );
}

/**
 * Small pill showing whether a decision came from Cashfree (auto) or an
 * agent (manual). Shown next to StatusBadge when the doc has a decision.
 * Hidden for pending / not_uploaded to keep the row uncluttered.
 */
function MethodBadge({ method }: { method: "auto" | "manual" | "pending" | null }) {
  if (!method || method === "pending") return null;
  const isAuto = method === "auto";
  const bg = isAuto ? "#EEF2FF" : "#F0F9FF";
  const text = isAuto ? "#4338CA" : "#0369A1";
  const border = isAuto ? "#C7D2FE" : "#BAE6FD";
  const icon: IoniconName = isAuto ? "flash-outline" : "person-outline";
  return (
    <View style={[styles.methodBadge, { backgroundColor: bg, borderColor: border }]}>
      <Ionicons name={icon} size={11} color={text} />
      <Text style={[styles.methodBadgeText, { color: text }]}>{isAuto ? "Auto" : "Manual"}</Text>
    </View>
  );
}

function DocumentRow({ doc }: { doc: RiderKycDocumentItem }) {
  const { t } = useTranslation();
  const iconName = resolveIcon(doc.icon);

  return (
    <View style={styles.docCard}>
      <View style={styles.docHeader}>
        <View style={styles.docIconWrap}>
          <Ionicons name={iconName} size={20} color={TEAL} />
        </View>
        <View style={styles.docTitleWrap}>
          <Text style={styles.docTitle}>{doc.label}</Text>
          {doc.required ? (
            <Text style={styles.docRequired}>{t("profile.kycDocuments.required", "Required")}</Text>
          ) : (
            <Text style={styles.docOptional}>{t("profile.kycDocuments.optional", "Optional")}</Text>
          )}
          {doc.docNumber?.trim() ? (
            <Text style={styles.docNumber} numberOfLines={1}>
              {doc.docNumber.trim()}
            </Text>
          ) : null}
        </View>
        <View style={styles.badgeStack}>
          <StatusBadge status={doc.status} />
          <MethodBadge method={doc.verificationMethod} />
        </View>
      </View>

      {doc.rejectedReason ? (
        <Text style={styles.rejectedReason}>{doc.rejectedReason}</Text>
      ) : null}

      {doc.sides.length > 0 ? (
        <View style={styles.sidesBlock}>
          {doc.sides.map((side) => (
            <View key={`${doc.docKey}-${side.side}`} style={styles.sideRow}>
              <Text style={styles.sideLabel}>{side.label}</Text>
              <StatusBadge status={side.status} />
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

export function ViewDocumentsScreen() {
  const { t } = useTranslation();
  const { data, isLoading, isError, refetch, isRefetching } = useRiderDocuments();
  // Backend-authoritative eligibility so the rider sees, on the documents screen, which
  // services a newly-submitted document will unlock (§20, §42). Refetched with the docs.
  const { summary: onboardingSummary, refetch: refetchSummary } = useRiderOnboardingSummary();

  const verifiedCount = data?.verifiedCount ?? 0;
  const totalCount = data?.totalCount ?? 0;
  const kycCompleted = data?.kycCompleted ?? false;

  return (
    <SafeAreaView style={styles.root} edges={["top", "bottom"]}>
      <View style={styles.header}>
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [styles.backBtn, pressed && styles.backBtnPressed]}
        >
          <Ionicons name="arrow-back" size={22} color="#0F172A" />
        </Pressable>
        <View style={styles.headerText}>
          <Text style={styles.headerTitle}>
            {t("profile.kycDocuments.title", "KYC documents")}
          </Text>
          <Text style={styles.headerSub}>
            {t(
              "profile.kycDocuments.subtitle",
              "Your uploaded documents and verification status",
            )}
          </Text>
        </View>
      </View>

      {isLoading && !data ? (
        <View style={styles.centerState}>
          <ActivityIndicator size="large" color={TEAL} />
          <Text style={styles.centerStateText}>
            {t("profile.kycDocuments.loading", "Loading documents…")}
          </Text>
        </View>
      ) : isError || !data ? (
        <View style={styles.centerState}>
          <Ionicons name="cloud-offline-outline" size={40} color="#94A3B8" />
          <Text style={styles.centerStateTitle}>
            {t("profile.kycDocuments.loadFailed", "Could not load documents")}
          </Text>
          <Pressable onPress={() => refetch()} style={styles.retryBtn}>
            <Text style={styles.retryBtnText}>{t("common.retry", "Retry")}</Text>
          </Pressable>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={() => {
                void refetch();
                void refetchSummary();
              }}
              tintColor={TEAL}
            />
          }
        >
          <View style={[styles.summaryCard, kycCompleted && styles.summaryCardCompleted]}>
            <View style={[styles.summaryIconWrap, kycCompleted && styles.summaryIconWrapCompleted]}>
              <Ionicons name="shield-checkmark" size={28} color={kycCompleted ? "#047857" : TEAL} />
            </View>
            <View style={styles.summaryBody}>
              <View style={styles.summaryTitleRow}>
                <Text style={styles.summaryTitle}>
                  {t("profile.kycDocuments.summaryTitle", "Verification overview")}
                </Text>
                {kycCompleted ? (
                  <View style={styles.kycCompletedBadge}>
                    <Ionicons name="checkmark-circle" size={14} color="#047857" />
                    <Text style={styles.kycCompletedText}>
                      {t("profile.kycDocuments.kycCompleted", "KYC Completed")}
                    </Text>
                  </View>
                ) : null}
              </View>
              <Text style={styles.summaryStat}>
                {t("profile.kycDocuments.summaryCount", {
                  verified: verifiedCount,
                  total: totalCount,
                  defaultValue: `${verifiedCount} of ${totalCount} documents verified`,
                })}
              </Text>
            </View>
          </View>

          {onboardingSummary ? (
            <View style={{ marginBottom: 16 }}>
              <ServiceEligibilityNotice summary={onboardingSummary} />
            </View>
          ) : null}

          <Text style={styles.sectionLabel}>
            {t("profile.kycDocuments.allDocuments", "All documents")}
          </Text>

          {data.documents.map((doc) => (
            <DocumentRow key={doc.docKey} doc={doc} />
          ))}

          <Text style={styles.footerHint}>
            {t(
              "profile.kycDocuments.readOnlyHint",
              "Document details are read-only. Contact support if any status looks incorrect.",
            )}
          </Text>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#F4F6F8",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
    backgroundColor: "#FFFFFF",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#E2E8F0",
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F8FAFC",
  },
  backBtnPressed: {
    opacity: 0.75,
  },
  headerText: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#0F172A",
  },
  headerSub: {
    marginTop: 2,
    fontSize: 13,
    color: "#64748B",
  },
  centerState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
    gap: 12,
  },
  centerStateText: {
    fontSize: 14,
    color: "#64748B",
  },
  centerStateTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#334155",
    textAlign: "center",
  },
  retryBtn: {
    marginTop: 4,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: TEAL,
  },
  retryBtnText: {
    color: "#FFFFFF",
    fontWeight: "600",
    fontSize: 14,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 32,
    gap: 12,
  },
  summaryCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  summaryCardCompleted: {
    borderColor: "#A7F3D0",
    backgroundColor: "#F0FDF4",
  },
  summaryIconWrap: {
    width: 52,
    height: 52,
    borderRadius: 14,
    backgroundColor: TEAL_LIGHT,
    alignItems: "center",
    justifyContent: "center",
  },
  summaryIconWrapCompleted: {
    backgroundColor: "#D1FAE5",
  },
  summaryBody: {
    flex: 1,
  },
  summaryTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 8,
  },
  summaryTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#0F172A",
  },
  kycCompletedBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: "#D1FAE5",
    borderWidth: 1,
    borderColor: "#A7F3D0",
  },
  kycCompletedText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#047857",
  },
  summaryStat: {
    marginTop: 4,
    fontSize: 13,
    color: "#64748B",
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: "#64748B",
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginTop: 4,
    marginBottom: 2,
  },
  docCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    gap: 10,
  },
  docHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  docIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: TEAL_LIGHT,
    alignItems: "center",
    justifyContent: "center",
  },
  docTitleWrap: {
    flex: 1,
    minWidth: 0,
    paddingRight: 4,
  },
  docTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#0F172A",
  },
  docRequired: {
    marginTop: 2,
    fontSize: 11,
    fontWeight: "600",
    color: TEAL,
  },
  docOptional: {
    marginTop: 2,
    fontSize: 11,
    fontWeight: "500",
    color: "#94A3B8",
  },
  docNumber: {
    marginTop: 4,
    fontSize: 12,
    color: "#64748B",
  },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
    maxWidth: 120,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: "700",
  },
  badgeStack: {
    alignItems: "flex-end",
    gap: 4,
  },
  methodBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 999,
    borderWidth: 1,
  },
  methodBadgeText: {
    fontSize: 10,
    fontWeight: "700",
  },
  rejectedReason: {
    fontSize: 12,
    color: "#B91C1C",
    backgroundColor: "#FEF2F2",
    padding: 10,
    borderRadius: 10,
  },
  sidesBlock: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#F1F5F9",
    paddingTop: 10,
    gap: 8,
  },
  sideRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  sideLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: "#475569",
  },
  footerHint: {
    textAlign: "center",
    fontSize: 12,
    color: "#94A3B8",
    lineHeight: 18,
    paddingHorizontal: 8,
    marginTop: 4,
  },
});
