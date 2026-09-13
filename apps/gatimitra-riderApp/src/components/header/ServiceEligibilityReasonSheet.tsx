/**
 * Explains WHY a service is blocked for this rider. Opened from a locked row in
 * the service dropdown. Dismissible — riders can close it, open Vehicles, or
 * upload the missing/rejected document that unblocks the service.
 *
 * Pending docs: show Pending status, NO upload CTA (until rejected).
 * Verified docs: service becomes selectable (Active) — this sheet won't open.
 * Docs complete / area disabled: show "Not available in your area" (not vehicle).
 */
import React, { useMemo } from "react";
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { DismissibleBottomSheetShell } from "@/src/components/language/DismissibleBottomSheetShell";
import { RiderFonts } from "@/src/theme/fonts";
import {
  areaEligibilityDisplayReason,
  resolveEligibilitySloganMode,
  type EligibilityReason,
} from "@/src/lib/rider-service-eligibility-rows";

/** Slightly darker green than neon slide CTAs — readable on sheets. */
const PRIMARY_GREEN = "#15803D";
const PRIMARY_GREEN_BORDER = "#14532D";

export type MissingDocUploadTarget = {
  /** Button label */
  label: string;
  /** Passed to document update sheet as focus. */
  focus: "dl" | "rc";
};

type ReasonTone = "pending" | "rejected" | "missing" | "default";

function reasonTone(code: string): ReasonTone {
  const c = code.toUpperCase();
  if (c.includes("_PENDING")) return "pending";
  if (c.includes("_REJECTED") || c.includes("_EXPIRED")) return "rejected";
  if (c.includes("_NOT_VERIFIED")) return "missing";
  return "default";
}

/** Map eligibility blocks → a reupload focus target when the rider can self-serve. */
export function resolveMissingDocUpload(
  reasons: EligibilityReason[],
): MissingDocUploadTarget | null {
  const codes = reasons.map((r) => r.code.toUpperCase());

  const dlNeedsUpload = codes.some(
    (c) =>
      c === "DL_REQUIRED_NOT_VERIFIED" ||
      c === "DL_REQUIRED_REJECTED" ||
      c === "DL_EXPIRED",
  );
  const rcNeedsUpload = codes.some(
    (c) =>
      c === "RC_REQUIRED_NOT_VERIFIED" ||
      c === "RC_REQUIRED_REJECTED" ||
      c === "RC_EXPIRED",
  );

  if (dlNeedsUpload) {
    const rejected = codes.some((c) => c === "DL_REQUIRED_REJECTED" || c === "DL_EXPIRED");
    return {
      label: rejected ? "Re-upload Driving Licence" : "Upload Driving Licence",
      focus: "dl",
    };
  }
  if (rcNeedsUpload) {
    const rejected = codes.some((c) => c === "RC_REQUIRED_REJECTED" || c === "RC_EXPIRED");
    return {
      label: rejected ? "Re-upload RC" : "Upload RC",
      focus: "rc",
    };
  }

  // Already uploaded — waiting for review. Do not offer another upload.
  if (codes.some((c) => c.includes("_PENDING") || c.includes("PENDING"))) return null;

  // Legacy/fallback text matching — only when no typed code matched.
  const blob = reasons.map((r) => `${r.code} ${r.reason} ${r.requiredAction ?? ""}`).join(" ");
  if (/pending\s+review|is\s+pending/i.test(blob)) return null;
  if (
    codes.some((c) => c.startsWith("DL_") || c.includes("DRIVING_LICENSE")) ||
    /driving\s*licen/i.test(blob)
  ) {
    return { label: "Upload Driving Licence", focus: "dl" };
  }
  if (
    codes.some((c) => c.startsWith("RC_") || c.includes("REGISTRATION")) ||
    /\bRC\b|registration certificate/i.test(blob)
  ) {
    return { label: "Upload RC", focus: "rc" };
  }
  return null;
}

type Props = {
  visible: boolean;
  serviceLabel: string;
  reasons: EligibilityReason[];
  onClose: () => void;
  onCheckVehicles: () => void;
  /** When set, primary CTA sends the rider to DL/RC reupload. */
  onUploadMissingDoc?: (target: MissingDocUploadTarget) => void;
};

