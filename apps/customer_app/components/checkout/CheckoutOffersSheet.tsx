/**
 * Compact checkout offers bottom sheet — floating close, apply/remove, all applicable offers.
 */

import { useMemo, useRef } from "react";
import {
  View,
  ScrollView,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  useWindowDimensions,
} from "react-native";
import { CheckoutText } from "@/components/checkout/CheckoutText";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import type { CheckoutOffersResponse } from "@/services/billing.service";
import {
  isOfferGatiCashUnlockable,
  isMerchantOfferGatiCashUnlockable,
  isFairGatiCashUnlock,
  missedOfferKeyForCandidate,
  liveUnlockGapInr,
  formatAddMoreToUnlock,
  parseUnlockGapInr,
} from "@/lib/checkout-missed-offer-wallet";
import { formatCheckoutSavingsRupees } from "@/lib/checkoutAppliedSavings";
import { GatiMitraColors } from "@/constants/gatimitra";
import { StoreBottomSheetShell } from "@/components/store/StoreBottomSheetShell";
import { MerchantDarkPalette, useMerchantUiDark } from "@/features/merchant-detail/merchantUiTheme";

const CX = GatiMitraColors;

/** Fixed-amount titles like "Flat 100 off" → "Flat ₹100 Off". Leave % titles alone. */
function displayPlatformOfferTitle(name: string | null | undefined, fallback = "Offer"): string {
  const raw = String(name ?? "").trim();
  if (!raw) return fallback;
  if (/%/.test(raw) || /₹/.test(raw)) return raw.replace(/\s+/g, " ");
  const m = raw.match(/^flat\s+(\d+)\s*(?:rs\.?|inr)?\s*off?$/i);
  if (m) return `Flat ₹${m[1]} Off`;
  const m2 = raw.match(/^(\d+)\s*(?:rs\.?|inr)?\s*off$/i);
  if (m2) return `Flat ₹${m2[1]} Off`;
  return raw;
}

export type CheckoutOffersSheetProps = {
  visible: boolean;
  onClose: () => void;
  bottomInset: number;
  loading: boolean;
  error: boolean;
  data: CheckoutOffersResponse | undefined;
  /** Live cart ₹ (same base as getCheckoutOffers) — drives instant unlock gaps. */
  cartSubtotal?: number;
  merchantId?: string | null;
  /**
   * Boost / item-deal savings from the live cart (catalog − Get for).
   * Prefer this over listing `estimatedSavingsInr` which is a rough % of subtotal.
   */
  itemDealSavingsByOfferId?: Record<number, number>;
  couponInput: string;
  onCouponInputChange: (v: string) => void;
  couponError: string | null;
  appliedCouponCode: string | null;
  appliedPlatformOfferId: number | null;
  appliedMerchantOfferId: number | null;
  appliedDiscounts: Array<{
    label: string;
    amount: number;
    platformOfferId?: number | null;
    merchantOfferId?: number | null;
  }>;
  /** Active membership perks (e.g. GMitra Plus free delivery) — not removable as coupons. */
  subscriptionBenefits?: Array<{ label: string; amount: number }>;
  onApplyCouponCode: (code: string, description?: string) => void;
  onApplyPlatformOffer: (id: number, name: string | null) => void;
  onApplyMerchantOffer: (id: number, couponCode?: string | null) => void;
  onRemoveCoupon: () => void;
  onRemovePlatformOffer: () => void;
  onRemoveMerchantOffer: () => void;
  onRemoveAllOffers: () => void;
  /** Locked offer selected for GatiCash wallet unlock (same key as checkout missed-offer). */
  pendingMissedOfferKey?: string | null;
  unlockedMissedOffer?: {
    key: string;
    title: string;
    offerSavingsInr: number;
    walletAddInr: number;
  } | null;
  onUnlockWithGatiCash?: (source: "platform" | "merchant", offerId: number) => void;
  onRemoveMissedOfferWallet?: () => void;
};

function couponMinOrderGap(
  coupon: { minOrderAmount?: number | null } | null | undefined,
  cartSubtotal: number
): number {
  const min = coupon?.minOrderAmount;
  if (min == null || !(min > 0)) return 0;
  return Math.ceil(Math.max(0, min - cartSubtotal));
}

