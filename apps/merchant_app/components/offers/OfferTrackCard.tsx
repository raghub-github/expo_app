import { useMemo, useState } from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { Offer } from "@/services/offersApi";
import { formatOfferInr, getOfferAnalytics } from "@/lib/offers/offer-analytics";
import {
  formatOfferCardDateRange,
  formatOfferSlotSummary,
  formatOfferTypeLabel,
  getOfferLifecycle,
  getOfferStatusBadgeColors,
  hasOfferScheduleRestrictions,
  isOfferCampaignExpired,
  offerHeadline,
} from "@/lib/offers/offer-lifecycle";
import { OFFERS_UI } from "./offers-theme";
import { GatiMitraMerchant } from "@/constants/theme";

type Props = {
  offer: Offer;
  storeName: string | null;
  onEdit: () => void;
  onToggle: () => void;
  onDelete: () => void;
};

function MetricBox({ value, label }: { value: string; label: string }) {
  return (
    <View style={styles.metricBox}>
      <Text style={styles.metricValue} numberOfLines={1}>
        {value}
      </Text>
      <Text style={styles.metricLabel} numberOfLines={2}>
        {label}
      </Text>
    </View>
  );
}

export function OfferTrackCard({ offer, storeName, onEdit, onToggle, onDelete }: Props) {
  const [expanded, setExpanded] = useState(false);
  const lifecycle = useMemo(() => getOfferLifecycle(offer), [offer]);
  const badge = useMemo(() => getOfferStatusBadgeColors(lifecycle), [lifecycle]);
  const analytics = useMemo(() => getOfferAnalytics(offer), [offer]);
  const headline = offerHeadline(offer);
  const dateRange = formatOfferCardDateRange(offer);
  const slotSummary = formatOfferSlotSummary(offer);
  const hasSlots = hasOfferScheduleRestrictions(offer);
  const expired = isOfferCampaignExpired(offer);
  const canResume = !offer.is_active && !expired;
  const showToggle = offer.is_active || canResume;

  const meta = (offer.offer_metadata ?? {}) as Record<string, unknown>;
  const typeUpper = String(offer.offer_type ?? "").toUpperCase();
  const isBogoType =
    typeUpper === "BOGO" ||
    typeUpper === "BUY_X_GET_Y" ||
    typeUpper === "BUY_N_GET_M" ||
    meta.create_path === "bogo";
  const modeLabel = isBogoType
    ? "BOGO"
    : meta.create_path === "boost" || meta.create_path === "precision"
      ? meta.create_path === "boost"
        ? "Boost"
        : "Precision"
      : meta.conditions_mode === "boost" || meta.conditions_mode === "precision"
        ? meta.conditions_mode === "boost"
          ? "Boost"
          : "Precision"
        : null;

  const subtitleParts: string[] = [];
  if (headline && headline !== offer.offer_title) subtitleParts.push(headline);
  if (offer.min_order_amount && Number(offer.min_order_amount) > 0) {
    subtitleParts.push(`Min order ${formatOfferInr(Number(offer.min_order_amount))}`);
  }
  const subtitle = subtitleParts.length > 0 ? subtitleParts.join(" · ") : formatOfferTypeLabel(offer.offer_type);

  return (
    <View style={styles.card}>
      <View style={styles.cardInner}>
        <View style={styles.topRow}>
          <View style={[styles.statusPill, { backgroundColor: badge.backgroundColor }]}>
            <Text style={[styles.statusText, { color: badge.color }]}>{badge.label.toUpperCase()}</Text>
          </View>
          <View style={styles.typeIconWrap}>
            <Ionicons name="pricetag" size={20} color={GatiMitraMerchant.primary} />
          </View>
        </View>

        <Text style={styles.title} numberOfLines={2}>
          {offer.offer_title}
        </Text>
        <Text style={styles.subtitle} numberOfLines={2}>
          {subtitle}
        </Text>
        {modeLabel ? (
          <Text
            style={[
              styles.modeLabel,
              modeLabel === "Boost"
                ? styles.modeLabelBoost
                : modeLabel === "BOGO"
                  ? styles.modeLabelBogo
                  : styles.modeLabelPrecision,
            ]}
          >
            {modeLabel}
          </Text>
        ) : null}

        {storeName ? (
          <View style={styles.metaRow}>
            <Ionicons name="storefront-outline" size={15} color={OFFERS_UI.textFaint} />
            <Text style={styles.metaText} numberOfLines={1}>
              {storeName}
            </Text>
          </View>
        ) : null}

        <View style={styles.metaRow}>
          <Ionicons name="calendar-outline" size={15} color={OFFERS_UI.textFaint} />
          <Text style={styles.metaText}>{dateRange}</Text>
        </View>

        {hasSlots ? (
          <View style={styles.slotChip}>
            <Ionicons name="time-outline" size={13} color={GatiMitraMerchant.navy} />
            <Text style={styles.slotText} numberOfLines={2}>
              {slotSummary}
            </Text>
          </View>
        ) : null}

        <View style={styles.metricsGrid}>
          <MetricBox value={formatOfferInr(analytics.gross)} label="Gross sales" />
          <MetricBox value={String(analytics.orders)} label="Orders" />
          <MetricBox value={`${analytics.effPct}%`} label="Eff. discount" />
          <MetricBox value={formatOfferInr(analytics.discount)} label="Discount spend" />
        </View>

        {expanded ? (
          <View style={styles.details}>
            {offer.coupon_code ? (
              <DetailRow icon="ticket-outline" label="Coupon" value={offer.coupon_code} accent />
            ) : null}
            {offer.max_discount_amount && Number(offer.max_discount_amount) > 0 ? (
              <DetailRow
                icon="shield-outline"
                label="Max discount"
                value={formatOfferInr(Number(offer.max_discount_amount))}
              />
            ) : null}
            {offer.current_uses > 0 ? (
              <DetailRow
                icon="repeat-outline"
                label="Redemptions"
                value={
                  offer.max_uses_total != null
                    ? `${offer.current_uses} / ${offer.max_uses_total}`
                    : String(offer.current_uses)
                }
              />
            ) : null}
            {offer.offer_description ? (
              <Text style={styles.desc}>{offer.offer_description}</Text>
            ) : null}
          </View>
        ) : null}

        <Pressable
          onPress={() => setExpanded(!expanded)}
          style={({ pressed }) => [styles.expandRow, pressed && { opacity: 0.7 }]}
        >
          <Text style={styles.expandText}>{expanded ? "Hide details" : "View details"}</Text>
          <Ionicons
            name={expanded ? "chevron-up" : "chevron-down"}
            size={16}
            color={GatiMitraMerchant.primary}
          />
        </Pressable>

        <View style={styles.actions}>
          {showToggle ? (
            <ActionButton
              icon={offer.is_active ? "pause-circle" : "play-circle"}
              label={offer.is_active ? "Pause" : "Activate"}
              color={offer.is_active ? GatiMitraMerchant.warning : GatiMitraMerchant.success}
              onPress={onToggle}
            />
          ) : null}
          <ActionButton icon="create-outline" label="Edit" color={GatiMitraMerchant.primary} onPress={onEdit} />
          <ActionButton icon="trash-outline" label="Remove" color={GatiMitraMerchant.error} onPress={onDelete} />
        </View>
      </View>
    </View>
  );
}

