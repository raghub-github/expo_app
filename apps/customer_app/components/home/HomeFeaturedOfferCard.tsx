/**
 * Home featured offer — tear-off ticket promo card (reference UI).
 * All copy comes from GET /v1/offers/featured (no hardcoded offer values).
 */

import { View, Text, StyleSheet } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { GatiMitraColors } from "@/constants/gatimitra";

const PAGE_BG = GatiMitraColors.softBackground;
const GREEN = GatiMitraColors.primaryMint;
const GREEN_DARK = GatiMitraColors.deepMintStart;
const PANEL_BG = "#F7F8FA";

export type HomeFeaturedOfferCardProps = {
  title: string;
  sub: string;
  storeName?: string | null;
  couponCode?: string | null;
  minOrderAmount?: number | null;
  maxDiscountAmount?: number | null;
  offerType?: string | null;
  kind?: "merchant" | "platform";
  width: number;
  height?: number;
};

function parseHeadline(title: string, offerType?: string | null): { prefix: string; highlight: string } {
  const raw = (title ?? "").trim();
  const type = String(offerType ?? "").toUpperCase();
  if (!raw) return { prefix: "", highlight: "SPECIAL OFFER" };

  if (type.includes("FLAT") || type === "CART_FLAT" || /₹\s*\d/.test(raw)) {
    const amount = raw.replace(/\s*OFF\s*$/i, "").trim();
    return { prefix: "FLAT", highlight: amount.toUpperCase().includes("OFF") ? amount : `${amount} OFF` };
  }
  if (/%\s*OFF/i.test(raw) || type.includes("PERCENT")) {
    return { prefix: "", highlight: raw };
  }
  if (type === "FREE_DELIVERY" || /free delivery/i.test(raw)) {
    return { prefix: "", highlight: "FREE DELIVERY" };
  }
  if (type === "TIERED" || /spend more/i.test(raw)) {
    return { prefix: "", highlight: raw.toUpperCase() };
  }
  return { prefix: "", highlight: raw };
}

function buildConditionLine(
  sub: string,
  minOrderAmount?: number | null,
  maxDiscountAmount?: number | null
): string {
  const trimmed = sub?.trim();
  if (trimmed) return trimmed;
  const parts: string[] = [];
  if (minOrderAmount != null && minOrderAmount > 0) {
    parts.push(`on orders above ₹${Math.round(minOrderAmount)}`);
  }
  if (maxDiscountAmount != null && maxDiscountAmount > 0) {
    parts.push(`save up to ₹${Math.round(maxDiscountAmount)}`);
  }
  return parts.join(" · ");
}

function TicketPerforation() {
  return (
    <View style={styles.perforationCol} pointerEvents="none">
      <View style={[styles.notch, styles.notchTop]} />
      <View style={styles.dashTrack}>
        {Array.from({ length: 6 }, (_, i) => (
          <View key={i} style={styles.dashDot} />
        ))}
      </View>
      <View style={[styles.notch, styles.notchBottom]} />
    </View>
  );
}

