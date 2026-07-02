import { useState, useEffect } from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { merchantCancellationDisplay } from "@/lib/merchant-cancellation-display";
import {
  resolveCancellationMessageParts,
  formatAppliedPayoutPolicy,
  type MerchantCancellationCompensationDisplay,
} from "@/lib/merchantCancellationCompensation";
import { resolveOrderPrepTimingFootnote } from "@/lib/order-prep-time";
import { CompensationPolicyModal } from "@/components/order/CompensationPolicyModal";
import { prefetchCompensationPolicy } from "@/lib/compensationPolicyCache";
import { GatiMitraMerchant, CARD_RADIUS, CARD_PADDING } from "@/constants/theme";

type Props = {
  rejectedReason?: string | null;
  cancelledByLabel?: string | null;
  cancelledByType?: string | null;
  cancelledAt?: string | null;
  orderStatus?: string | null;
  cancellationCompensation?: MerchantCancellationCompensationDisplay | null;
  storeId?: number;
  authToken?: string | null;
  /** List cards show only cancelled-by + reason; detail page shows policy + prep timing. */
  variant?: "compact" | "detail";
  preparedAt?: string | null;
  prepReadyByAt?: string | null;
  preparedLateMinutes?: number | null;
};

export function OrderCancellationBanner({
  rejectedReason,
  cancelledByLabel,
  cancelledByType,
  cancelledAt,
  orderStatus,
  cancellationCompensation,
  storeId,
  authToken,
  variant = "detail",
  preparedAt,
  prepReadyByAt,
  preparedLateMinutes,
}: Props) {
  const [policyOpen, setPolicyOpen] = useState(false);
  const status = (orderStatus ?? "").toUpperCase();
  const isCompact = variant === "compact";

  useEffect(() => {
    if (storeId != null && storeId > 0 && authToken) {
      prefetchCompensationPolicy(storeId, authToken);
    }
  }, [storeId, authToken]);

  if (
    !rejectedReason?.trim() &&
    !cancelledByLabel?.trim() &&
    !cancelledByType?.trim() &&
    !cancellationCompensation?.eligible_message &&
    status !== "CANCELLED"
  ) {
    return null;
  }

  const { headline, detail } = merchantCancellationDisplay({
    rejected_reason: rejectedReason,
    cancelled_by_label: cancelledByLabel,
    cancelled_by_type: cancelledByType,
  });

  const parts = resolveCancellationMessageParts({
    eligibleMessage: cancellationCompensation?.eligible_message,
    cancelledByBrand: cancellationCompensation?.cancelled_by_brand,
    cancelledByType,
    cancelledByLabel,
    reasonDetail: cancellationCompensation?.reason_detail,
    rejectedReason: rejectedReason ?? cancellationCompensation?.reason_detail,
  });

  const prepFootnote = !isCompact
    ? resolveOrderPrepTimingFootnote({
        prepared_at: preparedAt,
        prep_ready_by_at: prepReadyByAt,
        prepared_late_minutes: preparedLateMinutes,
      })
    : null;

  let meta = "";
  if (!isCompact && cancelledByType?.trim()) {
    meta = cancelledByType.trim();
    if (cancelledAt) {
      try {
        meta += ` • ${new Date(cancelledAt).toLocaleString("en-IN")}`;
      } catch {
        /* ignore */
      }
    }
  }

  const showPolicyLink =
    !isCompact &&
    Boolean(cancellationCompensation?.show_policy_link) &&
    storeId != null &&
    storeId > 0 &&
    Boolean(authToken);

  const appliedPayoutPolicy = !isCompact
    ? formatAppliedPayoutPolicy(cancellationCompensation)
    : null;

  const hasEngineParts = Boolean(parts.brandPrefix || parts.cancelReason);

  return (
    <View style={styles.wrap}>
      <Text style={styles.heading}>CANCELLED</Text>

      {hasEngineParts ? (
        <Text style={styles.engineMessage}>
          {parts.brandPrefix ? (
            <Text style={styles.brandAccent}>{parts.brandPrefix} </Text>
          ) : null}
          {parts.cancelReason ?? ""}
        </Text>
      ) : (
        <>
          {headline ? <Text style={styles.headline}>{headline}</Text> : null}
          {detail ? <Text style={styles.detail}>{detail}</Text> : null}
        </>
      )}

      {!isCompact && parts.policySentence ? (
        <Text style={styles.policySentence}>{parts.policySentence}</Text>
      ) : null}

      {!isCompact && appliedPayoutPolicy ? (
        <Text style={styles.appliedPolicy}>{appliedPayoutPolicy}</Text>
      ) : null}

      {showPolicyLink ? (
        <Pressable onPress={() => setPolicyOpen(true)} style={styles.policyLinkWrap}>
          <Text style={styles.policyLink}>View compensation policy</Text>
        </Pressable>
      ) : null}

      {prepFootnote ? (
        <View style={styles.prepFootnoteRow}>
          <Ionicons
            name="time-outline"
            size={14}
            color={prepFootnote.tone === "early" ? "#34D399" : "#F87171"}
          />
          <Text
            style={[
              styles.prepFootnoteText,
              prepFootnote.tone === "early" ? styles.prepFootnoteEarly : styles.prepFootnoteDelayed,
            ]}
          >
            {prepFootnote.text}
          </Text>
        </View>
      ) : null}

      {meta ? <Text style={styles.meta}>{meta}</Text> : null}

      {showPolicyLink && storeId && authToken ? (
        <CompensationPolicyModal
          visible={policyOpen}
          onClose={() => setPolicyOpen(false)}
          storeId={storeId}
          token={authToken}
          title={cancellationCompensation?.policy_modal_title}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginTop: 12,
    backgroundColor: "#1C1C1C",
    borderRadius: CARD_RADIUS,
    borderWidth: 1,
    borderColor: "#333333",
    padding: CARD_PADDING,
  },
  heading: {
    fontSize: 10,
    fontWeight: "700",
    color: "#FCA5A5",
    letterSpacing: 0.6,
    marginBottom: 8,
  },
  engineMessage: {
    fontSize: 14,
    fontWeight: "500",
    color: "#E5E5E5",
    lineHeight: 21,
  },
  brandAccent: {
    color: "#F87171",
    fontWeight: "700",
  },
  policySentence: {
    fontSize: 14,
    fontWeight: "500",
    color: "#E5E5E5",
    lineHeight: 21,
    marginTop: 6,
  },
  appliedPolicy: {
    fontSize: 13,
    fontWeight: "600",
    color: "#A7F3D0",
    lineHeight: 20,
    marginTop: 8,
  },
  headline: {
    fontSize: 14,
    fontWeight: "600",
    color: "#F5F5F5",
    lineHeight: 20,
  },
  detail: {
    fontSize: 12,
    color: "#D4D4D4",
    marginTop: 4,
    lineHeight: 18,
  },
  policyLinkWrap: { marginTop: 10 },
  policyLink: {
    fontSize: 13,
    fontWeight: "600",
    color: "#60A5FA",
  },
  prepFootnoteRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#333333",
  },
  prepFootnoteText: {
    flex: 1,
    fontSize: 12,
    fontWeight: "600",
    lineHeight: 18,
  },
  prepFootnoteEarly: {
    color: "#34D399",
  },
  prepFootnoteDelayed: {
    color: "#F87171",
  },
  meta: {
    fontSize: 10,
    color: "#A3A3A3",
    marginTop: 8,
    textTransform: "capitalize",
  },
});
