/**
 * Zomato-style delivery partner card on live order tracking.
 */

import { View, Text, StyleSheet, TouchableOpacity, Image, type ReactNode, type StyleProp, type ViewStyle } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { GatiMitraColors } from "@/constants/gatimitra";
import { FOOD_TIP_PRESETS } from "@/components/orders/FoodOrderTipSheet";
import { PartnerChatUnreadBadge } from "@/components/orders/PartnerChatUnreadBadge";

const CARD = GatiMitraColors.cardSurface;
const BORDER = GatiMitraColors.border;
const TEXT = GatiMitraColors.textPrimaryNew;
const MUTED = GatiMitraColors.textSecondary;
const ZOMATO_RED = "#E23744";
const CALL_BTN_BG = "#FFF0F0";
const RATING_GREEN = "#256948";

function DashedDivider() {
  return (
    <View style={styles.dashedWrap}>
      <Text style={styles.dashedLine} numberOfLines={1}>
        - - - - - - - - - - - - - - - - - - - -
      </Text>
    </View>
  );
}

export function formatRiderDeliveredSubtitle(
  count?: number | null,
  kind: "ride" | "delivery" = "delivery"
): string {
  const unit = kind === "ride" ? "rides completed" : "orders delivered";
  if (count == null || count <= 0) {
    return kind === "ride" ? "Your ride captain" : "Your delivery partner";
  }
  if (count >= 6000) return `6k+ ${unit}`;
  if (count >= 1000) {
    const k = Math.floor(count / 1000);
    return `${k}k+ ${unit}`;
  }
  return `${count}+ ${unit}`;
}

type Props = {
  riderName: string;
  riderFirstName: string;
  riderPhotoUri?: string | null;
  riderRating?: string | null;
  deliveredOrdersCount?: number | null;
  chatUnreadCount?: number;
  existingTipAmount?: number;
  onMessage: () => void;
  onCall: () => void;
  onTipPreset: () => void;
  onSafetyPress?: () => void;
  extraSection?: ReactNode;
  /** Post-delivery: customer uniform feedback */
  customerUniformFeedback?: boolean | null;
  onCustomerUniformFeedback?: (inUniform: boolean) => void;
  uniformFeedbackDisabled?: boolean;
  /** Post-delivery copy and layout tweaks. */
  mode?: "tracking" | "delivered";
  /** Ride vs food/parcel — affects partner subtitle on delivered screen. */
  partnerKind?: "ride" | "delivery";
  style?: StyleProp<ViewStyle>;
};

