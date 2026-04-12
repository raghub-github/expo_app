/**
 * Full-screen confirmation overlay — same visual language as the Flow/Home dock switch modal
 * (soft glow, sparkles, centered icon + typography, primary CTA).
 * Lists active account sessions and supports “all devices” vs “this device only” sign-out.
 */

import { useCallback, useEffect, useState } from "react";
import { Modal, View, Text, Pressable, StyleSheet, Platform, ScrollView, ActivityIndicator, Alert } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { GatiMitraMerchant, CARD_RADIUS } from "@/constants/theme";
import {
  getUserSessions,
  logoutAllUserSessions,
  logoutUserSessions,
  type UserDeviceSession,
} from "@/services/userSessionsApi";
import { getOrCreateMerchantDeviceId } from "@/lib/merchantDeviceId";

const TAB_ACTIVE_FG = "#FFFFFF";

type Props = {
  visible: boolean;
  token: string | null;
  onStay: () => void;
  /** After server-side revoke succeeds — clear local session and navigate. */
  onCompleteSignOut: () => void | Promise<void>;
};

function parsePgTimestamp(iso: string): Date | null {
  if (!iso) return null;
  const raw = String(iso).trim();
  let d = new Date(raw);
  if (!Number.isNaN(d.getTime())) return d;
  const m =
    /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?(?:([+-]\d{2})(?::?(\d{2}))?)?$/.exec(
      raw
    );
  if (!m) return null;
  const [, y, mo, da, h, mi, s, frac, offH, offM] = m;
  const year = Number(y);
  const month = Number(mo) - 1;
  const day = Number(da);
  const hour = Number(h);
  const minute = Number(mi);
  const sec = Number(s);
  const ms = frac ? Number(frac.slice(0, 3).padEnd(3, "0")) : 0;
  let utcMs = Date.UTC(year, month, day, hour, minute, sec, ms);
  if (offH) {
    const sign = offH.startsWith("-") ? -1 : 1;
    const absH = Math.abs(Number(offH));
    const absM = offM ? Number(offM) : 0;
    const offsetMinutes = sign * (absH * 60 + absM);
    utcMs -= offsetMinutes * 60 * 1000;
  }
  return new Date(utcMs);
}

