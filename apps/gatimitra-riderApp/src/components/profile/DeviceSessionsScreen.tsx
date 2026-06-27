// @ts-nocheck
import React, { useCallback, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { router } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";
import { riderApi, type RiderDeviceSession } from "@/src/services/api/riderApi";
import { colors } from "@/src/theme";

function geoLines(session: RiderDeviceSession): string[] {
  const lines: string[] = [];
  if (session.loginVillage) lines.push(`Village: ${session.loginVillage}`);
  if (session.loginTown) lines.push(`Town: ${session.loginTown}`);
  if (session.loginDistrict) lines.push(`District: ${session.loginDistrict}`);
  if (session.loginState) lines.push(`State: ${session.loginState}`);
  if (lines.length === 0 && session.location) lines.push(session.location);
  return lines;
}
function formatWhen(iso: string): string {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return iso;
  return new Date(t).toLocaleString();
}

function deviceTitle(session: RiderDeviceSession): string {
  const model = session.deviceModel?.trim();
  const os = [session.os, session.osVersion].filter(Boolean).join(" ");
  if (model && os) return `${model} (${os})`;
  return model || os || session.deviceName || "Device";
}

export function DeviceSessionsScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);
  const [sessions, setSessions] = useState<RiderDeviceSession[]>([]);
  const [activeCount, setActiveCount] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await riderApi.getDeviceSessions();
      setSessions(data.sessions);
      setActiveCount(data.activeCount);
    } catch (err) {
      Alert.alert(
        t("profile.deviceSessions.loadFailed", "Could not load devices"),
        err instanceof Error ? err.message : t("common.tryAgain", "Try again"),
      );
    } finally {
      setLoading(false);
    }
  }, [t]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const logoutOthers = () => {
    Alert.alert(
      t("profile.deviceSessions.logoutOthersTitle", "Log out other devices?"),
      t(
        "profile.deviceSessions.logoutOthersMessage",
        "All other phones will be signed out. This device stays logged in.",
      ),
      [
        { text: t("common.cancel", "Cancel"), style: "cancel" },
        {
          text: t("profile.deviceSessions.logoutOthersConfirm", "Log out others"),
          style: "destructive",
          onPress: async () => {
            setActing(true);
            try {
              const res = await riderApi.logoutAllOtherDeviceSessions();
              Alert.alert(
                t("profile.deviceSessions.done", "Done"),
                t("profile.deviceSessions.revokedCount", "{{count}} device(s) logged out", {
                  count: res.revokedCount,
                }),
              );
              await load();
            } catch (err) {
              Alert.alert(
                t("common.error", "Error"),
                err instanceof Error ? err.message : t("common.tryAgain", "Try again"),
              );
            } finally {
              setActing(false);
            }
          },
        },
      ],
    );
  };

  const logoutOne = (session: RiderDeviceSession) => {
    if (session.isCurrentDevice) return;
    Alert.alert(
      t("profile.deviceSessions.logoutOneTitle", "Log out this device?"),
      deviceTitle(session),
      [
        { text: t("common.cancel", "Cancel"), style: "cancel" },
        {
          text: t("profile.logout", "Log out"),
          style: "destructive",
          onPress: async () => {
            setActing(true);
            try {
              await riderApi.logoutDeviceSessions([session.id]);
              await load();
            } catch (err) {
              Alert.alert(
                t("common.error", "Error"),
                err instanceof Error ? err.message : t("common.tryAgain", "Try again"),
              );
            } finally {
              setActing(false);
            }
          },
        },
      ],
    );
  };

  const otherCount = sessions.filter((s) => !s.isCurrentDevice).length;

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn} hitSlop={12}>
          <Ionicons name="arrow-back" size={22} color={colors.text.primary.light} />
        </Pressable>
        <View style={styles.headerCopy}>
          <Text style={styles.title}>
            {t("profile.deviceSessions.title", "Logged-in devices")}
          </Text>
          <Text style={styles.subtitle}>
            {t("profile.deviceSessions.subtitle", "{{count}} active session(s)", {
              count: activeCount,
            })}
          </Text>
        </View>
      </View>

      {otherCount > 0 ? (
        <Pressable
          style={[styles.logoutAllBtn, acting && styles.disabled]}
          disabled={acting}
          onPress={logoutOthers}
        >
          <Ionicons name="log-out-outline" size={18} color="#B91C1C" />
          <Text style={styles.logoutAllText}>
            {t("profile.deviceSessions.logoutAllOthers", "Log out all other devices")}
          </Text>
        </Pressable>
      ) : null}

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary[500]} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
          {sessions.length === 0 ? (
            <Text style={styles.empty}>
              {t("profile.deviceSessions.empty", "No other active sessions.")}
            </Text>
          ) : (
            sessions.map((session) => (
              <View key={session.id} style={styles.card}>
                <View style={styles.cardTop}>
                  <View style={styles.iconWrap}>
                    <Ionicons
                      name={session.os === "ios" ? "phone-portrait-outline" : "tablet-portrait-outline"}
                      size={20}
                      color="#4F46E5"
                    />
                  </View>
                  <View style={styles.cardCopy}>
                    <Text style={styles.cardTitle}>{deviceTitle(session)}</Text>
                    {session.isCurrentDevice ? (
                      <Text style={styles.currentBadge}>
                        {t("profile.deviceSessions.thisDevice", "This device")}
                      </Text>
                    ) : null}
                    {session.appVersion ? (
                      <Text style={styles.meta}>
                        {t("profile.deviceSessions.appVersion", "App")} v{session.appVersion}
                      </Text>
                    ) : null}
                    {session.ipAddress ? (
                      <Text style={styles.meta}>IP {session.ipAddress}</Text>
                    ) : null}
                    {geoLines(session).map((line) => (
                      <Text key={line} style={styles.meta}>
                        {line}
                      </Text>
                    ))}
                    <Text style={styles.time}>
                      {t("profile.deviceSessions.lastActive", "Last active")}:{" "}
                      {formatWhen(session.lastActive)}
                    </Text>
                  </View>
                </View>
                {!session.isCurrentDevice ? (
                  <Pressable
                    style={[styles.logoutOneBtn, acting && styles.disabled]}
                    disabled={acting}
                    onPress={() => logoutOne(session)}
                  >
                    <Text style={styles.logoutOneText}>{t("profile.logout", "Log out")}</Text>
                  </Pressable>
                ) : null}
              </View>
            ))
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#F4F6F8" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },
  headerCopy: { flex: 1 },
  title: { fontSize: 20, fontWeight: "700", color: colors.text.primary.light },
  subtitle: { fontSize: 13, color: colors.text.secondary.light, marginTop: 2 },
  logoutAllBtn: {
    marginHorizontal: 16,
    marginBottom: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#FEF2F2",
    borderRadius: 12,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: "#FECACA",
  },
  logoutAllText: { color: "#B91C1C", fontWeight: "700", fontSize: 14 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  list: { paddingHorizontal: 16, paddingBottom: 24, gap: 12 },
  empty: { textAlign: "center", color: colors.text.secondary.light, marginTop: 40 },
  card: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  cardTop: { flexDirection: "row", gap: 12 },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "#EEF2FF",
    alignItems: "center",
    justifyContent: "center",
  },
  cardCopy: { flex: 1 },
  cardTitle: { fontSize: 15, fontWeight: "700", color: colors.text.primary.light },
  currentBadge: {
    marginTop: 4,
    alignSelf: "flex-start",
    backgroundColor: "#DCFCE7",
    color: "#166534",
    fontSize: 11,
    fontWeight: "700",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    overflow: "hidden",
  },
  meta: { fontSize: 12, color: colors.text.secondary.light, marginTop: 4 },
  time: { fontSize: 11, color: "#9CA3AF", marginTop: 6 },
  logoutOneBtn: {
    marginTop: 12,
    alignSelf: "flex-end",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#FECACA",
    backgroundColor: "#FFF",
  },
  logoutOneText: { color: "#B91C1C", fontWeight: "700", fontSize: 13 },
  disabled: { opacity: 0.6 },
});