export function DeliveryPartnerTrackingCard({
  riderName,
  riderFirstName,
  riderPhotoUri,
  riderRating,
  deliveredOrdersCount,
  chatUnreadCount = 0,
  existingTipAmount = 0,
  onMessage,
  onCall,
  onTipPreset,
  onSafetyPress,
  extraSection,
  customerUniformFeedback,
  onCustomerUniformFeedback,
  uniformFeedbackDisabled = false,
  mode = "tracking",
  partnerKind = "delivery",
  style,
}: Props) {
  const isDelivered = mode === "delivered";
  const messageLabel =
    chatUnreadCount > 0
      ? `${chatUnreadCount} new message${chatUnreadCount === 1 ? "" : "s"}`
      : "Send a message";

  return (
    <View style={[styles.card, style]}>
      <View style={styles.partnerHeader}>
        <View style={styles.partnerAvatar}>
          {riderPhotoUri ? (
            <Image source={{ uri: riderPhotoUri }} style={styles.partnerAvatarImg} />
          ) : (
            <Text style={styles.partnerAvatarText}>{riderName.slice(0, 1).toUpperCase()}</Text>
          )}
        </View>
        <View style={styles.partnerInfo}>
          <Text style={styles.partnerName} numberOfLines={1}>
            {riderName}
          </Text>
          <Text style={styles.partnerSub}>
            {formatRiderDeliveredSubtitle(deliveredOrdersCount, partnerKind)}
          </Text>
        </View>
        {riderRating ? (
          <View style={styles.ratingPill}>
            <Text style={styles.ratingText}>{riderRating} ★</Text>
          </View>
        ) : null}
      </View>

      <View style={styles.messageBarRow}>
        <TouchableOpacity style={styles.messageBar} onPress={onMessage} activeOpacity={0.85}>
          <View style={styles.messageIconWrap}>
            <Ionicons name="chatbubble-ellipses" size={18} color={ZOMATO_RED} />
            <PartnerChatUnreadBadge count={chatUnreadCount} style={styles.messageUnreadBadge} />
          </View>
          <Text style={styles.messageBarText}>{messageLabel}</Text>
          <Ionicons name="chevron-forward" size={16} color="#C4C4C4" />
        </TouchableOpacity>
        <TouchableOpacity style={styles.callCircle} onPress={onCall} activeOpacity={0.85}>
          <Ionicons name="call" size={20} color={ZOMATO_RED} />
        </TouchableOpacity>
      </View>

      {existingTipAmount > 0 ? (
        <>
          <DashedDivider />
          <Text style={styles.tipNote}>
            {isDelivered
              ? `You tipped ₹${existingTipAmount.toFixed(0)}. 100% goes to ${riderFirstName} directly.`
              : `You tipped ₹${existingTipAmount.toFixed(0)}. 100% goes to ${riderFirstName} after delivery.`}
          </Text>
        </>
      ) : (
        <>
          <DashedDivider />
          <Text style={styles.tipNote}>
            {isDelivered
              ? `Thank ${riderFirstName} by leaving a tip. 100% of the amount will go to them directly`
              : `Thank ${riderFirstName} by leaving a tip. 100% of the amount will go to them after delivery`}
          </Text>
          <View style={styles.tipChipRow}>
            {FOOD_TIP_PRESETS.map((amount) => (
              <TouchableOpacity
                key={amount}
                style={styles.tipChipBtn}
                onPress={onTipPreset}
                activeOpacity={0.85}
              >
                <Text style={styles.tipChipBtnText}>₹{amount}</Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity style={styles.tipChipBtn} onPress={onTipPreset} activeOpacity={0.85}>
              <Text style={styles.tipChipBtnText}>Other</Text>
            </TouchableOpacity>
          </View>
        </>
      )}

      {extraSection ? (
        <>
          <DashedDivider />
          {extraSection}
        </>
      ) : null}

      {isDelivered && onCustomerUniformFeedback ? (
        <>
          <DashedDivider />
          <Text style={styles.uniformQuestion}>
            Was Delivery partner in Gatimitra Uniform?
            {customerUniformFeedback === true ? (
              <Text style={styles.uniformAnswer}> Yes</Text>
            ) : customerUniformFeedback === false ? (
              <Text style={styles.uniformAnswer}> No</Text>
            ) : null}
          </Text>
          {customerUniformFeedback == null ? (
            <View style={styles.uniformBtnRow}>
              <TouchableOpacity
                style={[
                  styles.uniformBtn,
                  uniformFeedbackDisabled && styles.uniformBtnDisabled,
                ]}
                onPress={() => onCustomerUniformFeedback(true)}
                activeOpacity={0.85}
                disabled={uniformFeedbackDisabled}
              >
                <Text style={styles.uniformBtnText}>YES</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.uniformBtn,
                  uniformFeedbackDisabled && styles.uniformBtnDisabled,
                ]}
                onPress={() => onCustomerUniformFeedback(false)}
                activeOpacity={0.85}
                disabled={uniformFeedbackDisabled}
              >
                <Text style={styles.uniformBtnText}>NO</Text>
              </TouchableOpacity>
            </View>
          ) : null}
        </>
      ) : null}

      <DashedDivider />

      <TouchableOpacity
        style={styles.safetyRow}
        onPress={onSafetyPress}
        activeOpacity={0.85}
        disabled={!onSafetyPress}
      >
        <Ionicons name="shield-checkmark-outline" size={18} color={MUTED} />
        <Text style={styles.safetyText}>Learn about delivery partner safety</Text>
        <Ionicons name="chevron-forward" size={18} color="#C4C4C4" />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: CARD,
    borderRadius: 16,
    padding: 14,
    marginTop: 14,
    borderWidth: 1,
    borderColor: BORDER,
    ...GatiMitraColors.elevationShadow,
  },
  partnerHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 14,
  },
  partnerAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#F3F4F6",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  partnerAvatarImg: { width: 48, height: 48 },
  partnerAvatarText: { fontSize: 18, fontWeight: "700", color: MUTED },
  partnerInfo: { flex: 1, minWidth: 0 },
  partnerName: {
    fontSize: 16,
    fontWeight: "700",
    color: TEXT,
  },
  ratingPill: {
    backgroundColor: RATING_GREEN,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    alignSelf: "flex-start",
  },
  ratingText: { fontSize: 12, fontWeight: "700", color: "#fff" },
  partnerSub: { fontSize: 12, color: MUTED, marginTop: 3, fontWeight: "500" },
  messageBarRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  messageIconWrap: {
    width: 22,
    height: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  messageUnreadBadge: {
    position: "absolute",
    top: -6,
    right: -8,
  },
  messageBar: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
    borderColor: "#E8E8E8",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 11,
    backgroundColor: "#fff",
  },
  messageBarText: { flex: 1, fontSize: 14, color: MUTED, fontWeight: "500" },
  callCircle: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: CALL_BTN_BG,
  },
  dashedWrap: { marginVertical: 12, overflow: "hidden" },
  dashedLine: { fontSize: 10, color: "#E5E7EB", letterSpacing: 1 },
  tipNote: {
    fontSize: 13,
    fontWeight: "700",
    color: TEXT,
    lineHeight: 19,
  },
  tipChipRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 12,
  },
  tipChipBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#E8E8E8",
    borderRadius: 10,
    paddingVertical: 11,
    alignItems: "center",
    backgroundColor: "#fff",
  },
  tipChipBtnText: {
    fontSize: 13,
    fontWeight: "700",
    color: TEXT,
  },
  safetyRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  safetyText: {
    flex: 1,
    fontSize: 13,
    fontWeight: "700",
    color: TEXT,
  },
  uniformQuestion: {
    fontSize: 14,
    fontWeight: "700",
    color: TEXT,
    marginBottom: 12,
  },
  uniformAnswer: {
    fontWeight: "700",
    color: TEXT,
  },
  uniformBtnRow: {
    flexDirection: "row",
    gap: 10,
  },
  uniformBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: ZOMATO_RED,
    borderRadius: 10,
    paddingVertical: 13,
    alignItems: "center",
    backgroundColor: "#fff",
  },
  uniformBtnActive: {
    backgroundColor: "#FFF0F0",
  },
  uniformBtnDisabled: {
    opacity: 0.65,
  },
  uniformBtnText: {
    fontSize: 14,
    fontWeight: "700",
    color: ZOMATO_RED,
  },
  uniformBtnTextActive: {
    color: ZOMATO_RED,
  },
});
