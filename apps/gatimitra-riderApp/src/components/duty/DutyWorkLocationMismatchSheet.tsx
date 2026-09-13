/**
 * Duty ON working-location mismatch sheet.
 * "Update my location" saves CURRENT GPS as working location in-place
 * (does not navigate away; does not change registered address).
 * If hiring is closed at GPS, switches to Service Not Available — no update.
 */
import React, { useState } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useQueryClient } from "@tanstack/react-query";
import { DismissibleBottomSheetShell } from "@/src/components/language/DismissibleBottomSheetShell";
import { RiderFonts } from "@/src/theme/fonts";
import {
  useDutyWorkLocationSheetStore,
  type DutyWorkLocationPlace,
} from "@/src/stores/dutyWorkLocationSheetStore";
import { useSessionStore } from "@/src/stores/sessionStore";
import { resolveOnboardingGeo } from "@/src/services/onboardingGeo.service";
import { riderApi } from "@/src/services/api/riderApi";
import { useDutyToggle } from "@/src/hooks/useDutyToggle";
import { HttpError } from "@/src/services/http";
import { showWorkingLocationSuccess } from "@/src/stores/workingLocationSuccessStore";

const PRIMARY = "#15803D";

function placeLine(p: DutyWorkLocationPlace | null | undefined): string {
  if (!p) return "—";
  const parts = [p.district, p.state].map((x) => String(x || "").trim()).filter(Boolean);
  return parts.length ? parts.join(", ") : "—";
}

export function DutyWorkLocationMismatchSheet() {
  const visible = useDutyWorkLocationSheetStore((s) => s.visible);
  const mode = useDutyWorkLocationSheetStore((s) => s.mode);
  const message = useDutyWorkLocationSheetStore((s) => s.message);
  const working = useDutyWorkLocationSheetStore((s) => s.working ?? s.registered);
  const detected = useDutyWorkLocationSheetStore((s) => s.detected);
  const close = useDutyWorkLocationSheetStore((s) => s.close);
  const setNotHiring = useDutyWorkLocationSheetStore((s) => s.setNotHiring);
  const session = useSessionStore((s) => s.session);
  const { setDuty } = useDutyToggle();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);

  const isNotHiring = mode === "not_hiring";

  const onCancel = () => {
    if (busy) return;
    close();
  };

  const onUpdate = async () => {
    if (busy || isNotHiring) return;
    const token = session?.accessToken;
    if (!token) {
      Alert.alert("Not signed in", "Please sign in again.");
      return;
    }

    const lat = detected?.lat;
    const lon = detected?.lon;
    if (lat == null || lon == null || !Number.isFinite(lat) || !Number.isFinite(lon)) {
      Alert.alert(
        "Location needed",
        "Could not read your current GPS. Turn on location and try going ON-DUTY again.",
      );
      return;
    }

    setBusy(true);
    try {
      // Prefer hierarchy already on the sheet; resolve once if ids are missing.
      let stateName = String(detected?.state || "").trim();
      let districtName = String(detected?.district || "").trim();
      let regionName = String(detected?.region || "").trim();
      let stateId = detected?.stateId ?? null;
      let regionId = detected?.regionId ?? null;
      let districtId = detected?.districtId ?? null;
      let pincode: string | undefined;

      if (!stateId && !stateName) {
        const resolved = await resolveOnboardingGeo(token, { lat, lng: lon });
        const loc = resolved.location;
        stateName = String(loc?.state?.name || "").trim();
        districtName = String(loc?.district?.name || "").trim();
        regionName = String(loc?.region?.name || "").trim();
        stateId = loc?.refs?.stateId ?? null;
        regionId = loc?.refs?.regionId ?? null;
        districtId = loc?.refs?.districtId ?? null;
        pincode = loc?.pincode || undefined;
      }

      if (!stateName && !stateId) {
        Alert.alert(
          "Could not update",
          "We could not match your GPS to a work area. Try again from a clearer location.",
        );
        return;
      }

      const city = String(districtName || regionName || stateName).trim();
      const address =
        [districtName, regionName, stateName].filter(Boolean).join(", ") || stateName;

      // home-location → saveRiderWorkingLocation(seedRegisteredIfEmpty: false)
      // Registered address is never overwritten here.
      await riderApi.updateHomeLocation({
        lat,
        lon,
        city,
        state: stateName,
        district: districtName || null,
        region: regionName || null,
        pincode,
        address,
        stateId,
        regionId,
        districtId,
        locationSource: "duty_update",
      });

      void queryClient.invalidateQueries({ queryKey: ["rider"] });
      close();
      showWorkingLocationSuccess(address);

      const result = await setDuty(true);
      if (!result.ok && result.reason !== "location") {
        // Location already celebrated; soft nudge only if duty failed for non-location reasons.
        Alert.alert(
          "Almost there",
          "Working location saved. Try turning ON-DUTY again.",
        );
      }
    } catch (e) {
      const haystack =
        e instanceof HttpError
          ? `${e.message}\n${e.body ?? ""}`
          : e instanceof Error
            ? e.message
            : "";
      if (/NOT_HIRING|Service not available/i.test(haystack)) {
        // Do not update working location — show clear in-sheet message.
        setNotHiring("Service not available at this location");
        return;
      }
      Alert.alert(
        "Update failed",
        e instanceof Error && e.message.trim()
          ? e.message
          : "Could not update your working location. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <DismissibleBottomSheetShell
      visible={visible}
      onDismiss={onCancel}
      maxHeightRatio={0.7}
      fitContent
      compactBottomInset
      sheetBottomPadding={24}
    >
      <View style={styles.content}>
        <View style={[styles.iconWrap, isNotHiring && styles.iconWrapDanger]}>
          <Ionicons
            name={isNotHiring ? "ban-outline" : "location-outline"}
            size={28}
            color={isNotHiring ? "#B91C1C" : "#B45309"}
          />
        </View>
        <Text style={styles.title}>
          {isNotHiring ? "Service Not Available" : "Update your work location?"}
        </Text>
        <Text style={styles.subtitle}>
          {isNotHiring
            ? message?.trim() || "Service not available at this location"
            : message?.trim() ||
              "Your current location is different from your working location. To go ON-DUTY here, update your working location first, or cancel to stay offline."}
        </Text>

        <View style={styles.compareCard}>
          {!isNotHiring ? (
            <>
              <View style={styles.compareRow}>
                <Text style={styles.compareLabel}>Working location</Text>
                <Text style={styles.compareValue}>{placeLine(working)}</Text>
              </View>
              <View style={styles.divider} />
            </>
          ) : null}
          <View style={styles.compareRow}>
            <Text style={styles.compareLabel}>Current GPS</Text>
            <Text style={styles.compareValue}>{placeLine(detected)}</Text>
          </View>
        </View>

        {isNotHiring ? (
          <Text style={styles.hint}>
            Your working address was not changed. Move to a serviceable area or stay at your
            current working location to go ON-DUTY.
          </Text>
        ) : (
          <Text style={styles.hint}>
            This updates only your working location. Your registered address stays the same.
          </Text>
        )}

        {!isNotHiring ? (
          <Pressable
            onPress={() => void onUpdate()}
            disabled={busy}
            style={[styles.primaryBtn, busy && styles.btnDisabled]}
            accessibilityRole="button"
            accessibilityLabel="Update my location"
          >
            {busy ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <>
                <Ionicons name="navigate-outline" size={18} color="#FFFFFF" />
                <Text style={styles.primaryBtnText}>Update my location</Text>
              </>
            )}
          </Pressable>
        ) : null}

        <Pressable
          onPress={onCancel}
          disabled={busy}
          style={isNotHiring ? styles.primaryBtn : styles.cancelBtn}
          accessibilityRole="button"
          accessibilityLabel={isNotHiring ? "Got it" : "Cancel"}
        >
          <Text style={isNotHiring ? styles.primaryBtnText : styles.cancelBtnText}>
            {isNotHiring ? "Got it" : "Cancel"}
          </Text>
        </Pressable>
      </View>
    </DismissibleBottomSheetShell>
  );
}

