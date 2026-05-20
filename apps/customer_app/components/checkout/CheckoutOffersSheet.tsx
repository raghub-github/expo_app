/**
 * Compact checkout offers bottom sheet — floating close, apply/remove, all applicable offers.
 */

import {
  View,
  Text,
  Modal,
  Pressable,
  ScrollView,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import type { CheckoutOffersResponse } from "@/services/billing.service";
import { GatiMitraColors } from "@/constants/gatimitra";

const CX = GatiMitraColors;

export type CheckoutOffersSheetProps = {
  visible: boolean;
  onClose: () => void;
  bottomInset: number;
  loading: boolean;
  error: boolean;
  data: CheckoutOffersResponse | undefined;
  couponInput: string;
  onCouponInputChange: (v: string) => void;
  couponError: string | null;
  appliedCouponCode: string | null;
  appliedPlatformOfferId: number | null;
  appliedDiscounts: Array<{ label: string; amount: number; platformOfferId?: number | null }>;
  onApplyCouponCode: (code: string, description?: string) => void;
  onApplyPlatformOffer: (id: number, name: string | null) => void;
  onRemoveCoupon: () => void;
  onRemovePlatformOffer: () => void;
  onRemoveAllOffers: () => void;
};

function OfferRow({
  title,
  subtitle,
  applied,
  locked,
  lockReason,
  savings,
  onApply,
  onRemove,
}: {
  title: string;
  subtitle: string;
  applied?: boolean;
  locked?: boolean;
  lockReason?: string;
  savings?: number | null;
  onApply?: () => void;
  onRemove?: () => void;
}) {
  return (
    <View style={[styles.offerRow, locked && styles.offerRowLocked, applied && styles.offerRowApplied]}>
      {applied ? (
        <View style={styles.tick}>
          <Ionicons name="checkmark" size={12} color="#fff" />
        </View>
      ) : locked ? (
        <View style={styles.lockIcon}>
          <Ionicons name="lock-closed" size={11} color="#9CA3AF" />
        </View>
      ) : (
        <View style={styles.pctCircle}>
          <Text style={styles.pctText}>%</Text>
        </View>
      )}
      <View style={styles.offerTextCol}>
        <Text style={[styles.offerTitle, locked && styles.offerTitleMuted]} numberOfLines={2}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={styles.offerSub} numberOfLines={2}>
            {subtitle}
          </Text>
        ) : null}
        {applied && savings != null && savings > 0 ? (
          <Text style={styles.offerSaved}>You save ₹{Math.round(savings)}</Text>
        ) : null}
        {locked && lockReason ? (
          <Text style={styles.offerLockReason} numberOfLines={2}>
            🔒 {lockReason}
          </Text>
        ) : null}
      </View>
      {applied && onRemove ? (
        <TouchableOpacity onPress={onRemove} hitSlop={8} activeOpacity={0.7}>
          <Text style={styles.removeBtn}>Remove</Text>
        </TouchableOpacity>
      ) : !locked && onApply ? (
        <TouchableOpacity style={styles.applyBtn} onPress={onApply} activeOpacity={0.85}>
          <Text style={styles.applyBtnText}>APPLY</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

export function CheckoutOffersSheet({
  visible,
  onClose,
  bottomInset,
  loading,
  error,
  data,
  couponInput,
  onCouponInputChange,
  couponError,
  appliedCouponCode,
  appliedPlatformOfferId,
  appliedDiscounts,
  onApplyCouponCode,
  onApplyPlatformOffer,
  onRemoveCoupon,
  onRemovePlatformOffer,
  onRemoveAllOffers,
}: CheckoutOffersSheetProps) {
  const savingsForPlatform = (id: number) => {
    const d = appliedDiscounts.find((x) => x.platformOfferId === id);
    return d?.amount ?? null;
  };

  const savingsForLabel = (label: string) => {
    const d = appliedDiscounts.find(
      (x) =>
        x.label.toLowerCase() === label.toLowerCase() ||
        label.toLowerCase().includes(x.label.toLowerCase())
    );
    return d?.amount ?? null;
  };

  const hasApplied =
    Boolean(appliedCouponCode || appliedPlatformOfferId) || appliedDiscounts.length > 0;

  const totalSavings = appliedDiscounts.reduce((s, d) => s + d.amount, 0);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={styles.overlay} onPress={onClose}>
        <View style={styles.sheetAnchor} pointerEvents="box-none">
          <TouchableOpacity
            style={styles.floatingClose}
            onPress={onClose}
            activeOpacity={0.9}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Close offers"
          >
            <View style={styles.floatingCloseInner}>
              <Ionicons name="close" size={22} color="#374151" />
            </View>
          </TouchableOpacity>

          <Pressable
            style={[styles.sheet, { paddingBottom: bottomInset + 12 }]}
            onPress={() => {}}
          >
            <View style={styles.handle} />

            <LinearGradient colors={["#DBEAFE", "#EFF6FF", "#FFFFFF"]} style={styles.sheetHero}>
              <View style={styles.heroTopRow}>
                <View style={styles.heroIconBadge}>
                  <Text style={styles.heroIconPct}>%</Text>
                </View>
                <View style={styles.heroTextCol}>
                  <Text style={styles.sheetTitle}>Coupons & offers</Text>
                  <Text style={styles.sheetSub}>Save more on this order</Text>
                </View>
                {totalSavings > 0 ? (
                  <View style={styles.heroSavingsPill}>
                    <Text style={styles.heroSavingsText}>−₹{Math.round(totalSavings)}</Text>
                  </View>
                ) : null}
              </View>

              <View style={styles.codeRow}>
                <TextInput
                  style={styles.codeInput}
                  placeholder="Enter coupon code"
                  placeholderTextColor="#9CA3AF"
                  value={couponInput}
                  onChangeText={onCouponInputChange}
                  autoCapitalize="characters"
                />
                <TouchableOpacity
                  style={styles.codeApplyBtn}
                  onPress={() => {
                    const trimmed = couponInput.trim();
                    if (trimmed) onApplyCouponCode(trimmed);
                  }}
                  activeOpacity={0.9}
                >
                  <Text style={styles.codeApplyText}>Apply</Text>
                </TouchableOpacity>
              </View>
              {couponError ? <Text style={styles.codeError}>{couponError}</Text> : null}
            </LinearGradient>

            <ScrollView
              style={styles.list}
              contentContainerStyle={styles.listContent}
              showsVerticalScrollIndicator={false}
            >
              {loading ? (
                <View style={styles.loadingWrap}>
                  <ActivityIndicator color={CX.emerald} size="small" />
                  <Text style={styles.loadingText}>Finding best offers…</Text>
                </View>
              ) : error ? (
                <Text style={styles.errText}>Could not load offers. Try again.</Text>
              ) : (
                <>
                  {hasApplied ? (
                    <View style={styles.section}>
                      <Text style={styles.sectionLabel}>APPLIED ON THIS ORDER</Text>
                      {appliedCouponCode ? (
                        <OfferRow
                          title={`'${appliedCouponCode}'`}
                          subtitle="Coupon code"
                          applied
                          savings={savingsForLabel(appliedCouponCode)}
                          onRemove={onRemoveCoupon}
                        />
                      ) : null}
                      {appliedPlatformOfferId != null ? (
                        <OfferRow
                          title={
                            data?.platformOffers.find((o) => o.id === appliedPlatformOfferId)?.name ??
                            appliedDiscounts.find((d) => d.platformOfferId === appliedPlatformOfferId)
                              ?.label ??
                            "Platform offer"
                          }
                          subtitle={
                            data?.platformOffers.find((o) => o.id === appliedPlatformOfferId)?.summary ?? ""
                          }
                          applied
                          savings={savingsForPlatform(appliedPlatformOfferId)}
                          onRemove={onRemovePlatformOffer}
                        />
                      ) : null}
                      {appliedDiscounts
                        .filter((d) => !d.platformOfferId && !appliedCouponCode && d.amount > 0)
                        .map((d, i) => (
                          <OfferRow
                            key={`applied-other-${i}`}
                            title={d.label}
                            subtitle="Applied on this order"
                            applied
                            savings={d.amount}
                            onRemove={onRemoveAllOffers}
                          />
                        ))}
                      <TouchableOpacity onPress={onRemoveAllOffers} style={styles.clearAllBtn}>
                        <Text style={styles.clearAllText}>Remove all offers</Text>
                      </TouchableOpacity>
                    </View>
                  ) : null}

                  {(data?.platformOffers.length ?? 0) > 0 ? (
                    <View style={styles.section}>
                      <Text style={styles.sectionLabel}>PLATFORM OFFERS</Text>
                      <Text style={styles.sectionHint}>One offer at a time · tap to switch</Text>
                      {data!.platformOffers.map((o) => {
                        const isApplied = appliedPlatformOfferId === o.id;
                        return (
                          <OfferRow
                            key={`pf-${o.id}`}
                            title={o.name ?? o.offerKind}
                            subtitle={o.summary}
                            applied={isApplied}
                            savings={isApplied ? savingsForPlatform(o.id) : null}
                            onApply={isApplied ? undefined : () => onApplyPlatformOffer(o.id, o.name)}
                            onRemove={isApplied ? onRemovePlatformOffer : undefined}
                          />
                        );
                      })}
                    </View>
                  ) : null}

                  {(data?.platformOffersIneligible?.length ?? 0) > 0 ? (
                    <View style={styles.section}>
                      <Text style={styles.sectionLabel}>UNLOCK MORE SAVINGS</Text>
                      {data!.platformOffersIneligible!.map((o) => (
                        <OfferRow
                          key={`pf-lock-${o.id}`}
                          title={o.name ?? o.offerKind}
                          subtitle={o.summary}
                          locked
                          lockReason={o.reason}
                        />
                      ))}
                    </View>
                  ) : null}

                  {(data?.merchantOffers.length ?? 0) > 0 ? (
                    <View style={styles.section}>
                      <Text style={styles.sectionLabel}>STORE OFFERS</Text>
                      <Text style={styles.sectionHint}>Auto-applied when eligible</Text>
                      {data!.merchantOffers.map((o) => {
                        const isApplied = appliedDiscounts.some(
                          (d) =>
                            !d.platformOfferId &&
                            (d.label.toLowerCase() === o.title.toLowerCase() ||
                              o.title.toLowerCase().includes(d.label.toLowerCase()))
                        );
                        return (
                          <OfferRow
                            key={`mo-${o.id}`}
                            title={o.title}
                            subtitle={o.summary}
                            applied={isApplied}
                            savings={isApplied ? savingsForLabel(o.title) : null}
                          />
                        );
                      })}
                    </View>
                  ) : null}

                  {(data?.coupons.length ?? 0) > 0 ? (
                    <View style={styles.section}>
                      <Text style={styles.sectionLabel}>COUPON CODES</Text>
                      {data!.coupons.map((c) => {
                        const isApplied = appliedCouponCode?.toUpperCase() === c.code.toUpperCase();
                        return (
                          <OfferRow
                            key={c.code}
                            title={c.code}
                            subtitle={c.description}
                            applied={isApplied}
                            savings={isApplied ? savingsForLabel(c.code) : null}
                            onApply={isApplied ? undefined : () => onApplyCouponCode(c.code, c.description)}
                            onRemove={isApplied ? onRemoveCoupon : undefined}
                          />
                        );
                      })}
                    </View>
                  ) : null}

                  {!loading &&
                  !error &&
                  (data?.coupons.length ?? 0) === 0 &&
                  (data?.merchantOffers.length ?? 0) === 0 &&
                  (data?.platformOffers.length ?? 0) === 0 &&
                  (data?.platformOffersIneligible?.length ?? 0) === 0 ? (
                    <Text style={styles.empty}>No offers for this address right now.</Text>
                  ) : null}
                </>
              )}
            </ScrollView>
          </Pressable>
        </View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.5)",
    justifyContent: "flex-end",
  },
  sheetAnchor: {
    position: "relative",
    maxHeight: "86%",
    width: "100%",
    alignSelf: "stretch",
    alignItems: "stretch",
  },
  floatingClose: {
    position: "absolute",
    top: -20,
    alignSelf: "center",
    zIndex: 20,
  },
  floatingCloseInner: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 8,
  },
  sheet: {
    width: "100%",
    backgroundColor: "#fff",
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    overflow: "hidden",
    borderTopWidth: 1,
    borderColor: "#E0E7FF",
  },
  handle: {
    alignSelf: "center",
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#CBD5E1",
    marginTop: 8,
    marginBottom: 2,
  },
  sheetHero: {
    paddingHorizontal: 14,
    paddingTop: 4,
    paddingBottom: 12,
  },
  heroTopRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 10,
  },
  heroIconBadge: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: "#2563EB",
    alignItems: "center",
    justifyContent: "center",
  },
  heroIconPct: { color: "#fff", fontSize: 16, fontWeight: "800" },
  heroTextCol: { flex: 1, minWidth: 0 },
  sheetTitle: { fontSize: 17, fontWeight: "800", color: "#0F172A" },
  sheetSub: { fontSize: 12, color: "#64748B", marginTop: 1 },
  heroSavingsPill: {
    backgroundColor: "#DCFCE7",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  heroSavingsText: { fontSize: 12, fontWeight: "800", color: "#15803D" },
  codeRow: { flexDirection: "row", gap: 8 },
  codeInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    fontSize: 14,
    color: "#111827",
    backgroundColor: "#fff",
  },
  codeApplyBtn: {
    backgroundColor: CX.emerald,
    paddingHorizontal: 16,
    borderRadius: 10,
    justifyContent: "center",
    minHeight: 42,
  },
  codeApplyText: { color: "#fff", fontWeight: "700", fontSize: 14 },
  codeError: { fontSize: 11, color: CX.errorRed, marginTop: 6 },
  list: { flexGrow: 0 },
  listContent: { paddingHorizontal: 14, paddingBottom: 8 },
  loadingWrap: { paddingVertical: 24, alignItems: "center", gap: 8 },
  loadingText: { fontSize: 13, color: "#6B7280" },
  errText: { fontSize: 13, color: CX.errorRed, paddingVertical: 16, textAlign: "center" },
  section: { marginTop: 10, marginBottom: 4 },
  sectionLabel: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.7,
    color: "#94A3B8",
    marginBottom: 6,
  },
  sectionHint: { fontSize: 11, color: "#94A3B8", marginBottom: 6, marginTop: -2 },
  offerRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingVertical: 10,
    paddingHorizontal: 10,
    marginBottom: 6,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#F1F5F9",
    backgroundColor: "#F8FAFC",
    gap: 8,
  },
  offerRowApplied: {
    borderColor: "#86EFAC",
    backgroundColor: "#F0FDF4",
  },
  offerRowLocked: { opacity: 0.7 },
  tick: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "#22C55E",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 1,
  },
  lockIcon: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "#F1F5F9",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 1,
  },
  pctCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: "#CBD5E1",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 1,
  },
  pctText: { fontSize: 10, fontWeight: "800", color: "#64748B" },
  offerTextCol: { flex: 1, minWidth: 0 },
  offerTitle: { fontSize: 13, fontWeight: "700", color: "#0F172A" },
  offerTitleMuted: { color: "#64748B" },
  offerSub: { fontSize: 11, color: "#64748B", marginTop: 2, lineHeight: 15 },
  offerSaved: { fontSize: 11, fontWeight: "700", color: "#16A34A", marginTop: 4 },
  offerLockReason: { fontSize: 10, color: "#B45309", marginTop: 4 },
  applyBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#E23744",
    backgroundColor: "#fff",
    marginTop: 1,
  },
  applyBtnText: { fontSize: 10, fontWeight: "800", color: "#E23744", letterSpacing: 0.4 },
  removeBtn: { fontSize: 12, fontWeight: "700", color: "#E23744", marginTop: 2 },
  clearAllBtn: { alignSelf: "center", paddingVertical: 6 },
  clearAllText: { fontSize: 12, fontWeight: "600", color: "#94A3B8" },
  empty: { textAlign: "center", color: "#6B7280", paddingVertical: 20, fontSize: 13 },
});
