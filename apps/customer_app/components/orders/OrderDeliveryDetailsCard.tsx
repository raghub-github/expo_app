/**
 * Live tracking — delivery contact, address, and instructions card (Zomato-style).
 */

import { useMemo } from "react";
import { View, TouchableOpacity, StyleSheet, Image } from "react-native";
import { CheckoutText } from "@/components/checkout/CheckoutText";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { BiPencilSquareIcon } from "@/components/icons/BiPencilSquareIcon";
import { GatiMitraColors } from "@/constants/gatimitra";
import { getConfig } from "@/config/env";
import type { OrderDeliveryDetailsView } from "@/lib/order-delivery-details";

const CARD = GatiMitraColors.cardSurface;
const BORDER = GatiMitraColors.border;
const TEXT = GatiMitraColors.textPrimaryNew;
const MUTED = GatiMitraColors.textSecondary;
const ACCENT = GatiMitraColors.emerald;
const BANNER_TEXT = "#B85C38";
const PEACH_BANNER = "#FFF5F0";
const EDIT_RED = "#E23744";
const ICON_CIRCLE = "#F3F4F6";
const FOOTER_GREEN = "#0B6E4F";
const VIEW_MAP_BORDER = "#A7F3D0";
const VIEW_MAP_LABEL = "#059669";
const OTP_MINT = GatiMitraColors.deepMintStart;

type EditDisabledFlags = {
  contact?: boolean;
  address?: boolean;
  instructions?: boolean;
};

type Props = OrderDeliveryDetailsView & {
  onEditContact?: () => void;
  onEditAddress?: () => void;
  onEditInstructions?: () => void;
  onGetDirections?: () => void;
  editDisabled?: EditDisabledFlags;
  /** Hide peach banner on post-delivery read-only view. */
  showPeachBanner?: boolean;
  /** Self-pick-up: compact map thumb instead of navigate glyph. */
  showViewMapBox?: boolean;
  mapLat?: number | null;
  mapLng?: number | null;
  /** Full-width green strip under the card (self-pick-up CTA). */
  footerBannerText?: string | null;
  /** Always-visible OTP line inside the card (self-pick-up). */
  otp?: string | null;
  otpLabel?: string;
};

function SolidDivider() {
  return <View style={styles.solidDivider} />;
}

function ViewMapThumb({
  lat,
  lng,
  onPress,
}: {
  lat?: number | null;
  lng?: number | null;
  onPress?: () => void;
}) {
  const staticUri = useMemo(() => {
    const token =
      getConfig().mapboxAccessToken?.trim() ||
      process.env.EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN?.trim() ||
      null;
    if (!token || lat == null || lng == null || !Number.isFinite(lat) || !Number.isFinite(lng)) {
      return null;
    }
    const lon = lng.toFixed(5);
    const la = lat.toFixed(5);
    return `https://api.mapbox.com/styles/v1/mapbox/streets-v12/static/pin-s+059669(${lon},${la})/${lon},${la},14,0/120x90@2x?access_token=${encodeURIComponent(token)}`;
  }, [lat, lng]);

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.85}
      hitSlop={6}
      accessibilityRole="button"
      accessibilityLabel="View map"
      style={styles.viewMapBox}
    >
      <View style={styles.viewMapPreview}>
        {staticUri ? (
          <Image source={{ uri: staticUri }} style={styles.viewMapImage} resizeMode="cover" />
        ) : (
          <View style={styles.viewMapFallback}>
            <View style={styles.viewMapRoadH} />
            <View style={styles.viewMapRoadV} />
            <View style={styles.viewMapRoadDiag} />
          </View>
        )}
        <View style={styles.viewMapPinOverlay} pointerEvents="none">
          <Ionicons name="location" size={18} color={VIEW_MAP_LABEL} />
        </View>
      </View>
      <View style={styles.viewMapLabelBar}>
        <CheckoutText style={styles.viewMapLabel}>View Map</CheckoutText>
      </View>
    </TouchableOpacity>
  );
}

function OtpDetailRow({ label, otp }: { label: string; otp: string }) {
  return (
    <View style={styles.otpRow} accessibilityRole="text" accessibilityLabel={`${label} ${otp}`}>
      <View style={[styles.iconCircle, styles.otpIconCircle]}>
        <Ionicons name="shield-checkmark" size={16} color={OTP_MINT} />
      </View>
      <View style={styles.textWrap}>
        <CheckoutText style={styles.otpRowLabel}>{label}</CheckoutText>
        <CheckoutText style={styles.otpRowHint}>Show this code at the store</CheckoutText>
      </View>
      <CheckoutText style={styles.otpRowValue}>{otp}</CheckoutText>
    </View>
  );
}