export function ServiceEligibilityReasonSheet({
  visible,
  serviceLabel,
  reasons,
  onClose,
  onCheckVehicles,
  onUploadMissingDoc,
}: Props) {
  const uploadTarget = useMemo(() => resolveMissingDocUpload(reasons), [reasons]);
  const canUpload = Boolean(uploadTarget && onUploadMissingDoc);
  const allPending =
    reasons.length > 0 &&
    reasons.every((r) => reasonTone(r.code) === "pending");

  const sloganMode = useMemo(() => resolveEligibilitySloganMode(reasons), [reasons]);
  const isAreaSlogan = sloganMode === "area" && !allPending;
  const displayReasons = useMemo(() => {
    if (!isAreaSlogan) return reasons;
    // Docs complete — never show "vehicle or area"; show clear area message.
    return [areaEligibilityDisplayReason()];
  }, [isAreaSlogan, reasons]);

  return (
    <DismissibleBottomSheetShell
      visible={visible}
      onDismiss={onClose}
      maxHeightRatio={0.72}
      fitContent
      compactBottomInset
      sheetBottomPadding={24}
    >
      <View style={styles.content}>
        <View
          style={[
            styles.iconWrap,
            allPending && styles.iconWrapPending,
            isAreaSlogan && styles.iconWrapArea,
          ]}
        >
          <Ionicons
            name={
              allPending
                ? "time-outline"
                : isAreaSlogan
                  ? "location-outline"
                  : "lock-closed-outline"
            }
            size={26}
            color={isAreaSlogan ? "#0F766E" : "#B45309"}
          />
        </View>

        <Text style={styles.title}>
          {allPending
            ? `${serviceLabel} — verification pending`
            : isAreaSlogan
              ? `${serviceLabel} not available in your area`
              : `${serviceLabel} not available yet`}
        </Text>
        <Text style={styles.subtitle}>
          {allPending
            ? "Your document is under review. Once verified, this service will become Active."
            : isAreaSlogan
              ? "This service isn't offered at your current work location."
              : "You can turn this on once it's eligible. Here's what's needed:"}
        </Text>

        <ScrollView
          style={styles.list}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          bounces={false}
        >
          {displayReasons.map((r, i) => {
            const tone = isAreaSlogan ? "default" : reasonTone(r.code);
            return (
              <View
                key={`${r.code}-${i}`}
                style={[
                  styles.reasonRow,
                  isAreaSlogan && styles.reasonRowArea,
                  tone === "pending" && styles.reasonRowPending,
                  tone === "rejected" && styles.reasonRowRejected,
                ]}
              >
                <Ionicons
                  name={
                    isAreaSlogan
                      ? "alert-circle"
                      : tone === "pending"
                        ? "time-outline"
                        : tone === "rejected"
                          ? "close-circle"
                          : "alert-circle"
                  }
                  size={20}
                  color={
                    isAreaSlogan
                      ? "#0F766E"
                      : tone === "pending"
                        ? "#B45309"
                        : tone === "rejected"
                          ? "#DC2626"
                          : "#DC2626"
                  }
                />
                <View style={styles.reasonBody}>
                  {!isAreaSlogan && (tone === "pending" || tone === "rejected") ? (
                    <Text
                      style={[
                        styles.statusBadge,
                        tone === "pending" ? styles.statusPending : styles.statusRejected,
                      ]}
                    >
                      {tone === "pending" ? "Pending" : "Rejected"}
                    </Text>
                  ) : null}
                  <Text style={styles.reasonText}>{r.reason}</Text>
                </View>
              </View>
            );
          })}
        </ScrollView>

        <View style={styles.actions}>
          {canUpload && uploadTarget ? (
            <TouchableOpacity
              activeOpacity={0.88}
              onPress={() => onUploadMissingDoc?.(uploadTarget)}
              style={styles.primaryBtn}
              accessibilityRole="button"
              accessibilityLabel={uploadTarget.label}
            >
              <Ionicons name="cloud-upload-outline" size={18} color="#FFFFFF" />
              <Text style={styles.primaryBtnText} numberOfLines={1}>
                {uploadTarget.label}
              </Text>
            </TouchableOpacity>
          ) : null}

          {isAreaSlogan ? (
            <TouchableOpacity
              activeOpacity={0.88}
              onPress={onClose}
              style={styles.primaryBtn}
              accessibilityRole="button"
              accessibilityLabel="Got it"
            >
              <Text style={styles.primaryBtnText}>Got it</Text>
            </TouchableOpacity>
          ) : (
            <View style={styles.actionsRow}>
              <View style={styles.primarySlot}>
                <TouchableOpacity
                  activeOpacity={0.88}
                  onPress={onCheckVehicles}
                  style={canUpload ? styles.secondaryBtn : styles.primaryBtn}
                  accessibilityRole="button"
                  accessibilityLabel="Check your vehicles"
                >
                  {!canUpload ? (
                    <Ionicons name="bicycle-outline" size={18} color="#FFFFFF" />
                  ) : null}
                  <Text
                    style={canUpload ? styles.secondaryBtnText : styles.primaryBtnText}
                    numberOfLines={1}
                  >
                    Check your vehicles
                  </Text>
                </TouchableOpacity>
              </View>
              <View style={styles.secondarySlot}>
                <TouchableOpacity
                  activeOpacity={0.88}
                  onPress={onClose}
                  style={styles.closeBtn}
                  accessibilityRole="button"
                  accessibilityLabel="Close"
                >
                  <Text style={styles.closeBtnText}>Close</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>
      </View>
    </DismissibleBottomSheetShell>
  );
}

const styles = StyleSheet.create({
  content: {
    width: "100%",
    alignSelf: "stretch",
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 4,
  },
  iconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "#FEF3C7",
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "center",
    marginBottom: 14,
  },
  iconWrapPending: {
    backgroundColor: "#FEF3C7",
  },
  iconWrapArea: {
    backgroundColor: "#CCFBF1",
  },
  title: {
    fontFamily: RiderFonts.poppinsExtraBold,
    fontSize: 22,
    lineHeight: 28,
    color: "#0F172A",
    textAlign: "center",
    marginBottom: 8,
  },
  subtitle: {
    fontFamily: RiderFonts.poppinsSemiBold,
    fontSize: 14,
    lineHeight: 20,
    color: "#64748B",
    textAlign: "center",
    marginBottom: 16,
    paddingHorizontal: 4,
  },
  list: {
    alignSelf: "stretch",
    maxHeight: 160,
    width: "100%",
  },
  listContent: {
    paddingBottom: 4,
  },
  reasonRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    backgroundColor: "#FEF2F2",
    borderWidth: 1,
    borderColor: "#FECACA",
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 8,
  },
  reasonRowArea: {
    backgroundColor: "#F0FDFA",
    borderColor: "#99F6E4",
  },
  reasonRowPending: {
    backgroundColor: "#FFFBEB",
    borderColor: "#FDE68A",
  },
  reasonRowRejected: {
    backgroundColor: "#FEF2F2",
    borderColor: "#FECACA",
  },
  reasonBody: {
    flex: 1,
    gap: 4,
  },
  statusBadge: {
    fontFamily: RiderFonts.poppinsBold,
    fontSize: 11,
    letterSpacing: 0.4,
    textTransform: "uppercase",
    marginBottom: 2,
  },
  statusPending: {
    color: "#B45309",
  },
  statusRejected: {
    color: "#DC2626",
  },
  reasonText: {
    flex: 1,
    fontFamily: RiderFonts.poppinsSemiBold,
    fontSize: 14,
    lineHeight: 20,
    color: "#111827",
  },
  actions: {
    alignSelf: "stretch",
    width: "100%",
    marginTop: 16,
    gap: 10,
  },
  actionsRow: {
    flexDirection: "row",
    alignItems: "stretch",
    alignSelf: "stretch",
    width: "100%",
  },
  primarySlot: {
    flex: 1,
    paddingRight: 6,
    minWidth: 0,
  },
  secondarySlot: {
    flexGrow: 0,
    flexShrink: 0,
    width: 96,
    paddingLeft: 6,
  },
  primaryBtn: {
    width: "100%",
    minHeight: 52,
    borderRadius: 14,
    backgroundColor: PRIMARY_GREEN,
    borderWidth: 1.5,
    borderColor: PRIMARY_GREEN_BORDER,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 14,
  },
  primaryBtnText: {
    fontFamily: RiderFonts.poppinsBold,
    fontSize: 14,
    color: "#FFFFFF",
    flexShrink: 1,
  },
  secondaryBtn: {
    width: "100%",
    minHeight: 52,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: "#334155",
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 10,
  },
  secondaryBtnText: {
    fontFamily: RiderFonts.poppinsBold,
    fontSize: 13,
    color: "#0F172A",
  },
  closeBtn: {
    width: "100%",
    minHeight: 52,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: "#111111",
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 8,
  },
  closeBtnText: {
    fontFamily: RiderFonts.poppinsBold,
    fontSize: 15,
    color: "#111827",
  },
});
