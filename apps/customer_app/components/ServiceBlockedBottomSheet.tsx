/**
 * Advanced bottom sheet when Prevent Services blocks a service on an inner page.
 * Shows reason, zone, schedule, and a live remaining-time countdown.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  TouchableOpacity,
  StyleSheet,
  Modal,
  Pressable,
  useWindowDimensions,
  ScrollView,
} from "react-native";
import { AppText } from "@/components/AppText";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { GatiMitraColors } from "@/constants/gatimitra";

type ServiceBlockedBottomSheetProps = {
  visible: boolean;
  reason?: string | null;
  locationName?: string | null;
  serviceLabel?: string | null;
  startsAt?: string | null;
  endsAt?: string | null;
  onGotIt: () => void;
  /** Fired when live countdown reaches zero so callers can refresh geo. */
  onExpired?: () => void;
};

function formatSchedule(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

function formatDurationMs(ms: number): string {
  if (ms <= 0) return "00h 00m 00s";
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  if (h > 0) return `${pad(h)}h ${pad(m)}m ${pad(s)}s`;
  return `${pad(m)}m ${pad(s)}s`;
}

function formatTotalDuration(startsAt: string | null, endsAt: string | null): string | null {
  if (!startsAt || !endsAt) return null;
  const a = new Date(startsAt).getTime();
  const b = new Date(endsAt).getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a) return null;
  return formatDurationMs(b - a);
}