function formatDateTimeShort(iso: string): string {
  const d = parsePgTimestamp(iso);
  if (!d) return iso;
  return d.toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function formatRelative(iso: string): string {
  const d = parsePgTimestamp(iso);
  if (!d) return "";
  const diffMs = Date.now() - d.getTime();
  const mins = Math.round(diffMs / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} hr${hours > 1 ? "s" : ""} ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days > 1 ? "s" : ""} ago`;
}

function friendlyDeviceLabel(sess: UserDeviceSession): string {
  const isWeb = sess.device_type === "web";
  const isAndroid = (sess.os || "").toLowerCase().includes("android");
  const isIos = (sess.os || "").toLowerCase().includes("ios");
  if (sess.device_name && !sess.device_name.startsWith("merchant_")) {
    return sess.device_name;
  }
  if (isWeb) return "Web browser";
  if (isAndroid) return "Android device";
  if (isIos) return "iOS device";
  return "Mobile device";
}

export function LogoutConfirmModal({ visible, token, onStay, onCompleteSignOut }: Props) {
  const insets = useSafeAreaInsets();
  const [sessions, setSessions] = useState<UserDeviceSession[]>([]);
  const [currentDeviceId, setCurrentDeviceId] = useState<string | null>(null);
  const [loadingSessions, setLoadingSessions] = useState(false);
  const [sessionsError, setSessionsError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"all" | "this" | null>(null);

  const loadSessions = useCallback(async () => {
    if (!token) {
      setSessions([]);
      setSessionsError(null);
      return;
    }
    setLoadingSessions(true);
    setSessionsError(null);
    try {
      const [list, deviceId] = await Promise.all([getUserSessions(token), getOrCreateMerchantDeviceId()]);
      setSessions(list);
      setCurrentDeviceId(deviceId);
    } catch {
      setSessionsError("Could not load devices");
      setSessions([]);
    } finally {
      setLoadingSessions(false);
    }
  }, [token]);

  useEffect(() => {
    if (!visible) {
      setBusy(null);
      return;
    }
    void loadSessions();
  }, [visible, loadSessions]);

  const currentSession = sessions.find(
    (s) => s.device_id && currentDeviceId && String(s.device_id) === String(currentDeviceId)
  );

  const runLogoutAll = async () => {
    if (!token || busy) return;
    setBusy("all");
    try {
      await logoutAllUserSessions(token, true);
      await onCompleteSignOut();
    } catch (e) {
      Alert.alert("Sign out failed", e instanceof Error ? e.message : "Could not sign out all devices.");
    } finally {
      setBusy(null);
    }
  };

  const runLogoutThisDevice = async () => {
    if (busy) return;
    setBusy("this");
    try {
      if (token && currentSession) {
        await logoutUserSessions(token, [currentSession.id]);
      }
      await onCompleteSignOut();
    } catch (e) {
      Alert.alert("Sign out failed", e instanceof Error ? e.message : "Could not sign out this device.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onStay}
      {...Platform.select({
        ios: { presentationStyle: "fullScreen" as const },
        default: {},
      })}
    >
      <View
        style={[
          styles.switchFullPage,
          { paddingTop: insets.top, paddingBottom: Math.max(insets.bottom, 16) },
        ]}
      >
        <View style={styles.switchGlowLayer} pointerEvents="none">
          <LinearGradient
            colors={["rgba(186, 230, 253, 0.55)", "rgba(204, 251, 241, 0.4)", "rgba(255, 255, 255, 0)"]}
            locations={[0, 0.35, 1]}
            start={{ x: 0.5, y: 0 }}
            end={{ x: 0.5, y: 1 }}
            style={styles.switchGlowGradient}
          />
          <View style={[styles.switchSparkle, styles.switchSparkle1]} />
          <View style={[styles.switchSparkle, styles.switchSparkle2]} />
          <View style={[styles.switchSparkle, styles.switchSparkle3]} />
        </View>

        <ScrollView
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
        >
          <View style={styles.switchCenterColumn}>
            <LinearGradient
              colors={[GatiMitraMerchant.primaryLight, GatiMitraMerchant.primary, GatiMitraMerchant.primaryDark]}
              locations={[0, 0.45, 1]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.switchIconGradient}
            >
              <Ionicons name="log-out-outline" size={38} color={TAB_ACTIVE_FG} />
            </LinearGradient>

            <View style={styles.switchTextBlock}>
              <Text style={styles.switchFullTitle}>Log out?</Text>
              <Text style={styles.switchFullLine}>
                These devices are signed in to your partner account. You can sign out everywhere in one step, or only
                on this phone.
              </Text>
            </View>

            <View style={styles.deviceListSection}>
              <Text style={styles.deviceListHeading}>Signed-in devices</Text>
              {loadingSessions ? (
                <View style={styles.deviceListLoading}>
                  <ActivityIndicator color={GatiMitraMerchant.primary} />
                  <Text style={styles.deviceListHint}>Loading…</Text>
                </View>
              ) : sessionsError ? (
                <Text style={styles.deviceListError}>{sessionsError}</Text>
              ) : sessions.length === 0 ? (
                <Text style={styles.deviceListHint}>No active sessions listed. You can still sign out.</Text>
              ) : (
                <View style={styles.deviceListCard}>
                  {sessions.map((sess, index) => {
                    const isThis =
                      !!sess.device_id &&
                      !!currentDeviceId &&
                      String(sess.device_id) === String(currentDeviceId);
                    return (
                      <View
                        key={sess.id}
                        style={[styles.deviceRow, index === sessions.length - 1 && styles.deviceRowLast]}
                      >
                        <View style={styles.deviceRowIcon}>
                          <Ionicons
                            name={sess.device_type === "web" ? "laptop-outline" : "phone-portrait-outline"}
                            size={18}
                            color={GatiMitraMerchant.primary}
                          />
                        </View>
                        <View style={styles.deviceRowText}>
                          <View style={styles.deviceRowTitleLine}>
                            <Text style={styles.deviceRowTitle} numberOfLines={1}>
                              {friendlyDeviceLabel(sess)}
                            </Text>
                            {isThis && (
                              <View style={styles.thisDevicePill}>
                                <Text style={styles.thisDevicePillText}>This device</Text>
                              </View>
                            )}
                          </View>
                          <Text style={styles.deviceRowMeta} numberOfLines={2}>
                            Last active {formatRelative(sess.last_active)} · {formatDateTimeShort(sess.login_time)}
                          </Text>
                        </View>
                      </View>
                    );
                  })}
                </View>
              )}
            </View>

            <Pressable
              onPress={onStay}
              disabled={busy != null}
              style={({ pressed }) => [styles.stayBtn, (pressed || busy != null) && styles.pressed]}
            >
              <LinearGradient
                colors={GatiMitraMerchant.primaryGradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={StyleSheet.absoluteFill}
              />
              <Ionicons name="checkmark-circle" size={20} color="#fff" />
              <Text style={styles.stayBtnText}>Stay signed in</Text>
            </Pressable>

            <Pressable
              onPress={() => void runLogoutAll()}
              disabled={busy != null || !token}
              style={({ pressed }) => [
                styles.logoutAllBtn,
                (pressed || busy != null || !token) && styles.pressed,
              ]}
              hitSlop={8}
            >
              {busy === "all" ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Ionicons name="shield-outline" size={18} color="#fff" />
              )}
              <Text style={styles.logoutAllBtnText}>Log out from all devices</Text>
            </Pressable>

            <Pressable
              onPress={() => void runLogoutThisDevice()}
              disabled={busy != null}
              style={({ pressed }) => [styles.logoutTextBtn, (pressed || busy != null) && styles.pressed]}
              hitSlop={12}
            >
              {busy === "this" ? (
                <ActivityIndicator color={GatiMitraMerchant.error} size="small" />
              ) : (
                <Text style={styles.logoutTextBtnLabel}>Log out this device only</Text>
              )}
            </Pressable>
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  switchFullPage: {
    flex: 1,
    width: "100%",
    backgroundColor: GatiMitraMerchant.background,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 28,
    paddingBottom: 24,
  },
  switchGlowLayer: {
    ...StyleSheet.absoluteFillObject,
    overflow: "hidden",
  },
  switchGlowGradient: {
    position: "absolute",
    left: "-15%",
    right: "-15%",
    top: "18%",
    height: 360,
    borderRadius: 200,
    opacity: 0.95,
  },
  switchSparkle: {
    position: "absolute",
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: "rgba(255, 255, 255, 0.85)",
  },
  switchSparkle1: { top: "24%", left: "18%" },
  switchSparkle2: { top: "32%", right: "22%" },
  switchSparkle3: { top: "28%", left: "72%" },
  switchCenterColumn: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingTop: 12,
  },
  switchIconGradient: {
    width: 104,
    height: 104,
    borderRadius: 52,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 20,
    ...Platform.select({
      ios: {
        shadowColor: "#0F172A",
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.14,
        shadowRadius: 20,
      },
      android: { elevation: 8 },
      default: {},
    }),
  },
  switchTextBlock: {
    maxWidth: 340,
    width: "100%",
    alignItems: "center",
    marginBottom: 16,
  },
  switchFullTitle: {
    fontSize: 30,
    fontWeight: "800",
    color: GatiMitraMerchant.navy,
    marginBottom: 12,
    letterSpacing: -0.4,
    textAlign: "center",
  },
  switchFullLine: {
    fontSize: 15,
    fontWeight: "500",
    color: GatiMitraMerchant.textSecondary,
    lineHeight: 22,
    textAlign: "center",
  },
  deviceListSection: {
    width: "100%",
    maxWidth: 340,
    marginBottom: 20,
  },
  deviceListHeading: {
    fontSize: 12,
    fontWeight: "700",
    color: GatiMitraMerchant.textTertiary,
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginBottom: 8,
    alignSelf: "flex-start",
  },
  deviceListCard: {
    width: "100%",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: GatiMitraMerchant.border,
    backgroundColor: GatiMitraMerchant.surfaceWarm,
    overflow: "hidden",
  },
  deviceListLoading: {
    paddingVertical: 20,
    alignItems: "center",
    gap: 8,
  },
  deviceListHint: {
    fontSize: 13,
    color: GatiMitraMerchant.textSecondary,
    textAlign: "center",
    paddingVertical: 12,
  },
  deviceListError: {
    fontSize: 13,
    color: GatiMitraMerchant.error,
    textAlign: "center",
    paddingVertical: 8,
  },
  deviceRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: GatiMitraMerchant.divider,
  },
  deviceRowLast: {
    borderBottomWidth: 0,
  },
  deviceRowIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: "rgba(94, 217, 168, 0.14)",
    alignItems: "center",
    justifyContent: "center",
  },
  deviceRowText: {
    flex: 1,
    minWidth: 0,
  },
  deviceRowTitleLine: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
  },
  deviceRowTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: GatiMitraMerchant.textPrimary,
    flexShrink: 1,
  },
  thisDevicePill: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
    backgroundColor: "rgba(94, 217, 168, 0.2)",
  },
  thisDevicePillText: {
    fontSize: 10,
    fontWeight: "800",
    color: GatiMitraMerchant.primaryDark,
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  deviceRowMeta: {
    fontSize: 12,
    color: GatiMitraMerchant.textSecondary,
    marginTop: 4,
    lineHeight: 16,
  },
  stayBtn: {
    width: "100%",
    maxWidth: 340,
    height: 52,
    borderRadius: CARD_RADIUS,
    overflow: "hidden",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginBottom: 12,
    ...GatiMitraMerchant.shadowSm,
  },
  stayBtnText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#fff",
  },
  logoutAllBtn: {
    width: "100%",
    maxWidth: 340,
    height: 50,
    borderRadius: CARD_RADIUS,
    backgroundColor: GatiMitraMerchant.error,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginBottom: 12,
  },
  logoutAllBtnText: {
    fontSize: 15,
    fontWeight: "800",
    color: "#fff",
  },
  logoutTextBtn: {
    paddingVertical: 12,
    paddingHorizontal: 20,
    minHeight: 44,
    justifyContent: "center",
    alignItems: "center",
  },
  logoutTextBtnLabel: {
    fontSize: 15,
    fontWeight: "700",
    color: GatiMitraMerchant.error,
  },
  pressed: {
    opacity: 0.88,
    transform: [{ scale: 0.99 }],
  },
});