function FeatureItem({ icon, label }: { icon: keyof typeof Ionicons.glyphMap; label: string }) {
  return (
    <View style={styles.featureItem}>
      <Ionicons name={icon} size={11} color={GREEN_DARK} />
      <Text style={styles.featureText} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

export function HomeFeaturedOfferCard({
  title,
  sub,
  storeName,
  couponCode,
  minOrderAmount,
  maxDiscountAmount,
  offerType,
  width,
  height = 148,
}: HomeFeaturedOfferCardProps) {
  const { prefix, highlight } = parseHeadline(title, offerType);
  const conditionLine = buildConditionLine(sub, minOrderAmount, maxDiscountAmount);
  const code = couponCode?.trim().toUpperCase() || null;
  const showCodeRow = !!code;
  const stubWidth = Math.min(Math.max(Math.round(width * 0.3), 88), 108);

  return (
    <View style={[styles.outer, { width, height }]}>
      <View style={styles.cardRow}>
        <View style={styles.leftPanel}>
          <View style={styles.decoCircleA} pointerEvents="none" />
          <View style={styles.decoCircleB} pointerEvents="none" />
          <Ionicons
            name="sparkles"
            size={12}
            color="rgba(34,197,94,0.25)"
            style={styles.decoSparkA}
          />
          <Ionicons
            name="sparkles"
            size={10}
            color="rgba(34,197,94,0.2)"
            style={styles.decoSparkB}
          />

          <View style={styles.limitedBadge}>
            <Ionicons name="sparkles" size={10} color={GREEN_DARK} />
            <Text style={styles.limitedBadgeText}>LIMITED TIME OFFER</Text>
          </View>

          <View style={styles.headlineRow}>
            {prefix ? <Text style={styles.headlinePrefix}>{prefix} </Text> : null}
            <Text style={styles.headlineHighlight} numberOfLines={2}>
              {highlight}
            </Text>
          </View>

          {conditionLine ? (
            <Text style={styles.conditionText} numberOfLines={2}>
              {conditionLine}
            </Text>
          ) : null}

          {showCodeRow ? (
            <View style={styles.codeRow}>
              <View style={styles.codeRowLeft}>
                <Ionicons name="pricetag" size={13} color={GREEN} />
                <Text style={styles.useCodeLabel}>Use Code:</Text>
              </View>
              <View style={styles.codeChip}>
                <Text style={styles.codeChipText} numberOfLines={1}>
                  {code}
                </Text>
              </View>
            </View>
          ) : null}

          <View style={styles.featureRow}>
            <FeatureItem icon="shield-checkmark-outline" label="Safe Payments" />
            <View style={styles.featureDivider} />
            <FeatureItem icon="flash-outline" label="Fast Delivery" />
            <View style={styles.featureDivider} />
            <FeatureItem icon="ribbon-outline" label="Best Quality" />
          </View>
        </View>

        <TicketPerforation />

        <LinearGradient
          colors={[GREEN, GREEN_DARK]}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={[styles.rightPanel, { width: stubWidth }]}
        >
          <Ionicons name="sparkles" size={10} color="rgba(255,255,255,0.35)" style={styles.stubSparkA} />
          <Ionicons name="sparkles" size={8} color="rgba(255,255,255,0.28)" style={styles.stubSparkB} />

          <View style={styles.brandRow}>
            <Ionicons name="navigate-circle" size={18} color="#fff" />
            <Text style={styles.brandText}>GatiMitra</Text>
          </View>

          <View style={styles.applyBtn}>
            <Text style={styles.applyBtnText}>TAP TO{"\n"}APPLY</Text>
          </View>

          <Text style={styles.urgencyText} numberOfLines={3}>
            Hurry up! Offer valid for a{" "}
            <Text style={styles.urgencyBold}>limited time</Text> only.
            {storeName?.trim() ? `\n${storeName.trim()}` : ""}
          </Text>
        </LinearGradient>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  outer: {
    borderRadius: 12,
    backgroundColor: "#fff",
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  cardRow: {
    flex: 1,
    flexDirection: "row",
  },
  leftPanel: {
    flex: 1,
    backgroundColor: PANEL_BG,
    paddingHorizontal: 10,
    paddingTop: 6,
    paddingBottom: 6,
    borderTopLeftRadius: 12,
    borderBottomLeftRadius: 12,
    overflow: "hidden",
  },
  decoCircleA: {
    position: "absolute",
    right: -18,
    top: 28,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "rgba(34,197,94,0.08)",
  },
  decoCircleB: {
    position: "absolute",
    right: 24,
    bottom: 36,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "rgba(34,197,94,0.06)",
  },
  decoSparkA: { position: "absolute", right: 42, top: 18 },
  decoSparkB: { position: "absolute", right: 14, bottom: 52 },
  limitedBadge: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 4,
    backgroundColor: GatiMitraColors.mintSoft,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 999,
    marginBottom: 3,
  },
  limitedBadgeText: {
    fontSize: 8,
    fontWeight: "800",
    color: GREEN_DARK,
    letterSpacing: 0.3,
  },
  headlineRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "flex-end",
    marginBottom: 1,
  },
  headlinePrefix: {
    fontSize: 17,
    fontWeight: "800",
    color: "#374151",
    letterSpacing: -0.4,
    lineHeight: 20,
  },
  headlineHighlight: {
    fontSize: 17,
    fontWeight: "900",
    color: GREEN,
    letterSpacing: -0.4,
    lineHeight: 20,
    flexShrink: 1,
  },
  conditionText: {
    fontSize: 10,
    fontWeight: "500",
    color: "#6B7280",
    lineHeight: 13,
    marginBottom: 2,
  },
  codeRow: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#D1D5DB",
    borderStyle: "dashed",
    borderRadius: 8,
    paddingHorizontal: 7,
    paddingVertical: 4,
    gap: 6,
    marginBottom: 3,
  },
  codeRowLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    flexShrink: 0,
  },
  useCodeLabel: {
    fontSize: 10,
    fontWeight: "600",
    color: "#374151",
  },
  codeChip: {
    flex: 1,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#D1D5DB",
    borderStyle: "dashed",
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 5,
    alignItems: "center",
    justifyContent: "center",
  },
  codeChipText: {
    fontSize: 11,
    fontWeight: "900",
    color: GREEN,
    letterSpacing: 0.6,
  },
  featureRow: {
    flexDirection: "row",
    alignItems: "center",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#E5E7EB",
    paddingTop: 3,
    marginTop: "auto",
  },
  featureItem: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
    minWidth: 0,
  },
  featureText: {
    fontSize: 7,
    fontWeight: "600",
    color: GREEN_DARK,
    flexShrink: 1,
  },
  featureDivider: {
    width: 1,
    height: 14,
    backgroundColor: "#D1D5DB",
  },
  perforationCol: {
    width: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: PANEL_BG,
    zIndex: 2,
  },
  notch: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: PAGE_BG,
    position: "absolute",
    left: -1,
  },
  notchTop: { top: -7 },
  notchBottom: { bottom: -7 },
  dashTrack: {
    flex: 1,
    alignItems: "center",
    justifyContent: "space-evenly",
    paddingVertical: 6,
  },
  dashDot: {
    width: 2,
    height: 5,
    borderRadius: 1,
    backgroundColor: "#9CA3AF",
  },
  rightPanel: {
    paddingHorizontal: 6,
    paddingVertical: 6,
    alignItems: "center",
    justifyContent: "space-between",
    borderTopRightRadius: 12,
    borderBottomRightRadius: 12,
  },
  stubSparkA: { position: "absolute", top: 16, right: 12 },
  stubSparkB: { position: "absolute", bottom: 42, left: 10 },
  brandRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  brandText: {
    fontSize: 13,
    fontWeight: "800",
    color: "#fff",
    letterSpacing: 0.2,
  },
  applyBtn: {
    backgroundColor: "#fff",
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.85)",
    borderStyle: "dashed",
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 7,
    alignItems: "center",
    justifyContent: "center",
    minWidth: "92%",
  },
  applyBtnText: {
    fontSize: 9,
    fontWeight: "900",
    color: GREEN,
    textAlign: "center",
    lineHeight: 12,
    letterSpacing: 0.2,
  },
  urgencyText: {
    fontSize: 7,
    fontWeight: "500",
    color: "rgba(255,255,255,0.92)",
    textAlign: "center",
    lineHeight: 10,
  },
  urgencyBold: {
    fontWeight: "800",
    color: "#fff",
  },
});