export function ServiceBlockedBottomSheet({
  visible,
  reason,
  locationName,
  serviceLabel,
  startsAt,
  endsAt,
  onGotIt,
  onExpired,
}: ServiceBlockedBottomSheetProps) {
  const insets = useSafeAreaInsets();
  const { height: windowH } = useWindowDimensions();
  const maxSheetH = Math.round(windowH * 0.78);
  const [nowMs, setNowMs] = useState(() => Date.now());

  const endMs = useMemo(() => {
    if (!endsAt) return null;
    const t = new Date(endsAt).getTime();
    return Number.isFinite(t) ? t : null;
  }, [endsAt]);

  useEffect(() => {
    if (!visible || endMs == null) return;
    setNowMs(Date.now());
    const id = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(id);
  }, [visible, endMs]);

  const remainingMs = endMs != null ? Math.max(0, endMs - nowMs) : null;
  const expired = endMs != null && remainingMs === 0;
  const expiredNotifiedRef = useRef(false);

  useEffect(() => {
    if (!visible) {
      expiredNotifiedRef.current = false;
      return;
    }
    if (!expired || expiredNotifiedRef.current) return;
    expiredNotifiedRef.current = true;
    onExpired?.();
  }, [visible, expired, onExpired]);

  if (!visible) return null;

  const reasonText = reason?.trim() || "Temporary restriction by GatiMitra Admin";
  const placeText = locationName?.trim() || null;
  const serviceText = serviceLabel?.trim() || "This service";
  const effectiveText = formatSchedule(startsAt) ?? "Immediate";
  const availableAgainText = formatSchedule(endsAt);
  const totalDurationText = formatTotalDuration(startsAt ?? null, endsAt ?? null);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onGotIt}
      statusBarTranslucent
      presentationStyle="overFullScreen"
    >
      <View style={styles.root}>
        <Pressable style={styles.backdrop} onPress={onGotIt} accessibilityRole="button" />

        <View
          style={[
            styles.sheet,
            {
              maxHeight: maxSheetH,
              paddingBottom: Math.max(insets.bottom, 20) + 8,
            },
          ]}
        >
          <View style={styles.handle} />

          <ScrollView
            bounces={false}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.scrollContent}
          >
            <View style={styles.iconWrap}>
              <View style={styles.iconRing}>
                <Ionicons name="shield-outline" size={30} color="#DC2626" />
              </View>
            </View>

            <AppText style={styles.eyebrow}>Service restricted</AppText>
            <AppText style={styles.title}>Temporarily unavailable</AppText>
            <AppText style={styles.serviceChip}>{serviceText}</AppText>
            <AppText style={styles.message}>
              Orders are temporarily unavailable for this area. You can still place orders for any
              other eligible delivery location outside the restricted zone.
            </AppText>

            <View style={styles.infoCard}>
              <View style={styles.infoRow}>
                <View style={styles.infoIcon}>
                  <Ionicons name="alert-circle-outline" size={18} color="#B45309" />
                </View>
                <View style={styles.infoTextCol}>
                  <AppText style={styles.infoLabel}>Why unavailable</AppText>
                  <AppText style={styles.infoValue}>{reasonText}</AppText>
                </View>
              </View>

              {placeText ? (
                <>
                  <View style={styles.infoDivider} />
                  <View style={styles.infoRow}>
                    <View style={[styles.infoIcon, styles.infoIconPlace]}>
                      <Ionicons name="location-outline" size={18} color="#0F766E" />
                    </View>
                    <View style={styles.infoTextCol}>
                      <AppText style={styles.infoLabel}>Affected area</AppText>
                      <AppText style={styles.infoValue}>{placeText}</AppText>
                    </View>
                  </View>
                </>
              ) : null}

              <View style={styles.infoDivider} />
              <View style={styles.infoRow}>
                <View style={[styles.infoIcon, styles.infoIconTime]}>
                  <Ionicons name="time-outline" size={18} color="#1D4ED8" />
                </View>
                <View style={styles.infoTextCol}>
                  <AppText style={styles.infoLabel}>Effective</AppText>
                  <AppText style={styles.infoValue}>{effectiveText}</AppText>
                </View>
              </View>

              <View style={styles.infoDivider} />
              <View style={styles.infoRow}>
                <View style={[styles.infoIcon, styles.infoIconAvail]}>
                  <Ionicons name="checkmark-circle-outline" size={18} color="#047857" />
                </View>
                <View style={styles.infoTextCol}>
                  <AppText style={styles.infoLabel}>Available again</AppText>
                  <AppText style={styles.infoValue}>
                    {availableAgainText ?? "Available until further notice."}
                  </AppText>
                </View>
              </View>

              {totalDurationText ? (
                <>
                  <View style={styles.infoDivider} />
                  <View style={styles.infoRow}>
                    <View style={[styles.infoIcon, styles.infoIconDur]}>
                      <Ionicons name="hourglass-outline" size={18} color="#6D28D9" />
                    </View>
                    <View style={styles.infoTextCol}>
                      <AppText style={styles.infoLabel}>Total duration</AppText>
                      <AppText style={styles.infoValue}>{totalDurationText}</AppText>
                    </View>
                  </View>
                </>
              ) : null}
            </View>

            {remainingMs != null && !expired ? (
              <View style={styles.countdownCard}>
                <AppText style={styles.countdownLabel}>Remaining time</AppText>
                <AppText style={styles.countdownValue}>⏳ {formatDurationMs(remainingMs)}</AppText>
              </View>
            ) : endsAt == null ? (
              <View style={styles.countdownCardMuted}>
                <AppText style={styles.countdownMutedText}>Available until further notice.</AppText>
              </View>
            ) : null}
          </ScrollView>

          <TouchableOpacity style={styles.gotItBtn} onPress={onGotIt} activeOpacity={0.9}>
            <AppText style={styles.gotItBtnText}>Got It</AppText>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: "flex-end",
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.55)",
  },
  sheet: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 24,
    paddingTop: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.14,
    shadowRadius: 18,
    elevation: 18,
  },
  scrollContent: {
    paddingBottom: 8,
  },
  handle: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#E5E7EB",
    marginBottom: 14,
  },
  iconWrap: {
    alignItems: "center",
    marginBottom: 12,
  },
  iconRing: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: "#FEE2E2",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#FECACA",
  },
  eyebrow: {
    textAlign: "center",
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.6,
    textTransform: "uppercase",
    color: "#DC2626",
    marginBottom: 6,
  },
  title: {
    textAlign: "center",
    fontSize: 22,
    fontWeight: "800",
    color: "#111827",
    letterSpacing: -0.4,
    marginBottom: 8,
  },
  serviceChip: {
    alignSelf: "center",
    marginBottom: 10,
    overflow: "hidden",
    borderRadius: 999,
    backgroundColor: "#FEF2F2",
    paddingHorizontal: 12,
    paddingVertical: 4,
    fontSize: 12,
    fontWeight: "700",
    color: "#B91C1C",
  },
  message: {
    fontSize: 14,
    fontWeight: "500",
    color: "#4B5563",
    lineHeight: 21,
    textAlign: "center",
    marginBottom: 16,
  },
  infoCard: {
    backgroundColor: "#F8FAFC",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 12,
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  infoIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: "#FEF3C7",
    alignItems: "center",
    justifyContent: "center",
  },
  infoIconPlace: {
    backgroundColor: "#CCFBF1",
  },
  infoIconTime: {
    backgroundColor: "#DBEAFE",
  },
  infoIconAvail: {
    backgroundColor: "#D1FAE5",
  },
  infoIconDur: {
    backgroundColor: "#EDE9FE",
  },
  infoTextCol: {
    flex: 1,
    paddingTop: 2,
  },
  infoLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: "#64748B",
    textTransform: "uppercase",
    letterSpacing: 0.4,
    marginBottom: 2,
  },
  infoValue: {
    fontSize: 15,
    fontWeight: "700",
    color: "#0F172A",
    lineHeight: 20,
  },
  infoDivider: {
    height: 1,
    backgroundColor: "#E2E8F0",
    marginVertical: 10,
  },
  countdownCard: {
    borderRadius: 14,
    backgroundColor: "#FFF7ED",
    borderWidth: 1,
    borderColor: "#FED7AA",
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 8,
    alignItems: "center",
  },
  countdownLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: "#9A3412",
    textTransform: "uppercase",
    letterSpacing: 0.4,
    marginBottom: 4,
  },
  countdownValue: {
    fontSize: 20,
    fontWeight: "800",
    color: "#9A3412",
    letterSpacing: 0.2,
  },
  countdownCardMuted: {
    borderRadius: 14,
    backgroundColor: "#F1F5F9",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 8,
    alignItems: "center",
  },
  countdownMutedText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#64748B",
    textAlign: "center",
  },
  gotItBtn: {
    backgroundColor: GatiMitraColors.primaryMint,
    paddingVertical: 16,
    borderRadius: 28,
    alignItems: "center",
    marginTop: 10,
  },
  gotItBtnText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#111827",
  },
});
