/**
 * Swiggy-style missed-offer card — closest locked offer from Coupons sheet.
 */

import { View, Pressable, StyleSheet } from "react-native";
import { CheckoutText } from "@/components/checkout/CheckoutText";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { GatiMitraColors } from "@/constants/gatimitra";
import type { MissedOfferWalletCompensation } from "@/lib/checkout-missed-offer-wallet";

const BRAND = GatiMitraColors.splashMint;
const BADGE_BG = "#0F766E";
const CARD_BG = "#E0F2FE";
const CARD_BORDER = "#BAE6FD";
const TEXT_DARK = "#0F172A";
const TEXT_MUTED = "#475569";

type Props = {
  offer: MissedOfferWalletCompensation;
  pending: boolean;
  onPressAdd: () => void;
  onPressRemove: () => void;
};

function formatInr(value: number): string {
  return value % 1 === 0 ? String(Math.round(value)) : value.toFixed(2);
}

export function CheckoutMissedOfferWalletCard({
  offer,
  pending,
  onPressAdd,
  onPressRemove,
}: Props) {
  return (
    <View style={styles.wrap}>
      <View style={styles.badge}>
        <CheckoutText style={styles.badgeText} numberOfLines={1}>
          {pending ? `${offer.offerTitle} unlocked` : `${offer.offerTitle} · closest unlock`}
        </CheckoutText>
      </View>

      <Pressable style={styles.card} onPress={pending ? undefined : onPressAdd}>
        <View style={styles.body}>
          <View style={styles.copyCol}>
            <View style={styles.lineRow}>
              <MaterialCommunityIcons name="tag-outline" size={16} color={BRAND} />
              <CheckoutText style={styles.headline}>
                {pending
                  ? `Save ₹${formatInr(offer.offerSavingsInr)} on this order`
                  : offer.headline}
              </CheckoutText>
            </View>
            <View style={styles.lineRow}>
              <MaterialCommunityIcons name="wallet-outline" size={16} color={BRAND} />
              <CheckoutText style={styles.subline}>
                {pending
                  ? `₹${formatInr(offer.amountInr)} added to GatiCash after order`
                  : offer.subline}
              </CheckoutText>
            </View>
            {!pending && offer.addItemsHint ? (
              <CheckoutText style={styles.hint} numberOfLines={2}>
                {offer.addItemsHint}
              </CheckoutText>
            ) : null}
          </View>

          <View style={styles.actionCol}>
            {pending ? (
              <Pressable
                style={styles.removeBtn}
                onPress={(e) => {
                  e.stopPropagation?.();
                  onPressRemove();
                }}
                hitSlop={6}
              >
                <CheckoutText style={styles.removeBtnText}>REMOVE</CheckoutText>
              </Pressable>
            ) : (
              <Pressable style={styles.addBtn} onPress={onPressAdd} hitSlop={6}>
                <CheckoutText style={styles.addBtnText}>ADD</CheckoutText>
              </Pressable>
            )}
            <CheckoutText style={styles.amount}>₹{formatInr(offer.amountInr)}</CheckoutText>
          </View>
        </View>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: 12 },
  badge: {
    alignSelf: "flex-start",
    maxWidth: "100%",
    backgroundColor: BADGE_BG,
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  badgeText: {
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.2,
  },
  card: {
    backgroundColor: CARD_BG,
    borderWidth: 1,
    borderColor: CARD_BORDER,
    borderRadius: 12,
    borderTopLeftRadius: 0,
    overflow: "hidden",
  },
  body: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  copyCol: { flex: 1, minWidth: 0, gap: 6 },
  lineRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexWrap: "wrap",
  },
  headline: {
    flex: 1,
    minWidth: 0,
    fontSize: 13,
    fontWeight: "700",
    color: TEXT_DARK,
    lineHeight: 18,
  },
  subline: { fontSize: 12, color: TEXT_MUTED, lineHeight: 16 },
  hint: {
    fontSize: 12,
    fontWeight: "600",
    color: "#DC2626",
    lineHeight: 16,
    marginTop: 2,
  },
  actionCol: {
    alignItems: "flex-end",
    justifyContent: "center",
    gap: 8,
    flexShrink: 0,
  },
  addBtn: {
    backgroundColor: "#FFFFFF",
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
    minWidth: 72,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  addBtnText: {
    color: BRAND,
    fontSize: 13,
    fontWeight: "800",
    letterSpacing: 0.4,
  },
  removeBtn: {
    backgroundColor: "#FFFFFF",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    minWidth: 72,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#FECACA",
  },
  removeBtnText: {
    color: "#DC2626",
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.3,
  },
  amount: { fontSize: 14, fontWeight: "700", color: TEXT_DARK },
});