function DetailRow({
  icon,
  mciIcon,
  title,
  subtitle,
  subtitleNode,
  editTone = "primary",
  editDisabled = false,
  actionKind = "edit",
  onEdit,
  mapLat,
  mapLng,
}: {
  icon?: keyof typeof Ionicons.glyphMap;
  mciIcon?: keyof typeof MaterialCommunityIcons.glyphMap;
  title: string;
  subtitle?: string | null;
  subtitleNode?: React.ReactNode;
  editTone?: "primary" | "muted";
  editDisabled?: boolean;
  actionKind?: "edit" | "directions" | "view_map";
  onEdit?: () => void;
  mapLat?: number | null;
  mapLng?: number | null;
}) {
  const showAction = actionKind === "view_map" || !!onEdit;

  return (
    <View style={styles.row}>
      <View style={styles.iconCircle}>
        {mciIcon ? (
          <MaterialCommunityIcons name={mciIcon} size={16} color={MUTED} />
        ) : icon ? (
          <Ionicons name={icon} size={16} color={MUTED} />
        ) : null}
      </View>
      <View style={styles.textWrap}>
        <CheckoutText style={styles.rowTitle}>{title}</CheckoutText>
        {subtitleNode ??
          (subtitle ? (
            <CheckoutText style={styles.rowSub} numberOfLines={3}>
              {subtitle}
            </CheckoutText>
          ) : null)}
      </View>
      {showAction ? (
        actionKind === "view_map" ? (
          <ViewMapThumb lat={mapLat} lng={mapLng} onPress={onEdit} />
        ) : onEdit ? (
          <TouchableOpacity
            onPress={onEdit}
            hitSlop={8}
            activeOpacity={0.75}
            disabled={editDisabled}
            accessibilityLabel={actionKind === "directions" ? "Get directions" : "Edit"}
          >
            {actionKind === "directions" ? (
              <Ionicons
                name="navigate-outline"
                size={18}
                color={editDisabled ? "#D1D5DB" : ACCENT}
              />
            ) : (
              <BiPencilSquareIcon
                size={16}
                color={editDisabled ? "#D1D5DB" : editTone === "muted" ? MUTED : EDIT_RED}
              />
            )}
          </TouchableOpacity>
        ) : null
      ) : null}
    </View>
  );
}

