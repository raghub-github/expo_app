/**
 * Live tracking — delivery contact, address, and instructions card (Zomato-style).
 */

import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { BiPencilSquareIcon } from "@/components/icons/BiPencilSquareIcon";
import { GatiMitraColors } from "@/constants/gatimitra";
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

type EditDisabledFlags = {
  contact?: boolean;
  address?: boolean;
  instructions?: boolean;
};

type Props = OrderDeliveryDetailsView & {
  onEditContact?: () => void;
  onEditAddress?: () => void;
  onEditInstructions?: () => void;
  editDisabled?: EditDisabledFlags;
  /** Hide peach banner on post-delivery read-only view. */
  showPeachBanner?: boolean;
};

function SolidDivider() {
  return <View style={styles.solidDivider} />;
}

function DetailRow({
  icon,
  mciIcon,
  title,
  subtitle,
  subtitleNode,
  editTone = "primary",
  editDisabled = false,
  onEdit,
}: {
  icon?: keyof typeof Ionicons.glyphMap;
  mciIcon?: keyof typeof MaterialCommunityIcons.glyphMap;
  title: string;
  subtitle?: string | null;
  subtitleNode?: React.ReactNode;
  editTone?: "primary" | "muted";
  editDisabled?: boolean;
  onEdit?: () => void;
}) {
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
        <Text style={styles.rowTitle}>{title}</Text>
        {subtitleNode ??
          (subtitle ? (
            <Text style={styles.rowSub} numberOfLines={3}>
              {subtitle}
            </Text>
          ) : null)}
      </View>
      {onEdit ? (
        <TouchableOpacity
          onPress={onEdit}
          hitSlop={8}
          activeOpacity={0.75}
          disabled={editDisabled}
          accessibilityLabel="Edit"
        >
          <BiPencilSquareIcon
            size={16}
            color={editDisabled ? "#D1D5DB" : editTone === "muted" ? MUTED : EDIT_RED}
          />
        </TouchableOpacity>
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
  onEditContact,
  onEditAddress,
  onEditInstructions,
  editDisabled,
  showPeachBanner = true,
}: Props) {
  const hasContact = !!contactTitle;
  const hasAddress = !!addressTitle || !!addressLine;
  const hasInstructions = instructionItems.length > 0;
  const showInstructions = hasInstructions || !!onEditInstructions;

  if (!hasContact && !hasAddress && !showInstructions) return null;

  return (
    <View style={styles.card}>
      {showPeachBanner ? (
        <View style={styles.peachBanner}>
          <Text style={styles.banner}>All your delivery details in one place 👇</Text>
        </View>
      ) : null}

      <View style={[styles.body, !showPeachBanner && styles.bodyNoBanner]}>
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
            icon="location-outline"
            title={addressTitle ?? "Delivery address"}
            subtitle={addressLine}
            onEdit={onEditAddress}
            editTone="muted"
            editDisabled={editDisabled?.address}
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
                      {index > 0 ? <Text style={styles.instructionSep}>•</Text> : null}
                      <Ionicons name="checkmark-circle" size={14} color={ACCENT} />
                      <Text style={styles.instructionChipText} numberOfLines={1}>
                        {item}
                      </Text>
                    </View>
                  ))}
                </View>
              ) : (
                <Text style={styles.instructionPlaceholder}>Tap Edit to add instructions</Text>
              )
            }
            onEdit={onEditInstructions}
            editTone="primary"
            editDisabled={editDisabled?.instructions}
          />
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: CARD,
    borderRadius: 16,
    marginTop: 14,
    borderWidth: 1,
    borderColor: BORDER,
    overflow: "hidden",
    ...GatiMitraColors.elevationShadow,
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
  iconCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: ICON_CIRCLE,
    alignItems: "center",
    justifyContent: "center",
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
  editBtn: {
    fontSize: 13,
    fontWeight: "700",
    color: EDIT_RED,
    paddingTop: 4,
  },
  editBtnMuted: {
    color: MUTED,
  },
  editBtnDisabled: {
    opacity: 0.35,
    color: MUTED,
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
