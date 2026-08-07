/**
 * Saved address card — shared between Select Location and Saved Addresses screens.
 */

import { View, TouchableOpacity, StyleSheet, ActivityIndicator } from "react-native";
import { AppText } from "@/components/AppText";
import { Ionicons } from "@expo/vector-icons";
import type { Address } from "@/services/address.service";
import {
  CURRENT_LOCATION_BADGE_RADIUS_M,
  distanceMeters,
  formatDistanceMeters,
  formatPhoneLine,
} from "@/lib/addressGeo";

const BRAND = "#14B8A6";
const TITLE_DARK = "#111827";
const TEXT_GRAY = "#6B7280";
const CARD_BG = "#FFFFFF";
const BORDER = "#EEEEEE";
const BORDER_SUBTLE = "rgba(0, 0, 0, 0.08)";

function savedAddressIcon(saved: Address): { name: keyof typeof Ionicons.glyphMap; color: string } {
  const label = (saved.label ?? "").trim().toLowerCase();
  if (label === "current location") {
    return { name: "locate", color: BRAND };
  }
  if (label === "home") {
    return { name: "home-outline", color: "#374151" };
  }
  if (label === "work" || label === "office") {
    return { name: "briefcase-outline", color: "#374151" };
  }
  return { name: "location-outline", color: "#374151" };
}

export type SavedAddressLocationCardProps = {
  address: Address;
  /** Distance from reference point (search anchor / map pin). */
  distanceM?: number | null;
  /** Live GPS coords — drives "Current Location" badge when near this address. */
  liveCoords?: { latitude: number; longitude: number } | null;
  isSelected?: boolean;
  selectedPillLabel?: string;
  loading?: boolean;
  disabled?: boolean;
  onPress?: () => void;
  onOptions?: () => void;
  onShare?: () => void;
  onCamera?: () => void;
  /** Hide action row (e.g. checkout-only tap-to-select). */
  hideActions?: boolean;
};

export function SavedAddressLocationCard({
  address,
  distanceM = null,
  liveCoords = null,
  isSelected = false,
  selectedPillLabel = "SELECTED",
  loading = false,
  disabled = false,
  onPress,
  onOptions,
  onShare,
  onCamera,
  hideActions = false,
}: SavedAddressLocationCardProps) {
  const phoneLine = formatPhoneLine(address.contactMobile);
  const icon = savedAddressIcon(address);

  const liveDistM =
    liveCoords?.latitude != null &&
    liveCoords?.longitude != null &&
    Number.isFinite(address.latitude) &&
    Number.isFinite(address.longitude)
      ? distanceMeters(
          liveCoords.latitude,
          liveCoords.longitude,
          address.latitude,
          address.longitude
        )
      : null;
  const isAtCurrentLocation =
    liveDistM != null && liveDistM <= CURRENT_LOCATION_BADGE_RADIUS_M;

  const body = (
    <>
      <View style={styles.addressLabelRow}>
        <AppText style={styles.savedAddressTitle}>{address.label ?? "Address"}</AppText>
        {isSelected ? (
          <View style={styles.selectedPillRight}>
            <AppText style={styles.selectedPillRightText}>{selectedPillLabel}</AppText>
          </View>
        ) : (
          <View style={styles.unselectedRadio} />
        )}
      </View>
      <View style={isAtCurrentLocation ? styles.badgeCurrent : styles.badgeSaved}>
        <AppText style={isAtCurrentLocation ? styles.badgeCurrentText : styles.badgeSavedText}>
          {isAtCurrentLocation ? "● Current Location" : "📍 Saved Location"}
        </AppText>
      </View>
      <AppText style={styles.savedAddressLine} numberOfLines={3}>
        {address.fullAddress}
      </AppText>
      {phoneLine ? (
        <AppText style={styles.savedPhoneLine} numberOfLines={1}>
          {phoneLine}
        </AppText>
      ) : null}
    </>
  );

  return (
    <View style={styles.savedCard}>
      <View style={styles.savedCardTop}>
        <View style={styles.savedCardLeftCol}>
          <Ionicons name={icon.name} size={24} color={icon.color} />
          {distanceM != null ? (
            <AppText style={styles.savedDistance}>{formatDistanceMeters(distanceM)}</AppText>
          ) : null}
        </View>
        <View style={styles.savedCardBody}>
          {onPress ? (
            <TouchableOpacity onPress={onPress} disabled={disabled || loading} activeOpacity={0.85}>
              {body}
            </TouchableOpacity>
          ) : (
            body
          )}
          {!hideActions ? (
            <View style={styles.savedActionsRow}>
              {loading ? (
                <ActivityIndicator size="small" color={BRAND} style={{ marginRight: 4 }} />
              ) : null}
              {onOptions ? (
                <TouchableOpacity
                  style={styles.savedActionBtn}
                  onPress={onOptions}
                  hitSlop={8}
                  activeOpacity={0.85}
                >
                  <Ionicons name="ellipsis-horizontal" size={13} color={BRAND} />
                </TouchableOpacity>
              ) : null}
              {onShare ? (
                <TouchableOpacity
                  style={styles.savedActionBtn}
                  onPress={onShare}
                  hitSlop={8}
                  activeOpacity={0.85}
                >
                  <Ionicons name="arrow-redo-outline" size={13} color={BRAND} />
                </TouchableOpacity>
              ) : null}
              {onCamera ? (
                <TouchableOpacity
                  style={styles.savedActionBtn}
                  onPress={onCamera}
                  hitSlop={8}
                  activeOpacity={0.85}
                >
                  <Ionicons name="camera-outline" size={13} color={BRAND} />
                </TouchableOpacity>
              ) : null}
            </View>
          ) : null}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  savedCard: {
    backgroundColor: CARD_BG,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: BORDER,
  },
  savedCardTop: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  savedCardLeftCol: {
    width: 44,
    alignItems: "center",
    marginRight: 12,
    paddingTop: 2,
  },
  savedDistance: {
    fontSize: 10,
    fontWeight: "600",
    color: TEXT_GRAY,
    marginTop: 6,
    textAlign: "center",
    lineHeight: 13,
  },
  savedCardBody: {
    flex: 1,
    minWidth: 0,
  },
  savedAddressTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: TITLE_DARK,
    flex: 1,
    lineHeight: 20,
  },
  badgeCurrent: {
    alignSelf: "flex-start",
    backgroundColor: "#DCFCE7",
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginTop: 5,
  },
  badgeCurrentText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#15803D",
  },
  badgeSaved: {
    alignSelf: "flex-start",
    backgroundColor: "#F1F5F9",
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginTop: 5,
  },
  badgeSavedText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#64748B",
  },
  savedAddressLine: {
    fontSize: 13,
    color: TEXT_GRAY,
    marginTop: 4,
    lineHeight: 18,
  },
  savedPhoneLine: {
    fontSize: 12,
    color: TEXT_GRAY,
    marginTop: 8,
    lineHeight: 16,
  },
  savedActionsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-start",
    gap: 8,
    marginTop: 12,
  },
  savedActionBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: BORDER_SUBTLE,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: CARD_BG,
  },
  unselectedRadio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: "#D1D5DB",
    backgroundColor: CARD_BG,
  },
  addressLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  selectedPillRight: {
    backgroundColor: BRAND,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  selectedPillRightText: {
    color: "#FFFFFF",
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
});
