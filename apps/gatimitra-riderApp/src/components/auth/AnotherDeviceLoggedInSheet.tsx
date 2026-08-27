import { View, Text, Pressable, StyleSheet, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { DismissibleBottomSheetShell } from "@/src/components/language/DismissibleBottomSheetShell";
import type { RiderConflictExistingSession } from "@/src/services/auth/auth.service";

/** Coarse, human-friendly "last active" — safe, already-available context only (§6). */
function relativeTime(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  const diffSec = Math.max(0, Math.round((Date.now() - t) / 1000));
  if (diffSec < 60) return "just now";
  const min = Math.round(diffSec / 60);
  if (min < 60) return `${min} min ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr} hr ago`;
  const d = Math.round(hr / 24);
  return `${d} day${d > 1 ? "s" : ""} ago`;
}

function cap(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

type Props = {
  visible: boolean;
  existingSession: RiderConflictExistingSession | null;
  /** True while the takeover request is in flight — disables buttons (§35). */
  busy: boolean;
  onMarkLogout: () => void;
  onCancel: () => void;
};

/**
 * "Another Device Is Logged In" conflict sheet (§6, §34). Bottom sheet, not a full-screen
 * error. Primary CTA "Mark Logout" (confirmed takeover), secondary "Cancel" (abort — no
 * session created, old device untouched). While busy it shows "Logging out other device…"
 * and blocks a second tap / backdrop dismiss (§35, §20).
 */
export function AnotherDeviceLoggedInSheet({
  visible,
  existingSession,
  busy,
  onMarkLogout,
  onCancel,
}: Props) {
  const lastActive = relativeTime(existingSession?.lastActiveAt);
  const hasInfo =
    !!existingSession?.deviceLabel || !!existingSession?.platform || !!lastActive;

  return (
    <DismissibleBottomSheetShell
      visible={visible}
      onDismiss={busy ? () => {} : onCancel}
      fitContent
      showOuterHandle
    >
      <View style={styles.body}>
        <View style={styles.iconWrap}>
          <Ionicons name="lock-closed" size={26} color="#0F766E" />
        </View>

        <Text style={styles.title}>Another Device Is Logged In</Text>
        <Text style={styles.message}>
          This rider account is currently active on another device. To continue on this
          device, log out the existing device first.
        </Text>

        {hasInfo ? (
          <View style={styles.infoCard}>
            {existingSession?.deviceLabel ? (
              <Text style={styles.infoLine}>Device: {existingSession.deviceLabel}</Text>
            ) : null}
            {existingSession?.platform ? (
              <Text style={styles.infoLine}>Platform: {cap(existingSession.platform)}</Text>
            ) : null}
            {lastActive ? <Text style={styles.infoLine}>Last active: {lastActive}</Text> : null}
          </View>
        ) : null}

        <Pressable
          style={[styles.primaryBtn, busy && styles.btnDisabled]}
          onPress={onMarkLogout}
          disabled={busy}
          accessibilityRole="button"
          accessibilityLabel="Mark logout on the other device and continue"
        >
          {busy ? (
            <View style={styles.busyRow}>
              <ActivityIndicator color="#ffffff" />
              <Text style={styles.primaryText}>Logging out other device…</Text>
            </View>
          ) : (
            <Text style={styles.primaryText}>Mark Logout</Text>
          )}
        </Pressable>

        <Pressable
          style={[styles.secondaryBtn, busy && styles.btnDisabled]}
          onPress={onCancel}
          disabled={busy}
          accessibilityRole="button"
          accessibilityLabel="Cancel and stay logged out on this device"
        >
          <Text style={styles.secondaryText}>Cancel</Text>
        </Pressable>
      </View>
    </DismissibleBottomSheetShell>
  );
}

const styles = StyleSheet.create({
  body: {
    paddingHorizontal: 22,
    paddingTop: 6,
    paddingBottom: 8,
    alignItems: "stretch",
  },
  iconWrap: {
    alignSelf: "center",
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "#C4E8D1",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 14,
  },
  title: {
    fontSize: 20,
    fontWeight: "700",
    color: "#0F172A",
    textAlign: "center",
    marginBottom: 8,
  },
  message: {
    fontSize: 14.5,
    lineHeight: 21,
    color: "#475569",
    textAlign: "center",
    marginBottom: 16,
  },
  infoCard: {
    backgroundColor: "#F1F5F9",
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 18,
    gap: 4,
  },
  infoLine: {
    fontSize: 13,
    color: "#334155",
  },
  primaryBtn: {
    backgroundColor: "#0F766E",
    borderRadius: 14,
    height: 52,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
  },
  primaryText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "700",
  },
  busyRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  secondaryBtn: {
    borderRadius: 14,
    height: 50,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#CBD5E1",
    backgroundColor: "#ffffff",
  },
  secondaryText: {
    color: "#334155",
    fontSize: 15.5,
    fontWeight: "600",
  },
  btnDisabled: {
    opacity: 0.6,
  },
});