function OfferRow({
  title,
  subtitle,
  couponCode,
  applied,
  locked,
  lockReason,
  savings,
  statusLabel,
  onApply,
  onRemove,
  onUnlockWithGatiCash,
  gatiCashPending,
}: {
  title: string;
  subtitle: string;
  couponCode?: string | null;
  applied?: boolean;
  locked?: boolean;
  lockReason?: string;
  savings?: number | null;
  /** Right-side status when there is no APPLY / Remove (e.g. item Boost). */
  statusLabel?: string | null;
  onApply?: () => void;
  onRemove?: () => void;
  onUnlockWithGatiCash?: () => void;
  gatiCashPending?: boolean;
}) {
  const dark = useMerchantUiDark();
  return (
    <View
      style={[
        styles.offerRow,
        dark && styles.offerRowDark,
        locked && (dark ? styles.offerRowLockedDark : styles.offerRowLocked),
        applied && (dark ? styles.offerRowAppliedDark : styles.offerRowApplied),
      ]}
    >
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
          <CheckoutText style={styles.pctText}>%</CheckoutText>
        </View>
      )}
      <View style={styles.offerTextCol}>
        <CheckoutText style={[styles.offerTitle, dark && styles.offerTitleDark, locked && styles.offerTitleMuted]} numberOfLines={2}>
          {title}
        </CheckoutText>
        {couponCode?.trim() ? (
          <View style={[styles.couponCodeBox, dark && styles.couponCodeBoxDark, locked && styles.couponCodeBoxLocked]}>
            <CheckoutText style={[styles.couponCodeText, dark && styles.offerTitleDark, locked && styles.couponCodeTextLocked]}>
              {couponCode.trim().toUpperCase()}
            </CheckoutText>
          </View>
        ) : null}
        {locked && lockReason ? (
          <CheckoutText style={styles.offerLockReason} numberOfLines={2}>
            {lockReason}
          </CheckoutText>
        ) : subtitle ? (
          <CheckoutText style={[styles.offerSub, dark && styles.sheetSubDark]} numberOfLines={2}>
            {subtitle}
          </CheckoutText>
        ) : null}
        {applied && savings != null && savings > 0 ? (
          <CheckoutText style={styles.offerSaved}>You save ₹{Math.round(savings)}</CheckoutText>
        ) : null}
      </View>
      {applied ? (
        <View style={styles.appliedActions}>
          <CheckoutText style={styles.appliedLabel}>Applied</CheckoutText>
          {onRemove ? (
            <TouchableOpacity onPress={onRemove} hitSlop={8} activeOpacity={0.7}>
              <CheckoutText style={styles.removeBtn}>Remove</CheckoutText>
            </TouchableOpacity>
          ) : null}
        </View>
      ) : locked && onUnlockWithGatiCash ? (
        <TouchableOpacity
          style={[styles.gatiCashUnlockBtn, gatiCashPending && styles.gatiCashUnlockBtnPending]}
          onPress={onUnlockWithGatiCash}
          activeOpacity={0.85}
        >
          <CheckoutText
            style={[styles.gatiCashUnlockText, gatiCashPending && styles.gatiCashUnlockTextPending]}
          >
            {gatiCashPending ? "ADDED" : "GATCASH"}
          </CheckoutText>
        </TouchableOpacity>
      ) : !locked && onApply ? (
        <TouchableOpacity style={styles.applyBtn} onPress={onApply} activeOpacity={0.85}>
          <CheckoutText style={styles.applyBtnText}>APPLY</CheckoutText>
        </TouchableOpacity>
      ) : statusLabel ? (
        <CheckoutText style={styles.offerStatusLabel} numberOfLines={2}>
          {statusLabel}
        </CheckoutText>
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
  cartSubtotal = 0,
  merchantId,
  itemDealSavingsByOfferId = {},
  couponInput,
  onCouponInputChange,
  couponError,
  appliedCouponCode,
  appliedPlatformOfferId,
  appliedMerchantOfferId,
  appliedDiscounts,
  subscriptionBenefits = [],
  onApplyCouponCode,
  onApplyPlatformOffer,
  onApplyMerchantOffer,
  onRemoveCoupon,
  onRemovePlatformOffer,
  onRemoveMerchantOffer,
  onRemoveAllOffers,
  pendingMissedOfferKey = null,
  unlockedMissedOffer = null,
  onUnlockWithGatiCash,
  onRemoveMissedOfferWallet,
}: CheckoutOffersSheetProps) {
  const dark = useMerchantUiDark();
  const savingsForPlatform = (id: number) => {
    const d = appliedDiscounts.find((x) => x.platformOfferId === id);
    return d?.amount ?? null;
  };

  const titleMatchesLabel = (title: string, label: string) => {
    const t = title.toLowerCase();
    const l = label.toLowerCase();
    return t === l || t.includes(l) || l.includes(t);
  };

  /**
   * The checkout exclusive-offer auto-pick (Precision/cart merchant offers can apply
   * without the user tapping "Apply" in this sheet) doesn't always round-trip
   * meta.merchantOfferId — fall back to matching the applied discount's label
   * against the offer title so "Applied" state stays correct either way.
   */
  const isMerchantOfferApplied = (id: number, title: string) => {
    if (appliedMerchantOfferId === id) return true;
    return appliedDiscounts.some(
      (x) => x.merchantOfferId == null && titleMatchesLabel(title, x.label)
    );
  };

  const savingsForMerchant = (id: number, title?: string) => {
    const byId = appliedDiscounts.find((x) => x.merchantOfferId === id);
    if (byId) return byId.amount;
    if (title) {
      const byLabel = appliedDiscounts.find(
        (x) => x.merchantOfferId == null && titleMatchesLabel(title, x.label)
      );
      if (byLabel) return byLabel.amount;
    }
    return null;
  };

  const savingsForLabel = (label: string) => {
    const d = appliedDiscounts.find(
      (x) =>
        x.label.toLowerCase() === label.toLowerCase() ||
        label.toLowerCase().includes(x.label.toLowerCase())
    );
    return d?.amount ?? null;
  };

  const typedCouponCode = couponInput.trim();
  const typedListedCoupon =
    typedCouponCode.length > 0
      ? (data?.coupons ?? []).find((c) => c.code.toUpperCase() === typedCouponCode.toUpperCase())
      : undefined;
  const typedCouponGap = couponMinOrderGap(typedListedCoupon, cartSubtotal);
  const typedCouponBlocked = typedCouponGap > 0;
  const typedCouponBlockReason = typedCouponBlocked
    ? `Add ₹${typedCouponGap} more to use this coupon (min order ₹${Math.round(typedListedCoupon!.minOrderAmount!)}).`
    : null;
  const codeApplyDisabled = !typedCouponCode || typedCouponBlocked;

  /**
   * appliedMerchantOfferId comes from the billing snapshot's meta.merchantOfferId,
   * which the checkout exclusive-offer auto-pick (Precision/cart offers can apply
   * without a sheet tap) doesn't always carry through. Fall back to matching the
   * applied discount's label against a known merchant offer's title so this sheet
   * still recognizes it as applied.
   */
  const resolvedAppliedMerchantOfferId = useMemo(() => {
    if (appliedMerchantOfferId != null) return appliedMerchantOfferId;
    if (appliedPlatformOfferId != null || appliedCouponCode) return null;
    const promo = appliedDiscounts.find(
      (d) => d.merchantOfferId == null && d.platformOfferId == null
    );
    if (!promo) return null;
    const candidates = [
      ...(data?.merchantOffers ?? []),
      ...(data?.merchantOffersIneligible ?? []),
    ];
    const match = candidates.find((o) => titleMatchesLabel(o.title, promo.label));
    return match?.id ?? null;
  }, [
    appliedMerchantOfferId,
    appliedPlatformOfferId,
    appliedCouponCode,
    appliedDiscounts,
    data?.merchantOffers,
    data?.merchantOffersIneligible,
  ]);

  const resolvedAppliedPlatformOfferId = useMemo(() => {
    if (appliedPlatformOfferId == null) return null;
    const savings = savingsForPlatform(appliedPlatformOfferId);
    return savings != null && savings > 0.005 ? appliedPlatformOfferId : null;
  }, [appliedPlatformOfferId, appliedDiscounts]);

  const fetchedCart = data?.fetchedCartSubtotal ?? cartSubtotal;

  /** Remember platform min-cart thresholds across eligible↔ineligible flips. */
  const knownPlatformMinRef = useRef(new Map<number, number>());
  for (const o of data?.platformOffersIneligible ?? []) {
    let min = o.minCartAmount ?? null;
    if (!(min != null && min > 0)) {
      const staleGap = parseUnlockGapInr(o.reason, undefined, undefined);
      if (
        staleGap > 0 &&
        staleGap < Number.MAX_SAFE_INTEGER &&
        fetchedCart != null &&
        Number.isFinite(fetchedCart)
      ) {
        min = staleGap + fetchedCart;
      }
    }
    if (min != null && min > 0) knownPlatformMinRef.current.set(o.id, min);
  }

  /** Instant unlock gaps as cart changes — before listing refetch lands. */
  const livePlatformLocked = useMemo(() => {
    const rows = (data?.platformOffersIneligible ?? []).filter((o) => {
      const reason = String(o.reason ?? "").toLowerCase();
      // Never show geo / location-hidden platform offers in Unlock More.
      if (reason.includes("not available at your delivery location")) return false;
      if (reason.includes("not available for your account")) return false;
      return true;
    });
    const lockedFromIneligible = rows
      .map((o) => {
        const wasMinCart =
          (o.minCartAmount != null && o.minCartAmount > 0) || isOfferGatiCashUnlockable(o.reason);
        const gap = liveUnlockGapInr({
          reason: o.reason,
          minCartAmount: o.minCartAmount ?? knownPlatformMinRef.current.get(o.id) ?? null,
          cartSubtotal,
          fetchedCartSubtotal: fetchedCart,
        });
        const liveGap = wasMinCart ? gap : Number.MAX_SAFE_INTEGER;
        return {
          ...o,
          liveGap,
          liveLockReason:
            wasMinCart && gap > 0 && gap < Number.MAX_SAFE_INTEGER
              ? formatAddMoreToUnlock(gap) || o.reason
              : o.reason,
        };
      })
      .filter((o) => o.liveGap > 0 && o.liveGap < Number.MAX_SAFE_INTEGER);

    const ineligibleIds = new Set(lockedFromIneligible.map((o) => o.id));
    const relocked = (data?.platformOffers ?? [])
      .filter((o) => !ineligibleIds.has(o.id) && appliedPlatformOfferId !== o.id)
      .map((o) => {
        const min = knownPlatformMinRef.current.get(o.id);
        if (min == null || !(min > 0)) return null;
        const gap = Math.ceil(Math.max(0, min - cartSubtotal));
        if (gap <= 0) return null;
        return {
          id: o.id,
          name: o.name,
          // Carried through so this arm of the union matches `lockedFromIneligible`
          // (which spreads the source row). Without it the merged list had no
          // `couponCode` on one branch, and the locked OfferRow below silently
          // lost the coupon code for any offer that came back via this path.
          couponCode: o.couponCode,
          offerKind: o.offerKind,
          summary: o.summary,
          reason: formatAddMoreToUnlock(gap),
          estimatedSavingsInr: o.estimatedSavingsInr,
          minCartAmount: min,
          liveGap: gap,
          liveLockReason: formatAddMoreToUnlock(gap),
        };
      })
      .filter((o): o is NonNullable<typeof o> => o != null);

    return [...lockedFromIneligible, ...relocked];
  }, [data?.platformOffersIneligible, data?.platformOffers, cartSubtotal, fetchedCart, appliedPlatformOfferId]);

  const livePlatformReadyFromLocked = useMemo(() => {
    const rows = data?.platformOffersIneligible ?? [];
    const alreadyEligibleIds = new Set((data?.platformOffers ?? []).map((o) => o.id));
    return rows
      .map((o) => {
        const wasMinCart =
          (o.minCartAmount != null && o.minCartAmount > 0) || isOfferGatiCashUnlockable(o.reason);
        const gap = liveUnlockGapInr({
          reason: o.reason,
          minCartAmount: o.minCartAmount,
          cartSubtotal,
          fetchedCartSubtotal: fetchedCart,
        });
        return { ...o, liveGap: gap, wasMinCart };
      })
      .filter((o) => o.wasMinCart && o.liveGap <= 0 && !alreadyEligibleIds.has(o.id));
  }, [data?.platformOffersIneligible, data?.platformOffers, cartSubtotal, fetchedCart]);

  const liveMerchantLocked = useMemo(() => {
    const rows = data?.merchantOffersIneligible ?? [];
    return rows
      .map((o) => {
        const wasMinCart =
          isOfferGatiCashUnlockable(o.reason, o.lockReason) || o.minOrderAmount != null;
        const gap = liveUnlockGapInr({
          reason: o.reason,
          lockReason: o.lockReason,
          minOrderAmount: o.minOrderAmount,
          cartSubtotal,
          fetchedCartSubtotal: fetchedCart,
        });
        return {
          ...o,
          liveGap: wasMinCart ? gap : Number.MAX_SAFE_INTEGER,
          liveLockReason:
            wasMinCart && gap > 0 && gap < Number.MAX_SAFE_INTEGER
              ? formatAddMoreToUnlock(gap) || o.lockReason || o.reason
              : o.lockReason || o.reason,
        };
      })
      .filter((o) => {
        if (isOfferGatiCashUnlockable(o.reason, o.lockReason) || o.minOrderAmount != null) {
          return o.liveGap > 0;
        }
        return true;
      });
  }, [data?.merchantOffersIneligible, cartSubtotal, fetchedCart]);

  const liveMerchantReadyFromLocked = useMemo(() => {
    const rows = data?.merchantOffersIneligible ?? [];
    const already = new Set((data?.merchantOffers ?? []).map((o) => o.id));
    return rows
      .filter((o) => !already.has(o.id))
      .map((o) => {
        const gap = liveUnlockGapInr({
          reason: o.reason,
          lockReason: o.lockReason,
          minOrderAmount: o.minOrderAmount,
          cartSubtotal,
          fetchedCartSubtotal: fetchedCart,
        });
        return { ...o, liveGap: gap };
      })
      .filter((o) => {
        const wasMinCart =
          isOfferGatiCashUnlockable(o.reason, o.lockReason) || o.minOrderAmount != null;
        return wasMinCart && o.liveGap <= 0;
      });
  }, [data?.merchantOffersIneligible, data?.merchantOffers, cartSubtotal, fetchedCart]);

  /** Hide available platform rows that we live-relocked into UNLOCK MORE. */
  const livePlatformAvailableIdsHidden = useMemo(
    () => new Set(livePlatformLocked.map((o) => o.id)),
    [livePlatformLocked]
  );

  const hasAppliedPromo =
    Boolean(resolvedAppliedPlatformOfferId || resolvedAppliedMerchantOfferId) ||
    appliedDiscounts.some((d) => d.amount > 0.005) ||
    (Boolean(appliedCouponCode) &&
      appliedDiscounts.some((d) => d.amount > 0.005));

  const subscriptionSavings = subscriptionBenefits.reduce((s, d) => s + d.amount, 0);
  const promoSavings = appliedDiscounts.reduce((s, d) => s + d.amount, 0);
  const totalSavings = subscriptionSavings + promoSavings;
  const { height: windowHeight } = useWindowDimensions();
  // Explicit maxHeight — flex:1 inside a wrap-sized sheet collapses the list to 0 height.
  const listMaxHeight = Math.max(220, Math.round(windowHeight * 0.55));

  return (
    <StoreBottomSheetShell
      visible={visible}
      onClose={onClose}
      maxHeightRatio={0.9}
      flushBottom
      keyboardAvoiding
    >
      <View style={styles.handle} />

      <LinearGradient
        colors={dark ? ["#134E4A", "#1A2A2E", MerchantDarkPalette.surface] : ["#DBEAFE", "#EFF6FF", "#FFFFFF"]}
        style={styles.sheetHero}
      >
        <View style={styles.heroTopRow}>
          <View style={styles.heroIconBadge}>
            <CheckoutText style={styles.heroIconPct}>%</CheckoutText>
          </View>
          <View style={styles.heroTextCol}>
            <CheckoutText style={[styles.sheetTitle, dark && styles.sheetTitleDark]}>Coupons & offers</CheckoutText>
            <CheckoutText style={[styles.sheetSub, dark && styles.sheetSubDark]}>Save more on this order</CheckoutText>
          </View>
          {totalSavings > 0 ? (
            <View style={styles.heroSavingsPill}>
              <CheckoutText style={styles.heroSavingsText}>−₹{Math.round(totalSavings)}</CheckoutText>
            </View>
          ) : null}
        </View>

        <View style={styles.codeRow}>
          <TextInput
            style={[styles.codeInput, dark && styles.codeInputDark]}
            placeholder="Enter coupon code"
            placeholderTextColor={dark ? MerchantDarkPalette.textDim : "#9CA3AF"}
            value={couponInput}
            onChangeText={onCouponInputChange}
            autoCapitalize="characters"
          />
          <TouchableOpacity
            style={[styles.codeApplyBtn, codeApplyDisabled && styles.codeApplyBtnDisabled]}
            disabled={codeApplyDisabled}
            onPress={() => {
              if (codeApplyDisabled) return;
              onApplyCouponCode(typedCouponCode);
            }}
            activeOpacity={0.9}
          >
            <CheckoutText
              style={[styles.codeApplyText, codeApplyDisabled && styles.codeApplyTextDisabled]}
            >
              Apply
            </CheckoutText>
          </TouchableOpacity>
        </View>
        {couponError ? (
          <CheckoutText style={styles.codeError}>{couponError}</CheckoutText>
        ) : typedCouponBlockReason ? (
          <CheckoutText style={styles.codeHint}>{typedCouponBlockReason}</CheckoutText>
        ) : null}
      </LinearGradient>

      <ScrollView
        style={[styles.list, { maxHeight: listMaxHeight }]}
        contentContainerStyle={[styles.listContent, { paddingBottom: Math.max(bottomInset, 16) + 8 }]}
        showsVerticalScrollIndicator={false}
        nestedScrollEnabled
        keyboardShouldPersistTaps="handled"
        bounces
      >
              {loading && !data ? (
                <View style={styles.loadingWrap}>
                  <CheckoutText style={styles.loadingText}>No offers to show yet</CheckoutText>
                </View>
              ) : error && !data ? (
                <CheckoutText style={styles.errText}>Could not load offers. Try again.</CheckoutText>
              ) : (
                <>
                  {subscriptionBenefits.length > 0 ? (
                    <View style={styles.section}>
                      <CheckoutText style={styles.sectionLabel}>MEMBER BENEFITS</CheckoutText>
                      <CheckoutText style={styles.sectionHint}>Included with your plan · stacks with coupons</CheckoutText>
                      {subscriptionBenefits.map((d, i) => (
                        <OfferRow
                          key={`sub-benefit-${i}`}
                          title={d.label}
                          subtitle="Membership benefit"
                          applied
                          savings={d.amount}
                        />
                      ))}
                    </View>
                  ) : null}

                  {hasAppliedPromo ? (
                    <View style={styles.section}>
                      <CheckoutText style={styles.sectionLabel}>APPLIED ON THIS ORDER</CheckoutText>
                      {appliedCouponCode &&
                      resolvedAppliedPlatformOfferId == null &&
                      appliedDiscounts.some((d) => d.amount > 0.005) ? (
                        <OfferRow
                          title={`'${appliedCouponCode}'`}
                          subtitle="Coupon code"
                          applied
                          savings={savingsForLabel(appliedCouponCode)}
                          onRemove={onRemoveCoupon}
                        />
                      ) : null}
                      {resolvedAppliedPlatformOfferId != null ? (
                        <OfferRow
                          title={
                            displayPlatformOfferTitle(
                              data?.platformOffers.find((o) => o.id === resolvedAppliedPlatformOfferId)?.name ??
                                appliedDiscounts.find((d) => d.platformOfferId === resolvedAppliedPlatformOfferId)
                                  ?.label
                            )
                          }
                          subtitle={
                            data?.platformOffers.find((o) => o.id === resolvedAppliedPlatformOfferId)?.summary ?? ""
                          }
                          couponCode={
                            data?.platformOffers.find((o) => o.id === resolvedAppliedPlatformOfferId)?.couponCode ??
                            data?.platformOffersIneligible?.find((o) => o.id === resolvedAppliedPlatformOfferId)
                              ?.couponCode
                          }
                          applied
                          savings={savingsForPlatform(resolvedAppliedPlatformOfferId)}
                          onRemove={onRemovePlatformOffer}
                        />
                      ) : null}
                      {resolvedAppliedMerchantOfferId != null ? (
                        <OfferRow
                          title={
                            data?.merchantOffers.find((o) => o.id === resolvedAppliedMerchantOfferId)
                              ?.title ??
                            data?.merchantOffersIneligible?.find(
                              (o) => o.id === resolvedAppliedMerchantOfferId
                            )?.title ??
                            appliedDiscounts.find((d) => d.merchantOfferId === resolvedAppliedMerchantOfferId)
                              ?.label ??
                            "Offer"
                          }
                          subtitle={
                            data?.merchantOffers.find((o) => o.id === resolvedAppliedMerchantOfferId)
                              ?.summary ??
                            data?.merchantOffersIneligible?.find(
                              (o) => o.id === resolvedAppliedMerchantOfferId
                            )?.summary ??
                            ""
                          }
                          applied
                          savings={savingsForMerchant(resolvedAppliedMerchantOfferId)}
                          onRemove={onRemoveMerchantOffer}
                        />
                      ) : null}
                      <TouchableOpacity onPress={onRemoveAllOffers} style={styles.clearAllBtn}>
                        <CheckoutText style={styles.clearAllText}>Remove all offers</CheckoutText>
                      </TouchableOpacity>
                    </View>
                  ) : null}

                  {(data?.platformOffers.length ?? 0) > 0 || livePlatformReadyFromLocked.length > 0 ? (
                    <View style={styles.section}>
                      <CheckoutText style={styles.sectionLabel}>AVAILABLE OFFERS</CheckoutText>
                      {data!.platformOffers
                        .filter((o) => !livePlatformAvailableIdsHidden.has(o.id))
                        .map((o) => {
                        const isApplied = appliedPlatformOfferId === o.id;
                        return (
                          <OfferRow
                            key={`pf-${o.id}`}
                            title={displayPlatformOfferTitle(o.name, o.offerKind)}
                            subtitle={o.summary}
                            couponCode={o.couponCode}
                            applied={isApplied}
                            savings={isApplied ? savingsForPlatform(o.id) : null}
                            onApply={isApplied ? undefined : () => onApplyPlatformOffer(o.id, o.name)}
                            onRemove={isApplied ? onRemovePlatformOffer : undefined}
                          />
                        );
                      })}
                      {livePlatformReadyFromLocked.map((o) => {
                        const isApplied = appliedPlatformOfferId === o.id;
                        return (
                          <OfferRow
                            key={`pf-ready-${o.id}`}
                            title={displayPlatformOfferTitle(o.name, o.offerKind)}
                            subtitle={o.summary}
                            couponCode={o.couponCode}
                            applied={isApplied}
                            savings={isApplied ? savingsForPlatform(o.id) : null}
                            onApply={isApplied ? undefined : () => onApplyPlatformOffer(o.id, o.name)}
                            onRemove={isApplied ? onRemovePlatformOffer : undefined}
                          />
                        );
                      })}
                    </View>
                  ) : null}

                  {livePlatformLocked.length > 0 ? (
                    <View style={styles.section}>
                      <CheckoutText style={styles.sectionLabel}>UNLOCK MORE</CheckoutText>
                      <CheckoutText style={styles.sectionHint}>
                        Add more to cart or tap GATICASH
                      </CheckoutText>
                      {livePlatformLocked.map((o) => {
                        const unlockable =
                          isOfferGatiCashUnlockable(o.reason) &&
                          isFairGatiCashUnlock(o.liveGap, o.estimatedSavingsInr ?? 0);
                        const offerKey =
                          merchantId != null
                            ? missedOfferKeyForCandidate({ source: "platform", id: o.id }, merchantId)
                            : null;
                        const isWalletUnlocked =
                          unlockedMissedOffer != null &&
                          offerKey != null &&
                          unlockedMissedOffer.key === offerKey;
                        if (isWalletUnlocked) {
                          return (
                            <OfferRow
                              key={`pf-lock-${o.id}`}
                              title={`${displayPlatformOfferTitle(o.name, o.offerKind)} unlocked`}
                              subtitle={`Saving ₹${formatCheckoutSavingsRupees(unlockedMissedOffer.offerSavingsInr)} on this order · ₹${formatCheckoutSavingsRupees(unlockedMissedOffer.walletAddInr)} credited after order`}
                              applied
                              onRemove={onRemoveMissedOfferWallet}
                            />
                          );
                        }
                        return (
                          <OfferRow
                            key={`pf-lock-${o.id}`}
                            title={displayPlatformOfferTitle(o.name, o.offerKind)}
                            subtitle={o.summary}
                            couponCode={o.couponCode}
                            locked
                            lockReason={o.liveLockReason || o.reason}
                            gatiCashPending={
                              offerKey != null && pendingMissedOfferKey === offerKey
                            }
                            onUnlockWithGatiCash={
                              unlockable && onUnlockWithGatiCash
                                ? () => onUnlockWithGatiCash("platform", o.id)
                                : undefined
                            }
                          />
                        );
                      })}
                    </View>
                  ) : null}

                  {(data?.merchantOffers.filter((o) => o.displaySurface !== "item").length ?? 0) > 0 ||
                  liveMerchantReadyFromLocked.length > 0 ? (
                    <View style={styles.section}>
                      <CheckoutText style={styles.sectionLabel}>SPECIAL OFFERS</CheckoutText>
                      {data!.merchantOffers
                        .filter((o) => o.displaySurface !== "item")
                        .map((o) => {
                          const isApplied = isMerchantOfferApplied(o.id, o.title);
                          const liveRelockGap =
                            o.minOrderAmount != null && o.minOrderAmount > 0
                              ? Math.ceil(Math.max(0, o.minOrderAmount - cartSubtotal))
                              : 0;
                          if (liveRelockGap > 0 && !isApplied) {
                            return (
                              <OfferRow
                                key={`mo-${o.id}`}
                                title={o.title}
                                subtitle={o.summary}
                                couponCode={o.requiresCouponCode}
                                locked
                                lockReason={formatAddMoreToUnlock(liveRelockGap)}
                                onUnlockWithGatiCash={
                                  isMerchantOfferGatiCashUnlockable({
                                    ...o,
                                    reason: formatAddMoreToUnlock(liveRelockGap),
                                    lockReason: formatAddMoreToUnlock(liveRelockGap),
                                  }) &&
                                  isFairGatiCashUnlock(
                                    liveRelockGap,
                                    o.estimatedSavingsInr ?? 0
                                  ) &&
                                  onUnlockWithGatiCash
                                    ? () => onUnlockWithGatiCash("merchant", o.id)
                                    : undefined
                                }
                              />
                            );
                          }
                          return (
                            <OfferRow
                              key={`mo-${o.id}`}
                              title={o.title}
                              subtitle={o.summary}
                              couponCode={o.requiresCouponCode}
                              applied={isApplied}
                              savings={isApplied ? savingsForMerchant(o.id, o.title) : null}
                              onApply={
                                !isApplied
                                  ? () => onApplyMerchantOffer(o.id, o.requiresCouponCode)
                                  : undefined
                              }
                              onRemove={isApplied ? onRemoveMerchantOffer : undefined}
                            />
                          );
                        })}
                      {liveMerchantReadyFromLocked.map((o) => {
                        const isApplied = isMerchantOfferApplied(o.id, o.title);
                        return (
                          <OfferRow
                            key={`mo-ready-${o.id}`}
                            title={o.title}
                            subtitle={o.summary}
                            couponCode={o.requiresCouponCode}
                            applied={isApplied}
                            savings={isApplied ? savingsForMerchant(o.id, o.title) : null}
                            onApply={
                              !isApplied
                                ? () => onApplyMerchantOffer(o.id, o.requiresCouponCode)
                                : undefined
                            }
                            onRemove={isApplied ? onRemoveMerchantOffer : undefined}
                          />
                        );
                      })}
                    </View>
                  ) : null}

                  {(data?.merchantOffers.filter((o) => o.displaySurface === "item").length ?? 0) > 0 ? (
                    <View style={styles.section}>
                      <CheckoutText style={styles.sectionLabel}>ITEM DEALS</CheckoutText>
                      <CheckoutText style={styles.sectionHint}>
                        Auto-applied on matching items — no coupon needed
                      </CheckoutText>
                      {data!.merchantOffers
                        .filter((o) => o.displaySurface === "item")
                        .map((o) => {
                          const fromCart = itemDealSavingsByOfferId[o.id];
                          const savings =
                            fromCart != null && fromCart > 0.005
                              ? fromCart
                              : null;
                          return (
                            <OfferRow
                              key={`mo-item-${o.id}`}
                              title={o.title}
                              subtitle={o.summary}
                              applied
                              savings={savings}
                            />
                          );
                        })}
                    </View>
                  ) : null}

                  {liveMerchantLocked.length > 0 ? (
                    <View style={styles.section}>
                      <CheckoutText style={styles.sectionLabel}>MORE OFFERS</CheckoutText>
                      <CheckoutText style={styles.sectionHint}>
                        Add eligible items or tap GATICASH
                      </CheckoutText>
                      {liveMerchantLocked.map((o) => {
                        const unlockable =
                          isMerchantOfferGatiCashUnlockable(o) &&
                          isFairGatiCashUnlock(o.liveGap, o.estimatedSavingsInr ?? 0);
                        const offerKey =
                          merchantId != null
                            ? missedOfferKeyForCandidate({ source: "merchant", id: o.id }, merchantId)
                            : null;
                        const isWalletUnlocked =
                          unlockedMissedOffer != null &&
                          offerKey != null &&
                          unlockedMissedOffer.key === offerKey;
                        if (isWalletUnlocked) {
                          return (
                            <OfferRow
                              key={`mo-lock-${o.id}`}
                              title={`${o.title} unlocked`}
                              subtitle={`Saving ₹${formatCheckoutSavingsRupees(unlockedMissedOffer.offerSavingsInr)} on this order · ₹${formatCheckoutSavingsRupees(unlockedMissedOffer.walletAddInr)} credited after order`}
                              applied
                              onRemove={onRemoveMissedOfferWallet}
                            />
                          );
                        }
                        return (
                          <OfferRow
                            key={`mo-lock-${o.id}`}
                            title={o.title}
                            subtitle={o.summary}
                            couponCode={o.requiresCouponCode}
                            locked
                            lockReason={o.liveLockReason || o.lockReason || o.reason}
                            gatiCashPending={
                              offerKey != null && pendingMissedOfferKey === offerKey
                            }
                            onUnlockWithGatiCash={
                              unlockable && onUnlockWithGatiCash
                                ? () => onUnlockWithGatiCash("merchant", o.id)
                                : undefined
                            }
                          />
                        );
                      })}
                    </View>
                  ) : null}

                  {(data?.coupons.length ?? 0) > 0 ? (
                    <View style={styles.section}>
                      <CheckoutText style={styles.sectionLabel}>COUPON CODES</CheckoutText>
                      {data!.coupons.map((c) => {
                        const isApplied = appliedCouponCode?.toUpperCase() === c.code.toUpperCase();
                        const gap = couponMinOrderGap(c, cartSubtotal);
                        const locked = !isApplied && gap > 0;
                        return (
                          <OfferRow
                            key={c.code}
                            title={c.code}
                            subtitle={c.description}
                            applied={isApplied}
                            locked={locked}
                            lockReason={
                              locked
                                ? `Add ₹${gap} more to use this coupon (min order ₹${Math.round(c.minOrderAmount!)}).`
                                : undefined
                            }
                            savings={isApplied ? savingsForLabel(c.code) : null}
                            onApply={
                              isApplied || locked
                                ? undefined
                                : () => onApplyCouponCode(c.code, c.description)
                            }
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
                  livePlatformLocked.length === 0 &&
                  livePlatformReadyFromLocked.length === 0 &&
                  liveMerchantLocked.length === 0 &&
                  liveMerchantReadyFromLocked.length === 0 ? (
                    <CheckoutText style={styles.empty}>No offers for this address right now.</CheckoutText>
                  ) : null}
                </>
              )}
      </ScrollView>
    </StoreBottomSheetShell>
  );
}

const styles = StyleSheet.create({
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
  codeApplyBtnDisabled: {
    backgroundColor: "#E2E8F0",
  },
  codeApplyText: { color: "#fff", fontWeight: "700", fontSize: 14 },
  codeApplyTextDisabled: { color: "#94A3B8" },
  codeError: { fontSize: 11, color: CX.errorRed, marginTop: 6 },
  codeHint: { fontSize: 11, color: CX.errorRed, marginTop: 6 },
  list: { width: "100%" },
  listContent: { paddingHorizontal: 14, paddingTop: 4 },
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
  offerRowLocked: {
    backgroundColor: "#F8FAFC",
    borderColor: "#E2E8F0",
  },
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
  offerLockReason: { fontSize: 11, fontWeight: "600", color: "#E23744", marginTop: 4, lineHeight: 15 },
  couponCodeBox: {
    alignSelf: "flex-start",
    marginTop: 4,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: "#94A3B8",
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    backgroundColor: "#F8FAFC",
  },
  couponCodeBoxLocked: {
    borderColor: "#CBD5E1",
    backgroundColor: "#F1F5F9",
  },
  couponCodeText: {
    fontSize: 11,
    fontWeight: "800",
    color: "#0F172A",
    letterSpacing: 0.8,
  },
  couponCodeTextLocked: {
    color: "#475569",
  },
  applyBtn: {
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 0,
    backgroundColor: "#059669",
    marginTop: 1,
    minHeight: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  applyBtnText: { fontSize: 10, fontWeight: "800", color: "#FFFFFF", letterSpacing: 0.4 },
  offerStatusLabel: {
    maxWidth: 72,
    fontSize: 11,
    fontWeight: "700",
    color: "#059669",
    textAlign: "right",
    marginTop: 2,
  },
  gatiCashUnlockBtn: {
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 0,
    backgroundColor: "#059669",
    marginTop: 1,
    minHeight: 32,
    alignItems: "center",
    justifyContent: "center",
    opacity: 1,
    zIndex: 2,
    elevation: 2,
  },
  gatiCashUnlockBtnPending: {
    backgroundColor: "#047857",
    borderWidth: 0,
    opacity: 1,
  },
  gatiCashUnlockText: {
    fontSize: 10,
    fontWeight: "800",
    color: "#FFFFFF",
    letterSpacing: 0.4,
    opacity: 1,
  },
  gatiCashUnlockTextPending: { color: "#FFFFFF", opacity: 1 },
  removeBtn: { fontSize: 12, fontWeight: "700", color: "#E23744", marginTop: 2 },
  appliedActions: {
    alignItems: "flex-end",
    justifyContent: "center",
    gap: 4,
    maxWidth: 88,
  },
  appliedLabel: {
    fontSize: 12,
    fontWeight: "800",
    color: "#137243",
    letterSpacing: 0.2,
  },
  clearAllBtn: { alignSelf: "center", paddingVertical: 6 },
  clearAllText: { fontSize: 12, fontWeight: "600", color: "#94A3B8" },
  empty: { textAlign: "center", color: "#6B7280", paddingVertical: 20, fontSize: 13 },
  offerRowDark: {
    backgroundColor: MerchantDarkPalette.elevated,
    borderColor: MerchantDarkPalette.border,
  },
  offerRowLockedDark: {
    backgroundColor: MerchantDarkPalette.search,
    borderColor: MerchantDarkPalette.border,
  },
  offerRowAppliedDark: {
    backgroundColor: "rgba(34, 197, 94, 0.12)",
    borderColor: MerchantDarkPalette.accent,
  },
  offerTitleDark: { color: MerchantDarkPalette.text },
  couponCodeBoxDark: {
    backgroundColor: MerchantDarkPalette.card,
    borderColor: MerchantDarkPalette.chipBorder,
  },
  sheetTitleDark: { color: MerchantDarkPalette.text },
  sheetSubDark: { color: MerchantDarkPalette.textMuted },
  codeInputDark: {
    backgroundColor: MerchantDarkPalette.search,
    borderColor: MerchantDarkPalette.border,
    color: MerchantDarkPalette.text,
  },
});