function DetailRow({
  icon,
  label,
  value,
  accent,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <View style={styles.detailRow}>
      <Ionicons name={icon} size={14} color={accent ? "#7c3aed" : OFFERS_UI.textFaint} />
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={[styles.detailValue, accent && styles.detailValueAccent]}>{value}</Text>
    </View>
  );
}

function ActionButton({
  icon,
  label,
  color,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  color: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.actionBtn, pressed && { opacity: 0.75 }]}
    >
      <Ionicons name={icon} size={16} color={color} />
      <Text style={[styles.actionLabel, { color }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    marginBottom: 14,
    borderRadius: 16,
    backgroundColor: OFFERS_UI.cardBg,
    borderWidth: 1,
    borderColor: OFFERS_UI.cardBorder,
    ...GatiMitraMerchant.shadowSm,
  },
  cardInner: { padding: 16 },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  statusPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  statusText: { fontSize: 10, fontWeight: "800", letterSpacing: 0.5 },
  typeIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: OFFERS_UI.accentSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  title: { fontSize: 17, fontWeight: "800", color: OFFERS_UI.text, lineHeight: 22 },
  subtitle: { fontSize: 13, color: OFFERS_UI.textMuted, marginTop: 4, lineHeight: 18 },
  modeLabel: { fontSize: 11, fontWeight: "700", marginTop: 4 },
  modeLabelBoost: { color: "#047857" },
  modeLabelPrecision: { color: "#4338CA" },
  modeLabelBogo: { color: "#6D28D9" },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 10 },
  metaText: { flex: 1, fontSize: 13, color: OFFERS_UI.textMuted, lineHeight: 18 },
  slotChip: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 6,
    marginTop: 10,
    padding: 10,
    borderRadius: 10,
    backgroundColor: "#F0F9FF",
    borderWidth: 1,
    borderColor: "#BAE6FD",
  },
  slotText: { flex: 1, fontSize: 12, color: GatiMitraMerchant.navy, lineHeight: 17 },
  metricsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 14,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: OFFERS_UI.metricDivider,
  },
  metricBox: {
    width: "48%",
    flexGrow: 1,
    backgroundColor: GatiMitraMerchant.surfaceSubtle,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 8,
    alignItems: "center",
    minHeight: 56,
    justifyContent: "center",
  },
  metricValue: { fontSize: 15, fontWeight: "800", color: OFFERS_UI.text },
  metricLabel: {
    fontSize: 10,
    color: OFFERS_UI.textFaint,
    marginTop: 3,
    textAlign: "center",
  },
  details: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: OFFERS_UI.metricDivider,
    gap: 8,
  },
  detailRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  detailLabel: { fontSize: 12, color: OFFERS_UI.textFaint, width: 88 },
  detailValue: { flex: 1, fontSize: 12, fontWeight: "600", color: OFFERS_UI.text },
  detailValueAccent: { color: "#7c3aed", fontFamily: undefined },
  desc: { fontSize: 12, color: OFFERS_UI.textMuted, lineHeight: 18, marginTop: 4 },
  expandRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    marginTop: 12,
    paddingVertical: 6,
  },
  expandText: { fontSize: 13, fontWeight: "600", color: GatiMitraMerchant.primary },
  actions: {
    flexDirection: "row",
    gap: 8,
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: OFFERS_UI.metricDivider,
  },
  actionBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: OFFERS_UI.cardBorder,
  },
  actionLabel: { fontSize: 12, fontWeight: "700" },
});