export function DutyWorkLocationMismatchSheetHost() {
  return <DutyWorkLocationMismatchSheet />;
}

const styles = StyleSheet.create({
  content: {
    width: "100%",
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 4,
  },
  iconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "#FEF3C7",
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "center",
    marginBottom: 12,
  },
  iconWrapDanger: {
    backgroundColor: "#FEE2E2",
  },
  title: {
    fontFamily: RiderFonts.poppinsExtraBold,
    fontSize: 22,
    lineHeight: 28,
    color: "#0F172A",
    textAlign: "center",
    marginBottom: 8,
  },
  subtitle: {
    fontFamily: RiderFonts.poppinsSemiBold,
    fontSize: 14,
    lineHeight: 20,
    color: "#64748B",
    textAlign: "center",
    marginBottom: 16,
  },
  compareCard: {
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 14,
    backgroundColor: "#F8FAFC",
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 10,
    gap: 10,
  },
  compareRow: {
    gap: 2,
  },
  compareLabel: {
    fontFamily: RiderFonts.poppinsBold,
    fontSize: 11,
    color: "#94A3B8",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  compareValue: {
    fontFamily: RiderFonts.poppinsSemiBold,
    fontSize: 15,
    color: "#0F172A",
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: "#CBD5E1",
  },
  hint: {
    fontFamily: RiderFonts.poppinsSemiBold,
    fontSize: 12,
    lineHeight: 16,
    color: "#64748B",
    textAlign: "center",
    marginBottom: 12,
  },
  primaryBtn: {
    minHeight: 52,
    borderRadius: 14,
    backgroundColor: PRIMARY,
    borderWidth: 1.5,
    borderColor: "#14532D",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
    marginBottom: 10,
  },
  primaryBtnText: {
    fontFamily: RiderFonts.poppinsBold,
    fontSize: 15,
    color: "#FFFFFF",
  },
  cancelBtn: {
    minHeight: 48,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: "#111111",
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  cancelBtnText: {
    fontFamily: RiderFonts.poppinsBold,
    fontSize: 15,
    color: "#111827",
  },
  btnDisabled: {
    opacity: 0.7,
  },
});