export function OrderDeliveryDetailsCard({
  contactTitle,
  contactSubtitle,
  addressTitle,
  addressLine,
  instructionItems,
  bannerText,
  addressIcon,
  addressAction,
  onEditContact,
  onEditAddress,
  onEditInstructions,
  onGetDirections,
  editDisabled,
  showPeachBanner = true,
  showViewMapBox = false,
  mapLat = null,
  mapLng = null,
  footerBannerText = null,
  otp = null,
  otpLabel = "Self-Pick-Up OTP",
}: Props) {
  const hasContact = !!contactTitle;
  const hasAddress = !!addressTitle || !!addressLine;
  const hasOtp = otp != null && String(otp).length > 0;
  const hasInstructions = instructionItems.length > 0;
  const showInstructions = hasInstructions || !!onEditInstructions;
  const peachBanner = bannerText ?? "All your delivery details in one place 👇";
  const addressOnPress =
    addressAction === "directions" ? onGetDirections : onEditAddress;
  const addressActionKind: "edit" | "directions" | "view_map" =
    addressAction === "directions"
      ? showViewMapBox
        ? "view_map"
        : "directions"
      : "edit";

  if (!hasContact && !hasAddress && !showInstructions && !hasOtp) return null;

  return (
    <View style={styles.cardWrap}>
      <View style={[styles.card, footerBannerText ? styles.cardWithFooter : null]}>
        {showPeachBanner ? (
          <View style={styles.peachBanner}>
            <CheckoutText style={styles.banner}>{peachBanner}</CheckoutText>
          </View>
        ) : null}

        <View style={[styles.body, !showPeachBanner && styles.bodyNoBanner]}>
          {hasOtp ? (
            <>
              <OtpDetailRow label={otpLabel} otp={String(otp)} />
              {hasContact || hasAddress || showInstructions ? <SolidDivider /> : null}
            </>
          ) : null}

          {hasContact ? (
            <DetailRow
              icon="call-outline"
              title={contactTitle!}
              subtitle={contactSubtitle}
              onEdit={onEditContact}
              editTone="primary"
              editDisabled={editDisabled?.contact}
            />
          ) : null}

          {hasContact && (hasAddress || showInstructions) ? <SolidDivider /> : null}

          {hasAddress ? (
            <DetailRow
              icon={addressIcon === "store" ? undefined : "location-outline"}
              mciIcon={addressIcon === "store" ? "storefront-outline" : undefined}
              title={addressTitle ?? "Delivery address"}
              subtitle={addressLine}
              onEdit={addressOnPress}
              actionKind={addressActionKind}
              editTone="muted"
              editDisabled={addressAction === "directions" ? false : editDisabled?.address}
              mapLat={mapLat}
              mapLng={mapLng}
            />
          ) : null}

          {hasAddress && showInstructions ? <SolidDivider /> : null}
          {!hasAddress && hasContact && showInstructions ? <SolidDivider /> : null}

          {showInstructions ? (
            <DetailRow
              mciIcon="moped"
              title={hasInstructions ? "Delivery instructions added" : "Delivery instructions"}
              subtitleNode={
                hasInstructions ? (
                  <View style={styles.instructionListInline}>
                    {instructionItems.map((item, index) => (
                      <View key={item} style={styles.instructionInlineItem}>
                        {index > 0 ? <CheckoutText style={styles.instructionSep}>•</CheckoutText> : null}
                        <Ionicons name="checkmark-circle" size={14} color={ACCENT} />
                        <CheckoutText style={styles.instructionChipText} numberOfLines={1}>
                          {item}
                        </CheckoutText>
                      </View>
                    ))}
                  </View>
                ) : (
                  <CheckoutText style={styles.instructionPlaceholder}>Tap Edit to add instructions</CheckoutText>
                )
              }
              onEdit={onEditInstructions}
              editTone="primary"
              editDisabled={editDisabled?.instructions}
            />
          ) : null}
        </View>
      </View>

      {footerBannerText ? (
        <View style={styles.footerBanner} accessibilityRole="text">
          <CheckoutText style={styles.footerBannerText}>{footerBannerText}</CheckoutText>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  cardWrap: {
    marginTop: 14,
  },
  card: {
    backgroundColor: CARD,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: BORDER,
    overflow: "hidden",
  },
  cardWithFooter: {
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    borderBottomWidth: 0,
  },
  peachBanner: {
    backgroundColor: PEACH_BANNER,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  banner: {
    fontSize: 12,
    fontWeight: "700",
    color: BANNER_TEXT,
    textAlign: "center",
  },
  body: {
    padding: 14,
  },
  bodyNoBanner: {
    paddingTop: 14,
  },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  otpRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  iconCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: ICON_CIRCLE,
    alignItems: "center",
    justifyContent: "center",
  },
  otpIconCircle: {
    backgroundColor: "#ECFDF5",
  },
  textWrap: {
    flex: 1,
    minWidth: 0,
    paddingTop: 2,
  },
  rowTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: TEXT,
    lineHeight: 19,
  },
  rowSub: {
    fontSize: 12,
    color: MUTED,
    marginTop: 4,
    lineHeight: 17,
    fontWeight: "500",
  },
  otpRowLabel: {
    fontSize: 14,
    fontWeight: "700",
    color: TEXT,
    lineHeight: 19,
  },
  otpRowHint: {
    fontSize: 12,
    color: MUTED,
    marginTop: 2,
    fontWeight: "500",
  },
  otpRowValue: {
    fontSize: 22,
    fontWeight: "900",
    color: OTP_MINT,
    letterSpacing: 2,
    flexShrink: 0,
    paddingTop: 2,
  },
  viewMapBox: {
    width: 68,
    height: 78,
    borderRadius: 10,
    overflow: "hidden",
    borderWidth: 1.5,
    borderColor: VIEW_MAP_BORDER,
    backgroundColor: "#ECFDF5",
  },
  viewMapPreview: {
    width: "100%",
    height: 52,
    backgroundColor: "#D1FAE5",
    overflow: "hidden",
  },
  viewMapImage: {
    ...StyleSheet.absoluteFillObject,
    width: "100%",
    height: "100%",
  },
  viewMapFallback: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#D1FAE5",
  },
  viewMapRoadH: {
    position: "absolute",
    left: -4,
    right: -4,
    top: 24,
    height: 4,
    backgroundColor: "#A7F3D0",
    transform: [{ rotate: "-8deg" }],
  },
  viewMapRoadV: {
    position: "absolute",
    top: -4,
    bottom: -4,
    left: 30,
    width: 4,
    backgroundColor: "#6EE7B7",
    transform: [{ rotate: "12deg" }],
  },
  viewMapRoadDiag: {
    position: "absolute",
    top: 8,
    left: 8,
    width: 40,
    height: 3,
    backgroundColor: "#A7F3D0",
    transform: [{ rotate: "35deg" }],
  },
  viewMapPinOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },
  viewMapLabelBar: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FAFAFA",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: VIEW_MAP_BORDER,
  },
  viewMapLabel: {
    fontSize: 9,
    fontWeight: "700",
    color: VIEW_MAP_LABEL,
    letterSpacing: 0.2,
  },
  footerBanner: {
    backgroundColor: FOOTER_GREEN,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderBottomLeftRadius: 16,
    borderBottomRightRadius: 16,
  },
  footerBannerText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#FFFFFF",
    textAlign: "left",
  },
  solidDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: "#ECECEC",
    marginVertical: 12,
  },
  instructionListInline: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 6,
    flexWrap: "nowrap",
  },
  instructionInlineItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    flexShrink: 1,
    maxWidth: "100%",
  },
  instructionSep: {
    fontSize: 12,
    color: MUTED,
    marginHorizontal: 6,
  },
  instructionChipText: {
    fontSize: 12,
    fontWeight: "600",
    color: TEXT,
    flexShrink: 1,
  },
  instructionPlaceholder: {
    fontSize: 12,
    color: MUTED,
    marginTop: 4,
    fontWeight: "500",
  },
});
